<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { Bookmark, RefreshCw, Search, ExternalLink, Plus, X, Globe, Layers } from "@lucide/vue";
import { useIdentityStore } from "@/stores/identity";
import {
  getBookmarksCached,
  fetchBookmarks,
  renewExpiringBookmarks,
  bookmarkHostname,
} from "@/lib/bookmarks";

const router = useRouter();
const identity = useIdentityStore();

const isLoading = ref(true);
const isRefreshing = ref(false);
const items = ref([]);
const searchQuery = ref("");
const activeTag = ref("all");
const error = ref("");

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
  await loadItems();
});

onUnmounted(() => {
  if (bookmarkletHintTimer) clearTimeout(bookmarkletHintTimer);
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

function openBookmark(item, event) {
  if (event) event.stopPropagation();
  if (!item?.url) return;
  window.open(item.url, "_blank", "noopener,noreferrer");
}

function navigateToDetail(item) {
  router.push(`/bookmarks/${item.id}`);
}
</script>

<template>
  <div class="min-h-screen bg-(--app-bg) text-(--app-text) pb-16">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <!-- Header Section -->
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-(--app-border) pb-6"
      >
        <div>
          <div class="flex items-center gap-2.5">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-2xl bg-(--app-primary)/10 text-(--app-primary)"
            >
              <Bookmark class="h-4.5 w-4.5" />
            </div>
            <h1 class="text-2xl font-bold tracking-tight text-(--app-text)">Bookmarks</h1>
            <span
              v-if="items.length"
              class="rounded-full bg-(--app-surface-soft) px-2.5 py-0.5 text-xs font-bold tabular-nums text-(--app-muted)"
            >
              {{ items.length }}
            </span>
          </div>
          <p class="mt-1 text-sm text-(--app-muted)">
            End-to-end encrypted bookmarks stored privately on your relays.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <!-- Bookmarklet drag helper -->
          <div class="group relative">
            <a
              :href="BOOKMARKLET_HREF"
              draggable="true"
              class="inline-flex h-10 cursor-grab items-center gap-1.5 rounded-2xl border border-(--app-border) bg-(--app-surface) px-3 text-xs font-semibold text-(--app-text) shadow-sm transition-colors hover:bg-(--app-surface-hover) active:cursor-grabbing"
              @click="onBookmarkletClick"
              title="Drag to bookmarks bar"
            >
              <Bookmark class="h-3.5 w-3.5 text-(--app-primary)" />
              <span>gupt-mark</span>
            </a>
            <div
              class="pointer-events-none absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-(--app-border) bg-(--app-surface) p-3 text-xs leading-tight text-(--app-text-soft) shadow-2xl"
              :class="showBookmarkletHint ? 'block' : 'hidden group-hover:block'"
            >
              Don't click — <span class="font-bold text-(--app-text)">drag</span> gupt-mark to your
              browser's bookmarks bar.
            </div>
          </div>

          <!-- Sync button -->
          <button
            type="button"
            :disabled="isRefreshing"
            class="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-(--app-border) bg-(--app-surface) px-3.5 text-xs font-semibold text-(--app-text-soft) shadow-sm transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-50 cursor-pointer"
            title="Sync from relays"
            @click="refreshFromRelay"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': isRefreshing }" />
            <span>Sync</span>
          </button>

          <!-- New Bookmark button -->
          <RouterLink
            to="/bookmarks/new"
            class="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-(--app-primary) px-4 text-xs font-bold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-95 cursor-pointer"
          >
            <Plus class="h-4 w-4" />
            <span>New Bookmark</span>
          </RouterLink>
        </div>
      </div>

      <AppAlertBanner v-if="error" :message="error" />

      <!-- Search and Tag Filter Bar -->
      <div class="space-y-3">
        <div class="relative">
          <Search
            class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-(--app-muted)"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by title, URL, domain, or tags…"
            class="h-11 w-full rounded-2xl border border-(--app-border) bg-(--app-surface) pl-10 pr-9 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors shadow-xs"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-(--app-muted) hover:text-(--app-text) cursor-pointer"
            @click="searchQuery = ''"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <!-- Tag Filter Chips -->
        <div
          v-if="allTags.length"
          class="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          <button
            type="button"
            class="rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
            :class="
              activeTag === 'all'
                ? 'bg-(--app-primary) text-white shadow-xs'
                : 'bg-(--app-surface) text-(--app-muted) border border-(--app-border) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
            "
            @click="activeTag = 'all'"
          >
            All ({{ items.length }})
          </button>
          <button
            v-for="tagInfo in allTags"
            :key="tagInfo.tag"
            type="button"
            class="rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
            :class="
              activeTag === tagInfo.tag
                ? 'bg-(--app-primary) text-white shadow-xs'
                : 'bg-(--app-surface) text-(--app-muted) border border-(--app-border) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
            "
            @click="activeTag = tagInfo.tag"
          >
            #{{ tagInfo.tag }}
            <span class="ml-1 opacity-70">({{ tagInfo.count }})</span>
          </button>
        </div>
      </div>

      <!-- Shimmer Skeleton Loading State -->
      <div
        v-if="isLoading"
        class="overflow-hidden rounded-2xl sm:rounded-3xl border border-(--app-border) bg-(--app-surface) shadow-xs"
      >
        <div
          v-for="n in 5"
          :key="n"
          class="flex items-center justify-between gap-3 px-3.5 py-3 sm:px-4"
        >
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="h-7 w-7 shrink-0 rounded-lg bg-(--app-surface-soft) animate-pulse" />
            <div class="h-4 w-48 rounded-md bg-(--app-surface-soft) animate-pulse" />
          </div>
          <div class="hidden md:flex gap-1.5">
            <div class="h-5 w-14 rounded-md bg-(--app-surface-soft) animate-pulse" />
            <div class="h-5 w-12 rounded-md bg-(--app-surface-soft) animate-pulse" />
          </div>
          <div class="flex items-center">
            <div class="h-8 w-8 rounded-xl bg-(--app-surface-soft) animate-pulse" />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="items.length === 0"
        class="flex flex-col items-center justify-center rounded-3xl border border-(--app-border) bg-(--app-surface) px-6 py-16 text-center shadow-xs"
      >
        <div
          class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--app-surface-soft) text-(--app-muted)"
        >
          <Layers class="h-7 w-7" />
        </div>
        <h2 class="text-lg font-bold tracking-tight text-(--app-text)">No bookmarks yet</h2>
        <p class="mt-1 max-w-sm text-sm text-(--app-muted) leading-relaxed">
          Your private bookmark stream is empty. Add your first bookmark or drag the bookmarklet to
          your browser toolbar.
        </p>
        <RouterLink
          to="/bookmarks/new"
          class="mt-6 inline-flex items-center gap-2 rounded-2xl bg-(--app-primary) px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-(--app-primary-strong) active:scale-95"
        >
          <Plus class="h-4 w-4" />
          <span>Add first bookmark</span>
        </RouterLink>
      </div>

      <!-- Search No Results -->
      <div
        v-else-if="filteredItems.length === 0"
        class="flex flex-col items-center justify-center rounded-3xl border border-(--app-border) bg-(--app-surface) px-6 py-12 text-center shadow-xs"
      >
        <Search class="h-8 w-8 text-(--app-muted) mb-3" />
        <h2 class="text-base font-bold text-(--app-text)">No matching bookmarks</h2>
        <p class="mt-1 text-sm text-(--app-muted)">
          No bookmarks match your search query "{{ searchQuery }}".
        </p>
        <button
          type="button"
          class="mt-4 text-xs font-semibold text-(--app-primary) hover:underline cursor-pointer"
          @click="
            searchQuery = '';
            activeTag = 'all';
          "
        >
          Clear filters
        </button>
      </div>

      <!-- Modern Table View -->
      <div
        v-else
        class="overflow-hidden rounded-2xl sm:rounded-3xl border border-(--app-border) bg-(--app-surface) shadow-xs"
      >
        <!-- Table Rows -->
        <div>
          <div
            v-for="item in filteredItems"
            :key="item.id"
            class="group/row flex items-center justify-between gap-3 px-3.5 py-2.5 sm:px-4 sm:py-3 transition-colors hover:bg-(--app-surface-hover)/40 cursor-pointer"
            @click="navigateToDetail(item)"
          >
            <!-- Logo & Title (on hover shows url) -->
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <!-- Favicon / Logo -->
              <div
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-(--app-border) bg-(--app-surface-soft) overflow-hidden"
              >
                <img
                  v-if="getFaviconUrl(item.url) && !faviconErrors[item.id]"
                  :src="getFaviconUrl(item.url)"
                  class="h-4 w-4 object-contain"
                  alt=""
                  @error="onFaviconError(item.id)"
                />
                <Globe v-else class="h-3.5 w-3.5 text-(--app-muted)" />
              </div>

              <!-- Title + Host badge (with URL tooltip on hover) -->
              <div class="min-w-0 flex-1 flex items-center gap-2" :title="item.url">
                <span
                  class="truncate text-sm font-semibold text-(--app-text) group-hover/row:text-(--app-primary) transition-colors"
                >
                  {{ item.title || bookmarkHostname(item.url) || "Bookmark" }}
                </span>
                <span
                  class="hidden sm:inline shrink-0 font-mono text-[11px] text-(--app-muted) truncate max-w-40"
                >
                  {{ bookmarkHostname(item.url) }}
                </span>
              </div>
            </div>

            <!-- Tags -->
            <div class="hidden md:flex items-center gap-1.5 shrink-0 max-w-xs overflow-hidden">
              <template v-if="item.tags && item.tags.length">
                <button
                  v-for="tag in item.tags"
                  :key="tag"
                  type="button"
                  class="inline-flex items-center rounded-md border border-(--app-border) bg-(--app-surface-soft) px-2 py-0.5 text-[10px] font-semibold text-(--app-text-soft) hover:border-(--app-primary)/40 hover:bg-(--app-primary)/10 hover:text-(--app-primary) transition-colors cursor-pointer whitespace-nowrap"
                  :title="`Filter by #${tag}`"
                  @click.stop="activeTag = tag"
                >
                  #{{ tag }}
                </button>
              </template>
            </div>

            <!-- Open Bookmark in New Tab -->
            <div class="flex items-center shrink-0" @click.stop>
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-(--app-primary)/30 bg-(--app-primary)/10 text-(--app-primary) hover:bg-(--app-primary) hover:text-white transition-all cursor-pointer shadow-xs"
                title="Open in new tab"
                @click="openBookmark(item, $event)"
              >
                <ExternalLink class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
