<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
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
  Tags,
  FileText,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import VaultCreatePanel from "@/components/vault/VaultCreatePanel.vue";
import { useIdentityStore } from "@/stores/identity";
import { getVaultCachedItems, fetchVaultItems, deleteVaultItem } from "@/lib/vault";
import { copyToClipboard as copyText } from "@/lib/clipboard";

marked.setOptions({
  breaks: true,
  gfm: true,
});

const identity = useIdentityStore();
const showCreateForm = ref(false);
const createFormKey = ref(0);
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

const vaultStats = computed(() => ({
  total: liveItems.value.length,
  tags: allTags.value.length,
}));

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

function itemPreview(item) {
  const content = String(item.content || "").trim();
  return content ? content.slice(0, 120) : "Empty note";
}

function renderMarkdown(content) {
  const rawHtml = marked.parse(content || "");
  return DOMPurify.sanitize(rawHtml);
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

function openCreateForm() {
  showCreateForm.value = true;
}

function closeCreateForm() {
  showCreateForm.value = false;
  createFormKey.value += 1;
}

async function handleItemSaved() {
  closeCreateForm();
  await refreshFromRelay();
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
    <div class="mx-auto w-full max-w-[80rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="mx-auto max-w-3xl space-y-6">
        <div v-if="!showCreateForm && !isLoading" class="flex justify-end">
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-[14px] bg-(--app-primary) px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-(--app-ease-standard) hover:-translate-y-0.5 hover:bg-(--app-primary-strong) hover:shadow-[0_8px_20px_color-mix(in_srgb,var(--app-primary)_24%,transparent)] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
            @click="openCreateForm"
          >
            <Plus class="h-4 w-4" />
            New item
          </button>
        </div>

        <AppAlertBanner v-if="error" :message="error" />

        <!-- Relay sync indicator -->
        <div
          v-if="isRefreshing"
          class="flex items-center justify-end gap-1.5 text-xs text-(--app-muted)"
        >
          <RefreshCw class="h-3 w-3 animate-spin" />
          <span>Syncing with relay…</span>
        </div>

        <!-- Loading state -->
        <div
          v-if="isLoading"
          class="flex flex-col items-center justify-center rounded-3xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] py-24 text-center shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
        >
          <Loader2 class="mb-4 h-8 w-8 animate-spin text-(--app-success)" />
          <p class="font-medium text-(--app-text-soft)">Decrypting vault…</p>
          <p class="mt-1 text-xs text-(--app-muted)">Loading from cache and relays</p>
        </div>

        <!-- Create form -->
        <VaultCreatePanel
          v-else-if="showCreateForm"
          :key="createFormKey"
          @saved="handleItemSaved"
          @cancel="closeCreateForm"
        />

        <!-- Empty state -->
        <section
          v-else-if="items.length === 0"
          class="flex flex-col items-center rounded-3xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] py-20 text-center shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
        >
          <div
            class="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-(--app-success)/10 text-(--app-success)"
          >
            <Shield class="h-8 w-8" />
          </div>
          <h2 class="mb-2 text-lg font-semibold">Your vault is empty</h2>
          <p class="mb-6 max-w-sm text-sm text-(--app-muted)">
            Store sensitive data locally encrypted, then sync it privately across your devices via
            Nostr.
          </p>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-[14px] bg-(--app-primary) px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-(--app-ease-standard) hover:-translate-y-0.5 hover:bg-(--app-primary-strong) hover:shadow-[0_8px_20px_color-mix(in_srgb,var(--app-primary)_24%,transparent)] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
            @click="openCreateForm"
          >
            <Plus class="h-4 w-4" />
            Create your first item
          </button>
        </section>

        <!-- Main vault content -->
        <template v-else>
          <!-- Stats row -->
          <div class="grid grid-cols-2 gap-3">
            <div
              class="flex items-center gap-2.5 rounded-lg border border-(--app-border) bg-(--app-surface-soft) px-3 py-2.5"
            >
              <Shield class="h-3.5 w-3.5 shrink-0 text-(--app-muted)" :stroke-width="2" />
              <span class="text-xs text-(--app-muted)">Total</span>
              <span class="ml-auto text-sm font-semibold tabular-nums">{{ vaultStats.total }}</span>
            </div>
            <div
              class="flex items-center gap-2.5 rounded-lg border border-(--app-border) bg-(--app-surface-soft) px-3 py-2.5"
            >
              <Tags class="h-3.5 w-3.5 shrink-0 text-emerald-400" :stroke-width="2" />
              <span class="text-xs text-(--app-muted)">Tags</span>
              <span class="ml-auto text-sm font-semibold tabular-nums">{{ vaultStats.tags }}</span>
            </div>
          </div>

          <!-- Search + filters -->
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
                placeholder="Search titles, content, and tags…"
                class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] !pl-11"
              />
            </div>

            <div class="flex gap-2 overflow-x-auto pb-0.5">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-200 ease-(--app-ease-standard)"
                :class="
                  activeFilter === 'all'
                    ? 'border-(--app-success)/40 bg-(--app-success)/10 text-(--app-success)'
                    : 'border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
                "
                @click="activeFilter = 'all'"
              >
                <Shield class="h-3.5 w-3.5" />
                All
              </button>
              <button
                v-for="tagInfo in allTags"
                :key="tagInfo.tag"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-200 ease-(--app-ease-standard)"
                :class="
                  activeFilter === tagInfo.tag
                    ? 'border-(--app-success)/40 bg-(--app-success)/10 text-(--app-success)'
                    : 'border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
                "
                @click="activeFilter = tagInfo.tag"
              >
                <Tags class="h-3.5 w-3.5" />
                {{ tagInfo.tag }}
                <span class="text-xs opacity-60">{{ tagInfo.count }}</span>
              </button>
            </div>
          </section>

          <!-- Empty search result -->
          <div
            v-if="filteredItems.length === 0"
            class="flex flex-col items-center rounded-3xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] py-16 text-center shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
          >
            <Search class="mx-auto mb-3 h-8 w-8 text-(--app-muted-2)" />
            <p class="text-(--app-muted)">No items match your search or filter.</p>
          </div>

          <!-- Item grid -->
          <div v-else class="grid gap-3 sm:grid-cols-2">
            <button
              v-for="item in filteredItems"
              :key="item.id"
              type="button"
              class="group flex flex-col rounded-2xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-4 text-left shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-all duration-300 ease-(--app-ease-standard) hover:-translate-y-0.5 hover:border-(--app-border-strong) hover:bg-(--app-surface-raised) hover:shadow-[0_16px_40px_rgba(0,0,0,0.24)]"
              @click="viewItem(item)"
            >
              <div class="flex items-start gap-3">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/20 transition-transform duration-300 ease-(--app-ease-standard) group-hover:scale-105"
                >
                  <FileText class="h-5 w-5" />
                </div>
                <div class="min-w-0 flex-1">
                  <h3 class="mb-1 truncate text-sm font-semibold">{{ item.title }}</h3>
                  <p class="line-clamp-2 text-xs leading-relaxed text-(--app-muted)">
                    {{ itemPreview(item) }}
                  </p>
                </div>
              </div>

              <div class="mt-3 flex flex-wrap gap-1.5">
                <span
                  v-for="tag in (item.tags || []).slice(0, 3)"
                  :key="tag"
                  class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/20"
                >
                  <Tags class="h-2.5 w-2.5" />
                  {{ tag }}
                </span>
              </div>

              <div
                class="mt-3 flex items-center justify-between border-t border-(--app-border) pt-3 text-xs text-(--app-muted)"
              >
                <span>{{ formatRelativeDate(item.updatedAt) }}</span>
                <div class="flex items-center gap-2">
                  <span
                    v-if="item.expiresAt"
                    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    :class="
                      item.expiresAt - Date.now() < 60000
                        ? 'bg-red-500/15 text-red-400'
                        : item.expiresAt - Date.now() < 3600000
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-white/5 text-(--app-muted)'
                    "
                    >⏱ {{ formatExpiryCountdown(computeExpirySeconds(item)) }}</span
                  >
                  <span
                    role="button"
                    tabindex="0"
                    class="rounded-lg p-1.5 opacity-0 transition-all duration-200 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
                    title="Delete"
                    @click.stop="handleDelete(item)"
                    @keydown.enter.stop.prevent="handleDelete(item)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </span>
                </div>
              </div>
            </button>
          </div>
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
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/20"
                >
                  <FileText class="h-5 w-5" />
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
                  class="inline-flex items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) h-9 w-9 text-(--app-muted) transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-red-400"
                  title="Delete"
                  @click="handleDelete(selectedItem)"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
                <button
                  class="inline-flex items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) h-9 w-9 text-(--app-muted) transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                  @click="closeModals"
                >
                  <X class="h-5 w-5" />
                </button>
              </div>
            </div>

            <div class="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <!-- Expiry countdown banner -->
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
                <span class="text-xl leading-none">⏱</span>
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
                    This note expires in
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

              <!-- Tags -->
              <div v-if="(selectedItem.tags || []).length > 0" class="flex flex-wrap gap-2">
                <span
                  v-for="tag in selectedItem.tags"
                  :key="tag"
                  class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/20"
                >
                  <Tags class="h-3 w-3" />
                  {{ tag }}
                </span>
              </div>

              <!-- Content (rendered markdown) -->
              <div v-if="selectedItem.content">
                <div
                  class="prose prose-invert prose-sm max-w-none rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-5"
                  v-html="renderMarkdown(selectedItem.content)"
                />
              </div>

              <!-- Copy button -->
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

              <!-- njump link -->
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
