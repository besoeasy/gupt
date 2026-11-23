<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { RouterLink, useRouter } from "vue-router";
import {
  FileText,
  Trash2,
  RefreshCw,
  Search,
  Plus,
  X,
  Pencil,
  Copy,
  Check,
  Calendar,
} from "@/icons";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import PageHeader from "@/components/PageHeader.vue";
import { useIdentityStore } from "@/stores/identity";
import { copyToClipboard } from "@/lib/clipboard";
import { getNotesCached, fetchNotes, deleteNote, notePreview } from "@/lib/notes";

const router = useRouter();
const identity = useIdentityStore();

const isLoading = ref(true);
const isRefreshing = ref(false);
const items = ref([]);
const searchQuery = ref("");
const activeTag = ref("all");
const error = ref("");
const pendingDelete = ref(null);

const copiedId = ref(null);
let copyTimer = null;

const allTags = computed(() => {
  const counts = {};
  for (const item of items.value) {
    for (const tag of item.tags || []) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
});

const filteredItems = computed(() => {
  let result = items.value;
  if (activeTag.value !== "all") {
    result = result.filter((item) => (item.tags || []).includes(activeTag.value));
  }
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return result;
  return result.filter((item) => {
    return (
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.body && item.body.toLowerCase().includes(q)) ||
      (item.tags || []).some((t) => t.includes(q))
    );
  });
});

onMounted(async () => {
  await loadItems();
});

onUnmounted(() => {
  if (copyTimer) clearTimeout(copyTimer);
});

async function loadItems() {
  const cached = await getNotesCached(identity.privkeyHex, identity.pubkeyHex);
  if (cached) {
    items.value = cached.items;
    isLoading.value = false;
    if (!cached.fresh) refreshFromRelay();
    return;
  }
  isLoading.value = true;
  await refreshFromRelay();
}

async function refreshFromRelay() {
  isRefreshing.value = true;
  try {
    const next = await fetchNotes(identity.privkeyHex, identity.pubkeyHex);
    items.value = next;
  } catch (err) {
    console.error("Failed to load notes:", err);
    error.value = err?.message || "Failed to load notes.";
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
}

function navigateToDetail(item) {
  router.push(`/notes/${item.id}`);
}

async function copyContent(text, id, event) {
  if (event) event.stopPropagation();
  if (!text) return;
  await copyToClipboard(text);
  copiedId.value = id;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copiedId.value = null;
  }, 1800);
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function handleDelete(item, event) {
  if (event) event.stopPropagation();
  pendingDelete.value = item;
}

async function confirmDelete() {
  const item = pendingDelete.value;
  if (!item) return;
  pendingDelete.value = null;
  try {
    error.value = "";
    await deleteNote(identity.privkeyHex, identity.pubkeyHex, item);
    items.value = items.value.filter((n) => n.id !== item.id);
  } catch (err) {
    error.value = err?.message || "Failed to delete note.";
  }
}
</script>

