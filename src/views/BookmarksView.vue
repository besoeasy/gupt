<script setup>
import { ref, computed, onMounted } from "vue";
import { Bookmark, Trash2, Loader2, RefreshCw, Search, ExternalLink, Plus, X } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { useIdentityStore } from "@/stores/identity";
import {
  getBookmarksCached,
  fetchBookmarks,
  saveBookmark,
  deleteBookmark,
  renewExpiringBookmarks,
  bookmarkHostname,
  normalizeBookmarkTags,
} from "@/lib/bookmarks";

const identity = useIdentityStore();
const isLoading = ref(true);
const isRefreshing = ref(false);
const isSaving = ref(false);
const items = ref([]);
const searchQuery = ref("");
const activeTag = ref("all");
const error = ref("");
const showAddForm = ref(false);
const addForm = ref({ title: "", url: "", tags: [] });
const tagDraft = ref("");

const BOOKMARKLET_HREF = `javascript:(()=>{const u=encodeURIComponent(location.href),og=document.querySelector('meta[property="og:title"]')?.content?.trim(),t=encodeURIComponent(og||document.title||(document.querySelector('h1')?.innerText||'').trim());open('${window.location.origin}/#/hotlink/bookmark?url='+u+'&title='+t,'_blank')})()`;

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
  await loadItems();
});

async function loadItems() {
  const cached = await getBookmarksCached(identity.privkeyHex, identity.pubkeyHex);
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
    let next = await fetchBookmarks(identity.privkeyHex, identity.pubkeyHex);
    next = await renewExpiringBookmarks(identity.privkeyHex, identity.pubkeyHex, next);
    items.value = next;
  } catch (err) {
    console.error("Failed to load bookmarks:", err);
    error.value = err?.message || "Failed to load bookmarks.";
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
}

function openAddForm() {
  showAddForm.value = true;
  addForm.value = { title: "", url: "", tags: [] };
  tagDraft.value = "";
  error.value = "";
}

function closeAddForm() {
  showAddForm.value = false;
  addForm.value = { title: "", url: "", tags: [] };
  tagDraft.value = "";
}

function addTagFromDraft() {
  const next = normalizeBookmarkTags([...addForm.value.tags, tagDraft.value]);
  addForm.value.tags = next;
  tagDraft.value = "";
}

function removeFormTag(tag) {
  addForm.value.tags = addForm.value.tags.filter((t) => t !== tag);
}

