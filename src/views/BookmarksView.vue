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
} from "@/icons";
import PageHeader from "@/components/PageHeader.vue";
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
      <PageHeader eyebrow="Private vault" title="Bookmarks" :count="items.length">
        <p class="bookmarks-view__lede">
          End-to-end encrypted bookmarks stored privately on your relays.
        </p>
        <template #actions>
          <!-- gupt-mark now lives under Integrations; keep a pointer for discoverability -->
          <RouterLink
            to="/integrations/gupt-mark"
            class="bookmarks-action bookmarks-action--icon"
            title="Get the gupt-mark bookmarklet"
            aria-label="Get the gupt-mark bookmarklet"
          >
            <Bookmark class="bookmarks-action__icon" />
          </RouterLink>

          <button
            type="button"
            :disabled="isRefreshing"
            class="bookmarks-action"
            title="Sync from relays"
            @click="refreshFromRelay"
          >
            <RefreshCw class="bookmarks-action__icon" :class="{ 'bookmarks-action__icon--spin': isRefreshing }" />
            <span>Sync</span>
          </button>

          <RouterLink to="/bookmarks/new" class="bookmarks-action bookmarks-action--ink">
            <Plus class="bookmarks-action__icon" :stroke-width="2.2" />
            <span>New bookmark</span>
          </RouterLink>
        </template>
      </PageHeader>

      <AppAlertBanner v-if="error" :message="error" />

      <!-- Queued gupt-mark links were just imported -->
      <div
        v-if="importedCount > 0"
        class="bookmarks-import"
        role="status"
      >
        <Check class="bookmarks-import__icon" aria-hidden="true" />
        <span>
          Imported {{ importedCount }} link{{ importedCount === 1 ? "" : "s" }} waiting from
          gupt-mark.
        </span>
      </div>

      <!-- Search and Tag Filter Bar -->
      <div class="bookmarks-filters">
        <div class="bookmarks-search">
          <Search class="bookmarks-search__icon" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search all bookmarks by title, URL, domain, or tags…"
            class="bookmarks-search__field"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="bookmarks-search__clear"
            aria-label="Clear search"
            @click="searchQuery = ''"
          >
            <X class="bookmarks-search__clear-icon" />
          </button>
        </div>

        <!-- All items scope indicator -->
        <p v-if="searchQuery" class="bookmarks-filters__scope">
          Searching all {{ items.length }} vault bookmarks ({{ filteredItems.length }} matched)
        </p>

        <!-- Tag Filter Chips -->
        <div v-if="allTags.length" class="bookmarks-filters__tags">
          <button
            type="button"
            class="bookmarks-chip"
            :class="{ 'is-active': activeTag === 'all' }"
            @click="activeTag = 'all'"
          >
            All
            <span class="bookmarks-chip__count">{{ items.length }}</span>
          </button>
          <button
            v-for="tagInfo in allTags"
            :key="tagInfo.tag"
            type="button"
            class="bookmarks-chip"
            :class="{ 'is-active': activeTag === tagInfo.tag }"
            @click="activeTag = tagInfo.tag"
          >
            #{{ tagInfo.tag }}
            <span class="bookmarks-chip__count">{{ tagInfo.count }}</span>
          </button>
        </div>
      </div>

      <!-- Shimmer Skeleton Loading State -->
      <div v-if="isLoading" class="bookmarks-view__status" role="status">
        <span class="bookmarks-loading__label">Loading bookmarks…</span>
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
        class="bookmarks-empty"
      >
        <p class="bookmarks-empty__eyebrow">Empty vault</p>
        <h2 class="bookmarks-empty__title">No bookmarks yet</h2>
        <p class="bookmarks-empty__lede">
          Your private bookmark stream is empty. Add your first bookmark, or grab the gupt-mark
          bookmarklet from the
          <RouterLink
            to="/integrations/gupt-mark"
            class="bookmarks-empty__link"
            >Integrations page</RouterLink
          >.
        </p>
        <RouterLink to="/bookmarks/new" class="bookmarks-action bookmarks-action--ink bookmarks-empty__action">
          <Plus class="bookmarks-action__icon" :stroke-width="2.2" />
          <span>Add first bookmark</span>
        </RouterLink>
      </div>

      <!-- Search No Results -->
      <div
        v-else-if="filteredItems.length === 0"
        class="bookmarks-empty bookmarks-empty--quiet"
      >
        <Search class="bookmarks-empty__mark" aria-hidden="true" />
        <h2 class="bookmarks-empty__title">No matching bookmarks</h2>
        <p class="bookmarks-empty__lede">
          No bookmarks match your search query "{{ searchQuery }}".
        </p>
        <button
          type="button"
          class="bookmarks-action"
          @click="
            searchQuery = '';
            activeTag = 'all';
          "
        >
          Clear filters
        </button>
      </div>

      <!-- Modern Table View -->
      <div v-else class="bookmarks-list">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          class="bookmarks-row"
          @click="navigateToDetail(item)"
        >
          <!-- Logo & Title -->
          <div class="bookmarks-row__identity">
            <span class="bookmarks-row__mark">
              <img
                v-if="getFaviconUrl(item.url) && !faviconErrors[item.id]"
                :src="getFaviconUrl(item.url)"
                class="bookmarks-row__favicon"
                alt=""
                @error="onFaviconError(item.id)"
              />
              <Globe v-else class="bookmarks-row__globe" aria-hidden="true" />
            </span>

            <div class="bookmarks-row__text" :title="item.url">
              <span class="bookmarks-row__title">
                {{ item.title || bookmarkHostname(item.url) || "Bookmark" }}
              </span>
              <span class="bookmarks-row__host">
                {{ bookmarkHostname(item.url) }}
              </span>
            </div>
          </div>

          <!-- Tags -->
          <div v-if="item.tags && item.tags.length" class="bookmarks-row__tags">
            <button
              v-for="tag in item.tags"
              :key="tag"
              type="button"
              class="bookmarks-row__tag"
              :title="`Filter by #${tag}`"
              @click.stop="activeTag = tag"
            >
              #{{ tag }}
            </button>
          </div>

          <!-- Open Bookmark in New Tab -->
          <div class="bookmarks-row__actions" @click.stop>
            <button
              type="button"
              class="bookmarks-row__action"
              title="Open in new tab"
              aria-label="Open bookmark in a new tab"
              @click="openBookmark(item, $event)"
            >
              <ExternalLink class="bookmarks-row__action-icon" />
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Ledger pass: bookmarks are one ruled register with a favicon column. */

