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
} from "@/icons";
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
  <main class="bookmark-page">
    <div class="bookmark-page__inner">
      <PageHeader
        :eyebrow="isNew ? 'New bookmark' : 'Encrypted bookmark'"
        :title="isNew ? 'Add bookmark' : form.title || currentHostname || 'Bookmark details'"
      >
        <p class="bookmark-page__lede">
          {{
            isNew
              ? "Save an encrypted web bookmark directly to your chosen relays."
              : "Stored securely with end-to-end encryption. Only your keys can decrypt this bookmark."
          }}
        </p>
      </PageHeader>

      <AppAlertBanner v-if="error" :message="error" />

      <!-- Loading State -->
      <div v-if="isLoading" class="bookmark-loading" role="status">
        <span class="bookmark-loading__label">Fetching encrypted bookmark…</span>
        <AppSkeleton class="bookmark-loading__line" />
        <AppSkeleton class="bookmark-loading__line bookmark-loading__line--short" />
        <AppSkeleton class="bookmark-loading__block" />
      </div>

      <template v-else>
        <form class="bookmark-sheet" @submit.prevent="handleSave">
          <!-- URL -->
          <div class="bookmark-field">
            <div class="bookmark-field__head">
              <label class="bookmark-label" for="bookmark-url">
                URL <span class="bookmark-label__required">*</span>
              </label>
              <div v-if="form.url" class="bookmark-field__tools">
                <button type="button" class="bookmark-linkbtn" @click="openExternalUrl">
                  <ExternalLink class="bookmark-linkbtn__icon" :stroke-width="1.9" aria-hidden="true" />
                  <span>Open link</span>
                </button>
                <span class="bookmark-field__dot" aria-hidden="true">·</span>
                <button type="button" class="bookmark-linkbtn" @click="copyUrl">
                  <Check v-if="copiedUrl" class="bookmark-linkbtn__icon bookmark-linkbtn__icon--success" aria-hidden="true" />
                  <Copy v-else class="bookmark-linkbtn__icon" :stroke-width="1.9" aria-hidden="true" />
                  <span>{{ copiedUrl ? "Copied" : "Copy" }}</span>
                </button>
              </div>
            </div>

            <div class="bookmark-input-group">
              <span class="bookmark-favicon" aria-hidden="true">
                <img
                  v-if="currentFaviconUrl && !faviconFailed"
                  :src="currentFaviconUrl"
                  class="bookmark-favicon__img"
                  alt=""
                  @error="faviconFailed = true"
                />
                <Globe v-else class="bookmark-favicon__icon" :stroke-width="1.8" />
              </span>
              <input
                id="bookmark-url"
                v-model="form.url"
                type="url"
                required
                placeholder="https://example.com/article"
                class="bookmark-input bookmark-input--url"
              />
            </div>
          </div>

          <!-- Title -->
          <div class="bookmark-field">
            <label class="bookmark-label" for="bookmark-title">
              Title <span class="bookmark-label__optional">(optional)</span>
            </label>
            <input
              id="bookmark-title"
              v-model="form.title"
              type="text"
              placeholder="Descriptive title or note"
              class="bookmark-input"
            />
          </div>

          <!-- Tags -->
          <div class="bookmark-field">
            <label class="bookmark-label" for="bookmark-tag">Tags</label>
            <div class="bookmark-tag-row">
              <div class="bookmark-input-group bookmark-input-group--tag">
                <Tag class="bookmark-tag-icon" :stroke-width="1.8" aria-hidden="true" />
                <input
                  id="bookmark-tag"
                  v-model="tagDraft"
                  type="text"
                  placeholder="Add tag (e.g. dev, reading, tools) and press Enter…"
                  class="bookmark-input bookmark-input--tag"
                  @keydown.enter.prevent="addTagFromDraft"
                  @keydown.comma.prevent="addTagFromDraft"
                />
              </div>
              <button
                type="button"
                :disabled="!tagDraft.trim()"
                class="bookmark-btn"
                @click="addTagFromDraft"
              >
                Add
              </button>
            </div>

            <div v-if="form.tags.length" class="bookmark-tags">
              <span v-for="tag in form.tags" :key="tag" class="bookmark-tag">
                <span>#{{ tag }}</span>
                <button
                  type="button"
                  class="bookmark-tag__remove"
                  title="Remove tag"
                  :aria-label="`Remove ${tag}`"
                  @click="removeTag(tag)"
                >
                  <X class="bookmark-tag__x" :stroke-width="2" aria-hidden="true" />
                </button>
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="bookmark-actions">
            <button
              v-if="!isNew"
              type="button"
              class="bookmark-btn bookmark-btn--danger"
              @click="showDeleteConfirm = true"
            >
              <Trash2 class="bookmark-btn__icon" :stroke-width="1.9" aria-hidden="true" />
              <span>Delete</span>
            </button>

            <div class="bookmark-actions__end">
              <button type="button" class="bookmark-btn" @click="router.push('/bookmarks')">
                Cancel
              </button>
              <button type="submit" :disabled="isSaving" class="bookmark-btn bookmark-btn--ink">
                <LoaderCircle v-if="isSaving" class="bookmark-btn__icon bookmark-btn__icon--spin" aria-hidden="true" />
                <Check v-else class="bookmark-btn__icon" :stroke-width="2.2" aria-hidden="true" />
                <span>{{ isNew ? "Save bookmark" : "Save changes" }}</span>
              </button>
            </div>
          </div>
        </form>

        <!-- Metadata -->
        <section v-if="!isNew && bookmarkItem" class="bookmark-meta">
          <div class="bookmark-meta__head">
            <ShieldCheck class="bookmark-meta__icon" :stroke-width="1.8" aria-hidden="true" />
            <span>Encrypted storage details</span>
          </div>

          <dl class="bookmark-meta__grid">
            <div class="bookmark-meta__item">
              <dt>Created</dt>
              <dd>{{ formatDate(bookmarkItem.createdAt) }}</dd>
            </div>

            <div class="bookmark-meta__item">
              <dt>Last updated</dt>
              <dd>{{ formatDate(bookmarkItem.updatedAt) }}</dd>
            </div>

            <div v-if="bookmarkItem.eventId" class="bookmark-meta__item bookmark-meta__item--wide">
              <div class="bookmark-meta__event-head">
                <dt>Event ID</dt>
                <div class="bookmark-meta__tools">
                  <button type="button" class="bookmark-linkbtn" @click="copyEventId(bookmarkItem.eventId)">
                    <Check
                      v-if="copiedEventId"
                      class="bookmark-linkbtn__icon bookmark-linkbtn__icon--success"
                      aria-hidden="true"
                    />
                    <Copy v-else class="bookmark-linkbtn__icon" :stroke-width="1.9" aria-hidden="true" />
                    <span>{{ copiedEventId ? "Copied" : "Copy ID" }}</span>
                  </button>
                  <span class="bookmark-field__dot" aria-hidden="true">·</span>
                  <RelayEventLink :event-id="bookmarkItem.eventId" />
                </div>
              </div>
              <dd class="bookmark-meta__event-id">{{ bookmarkItem.eventId }}</dd>
            </div>
          </dl>
        </section>
      </template>
    </div>

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
/* Ledger pass: one bookmark sheet with a favicon register and mono controls. */