<template>
  <div class="notes-view__block">
    <main class="notes-view__main">
      <!-- Header Section -->
      <PageHeader eyebrow="Private vault" title="Notes" :count="items.length">
        <p class="notes-view__lede">
          End-to-end encrypted notes stored privately on your relays.
        </p>
        <template #actions>
          <button
            type="button"
            :disabled="isRefreshing"
            class="notes-action"
            title="Sync from relays"
            @click="refreshFromRelay"
          >
            <RefreshCw class="notes-action__icon" :class="{ 'notes-action__icon--spin': isRefreshing }" />
            <span>Sync</span>
          </button>
          <RouterLink to="/notes/new" class="notes-action notes-action--ink">
            <Plus class="notes-action__icon" :stroke-width="2.2" />
            <span>New note</span>
          </RouterLink>
        </template>
      </PageHeader>

      <AppAlertBanner v-if="error" :message="error" />

      <!-- Search and Tag Filter Bar -->
      <div class="notes-filters">
        <div class="notes-search">
          <Search class="notes-search__icon" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search all notes by title, body, or tags…"
            class="notes-search__field"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="notes-search__clear"
            aria-label="Clear search"
            @click="searchQuery = ''"
          >
            <X class="notes-search__clear-icon" />
          </button>
        </div>

        <!-- All items scope indicator -->
        <p v-if="searchQuery" class="notes-filters__scope">
          Searching all {{ items.length }} vault notes ({{ filteredItems.length }} matched)
        </p>

        <!-- Tag Filter Chips -->
        <div v-if="allTags.length" class="notes-filters__tags">
          <button
            type="button"
            class="notes-chip"
            :class="{ 'is-active': activeTag === 'all' }"
            @click="activeTag = 'all'"
          >
            All
            <span class="notes-chip__count">{{ items.length }}</span>
          </button>
          <button
            v-for="tagInfo in allTags"
            :key="tagInfo.tag"
            type="button"
            class="notes-chip"
            :class="{ 'is-active': activeTag === tagInfo.tag }"
            @click="activeTag = tagInfo.tag"
          >
            #{{ tagInfo.tag }}
            <span class="notes-chip__count">{{ tagInfo.count }}</span>
          </button>
        </div>
      </div>

      <!-- Shimmer Skeleton Loading State -->
      <div v-if="isLoading" class="notes-view__status" role="status">
        <span class="notes-loading__label">Loading notes…</span>
        <div
          v-for="n in 4"
          :key="n"
          class="notes-view__block-8"
          aria-hidden="true"
        >
          <div class="skeleton-shimmer notes-view__block-9" />
          <div class="notes-view__block-10">
            <div class="skeleton-shimmer notes-view__block-11" />
            <div class="skeleton-shimmer notes-view__block-12" />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="items.length === 0"
        class="notes-empty"
      >
        <p class="notes-empty__eyebrow">Empty vault</p>
        <h2 class="notes-empty__title">No notes yet</h2>
        <p class="notes-empty__lede">
          Your private note stream is empty. Create your first encrypted note to keep ideas,
          snippets, and drafts safe.
        </p>
        <RouterLink to="/notes/new" class="notes-action notes-action--ink notes-empty__action">
          <Plus class="notes-action__icon" :stroke-width="2.2" />
          <span>Create first note</span>
        </RouterLink>
      </div>

      <!-- Search No Results -->
      <div
        v-else-if="filteredItems.length === 0"
        class="notes-empty notes-empty--quiet"
      >
        <Search class="notes-empty__mark" aria-hidden="true" />
        <h2 class="notes-empty__title">No matching notes</h2>
        <p class="notes-empty__lede">
          No notes match your search query "{{ searchQuery }}".
        </p>
        <button
          type="button"
          class="notes-action"
          @click="
            searchQuery = '';
            activeTag = 'all';
          "
        >
          Clear filters
        </button>
      </div>

      <!-- Notes List -->
      <div v-else class="notes-list">
        <article
          v-for="item in filteredItems"
          :key="item.id"
          class="notes-row"
          @click="navigateToDetail(item)"
        >
          <!-- Note Icon -->
          <span class="notes-row__mark" aria-hidden="true">
            <FileText class="notes-row__mark-icon" :stroke-width="1.8" />
          </span>

          <!-- Content -->
          <div class="notes-row__body">
            <h2 class="notes-row__title">
              {{ item.title || "Untitled Note" }}
            </h2>

            <p class="notes-row__preview">
              {{ notePreview(item.body, 160) || "Empty note body." }}
            </p>

            <!-- Tags & Meta row -->
            <div class="notes-row__meta">
              <span class="notes-row__date">
                <Calendar class="notes-row__meta-icon" aria-hidden="true" />
                {{ formatDate(item.updatedAt || item.createdAt) }}
              </span>

              <div
                v-if="item.tags && item.tags.length"
                class="notes-row__tags"
              >
                <button
                  v-for="tag in item.tags"
                  :key="tag"
                  type="button"
                  class="notes-row__tag"
                  @click.stop="activeTag = tag"
                >
                  #{{ tag }}
                </button>
              </div>
            </div>
          </div>

          <!-- Quick Action Buttons -->
          <div class="notes-row__actions" @click.stop>
            <button
              type="button"
              class="notes-row__action"
              :title="copiedId === item.id ? 'Copied text!' : 'Copy note text'"
              :aria-label="copiedId === item.id ? 'Copied text' : 'Copy note text'"
              @click="copyContent(item.body, item.id, $event)"
            >
              <Check v-if="copiedId === item.id" class="notes-row__action-icon" />
              <Copy v-else class="notes-row__action-icon" />
            </button>

            <button
              type="button"
              class="notes-row__action"
              title="View & Edit note"
              aria-label="View and edit note"
              @click="navigateToDetail(item)"
            >
              <Pencil class="notes-row__action-icon" />
            </button>

            <button
              type="button"
              class="notes-row__action notes-row__action--danger"
              title="Delete note"
              aria-label="Delete note"
              @click="handleDelete(item, $event)"
            >
              <Trash2 class="notes-row__action-icon" />
            </button>
          </div>
        </article>
      </div>
    </main>

    <!-- Delete Confirmation Modal -->
    <AppConfirmDialog
      :open="Boolean(pendingDelete)"
      title="Delete Note?"
      :message="`Delete note '${pendingDelete?.title || 'Untitled'}'? An encrypted tombstone will be published to your relays.`"
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.notes-view__subtitle:is(:where(.notes-view__article):hover *) {
  color: var(--color-white);
}
}

@media (hover:hover) {
.notes-view__button-delete-note:hover {
  border-color: #fb2c364d;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.notes-view__button-delete-note:hover {
  border-color: color-mix(in oklab,var(--color-red-500) 30%,transparent);
}
}
}

@media (hover:hover) {
.notes-view__button-sync-from:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.notes-view__article:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.notes-view__text-12:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.notes-view__button-3:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.notes-view__button-view-edit:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.notes-view__button-delete-note:hover {
  background-color: var(--app-danger-soft);
}
}

@media (hover:hover) {
.notes-view__router-link:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.notes-view__router-link-2:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.notes-view__button-sync-from:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.notes-view__button-all--muted:hover {
  background-color: var(--app-surface-tint-soft);
}
}

@media (hover:hover) {
.notes-view__button--muted:hover {
  background-color: var(--app-surface-tint-soft);
}
}

@media (hover:hover) {
.notes-view__article:hover {
  background-color: var(--app-surface-tint-soft);
}
}