async function handleAdd() {
  if (isSaving.value) return;
  if (tagDraft.value.trim()) addTagFromDraft();
  isSaving.value = true;
  error.value = "";
  try {
    const saved = await saveBookmark(
      identity.privkeyHex,
      identity.pubkeyHex,
      {
        title: addForm.value.title,
        url: addForm.value.url,
        tags: addForm.value.tags,
      },
      items.value,
    );
    items.value = [saved, ...items.value.filter((b) => b.id !== saved.id)].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    );
    closeAddForm();
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

async function handleDelete(item) {
  if (!confirm("Delete this bookmark?")) return;
  try {
    error.value = "";
    await deleteBookmark(identity.privkeyHex, identity.pubkeyHex, item);
    items.value = items.value.filter((b) => b.id !== item.id);
  } catch (err) {
    error.value = err?.message || "Failed to delete bookmark.";
  }
}
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-[80rem] px-4 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-16">
      <div class="mx-auto max-w-2xl space-y-8">
        <AppAlertBanner v-if="error" :message="error" />

        <div v-if="isLoading" class="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 class="mb-4 h-7 w-7 animate-spin text-(--app-primary)" />
          <p class="text-sm font-medium text-(--app-text-soft)">Loading bookmarks…</p>
        </div>

        <template v-else>
          <div
            class="flex flex-col gap-3 rounded-xl border border-dashed border-(--app-border) px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p class="text-xs leading-5 text-(--app-muted)">
              Drag
              <span class="font-semibold text-(--app-text-soft)">gupt-mark</span>
              to your bookmarks bar. On any page, click it to save that page here.
            </p>
            <a
              :href="BOOKMARKLET_HREF"
              draggable="true"
              title="Drag this to your bookmarks bar"
              class="inline-flex shrink-0 cursor-grab items-center gap-1.5 self-start rounded-lg border border-(--app-border) bg-(--app-surface-soft) px-3 py-1.5 text-xs font-semibold text-(--app-text) transition-colors hover:bg-(--app-surface-hover) active:cursor-grabbing sm:self-auto"
            >
              <Bookmark class="h-3.5 w-3.5 text-(--app-primary)" />
              gupt-mark
            </a>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-(--app-muted)">
              <span class="font-semibold tabular-nums text-(--app-text)">{{ items.length }}</span>
              {{ items.length === 1 ? "bookmark" : "bookmarks" }}
            </p>
            <div class="flex flex-wrap items-center gap-2">
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
                @click="openAddForm"
              >
                <Plus class="h-3.5 w-3.5" />
                New
              </button>
            </div>
          </div>

          <form
            v-if="showAddForm"
            class="space-y-3 rounded-2xl border border-(--app-border) bg-(--app-surface) p-4"
            @submit.prevent="handleAdd"
          >
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-semibold">Add bookmark</p>
              <button
                type="button"
                class="rounded-lg p-1 text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                title="Close"
                @click="closeAddForm"
              >
                <X class="h-4 w-4" />
              </button>
            </div>
            <input
              v-model="addForm.url"
              type="url"
              required
              placeholder="https://…"
              class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-2.5 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
            />
            <input
              v-model="addForm.title"
              type="text"
              placeholder="Title (optional)"
              class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-2.5 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
            />
            <div class="space-y-2">
              <div class="flex gap-2">
                <input
                  v-model="tagDraft"
                  type="text"
                  placeholder="Add tag…"
                  class="block min-w-0 flex-1 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-2.5 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
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
              <div v-if="addForm.tags.length" class="flex flex-wrap gap-1.5">
                <button
                  v-for="tag in addForm.tags"
                  :key="tag"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full bg-(--app-primary)/10 px-2.5 py-1 text-[11px] font-medium text-(--app-primary)"
                  @click="removeFormTag(tag)"
                >
                  {{ tag }}
                  <X class="h-3 w-3" />
                </button>
              </div>
            </div>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="px-3 py-2 text-xs font-medium text-(--app-muted) transition-colors hover:text-(--app-text)"
                @click="closeAddForm"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="isSaving"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-(--app-primary) px-3.5 text-xs font-semibold text-white transition-colors hover:bg-(--app-primary-strong) disabled:opacity-50"
              >
                <Loader2 v-if="isSaving" class="h-3.5 w-3.5 animate-spin" />
                <Plus v-else class="h-3.5 w-3.5" />
                Save
              </button>
            </div>
          </form>

          <div v-if="items.length === 0 && !showAddForm" class="py-12 text-center">
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
              @click="openAddForm"
            >
              <Plus class="h-4 w-4" />
              Add bookmark
            </button>
          </div>

          <template v-else-if="items.length > 0">
            <div class="space-y-3">
              <div class="relative">
                <div
                  class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-(--app-muted-2)"
                >
                  <Search class="h-4 w-4" />
                </div>
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search…"
                  class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) py-2.5 pr-4 pl-10 text-sm text-(--app-text) transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
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

            <ul v-else class="divide-y divide-(--app-border) border-y border-(--app-border)">
              <li
                v-for="item in filteredItems"
                :key="item.id"
                class="group cursor-pointer transition-colors hover:bg-(--app-surface-soft)/40"
                @click="openBookmark(item)"
              >
                <div class="flex items-center gap-3 px-1 py-3">
                  <Bookmark class="h-4 w-4 shrink-0 text-(--app-primary)" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium tracking-tight">
                      {{ item.title || bookmarkHostname(item.url) }}
                    </p>
                    <p class="truncate text-xs text-(--app-muted)">
                      {{ bookmarkHostname(item.url) }}
                      <span v-if="(item.tags || []).length">
                        · {{ (item.tags || []).slice(0, 3).join(" · ") }}
                      </span>
                    </p>
                  </div>
                  <ExternalLink
                    class="h-3.5 w-3.5 shrink-0 text-(--app-muted-2) opacity-0 transition-opacity group-hover:opacity-100"
                  />
                  <button
                    type="button"
                    class="rounded-lg p-1 text-(--app-muted-2) opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
                    title="Delete"
                    @click.stop="handleDelete(item)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            </ul>
          </template>
        </template>
      </div>
    </div>
  </main>
</template>
