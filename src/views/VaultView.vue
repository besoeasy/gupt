<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  Shield,
  Plus,
  FileText,
  Key,
  Bookmark,
  Copy,
  Check,
  Trash2,
  Loader2,
  RefreshCw,
  X,
  ExternalLink,
  Search,
  Eye,
  EyeOff,
} from "lucide-vue-next";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import VaultCreatePanel from "@/components/vault/VaultCreatePanel.vue";
import { useIdentityStore } from "@/stores/identity";
import { getVaultCachedItems, fetchVaultItems, deleteVaultItem } from "@/lib/vault";
// ---------------------------------------------------------------------------
// TOTP — pure Web Crypto API, no external packages (RFC 6238 / HOTP)
// ---------------------------------------------------------------------------
function base32Decode(base32) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const input = base32.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of input) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

async function generateTOTP(base32Secret) {
  const keyBytes = base32Decode(base32Secret);
  if (!keyBytes.length) return null;
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBytes = new Uint8Array(8);
  // write counter as big-endian 64-bit
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, counterBytes);
  const hmac = new Uint8Array(sig);
  const offset = hmac[19] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1_000_000;
  return String(code).padStart(6, "0");
}

function totpSecondsRemaining() {
  return 30 - (Math.floor(Date.now() / 1000) % 30);
}

const identity = useIdentityStore();
const showCreateForm = ref(false);
const createFormKey = ref(0);
/** True only on the very first visit (no cache). */
const isLoading = ref(true);
/** True when a background relay refresh is running on a stale cache. */
const isRefreshing = ref(false);
const items = ref([]);
const showViewModal = ref(false);
const selectedItem = ref(null);

const copiedFields = ref({});
const activeFilter = ref("all");
const searchQuery = ref("");
const showPassword = ref(false);
const totpCode = ref(null);
const totpSecondsLeft = ref(30);
const error = ref("");
let totpInterval = null;
let totpCountdownInterval = null;
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

const TYPE_FILTERS = [
  { value: "all", label: "All", icon: Shield },
  { value: "note", label: "Notes", icon: FileText },
  { value: "password", label: "Passwords", icon: Key },
  { value: "bookmark", label: "Bookmarks", icon: Bookmark },
];

const TYPE_META = {
  note: {
    label: "Note",
    icon: FileText,
    chip: "bg-sky-500/15 text-sky-300 ring-sky-400/20",
    iconWrap: "bg-sky-500/15 text-sky-300",
  },
  password: {
    label: "Password",
    icon: Key,
    chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20",
    iconWrap: "bg-emerald-500/15 text-emerald-300",
  },
  bookmark: {
    label: "Bookmark",
    icon: Bookmark,
    chip: "bg-violet-500/15 text-violet-300 ring-violet-400/20",
    iconWrap: "bg-violet-500/15 text-violet-300",
  },
};

const vaultStats = computed(() => ({
  total: items.value.length,
  notes: items.value.filter((item) => item.type === "note").length,
  passwords: items.value.filter((item) => item.type === "password").length,
  bookmarks: items.value.filter((item) => item.type === "bookmark").length,
}));

const filteredItems = computed(() => {
  let result = items.value;

  if (activeFilter.value !== "all") {
    result = result.filter((item) => item.type === activeFilter.value);
  }

  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    result = result.filter((item) => {
      return (
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.username && item.username.toLowerCase().includes(q)) ||
        (item.email && item.email.toLowerCase().includes(q)) ||
        (item.url && item.url.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q)) ||
        (item.body && item.body.toLowerCase().includes(q))
      );
    });
  }

  return result;
});

onMounted(async () => {
  await loadItems();
});

async function loadItems() {
  // 1. Try cache first — instant, no network.
  const cached = await getVaultCachedItems(identity.privkeyHex, identity.pubkeyHex);
  if (cached) {
    items.value = cached.items;
    isLoading.value = false;
    if (!cached.fresh) {
      // Cache is stale — refresh from relay silently in the background.
      refreshFromRelay();
    }
    return;
  }

  // 2. No cache yet — show spinner and block until relay responds.
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
  showPassword.value = false;
  totpCode.value = null;
  clearInterval(totpInterval);
  clearInterval(totpCountdownInterval);
  clearInterval(expiryInterval);
  totpInterval = null;
  totpCountdownInterval = null;
  expiryInterval = null;
  expirySecondsLeft.value = null;
}

function typeMeta(type) {
  return TYPE_META[type] || TYPE_META.note;
}

