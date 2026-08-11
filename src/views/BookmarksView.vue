<script setup>
import { ref, computed, onMounted } from "vue";
import {
  Bookmark,
  Trash2,
  Loader2,
  RefreshCw,
  Search,
  ExternalLink,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { useIdentityStore } from "@/stores/identity";
import {
  getBookmarksCached,
  fetchBookmarks,
  deleteBookmark,
  renewExpiringBookmarks,
  bookmarkHostname,
} from "@/lib/bookmarks";

const identity = useIdentityStore();
const isLoading = ref(true);
const isRefreshing = ref(false);
const items = ref([]);
const searchQuery = ref("");
const error = ref("");

const BOOKMARKLET_HREF = `javascript:(()=>{const u=encodeURIComponent(location.href),og=document.querySelector('meta[property="og:title"]')?.content?.trim(),t=encodeURIComponent(og||document.title||(document.querySelector('h1')?.innerText||'').trim());open('${window.location.origin}/#/hotlink/bookmark?url='+u+'&title='+t,'_blank')})()`;

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return items.value;
  return items.value.filter((item) => {
    return (
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.url && item.url.toLowerCase().includes(q)) ||
      bookmarkHostname(item.url).toLowerCase().includes(q)
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
            </div>
          </div>

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

          <div v-if="items.length === 0" class="py-12 text-center">
            <div
              class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--app-primary-soft) text-(--app-primary)"
            >
              <Bookmark class="h-7 w-7" />
            </div>
            <h2 class="mb-2 text-lg font-semibold">No bookmarks yet</h2>
            <p class="mx-auto max-w-sm text-sm leading-6 text-(--app-muted)">
              Drag gupt-mark to your bookmarks bar, then click it on any page to save a private
              encrypted bookmark.
            </p>
          </div>

          <template v-else>
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

            <div
              v-if="filteredItems.length === 0"
              class="py-16 text-center text-sm text-(--app-muted)"
            >
              No bookmarks match your search.
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
