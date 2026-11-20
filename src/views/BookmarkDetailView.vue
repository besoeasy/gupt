<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Bookmark,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  LoaderCircle,
  Globe,
  Tag,
  ShieldCheck,
  X,
} from "@lucide/vue";
import PageHeader from "@/components/PageHeader.vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
import RelayEventLink from "@/components/RelayEventLink.vue";
import { useIdentityStore } from "@/stores/identity";
import { copyToClipboard } from "@/lib/clipboard";
import {
  getBookmarksCached,
  fetchBookmarks,
  saveBookmark,
  deleteBookmark,
  bookmarkHostname,
  normalizeBookmarkTags,
  parseBookmarkTagsInput,
} from "@/lib/bookmarks";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();

const bookmarkId = computed(() => route.params.id || "");
const isNew = computed(() => !bookmarkId.value || route.path === "/bookmarks/new");

const isLoading = ref(!isNew.value);
const isSaving = ref(false);
const isDeleting = ref(false);
const error = ref("");
const showDeleteConfirm = ref(false);

const bookmarkItem = ref(null);
const form = ref({
  title: "",
  url: "",
  tags: [],
});
const tagDraft = ref("");
const copiedUrl = ref(false);
let copyUrlTimer = null;
const copiedEventId = ref(false);
let copyEventTimer = null;

const faviconFailed = ref(false);

const currentHostname = computed(() => {
  return bookmarkHostname(form.value.url) || "";
});

