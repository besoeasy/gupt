<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  Shield,
  Plus,
  Copy,
  Check,
  Trash2,
  Loader2,
  RefreshCw,
  X,
  ExternalLink,
  Search,
  FileText,
  KeyRound,
  CreditCard,
  Wifi,
  LockKeyhole,
  Bookmark,
  Bitcoin,
  Shuffle,
  Clock,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { useRouter } from "vue-router";
import { useIdentityStore } from "@/stores/identity";
import { getVaultCachedItems, fetchVaultItems, deleteVaultItem } from "@/lib/vault";
import { copyToClipboard as copyText } from "@/lib/clipboard";

marked.setOptions({
  breaks: true,
  gfm: true,
});

const identity = useIdentityStore();
const router = useRouter();
const isLoading = ref(true);
const isRefreshing = ref(false);
const items = ref([]);
const showViewModal = ref(false);
const selectedItem = ref(null);

const copiedFields = ref({});
const activeFilter = ref("all");
const searchQuery = ref("");
const error = ref("");
let expiryInterval = null;
const expirySecondsLeft = ref(null);
const randomItem = ref(null);
const clearOutMode = ref(false);

function computeExpirySeconds(item) {
  if (!item?.expiresAt) return null;
  return Math.max(0, Math.floor((item.expiresAt - Date.now()) / 1000));
}

function formatExpiryCountdown(seconds) {
  if (seconds === null) return null;
  if (seconds <= 0) return "Expired";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / 86400);
  return `${d}d`;
}

const liveItems = computed(() => {
  const now = Date.now();
  return items.value.filter((item) => !item.expiresAt || item.expiresAt > now);
});

const allTags = computed(() => {
  const tagCounts = {};
  for (const item of liveItems.value) {
    for (const tag of item.tags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  return Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));
});

const TAG_STYLES = {
  note: {
    icon: FileText,
    color: "text-(--app-primary)",
    bg: "bg-(--app-primary-soft)",
    ring: "ring-(--app-primary)/20",
  },
  password: {
    icon: KeyRound,
    color: "text-amber-400/90",
    bg: "bg-amber-500/10",
    ring: "ring-amber-400/20",
  },
  bookmark: {
    icon: Bookmark,
    color: "text-sky-400/90",
    bg: "bg-sky-500/10",
    ring: "ring-sky-400/20",
  },
  card: {
    icon: CreditCard,
    color: "text-violet-400/90",
    bg: "bg-violet-500/10",
    ring: "ring-violet-400/20",
  },
  crypto: {
    icon: Bitcoin,
    color: "text-orange-400/90",
    bg: "bg-orange-500/10",
    ring: "ring-orange-400/20",
  },
  api_key: {
    icon: LockKeyhole,
    color: "text-fuchsia-400/90",
    bg: "bg-fuchsia-500/10",
    ring: "ring-fuchsia-400/20",
  },
  wifi: {
    icon: Wifi,
    color: "text-emerald-400/90",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-400/20",
  },
};

const DEFAULT_TAG_STYLE = {
  icon: FileText,
  color: "text-(--app-muted)",
  bg: "bg-(--app-surface-soft)",
  ring: "ring-(--app-border)",
};

function tagStyle(tag) {
  return TAG_STYLES[tag] || DEFAULT_TAG_STYLE;
}

function primaryTag(item) {
  const tags = item?.tags || [];
  return tags.find((t) => TAG_STYLES[t]) || tags[0] || "note";
}

function pickRandomItem({ avoidId } = {}) {
  const pool = liveItems.value;
  if (!pool.length) {
    randomItem.value = null;
    return;
  }

  let candidates = pool;
  if (avoidId && pool.length > 1) {
    candidates = pool.filter((item) => item.id !== avoidId && item.eventId !== avoidId);
    if (!candidates.length) candidates = pool;
  }

  randomItem.value = candidates[Math.floor(Math.random() * candidates.length)];
}

