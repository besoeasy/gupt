<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import {
  Bookmark,
  Trash2,
  Loader2,
  RefreshCw,
  Search,
  ExternalLink,
  Plus,
  X,
  Pencil,
  Copy,
  Check,
  Globe,
  Tag,
  Calendar,
  ShieldCheck,
  Clock,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import { useIdentityStore } from "@/stores/identity";
import { copyToClipboard } from "@/lib/clipboard";
import {
  getBookmarksCached,
  fetchBookmarks,
  saveBookmark,
  deleteBookmark,
  renewExpiringBookmarks,
  bookmarkHostname,
  normalizeBookmarkTags,
  parseBookmarkTagsInput,
} from "@/lib/bookmarks";

const identity = useIdentityStore();
const isLoading = ref(true);
const isRefreshing = ref(false);
const isSaving = ref(false);
const items = ref([]);
const searchQuery = ref("");
const activeTag = ref("all");
const error = ref("");
const pendingDelete = ref(null);

const isDesktop = ref(
  typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
);
let mediaQueryList = null;

function handleMediaChange(e) {
  isDesktop.value = e.matches;
}

const selectedItem = ref(null);
const isCreating = ref(false);
const editingId = ref(null);

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

const faviconErrors = ref({});

function onFaviconError(id) {
  faviconErrors.value[id] = true;
}

function getFaviconUrl(url) {
  const host = bookmarkHostname(url);
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

const showBookmarkletHint = ref(false);
let bookmarkletHintTimer = null;

const BOOKMARKLET_HREF = `javascript:(()=>{const raw=prompt('Tags (comma-separated, optional)\\nExample: work,read later','');if(raw===null)return;const tags=raw.split(',').map(function(s){return s.trim().toLowerCase().replace(/\\s+/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'').slice(0,32)}).filter(Boolean);const u=encodeURIComponent(location.href),og=document.querySelector('meta[property="og:title"]')?.content?.trim(),t=encodeURIComponent((og||document.title||(document.querySelector('h1')?.innerText||'').trim()).slice(0,200)),q=tags.map(function(tag){return 'tags='+encodeURIComponent(tag)}).join('&');open('${window.location.origin}/#/hotlink/bookmark?url='+u+'&title='+t+(q?'&'+q:''),'_blank','noopener,noreferrer')})()`;

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
      (item.url && item.url.toLowerCase().includes(q)) ||
      bookmarkHostname(item.url).toLowerCase().includes(q) ||
      (item.tags || []).some((t) => t.includes(q))
    );
  });
});

onMounted(async () => {
  if (typeof window !== "undefined") {
    mediaQueryList = window.matchMedia("(min-width: 1024px)");
    mediaQueryList.addEventListener("change", handleMediaChange);
  }
  await loadItems();
});

onUnmounted(() => {
  if (mediaQueryList) mediaQueryList.removeEventListener("change", handleMediaChange);
  if (bookmarkletHintTimer) clearTimeout(bookmarkletHintTimer);
  if (copyUrlTimer) clearTimeout(copyUrlTimer);
  if (copyEventTimer) clearTimeout(copyEventTimer);
});

function onBookmarkletClick(event) {
  event.preventDefault();
  showBookmarkletHint.value = true;
  if (bookmarkletHintTimer) clearTimeout(bookmarkletHintTimer);
  bookmarkletHintTimer = setTimeout(() => {
    showBookmarkletHint.value = false;
    bookmarkletHintTimer = null;
  }, 4500);
}

async function loadItems() {
  const cached = await getBookmarksCached(identity.privkeyHex, identity.pubkeyHex);
  if (cached) {
    items.value = cached.items;
    isLoading.value = false;
    if (isDesktop.value && items.value.length > 0 && !selectedItem.value) {
      selectedItem.value = items.value[0];
    }
    if (!cached.fresh) refreshFromRelay();
    return;
  }
  isLoading.value = true;
  await refreshFromRelay();
}