const currentFaviconUrl = computed(() => {
  if (!currentHostname.value) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(currentHostname.value)}&sz=64`;
});

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function addTagFromDraft() {
  const parsed = parseBookmarkTagsInput(tagDraft.value);
  if (!parsed.length) return;
  form.value.tags = normalizeBookmarkTags([...form.value.tags, ...parsed]);
  tagDraft.value = "";
}

function removeTag(tag) {
  form.value.tags = form.value.tags.filter((t) => t !== tag);
}

async function copyUrl() {
  if (!form.value.url) return;
  await copyToClipboard(form.value.url);
  copiedUrl.value = true;
  if (copyUrlTimer) clearTimeout(copyUrlTimer);
  copyUrlTimer = setTimeout(() => {
    copiedUrl.value = false;
  }, 1800);
}

async function copyEventId(id) {
  if (!id) return;
  await copyToClipboard(id);
  copiedEventId.value = true;
  if (copyEventTimer) clearTimeout(copyEventTimer);
  copyEventTimer = setTimeout(() => {
    copiedEventId.value = false;
  }, 1800);
}

function openExternalUrl() {
  if (!form.value.url) return;
  window.open(form.value.url, "_blank", "noopener,noreferrer");
}

async function loadBookmark() {
  if (isNew.value) return;
  isLoading.value = true;
  error.value = "";
  try {
    const cached = await getBookmarksCached(identity.privkeyHex, identity.pubkeyHex);
    let item = (cached?.items || []).find((b) => b.id === bookmarkId.value);

    if (!item) {
      const live = await fetchBookmarks(identity.privkeyHex, identity.pubkeyHex);
      item = live.find((b) => b.id === bookmarkId.value);
    }

    if (!item) {
      error.value = "Bookmark not found or has been deleted.";
      return;
    }

    bookmarkItem.value = item;
    form.value = {
      title: item.title || "",
      url: item.url || "",
      tags: [...(item.tags || [])],
    };
  } catch (err) {
    error.value = err?.message || "Failed to load bookmark.";
  } finally {
    isLoading.value = false;
  }
}

async function handleSave() {
  if (isSaving.value) return;
  if (tagDraft.value.trim()) addTagFromDraft();
  if (!form.value.url.trim()) {
    error.value = "URL is required.";
    return;
  }

  isSaving.value = true;
  error.value = "";
  try {
    await saveBookmark(identity.privkeyHex, identity.pubkeyHex, {
      title: form.value.title,
      url: form.value.url,
      tags: form.value.tags,
    });
    router.push("/bookmarks");
  } catch (err) {
    error.value = err?.message || "Failed to save bookmark.";
  } finally {
    isSaving.value = false;
  }
}

async function confirmDelete() {
  if (!bookmarkItem.value) return;
  isDeleting.value = true;
  error.value = "";
  try {
    await deleteBookmark(identity.privkeyHex, identity.pubkeyHex, bookmarkItem.value);
    showDeleteConfirm.value = false;
    router.push("/bookmarks");
  } catch (err) {
    error.value = err?.message || "Failed to delete bookmark.";
  } finally {
    isDeleting.value = false;
  }
}

onMounted(() => {
  loadBookmark();
});
</script>

<template>
  <main class="bookmark-detail-view__main">
    <div class="bookmark-detail-view__block">
      <div class="bookmark-detail-view__block-2">
        <PageHeader
          :eyebrow="isNew ? 'New Bookmark' : 'Encrypted Bookmark'"
          :title="isNew ? 'Add Bookmark' : form.title || currentHostname || 'Bookmark Details'"
        >
          <p class="bookmark-detail-view__text">
            {{
              isNew
                ? "Save an encrypted web bookmark directly to your chosen relays."
                : "Stored securely with end-to-end encryption. Only your keys can decrypt this bookmark."
            }}
          </p>
        </PageHeader>

        <AppAlertBanner v-if="error" :message="error" />

        <!-- Loading State -->
        <div
          v-if="isLoading"
          class="bookmark-detail-view__status"
          role="status"
        >
          <span class="bookmark-detail-view__text-2">Fetching encrypted bookmark…</span>

          <!-- URL -->
          <div class="bookmark-detail-view__block-3">
            <AppSkeleton class="bookmark-detail-view__app-skeleton" />
            <AppSkeleton class="bookmark-detail-view__app-skeleton-2" />
          </div>

          <!-- Title -->
          <div class="bookmark-detail-view__block-4">
            <AppSkeleton class="bookmark-detail-view__app-skeleton-3" />
            <AppSkeleton class="bookmark-detail-view__app-skeleton-4" />
          </div>

          <!-- Tags -->
          <div class="bookmark-detail-view__block-5">
            <AppSkeleton class="bookmark-detail-view__app-skeleton-5" />
            <div class="bookmark-detail-view__block-6">
              <AppSkeleton class="bookmark-detail-view__app-skeleton-6" />
              <AppSkeleton class="bookmark-detail-view__app-skeleton-7" />
            </div>
            <div class="bookmark-detail-view__block-7">
              <AppSkeleton v-for="n in 2" :key="n" class="bookmark-detail-view__app-skeleton-8" />
            </div>
          </div>

          <!-- Actions -->
          <div
            class="bookmark-detail-view__block-8"
          >
            <AppSkeleton class="bookmark-detail-view__app-skeleton-9" />
            <div class="bookmark-detail-view__block-9">
              <AppSkeleton class="bookmark-detail-view__app-skeleton-10" />
              <AppSkeleton class="bookmark-detail-view__app-skeleton-11" />
            </div>
          </div>
        </div>

        <template v-else>
          <!-- Main Form Card -->
          <form
            class="bookmark-detail-view__form"
            @submit.prevent="handleSave"
          >
            <!-- URL Input -->
            <div class="bookmark-detail-view__block-10">
              <div class="bookmark-detail-view__block-11">
                <label class="bookmark-detail-view__label-url">
                  URL <span class="bookmark-detail-view__text-3">*</span>
                </label>
                <div v-if="form.url" class="bookmark-detail-view__block-12">
                  <button
                    type="button"
                    class="bookmark-detail-view__button"
                    @click="openExternalUrl"
                  >
                    <ExternalLink class="bookmark-detail-view__external-link" />
                    <span>Open link</span>
                  </button>
                  <span class="bookmark-detail-view__text-4">·</span>
                  <button
                    type="button"
                    class="bookmark-detail-view__button-2"
                    @click="copyUrl"
                  >
                    <Check v-if="copiedUrl" class="bookmark-detail-view__check" />
                    <Copy v-else class="bookmark-detail-view__copy" />
                    <span>{{ copiedUrl ? "Copied" : "Copy" }}</span>
                  </button>
                </div>
              </div>

              <div class="bookmark-detail-view__block-13">
                <div
                  class="bookmark-detail-view__block-14"
                >
                  <img
                    v-if="currentFaviconUrl && !faviconFailed"
                    :src="currentFaviconUrl"
                    class="bookmark-detail-view__image"
                    alt=""
                    @error="faviconFailed = true"
                  />
                  <Globe v-else class="bookmark-detail-view__globe" />
                </div>
                <input
                  v-model="form.url"
                  type="url"
                  required
                  placeholder="https://example.com/article"
                  class="bookmark-detail-view__field-url"
                />
              </div>
            </div>

            <!-- Title Input -->
            <div class="bookmark-detail-view__block-15">
              <label class="bookmark-detail-view__label-title">
                Title
                <span class="bookmark-detail-view__text-5">(optional)</span>
              </label>
              <input
                v-model="form.title"
                type="text"
                placeholder="Descriptive title or note"
                class="bookmark-detail-view__field-text"
              />
            </div>

            <!-- Tags Input -->
            <div class="bookmark-detail-view__block-16">
              <label class="bookmark-detail-view__label-tags">
                Tags
              </label>

              <!-- Tag draft input -->
              <div class="bookmark-detail-view__block-17">
                <div class="bookmark-detail-view__block-18">
                  <Tag
                    class="bookmark-detail-view__tag"
                  />
                  <input
                    v-model="tagDraft"
                    type="text"
                    placeholder="Add tag (e.g. dev, reading, tools) and press Enter…"
                    class="bookmark-detail-view__field-text-2"
                    @keydown.enter.prevent="addTagFromDraft"
                    @keydown.comma.prevent="addTagFromDraft"
                  />
                </div>
                <button
                  type="button"
                  :disabled="!tagDraft.trim()"
                  class="bookmark-detail-view__button-add"
                  @click="addTagFromDraft"
                >
                  Add
                </button>
              </div>

              <!-- Tag chips -->
              <div v-if="form.tags.length" class="bookmark-detail-view__block-19">
                <span
                  v-for="tag in form.tags"
                  :key="tag"
                  class="bookmark-detail-view__text-6"
                >
                  <span>{{ tag }}</span>
                  <button
                    type="button"
                    class="bookmark-detail-view__button-remove-tag"
                    title="Remove tag"
                    @click="removeTag(tag)"
                  >
                    <X class="bookmark-detail-view__x" />
                  </button>
                </span>
              </div>
            </div>

            <!-- Actions buttons -->
            <div
              class="bookmark-detail-view__block-20"
            >
              <div class="bookmark-detail-view__block-21">
                <button
                  v-if="!isNew"
                  type="button"
                  class="bookmark-detail-view__button-3"
                  @click="showDeleteConfirm = true"
                >
                  <Trash2 class="bookmark-detail-view__trash2" />
                  <span>Delete</span>
                </button>
              </div>

              <div class="bookmark-detail-view__block-22">
                <button
                  type="button"
                  class="bookmark-detail-view__button-cancel"
                  @click="router.push('/bookmarks')"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  :disabled="isSaving"
                  class="bookmark-detail-view__button-4"
                >
                  <LoaderCircle v-if="isSaving" class="bookmark-detail-view__loader-circle" />
                  <Check v-else class="bookmark-detail-view__check-2" />
                  <span>{{ isNew ? "Save Bookmark" : "Save Changes" }}</span>
                </button>
              </div>
            </div>
          </form>

          <!-- Metadata info section (when viewing existing bookmark) -->
          <section
            v-if="!isNew && bookmarkItem"
            class="bookmark-detail-view__section"
          >
            <div
              class="bookmark-detail-view__block-23"
            >
              <ShieldCheck class="bookmark-detail-view__shield-check" />
              <span>Encrypted Storage Details</span>
            </div>

            <div class="bookmark-detail-view__block-24">
              <div class="bookmark-detail-view__block-25">
                <p class="bookmark-detail-view__text-created">Created</p>
                <p class="bookmark-detail-view__text-7">
                  {{ formatDate(bookmarkItem.createdAt) }}
                </p>
              </div>

              <div class="bookmark-detail-view__block-26">
                <p class="bookmark-detail-view__text-last-updated">Last Updated</p>
                <p class="bookmark-detail-view__text-8">
                  {{ formatDate(bookmarkItem.updatedAt) }}
                </p>
              </div>

              <div
                v-if="bookmarkItem.eventId"
                class="bookmark-detail-view__block-27"
              >
                <div class="bookmark-detail-view__block-28">
                  <p class="bookmark-detail-view__text-event-id">Event ID</p>
                  <div class="bookmark-detail-view__block-29">
                    <button
                      type="button"
                      class="bookmark-detail-view__button-5"
                      @click="copyEventId(bookmarkItem.eventId)"
                    >
                      <Check v-if="copiedEventId" class="bookmark-detail-view__check-3" />
                      <Copy v-else class="bookmark-detail-view__copy-2" />
                      <span>{{ copiedEventId ? "Copied" : "Copy ID" }}</span>
                    </button>
                    <span class="bookmark-detail-view__text-9">·</span>
                    <RelayEventLink :event-id="bookmarkItem.eventId" />
                  </div>
                </div>
                <p class="bookmark-detail-view__text-10">
                  {{ bookmarkItem.eventId }}
                </p>
              </div>
            </div>
          </section>
        </template>
      </div>
    </div>

    <!-- Confirm Delete Modal -->
    <AppConfirmDialog
      :open="showDeleteConfirm"
      title="Delete Bookmark?"
      message="This will publish an encrypted deletion tombstone to your relays. This action cannot be undone."
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />
  </main>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__block-25 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__block-26 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__block-27 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__block-14 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__field-url {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__field-text {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__field-text-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__text-6 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__button-cancel {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__block-25 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__block-26 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__block-27 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__status {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__form {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__section {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@media (hover:hover) {
.bookmark-detail-view__button-3:hover {
  border-color: #fb2c364d;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__button-3:hover {
  border-color: color-mix(in oklab,var(--color-red-500) 30%,transparent);
}
}
}

@media (hover:hover) {
.bookmark-detail-view__button-3:hover {
  background-color: #fb2c361a;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__button-3:hover {
  background-color: color-mix(in oklab,var(--color-red-500) 10%,transparent);
}
}
}

@media (hover:hover) {
.bookmark-detail-view__button-4:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.bookmark-detail-view__button-cancel:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.bookmark-detail-view__button-add:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.bookmark-detail-view__button-add:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}
}

@media (hover:hover) {
.bookmark-detail-view__button-remove-tag:hover {
  color: var(--color-red-400);
}
}

@media (hover:hover) {
.bookmark-detail-view__button:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.bookmark-detail-view__button-5:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.bookmark-detail-view__button-cancel:hover {
  color: var(--ui-zinc-100);
}
}

@media (hover:hover) {
.bookmark-detail-view__button-2:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.bookmark-detail-view__button:hover {
  text-decoration-line: underline;
}
}

@media (hover:hover) {
.bookmark-detail-view__button-5:hover {
  text-decoration-line: underline;
}
}

@media (min-width:40rem) {
.bookmark-detail-view__block-27 {
  grid-column: span 2/span 2;
}
}

@media (min-width:40rem) {
.bookmark-detail-view__block-21 {
  width: auto;
}
}

@media (min-width:40rem) {
.bookmark-detail-view__block-22 {
  width: auto;
}
}

@media (min-width:40rem) {
.bookmark-detail-view__button-3 {
  flex: 0 auto;
}
}

@media (min-width:40rem) {
.bookmark-detail-view__button-cancel {
  flex: 0 auto;
}
}

@media (min-width:40rem) {
.bookmark-detail-view__button-4 {
  flex: 0 auto;
}
}

@media (min-width:40rem) {
.bookmark-detail-view__block-24 {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
}

@media (min-width:40rem) {
.bookmark-detail-view__block-8 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.bookmark-detail-view__block-20 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.bookmark-detail-view__section {
  padding: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.bookmark-detail-view__status {
  padding: calc(var(--spacing) * 7);
}
}

@media (min-width:40rem) {
.bookmark-detail-view__form {
  padding: calc(var(--spacing) * 7);
}
}

@media (min-width:40rem) {
.bookmark-detail-view__block {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.bookmark-detail-view__main {
  height: 100%;
}
}

@media (min-width:64rem) {
.bookmark-detail-view__block {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.bookmark-detail-view__block-14 {
  pointer-events: none;
}
.bookmark-detail-view__tag {
  pointer-events: none;
}
.bookmark-detail-view__text-2 {
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
.bookmark-detail-view__block-14 {
  position: absolute;
}
.bookmark-detail-view__tag {
  position: absolute;
}
.bookmark-detail-view__block-13 {
  position: relative;
}
.bookmark-detail-view__block-18 {
  position: relative;
}
.bookmark-detail-view__tag {
  top: 50%;
}
.bookmark-detail-view__block-14 {
  left: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__tag {
  left: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__block {
  margin-inline: auto;
}
.bookmark-detail-view__label-url {
  display: block;
}
.bookmark-detail-view__field-url {
  display: block;
}
.bookmark-detail-view__label-title {
  display: block;
}
.bookmark-detail-view__field-text {
  display: block;
}
.bookmark-detail-view__label-tags {
  display: block;
}
.bookmark-detail-view__field-text-2 {
  display: block;
}
.bookmark-detail-view__block-6 {
  display: flex;
}
.bookmark-detail-view__block-7 {
  display: flex;
}
.bookmark-detail-view__block-8 {
  display: flex;
}
.bookmark-detail-view__block-9 {
  display: flex;
}
.bookmark-detail-view__block-11 {
  display: flex;
}
.bookmark-detail-view__block-12 {
  display: flex;
}
.bookmark-detail-view__block-13 {
  display: flex;
}
.bookmark-detail-view__block-14 {
  display: flex;
}
.bookmark-detail-view__block-17 {
  display: flex;
}
.bookmark-detail-view__block-19 {
  display: flex;
}
.bookmark-detail-view__block-20 {
  display: flex;
}
.bookmark-detail-view__block-21 {
  display: flex;
}
.bookmark-detail-view__block-22 {
  display: flex;
}
.bookmark-detail-view__block-23 {
  display: flex;
}
.bookmark-detail-view__block-28 {
  display: flex;
}
.bookmark-detail-view__block-29 {
  display: flex;
}
.bookmark-detail-view__block-24 {
  display: grid;
}
.bookmark-detail-view__button {
  display: inline-flex;
}
.bookmark-detail-view__button-2 {
  display: inline-flex;
}
.bookmark-detail-view__text-6 {
  display: inline-flex;
}
.bookmark-detail-view__button-3 {
  display: inline-flex;
}
.bookmark-detail-view__button-cancel {
  display: inline-flex;
}
.bookmark-detail-view__button-4 {
  display: inline-flex;
}
.bookmark-detail-view__button-5 {
  display: inline-flex;
}
.bookmark-detail-view__app-skeleton {
  height: calc(var(--spacing) * 2.5);
}
.bookmark-detail-view__app-skeleton-3 {
  height: calc(var(--spacing) * 2.5);
}
.bookmark-detail-view__app-skeleton-5 {
  height: calc(var(--spacing) * 2.5);
}
.bookmark-detail-view__check-3 {
  height: calc(var(--spacing) * 3);
}
.bookmark-detail-view__copy-2 {
  height: calc(var(--spacing) * 3);
}
.bookmark-detail-view__external-link {
  height: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__check {
  height: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__copy {
  height: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__globe {
  height: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__x {
  height: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__image {
  height: calc(var(--spacing) * 4);
}
.bookmark-detail-view__tag {
  height: calc(var(--spacing) * 4);
}
.bookmark-detail-view__trash2 {
  height: calc(var(--spacing) * 4);
}
.bookmark-detail-view__loader-circle {
  height: calc(var(--spacing) * 4);
}
.bookmark-detail-view__check-2 {
  height: calc(var(--spacing) * 4);
}
.bookmark-detail-view__shield-check {
  height: calc(var(--spacing) * 4);
}
.bookmark-detail-view__app-skeleton-8 {
  height: calc(var(--spacing) * 6);
}
.bookmark-detail-view__block-14 {
  height: calc(var(--spacing) * 6);
}
.bookmark-detail-view__app-skeleton-6 {
  height: calc(var(--spacing) * 9);
}
.bookmark-detail-view__app-skeleton-7 {
  height: calc(var(--spacing) * 9);
}
.bookmark-detail-view__app-skeleton-9 {
  height: calc(var(--spacing) * 9);
}
.bookmark-detail-view__app-skeleton-10 {
  height: calc(var(--spacing) * 9);
}
.bookmark-detail-view__app-skeleton-11 {
  height: calc(var(--spacing) * 9);
}
.bookmark-detail-view__button-3 {
  height: calc(var(--spacing) * 9);
}
.bookmark-detail-view__button-cancel {
  height: calc(var(--spacing) * 9);
}
.bookmark-detail-view__button-4 {
  height: calc(var(--spacing) * 9);
}
.bookmark-detail-view__app-skeleton-2 {
  height: calc(var(--spacing) * 12);
}
.bookmark-detail-view__app-skeleton-4 {
  height: calc(var(--spacing) * 12);
}
.bookmark-detail-view__main {
  min-height: 100dvh;
}
.bookmark-detail-view__check-3 {
  width: calc(var(--spacing) * 3);
}
.bookmark-detail-view__copy-2 {
  width: calc(var(--spacing) * 3);
}
.bookmark-detail-view__external-link {
  width: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__check {
  width: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__copy {
  width: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__globe {
  width: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__x {
  width: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__image {
  width: calc(var(--spacing) * 4);
}
.bookmark-detail-view__tag {
  width: calc(var(--spacing) * 4);
}
.bookmark-detail-view__trash2 {
  width: calc(var(--spacing) * 4);
}
.bookmark-detail-view__loader-circle {
  width: calc(var(--spacing) * 4);
}
.bookmark-detail-view__check-2 {
  width: calc(var(--spacing) * 4);
}
.bookmark-detail-view__shield-check {
  width: calc(var(--spacing) * 4);
}
.bookmark-detail-view__block-14 {
  width: calc(var(--spacing) * 6);
}
.bookmark-detail-view__app-skeleton {
  width: calc(var(--spacing) * 10);
}
.bookmark-detail-view__app-skeleton-5 {
  width: calc(var(--spacing) * 10);
}
.bookmark-detail-view__app-skeleton-3 {
  width: calc(var(--spacing) * 12);
}
.bookmark-detail-view__app-skeleton-7 {
  width: calc(var(--spacing) * 14);
}
.bookmark-detail-view__app-skeleton-8 {
  width: calc(var(--spacing) * 16);
}
.bookmark-detail-view__app-skeleton-10 {
  width: calc(var(--spacing) * 20);
}
.bookmark-detail-view__app-skeleton-9 {
  width: calc(var(--spacing) * 24);
}
.bookmark-detail-view__app-skeleton-11 {
  width: calc(var(--spacing) * 36);
}
.bookmark-detail-view__block {
  width: 100%;
}
.bookmark-detail-view__app-skeleton-2 {
  width: 100%;
}
.bookmark-detail-view__app-skeleton-4 {
  width: 100%;
}
.bookmark-detail-view__field-url {
  width: 100%;
}
.bookmark-detail-view__field-text {
  width: 100%;
}
.bookmark-detail-view__field-text-2 {
  width: 100%;
}
.bookmark-detail-view__block-21 {
  width: 100%;
}
.bookmark-detail-view__block-22 {
  width: 100%;
}
.bookmark-detail-view__block {
  max-width: var(--container-6xl);
}
.bookmark-detail-view__app-skeleton-6 {
  flex: 1;
}
.bookmark-detail-view__block-18 {
  flex: 1;
}
.bookmark-detail-view__button-3 {
  flex: 1;
}
.bookmark-detail-view__button-cancel {
  flex: 1;
}
.bookmark-detail-view__button-4 {
  flex: 1;
}
.bookmark-detail-view__tag {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.bookmark-detail-view__loader-circle {
  animation: var(--animate-spin);
}
.bookmark-detail-view__button {
  cursor: pointer;
}
.bookmark-detail-view__button-2 {
  cursor: pointer;
}
.bookmark-detail-view__button-add {
  cursor: pointer;
}
.bookmark-detail-view__button-remove-tag {
  cursor: pointer;
}
.bookmark-detail-view__button-3 {
  cursor: pointer;
}
.bookmark-detail-view__button-cancel {
  cursor: pointer;
}
.bookmark-detail-view__button-4 {
  cursor: pointer;
}
.bookmark-detail-view__button-5 {
  cursor: pointer;
}
.bookmark-detail-view__block-24 {
  grid-template-columns: repeat(1,minmax(0,1fr));
}
.bookmark-detail-view__block-8 {
  flex-direction: column-reverse;
}
.bookmark-detail-view__block-20 {
  flex-direction: column-reverse;
}
.bookmark-detail-view__block-7 {
  flex-wrap: wrap;
}
.bookmark-detail-view__block-19 {
  flex-wrap: wrap;
}
.bookmark-detail-view__block-8 {
  align-items: center;
}
.bookmark-detail-view__block-9 {
  align-items: center;
}
.bookmark-detail-view__block-11 {
  align-items: center;
}
.bookmark-detail-view__block-12 {
  align-items: center;
}
.bookmark-detail-view__button {
  align-items: center;
}
.bookmark-detail-view__button-2 {
  align-items: center;
}
.bookmark-detail-view__block-13 {
  align-items: center;
}
.bookmark-detail-view__block-14 {
  align-items: center;
}
.bookmark-detail-view__text-6 {
  align-items: center;
}
.bookmark-detail-view__block-20 {
  align-items: center;
}
.bookmark-detail-view__block-21 {
  align-items: center;
}
.bookmark-detail-view__button-3 {
  align-items: center;
}
.bookmark-detail-view__block-22 {
  align-items: center;
}
.bookmark-detail-view__button-cancel {
  align-items: center;
}
.bookmark-detail-view__button-4 {
  align-items: center;
}
.bookmark-detail-view__block-23 {
  align-items: center;
}
.bookmark-detail-view__block-28 {
  align-items: center;
}
.bookmark-detail-view__block-29 {
  align-items: center;
}
.bookmark-detail-view__button-5 {
  align-items: center;
}
.bookmark-detail-view__block-8 {
  justify-content: space-between;
}
.bookmark-detail-view__block-11 {
  justify-content: space-between;
}
.bookmark-detail-view__block-20 {
  justify-content: space-between;
}
.bookmark-detail-view__block-28 {
  justify-content: space-between;
}
.bookmark-detail-view__block-14 {
  justify-content: center;
}
.bookmark-detail-view__button-3 {
  justify-content: center;
}
.bookmark-detail-view__button-cancel {
  justify-content: center;
}
.bookmark-detail-view__button-4 {
  justify-content: center;
}
.bookmark-detail-view__block-22 {
  justify-content: flex-end;
}
.bookmark-detail-view__button {
  gap: var(--spacing);
}
.bookmark-detail-view__button-2 {
  gap: var(--spacing);
}
.bookmark-detail-view__button-5 {
  gap: var(--spacing);
}
.bookmark-detail-view__text-6 {
  gap: calc(var(--spacing) * 1.5);
}
.bookmark-detail-view__button-3 {
  gap: calc(var(--spacing) * 1.5);
}
.bookmark-detail-view__block-6 {
  gap: calc(var(--spacing) * 2);
}
.bookmark-detail-view__block-7 {
  gap: calc(var(--spacing) * 2);
}
.bookmark-detail-view__block-9 {
  gap: calc(var(--spacing) * 2);
}
.bookmark-detail-view__block-12 {
  gap: calc(var(--spacing) * 2);
}
.bookmark-detail-view__block-17 {
  gap: calc(var(--spacing) * 2);
}
.bookmark-detail-view__block-19 {
  gap: calc(var(--spacing) * 2);
}
.bookmark-detail-view__block-21 {
  gap: calc(var(--spacing) * 2);
}
.bookmark-detail-view__block-22 {
  gap: calc(var(--spacing) * 2);
}
.bookmark-detail-view__button-4 {
  gap: calc(var(--spacing) * 2);
}
.bookmark-detail-view__block-23 {
  gap: calc(var(--spacing) * 2);
}
.bookmark-detail-view__block-29 {
  gap: calc(var(--spacing) * 2);
}
.bookmark-detail-view__block-8 {
  gap: calc(var(--spacing) * 3);
}
.bookmark-detail-view__block-20 {
  gap: calc(var(--spacing) * 3);
}
.bookmark-detail-view__block-24 {
  gap: calc(var(--spacing) * 4);
}
:where(.bookmark-detail-view__block-25>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.bookmark-detail-view__block-26>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.bookmark-detail-view__block-27>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.bookmark-detail-view__block-3>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.bookmark-detail-view__block-4>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.bookmark-detail-view__block-10>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.bookmark-detail-view__block-15>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.bookmark-detail-view__block-5>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.bookmark-detail-view__block-16>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.bookmark-detail-view__section>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.bookmark-detail-view__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
:where(.bookmark-detail-view__block-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
:where(.bookmark-detail-view__status>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
:where(.bookmark-detail-view__form>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
.bookmark-detail-view__main {
  overflow-x: hidden;
}
.bookmark-detail-view__main {
  overflow-y: auto;
}
.bookmark-detail-view__app-skeleton-7 {
  border-radius: var(--radius-lg);
}
.bookmark-detail-view__app-skeleton-11 {
  border-radius: var(--radius-lg);
}
.bookmark-detail-view__block-14 {
  border-radius: var(--radius-lg);
}
.bookmark-detail-view__button-add {
  border-radius: var(--radius-lg);
}
.bookmark-detail-view__button-4 {
  border-radius: var(--radius-lg);
}
.bookmark-detail-view__app-skeleton-8 {
  border-radius: var(--radius-md);
}
.bookmark-detail-view__text-6 {
  border-radius: var(--radius-md);
}
.bookmark-detail-view__image {
  border-radius: var(--radius-sm);
}
.bookmark-detail-view__status {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__app-skeleton-2 {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__app-skeleton-4 {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__app-skeleton-6 {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__app-skeleton-9 {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__app-skeleton-10 {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__form {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__field-url {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__field-text {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__field-text-2 {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__button-3 {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__button-cancel {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__section {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__block-25 {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__block-26 {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__block-27 {
  border-radius: var(--radius-xl);
}
.bookmark-detail-view__status {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmark-detail-view__form {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmark-detail-view__field-url {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmark-detail-view__field-text {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmark-detail-view__field-text-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmark-detail-view__button-add {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmark-detail-view__text-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmark-detail-view__button-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmark-detail-view__button-cancel {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmark-detail-view__section {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmark-detail-view__block-25 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmark-detail-view__block-26 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmark-detail-view__block-27 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmark-detail-view__block-8 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.bookmark-detail-view__block-20 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.bookmark-detail-view__status {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__block-8 {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__form {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__field-url {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__field-text {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__field-text-2 {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__button-add {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__text-6 {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__block-20 {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__button-3 {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__button-cancel {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__section {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__block-25 {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__block-26 {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__block-27 {
  border-color: var(--ui-zinc-800);
}
.bookmark-detail-view__main {
  background-color: var(--ui-black);
}
.bookmark-detail-view__button-4 {
  background-color: var(--color-white);
}
.bookmark-detail-view__block-14 {
  background-color: var(--ui-zinc-900);
}
.bookmark-detail-view__field-url {
  background-color: var(--ui-zinc-900);
}
.bookmark-detail-view__field-text {
  background-color: var(--ui-zinc-900);
}
.bookmark-detail-view__field-text-2 {
  background-color: var(--ui-zinc-900);
}
.bookmark-detail-view__text-6 {
  background-color: var(--ui-zinc-900);
}
.bookmark-detail-view__button-cancel {
  background-color: var(--ui-zinc-900);
}
.bookmark-detail-view__block-25 {
  background-color: var(--ui-zinc-900);
}
.bookmark-detail-view__block-26 {
  background-color: var(--ui-zinc-900);
}
.bookmark-detail-view__block-27 {
  background-color: var(--ui-zinc-900);
}
.bookmark-detail-view__status {
  background-color: var(--ui-zinc-950);
}
.bookmark-detail-view__form {
  background-color: var(--ui-zinc-950);
}
.bookmark-detail-view__section {
  background-color: var(--ui-zinc-950);
}
.bookmark-detail-view__image {
  object-fit: contain;
}
.bookmark-detail-view__block-25 {
  padding: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__block-26 {
  padding: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__block-27 {
  padding: calc(var(--spacing) * 3.5);
}
.bookmark-detail-view__status {
  padding: calc(var(--spacing) * 5);
}
.bookmark-detail-view__form {
  padding: calc(var(--spacing) * 5);
}
.bookmark-detail-view__section {
  padding: calc(var(--spacing) * 5);
}
.bookmark-detail-view__text-6 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.bookmark-detail-view__button-add {
  padding-inline: calc(var(--spacing) * 3);
}
.bookmark-detail-view__block {
  padding-inline: calc(var(--spacing) * 4);
}
.bookmark-detail-view__field-text {
  padding-inline: calc(var(--spacing) * 4);
}
.bookmark-detail-view__button-3 {
  padding-inline: calc(var(--spacing) * 4);
}
.bookmark-detail-view__button-cancel {
  padding-inline: calc(var(--spacing) * 4);
}
.bookmark-detail-view__button-4 {
  padding-inline: calc(var(--spacing) * 5);
}
.bookmark-detail-view__text-6 {
  padding-block: var(--spacing);
}
.bookmark-detail-view__field-text-2 {
  padding-block: calc(var(--spacing) * 2);
}
.bookmark-detail-view__button-add {
  padding-block: calc(var(--spacing) * 2);
}
.bookmark-detail-view__field-url {
  padding-block: calc(var(--spacing) * 3);
}
.bookmark-detail-view__field-text {
  padding-block: calc(var(--spacing) * 3);
}
.bookmark-detail-view__block {
  padding-block: calc(var(--spacing) * 6);
}
.bookmark-detail-view__block-7 {
  padding-top: var(--spacing);
}
.bookmark-detail-view__block-19 {
  padding-top: var(--spacing);
}
.bookmark-detail-view__block-8 {
  padding-top: calc(var(--spacing) * 5);
}
.bookmark-detail-view__block-20 {
  padding-top: calc(var(--spacing) * 5);
}
.bookmark-detail-view__field-url {
  padding-right: calc(var(--spacing) * 4);
}
.bookmark-detail-view__field-text-2 {
  padding-right: calc(var(--spacing) * 4);
}
.bookmark-detail-view__main {
  padding-bottom: calc(var(--spacing) * 16);
}
.bookmark-detail-view__field-text-2 {
  padding-left: calc(var(--spacing) * 10);
}
.bookmark-detail-view__field-url {
  padding-left: calc(var(--spacing) * 12);
}
.bookmark-detail-view__text-10 {
  font-family: var(--font-mono);
}
.bookmark-detail-view__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bookmark-detail-view__field-url {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bookmark-detail-view__field-text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bookmark-detail-view__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmark-detail-view__button-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmark-detail-view__text-5 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmark-detail-view__field-text-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmark-detail-view__button-add {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmark-detail-view__text-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmark-detail-view__button-3 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmark-detail-view__button-cancel {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmark-detail-view__button-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmark-detail-view__block-23 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmark-detail-view__block-24 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmark-detail-view__label-url {
  font-size: 11px;
}
.bookmark-detail-view__label-title {
  font-size: 11px;
}
.bookmark-detail-view__label-tags {
  font-size: 11px;
}
.bookmark-detail-view__button-5 {
  font-size: 11px;
}
.bookmark-detail-view__text-10 {
  font-size: 11px;
}
.bookmark-detail-view__text {
  --leading: calc(var(--spacing) * 6);
  line-height: calc(var(--spacing) * 6);
}
.bookmark-detail-view__block-23 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.bookmark-detail-view__label-url {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmark-detail-view__button {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmark-detail-view__button-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmark-detail-view__label-title {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmark-detail-view__label-tags {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmark-detail-view__button-add {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmark-detail-view__text-6 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmark-detail-view__text-7 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmark-detail-view__text-8 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmark-detail-view__button-5 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmark-detail-view__text-5 {
  --font-weight: var(--font-weight-normal);
  font-weight: var(--font-weight-normal);
}
.bookmark-detail-view__button-3 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.bookmark-detail-view__button-cancel {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.bookmark-detail-view__button-4 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.bookmark-detail-view__label-url {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.bookmark-detail-view__label-title {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.bookmark-detail-view__label-tags {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.bookmark-detail-view__block-23 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.bookmark-detail-view__text-10 {
  word-break: break-all;
}
.bookmark-detail-view__button-4 {
  color: var(--ui-black);
}
.bookmark-detail-view__check {
  color: var(--color-emerald-400);
}
.bookmark-detail-view__shield-check {
  color: var(--color-emerald-400);
}
.bookmark-detail-view__check-3 {
  color: var(--color-emerald-400);
}
.bookmark-detail-view__button-3 {
  color: var(--color-red-400);
}
.bookmark-detail-view__text-3 {
  color: var(--color-rose-500);
}
.bookmark-detail-view__main {
  color: var(--ui-zinc-100);
}
.bookmark-detail-view__field-url {
  color: var(--ui-zinc-100);
}
.bookmark-detail-view__field-text {
  color: var(--ui-zinc-100);
}
.bookmark-detail-view__field-text-2 {
  color: var(--ui-zinc-100);
}
.bookmark-detail-view__text-7 {
  color: var(--ui-zinc-100);
}
.bookmark-detail-view__text-8 {
  color: var(--ui-zinc-100);
}
.bookmark-detail-view__button {
  color: var(--ui-zinc-300);
}
.bookmark-detail-view__button-add {
  color: var(--ui-zinc-300);
}
.bookmark-detail-view__text-6 {
  color: var(--ui-zinc-300);
}
.bookmark-detail-view__button-cancel {
  color: var(--ui-zinc-300);
}
.bookmark-detail-view__text {
  color: var(--ui-zinc-400);
}
.bookmark-detail-view__button-5 {
  color: var(--ui-zinc-400);
}
.bookmark-detail-view__label-url {
  color: var(--ui-zinc-500);
}
.bookmark-detail-view__text-4 {
  color: var(--ui-zinc-500);
}
.bookmark-detail-view__button-2 {
  color: var(--ui-zinc-500);
}
.bookmark-detail-view__block-14 {
  color: var(--ui-zinc-500);
}
.bookmark-detail-view__label-title {
  color: var(--ui-zinc-500);
}
.bookmark-detail-view__text-5 {
  color: var(--ui-zinc-500);
}
.bookmark-detail-view__label-tags {
  color: var(--ui-zinc-500);
}
.bookmark-detail-view__tag {
  color: var(--ui-zinc-500);
}
.bookmark-detail-view__block-23 {
  color: var(--ui-zinc-500);
}
.bookmark-detail-view__text-9 {
  color: var(--ui-zinc-500);
}
.bookmark-detail-view__text-10 {
  color: var(--ui-zinc-500);
}
.bookmark-detail-view__button-remove-tag {
  color: var(--ui-zinc-600);
}
.bookmark-detail-view__text-created {
  color: var(--ui-zinc-600);
}
.bookmark-detail-view__text-last-updated {
  color: var(--ui-zinc-600);
}
.bookmark-detail-view__text-event-id {
  color: var(--ui-zinc-600);
}
.bookmark-detail-view__text-5 {
  text-transform: lowercase;
}
.bookmark-detail-view__label-url {
  text-transform: uppercase;
}
.bookmark-detail-view__label-title {
  text-transform: uppercase;
}
.bookmark-detail-view__label-tags {
  text-transform: uppercase;
}
.bookmark-detail-view__block-23 {
  text-transform: uppercase;
}
.bookmark-detail-view__status {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.bookmark-detail-view__form {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.bookmark-detail-view__button-4 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.bookmark-detail-view__button-4 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmark-detail-view__field-url {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmark-detail-view__field-text {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmark-detail-view__field-text-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmark-detail-view__button-add {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmark-detail-view__button-remove-tag {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmark-detail-view__button-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmark-detail-view__button-cancel {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmark-detail-view__field-url::placeholder {
  color: var(--ui-zinc-600);
}
.bookmark-detail-view__field-text::placeholder {
  color: var(--ui-zinc-600);
}
.bookmark-detail-view__field-text-2::placeholder {
  color: var(--ui-zinc-600);
}
.bookmark-detail-view__field-url:focus {
  border-color: var(--ui-zinc-600);
}
.bookmark-detail-view__field-text:focus {
  border-color: var(--ui-zinc-600);
}
.bookmark-detail-view__field-text-2:focus {
  border-color: var(--ui-zinc-600);
}
.bookmark-detail-view__field-url:focus {
  --outline-style: none;
  outline-style: none;
}
.bookmark-detail-view__field-text:focus {
  --outline-style: none;
  outline-style: none;
}
.bookmark-detail-view__field-text-2:focus {
  --outline-style: none;
  outline-style: none;
}
.bookmark-detail-view__button-4:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.bookmark-detail-view__button-add:disabled {
  opacity: .4;
}
.bookmark-detail-view__button-4:disabled {
  opacity: .5;
}
[data-theme="light"] .bookmark-detail-view__check {
  color: var(--app-success);
}
[data-theme="light"] .bookmark-detail-view__shield-check {
  color: var(--app-success);
}
[data-theme="light"] .bookmark-detail-view__check-3 {
  color: var(--app-success);
}
[data-theme="light"] .bookmark-detail-view__button-3 {
  color: var(--app-danger);
}
[data-theme="light"] .bookmark-detail-view__button {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmark-detail-view__button-add {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmark-detail-view__text-6 {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmark-detail-view__button-cancel {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmark-detail-view__text {
  color: var(--app-muted);
}
[data-theme="light"] .bookmark-detail-view__button-5 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmark-detail-view__label-url {
  color: var(--app-muted);
}
[data-theme="light"] .bookmark-detail-view__text-4 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmark-detail-view__button-2 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmark-detail-view__block-14 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmark-detail-view__label-title {
  color: var(--app-muted);
}
[data-theme="light"] .bookmark-detail-view__text-5 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmark-detail-view__label-tags {
  color: var(--app-muted);
}
[data-theme="light"] .bookmark-detail-view__tag {
  color: var(--app-muted);
}
[data-theme="light"] .bookmark-detail-view__block-23 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmark-detail-view__text-9 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmark-detail-view__text-10 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmark-detail-view__button-remove-tag {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmark-detail-view__text-created {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmark-detail-view__text-last-updated {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmark-detail-view__text-event-id {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmark-detail-view__button-2:hover {
  color: var(--app-text) !important;
}
}
}
</style>