function contentPreview(item, max = 120) {
  const text = String(item?.content || "")
    .replace(/[#>*_`~\-\[\]()!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function enterClearOut() {
  clearOutMode.value = true;
  pickRandomItem({ avoidId: randomItem.value?.id || randomItem.value?.eventId });
}

function exitClearOut() {
  clearOutMode.value = false;
}

watch(
  liveItems,
  (pool) => {
    if (!pool.length) {
      randomItem.value = null;
      clearOutMode.value = false;
      return;
    }
    const stillThere =
      randomItem.value &&
      pool.some(
        (item) => item.id === randomItem.value.id || item.eventId === randomItem.value.eventId,
      );
    if (!stillThere) pickRandomItem();
  },
  { immediate: true },
);

// Bookmarklet — drag this from the Vault page to your bookmarks bar. When run on any
// page it captures the URL, title, and selected text, then deep-links into the gupt
// web app at /hotlink/bookmark to auto-save an encrypted bookmark to the vault.
// The target uses the current origin so self-hosted instances deep-link to their
// own domain instead of the hosted gupt.app.
// Title is parsed from the page: og:title meta → document.title → first <h1>.
const BOOKMARKLET_HREF = `javascript:(()=>{const u=encodeURIComponent(location.href),og=document.querySelector('meta[property="og:title"]')?.content?.trim(),t=encodeURIComponent(og||document.title||(document.querySelector('h1')?.innerText||'').trim()),s=encodeURIComponent((getSelection()||'').toString().trim());open('${window.location.origin}/#/hotlink/bookmark?url='+u+'&title='+t+'&note='+s,'_blank')})()`;

const filteredItems = computed(() => {
  let result = liveItems.value;

  if (activeFilter.value !== "all") {
    result = result.filter((item) => (item.tags || []).includes(activeFilter.value));
  }

  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    result = result.filter((item) => {
      return (
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.content && item.content.toLowerCase().includes(q)) ||
        (item.tags && item.tags.some((t) => t.toLowerCase().includes(q)))
      );
    });
  }

  return result;
});

onMounted(async () => {
  await loadItems();
});

async function loadItems() {
  const cached = await getVaultCachedItems(identity.privkeyHex, identity.pubkeyHex);
  if (cached) {
    items.value = cached.items;
    isLoading.value = false;
    if (!cached.fresh) {
      refreshFromRelay();
    }
    return;
  }

  isLoading.value = true;
  await refreshFromRelay();
}