async function refreshFromRelay() {
  isRefreshing.value = true;
  try {
    let next = await fetchBookmarks(identity.privkeyHex, identity.pubkeyHex);
    next = await renewExpiringBookmarks(identity.privkeyHex, identity.pubkeyHex, next);
    items.value = next;
    if (isDesktop.value && items.value.length > 0 && !selectedItem.value) {
      selectedItem.value = items.value[0];
    }
  } catch (err) {
    console.error("Failed to load bookmarks:", err);
    error.value = err?.message || "Failed to load bookmarks.";
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
}

function selectItem(item) {
  selectedItem.value = item;
  isCreating.value = false;
  editingId.value = null;
}

function openCreateForm() {
  isCreating.value = true;
  editingId.value = null;
  form.value = { title: "", url: "", tags: [] };
  tagDraft.value = "";
  error.value = "";
}

function openEditForm(item) {
  isCreating.value = false;
  editingId.value = item.id;
  form.value = {
    title: item.title || "",
    url: item.url || "",
    tags: [...(item.tags || [])],
  };
  tagDraft.value = "";
  error.value = "";
}

function closeForm() {
  isCreating.value = false;
  editingId.value = null;
  form.value = { title: "", url: "", tags: [] };
  tagDraft.value = "";
}

function addTagFromDraft() {
  const next = normalizeBookmarkTags([
    ...form.value.tags,
    ...parseBookmarkTagsInput(tagDraft.value),
  ]);
  form.value.tags = next;
  tagDraft.value = "";
}

function removeFormTag(tag) {
  form.value.tags = form.value.tags.filter((t) => t !== tag);
}

async function handleSave() {
  if (isSaving.value) return;
  if (tagDraft.value.trim()) addTagFromDraft();
  isSaving.value = true;
  error.value = "";
  try {
    const saved = await saveBookmark(
      identity.privkeyHex,
      identity.pubkeyHex,
      {
        title: form.value.title,
        url: form.value.url,
        tags: form.value.tags,
      },
      items.value,
    );
    items.value = [saved, ...items.value.filter((b) => b.id !== saved.id)].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    );
    selectedItem.value = saved;
    closeForm();
  } catch (err) {
    error.value = err?.message || "Failed to save bookmark.";
  } finally {
    isSaving.value = false;
  }
}

function openBookmark(item) {
  if (!item?.url) return;
  window.open(item.url, "_blank", "noopener,noreferrer");
}

async function copyUrl(url) {
  if (!url) return;
  await copyToClipboard(url);
  copiedUrl.value = true;
  if (copyUrlTimer) clearTimeout(copyUrlTimer);
  copyUrlTimer = setTimeout(() => {
    copiedUrl.value = false;
  }, 1800);
}

async function copyEventId(eventId) {
  if (!eventId) return;
  await copyToClipboard(eventId);
  copiedEventId.value = true;
  if (copyEventTimer) clearTimeout(copyEventTimer);
  copyEventTimer = setTimeout(() => {
    copiedEventId.value = false;
  }, 1800);
}

