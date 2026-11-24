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

/* Ledger pass: notes are ruled rows under one sheet, not floating cards. */

.notes-view__block {
  min-height: 100vh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.notes-view__main {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  width: 100%;
  max-width: 72rem;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

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
  animation: spin 1s linear infinite;
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
  .notes-view__block,
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
