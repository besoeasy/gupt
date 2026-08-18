<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Bookmark,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  Loader2,
  Globe,
  Tag,
  ShieldCheck,
  X,
} from "@lucide/vue";
import PageBackHeader from "@/components/PageBackHeader.vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
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

function getNjumpUrl(eventId) {
  if (!eventId) return "";
  return `https://njump.me/e/${eventId}`;
}

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
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) pb-16 lg:h-full"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-6">
        <PageBackHeader
          back-to="/bookmarks"
          back-label="Bookmarks"
          :eyebrow="isNew ? 'New Bookmark' : 'Encrypted Bookmark'"
          :title="isNew ? 'Add Bookmark' : form.title || currentHostname || 'Bookmark Details'"
        >
          <p class="text-sm leading-6 text-(--app-muted)">
            {{
              isNew
                ? "Save an encrypted web bookmark directly to your chosen relays."
                : "Stored securely with end-to-end encryption. Only your keys can decrypt this bookmark."
            }}
          </p>
        </PageBackHeader>

        <AppAlertBanner v-if="error" :message="error" />

        <!-- Loading State -->
        <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 text-center">
          <Loader2 class="h-8 w-8 animate-spin text-(--app-primary)" />
          <p class="mt-3 text-sm text-(--app-muted)">Fetching encrypted bookmark…</p>
        </div>

        <template v-else>
          <!-- Main Form Card -->
          <form
            class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-5 sm:p-7 shadow-sm space-y-6"
            @submit.prevent="handleSave"
          >
            <!-- URL Input -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="block text-xs font-bold uppercase tracking-wider text-(--app-text)">
                  URL <span class="text-rose-500">*</span>
                </label>
                <div v-if="form.url" class="flex items-center gap-2">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 text-xs font-semibold text-(--app-primary) hover:underline cursor-pointer"
                    @click="openExternalUrl"
                  >
                    <ExternalLink class="h-3.5 w-3.5" />
                    <span>Open link</span>
                  </button>
                  <span class="text-(--app-muted)">·</span>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 text-xs font-semibold text-(--app-muted) hover:text-(--app-text) cursor-pointer"
                    @click="copyUrl"
                  >
                    <Check v-if="copiedUrl" class="h-3.5 w-3.5 text-emerald-400" />
                    <Copy v-else class="h-3.5 w-3.5" />
                    <span>{{ copiedUrl ? "Copied" : "Copy" }}</span>
                  </button>
                </div>
              </div>

              <div class="relative flex items-center">
                <div
                  class="pointer-events-none absolute left-3.5 flex h-6 w-6 items-center justify-center rounded-lg bg-(--app-surface-soft) text-(--app-muted)"
                >
                  <img
                    v-if="currentFaviconUrl && !faviconFailed"
                    :src="currentFaviconUrl"
                    class="h-4 w-4 rounded-sm object-contain"
                    alt=""
                    @error="faviconFailed = true"
                  />
                  <Globe v-else class="h-3.5 w-3.5" />
                </div>
                <input
                  v-model="form.url"
                  type="url"
                  required
                  placeholder="https://example.com/article"
                  class="block w-full rounded-2xl border border-(--app-border) bg-(--app-surface-soft) pl-12 pr-4 py-3 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors"
                />
              </div>
            </div>

            <!-- Title Input -->
            <div class="space-y-2">
              <label class="block text-xs font-bold uppercase tracking-wider text-(--app-text)">
                Title
                <span class="text-xs font-normal lowercase text-(--app-muted)">(optional)</span>
              </label>
              <input
                v-model="form.title"
                type="text"
                placeholder="Descriptive title or note"
                class="block w-full rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors"
              />
            </div>

            <!-- Tags Input -->
            <div class="space-y-3">
              <label class="block text-xs font-bold uppercase tracking-wider text-(--app-text)">
                Tags
              </label>

              <!-- Tag draft input -->
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <Tag
                    class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-(--app-muted)"
                  />
                  <input
                    v-model="tagDraft"
                    type="text"
                    placeholder="Add tag (e.g. dev, reading, tools) and press Enter…"
                    class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) pl-10 pr-4 py-2 text-xs text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors"
                    @keydown.enter.prevent="addTagFromDraft"
                    @keydown.comma.prevent="addTagFromDraft"
                  />
                </div>
                <button
                  type="button"
                  :disabled="!tagDraft.trim()"
                  class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2 text-xs font-semibold text-(--app-text) hover:bg-(--app-surface-hover) disabled:opacity-40 transition-colors cursor-pointer"
                  @click="addTagFromDraft"
                >
                  Add
                </button>
              </div>

              <!-- Tag chips -->
              <div v-if="form.tags.length" class="flex flex-wrap gap-2 pt-1">
                <span
                  v-for="tag in form.tags"
                  :key="tag"
                  class="inline-flex items-center gap-1.5 rounded-full border border-(--app-border) bg-(--app-surface-soft) px-3 py-1 text-xs font-semibold text-(--app-text)"
                >
                  <span>{{ tag }}</span>
                  <button
                    type="button"
                    class="text-(--app-muted) hover:text-rose-400 transition-colors cursor-pointer"
                    title="Remove tag"
                    @click="removeTag(tag)"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            </div>

            <!-- Actions buttons -->
            <div
              class="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 border-t border-(--app-border) pt-5"
            >
              <div class="flex items-center gap-2 w-full sm:w-auto">
                <button
                  v-if="!isNew"
                  type="button"
                  class="inline-flex h-10 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  @click="showDeleteConfirm = true"
                >
                  <Trash2 class="h-4 w-4" />
                  <span>Delete</span>
                </button>
              </div>

              <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  class="inline-flex h-10 flex-1 sm:flex-initial items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 text-xs font-semibold text-(--app-text-soft) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors cursor-pointer"
                  @click="router.push('/bookmarks')"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  :disabled="isSaving"
                  class="inline-flex h-10 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl bg-(--app-primary) px-6 text-xs font-bold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  <Loader2 v-if="isSaving" class="h-4 w-4 animate-spin" />
                  <Check v-else class="h-4 w-4" />
                  <span>{{ isNew ? "Save Bookmark" : "Save Changes" }}</span>
                </button>
              </div>
            </div>
          </form>

          <!-- Metadata info section (when viewing existing bookmark) -->
          <section
            v-if="!isNew && bookmarkItem"
            class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-5 sm:p-6 space-y-4"
          >
            <div
              class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-(--app-muted)"
            >
              <ShieldCheck class="h-4 w-4 text-emerald-400" />
              <span>Encrypted Storage Details</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div
                class="space-y-1 rounded-2xl bg-(--app-surface-soft) p-3.5 border border-(--app-border)/60"
              >
                <p class="text-(--app-muted)">Created</p>
                <p class="font-medium text-(--app-text)">
                  {{ formatDate(bookmarkItem.createdAt) }}
                </p>
              </div>

              <div
                class="space-y-1 rounded-2xl bg-(--app-surface-soft) p-3.5 border border-(--app-border)/60"
              >
                <p class="text-(--app-muted)">Last Updated</p>
                <p class="font-medium text-(--app-text)">
                  {{ formatDate(bookmarkItem.updatedAt) }}
                </p>
              </div>

              <div
                v-if="bookmarkItem.eventId"
                class="sm:col-span-2 space-y-1.5 rounded-2xl bg-(--app-surface-soft) p-3.5 border border-(--app-border)/60"
              >
                <div class="flex items-center justify-between">
                  <p class="text-(--app-muted)">Event ID</p>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-[11px] font-semibold text-(--app-primary) hover:underline cursor-pointer"
                      @click="copyEventId(bookmarkItem.eventId)"
                    >
                      <Check v-if="copiedEventId" class="h-3 w-3 text-emerald-400" />
                      <Copy v-else class="h-3 w-3" />
                      <span>{{ copiedEventId ? "Copied" : "Copy ID" }}</span>
                    </button>
                    <span class="text-(--app-muted)">·</span>
                    <a
                      :href="getNjumpUrl(bookmarkItem.eventId)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 text-[11px] font-semibold text-(--app-muted) hover:text-(--app-text)"
                    >
                      <ExternalLink class="h-3 w-3" />
                      <span>njump</span>
                    </a>
                  </div>
                </div>
                <p class="font-mono text-[11px] text-(--app-muted) break-all">
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
