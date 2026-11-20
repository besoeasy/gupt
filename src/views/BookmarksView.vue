<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  Bookmark,
  Check,
  RefreshCw,
  Search,
  ExternalLink,
  Plus,
  X,
  Globe,
  Layers,
} from "@/icons";
import { useIdentityStore } from "@/stores/identity";
import {
  getBookmarksCached,
  fetchBookmarks,
  bookmarkHostname,
  saveBookmark,
} from "@/lib/bookmarks";
import { listPendingBookmarks, removePendingBookmark } from "@/lib/bookmarkQueue";

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
  await drainPendingBookmarks();
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

// gupt-mark piles links into localStorage from session-less tabs. Once an
// account is loaded, publish them into the encrypted stream and clear only the
// ones that made it, so a relay failure keeps the link queued for next time.
const importedCount = ref(0);

async function drainPendingBookmarks() {
  const pending = listPendingBookmarks();
  if (!pending.length) return;
  let imported = 0;
  // One local read up front; saveBookmark renews duplicates from it.
  const cached = await getBookmarksCached(identity.privkeyHex, identity.pubkeyHex).catch(
    () => null,
  );
  const current = cached?.items || [];
  for (const entry of pending) {
    try {
      await saveBookmark(
        identity.privkeyHex,
        identity.pubkeyHex,
        {
          title: entry.title,
          url: entry.url,
          ...(entry.tags.length ? { tags: entry.tags } : {}),
        },
        current,
      );
      removePendingBookmark(entry.url);
      imported += 1;
    } catch (err) {
      console.warn("Failed to import a queued bookmark", err);
      break;
    }
  }
  if (imported > 0) {
    importedCount.value = imported;
    await refreshFromRelay();
  }
}