function getNjumpUrl(item) {
  if (!item?.eventId) return "";
  return `https://njump.me/e/${item.eventId}`;
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function handleDelete(item) {
  pendingDelete.value = item;
}

async function confirmDelete() {
  const item = pendingDelete.value;
  if (!item) return;
  pendingDelete.value = null;
  try {
    error.value = "";
    await deleteBookmark(identity.privkeyHex, identity.pubkeyHex, item);
    items.value = items.value.filter((b) => b.id !== item.id);
    if (selectedItem.value?.id === item.id) {
      selectedItem.value = items.value[0] || null;
    }
    if (editingId.value === item.id) {
      closeForm();
    }
  } catch (err) {
    error.value = err?.message || "Failed to delete bookmark.";
  }
}
</script>

<template>
  <main class="h-full w-full bg-(--app-bg) text-(--app-text) overflow-hidden">
    <!-- Desktop Split View (>= 1024px) -->
    <div v-if="isDesktop" class="flex h-full w-full overflow-hidden">
      <!-- Left Master List Pane -->
      <aside
        class="flex h-full w-80 xl:w-96 shrink-0 flex-col border-r border-(--app-border) bg-(--app-surface)/40"
      >
        <!-- Master Header -->
        <div class="flex flex-col gap-3 p-4 border-b border-(--app-border)">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <div
                class="flex h-8 w-8 items-center justify-center rounded-xl bg-(--app-primary)/10 text-(--app-primary)"
              >
                <Bookmark class="h-4 w-4" />
              </div>
              <h1 class="text-base font-bold tracking-tight">Bookmarks</h1>
              <span class="text-xs text-(--app-muted) font-mono tabular-nums">
                ({{ items.length }})
              </span>
            </div>

            <div class="flex items-center gap-1.5">
              <div class="group relative">
                <a
                  :href="BOOKMARKLET_HREF"
                  draggable="true"
                  class="inline-flex h-8 cursor-grab items-center gap-1 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-2 text-[11px] font-semibold text-(--app-text) transition-colors hover:bg-(--app-surface-hover) active:cursor-grabbing"
                  @click="onBookmarkletClick"
                  title="Drag to bookmarks bar"
                >
                  <Bookmark class="h-3 w-3 text-(--app-primary)" />
                  gupt-mark
                </a>
                <div
                  class="pointer-events-none absolute right-0 top-full z-30 mt-2 w-52 rounded-xl border border-(--app-border) bg-(--app-surface) p-2 text-[11px] leading-tight text-(--app-text-soft) shadow-xl"
                  :class="showBookmarkletHint ? 'block' : 'hidden group-hover:block'"
                >
                  Don't click — <span class="font-semibold text-(--app-text)">drag</span> gupt-mark
                  to your bookmarks bar.
                </div>
              </div>

              <button
                type="button"
                :disabled="isRefreshing"
                class="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-50"
                title="Sync from relays"
                @click="refreshFromRelay"
              >
                <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': isRefreshing }" />
              </button>

              <button
                type="button"
                class="inline-flex h-8 items-center gap-1 rounded-xl bg-(--app-primary) px-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-95"
                title="Add bookmark"
                @click="openCreateForm"
              >
                <Plus class="h-3.5 w-3.5" />
                <span>New</span>
              </button>
            </div>
          </div>

          <!-- Search Input -->
          <div class="relative">
            <Search
              class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-(--app-muted)"
            />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search title, url, tags…"
              class="h-9 w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) pl-8.5 pr-8 text-xs text-(--app-text) placeholder:text-(--app-muted) focus:border-(--app-primary) focus:outline-none transition-colors"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--app-muted) hover:text-(--app-text)"
              @click="searchQuery = ''"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>

          <!-- Tag Chips -->
          <div v-if="allTags.length" class="flex gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
            <button
              type="button"
              class="rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors"
              :class="
                activeTag === 'all'
                  ? 'bg-(--app-primary) text-white'
                  : 'bg-(--app-surface-soft) text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
              "
              @click="activeTag = 'all'"
            >
              All
            </button>
            <button
              v-for="tagInfo in allTags"
              :key="tagInfo.tag"
              type="button"
              class="rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors"
              :class="
                activeTag === tagInfo.tag
                  ? 'bg-(--app-primary) text-white'
                  : 'bg-(--app-surface-soft) text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
              "
              @click="activeTag = tagInfo.tag"
            >
              {{ tagInfo.tag }}
              <span class="ml-1 opacity-60">{{ tagInfo.count }}</span>
            </button>
          </div>
        </div>

        <!-- Bookmark Cards List -->
        <div class="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          <!-- Shimmer Skeleton Loading State -->
          <div v-if="isLoading" class="space-y-1.5 p-1">
            <div
              v-for="n in 6"
              :key="n"
              class="flex items-center gap-3 rounded-xl border border-(--app-border)/40 p-3 bg-(--app-surface-soft)/30"
            >
              <div class="h-8 w-8 shrink-0 rounded-lg skeleton-shimmer" />
              <div class="min-w-0 flex-1 space-y-2">
                <div class="h-3.5 w-3/4 rounded-md skeleton-shimmer" />
                <div class="h-2.5 w-1/2 rounded-md skeleton-shimmer" />
              </div>
            </div>
          </div>

          <div
            v-else-if="items.length === 0"
            class="flex flex-col items-center justify-center py-16 px-4 text-center"
          >
            <Bookmark class="mb-2 h-8 w-8 text-(--app-muted)" :stroke-width="1.5" />
            <p class="text-xs font-semibold text-(--app-text)">No bookmarks yet</p>
            <p class="mt-1 text-[11px] text-(--app-muted)">Save encrypted links & bookmarks.</p>
          </div>

          <div
            v-else-if="filteredItems.length === 0"
            class="py-12 text-center text-xs text-(--app-muted)"
          >
            No matching bookmarks found.
          </div>

          <template v-else>
            <div
              v-for="item in filteredItems"
              :key="item.id"
              class="group relative flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all duration-150"
              :class="
                selectedItem?.id === item.id && !isCreating
                  ? 'border-(--app-primary) bg-(--app-surface-soft) shadow-sm'
                  : 'border-transparent hover:border-(--app-border) hover:bg-(--app-surface-soft)/50'
              "
              @click="selectItem(item)"
            >
              <!-- Favicon / Domain Icon -->
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface) overflow-hidden"
              >
                <img
                  v-if="getFaviconUrl(item.url) && !faviconErrors[item.id]"
                  :src="getFaviconUrl(item.url)"
                  alt=""
                  class="h-4.5 w-4.5 object-contain"
                  loading="lazy"
                  @error="onFaviconError(item.id)"
                />
                <Globe v-else class="h-4 w-4 text-(--app-muted)" />
              </div>

              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-semibold text-(--app-text)">
                  {{ item.title || bookmarkHostname(item.url) }}
                </p>
                <p class="truncate text-[11px] text-(--app-muted) mt-0.5">
                  {{ bookmarkHostname(item.url) }}
                </p>

                <div v-if="(item.tags || []).length" class="flex flex-wrap gap-1 mt-1.5">
                  <span
                    v-for="t in (item.tags || []).slice(0, 3)"
                    :key="t"
                    class="rounded-md bg-(--app-surface) px-1.5 py-0.5 text-[10px] text-(--app-muted) border border-(--app-border)/60"
                  >
                    {{ t }}
                  </span>
                  <span
                    v-if="(item.tags || []).length > 3"
                    class="text-[10px] text-(--app-muted) self-center"
                  >
                    +{{ item.tags.length - 3 }}
                  </span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </aside>

      <!-- Right Detail & Editor Pane -->
      <section class="flex-1 min-h-0 flex flex-col bg-(--app-bg) overflow-hidden">
        <AppAlertBanner v-if="error" :message="error" class="m-4" />

        <!-- Form Mode (Create or Edit) -->
        <div
          v-if="isCreating || editingId"
          class="flex-1 min-h-0 flex flex-col overflow-y-auto p-6 lg:p-8"
        >
          <div class="mx-auto w-full max-w-2xl space-y-6">
            <div class="flex items-center justify-between border-b border-(--app-border) pb-4">
              <div class="flex items-center gap-2.5">
                <div
                  class="flex h-9 w-9 items-center justify-center rounded-xl bg-(--app-primary)/10 text-(--app-primary)"
                >
                  <Bookmark class="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 class="text-base font-bold">
                    {{ isCreating ? "Add Bookmark" : "Edit Bookmark" }}
                  </h2>
                  <p class="text-xs text-(--app-muted)">
                    Stored encrypted on your chosen Nostr relays.
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-1.5 text-xs font-semibold text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                  @click="closeForm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  :disabled="isSaving"
                  class="inline-flex items-center gap-1.5 rounded-xl bg-(--app-primary) px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) disabled:opacity-50"
                  @click="handleSave"
                >
                  <Loader2 v-if="isSaving" class="h-3.5 w-3.5 animate-spin" />
                  <Check v-else class="h-3.5 w-3.5" />
                  Save
                </button>
              </div>
            </div>

            <form class="space-y-4" @submit.prevent="handleSave">
              <div>
                <label class="mb-1 block text-xs font-semibold text-(--app-text-soft)">URL</label>
                <input
                  v-model="form.url"
                  type="url"
                  required
                  placeholder="https://example.com"
                  class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-2.5 text-sm text-(--app-text) placeholder:text-(--app-muted) focus:border-(--app-primary) focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label class="mb-1 block text-xs font-semibold text-(--app-text-soft)"
                  >Title (optional)</label
                >
                <input
                  v-model="form.title"
                  type="text"
                  placeholder="Page title or description"
                  class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-2.5 text-sm text-(--app-text) placeholder:text-(--app-muted) focus:border-(--app-primary) focus:outline-none transition-colors"
                />
              </div>

              <div class="space-y-2">
                <label class="block text-xs font-semibold text-(--app-text-soft)">Tags</label>
                <div class="flex gap-2">
                  <input
                    v-model="tagDraft"
                    type="text"
                    placeholder="Add tag (e.g. dev, article, read-later)…"
                    class="block min-w-0 flex-1 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-2 text-xs text-(--app-text) placeholder:text-(--app-muted) focus:border-(--app-primary) focus:outline-none transition-colors"
                    @keydown.enter.prevent="addTagFromDraft"
                  />
                  <button
                    type="button"
                    class="inline-flex shrink-0 items-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-muted) transition-colors hover:text-(--app-text)"
                    @click="addTagFromDraft"
                  >
                    Add tag
                  </button>
                </div>
                <div v-if="form.tags.length" class="flex flex-wrap gap-1.5 pt-1">
                  <button
                    v-for="tag in form.tags"
                    :key="tag"
                    type="button"
                    class="inline-flex items-center gap-1 rounded-lg bg-(--app-primary)/10 border border-(--app-primary)/20 px-2.5 py-1 text-xs font-medium text-(--app-primary) hover:bg-(--app-primary)/20 transition-colors"
                    @click="removeFormTag(tag)"
                  >
                    {{ tag }}
                    <X class="h-3 w-3" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        <!-- Viewer Mode (Selected Bookmark) -->
        <div v-else-if="selectedItem" class="flex-1 min-h-0 flex flex-col overflow-y-auto">
          <!-- Detail Toolbar -->
          <div
            class="flex items-center justify-between border-b border-(--app-border) px-6 py-4 bg-(--app-surface)/30 shrink-0"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface) overflow-hidden"
              >
                <img
                  v-if="getFaviconUrl(selectedItem.url) && !faviconErrors[selectedItem.id]"
                  :src="getFaviconUrl(selectedItem.url)"
                  alt=""
                  class="h-5 w-5 object-contain"
                  loading="lazy"
                  @error="onFaviconError(selectedItem.id)"
                />
                <Globe v-else class="h-5 w-5 text-(--app-muted)" />
              </div>
              <div class="min-w-0">
                <h2 class="truncate text-base font-bold text-(--app-text)">
                  {{ selectedItem.title || bookmarkHostname(selectedItem.url) }}
                </h2>
                <p class="truncate text-xs text-(--app-muted)">
                  {{ bookmarkHostname(selectedItem.url) }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <button
                type="button"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-text) transition-colors hover:bg-(--app-surface-hover)"
                title="Copy URL"
                @click="copyUrl(selectedItem.url)"
              >
                <Check v-if="copiedUrl" class="h-3.5 w-3.5 text-emerald-400" />
                <Copy v-else class="h-3.5 w-3.5" />
                <span>{{ copiedUrl ? "Copied" : "Copy Link" }}</span>
              </button>

              <button
                type="button"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-(--app-primary) px-3.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-95"
                title="Open in new tab"
                @click="openBookmark(selectedItem)"
              >
                <ExternalLink class="h-3.5 w-3.5" />
                <span>Open</span>
              </button>

              <button
                type="button"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                title="Edit bookmark"
                @click="openEditForm(selectedItem)"
              >
                <Pencil class="h-3.5 w-3.5" />
                <span>Edit</span>
              </button>

              <button
                type="button"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-muted) transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                title="Delete bookmark"
                @click="handleDelete(selectedItem)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <!-- Detail Body -->
          <div class="flex-1 p-6 lg:p-8 space-y-6">
            <div class="mx-auto max-w-3xl space-y-6">
              <!-- Visual Card Preview -->
              <div
                class="group flex flex-col gap-3 rounded-2xl border border-(--app-border) bg-(--app-surface) p-5 shadow-sm transition-all hover:border-(--app-border-strong)"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2.5">
                    <span
                      class="flex h-7 w-7 items-center justify-center rounded-lg bg-(--app-primary)/10 text-(--app-primary)"
                    >
                      <Globe class="h-3.5 w-3.5" />
                    </span>
                    <span class="text-xs font-bold uppercase tracking-wider text-(--app-muted)">
                      {{ bookmarkHostname(selectedItem.url) }}
                    </span>
                  </div>

                  <a
                    :href="selectedItem.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-xs font-semibold text-(--app-primary) hover:underline"
                    @click.stop
                  >
                    <span>Visit site</span>
                    <ExternalLink class="h-3 w-3" />
                  </a>
                </div>

                <div class="space-y-1">
                  <h3 class="text-lg font-bold text-(--app-text) leading-snug">
                    {{ selectedItem.title || bookmarkHostname(selectedItem.url) }}
                  </h3>
                  <p class="font-mono text-xs text-(--app-text-soft) break-all select-all">
                    {{ selectedItem.url }}
                  </p>
                </div>
              </div>

              <!-- Tags Section -->
              <div v-if="(selectedItem.tags || []).length" class="space-y-2">
                <div class="flex items-center gap-1.5 text-xs font-semibold text-(--app-muted)">
                  <Tag class="h-3.5 w-3.5" />
                  <span>Tags</span>
                </div>
                <div class="flex flex-wrap gap-2">
                  <span
                    v-for="t in selectedItem.tags"
                    :key="t"
                    class="rounded-xl border border-(--app-border) bg-(--app-surface) px-3 py-1.5 text-xs font-medium text-(--app-text)"
                  >
                    #{{ t }}
                  </span>
                </div>
              </div>

              <!-- Metadata Details Grid -->
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                <div
                  class="rounded-2xl border border-(--app-border)/60 bg-(--app-surface)/40 p-4 space-y-1"
                >
                  <div class="flex items-center gap-1.5 text-xs font-medium text-(--app-muted)">
                    <Calendar class="h-3.5 w-3.5" />
                    <span>Last Updated</span>
                  </div>
                  <p class="text-sm font-semibold text-(--app-text)">
                    {{ formatDate(selectedItem.updatedAt || selectedItem.createdAt) }}
                  </p>
                </div>

                <div
                  class="rounded-2xl border border-(--app-border)/60 bg-(--app-surface)/40 p-4 space-y-1"
                >
                  <div class="flex items-center gap-1.5 text-xs font-medium text-(--app-muted)">
                    <ShieldCheck class="h-3.5 w-3.5 text-(--app-primary)" />
                    <span>Nostr Event ID</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs text-(--app-text-soft) truncate flex-1">
                      {{
                        selectedItem.eventId
                          ? `${selectedItem.eventId.slice(0, 12)}…${selectedItem.eventId.slice(-8)}`
                          : "—"
                      }}
                    </span>
                    <button
                      v-if="selectedItem.eventId"
                      type="button"
                      class="text-(--app-muted) hover:text-(--app-text) p-1 transition-colors"
                      title="Copy Event ID"
                      @click="copyEventId(selectedItem.eventId)"
                    >
                      <Check v-if="copiedEventId" class="h-3.5 w-3.5 text-emerald-400" />
                      <Copy v-else class="h-3.5 w-3.5" />
                    </button>
                    <a
                      v-if="getNjumpUrl(selectedItem)"
                      :href="getNjumpUrl(selectedItem)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-(--app-muted) hover:text-(--app-primary) p-1 transition-colors"
                      title="View on njump.me"
                    >
                      <ExternalLink class="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty Selection State -->
        <div v-else class="flex h-full w-full flex-col items-center justify-center p-8 text-center">
          <div
            class="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-(--app-border) bg-(--app-surface) text-(--app-primary) shadow-sm"
          >
            <Bookmark class="h-8 w-8" />
          </div>
          <h3 class="text-base font-bold">No bookmark selected</h3>
          <p class="mt-1 text-xs text-(--app-muted) max-w-xs">
            Select a bookmark from the left or create a new encrypted entry.
          </p>
          <button
            type="button"
            class="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-(--app-primary) px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-(--app-primary-strong) active:scale-95"
            @click="openCreateForm"
          >
            <Plus class="h-3.5 w-3.5" />
            <span>New Bookmark</span>
          </button>
        </div>
      </section>
    </div>

    <!-- Mobile Single Column Layout (< 1024px) -->
    <div v-else class="min-h-dvh overflow-y-auto overflow-x-hidden p-4 sm:p-6 pb-16">
      <div class="mx-auto max-w-2xl space-y-6">
        <AppAlertBanner v-if="error" :message="error" />

        <!-- Shimmer Skeleton Loading State -->
        <div v-if="isLoading" class="space-y-3">
          <div
            v-for="n in 4"
            :key="n"
            class="flex items-center gap-3.5 rounded-2xl border border-(--app-border)/40 p-4 bg-(--app-surface-soft)/30"
          >
            <div class="h-9 w-9 shrink-0 rounded-xl skeleton-shimmer" />
            <div class="min-w-0 flex-1 space-y-2">
              <div class="h-4 w-44 rounded-md skeleton-shimmer" />
              <div class="h-3 w-64 rounded-md skeleton-shimmer" />
            </div>
          </div>
        </div>

        <template v-else>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-(--app-muted)">
              <span class="font-semibold tabular-nums text-(--app-text)">{{ items.length }}</span>
              {{ items.length === 1 ? "bookmark" : "bookmarks" }}
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <div class="group relative">
                <a
                  :href="BOOKMARKLET_HREF"
                  draggable="true"
                  class="inline-flex h-9 cursor-grab items-center gap-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-text) transition-colors hover:bg-(--app-surface-hover) active:cursor-grabbing"
                  @click="onBookmarkletClick"
                >
                  <Bookmark class="h-3.5 w-3.5 text-(--app-primary)" />
                  gupt-mark
                </a>
                <div
                  class="pointer-events-none absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-(--app-border) bg-(--app-surface-soft) p-2 text-[11px] leading-tight text-(--app-text-soft) shadow-xl"
                  :class="showBookmarkletHint ? 'block' : 'hidden group-hover:block'"
                >
                  Don't click —
                  <span class="font-semibold text-(--app-text)">drag</span>
                  gupt-mark to your bookmarks bar, then use it on any other page.
                </div>
              </div>
              <button
                type="button"
                :disabled="isRefreshing"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-60"
                @click="refreshFromRelay"
              >
                <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': isRefreshing }" />
                Sync
              </button>
              <button
                type="button"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-(--app-primary) px-3.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-[0.97]"
                @click="openCreateForm"
              >
                <Plus class="h-3.5 w-3.5" />
                New
              </button>
            </div>
          </div>

          <!-- Mobile Form Modal Sheet -->
          <Teleport to="body">
            <div
              v-if="!isDesktop && (isCreating || editingId)"
              class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              @click.self="closeForm"
            >
              <div
                class="w-full max-w-lg rounded-2xl border border-(--app-border) bg-(--app-surface) p-5 space-y-4 shadow-2xl"
              >
                <div class="flex items-center justify-between border-b border-(--app-border) pb-3">
                  <h3 class="text-sm font-bold">
                    {{ isCreating ? "Add Bookmark" : "Edit Bookmark" }}
                  </h3>
                  <button
                    type="button"
                    class="rounded-lg p-1 text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                    @click="closeForm"
                  >
                    <X class="h-4 w-4" />
                  </button>
                </div>

                <form class="space-y-3.5" @submit.prevent="handleSave">
                  <div>
                    <label class="mb-1 block text-xs font-semibold text-(--app-text-soft)"
                      >URL</label
                    >
                    <input
                      v-model="form.url"
                      type="url"
                      required
                      placeholder="https://…"
                      class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-2.5 text-sm text-(--app-text) placeholder:text-(--app-muted) focus:border-(--app-primary) focus:outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label class="mb-1 block text-xs font-semibold text-(--app-text-soft)"
                      >Title (optional)</label
                    >
                    <input
                      v-model="form.title"
                      type="text"
                      placeholder="Title"
                      class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-2.5 text-sm text-(--app-text) placeholder:text-(--app-muted) focus:border-(--app-primary) focus:outline-none transition-colors"
                    />
                  </div>

                  <div class="space-y-2">
                    <label class="block text-xs font-semibold text-(--app-text-soft)">Tags</label>
                    <div class="flex gap-2">
                      <input
                        v-model="tagDraft"
                        type="text"
                        placeholder="Add tag…"
                        class="block min-w-0 flex-1 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-2 text-xs text-(--app-text) placeholder:text-(--app-muted) focus:border-(--app-primary) focus:outline-none transition-colors"
                        @keydown.enter.prevent="addTagFromDraft"
                      />
                      <button
                        type="button"
                        class="inline-flex shrink-0 items-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-muted) transition-colors hover:text-(--app-text)"
                        @click="addTagFromDraft"
                      >
                        Add
                      </button>
                    </div>
                    <div v-if="form.tags.length" class="flex flex-wrap gap-1.5 pt-1">
                      <button
                        v-for="tag in form.tags"
                        :key="tag"
                        type="button"
                        class="inline-flex items-center gap-1 rounded-lg bg-(--app-primary)/10 border border-(--app-primary)/20 px-2.5 py-1 text-xs font-medium text-(--app-primary)"
                        @click="removeFormTag(tag)"
                      >
                        {{ tag }}
                        <X class="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <div class="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      class="px-3.5 py-2 text-xs font-semibold text-(--app-muted) hover:text-(--app-text)"
                      @click="closeForm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      :disabled="isSaving"
                      class="inline-flex items-center gap-1.5 rounded-xl bg-(--app-primary) px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-(--app-primary-strong) disabled:opacity-50"
                    >
                      <Loader2 v-if="isSaving" class="h-3.5 w-3.5 animate-spin" />
                      <Check v-else class="h-3.5 w-3.5" />
                      Save
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </Teleport>

          <div v-if="items.length === 0 && !isCreating" class="py-12 text-center">
            <div
              class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--app-primary-soft) text-(--app-primary)"
            >
              <Bookmark class="h-7 w-7" />
            </div>
            <h2 class="mb-2 text-lg font-semibold">No bookmarks yet</h2>
            <p class="mx-auto mb-6 max-w-sm text-sm leading-6 text-(--app-muted)">
              Add one manually, or drag gupt-mark to your bookmarks bar and click it on any page.
            </p>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-xl bg-(--app-primary) px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-(--app-primary-strong)"
              @click="openCreateForm"
            >
              <Plus class="h-4 w-4" />
              Add bookmark
            </button>
          </div>

          <template v-else-if="items.length > 0">
            <div class="space-y-3">
              <div class="relative">
                <Search
                  class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-(--app-muted) h-4 w-4 my-auto"
                />
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search bookmarks…"
                  class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) py-2.5 pr-4 pl-10 text-sm text-(--app-text) transition-all placeholder:text-(--app-muted) focus:border-(--app-primary) focus:outline-none"
                />
              </div>

              <div v-if="allTags.length" class="flex gap-2 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  class="rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors"
                  :class="
                    activeTag === 'all'
                      ? 'bg-(--app-primary)/15 text-(--app-primary)'
                      : 'text-(--app-muted) hover:text-(--app-text)'
                  "
                  @click="activeTag = 'all'"
                >
                  All
                </button>
                <button
                  v-for="tagInfo in allTags"
                  :key="tagInfo.tag"
                  type="button"
                  class="rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors"
                  :class="
                    activeTag === tagInfo.tag
                      ? 'bg-(--app-primary)/15 text-(--app-primary)'
                      : 'text-(--app-muted) hover:text-(--app-text)'
                  "
                  @click="activeTag = tagInfo.tag"
                >
                  {{ tagInfo.tag }}
                  <span class="opacity-50">{{ tagInfo.count }}</span>
                </button>
              </div>
            </div>

            <div
              v-if="filteredItems.length === 0"
              class="py-16 text-center text-sm text-(--app-muted)"
            >
              No bookmarks match your search or filter.
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="item in filteredItems"
                :key="item.id"
                class="group flex items-center gap-3 rounded-2xl border border-(--app-border) bg-(--app-surface) p-3.5 transition-colors hover:bg-(--app-surface-soft)"
                @click="openBookmark(item)"
              >
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) overflow-hidden"
                >
                  <img
                    v-if="getFaviconUrl(item.url) && !faviconErrors[item.id]"
                    :src="getFaviconUrl(item.url)"
                    alt=""
                    class="h-5 w-5 object-contain"
                    loading="lazy"
                    @error="onFaviconError(item.id)"
                  />
                  <Globe v-else class="h-5 w-5 text-(--app-muted)" />
                </div>

                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold tracking-tight text-(--app-text)">
                    {{ item.title || bookmarkHostname(item.url) }}
                  </p>
                  <p class="truncate text-xs text-(--app-muted)">
                    {{ bookmarkHostname(item.url) }}
                    <span v-if="(item.tags || []).length">
                      · {{ (item.tags || []).slice(0, 2).join(" · ") }}
                    </span>
                  </p>
                </div>

                <div class="flex items-center gap-1 shrink-0" @click.stop>
                  <button
                    type="button"
                    class="rounded-lg p-2 text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                    title="Edit"
                    @click="openEditForm(item)"
                  >
                    <Pencil class="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    class="rounded-lg p-2 text-(--app-muted) transition-colors hover:bg-red-500/10 hover:text-red-400"
                    title="Delete"
                    @click="handleDelete(item)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </template>
        </template>
      </div>
    </div>

    <AppConfirmDialog
      :open="!!pendingDelete"
      title="Delete bookmark?"
      message="This publishes a delete tombstone. The bookmark will disappear from your list."
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </main>
</template>
