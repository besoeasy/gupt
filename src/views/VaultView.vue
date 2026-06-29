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
import { noteEncode } from "nostr-tools/nip19";

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
  totpInterval = null;
  totpCountdownInterval = null;
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
    const note = noteEncode(item.eventId);
    return `https://njump.me/${note}`;
  } catch (e) {
    return "";
  }
}

onUnmounted(() => {
  clearInterval(totpInterval);
  clearInterval(totpCountdownInterval);
});
</script>

<template>
  <main class="chat-shell min-h-dvh overflow-y-auto lg:h-full">
    <div class="app-page-shell mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="mx-auto max-w-4xl space-y-6">
        <header
          class="flex flex-col gap-4 border-b border-white/8 pb-6 sm:flex-row sm:items-end sm:justify-between"
        >
          <div class="space-y-2">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-success)">
              Encrypted on device
            </p>
            <div class="space-y-1.5">
              <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Secure Vault</h1>
              <p class="max-w-xl text-sm leading-6 text-zinc-500">
                Notes, passwords, and bookmarks — encrypted with your keypair before they touch a
                relay.
              </p>
            </div>
          </div>
          <button
            v-if="!showCreateForm && !isLoading"
            type="button"
            class="ui-button ui-button-primary inline-flex shrink-0 items-center gap-2 self-start sm:self-auto"
            @click="openCreateForm"
          >
            <Plus class="h-4 w-4" />
            New item
          </button>
        </header>

        <AppAlertBanner v-if="error" :message="error" />

        <div
          v-if="isRefreshing"
          class="flex items-center justify-end gap-1.5 text-xs text-zinc-500"
        >
          <RefreshCw class="h-3 w-3 animate-spin" />
          <span>Syncing with relay…</span>
        </div>

        <div v-if="isLoading" class="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 class="mb-4 h-8 w-8 animate-spin text-(--app-success)" />
          <p class="font-medium text-zinc-300">Decrypting vault…</p>
          <p class="mt-1 text-xs text-zinc-500">Loading from cache and relays</p>
        </div>

        <VaultCreatePanel
          v-else-if="showCreateForm"
          :key="createFormKey"
          @saved="handleItemSaved"
          @cancel="closeCreateForm"
        />

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
          <button type="button" class="ui-button ui-button-primary" @click="openCreateForm">
            <Plus class="h-4 w-4 mr-1.5" />
            Create your first item
          </button>
        </section>

        <template v-else>
          <div
            class="grid grid-cols-2 gap-4 border-b border-white/8 pb-6 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-white/8"
          >
            <div class="sm:px-4 sm:first:pl-0">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Total</p>
              <p class="mt-1 text-2xl font-bold tabular-nums">{{ vaultStats.total }}</p>
            </div>
            <div class="sm:px-4">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-sky-400/80">
                Notes
              </p>
              <p class="mt-1 text-2xl font-bold tabular-nums">{{ vaultStats.notes }}</p>
            </div>
            <div class="sm:px-4">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80">
                Passwords
              </p>
              <p class="mt-1 text-2xl font-bold tabular-nums">{{ vaultStats.passwords }}</p>
            </div>
            <div class="sm:px-4 sm:last:pr-0">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-violet-400/80">
                Bookmarks
              </p>
              <p class="mt-1 text-2xl font-bold tabular-nums">{{ vaultStats.bookmarks }}</p>
            </div>
          </div>

          <section class="space-y-4">
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
                class="ui-input w-full !pl-11"
              />
            </div>

            <div class="flex gap-2 overflow-x-auto pb-0.5">
              <button
                v-for="filter in TYPE_FILTERS"
                :key="filter.value"
                @click="activeFilter = filter.value"
                class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all whitespace-nowrap"
                :class="
                  activeFilter === filter.value
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100'
                    : 'border-white/8 bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:text-white'
                "
              >
                <component :is="filter.icon" class="h-3.5 w-3.5" />
                {{ filter.label }}
              </button>
            </div>
          </section>

          <div v-if="filteredItems.length === 0" class="py-16 text-center">
            <Search class="mx-auto mb-3 h-8 w-8 text-zinc-600" />
            <p class="text-zinc-500">No items match your search or filter.</p>
          </div>

          <div v-else class="grid gap-3 sm:grid-cols-2">
            <button
              v-for="item in filteredItems"
              :key="item.id"
              type="button"
              @click="viewItem(item)"
              class="group flex flex-col rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-left transition-all duration-300 hover:border-emerald-500/25 hover:bg-white/[0.04]"
            >
              <div class="mb-3 flex items-start gap-3">
                <div
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset"
                  :class="typeMeta(item.type).iconWrap"
                >
                  <component :is="typeMeta(item.type).icon" class="h-5 w-5" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="mb-1 flex items-center gap-2">
                    <h3 class="truncate text-base font-semibold text-white">{{ item.title }}</h3>
                    <span
                      class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset"
                      :class="typeMeta(item.type).chip"
                    >
                      {{ typeMeta(item.type).label }}
                    </span>
                  </div>
                  <p class="line-clamp-2 text-xs leading-relaxed text-zinc-400">
                    {{ itemPreview(item) }}
                  </p>
                </div>
              </div>
              <div
                class="mt-auto flex items-center justify-between border-t border-white/5 pt-3 text-xs text-zinc-500"
              >
                <span>{{ formatRelativeDate(item.updatedAt) }}</span>
                <span
                  role="button"
                  tabindex="0"
                  class="rounded-lg p-1.5 text-zinc-500 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
                  title="Delete"
                  @click.stop="handleDelete(item)"
                  @keydown.enter.stop.prevent="handleDelete(item)"
                >
                  <Trash2 class="h-4 w-4" />
                </span>
              </div>
            </button>
          </div>
        </template>
      </div>
    </div>

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
          class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
        >
          <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="closeModals" />
          <div
            class="ui-panel relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl"
          >
            <div
              class="flex items-center justify-between border-b border-white/5 px-5 py-4 sm:px-6"
            >
              <div class="flex min-w-0 items-center gap-3">
                <div
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset"
                  :class="typeMeta(selectedItem.type).iconWrap"
                >
                  <component :is="typeMeta(selectedItem.type).icon" class="h-5 w-5" />
                </div>
                <div class="min-w-0">
                  <h2 class="truncate text-lg font-bold text-white">{{ selectedItem.title }}</h2>
                  <p class="text-xs text-zinc-400">
                    {{ typeMeta(selectedItem.type).label }} ·
                    {{ formatRelativeDate(selectedItem.updatedAt) }}
                  </p>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <button
                  @click="handleDelete(selectedItem)"
                  class="ui-icon-button h-9 w-9 text-zinc-400 hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
                <button
                  @click="closeModals"
                  class="ui-icon-button h-9 w-9 text-zinc-400 hover:text-white"
                >
                  <X class="h-5 w-5" />
                </button>
              </div>
            </div>

            <div class="space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
              <!-- Bookmark fields -->
              <template v-if="selectedItem.type === 'bookmark'">
                <div
                  v-if="selectedItem.url"
                  class="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/20 p-3.5"
                >
                  <div class="min-w-0">
                    <p class="text-xs font-medium text-zinc-500 mb-0.5">URL</p>
                    <p class="text-sm text-white font-mono truncate">{{ selectedItem.url }}</p>
                  </div>
                  <div class="flex items-center gap-1 shrink-0">
                    <a
                      :href="selectedItem.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="ui-icon-button h-8 w-8 text-zinc-400 hover:text-white"
                      title="Open URL"
                    >
                      <ExternalLink class="h-4 w-4" />
                    </a>
                    <button
                      @click="copyToClipboard(selectedItem.url, 'url')"
                      class="ui-icon-button h-8 w-8 text-zinc-400 hover:text-white"
                    >
                      <Check v-if="copiedFields['url']" class="h-4 w-4 text-emerald-400" />
                      <Copy v-else class="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </template>
              <template v-if="selectedItem.type === 'password'">
                <div
                  v-if="selectedItem.username"
                  class="bg-black/20 rounded-xl p-3 border border-white/5 flex items-center justify-between group"
                >
                  <div class="min-w-0">
                    <p class="text-xs font-medium text-zinc-500 mb-0.5">Username</p>
                    <p class="text-sm text-white font-mono truncate">{{ selectedItem.username }}</p>
                  </div>
                  <button
                    @click="copyToClipboard(selectedItem.username, 'username')"
                    class="ui-icon-button h-8 w-8 shrink-0 text-zinc-400 hover:text-white"
                  >
                    <Check v-if="copiedFields['username']" class="h-4 w-4 text-emerald-400" />
                    <Copy v-else class="h-4 w-4" />
                  </button>
                </div>

                <div
                  v-if="selectedItem.email"
                  class="bg-black/20 rounded-xl p-3 border border-white/5 flex items-center justify-between group"
                >
                  <div class="min-w-0">
                    <p class="text-xs font-medium text-zinc-500 mb-0.5">Email</p>
                    <p class="text-sm text-white font-mono truncate">{{ selectedItem.email }}</p>
                  </div>
                  <button
                    @click="copyToClipboard(selectedItem.email, 'email')"
                    class="ui-icon-button h-8 w-8 shrink-0 text-zinc-400 hover:text-white"
                  >
                    <Check v-if="copiedFields['email']" class="h-4 w-4 text-emerald-400" />
                    <Copy v-else class="h-4 w-4" />
                  </button>
                </div>

                <div
                  v-if="selectedItem.password"
                  class="bg-black/20 rounded-xl p-3 border border-white/5"
                >
                  <div class="flex items-center justify-between mb-1">
                    <p class="text-xs font-medium text-zinc-500">Password</p>
                    <div class="flex items-center gap-1">
                      <button
                        @click="showPassword = !showPassword"
                        class="ui-icon-button h-8 w-8 text-zinc-400 hover:text-white"
                        :title="showPassword ? 'Hide password' : 'Show password'"
                      >
                        <EyeOff v-if="showPassword" class="h-4 w-4" />
                        <Eye v-else class="h-4 w-4" />
                      </button>
                      <button
                        @click="copyToClipboard(selectedItem.password, 'password')"
                        class="ui-icon-button h-8 w-8 text-zinc-400 hover:text-white"
                        title="Copy password"
                      >
                        <Check v-if="copiedFields['password']" class="h-4 w-4 text-emerald-400" />
                        <Copy v-else class="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p
                    class="text-sm font-mono break-all"
                    :class="showPassword ? 'text-white' : 'text-zinc-500 tracking-widest'"
                  >
                    {{
                      showPassword
                        ? selectedItem.password
                        : "•".repeat(Math.min(selectedItem.password.length, 16))
                    }}
                  </p>
                </div>

                <!-- Live TOTP widget -->
                <div
                  v-if="selectedItem.otpKey"
                  class="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4"
                >
                  <div class="flex items-center justify-between mb-3">
                    <p class="text-xs font-medium text-zinc-500">2FA Code</p>
                    <button
                      @click="copyToClipboard(totpCode, 'otp')"
                      class="ui-icon-button h-8 w-8 text-zinc-400 hover:text-white"
                      title="Copy code"
                    >
                      <Check v-if="copiedFields['otp']" class="h-4 w-4 text-emerald-400" />
                      <Copy v-else class="h-4 w-4" />
                    </button>
                  </div>
                  <div class="flex items-center gap-4">
                    <!-- Countdown ring -->
                    <div class="relative shrink-0 h-10 w-10">
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
                    <!-- The code itself -->
                    <div class="flex gap-1.5 items-center">
                      <span
                        v-for="(ch, i) in (totpCode || '------').split('')"
                        :key="i"
                        class="inline-block w-8 text-center text-xl font-bold font-mono rounded-md py-1"
                        :class="[
                          i === 2 ? 'mr-2' : '',
                          totpSecondsLeft <= 5
                            ? 'text-red-400'
                            : totpSecondsLeft <= 10
                              ? 'text-amber-400'
                              : 'text-white',
                        ]"
                        >{{ ch }}</span
                      >
                    </div>
                  </div>
                </div>
              </template>

              <div v-if="selectedItem.body || selectedItem.notes">
                <p class="text-xs font-medium text-zinc-500 mb-1.5">
                  {{ selectedItem.type === "note" ? "Body" : "Notes" }}
                </p>
                <div
                  class="bg-black/20 rounded-xl p-4 border border-white/5 text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed"
                >
                  {{ selectedItem.body || selectedItem.notes }}
                </div>
              </div>

              <div class="border-t border-white/5 pt-2">
                <a
                  :href="getNjumpUrl(selectedItem)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="group flex items-center justify-center gap-2 rounded-xl border border-white/5 bg-black/20 p-3 transition-colors hover:border-(--app-primary)/30"
                >
                  <ExternalLink
                    class="h-4 w-4 text-zinc-400 transition-colors group-hover:text-(--app-primary)"
                  />
                  <span
                    class="text-sm font-medium text-zinc-300 transition-colors group-hover:text-white"
                    >View event on njump.me</span
                  >
                </a>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </main>
</template>