.bookmark-page {
  min-height: 100dvh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.bookmark-page__inner {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  width: 100%;
  max-width: 700px;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.bookmark-page__lede {
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.bookmark-loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
}

.bookmark-loading__label {
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

.bookmark-loading__line {
  display: block;
  height: 12px;
  border-radius: 3px;
}

.bookmark-loading__line--short {
  width: 52%;
}

.bookmark-loading__block {
  display: block;
  height: 40px;
  border-radius: var(--app-radius-sm);
}

.bookmark-sheet {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}

.bookmark-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bookmark-field__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-2);
}

.bookmark-field__tools {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.bookmark-field__dot {
  color: var(--app-border-strong);
}

.bookmark-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

.bookmark-label__required {
  color: var(--app-danger);
}

.bookmark-label__optional {
  color: var(--app-muted-2);
  text-transform: none;
  letter-spacing: 0.02em;
}

.bookmark-linkbtn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.bookmark-linkbtn__icon {
  width: 11px;
  height: 11px;
}

.bookmark-linkbtn__icon--success {
  color: var(--app-success);
}

.bookmark-input-group {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.bookmark-input-group:focus-within {
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.bookmark-input-group--tag {
  flex: 1;
  padding-left: 34px;
  position: relative;
}

.bookmark-favicon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  overflow: hidden;
}

.bookmark-favicon__img {
  width: 14px;
  height: 14px;
  object-fit: contain;
}

.bookmark-favicon__icon {
  width: 12px;
  height: 12px;
  color: var(--app-muted-2);
}

.bookmark-input {
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-size: var(--app-text-body);
  color: var(--app-text);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.bookmark-input--url {
  padding-left: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.bookmark-input--url:focus {
  outline: none;
  box-shadow: none;
}

.bookmark-input--tag {
  padding-left: 0;
  border: 0;
  background: transparent;
}

.bookmark-input--tag:focus {
  outline: none;
  box-shadow: none;
}

.bookmark-input::placeholder {
  color: var(--app-muted-2);
}

.bookmark-input:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.bookmark-tag-icon {
  position: absolute;
  top: 50%;
  left: 12px;
  width: 13px;
  height: 13px;
  transform: translateY(-50%);
  color: var(--app-muted-2);
  pointer-events: none;
}

.bookmark-tag-row {
  display: flex;
  gap: 8px;
}

.bookmark-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 4px;
}

.bookmark-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  background: var(--app-surface-soft);
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
}

.bookmark-tag__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
}

.bookmark-tag__x {
  width: 9px;
  height: 9px;
}

.bookmark-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
  padding-top: var(--app-space-4);
  border-top: 1px solid var(--app-border);
}

.bookmark-actions__end {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: auto;
}

.bookmark-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding-inline: 11px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.bookmark-btn__icon {
  width: 12px;
  height: 12px;
}

.bookmark-btn__icon--spin {
  animation: var(--animate-spin);
}

.bookmark-btn:active {
  transform: translateY(1px);
}

.bookmark-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.bookmark-btn--ink {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.bookmark-btn--danger {
  border-color: color-mix(in oklab, var(--app-danger) 28%, var(--app-border));
  color: var(--app-danger);
}

.bookmark-meta {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  animation: ledger-rise 420ms var(--app-ease-emphasized) 60ms both;
}

.bookmark-meta__head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.bookmark-meta__icon {
  width: 12px;
  height: 12px;
  color: var(--app-success);
}

.bookmark-meta__grid {
  display: grid;
  grid-template-columns: 1fr;
  margin: 0;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  overflow: hidden;
}

.bookmark-meta__item {
  padding: 11px 12px;
}

.bookmark-meta__item + .bookmark-meta__item {
  border-top: 1px solid var(--app-border);
}

.bookmark-meta__item dt {
  margin: 0 0 4px;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.bookmark-meta__item dd {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-soft);
}

.bookmark-meta__event-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.bookmark-meta__event-head dt {
  margin: 0;
}

.bookmark-meta__tools {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.bookmark-meta__event-id {
  margin-top: 6px !important;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted);
  overflow-wrap: anywhere;
}

@media (min-width: 40rem) {
  .bookmark-page__inner {
    padding-inline: var(--app-space-6);
  }

  .bookmark-sheet,
  .bookmark-meta {
    padding: var(--app-space-6);
  }

  .bookmark-meta__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bookmark-meta__item + .bookmark-meta__item {
    border-top: 0;
  }

  .bookmark-meta__item:nth-child(even) {
    border-left: 1px solid var(--app-border);
  }

  .bookmark-meta__item:nth-child(n + 3) {
    border-top: 1px solid var(--app-border);
  }

  .bookmark-meta__item--wide {
    grid-column: 1 / -1;
    border-left: 0;
  }
}

@media (max-width: 26rem) {
  .bookmark-tag-row {
    flex-wrap: wrap;
  }

  .bookmark-tag-row .bookmark-btn {
    width: 100%;
  }
}

@media (hover: hover) {
  .bookmark-btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .bookmark-btn--ink:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .bookmark-btn--danger:hover {
    border-color: var(--app-danger);
    background: var(--app-danger-soft);
    color: var(--app-danger);
  }

  .bookmark-linkbtn:hover {
    color: var(--app-text);
  }

  .bookmark-tag__remove:hover {
    color: var(--app-danger);
  }
}

@media (pointer: coarse) {
  .bookmark-btn,
  .bookmark-linkbtn,
  .bookmark-tag__remove {
    min-height: var(--app-touch-h);
  }

  .bookmark-tag__remove {
    min-width: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bookmark-page,
  .bookmark-sheet,
  .bookmark-meta {
    animation: none;
  }

  .bookmark-btn,
  .bookmark-input,
  .bookmark-input-group,
  .bookmark-linkbtn {
    transition: none;
  }
}
</style>