async function refreshFromRelay() {
  isRefreshing.value = true;
  try {
    items.value = await fetchVaultItems(identity.privkeyHex, identity.pubkeyHex);
  } catch (err) {
    console.error("Failed to load vault items:", err);
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
}

function closeModals() {
  showViewModal.value = false;
  selectedItem.value = null;
  clearInterval(expiryInterval);
  expiryInterval = null;
  expirySecondsLeft.value = null;
}

function renderMarkdown(content) {
  const rawHtml = marked.parse(content || "");
  return DOMPurify.sanitize(rawHtml);
}

function titleLabel(item) {
  const title = String(item?.title || "").trim();
  return title.length > 50 ? `${title.slice(0, 50)}…` : title;
}

function formatRelativeDate(ts) {
  if (!ts) return "";
  const diff = Date.now() - Number(ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function viewItem(item) {
  selectedItem.value = item;
  showViewModal.value = true;
  if (item.expiresAt) {
    expirySecondsLeft.value = computeExpirySeconds(item);
    expiryInterval = setInterval(() => {
      expirySecondsLeft.value = computeExpirySeconds(selectedItem.value);
    }, 1000);
  } else {
    expirySecondsLeft.value = null;
  }
}

async function handleDelete(item) {
  if (!confirm("Are you sure you want to delete this item? It will be removed from relays."))
    return;

  try {
    error.value = "";
    await deleteVaultItem(identity.privkeyHex, identity.pubkeyHex, item.eventId);
    items.value = items.value.filter((i) => i.eventId !== item.eventId);
    closeModals();
  } catch (err) {
    error.value = err?.message || "Failed to delete vault item.";
  }
}

async function copyVaultText(text, field) {
  if (!text) return;
  await copyText(text);
  copiedFields.value[field] = true;
  setTimeout(() => (copiedFields.value[field] = false), 2000);
}

function getNjumpUrl(item) {
  if (!item || !item.eventId) return "";
  try {
    return `https://njump.me/e/${item.eventId}`;
  } catch (e) {
    return "";
  }
}

onUnmounted(() => {
  clearInterval(expiryInterval);
});
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-[80rem] px-4 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-16">
      <div class="mx-auto max-w-2xl space-y-8">
        <AppAlertBanner v-if="error" :message="error" />

        <header class="space-y-5 border-b border-(--app-border) pb-6">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div class="space-y-2">
              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-primary)">
                Encrypted storage
              </p>
              <div class="space-y-1.5">
                <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Vault</h1>
                <p class="max-w-md text-sm leading-6 text-(--app-muted)">
                  Private notes and secrets, encrypted on this device and synced over Nostr.
                </p>
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <button
                type="button"
                :disabled="isRefreshing"
                class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-60"
                :title="isRefreshing ? 'Syncing…' : 'Sync'"
                @click="refreshFromRelay"
              >
                <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isRefreshing }" />
              </button>
              <button
                type="button"
                class="inline-flex h-10 items-center gap-2 rounded-xl bg-(--app-primary) px-4 text-sm font-semibold text-white transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-[0.97]"
                @click="router.push('/vault/add')"
              >
                <Plus class="h-4 w-4" />
                New
              </button>
            </div>
          </div>
        </header>

        <!-- Loading -->
        <div v-if="isLoading" class="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 class="mb-4 h-7 w-7 animate-spin text-(--app-primary)" />
          <p class="text-sm font-medium text-(--app-text-soft)">Unlocking your vault…</p>
          <p class="mt-1 text-xs text-(--app-muted)">Decrypting from cache and relays</p>
        </div>

        <!-- Empty -->
        <section v-else-if="items.length === 0" class="space-y-10">
          <div class="py-8 text-center">
            <div
              class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--app-primary-soft) text-(--app-primary)"
            >
              <Shield class="h-7 w-7" />
            </div>
            <h2 class="mb-2 text-lg font-semibold">Nothing stored yet</h2>
            <p class="mx-auto mb-7 max-w-sm text-sm leading-6 text-(--app-muted)">
              Add a note, password, or bookmark — it stays encrypted here and syncs privately.
            </p>
            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 rounded-xl bg-(--app-primary) px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-[0.97]"
              @click="router.push('/vault/add')"
            >
              <Plus class="h-4 w-4" />
              Create your first item
            </button>
          </div>

          <div
            class="flex flex-col gap-3 rounded-xl border border-dashed border-(--app-border) px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p class="text-xs leading-5 text-(--app-muted)">
              Drag
              <span class="font-semibold text-(--app-text-soft)">gupt-mark</span>
              to your bookmarks bar. On any page, click it to save that page into your vault.
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
        </section>

        <!-- Main content -->
        <template v-else>
          <!-- Clear out mode -->
          <section v-if="clearOutMode && randomItem" class="space-y-5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold">Clear out</p>
                <p class="text-xs text-(--app-muted)">
                  {{ liveItems.length }} left · keep or delete, then next
                </p>
              </div>
              <button
                type="button"
                class="text-xs font-semibold text-(--app-muted) transition-colors hover:text-(--app-text)"
                @click="exitClearOut"
              >
                Done
              </button>
            </div>

            <article
              class="rounded-2xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_88%,transparent)] p-5 sm:p-6"
            >
              <div class="flex items-start gap-4">
                <div
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset"
                  :class="`${tagStyle(primaryTag(randomItem)).bg} ${tagStyle(primaryTag(randomItem)).ring}`"
                >
                  <component
                    :is="tagStyle(primaryTag(randomItem)).icon"
                    class="h-5 w-5"
                    :class="tagStyle(primaryTag(randomItem)).color"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-lg font-semibold tracking-tight">
                    {{ titleLabel(randomItem) }}
                  </p>
                  <p class="mt-1 text-xs text-(--app-muted)">
                    <span v-if="(randomItem.tags || []).length">
                      {{ (randomItem.tags || []).slice(0, 3).join(" · ") }}
                      ·
                    </span>
                    Updated {{ formatRelativeDate(randomItem.updatedAt) }}
                  </p>
                  <p
                    v-if="contentPreview(randomItem, 220)"
                    class="mt-4 text-sm leading-6 text-(--app-text-soft)"
                  >
                    {{ contentPreview(randomItem, 220) }}
                  </p>
                </div>
              </div>

              <div class="mt-6 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  class="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-(--app-surface-hover)"
                  @click="viewItem(randomItem)"
                >
                  Open
                </button>
                <button
                  type="button"
                  class="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-2.5 text-sm font-semibold text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                  @click="pickRandomItem({ avoidId: randomItem.id || randomItem.eventId })"
                >
                  <Shuffle class="h-4 w-4" />
                  Keep · next
                </button>
                <button
                  type="button"
                  class="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500/12 px-4 py-2.5 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/20"
                  @click="handleDelete(randomItem)"
                >
                  <Trash2 class="h-4 w-4" />
                  Delete
                </button>
              </div>
            </article>
          </section>

          <!-- Browse mode -->
          <template v-else>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-sm text-(--app-muted)">
                <span class="font-semibold tabular-nums text-(--app-text)">{{
                  liveItems.length
                }}</span>
                {{ liveItems.length === 1 ? "item" : "items" }}
              </p>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 text-xs font-semibold text-(--app-muted) transition-colors hover:text-(--app-text)"
                @click="enterClearOut"
              >
                <Shuffle class="h-3.5 w-3.5" />
                Clear out
              </button>
            </div>

            <div
              class="flex flex-col gap-3 rounded-xl border border-dashed border-(--app-border) px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p class="text-xs leading-5 text-(--app-muted)">
                Drag
                <span class="font-semibold text-(--app-text-soft)">gupt-mark</span>
                to your bookmarks bar. On any page, click it to save that page into your vault.
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

            <section class="space-y-3">
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
                    activeFilter === 'all'
                      ? 'bg-(--app-primary)/15 text-(--app-primary)'
                      : 'text-(--app-muted) hover:text-(--app-text)'
                  "
                  @click="activeFilter = 'all'"
                >
                  All
                </button>
                <button
                  v-for="tagInfo in allTags"
                  :key="tagInfo.tag"
                  type="button"
                  class="rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors"
                  :class="
                    activeFilter === tagInfo.tag
                      ? 'bg-(--app-primary)/15 text-(--app-primary)'
                      : 'text-(--app-muted) hover:text-(--app-text)'
                  "
                  @click="activeFilter = tagInfo.tag"
                >
                  {{ tagInfo.tag }}
                  <span class="opacity-50">{{ tagInfo.count }}</span>
                </button>
              </div>
            </section>

            <div
              v-if="filteredItems.length === 0"
              class="py-16 text-center text-sm text-(--app-muted)"
            >
              No items match your search.
            </div>

            <ul v-else class="divide-y divide-(--app-border) border-y border-(--app-border)">
              <li
                v-for="item in filteredItems"
                :key="item.id"
                class="group cursor-pointer py-4 transition-colors first:pt-3 last:pb-3 hover:bg-(--app-surface-soft)/40"
                @click="viewItem(item)"
              >
                <div class="flex items-start gap-3.5 px-1">
                  <div
                    class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset"
                    :class="`${tagStyle(primaryTag(item)).bg} ${tagStyle(primaryTag(item)).ring}`"
                  >
                    <component
                      :is="tagStyle(primaryTag(item)).icon"
                      class="h-4 w-4"
                      :class="tagStyle(primaryTag(item)).color"
                    />
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-start justify-between gap-3">
                      <p class="truncate text-sm font-semibold tracking-tight">
                        {{ titleLabel(item) }}
                      </p>
                      <div class="flex shrink-0 items-center gap-2">
                        <span
                          v-if="item.expiresAt"
                          class="inline-flex items-center gap-1 text-[11px] font-medium text-(--app-muted)"
                        >
                          <Clock class="h-3 w-3" />
                          {{ formatExpiryCountdown(computeExpirySeconds(item)) }}
                        </span>
                        <span class="text-[11px] text-(--app-muted-2)">
                          {{ formatRelativeDate(item.updatedAt) }}
                        </span>
                        <button
                          type="button"
                          class="rounded-lg p-1 text-(--app-muted-2) opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
                          title="Delete"
                          @click.stop="handleDelete(item)"
                        >
                          <Trash2 class="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p
                      v-if="contentPreview(item)"
                      class="mt-1 line-clamp-2 text-sm leading-5 text-(--app-muted)"
                    >
                      {{ contentPreview(item) }}
                    </p>
                    <p
                      v-if="(item.tags || []).length"
                      class="mt-1.5 text-[11px] tracking-wide text-(--app-muted-2)"
                    >
                      {{ (item.tags || []).slice(0, 4).join(" · ") }}
                    </p>
                  </div>
                </div>
              </li>
            </ul>
          </template>
        </template>
      </div>
    </div>

    <!-- Detail modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showViewModal && selectedItem"
          class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
        >
          <div class="absolute inset-0 bg-black/70" @click="closeModals" />

          <div
            class="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-(--app-border) bg-(--app-surface) shadow-[0_24px_64px_rgba(0,0,0,0.4)] sm:rounded-3xl"
          >
            <div
              class="flex shrink-0 items-center justify-between gap-3 border-b border-(--app-border) px-5 py-4"
            >
              <div class="flex min-w-0 items-center gap-3">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset"
                  :class="`${tagStyle(primaryTag(selectedItem)).bg} ${tagStyle(primaryTag(selectedItem)).ring}`"
                >
                  <component
                    :is="tagStyle(primaryTag(selectedItem)).icon"
                    class="h-5 w-5"
                    :class="tagStyle(primaryTag(selectedItem)).color"
                  />
                </div>
                <div class="min-w-0">
                  <h2 class="truncate text-base font-bold">{{ selectedItem.title }}</h2>
                  <p class="text-xs text-(--app-muted)">
                    {{ formatRelativeDate(selectedItem.updatedAt) }}
                  </p>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <button
                  class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-red-400"
                  title="Delete"
                  @click="handleDelete(selectedItem)"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
                <button
                  class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                  @click="closeModals"
                >
                  <X class="h-5 w-5" />
                </button>
              </div>
            </div>

            <div class="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div
                v-if="expirySecondsLeft !== null"
                class="flex items-center gap-3 rounded-2xl px-4 py-3"
                :class="
                  expirySecondsLeft <= 60
                    ? 'border border-red-500/20 bg-red-500/10'
                    : expirySecondsLeft <= 3600
                      ? 'border border-amber-500/20 bg-amber-500/10'
                      : 'border border-(--app-border) bg-(--app-surface-soft)'
                "
              >
                <Clock class="h-4 w-4 shrink-0 text-(--app-muted)" />
                <div class="min-w-0 flex-1">
                  <p
                    class="text-xs font-semibold"
                    :class="
                      expirySecondsLeft <= 60
                        ? 'text-red-400'
                        : expirySecondsLeft <= 3600
                          ? 'text-amber-400'
                          : 'text-(--app-muted)'
                    "
                  >
                    Expires in
                  </p>
                  <p
                    class="text-lg font-bold tabular-nums"
                    :class="
                      expirySecondsLeft <= 60
                        ? 'text-red-300'
                        : expirySecondsLeft <= 3600
                          ? 'text-amber-300'
                          : 'text-(--app-text)'
                    "
                  >
                    {{ formatExpiryCountdown(expirySecondsLeft) }}
                  </p>
                </div>
              </div>

              <div
                v-if="(selectedItem.tags || []).length > 0"
                class="text-xs tracking-wide text-(--app-muted)"
              >
                {{ selectedItem.tags.join(" · ") }}
              </div>

              <div v-if="selectedItem.content">
                <div
                  class="prose prose-invert prose-sm max-w-none rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-5"
                  v-html="renderMarkdown(selectedItem.content)"
                />
              </div>

              <button
                v-if="selectedItem.content"
                class="flex w-full items-center justify-center gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-3 transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover)"
                @click="copyVaultText(selectedItem.content, 'content')"
              >
                <Check v-if="copiedFields['content']" class="h-4 w-4 text-(--app-success)" />
                <Copy v-else class="h-4 w-4 text-(--app-muted)" />
                <span class="text-sm text-(--app-muted)">
                  {{ copiedFields["content"] ? "Copied!" : "Copy content" }}
                </span>
              </button>

              <div class="border-t border-(--app-border) pt-2">
                <a
                  :href="getNjumpUrl(selectedItem)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="group flex items-center justify-center gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-3 transition-colors hover:border-(--app-primary)/30 hover:bg-(--app-primary-soft)/30"
                >
                  <ExternalLink
                    class="h-4 w-4 text-(--app-muted) transition-colors group-hover:text-(--app-primary)"
                  />
                  <span
                    class="text-sm font-medium text-(--app-muted) transition-colors group-hover:text-(--app-text)"
                  >
                    View event on njump.me
                  </span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </main>
</template>

<style>
.prose {
  --tw-prose-body: var(--app-text-soft);
  --tw-prose-headings: var(--app-text);
  --tw-prose-links: var(--app-primary);
  --tw-prose-bold: var(--app-text);
  --tw-prose-code: var(--app-text-soft);
  --tw-prose-pre-bg: var(--app-surface);
  --tw-prose-pre-code: var(--app-text-soft);
}
.prose :where(code):not(:where([class~="not-prose"], [class~="not-prose"] *)) {
  background: var(--app-surface);
  padding: 0.2em 0.4em;
  border-radius: 0.25rem;
  font-size: 0.875em;
}
.prose :where(pre):not(:where([class~="not-prose"], [class~="not-prose"] *)) {
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 0.75rem;
  padding: 1rem;
  overflow-x: auto;
}
.prose :where(a):not(:where([class~="not-prose"], [class~="not-prose"] *)) {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.prose :where(strong):not(:where([class~="not-prose"], [class~="not-prose"] *)) {
  color: var(--app-text);
  font-weight: 600;
}
</style>