@media (hover:hover) {
.notes-view__button-sync-from:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.notes-view__button-clear-filters:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.notes-view__button:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.notes-view__button-all--muted:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.notes-view__button--muted:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.notes-view__text-12:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.notes-view__button-3:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.notes-view__button-view-edit:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.notes-view__button-clear-filters:hover {
  text-decoration-line: underline;
}
}

@media (min-width:40rem) {
.notes-view__block-22 {
  width: auto;
}
}

@media (min-width:40rem) {
.notes-view__block-2 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.notes-view__article {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.notes-view__block-2 {
  align-items: center;
}
}

@media (min-width:40rem) {
.notes-view__article {
  align-items: center;
}
}

@media (min-width:40rem) {
.notes-view__block-17 {
  align-items: center;
}
}

@media (min-width:40rem) {
.notes-view__block-2 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.notes-view__block-22 {
  align-self: center;
}
}

@media (min-width:40rem) {
.notes-view__block-22 {
  border-top-style: var(--border-style,solid);
  border-top-width: 0;
}
}

@media (min-width:40rem) {
.notes-view__article {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.notes-view__main {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.notes-view__block-22 {
  padding-top: 0;
}
}

@media (min-width:40rem) {
.notes-view__subtitle {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
}

@media (min-width:64rem) {
.notes-view__main {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.notes-view__search {
  pointer-events: none;
}
.notes-view__text-6 {
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  position: absolute;
  overflow: hidden;
}
.notes-view__search {
  position: absolute;
}
.notes-view__button {
  position: absolute;
}
.notes-view__block-5 {
  position: relative;
}
.notes-view__article {
  position: relative;
}
.notes-view__search {
  top: 50%;
}
.notes-view__button {
  top: 50%;
}
.notes-view__button {
  right: calc(var(--spacing) * 3);
}
.notes-view__search {
  left: calc(var(--spacing) * 3);
}
.notes-view__main {
  margin-inline: auto;
}
.notes-view__text-2 {
  margin-top: var(--spacing);
}
.notes-view__text-7 {
  margin-top: var(--spacing);
}
.notes-view__text-8 {
  margin-top: var(--spacing);
}
.notes-view__button-clear-filters {
  margin-top: calc(var(--spacing) * 4);
}
.notes-view__router-link-2 {
  margin-top: calc(var(--spacing) * 6);
}
.notes-view__search-2 {
  margin-bottom: calc(var(--spacing) * 3);
}
.notes-view__block-14 {
  margin-bottom: calc(var(--spacing) * 4);
}
.notes-view__text {
  margin-left: var(--spacing);
}
.notes-view__text-4 {
  margin-left: var(--spacing);
}
.notes-view__text-5 {
  margin-left: var(--spacing);
}
.notes-view__text-9 {
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  display: -webkit-box;
  overflow: hidden;
}
.notes-view__block-2 {
  display: flex;
}
.notes-view__block-3 {
  display: flex;
}
.notes-view__button {
  display: flex;
}
.notes-view__block-6 {
  display: flex;
}
.notes-view__block-7 {
  display: flex;
}
.notes-view__block-8 {
  display: flex;
}
.notes-view__block-13 {
  display: flex;
}
.notes-view__block-14 {
  display: flex;
}
.notes-view__block-15 {
  display: flex;
}
.notes-view__article {
  display: flex;
}
.notes-view__block-17 {
  display: flex;
}
.notes-view__block-18 {
  display: flex;
}
.notes-view__block-20 {
  display: flex;
}
.notes-view__block-21 {
  display: flex;
}
.notes-view__block-22 {
  display: flex;
}
.notes-view__button-sync-from {
  display: inline-flex;
}
.notes-view__router-link {
  display: inline-flex;
}
.notes-view__router-link-2 {
  display: inline-flex;
}
.notes-view__text-10 {
  display: inline-flex;
}
.notes-view__button-3 {
  display: inline-flex;
}
.notes-view__button-view-edit {
  display: inline-flex;
}
.notes-view__button-delete-note {
  display: inline-flex;
}
.notes-view__text-3 {
  height: calc(var(--spacing) * 1.5);
}
.notes-view__block-12 {
  height: calc(var(--spacing) * 3);
}
.notes-view__calendar {
  height: calc(var(--spacing) * 3);
}
.notes-view__refresh-cw {
  height: calc(var(--spacing) * 3.5);
}
.notes-view__plus {
  height: calc(var(--spacing) * 3.5);
}
.notes-view__plus-2 {
  height: calc(var(--spacing) * 3.5);
}
.notes-view__pencil {
  height: calc(var(--spacing) * 3.5);
}
.notes-view__trash2 {
  height: calc(var(--spacing) * 3.5);
}
.notes-view__search {
  height: calc(var(--spacing) * 4);
}
.notes-view__x {
  height: calc(var(--spacing) * 4);
}
.notes-view__block-11 {
  height: calc(var(--spacing) * 4);
}
.notes-view__check {
  height: calc(var(--spacing) * 4);
}
.notes-view__copy {
  height: calc(var(--spacing) * 4);
}
.notes-view__file-text {
  height: calc(var(--spacing) * 5);
}
.notes-view__layers {
  height: calc(var(--spacing) * 6);
}
.notes-view__search-2 {
  height: calc(var(--spacing) * 7);
}
.notes-view__button-sync-from {
  height: calc(var(--spacing) * 8);
}
.notes-view__router-link {
  height: calc(var(--spacing) * 8);
}
.notes-view__button-3 {
  height: calc(var(--spacing) * 8);
}
.notes-view__button-view-edit {
  height: calc(var(--spacing) * 8);
}
.notes-view__button-delete-note {
  height: calc(var(--spacing) * 8);
}
.notes-view__router-link-2 {
  height: calc(var(--spacing) * 9);
}
.notes-view__field-text {
  height: calc(var(--spacing) * 10);
}
.notes-view__block-9 {
  height: calc(var(--spacing) * 10);
}
.notes-view__block-18 {
  height: calc(var(--spacing) * 10);
}
.notes-view__block-14 {
  height: calc(var(--spacing) * 12);
}
.notes-view__button {
  min-height: 32px;
}
.notes-view__block {
  min-height: 100vh;
}
.notes-view__text-3 {
  width: calc(var(--spacing) * 1.5);
}
.notes-view__calendar {
  width: calc(var(--spacing) * 3);
}
.notes-view__refresh-cw {
  width: calc(var(--spacing) * 3.5);
}
.notes-view__plus {
  width: calc(var(--spacing) * 3.5);
}
.notes-view__plus-2 {
  width: calc(var(--spacing) * 3.5);
}
.notes-view__pencil {
  width: calc(var(--spacing) * 3.5);
}
.notes-view__trash2 {
  width: calc(var(--spacing) * 3.5);
}
.notes-view__search {
  width: calc(var(--spacing) * 4);
}
.notes-view__x {
  width: calc(var(--spacing) * 4);
}
.notes-view__check {
  width: calc(var(--spacing) * 4);
}
.notes-view__copy {
  width: calc(var(--spacing) * 4);
}
.notes-view__file-text {
  width: calc(var(--spacing) * 5);
}
.notes-view__layers {
  width: calc(var(--spacing) * 6);
}
.notes-view__search-2 {
  width: calc(var(--spacing) * 7);
}
.notes-view__button-3 {
  width: calc(var(--spacing) * 8);
}
.notes-view__button-view-edit {
  width: calc(var(--spacing) * 8);
}
.notes-view__button-delete-note {
  width: calc(var(--spacing) * 8);
}
.notes-view__block-9 {
  width: calc(var(--spacing) * 10);
}
.notes-view__block-18 {
  width: calc(var(--spacing) * 10);
}
.notes-view__block-14 {
  width: calc(var(--spacing) * 12);
}
.notes-view__block-11 {
  width: calc(var(--spacing) * 48);
}
.notes-view__block-12 {
  width: calc(var(--spacing) * 72);
}
.notes-view__main {
  width: 100%;
}
.notes-view__field-text {
  width: 100%;
}
.notes-view__block-22 {
  width: 100%;
}
.notes-view__main {
  max-width: var(--container-6xl);
}
.notes-view__block-12 {
  max-width: 100%;
}
.notes-view__text-7 {
  max-width: var(--container-sm);
}
.notes-view__block-10 {
  min-width: 0;
}
.notes-view__block-17 {
  min-width: 0;
}
.notes-view__block-19 {
  min-width: 0;
}
.notes-view__button {
  min-width: 32px;
}
.notes-view__block-10 {
  flex: 1;
}
.notes-view__block-17 {
  flex: 1;
}
.notes-view__block-19 {
  flex: 1;
}
.notes-view__block-9 {
  flex-shrink: 0;
}
.notes-view__block-18 {
  flex-shrink: 0;
}
.notes-view__block-22 {
  flex-shrink: 0;
}
.notes-view__search {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.notes-view__button {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.notes-view__refresh-cw--spin {
  animation: var(--animate-spin);
}
.notes-view__button-sync-from {
  cursor: pointer;
}
.notes-view__router-link {
  cursor: pointer;
}
.notes-view__button {
  cursor: pointer;
}
.notes-view__button-all {
  cursor: pointer;
}
.notes-view__button-2 {
  cursor: pointer;
}
.notes-view__button-clear-filters {
  cursor: pointer;
}
.notes-view__article {
  cursor: pointer;
}
.notes-view__button-3 {
  cursor: pointer;
}
.notes-view__button-view-edit {
  cursor: pointer;
}
.notes-view__button-delete-note {
  cursor: pointer;
}
.notes-view__block-7 {
  scrollbar-width: none;
}
.notes-view__block-2 {
  flex-direction: column;
}
.notes-view__block-13 {
  flex-direction: column;
}
.notes-view__block-15 {
  flex-direction: column;
}
.notes-view__article {
  flex-direction: column;
}
.notes-view__block-3 {
  flex-wrap: wrap;
}
.notes-view__block-20 {
  flex-wrap: wrap;
}
.notes-view__block-21 {
  flex-wrap: wrap;
}
.notes-view__block-3 {
  align-items: center;
}
.notes-view__button-sync-from {
  align-items: center;
}
.notes-view__router-link {
  align-items: center;
}
.notes-view__button {
  align-items: center;
}
.notes-view__block-6 {
  align-items: center;
}
.notes-view__block-8 {
  align-items: center;
}
.notes-view__block-13 {
  align-items: center;
}
.notes-view__block-14 {
  align-items: center;
}
.notes-view__router-link-2 {
  align-items: center;
}
.notes-view__block-15 {
  align-items: center;
}
.notes-view__block-18 {
  align-items: center;
}
.notes-view__block-20 {
  align-items: center;
}
.notes-view__text-10 {
  align-items: center;
}
.notes-view__block-21 {
  align-items: center;
}
.notes-view__block-22 {
  align-items: center;
}
.notes-view__button-3 {
  align-items: center;
}
.notes-view__button-view-edit {
  align-items: center;
}
.notes-view__button-delete-note {
  align-items: center;
}
.notes-view__block-17 {
  align-items: flex-start;
}
.notes-view__article {
  justify-content: space-between;
}
.notes-view__button {
  justify-content: center;
}
.notes-view__block-13 {
  justify-content: center;
}
.notes-view__block-14 {
  justify-content: center;
}
.notes-view__block-15 {
  justify-content: center;
}
.notes-view__block-18 {
  justify-content: center;
}
.notes-view__button-3 {
  justify-content: center;
}
.notes-view__button-view-edit {
  justify-content: center;
}
.notes-view__button-delete-note {
  justify-content: center;
}
.notes-view__block-22 {
  justify-content: flex-end;
}
.notes-view__text-10 {
  gap: var(--spacing);
}
.notes-view__button-sync-from {
  gap: calc(var(--spacing) * 1.5);
}
.notes-view__router-link {
  gap: calc(var(--spacing) * 1.5);
}
.notes-view__block-6 {
  gap: calc(var(--spacing) * 1.5);
}
.notes-view__block-7 {
  gap: calc(var(--spacing) * 1.5);
}
.notes-view__router-link-2 {
  gap: calc(var(--spacing) * 1.5);
}
.notes-view__block-21 {
  gap: calc(var(--spacing) * 1.5);
}
.notes-view__block-22 {
  gap: calc(var(--spacing) * 1.5);
}
.notes-view__block-3 {
  gap: calc(var(--spacing) * 2);
}
.notes-view__block-20 {
  gap: calc(var(--spacing) * 2);
}
.notes-view__block-17 {
  gap: calc(var(--spacing) * 3.5);
}
.notes-view__block-2 {
  gap: calc(var(--spacing) * 4);
}
.notes-view__block-8 {
  gap: calc(var(--spacing) * 4);
}
.notes-view__article {
  gap: calc(var(--spacing) * 4);
}
:where(.notes-view__block-19>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.notes-view__block-10>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.notes-view__block-4>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.notes-view__status>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.notes-view__block-16>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.notes-view__main>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
.notes-view__block-22 {
  align-self: flex-end;
}
.notes-view__subtitle {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.notes-view__block-7 {
  overflow-x: auto;
}
.notes-view__text-3 {
  border-radius: 3.40282e38px;
}
.notes-view__button-sync-from {
  border-radius: var(--radius-lg);
}
.notes-view__router-link {
  border-radius: var(--radius-lg);
}
.notes-view__router-link-2 {
  border-radius: var(--radius-lg);
}
.notes-view__button-3 {
  border-radius: var(--radius-lg);
}
.notes-view__button-view-edit {
  border-radius: var(--radius-lg);
}
.notes-view__button-delete-note {
  border-radius: var(--radius-lg);
}
.notes-view__button-all {
  border-radius: var(--radius-md);
}
.notes-view__button-2 {
  border-radius: var(--radius-md);
}
.notes-view__text-12 {
  border-radius: var(--radius-md);
}
.notes-view__field-text {
  border-radius: var(--radius-xl);
}
.notes-view__block-8 {
  border-radius: var(--radius-xl);
}
.notes-view__block-9 {
  border-radius: var(--radius-xl);
}
.notes-view__block-13 {
  border-radius: var(--radius-xl);
}
.notes-view__block-14 {
  border-radius: var(--radius-xl);
}
.notes-view__block-15 {
  border-radius: var(--radius-xl);
}
.notes-view__article {
  border-radius: var(--radius-xl);
}
.notes-view__block-18 {
  border-radius: var(--radius-xl);
}
.notes-view__button-sync-from {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notes-view__field-text {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notes-view__button-all {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notes-view__button-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notes-view__block-8 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notes-view__block-13 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notes-view__block-14 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notes-view__block-15 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notes-view__article {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notes-view__block-18 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notes-view__text-12 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notes-view__button-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notes-view__button-view-edit {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notes-view__button-delete-note {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notes-view__block-22 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.notes-view__block-2 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.notes-view__button-sync-from {
  border-color: var(--ui-zinc-800);
}
.notes-view__field-text {
  border-color: var(--ui-zinc-800);
}
.notes-view__button-all--selected {
  border-color: var(--ui-zinc-800);
}
.notes-view__button--selected {
  border-color: var(--ui-zinc-800);
}
.notes-view__block-14 {
  border-color: var(--ui-zinc-800);
}
.notes-view__block-18 {
  border-color: var(--ui-zinc-800);
}
.notes-view__text-12 {
  border-color: var(--ui-zinc-800);
}
.notes-view__button-3 {
  border-color: var(--ui-zinc-800);
}
.notes-view__button-view-edit {
  border-color: var(--ui-zinc-800);
}
.notes-view__button-delete-note {
  border-color: var(--ui-zinc-800);
}
.notes-view__block-2 {
  border-color: var(--app-border-quiet);
}
.notes-view__button-all--muted {
  border-color: var(--app-border-quiet);
}
.notes-view__button--muted {
  border-color: var(--app-border-quiet);
}
.notes-view__block-8 {
  border-color: var(--app-border-quiet);
}
.notes-view__block-13 {
  border-color: var(--app-border-quiet);
}
.notes-view__block-15 {
  border-color: var(--app-border-quiet);
}
.notes-view__article {
  border-color: var(--app-border-quiet);
}
.notes-view__block-22 {
  border-color: var(--app-border-quiet);
}
.notes-view__block {
  background-color: var(--ui-black);
}
.notes-view__text-3 {
  background-color: var(--color-emerald-400);
}
.notes-view__router-link {
  background-color: var(--color-white);
}
.notes-view__router-link-2 {
  background-color: var(--color-white);
}
.notes-view__button-all--selected {
  background-color: var(--ui-zinc-800);
}
.notes-view__button--selected {
  background-color: var(--ui-zinc-800);
}
.notes-view__block-14 {
  background-color: var(--ui-zinc-900);
}
.notes-view__block-18 {
  background-color: var(--ui-zinc-900);
}
.notes-view__button-sync-from {
  background-color: var(--app-surface-tint);
}
.notes-view__text-12 {
  background-color: var(--app-surface-tint);
}
.notes-view__block-8 {
  background-color: var(--app-surface-inset);
}
.notes-view__block-13 {
  background-color: var(--app-surface-inset);
}
.notes-view__block-15 {
  background-color: var(--app-surface-inset);
}
.notes-view__article {
  background-color: var(--app-surface-inset);
}
.notes-view__field-text {
  background-color: var(--app-surface-inset-strong);
}
.notes-view__block-8 {
  padding: calc(var(--spacing) * 4);
}
.notes-view__article {
  padding: calc(var(--spacing) * 4);
}
.notes-view__block-6 {
  padding-inline: var(--spacing);
}
.notes-view__text-12 {
  padding-inline: calc(var(--spacing) * 2);
}
.notes-view__button-sync-from {
  padding-inline: calc(var(--spacing) * 3);
}
.notes-view__router-link {
  padding-inline: calc(var(--spacing) * 3);
}
.notes-view__button-all {
  padding-inline: calc(var(--spacing) * 3);
}
.notes-view__button-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.notes-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.notes-view__router-link-2 {
  padding-inline: calc(var(--spacing) * 4);
}
.notes-view__block-13 {
  padding-inline: calc(var(--spacing) * 6);
}
.notes-view__block-15 {
  padding-inline: calc(var(--spacing) * 6);
}
.notes-view__text-12 {
  padding-block: calc(var(--spacing) * .5);
}
.notes-view__button-all {
  padding-block: var(--spacing);
}
.notes-view__button-2 {
  padding-block: var(--spacing);
}
.notes-view__main {
  padding-block: calc(var(--spacing) * 6);
}
.notes-view__block-15 {
  padding-block: calc(var(--spacing) * 12);
}
.notes-view__block-13 {
  padding-block: calc(var(--spacing) * 16);
}
.notes-view__block-20 {
  padding-top: calc(var(--spacing) * .5);
}
.notes-view__block-22 {
  padding-top: calc(var(--spacing) * 3);
}
.notes-view__field-text {
  padding-right: calc(var(--spacing) * 9);
}
.notes-view__block-7 {
  padding-bottom: var(--spacing);
}
.notes-view__block-2 {
  padding-bottom: calc(var(--spacing) * 5);
}
.notes-view__block {
  padding-bottom: calc(var(--spacing) * 16);
}
.notes-view__field-text {
  padding-left: calc(var(--spacing) * 9);
}
.notes-view__block-13 {
  text-align: center;
}
.notes-view__block-15 {
  text-align: center;
}
.notes-view__text {
  font-family: var(--font-mono);
}
.notes-view__block-6 {
  font-family: var(--font-mono);
}
.notes-view__text-4 {
  font-family: var(--font-mono);
}
.notes-view__text-5 {
  font-family: var(--font-mono);
}
.notes-view__text-10 {
  font-family: var(--font-mono);
}
.notes-view__text-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.notes-view__field-text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.notes-view__subtitle-no-notes {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.notes-view__text-7 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.notes-view__subtitle-no-matching {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.notes-view__text-8 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.notes-view__title-notes {
  font-size: var(--text-xl);
  line-height: var(--leading,var(--text-xl--line-height));
}
.notes-view__button-sync-from {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.notes-view__router-link {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.notes-view__button-all {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.notes-view__button-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.notes-view__router-link-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.notes-view__button-clear-filters {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.notes-view__subtitle {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.notes-view__text-9 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.notes-view__block-20 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.notes-view__text-4 {
  font-size: 10px;
}
.notes-view__text-5 {
  font-size: 10px;
}
.notes-view__text-12 {
  font-size: 10px;
}
.notes-view__text {
  font-size: 11px;
}
.notes-view__block-6 {
  font-size: 11px;
}
.notes-view__text-10 {
  font-size: 11px;
}
.notes-view__text-2 {
  --leading: calc(var(--spacing) * 6);
  line-height: calc(var(--spacing) * 6);
}
.notes-view__text-7 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.notes-view__text-9 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.notes-view__text {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.notes-view__button-sync-from {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.notes-view__button-all {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.notes-view__button-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.notes-view__button-clear-filters {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.notes-view__text-12 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.notes-view__title-notes {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.notes-view__router-link {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.notes-view__subtitle-no-notes {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.notes-view__router-link-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.notes-view__subtitle-no-matching {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.notes-view__subtitle {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.notes-view__title-notes {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.notes-view__subtitle-no-notes {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.notes-view__subtitle {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.notes-view__button-all {
  white-space: nowrap;
}
.notes-view__button-2 {
  white-space: nowrap;
}
.notes-view__router-link {
  color: var(--ui-black);
}
.notes-view__router-link-2 {
  color: var(--ui-black);
}
.notes-view__check {
  color: var(--color-emerald-400);
}
.notes-view__button-delete-note {
  color: var(--color-red-400);
}
.notes-view__title-notes {
  color: var(--color-white);
}
.notes-view__button-all--selected {
  color: var(--color-white);
}
.notes-view__button--selected {
  color: var(--color-white);
}
.notes-view__block {
  color: var(--ui-zinc-100);
}
.notes-view__field-text {
  color: var(--ui-zinc-100);
}
.notes-view__subtitle-no-notes {
  color: var(--ui-zinc-200);
}
.notes-view__subtitle-no-matching {
  color: var(--ui-zinc-200);
}
.notes-view__subtitle {
  color: var(--ui-zinc-200);
}
.notes-view__button-sync-from {
  color: var(--ui-zinc-300);
}
.notes-view__block-18 {
  color: var(--ui-zinc-300);
}
.notes-view__text-2 {
  color: var(--ui-zinc-400);
}
.notes-view__block-6 {
  color: var(--ui-zinc-400);
}
.notes-view__button-all--muted {
  color: var(--ui-zinc-400);
}
.notes-view__button--muted {
  color: var(--ui-zinc-400);
}
.notes-view__button-clear-filters {
  color: var(--ui-zinc-400);
}
.notes-view__text-12 {
  color: var(--ui-zinc-400);
}
.notes-view__text {
  color: var(--ui-zinc-500);
}
.notes-view__text-4 {
  color: var(--ui-zinc-500);
}
.notes-view__text-5 {
  color: var(--ui-zinc-500);
}
.notes-view__block-14 {
  color: var(--ui-zinc-500);
}
.notes-view__text-7 {
  color: var(--ui-zinc-500);
}
.notes-view__text-8 {
  color: var(--ui-zinc-500);
}
.notes-view__text-9 {
  color: var(--ui-zinc-500);
}
.notes-view__button-3 {
  color: var(--ui-zinc-500);
}
.notes-view__button-view-edit {
  color: var(--ui-zinc-500);
}
.notes-view__search {
  color: var(--ui-zinc-600);
}
.notes-view__button {
  color: var(--ui-zinc-600);
}
.notes-view__search-2 {
  color: var(--ui-zinc-600);
}
.notes-view__block-20 {
  color: var(--ui-zinc-600);
}
.notes-view__text-11 {
  color: var(--ui-zinc-700);
}
.notes-view__text {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.notes-view__text-4 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.notes-view__text-5 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.notes-view__text-10 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.notes-view__button-sync-from {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.notes-view__router-link {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.notes-view__button-all--selected {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.notes-view__button--selected {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.notes-view__router-link-2 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.notes-view__button-sync-from {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.notes-view__router-link {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.notes-view__button-all {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.notes-view__button-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.notes-view__router-link-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.notes-view__field-text {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.notes-view__article {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.notes-view__subtitle {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.notes-view__button-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.notes-view__button-view-edit {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.notes-view__button-delete-note {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.notes-view__article {
  --duration: .15s;
  transition-duration: .15s;
}
.notes-view__button-all {
  -webkit-user-select: none;
  user-select: none;
}
.notes-view__button-2 {
  -webkit-user-select: none;
  user-select: none;
}
.notes-view__block-7 {
  -ms-overflow-style: none;
}
.notes-view__field-text::placeholder {
  color: var(--ui-zinc-600);
}
.notes-view__field-text:focus {
  border-color: var(--ui-zinc-600);
}
.notes-view__field-text:focus {
  --outline-style: none;
  outline-style: none;
}
.notes-view__router-link:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.notes-view__router-link-2:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.notes-view__button-sync-from:disabled {
  opacity: .5;
}
.notes-view__block-7::-webkit-scrollbar {
  display: none;
}
[data-theme="light"] .notes-view__check {
  color: var(--app-success);
}
[data-theme="light"] .notes-view__button-delete-note {
  color: var(--app-danger);
}
[data-theme="light"] .notes-view__button-sync-from {
  color: var(--app-text-soft);
}
[data-theme="light"] .notes-view__block-18 {
  color: var(--app-text-soft);
}
[data-theme="light"] .notes-view__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__block-6 {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__button-all--muted {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__button--muted {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__button-clear-filters {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__text-12 {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__text {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__text-4 {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__text-5 {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__block-14 {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__text-7 {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__text-8 {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__text-9 {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__button-3 {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__button-view-edit {
  color: var(--app-muted);
}
[data-theme="light"] .notes-view__search {
  color: var(--app-text-soft);
}
[data-theme="light"] .notes-view__button {
  color: var(--app-text-soft);
}
[data-theme="light"] .notes-view__search-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .notes-view__block-20 {
  color: var(--app-text-soft);
}
[data-theme="light"] .notes-view__button:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .notes-view__button-all--muted:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .notes-view__button--muted:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .notes-view__text-12:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .notes-view__button-3:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .notes-view__button-view-edit:hover {
  color: var(--app-text) !important;
}
}
}

/* Ledger pass: notes are ruled rows under one sheet, not floating cards. */

.notes-view__lede {
  max-width: 56ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.notes-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 32px;
  padding-inline: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  text-decoration: none;
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.notes-action:active {
  transform: translateY(1px);
}

.notes-action:disabled {
  opacity: 0.5;
  cursor: default;
}

.notes-action--ink {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.notes-action__icon {
  width: 13px;
  height: 13px;
}

.notes-action__icon--spin {
  animation: var(--animate-spin);
}

.notes-filters {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.notes-search {
  position: relative;
  display: block;
}

.notes-search__icon {
  position: absolute;
  top: 50%;
  left: 14px;
  width: 14px;
  height: 14px;
  transform: translateY(-50%);
  color: var(--app-muted-2);
  pointer-events: none;
}

.notes-search__field {
  width: 100%;
  height: 40px;
  padding: 0 42px 0 38px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: transparent;
  font-size: var(--app-text-body);
  color: var(--app-text);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.notes-search__field::placeholder {
  color: var(--app-muted-2);
}

.notes-search__field:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.notes-search__clear {
  position: absolute;
  top: 50%;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  transform: translateY(-50%);
  border: 0;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
}

.notes-search__clear-icon {
  width: 13px;
  height: 13px;
}

.notes-filters__scope {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.notes-filters__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.notes-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.notes-chip__count {
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.notes-chip.is-active {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.notes-chip.is-active .notes-chip__count {
  color: color-mix(in oklab, var(--app-bg) 65%, transparent);
}

.notes-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-fade 320ms var(--app-ease-standard) both;
}

.notes-row {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  padding: 14px;
  cursor: pointer;
  transition: background-color var(--app-dur-fast) var(--app-ease-standard);
}

.notes-row + .notes-row {
  border-top: 1px solid var(--app-border);
}

.notes-row__mark {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--app-radius-sm);
  background: var(--app-success-soft);
  color: var(--app-success);
}

.notes-row__mark-icon {
  width: 14px;
  height: 14px;
}

.notes-row__body {
  flex: 1;
  min-width: 0;
}

.notes-row__title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: -0.005em;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.notes-row__preview {
  display: -webkit-box;
  margin: 4px 0 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 12px;
  line-height: 1.5;
  color: var(--app-muted);
}

.notes-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  margin-top: 8px;
}

.notes-row__date {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.notes-row__meta-icon {
  width: 11px;
  height: 11px;
}

.notes-row__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.notes-row__tag {
  padding: 1px 5px;
  border: 0;
  border-radius: 3px;
  background: var(--app-surface-soft);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
  cursor: pointer;
}

.notes-row__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

.notes-row__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.notes-row__action-icon {
  width: 13px;
  height: 13px;
}

.notes-row__action--danger {
  color: color-mix(in oklab, var(--app-danger) 70%, var(--app-muted));
}

.notes-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-3);
  padding: var(--app-space-8) var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  text-align: center;
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}

.notes-empty__eyebrow {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.notes-empty__mark {
  width: 18px;
  height: 18px;
  color: var(--app-muted-2);
}

.notes-empty__title {
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

.notes-empty__lede {
  max-width: 40ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.notes-empty__action {
  margin-top: var(--app-space-3);
}

.notes-loading__label {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

@media (hover: hover) {
  .notes-action:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .notes-action--ink:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .notes-row:hover {
    background: var(--app-surface-soft);
  }

  .notes-row__action:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }

  .notes-row__action--danger:hover {
    background: color-mix(in oklab, var(--app-danger) 12%, transparent);
    color: var(--app-danger);
  }

  .notes-row__tag:hover {
    color: var(--app-text);
  }

  .notes-chip:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .notes-search__clear:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }
}

@media (max-width: 30rem) {
  .notes-row__mark {
    display: none;
  }
}

@media (pointer: coarse) {
  .notes-action,
  .notes-search__clear,
  .notes-chip {
    min-height: var(--app-touch-h);
  }

  .notes-row__action {
    width: var(--app-touch-h);
    height: var(--app-touch-h);
  }

  .notes-row {
    flex-wrap: wrap;
  }

  .notes-row__actions {
    width: 100%;
    margin-left: 0;
    padding-top: 8px;
    border-top: 1px solid var(--app-border);
    justify-content: flex-end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notes-list,
  .notes-empty {
    animation: none;
  }

  .notes-action,
  .notes-chip,
  .notes-row,
  .notes-row__action {
    transition: none;
  }
}
</style>