function itemPreview(item) {
  if (item.type === "password") {
    return item.username || item.email || item.url || "Saved credentials";
  }
  if (item.type === "bookmark") {
    return item.url || "Saved bookmark";
  }
  const body = String(item.body || "").trim();
  return body ? body.slice(0, 96) : "Empty note";
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

async function viewItem(item) {
  selectedItem.value = item;
  showViewModal.value = true;
  showPassword.value = false;
  // Start expiry countdown if item has an expiry date
  if (item.expiresAt) {
    expirySecondsLeft.value = computeExpirySeconds(item);
    expiryInterval = setInterval(() => {
      expirySecondsLeft.value = computeExpirySeconds(selectedItem.value);
    }, 1000);
  } else {
    expirySecondsLeft.value = null;
  }

  // Kick off live TOTP if this item has an OTP key
  if (item.otpKey) {
    const refresh = async () => {
      totpCode.value = await generateTOTP(item.otpKey);
      totpSecondsLeft.value = totpSecondsRemaining();
    };
    await refresh();
    // Align the interval to the next 30-second boundary
    const msUntilNext = totpSecondsLeft.value * 1000 - (Date.now() % 1000);
    setTimeout(async () => {
      await refresh();
      totpInterval = setInterval(refresh, 30_000);
    }, msUntilNext);
    totpCountdownInterval = setInterval(() => {
      totpSecondsLeft.value = totpSecondsRemaining();
    }, 1000);
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

function copyToClipboard(text, field) {
  if (!text) return;
  navigator.clipboard.writeText(text);
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
  clearInterval(totpInterval);
  clearInterval(totpCountdownInterval);
  clearInterval(expiryInterval);
});
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-[80rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="mx-auto max-w-4xl space-y-6">
        <!-- ── Page header ────────────────────────────────── -->
        <header
          class="flex flex-col gap-4 border-b border-white/8 pb-6 sm:flex-row sm:items-end sm:justify-between"
        >
          <div class="space-y-1.5">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-success)">
              Encrypted on device
            </p>
            <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Secure Vault</h1>
            <p class="max-w-xl text-sm leading-6 text-zinc-500">
              Notes, passwords, and bookmarks — encrypted with your keypair before they touch a
              relay.
            </p>
          </div>
          <button
            v-if="!showCreateForm && !isLoading"
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-[14px] bg-(--app-primary) px-4 py-2 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-(--app-primary-strong) hover:shadow-[0_8px_20px_color-mix(in_srgb,var(--app-primary)_24%,transparent)] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] shrink-0 self-start sm:self-end"
            @click="openCreateForm"
          >
            <Plus class="h-4 w-4" />
            New item
          </button>
        </header>

        <AppAlertBanner v-if="error" :message="error" />

        <!-- Relay sync indicator -->
        <div
          v-if="isRefreshing"
          class="flex items-center justify-end gap-1.5 text-xs text-zinc-500"
        >
          <RefreshCw class="h-3 w-3 animate-spin" />
          <span>Syncing with relay…</span>
        </div>

        <!-- ── Loading state ──────────────────────────────── -->
        <div v-if="isLoading" class="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 class="mb-4 h-8 w-8 animate-spin text-(--app-success)" />
          <p class="font-medium text-zinc-300">Decrypting vault…</p>
          <p class="mt-1 text-xs text-zinc-500">Loading from cache and relays</p>
        </div>

        <!-- ── Create form ────────────────────────────────── -->
        <VaultCreatePanel
          v-else-if="showCreateForm"
          :key="createFormKey"
          @saved="handleItemSaved"
          @cancel="closeCreateForm"
        />

        <!-- ── Empty state ────────────────────────────────── -->
        <section
          v-else-if="items.length === 0"
          class="flex flex-col items-center py-20 text-center"
        >
          <div
            class="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-(--app-success)"
          >
            <Shield class="h-8 w-8" />
          </div>
          <h2 class="mb-2 text-lg font-semibold">Your vault is empty</h2>
          <p class="mb-6 max-w-sm text-sm text-zinc-500">
            Store sensitive data locally encrypted, then sync it privately across your devices via
            Nostr.
          </p>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-[14px] bg-(--app-primary) px-4 py-2 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-(--app-primary-strong) hover:shadow-[0_8px_20px_color-mix(in_srgb,var(--app-primary)_24%,transparent)] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
            @click="openCreateForm"
          >
            <Plus class="h-4 w-4" />
            Create your first item
          </button>
        </section>

        <!-- ── Main vault content ─────────────────────────── -->
        <template v-else>
          <!-- Stats row -->
          <div
            class="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/8 sm:grid-cols-4"
          >
            <div class="bg-white/[0.02] px-4 py-4">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Total</p>
              <p class="mt-1 text-2xl font-bold tabular-nums">{{ vaultStats.total }}</p>
            </div>
            <div class="bg-white/[0.02] px-4 py-4">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-sky-400/80">
                Notes
              </p>
              <p class="mt-1 text-2xl font-bold tabular-nums">{{ vaultStats.notes }}</p>
            </div>
            <div class="bg-white/[0.02] px-4 py-4">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80">
                Passwords
              </p>
              <p class="mt-1 text-2xl font-bold tabular-nums">{{ vaultStats.passwords }}</p>
            </div>
            <div class="bg-white/[0.02] px-4 py-4">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-violet-400/80">
                Bookmarks
              </p>
              <p class="mt-1 text-2xl font-bold tabular-nums">{{ vaultStats.bookmarks }}</p>
            </div>
          </div>

          <!-- Search + filters -->
          <section class="space-y-3">
            <div class="relative">
              <div
                class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-500"
              >
                <Search class="h-4 w-4" />
              </div>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search titles, emails, URLs, and notes…"
                class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] !pl-11"
              />
            </div>

            <div class="flex gap-2 overflow-x-auto pb-0.5">
              <button
                v-for="filter in TYPE_FILTERS"
                :key="filter.value"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-all"
                :class="
                  activeFilter === filter.value
                    ? 'border-(--app-success)/40 bg-(--app-success)/10 text-(--app-success)'
                    : 'border-white/8 bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:text-white'
                "
                @click="activeFilter = filter.value"
              >
                <component :is="filter.icon" class="h-3.5 w-3.5" />
                {{ filter.label }}
              </button>
            </div>
          </section>

          <!-- Empty search result -->
          <div v-if="filteredItems.length === 0" class="py-16 text-center">
            <Search class="mx-auto mb-3 h-8 w-8 text-zinc-600" />
            <p class="text-zinc-500">No items match your search or filter.</p>
          </div>

          <!-- Item grid -->
          <div v-else class="grid gap-3 sm:grid-cols-2">
            <button
              v-for="item in filteredItems"
              :key="item.id"
              type="button"
              class="group flex flex-col rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-left transition-all duration-300 hover:border-(--app-success)/25 hover:bg-white/[0.04]"
              @click="viewItem(item)"
            >
              <div class="flex items-start gap-3">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset"
                  :class="typeMeta(item.type).iconWrap"
                >
                  <component :is="typeMeta(item.type).icon" class="h-5 w-5" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="mb-1 flex items-center gap-2">
                    <h3 class="truncate text-sm font-semibold">{{ item.title }}</h3>
                    <span
                      class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset"
                      :class="typeMeta(item.type).chip"
                    >
                      {{ typeMeta(item.type).label }}
                    </span>
                  </div>
                  <p class="line-clamp-2 text-xs leading-relaxed text-zinc-500">
                    {{ itemPreview(item) }}
                  </p>
                </div>
              </div>

              <div class="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs text-zinc-500">
                <span>{{ formatRelativeDate(item.updatedAt) }}</span>
                <div class="flex items-center gap-2">
                  <!-- Expiry badge -->
                  <span
                    v-if="item.expiresAt"
                    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    :class="
                      item.expiresAt - Date.now() < 60000
                        ? 'bg-red-500/15 text-red-400'
                        : item.expiresAt - Date.now() < 3600000
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-zinc-500/15 text-zinc-400'
                    "
                  >⏱ {{ formatExpiryCountdown(computeExpirySeconds(item)) }}</span>
                  <span
                    role="button"
                    tabindex="0"
                    class="rounded-lg p-1.5 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
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

    <!-- ── Detail modal ───────────────────────────────────── -->
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
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/70" @click="closeModals" />

          <!-- Sheet -->
          <div
            class="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
          >
            <!-- Modal header -->
            <div
              class="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 px-5 py-4"
            >
              <div class="flex min-w-0 items-center gap-3">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset"
                  :class="typeMeta(selectedItem.type).iconWrap"
                >
                  <component :is="typeMeta(selectedItem.type).icon" class="h-5 w-5" />
                </div>
                <div class="min-w-0">
                  <h2 class="truncate text-base font-bold">{{ selectedItem.title }}</h2>
                  <p class="text-xs text-zinc-500">
                    {{ typeMeta(selectedItem.type).label }} ·
                    {{ formatRelativeDate(selectedItem.updatedAt) }}
                  </p>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <button
                  class="inline-flex items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) h-9 w-9 text-zinc-400 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-red-400"
                  title="Delete"
                  @click="handleDelete(selectedItem)"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
                <button
                  class="inline-flex items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) h-9 w-9 text-zinc-400 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-white"
                  @click="closeModals"
                >
                  <X class="h-5 w-5" />
                </button>
              </div>
            </div>

            <!-- Modal body -->
            <div class="flex-1 space-y-3 overflow-y-auto px-5 py-5">
              <!-- Expiry countdown banner -->
              <div
                v-if="expirySecondsLeft !== null"
                class="flex items-center gap-3 rounded-xl px-4 py-3"
                :class="
                  expirySecondsLeft <= 60
                    ? 'border border-red-500/20 bg-red-500/10'
                    : expirySecondsLeft <= 3600
                      ? 'border border-amber-500/20 bg-amber-500/10'
                      : 'border border-zinc-600/20 bg-zinc-700/20'
                "
              >
                <span class="text-xl leading-none">⏱</span>
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-semibold"
                    :class="
                      expirySecondsLeft <= 60 ? 'text-red-400'
                      : expirySecondsLeft <= 3600 ? 'text-amber-400'
                      : 'text-zinc-400'
                    "
                  >This note expires in</p>
                  <p class="text-lg font-bold tabular-nums"
                    :class="
                      expirySecondsLeft <= 60 ? 'text-red-300'
                      : expirySecondsLeft <= 3600 ? 'text-amber-300'
                      : 'text-white'
                    "
                  >{{ formatExpiryCountdown(expirySecondsLeft) }}</p>
                </div>
              </div>
              <!-- ── Bookmark ── -->
              <template v-if="selectedItem.type === 'bookmark'">
                <div
                  v-if="selectedItem.url"
                  class="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 p-3.5"
                >
                  <div class="min-w-0">
                    <p class="mb-0.5 text-xs font-medium text-zinc-500">URL</p>
                    <p class="truncate text-sm font-mono">{{ selectedItem.url }}</p>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <a
                      :href="selectedItem.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) h-8 w-8 text-zinc-400 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-white"
                      title="Open URL"
                    >
                      <ExternalLink class="h-4 w-4" />
                    </a>
                    <button
                      class="inline-flex items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) h-8 w-8 text-zinc-400 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-white"
                      @click="copyToClipboard(selectedItem.url, 'url')"
                    >
                      <Check v-if="copiedFields['url']" class="h-4 w-4 text-(--app-success)" />
                      <Copy v-else class="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </template>

              <!-- ── Password ── -->
              <template v-if="selectedItem.type === 'password'">
                <div
                  v-if="selectedItem.username"
                  class="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 p-3.5"
                >
                  <div class="min-w-0">
                    <p class="mb-0.5 text-xs font-medium text-zinc-500">Username</p>
                    <p class="truncate text-sm font-mono">{{ selectedItem.username }}</p>
                  </div>
                  <button
                    class="inline-flex items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) h-8 w-8 shrink-0 text-zinc-400 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-white"
                    @click="copyToClipboard(selectedItem.username, 'username')"
                  >
                    <Check v-if="copiedFields['username']" class="h-4 w-4 text-(--app-success)" />
                    <Copy v-else class="h-4 w-4" />
                  </button>
                </div>

                <div
                  v-if="selectedItem.email"
                  class="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 p-3.5"
                >
                  <div class="min-w-0">
                    <p class="mb-0.5 text-xs font-medium text-zinc-500">Email</p>
                    <p class="truncate text-sm font-mono">{{ selectedItem.email }}</p>
                  </div>
                  <button
                    class="inline-flex items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) h-8 w-8 shrink-0 text-zinc-400 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-white"
                    @click="copyToClipboard(selectedItem.email, 'email')"
                  >
                    <Check v-if="copiedFields['email']" class="h-4 w-4 text-(--app-success)" />
                    <Copy v-else class="h-4 w-4" />
                  </button>
                </div>

                <div
                  v-if="selectedItem.password"
                  class="rounded-xl border border-white/5 bg-black/20 p-3.5"
                >
                  <div class="mb-2 flex items-center justify-between">
                    <p class="text-xs font-medium text-zinc-500">Password</p>
                    <div class="flex items-center gap-1">
                      <button
                        class="inline-flex items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) h-8 w-8 text-zinc-400 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-white"
                        :title="showPassword ? 'Hide password' : 'Show password'"
                        @click="showPassword = !showPassword"
                      >
                        <EyeOff v-if="showPassword" class="h-4 w-4" />
                        <Eye v-else class="h-4 w-4" />
                      </button>
                      <button
                        class="inline-flex items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) h-8 w-8 text-zinc-400 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-white"
                        title="Copy password"
                        @click="copyToClipboard(selectedItem.password, 'password')"
                      >
                        <Check
                          v-if="copiedFields['password']"
                          class="h-4 w-4 text-(--app-success)"
                        />
                        <Copy v-else class="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p
                    class="break-all text-sm font-mono"
                    :class="showPassword ? 'text-zinc-200' : 'tracking-widest text-zinc-500'"
                  >
                    {{
                      showPassword
                        ? selectedItem.password
                        : "•".repeat(Math.min(selectedItem.password.length, 16))
                    }}
                  </p>
                </div>

                <!-- TOTP widget -->
                <div
                  v-if="selectedItem.otpKey"
                  class="rounded-xl border border-(--app-primary)/15 bg-(--app-primary-soft)/30 p-4"
                >
                  <div class="mb-3 flex items-center justify-between">
                    <p class="text-xs font-semibold text-zinc-400">2FA Code</p>
                    <button
                      class="inline-flex items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) h-8 w-8 text-zinc-400 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-white"
                      title="Copy code"
                      @click="copyToClipboard(totpCode, 'otp')"
                    >
                      <Check v-if="copiedFields['otp']" class="h-4 w-4 text-(--app-success)" />
                      <Copy v-else class="h-4 w-4" />
                    </button>
                  </div>
                  <div class="flex items-center gap-4">
                    <!-- Countdown ring -->
                    <div class="relative h-10 w-10 shrink-0">
                      <svg class="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                        <circle
                          cx="18"
                          cy="18"
                          r="15"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="3"
                          class="text-white/10"
                        />
                        <circle
                          cx="18"
                          cy="18"
                          r="15"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="3"
                          class="transition-all duration-1000"
                          :class="
                            totpSecondsLeft <= 5
                              ? 'text-red-400'
                              : totpSecondsLeft <= 10
                                ? 'text-amber-400'
                                : 'text-(--app-primary)'
                          "
                          :stroke-dasharray="2 * Math.PI * 15"
                          :stroke-dashoffset="2 * Math.PI * 15 * (1 - totpSecondsLeft / 30)"
                        />
                      </svg>
                      <span
                        class="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-zinc-300"
                        >{{ totpSecondsLeft }}</span
                      >
                    </div>
                    <!-- Digit blocks -->
                    <div class="flex items-center gap-1">
                      <span
                        v-for="(ch, i) in (totpCode || '------').split('')"
                        :key="i"
                        class="inline-flex h-9 w-8 items-center justify-center rounded-lg bg-white/5 text-lg font-bold font-mono"
                        :class="[
                          i === 2 ? 'mr-2' : '',
                          totpSecondsLeft <= 5
                            ? 'text-red-400'
                            : totpSecondsLeft <= 10
                              ? 'text-amber-400'
                              : 'text-(--app-text)',
                        ]"
                        >{{ ch }}</span
                      >
                    </div>
                  </div>
                </div>
              </template>

              <!-- ── Body / notes ── -->
              <div v-if="selectedItem.body || selectedItem.notes">
                <p class="mb-1.5 text-xs font-medium text-zinc-500">
                  {{ selectedItem.type === "note" ? "Body" : "Notes" }}
                </p>
                <div
                  class="rounded-xl border border-white/5 bg-black/20 p-4 text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap"
                >
                  {{ selectedItem.body || selectedItem.notes }}
                </div>
              </div>

              <!-- njump link -->
              <div class="border-t border-white/5 pt-2">
                <a
                  :href="getNjumpUrl(selectedItem)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="group flex items-center justify-center gap-2 rounded-xl border border-white/5 bg-black/20 p-3 transition-colors hover:border-(--app-primary)/30"
                >
                  <ExternalLink
                    class="h-4 w-4 text-zinc-500 transition-colors group-hover:text-(--app-primary)"
                  />
                  <span
                    class="text-sm font-medium text-zinc-400 transition-colors group-hover:text-white"
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