async function refreshFromRelay() {
  isRefreshing.value = true;
  try {
    const next = await fetchBookmarks(identity.privkeyHex, identity.pubkeyHex);
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
  <div class="bookmarks-view__block">
    <main class="bookmarks-view__main">
      <!-- Header Section -->
      <div
        class="bookmarks-view__block-2"
      >
        <div>
          <div class="bookmarks-view__block-3">
            <h1 class="bookmarks-view__title-bookmarks">
              Bookmarks
              <span
                v-if="items.length"
                class="bookmarks-view__text"
              >
                ({{ items.length }})
              </span>
            </h1>
          </div>
          <p class="bookmarks-view__text-2">
            End-to-end encrypted bookmarks stored privately on your relays.
          </p>
        </div>

        <!-- Queued gupt-mark links were just imported -->
        <div
          v-if="importedCount > 0"
          class="bookmarks-view__block-4"
        >
          <Check class="bookmarks-view__check" />
          <span>
            Imported {{ importedCount }} link{{ importedCount === 1 ? "" : "s" }} waiting from
            gupt-mark.
          </span>
        </div>

        <div class="bookmarks-view__block-5">
          <!-- gupt-mark now lives under Integrations; keep a pointer for discoverability -->
          <RouterLink
            to="/integrations/gupt-mark"
            class="bookmarks-view__router-link-get-the"
            title="Get the gupt-mark bookmarklet"
          >
            <Bookmark class="bookmarks-view__bookmark" />
          </RouterLink>

          <!-- Sync button -->
          <button
            type="button"
            :disabled="isRefreshing"
            class="bookmarks-view__button-sync-from"
            title="Sync from relays"
            @click="refreshFromRelay"
          >
            <RefreshCw class="bookmarks-view__refresh-cw" :class="{ 'bookmarks-view__refresh-cw--spin': isRefreshing }" />
            <span>Sync</span>
          </button>

          <!-- New Bookmark button -->
          <RouterLink
            to="/bookmarks/new"
            class="bookmarks-view__router-link"
          >
            <Plus class="bookmarks-view__plus" :stroke-width="2.2" />
            <span>New Bookmark</span>
          </RouterLink>
        </div>
      </div>

      <AppAlertBanner v-if="error" :message="error" />

      <!-- Search and Tag Filter Bar -->
      <div class="bookmarks-view__block-6">
        <div class="bookmarks-view__block-7">
          <Search
            class="bookmarks-view__search"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search all bookmarks by title, URL, domain, or tags…"
            class="bookmarks-view__field-text"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="bookmarks-view__button"
            @click="searchQuery = ''"
          >
            <X class="bookmarks-view__x" />
          </button>
        </div>

        <!-- All items scope indicator -->
        <div
          v-if="searchQuery"
          class="bookmarks-view__block-8"
        >
          <span class="bookmarks-view__text-3" />
          <span
            >Searching all {{ items.length }} vault bookmarks ({{
              filteredItems.length
            }}
            matched)</span
          >
        </div>

        <!-- Tag Filter Chips -->
        <div
          v-if="allTags.length"
          class="bookmarks-view__block-9"
        >
          <button
            type="button"
            class="bookmarks-view__button-all"
            :class="
              activeTag === 'all'
                ? 'bookmarks-view__button-all--selected'
                : 'bookmarks-view__button-all--muted'
            "
            @click="activeTag = 'all'"
          >
            All
            <span class="bookmarks-view__text-4"
              >({{ items.length }})</span
            >
          </button>
          <button
            v-for="tagInfo in allTags"
            :key="tagInfo.tag"
            type="button"
            class="bookmarks-view__button-2"
            :class="
              activeTag === tagInfo.tag
                ? 'bookmarks-view__button--selected'
                : 'bookmarks-view__button--muted'
            "
            @click="activeTag = tagInfo.tag"
          >
            #{{ tagInfo.tag }}
            <span class="bookmarks-view__text-5"
              >({{ tagInfo.count }})</span
            >
          </button>
        </div>
      </div>

      <!-- Shimmer Skeleton Loading State -->
      <div v-if="isLoading" class="bookmarks-view__status" role="status">
        <span class="bookmarks-view__text-6">Loading bookmarks…</span>
        <div
          v-for="n in 5"
          :key="n"
          class="bookmarks-view__block-10"
          aria-hidden="true"
        >
          <div class="bookmarks-view__block-11">
            <div class="skeleton-shimmer bookmarks-view__block-12" />
            <div class="skeleton-shimmer bookmarks-view__block-13" />
          </div>
          <div class="bookmarks-view__block-14">
            <div class="skeleton-shimmer bookmarks-view__block-15" />
            <div class="skeleton-shimmer bookmarks-view__block-16" />
          </div>
          <div class="bookmarks-view__block-17">
            <div class="skeleton-shimmer bookmarks-view__block-18" />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="items.length === 0"
        class="bookmarks-view__block-19"
      >
        <div
          class="bookmarks-view__block-20"
        >
          <Layers class="bookmarks-view__layers" />
        </div>
        <h2 class="bookmarks-view__subtitle-no-bookmarks">No bookmarks yet</h2>
        <p class="bookmarks-view__text-7">
          Your private bookmark stream is empty. Add your first bookmark, or grab the gupt-mark
          bookmarklet from the
          <RouterLink
            to="/integrations/gupt-mark"
            class="bookmarks-view__router-link-integrations-page"
            >Integrations page</RouterLink
          >.
        </p>
        <RouterLink
          to="/bookmarks/new"
          class="bookmarks-view__router-link-2"
        >
          <Plus class="bookmarks-view__plus-2" :stroke-width="2.2" />
          <span>Add first bookmark</span>
        </RouterLink>
      </div>

      <!-- Search No Results -->
      <div
        v-else-if="filteredItems.length === 0"
        class="bookmarks-view__block-21"
      >
        <Search class="bookmarks-view__search-2" />
        <h2 class="bookmarks-view__subtitle-no-matching">No matching bookmarks</h2>
        <p class="bookmarks-view__text-8">
          No bookmarks match your search query "{{ searchQuery }}".
        </p>
        <button
          type="button"
          class="bookmarks-view__button-clear-filters"
          @click="
            searchQuery = '';
            activeTag = 'all';
          "
        >
          Clear filters
        </button>
      </div>

      <!-- Modern Table View -->
      <div v-else class="bookmarks-view__block-22">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          class="bookmarks-view__block-23"
          @click="navigateToDetail(item)"
        >
          <!-- Logo & Title (on hover shows url) -->
          <div class="bookmarks-view__block-24">
            <!-- Favicon / Logo -->
            <div
              class="bookmarks-view__block-25"
            >
              <img
                v-if="getFaviconUrl(item.url) && !faviconErrors[item.id]"
                :src="getFaviconUrl(item.url)"
                class="bookmarks-view__image"
                alt=""
                @error="onFaviconError(item.id)"
              />
              <Globe v-else class="bookmarks-view__globe" />
            </div>

            <!-- Title + Host badge (with URL tooltip on hover) -->
            <div class="bookmarks-view__block-26" :title="item.url">
              <span
                class="bookmarks-view__text-9"
              >
                {{ item.title || bookmarkHostname(item.url) || "Bookmark" }}
              </span>
              <span
                class="bookmarks-view__text-10"
              >
                {{ bookmarkHostname(item.url) }}
              </span>
            </div>
          </div>

          <!-- Tags -->
          <div class="bookmarks-view__block-27">
            <template v-if="item.tags && item.tags.length">
              <button
                v-for="tag in item.tags"
                :key="tag"
                type="button"
                class="bookmarks-view__button-3"
                :title="`Filter by #${tag}`"
                @click.stop="activeTag = tag"
              >
                #{{ tag }}
              </button>
            </template>
          </div>

          <!-- Open Bookmark in New Tab -->
          <div class="bookmarks-view__block-28" @click.stop>
            <button
              type="button"
              class="bookmarks-view__button-open-in"
              title="Open in new tab"
              @click="openBookmark(item, $event)"
            >
              <ExternalLink class="bookmarks-view__external-link" />
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.bookmarks-view__text-9:is(:where(.bookmarks-view__block-23):hover *) {
  color: var(--color-white);
}
}

@media (hover:hover) {
.bookmarks-view__router-link-get-the:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.bookmarks-view__button-sync-from:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.bookmarks-view__button-3:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.bookmarks-view__block-23:hover {
  border-color: var(--app-border-quiet);
}
}

@media (hover:hover) {
.bookmarks-view__router-link:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.bookmarks-view__router-link-2:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.bookmarks-view__button-open-in:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.bookmarks-view__router-link-get-the:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.bookmarks-view__button-sync-from:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.bookmarks-view__button-3:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.bookmarks-view__button-all--muted:hover {
  background-color: var(--app-surface-tint-soft);
}
}

@media (hover:hover) {
.bookmarks-view__button--muted:hover {
  background-color: var(--app-surface-tint-soft);
}
}

@media (hover:hover) {
.bookmarks-view__block-23:hover {
  background-color: var(--app-surface-inset);
}
}

@media (hover:hover) {
.bookmarks-view__router-link-get-the:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.bookmarks-view__button-sync-from:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.bookmarks-view__router-link-integrations-page:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.bookmarks-view__button-clear-filters:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.bookmarks-view__button:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.bookmarks-view__button-all--muted:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.bookmarks-view__button--muted:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.bookmarks-view__button-3:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.bookmarks-view__button-clear-filters:hover {
  text-decoration-line: underline;
}
}

@media (min-width:40rem) {
.bookmarks-view__text-10 {
  display: inline;
}
}

@media (min-width:40rem) {
.bookmarks-view__block-2 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.bookmarks-view__block-2 {
  align-items: center;
}
}

@media (min-width:40rem) {
.bookmarks-view__block-2 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.bookmarks-view__block-10 {
  padding-inline: calc(var(--spacing) * 3.5);
}
}

@media (min-width:40rem) {
.bookmarks-view__block-23 {
  padding-inline: calc(var(--spacing) * 3.5);
}
}

@media (min-width:40rem) {
.bookmarks-view__main {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:48rem) {
.bookmarks-view__block-14 {
  display: flex;
}
}

@media (min-width:48rem) {
.bookmarks-view__block-27 {
  display: flex;
}
}

@media (min-width:64rem) {
.bookmarks-view__main {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.bookmarks-view__search {
  pointer-events: none;
}
.bookmarks-view__text-6 {
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
.bookmarks-view__search {
  position: absolute;
}
.bookmarks-view__button {
  position: absolute;
}
.bookmarks-view__block-7 {
  position: relative;
}
.bookmarks-view__search {
  top: 50%;
}
.bookmarks-view__button {
  top: 50%;
}
.bookmarks-view__button {
  right: calc(var(--spacing) * 3);
}
.bookmarks-view__search {
  left: calc(var(--spacing) * 3);
}
.bookmarks-view__main {
  margin-inline: auto;
}
.bookmarks-view__text-2 {
  margin-top: var(--spacing);
}
.bookmarks-view__text-7 {
  margin-top: var(--spacing);
}
.bookmarks-view__text-8 {
  margin-top: var(--spacing);
}
.bookmarks-view__button-clear-filters {
  margin-top: calc(var(--spacing) * 4);
}
.bookmarks-view__router-link-2 {
  margin-top: calc(var(--spacing) * 6);
}
.bookmarks-view__search-2 {
  margin-bottom: calc(var(--spacing) * 3);
}
.bookmarks-view__block-20 {
  margin-bottom: calc(var(--spacing) * 4);
}
.bookmarks-view__text {
  margin-left: var(--spacing);
}
.bookmarks-view__text-4 {
  margin-left: var(--spacing);
}
.bookmarks-view__text-5 {
  margin-left: var(--spacing);
}
.bookmarks-view__block-2 {
  display: flex;
}
.bookmarks-view__block-3 {
  display: flex;
}
.bookmarks-view__block-4 {
  display: flex;
}
.bookmarks-view__block-5 {
  display: flex;
}
.bookmarks-view__button {
  display: flex;
}
.bookmarks-view__block-8 {
  display: flex;
}
.bookmarks-view__block-9 {
  display: flex;
}
.bookmarks-view__block-10 {
  display: flex;
}
.bookmarks-view__block-11 {
  display: flex;
}
.bookmarks-view__block-17 {
  display: flex;
}
.bookmarks-view__block-19 {
  display: flex;
}
.bookmarks-view__block-20 {
  display: flex;
}
.bookmarks-view__block-21 {
  display: flex;
}
.bookmarks-view__block-23 {
  display: flex;
}
.bookmarks-view__block-24 {
  display: flex;
}
.bookmarks-view__block-25 {
  display: flex;
}
.bookmarks-view__block-26 {
  display: flex;
}
.bookmarks-view__block-28 {
  display: flex;
}
.bookmarks-view__block-14 {
  display: none;
}
.bookmarks-view__text-10 {
  display: none;
}
.bookmarks-view__block-27 {
  display: none;
}
.bookmarks-view__router-link-get-the {
  display: inline-flex;
}
.bookmarks-view__button-sync-from {
  display: inline-flex;
}
.bookmarks-view__router-link {
  display: inline-flex;
}
.bookmarks-view__router-link-2 {
  display: inline-flex;
}
.bookmarks-view__button-3 {
  display: inline-flex;
}
.bookmarks-view__button-open-in {
  display: inline-flex;
}
.bookmarks-view__text-3 {
  height: calc(var(--spacing) * 1.5);
}
.bookmarks-view__bookmark {
  height: calc(var(--spacing) * 3.5);
}
.bookmarks-view__refresh-cw {
  height: calc(var(--spacing) * 3.5);
}
.bookmarks-view__plus {
  height: calc(var(--spacing) * 3.5);
}
.bookmarks-view__plus-2 {
  height: calc(var(--spacing) * 3.5);
}
.bookmarks-view__globe {
  height: calc(var(--spacing) * 3.5);
}
.bookmarks-view__external-link {
  height: calc(var(--spacing) * 3.5);
}
.bookmarks-view__check {
  height: calc(var(--spacing) * 4);
}
.bookmarks-view__search {
  height: calc(var(--spacing) * 4);
}
.bookmarks-view__x {
  height: calc(var(--spacing) * 4);
}
.bookmarks-view__block-13 {
  height: calc(var(--spacing) * 4);
}
.bookmarks-view__image {
  height: calc(var(--spacing) * 4);
}
.bookmarks-view__block-15 {
  height: calc(var(--spacing) * 5);
}
.bookmarks-view__block-16 {
  height: calc(var(--spacing) * 5);
}
.bookmarks-view__layers {
  height: calc(var(--spacing) * 6);
}
.bookmarks-view__block-12 {
  height: calc(var(--spacing) * 7);
}
.bookmarks-view__search-2 {
  height: calc(var(--spacing) * 7);
}
.bookmarks-view__block-25 {
  height: calc(var(--spacing) * 7);
}
.bookmarks-view__router-link-get-the {
  height: calc(var(--spacing) * 8);
}
.bookmarks-view__button-sync-from {
  height: calc(var(--spacing) * 8);
}
.bookmarks-view__router-link {
  height: calc(var(--spacing) * 8);
}
.bookmarks-view__block-18 {
  height: calc(var(--spacing) * 8);
}
.bookmarks-view__button-open-in {
  height: calc(var(--spacing) * 8);
}
.bookmarks-view__router-link-2 {
  height: calc(var(--spacing) * 9);
}
.bookmarks-view__field-text {
  height: calc(var(--spacing) * 10);
}
.bookmarks-view__block-20 {
  height: calc(var(--spacing) * 12);
}
.bookmarks-view__button {
  min-height: 32px;
}
.bookmarks-view__block {
  min-height: 100vh;
}
.bookmarks-view__text-3 {
  width: calc(var(--spacing) * 1.5);
}
.bookmarks-view__bookmark {
  width: calc(var(--spacing) * 3.5);
}
.bookmarks-view__refresh-cw {
  width: calc(var(--spacing) * 3.5);
}
.bookmarks-view__plus {
  width: calc(var(--spacing) * 3.5);
}
.bookmarks-view__plus-2 {
  width: calc(var(--spacing) * 3.5);
}
.bookmarks-view__globe {
  width: calc(var(--spacing) * 3.5);
}
.bookmarks-view__external-link {
  width: calc(var(--spacing) * 3.5);
}
.bookmarks-view__check {
  width: calc(var(--spacing) * 4);
}
.bookmarks-view__search {
  width: calc(var(--spacing) * 4);
}
.bookmarks-view__x {
  width: calc(var(--spacing) * 4);
}
.bookmarks-view__image {
  width: calc(var(--spacing) * 4);
}
.bookmarks-view__layers {
  width: calc(var(--spacing) * 6);
}
.bookmarks-view__block-12 {
  width: calc(var(--spacing) * 7);
}
.bookmarks-view__search-2 {
  width: calc(var(--spacing) * 7);
}
.bookmarks-view__block-25 {
  width: calc(var(--spacing) * 7);
}
.bookmarks-view__router-link-get-the {
  width: calc(var(--spacing) * 8);
}
.bookmarks-view__block-18 {
  width: calc(var(--spacing) * 8);
}
.bookmarks-view__button-open-in {
  width: calc(var(--spacing) * 8);
}
.bookmarks-view__block-16 {
  width: calc(var(--spacing) * 12);
}
.bookmarks-view__block-20 {
  width: calc(var(--spacing) * 12);
}
.bookmarks-view__block-15 {
  width: calc(var(--spacing) * 14);
}
.bookmarks-view__block-13 {
  width: calc(var(--spacing) * 48);
}
.bookmarks-view__main {
  width: 100%;
}
.bookmarks-view__field-text {
  width: 100%;
}
.bookmarks-view__main {
  max-width: var(--container-6xl);
}
.bookmarks-view__text-10 {
  max-width: calc(var(--spacing) * 40);
}
.bookmarks-view__text-7 {
  max-width: var(--container-sm);
}
.bookmarks-view__block-27 {
  max-width: var(--container-xs);
}
.bookmarks-view__block-11 {
  min-width: 0;
}
.bookmarks-view__block-24 {
  min-width: 0;
}
.bookmarks-view__block-26 {
  min-width: 0;
}
.bookmarks-view__button {
  min-width: 32px;
}
.bookmarks-view__block-11 {
  flex: 1;
}
.bookmarks-view__block-24 {
  flex: 1;
}
.bookmarks-view__block-26 {
  flex: 1;
}
.bookmarks-view__check {
  flex-shrink: 0;
}
.bookmarks-view__block-12 {
  flex-shrink: 0;
}
.bookmarks-view__block-25 {
  flex-shrink: 0;
}
.bookmarks-view__text-10 {
  flex-shrink: 0;
}
.bookmarks-view__block-27 {
  flex-shrink: 0;
}
.bookmarks-view__block-28 {
  flex-shrink: 0;
}
.bookmarks-view__search {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.bookmarks-view__button {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.bookmarks-view__refresh-cw--spin {
  animation: var(--animate-spin);
}
.bookmarks-view__router-link-get-the {
  cursor: pointer;
}
.bookmarks-view__button-sync-from {
  cursor: pointer;
}
.bookmarks-view__router-link {
  cursor: pointer;
}
.bookmarks-view__button {
  cursor: pointer;
}
.bookmarks-view__button-all {
  cursor: pointer;
}
.bookmarks-view__button-2 {
  cursor: pointer;
}
.bookmarks-view__button-clear-filters {
  cursor: pointer;
}
.bookmarks-view__block-23 {
  cursor: pointer;
}
.bookmarks-view__button-3 {
  cursor: pointer;
}
.bookmarks-view__button-open-in {
  cursor: pointer;
}
.bookmarks-view__block-9 {
  scrollbar-width: none;
}
.bookmarks-view__block-2 {
  flex-direction: column;
}
.bookmarks-view__block-19 {
  flex-direction: column;
}
.bookmarks-view__block-21 {
  flex-direction: column;
}
.bookmarks-view__block-5 {
  flex-wrap: wrap;
}
.bookmarks-view__block-3 {
  align-items: center;
}
.bookmarks-view__block-4 {
  align-items: center;
}
.bookmarks-view__block-5 {
  align-items: center;
}
.bookmarks-view__router-link-get-the {
  align-items: center;
}
.bookmarks-view__button-sync-from {
  align-items: center;
}
.bookmarks-view__router-link {
  align-items: center;
}
.bookmarks-view__button {
  align-items: center;
}
.bookmarks-view__block-8 {
  align-items: center;
}
.bookmarks-view__block-10 {
  align-items: center;
}
.bookmarks-view__block-11 {
  align-items: center;
}
.bookmarks-view__block-17 {
  align-items: center;
}
.bookmarks-view__block-19 {
  align-items: center;
}
.bookmarks-view__block-20 {
  align-items: center;
}
.bookmarks-view__router-link-2 {
  align-items: center;
}
.bookmarks-view__block-21 {
  align-items: center;
}
.bookmarks-view__block-23 {
  align-items: center;
}
.bookmarks-view__block-24 {
  align-items: center;
}
.bookmarks-view__block-25 {
  align-items: center;
}
.bookmarks-view__block-26 {
  align-items: center;
}
.bookmarks-view__block-27 {
  align-items: center;
}
.bookmarks-view__button-3 {
  align-items: center;
}
.bookmarks-view__block-28 {
  align-items: center;
}
.bookmarks-view__button-open-in {
  align-items: center;
}
.bookmarks-view__block-10 {
  justify-content: space-between;
}
.bookmarks-view__block-23 {
  justify-content: space-between;
}
.bookmarks-view__router-link-get-the {
  justify-content: center;
}
.bookmarks-view__button {
  justify-content: center;
}
.bookmarks-view__block-19 {
  justify-content: center;
}
.bookmarks-view__block-20 {
  justify-content: center;
}
.bookmarks-view__block-21 {
  justify-content: center;
}
.bookmarks-view__block-25 {
  justify-content: center;
}
.bookmarks-view__button-open-in {
  justify-content: center;
}
.bookmarks-view__button-sync-from {
  gap: calc(var(--spacing) * 1.5);
}
.bookmarks-view__router-link {
  gap: calc(var(--spacing) * 1.5);
}
.bookmarks-view__block-8 {
  gap: calc(var(--spacing) * 1.5);
}
.bookmarks-view__block-9 {
  gap: calc(var(--spacing) * 1.5);
}
.bookmarks-view__block-14 {
  gap: calc(var(--spacing) * 1.5);
}
.bookmarks-view__router-link-2 {
  gap: calc(var(--spacing) * 1.5);
}
.bookmarks-view__block-27 {
  gap: calc(var(--spacing) * 1.5);
}
.bookmarks-view__block-4 {
  gap: calc(var(--spacing) * 2);
}
.bookmarks-view__block-5 {
  gap: calc(var(--spacing) * 2);
}
.bookmarks-view__block-26 {
  gap: calc(var(--spacing) * 2);
}
.bookmarks-view__block-3 {
  gap: calc(var(--spacing) * 2.5);
}
.bookmarks-view__block-10 {
  gap: calc(var(--spacing) * 3);
}
.bookmarks-view__block-11 {
  gap: calc(var(--spacing) * 3);
}
.bookmarks-view__block-23 {
  gap: calc(var(--spacing) * 3);
}
.bookmarks-view__block-24 {
  gap: calc(var(--spacing) * 3);
}
.bookmarks-view__block-2 {
  gap: calc(var(--spacing) * 4);
}
:where(.bookmarks-view__status>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.bookmarks-view__block-22>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.bookmarks-view__block-6>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.bookmarks-view__main>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
.bookmarks-view__text-9 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.bookmarks-view__text-10 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.bookmarks-view__block-25 {
  overflow: hidden;
}
.bookmarks-view__block-27 {
  overflow: hidden;
}
.bookmarks-view__block-9 {
  overflow-x: auto;
}
.bookmarks-view__text-3 {
  border-radius: 3.40282e38px;
}
.bookmarks-view__router-link-get-the {
  border-radius: var(--radius-lg);
}
.bookmarks-view__button-sync-from {
  border-radius: var(--radius-lg);
}
.bookmarks-view__router-link {
  border-radius: var(--radius-lg);
}
.bookmarks-view__block-12 {
  border-radius: var(--radius-lg);
}
.bookmarks-view__block-18 {
  border-radius: var(--radius-lg);
}
.bookmarks-view__router-link-2 {
  border-radius: var(--radius-lg);
}
.bookmarks-view__block-25 {
  border-radius: var(--radius-lg);
}
.bookmarks-view__button-open-in {
  border-radius: var(--radius-lg);
}
.bookmarks-view__button-all {
  border-radius: var(--radius-md);
}
.bookmarks-view__button-2 {
  border-radius: var(--radius-md);
}
.bookmarks-view__block-13 {
  border-radius: var(--radius-md);
}
.bookmarks-view__block-15 {
  border-radius: var(--radius-md);
}
.bookmarks-view__block-16 {
  border-radius: var(--radius-md);
}
.bookmarks-view__button-3 {
  border-radius: var(--radius-md);
}
.bookmarks-view__block-4 {
  border-radius: var(--radius-xl);
}
.bookmarks-view__field-text {
  border-radius: var(--radius-xl);
}
.bookmarks-view__block-19 {
  border-radius: var(--radius-xl);
}
.bookmarks-view__block-20 {
  border-radius: var(--radius-xl);
}
.bookmarks-view__block-21 {
  border-radius: var(--radius-xl);
}
.bookmarks-view__block-23 {
  border-radius: var(--radius-xl);
}
.bookmarks-view__block-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmarks-view__router-link-get-the {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmarks-view__button-sync-from {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmarks-view__field-text {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmarks-view__button-all {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmarks-view__button-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmarks-view__block-19 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmarks-view__block-20 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmarks-view__block-21 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmarks-view__block-23 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmarks-view__block-25 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmarks-view__button-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bookmarks-view__block-2 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.bookmarks-view__block-4 {
  border-color: #005f4699;
}
.bookmarks-view__block-23 {
  border-color: #0000;
}
.bookmarks-view__router-link-get-the {
  border-color: var(--ui-zinc-800);
}
.bookmarks-view__button-sync-from {
  border-color: var(--ui-zinc-800);
}
.bookmarks-view__field-text {
  border-color: var(--ui-zinc-800);
}
.bookmarks-view__button-all--selected {
  border-color: var(--ui-zinc-800);
}
.bookmarks-view__button--selected {
  border-color: var(--ui-zinc-800);
}
.bookmarks-view__block-20 {
  border-color: var(--ui-zinc-800);
}
.bookmarks-view__block-25 {
  border-color: var(--ui-zinc-800);
}
.bookmarks-view__button-3 {
  border-color: var(--ui-zinc-800);
}
.bookmarks-view__block-2 {
  border-color: var(--app-border-quiet);
}
.bookmarks-view__button-all--muted {
  border-color: var(--app-border-quiet);
}
.bookmarks-view__button--muted {
  border-color: var(--app-border-quiet);
}
.bookmarks-view__block-19 {
  border-color: var(--app-border-quiet);
}
.bookmarks-view__block-21 {
  border-color: var(--app-border-quiet);
}
.bookmarks-view__block {
  background-color: var(--ui-black);
}
.bookmarks-view__text-3 {
  background-color: var(--color-emerald-400);
}
.bookmarks-view__block-4 {
  background-color: #004e3b40;
}
.bookmarks-view__router-link {
  background-color: var(--color-white);
}
.bookmarks-view__router-link-2 {
  background-color: var(--color-white);
}
.bookmarks-view__button-open-in {
  background-color: var(--color-white);
}
.bookmarks-view__button-all--selected {
  background-color: var(--ui-zinc-800);
}
.bookmarks-view__button--selected {
  background-color: var(--ui-zinc-800);
}
.bookmarks-view__block-20 {
  background-color: var(--ui-zinc-900);
}
.bookmarks-view__block-25 {
  background-color: var(--ui-zinc-900);
}
.bookmarks-view__router-link-get-the {
  background-color: var(--app-surface-tint);
}
.bookmarks-view__button-sync-from {
  background-color: var(--app-surface-tint);
}
.bookmarks-view__button-3 {
  background-color: var(--app-surface-tint);
}
.bookmarks-view__block-19 {
  background-color: var(--app-surface-inset);
}
.bookmarks-view__block-21 {
  background-color: var(--app-surface-inset);
}
.bookmarks-view__field-text {
  background-color: var(--app-surface-inset-strong);
}
.bookmarks-view__image {
  object-fit: contain;
}
.bookmarks-view__block-8 {
  padding-inline: var(--spacing);
}
.bookmarks-view__button-3 {
  padding-inline: calc(var(--spacing) * 2);
}
.bookmarks-view__button-sync-from {
  padding-inline: calc(var(--spacing) * 3);
}
.bookmarks-view__router-link {
  padding-inline: calc(var(--spacing) * 3);
}
.bookmarks-view__button-all {
  padding-inline: calc(var(--spacing) * 3);
}
.bookmarks-view__button-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.bookmarks-view__block-10 {
  padding-inline: calc(var(--spacing) * 3);
}
.bookmarks-view__block-23 {
  padding-inline: calc(var(--spacing) * 3);
}
.bookmarks-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.bookmarks-view__block-4 {
  padding-inline: calc(var(--spacing) * 4);
}
.bookmarks-view__router-link-2 {
  padding-inline: calc(var(--spacing) * 4);
}
.bookmarks-view__block-19 {
  padding-inline: calc(var(--spacing) * 6);
}
.bookmarks-view__block-21 {
  padding-inline: calc(var(--spacing) * 6);
}
.bookmarks-view__button-3 {
  padding-block: calc(var(--spacing) * .5);
}
.bookmarks-view__button-all {
  padding-block: var(--spacing);
}
.bookmarks-view__button-2 {
  padding-block: var(--spacing);
}
.bookmarks-view__block-10 {
  padding-block: calc(var(--spacing) * 2.5);
}
.bookmarks-view__block-23 {
  padding-block: calc(var(--spacing) * 2.5);
}
.bookmarks-view__block-4 {
  padding-block: calc(var(--spacing) * 3);
}
.bookmarks-view__main {
  padding-block: calc(var(--spacing) * 6);
}
.bookmarks-view__block-21 {
  padding-block: calc(var(--spacing) * 12);
}
.bookmarks-view__block-19 {
  padding-block: calc(var(--spacing) * 16);
}
.bookmarks-view__field-text {
  padding-right: calc(var(--spacing) * 9);
}
.bookmarks-view__block-9 {
  padding-bottom: var(--spacing);
}
.bookmarks-view__block-2 {
  padding-bottom: calc(var(--spacing) * 5);
}
.bookmarks-view__block {
  padding-bottom: calc(var(--spacing) * 16);
}
.bookmarks-view__field-text {
  padding-left: calc(var(--spacing) * 9);
}
.bookmarks-view__block-19 {
  text-align: center;
}
.bookmarks-view__block-21 {
  text-align: center;
}
.bookmarks-view__text {
  font-family: var(--font-mono);
}
.bookmarks-view__block-8 {
  font-family: var(--font-mono);
}
.bookmarks-view__text-4 {
  font-family: var(--font-mono);
}
.bookmarks-view__text-5 {
  font-family: var(--font-mono);
}
.bookmarks-view__text-10 {
  font-family: var(--font-mono);
}
.bookmarks-view__text-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bookmarks-view__block-4 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bookmarks-view__field-text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bookmarks-view__subtitle-no-bookmarks {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bookmarks-view__text-7 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bookmarks-view__subtitle-no-matching {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bookmarks-view__text-8 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bookmarks-view__text-9 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bookmarks-view__title-bookmarks {
  font-size: var(--text-xl);
  line-height: var(--leading,var(--text-xl--line-height));
}
.bookmarks-view__button-sync-from {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmarks-view__router-link {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmarks-view__button-all {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmarks-view__button-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmarks-view__router-link-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmarks-view__button-clear-filters {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bookmarks-view__text-4 {
  font-size: 10px;
}
.bookmarks-view__text-5 {
  font-size: 10px;
}
.bookmarks-view__button-3 {
  font-size: 10px;
}
.bookmarks-view__text {
  font-size: 11px;
}
.bookmarks-view__block-8 {
  font-size: 11px;
}
.bookmarks-view__text-10 {
  font-size: 11px;
}
.bookmarks-view__text-7 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.bookmarks-view__text {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmarks-view__button-sync-from {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmarks-view__button-all {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmarks-view__button-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmarks-view__router-link-integrations-page {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmarks-view__button-clear-filters {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmarks-view__text-9 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmarks-view__button-3 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bookmarks-view__title-bookmarks {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.bookmarks-view__router-link {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.bookmarks-view__subtitle-no-bookmarks {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.bookmarks-view__router-link-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.bookmarks-view__subtitle-no-matching {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.bookmarks-view__title-bookmarks {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.bookmarks-view__subtitle-no-bookmarks {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.bookmarks-view__button-all {
  white-space: nowrap;
}
.bookmarks-view__button-2 {
  white-space: nowrap;
}
.bookmarks-view__button-3 {
  white-space: nowrap;
}
.bookmarks-view__router-link {
  color: var(--ui-black);
}
.bookmarks-view__router-link-2 {
  color: var(--ui-black);
}
.bookmarks-view__button-open-in {
  color: var(--ui-black);
}
.bookmarks-view__block-4 {
  color: var(--color-emerald-200);
}
.bookmarks-view__title-bookmarks {
  color: var(--color-white);
}
.bookmarks-view__button-all--selected {
  color: var(--color-white);
}
.bookmarks-view__button--selected {
  color: var(--color-white);
}
.bookmarks-view__block {
  color: var(--ui-zinc-100);
}
.bookmarks-view__field-text {
  color: var(--ui-zinc-100);
}
.bookmarks-view__subtitle-no-bookmarks {
  color: var(--ui-zinc-200);
}
.bookmarks-view__router-link-integrations-page {
  color: var(--ui-zinc-200);
}
.bookmarks-view__subtitle-no-matching {
  color: var(--ui-zinc-200);
}
.bookmarks-view__text-9 {
  color: var(--ui-zinc-200);
}
.bookmarks-view__router-link-get-the {
  color: var(--ui-zinc-300);
}
.bookmarks-view__button-sync-from {
  color: var(--ui-zinc-300);
}
.bookmarks-view__block-8 {
  color: var(--ui-zinc-400);
}
.bookmarks-view__button-all--muted {
  color: var(--ui-zinc-400);
}
.bookmarks-view__button--muted {
  color: var(--ui-zinc-400);
}
.bookmarks-view__button-clear-filters {
  color: var(--ui-zinc-400);
}
.bookmarks-view__button-3 {
  color: var(--ui-zinc-400);
}
.bookmarks-view__text {
  color: var(--ui-zinc-500);
}
.bookmarks-view__text-2 {
  color: var(--ui-zinc-500);
}
.bookmarks-view__text-4 {
  color: var(--ui-zinc-500);
}
.bookmarks-view__text-5 {
  color: var(--ui-zinc-500);
}
.bookmarks-view__block-20 {
  color: var(--ui-zinc-500);
}
.bookmarks-view__text-7 {
  color: var(--ui-zinc-500);
}
.bookmarks-view__text-8 {
  color: var(--ui-zinc-500);
}
.bookmarks-view__search {
  color: var(--ui-zinc-600);
}
.bookmarks-view__button {
  color: var(--ui-zinc-600);
}
.bookmarks-view__search-2 {
  color: var(--ui-zinc-600);
}
.bookmarks-view__globe {
  color: var(--ui-zinc-600);
}
.bookmarks-view__text-10 {
  color: var(--ui-zinc-600);
}
.bookmarks-view__text {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.bookmarks-view__text-4 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.bookmarks-view__text-5 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.bookmarks-view__text-10 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.bookmarks-view__router-link-integrations-page {
  text-decoration-line: underline;
}
.bookmarks-view__router-link-integrations-page {
  text-underline-offset: 2px;
}
.bookmarks-view__router-link-get-the {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.bookmarks-view__button-sync-from {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.bookmarks-view__router-link {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.bookmarks-view__button-all--selected {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.bookmarks-view__button--selected {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.bookmarks-view__router-link-2 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.bookmarks-view__button-open-in {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.bookmarks-view__router-link-get-the {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmarks-view__button-sync-from {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmarks-view__router-link {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmarks-view__button-all {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmarks-view__button-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmarks-view__router-link-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmarks-view__button-open-in {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmarks-view__field-text {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmarks-view__block-23 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmarks-view__text-9 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmarks-view__button-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bookmarks-view__button-all {
  -webkit-user-select: none;
  user-select: none;
}
.bookmarks-view__button-2 {
  -webkit-user-select: none;
  user-select: none;
}
.bookmarks-view__block-9 {
  -ms-overflow-style: none;
}
.bookmarks-view__field-text::placeholder {
  color: var(--ui-zinc-600);
}
.bookmarks-view__field-text:focus {
  border-color: var(--ui-zinc-600);
}
.bookmarks-view__field-text:focus {
  --outline-style: none;
  outline-style: none;
}
.bookmarks-view__router-link:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.bookmarks-view__router-link-2:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.bookmarks-view__button-sync-from:disabled {
  opacity: .5;
}
.bookmarks-view__block-9::-webkit-scrollbar {
  display: none;
}
[data-theme="light"] .bookmarks-view__block-4 {
  color: var(--app-success);
}
[data-theme="light"] .bookmarks-view__router-link-get-the {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmarks-view__button-sync-from {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmarks-view__block-8 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmarks-view__button-all--muted {
  color: var(--app-muted);
}
[data-theme="light"] .bookmarks-view__button--muted {
  color: var(--app-muted);
}
[data-theme="light"] .bookmarks-view__button-clear-filters {
  color: var(--app-muted);
}
[data-theme="light"] .bookmarks-view__button-3 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmarks-view__text {
  color: var(--app-muted);
}
[data-theme="light"] .bookmarks-view__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmarks-view__text-4 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmarks-view__text-5 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmarks-view__block-20 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmarks-view__text-7 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmarks-view__text-8 {
  color: var(--app-muted);
}
[data-theme="light"] .bookmarks-view__search {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmarks-view__button {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmarks-view__search-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmarks-view__globe {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmarks-view__text-10 {
  color: var(--app-text-soft);
}
[data-theme="light"] .bookmarks-view__button:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .bookmarks-view__button-all--muted:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .bookmarks-view__button--muted:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .bookmarks-view__button-3:hover {
  color: var(--app-text) !important;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.bookmarks-view__block-4 {
  border-color: color-mix(in oklab,var(--color-emerald-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bookmarks-view__block-4 {
  background-color: color-mix(in oklab,var(--color-emerald-900) 25%,transparent);
}
}

}
</style>