.bookmarks-view__lede {
  max-width: 56ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.bookmarks-action {
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

.bookmarks-action:active {
  transform: translateY(1px);
}

.bookmarks-action:disabled {
  opacity: 0.5;
  cursor: default;
}

.bookmarks-action--icon {
  width: 32px;
  padding-inline: 0;
}

.bookmarks-action--ink {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.bookmarks-action__icon {
  width: 13px;
  height: 13px;
}

.bookmarks-action__icon--spin {
  animation: var(--animate-spin);
}

.bookmarks-import {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-left: 2px solid var(--app-success);
  border-radius: var(--app-radius-sm);
  background: var(--app-success-soft);
  font-size: var(--app-text-meta);
  line-height: 1.5;
  color: var(--app-text);
  animation: ledger-rise 360ms var(--app-ease-emphasized) both;
}

.bookmarks-import__icon {
  flex-shrink: 0;
  width: 13px;
  height: 13px;
  color: var(--app-success);
}

.bookmarks-filters {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.bookmarks-search {
  position: relative;
  display: block;
}

.bookmarks-search__icon {
  position: absolute;
  top: 50%;
  left: 14px;
  width: 14px;
  height: 14px;
  transform: translateY(-50%);
  color: var(--app-muted-2);
  pointer-events: none;
}

.bookmarks-search__field {
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

.bookmarks-search__field::placeholder {
  color: var(--app-muted-2);
}

.bookmarks-search__field:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.bookmarks-search__clear {
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

.bookmarks-search__clear-icon {
  width: 13px;
  height: 13px;
}

.bookmarks-filters__scope {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.bookmarks-filters__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bookmarks-chip {
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

.bookmarks-chip__count {
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.bookmarks-chip.is-active {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.bookmarks-chip.is-active .bookmarks-chip__count {
  color: color-mix(in oklab, var(--app-bg) 65%, transparent);
}

.bookmarks-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-fade 320ms var(--app-ease-standard) both;
}

.bookmarks-row {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  padding: 12px 14px;
  cursor: pointer;
  transition: background-color var(--app-dur-fast) var(--app-ease-standard);
}

.bookmarks-row + .bookmarks-row {
  border-top: 1px solid var(--app-border);
}

.bookmarks-row__identity {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.bookmarks-row__mark {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  color: var(--app-muted-2);
  overflow: hidden;
}

.bookmarks-row__favicon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.bookmarks-row__globe {
  width: 13px;
  height: 13px;
}

.bookmarks-row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bookmarks-row__title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: -0.005em;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmarks-row__host {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmarks-row__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}

.bookmarks-row__tag {
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

.bookmarks-row__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}

.bookmarks-row__action {
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

.bookmarks-row__action-icon {
  width: 13px;
  height: 13px;
}

.bookmarks-empty {
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

.bookmarks-empty__eyebrow {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.bookmarks-empty__mark {
  width: 18px;
  height: 18px;
  color: var(--app-muted-2);
}

.bookmarks-empty__title {
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

.bookmarks-empty__lede {
  max-width: 42ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.bookmarks-empty__link {
  color: var(--app-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.bookmarks-empty__action {
  margin-top: var(--app-space-3);
}

.bookmarks-loading__label {
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
  .bookmarks-action:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .bookmarks-action--ink:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .bookmarks-row:hover {
    background: var(--app-surface-soft);
  }

  .bookmarks-row__action:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }

  .bookmarks-row__tag:hover {
    color: var(--app-text);
  }

  .bookmarks-chip:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .bookmarks-search__clear:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }
}

@media (max-width: 34rem) {
  .bookmarks-row__tags {
    display: none;
  }
}

@media (pointer: coarse) {
  .bookmarks-action,
  .bookmarks-search__clear,
  .bookmarks-chip {
    min-height: var(--app-touch-h);
  }

  .bookmarks-action--icon {
    width: var(--app-touch-h);
  }

  .bookmarks-row__action {
    width: var(--app-touch-h);
    height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bookmarks-list,
  .bookmarks-empty,
  .bookmarks-import {
    animation: none;
  }

  .bookmarks-action,
  .bookmarks-chip,
  .bookmarks-row,
  .bookmarks-row__action {
    transition: none;
  }
}
</style>
