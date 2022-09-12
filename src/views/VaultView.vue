<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
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

const router = useRouter();
const identity = useIdentityStore();
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
let totpInterval = null;

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
  totpInterval = null;
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
    // Also tick the countdown every second
    setInterval(() => {
      totpSecondsLeft.value = totpSecondsRemaining();
    }, 1000);
  }
}

async function handleDelete(item) {
  if (!confirm("Are you sure you want to delete this item? It will be removed from relays."))
    return;

  try {
    await deleteVaultItem(identity.privkeyHex, identity.pubkeyHex, item.eventId);
    // Remove optimistically from local list — cache is already invalidated.
    items.value = items.value.filter((i) => i.eventId !== item.eventId);
    closeModals();
  } catch (err) {
    alert("Failed to delete: " + err.message);
  }
}

function copyToClipboard(text, field) {
  if (!text) return;
  navigator.clipboard.writeText(text);
  copiedFields.value[field] = true;
  setTimeout(() => (copiedFields.value[field] = false), 2000);
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

function formatDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString();
}

onUnmounted(() => {
  clearInterval(totpInterval);
});
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-8">
    <div class="mb-8 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white flex items-center gap-2">
          <Shield class="h-6 w-6 text-emerald-400" />
          Secure Vault
        </h1>
        <p class="text-sm text-zinc-400 mt-1">
          End-to-end encrypted notes, passwords, and bookmarks
        </p>
      </div>
      <button
        @click="router.push('/vault/new')"
        class="ui-icon-button-primary flex items-center justify-center h-10 w-10 shrink-0 rounded-2xl"
        title="New Item"
      >
        <Plus class="h-5 w-5" />
      </button>
    </div>

    <!-- Subtle background-refresh indicator (stale cache revalidating) -->
    <div
      v-if="isRefreshing"
      class="flex items-center justify-end gap-1.5 mb-4 text-xs text-zinc-500"
    >
      <RefreshCw class="h-3 w-3 animate-spin" />
      <span>Syncing with relay…</span>
    </div>

    <div v-if="isLoading" class="flex flex-col items-center justify-center py-16">
      <Loader2 class="h-8 w-8 animate-spin text-(--app-primary) mb-4" />
      <p class="text-zinc-400">Decrypting vault...</p>
    </div>

    <div
      v-else-if="items.length === 0"
      class="ui-panel rounded-2xl p-12 text-center border border-white/5"
    >
      <Shield class="h-12 w-12 text-zinc-600 mx-auto mb-4 opacity-50" />
      <h3 class="text-lg font-medium text-white mb-2">Your vault is empty</h3>
      <p class="text-sm text-zinc-400 max-w-sm mx-auto mb-6">
        Store your sensitive notes and passwords securely. All data is encrypted with your private
        key before leaving your device.
      </p>
      <button @click="router.push('/vault/new')" class="ui-button ui-button-primary mx-auto">
        <Plus class="h-4 w-4 mr-1.5" />
        Create your first item
      </button>
    </div>

    <template v-else>
      <div class="mb-6 space-y-4">
        <!-- Search -->
        <div class="relative">
          <div
            class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500"
          >
            <Search class="h-4 w-4" />
          </div>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search titles, emails, URLs, and notes..."
            class="ui-input w-full !pl-11"
          />
        </div>

        <!-- Filters -->
        <div class="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          <button
            v-for="filter in [
              { value: 'all', label: 'All' },
              { value: 'note', label: 'Notes' },
              { value: 'password', label: 'Passwords' },
              { value: 'bookmark', label: 'Bookmarks' },
            ]"
            :key="filter.value"
            @click="activeFilter = filter.value"
            class="px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap border"
            :class="
              activeFilter === filter.value
                ? 'bg-(--app-primary) text-white border-transparent shadow-md'
                : 'ui-surface text-zinc-400 hover:text-white'
            "
          >
            {{ filter.label }}
          </button>
        </div>
      </div>

      <div
        v-if="filteredItems.length === 0"
        class="ui-panel rounded-2xl p-12 text-center border border-white/5"
      >
        <p class="text-zinc-400">No items found matching your filters.</p>
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-2">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          @click="viewItem(item)"
          class="ui-panel rounded-xl p-4 cursor-pointer hover:bg-white/5 transition-colors group flex flex-col"
        >
          <div class="flex items-start gap-3 mb-2">
            <div
              class="h-10 w-10 shrink-0 rounded-full bg-black/20 flex items-center justify-center text-(--app-primary)"
            >
              <FileText v-if="item.type === 'note'" class="h-5 w-5" />
              <Bookmark v-else-if="item.type === 'bookmark'" class="h-5 w-5" />
              <Key v-else class="h-5 w-5" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-base font-semibold text-white truncate">{{ item.title }}</h3>
              <p class="text-xs text-zinc-400 mt-0.5 capitalize">{{ item.type }}</p>
            </div>
          </div>
          <div class="mt-auto pt-4 flex items-center justify-between text-xs text-zinc-500">
            <span>Updated {{ formatDate(item.updatedAt) }}</span>
            <button
              @click.stop="handleDelete(item)"
              class="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-400 transition-all p-1"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- View Modal -->
    <Teleport to="body">
      <div
        v-if="showViewModal && selectedItem"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeModals" />
        <div
          class="ui-panel relative z-10 w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        >
          <div class="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
            <div class="flex items-center gap-3">
              <div
                class="h-10 w-10 shrink-0 rounded-full bg-(--app-primary)/20 flex items-center justify-center text-(--app-primary)"
              >
                <FileText v-if="selectedItem.type === 'note'" class="h-5 w-5" />
                <Bookmark v-else-if="selectedItem.type === 'bookmark'" class="h-5 w-5" />
                <Key v-else class="h-5 w-5" />
              </div>
              <div>
                <h2 class="text-xl font-bold text-white">{{ selectedItem.title }}</h2>
                <p class="text-xs text-zinc-400 capitalize">{{ selectedItem.type }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="handleDelete(selectedItem)"
                class="ui-icon-button h-8 w-8 text-zinc-400 hover:text-red-400"
                title="Delete"
              >
                <Trash2 class="h-4 w-4" />
              </button>
              <button
                @click="closeModals"
                class="ui-icon-button h-8 w-8 text-zinc-400 hover:text-white"
              >
                <X class="h-5 w-5" />
              </button>
            </div>
          </div>

          <div class="space-y-5">
            <!-- Bookmark fields -->
            <template v-if="selectedItem.type === 'bookmark'">
              <div
                v-if="selectedItem.url"
                class="bg-black/20 rounded-xl p-3 border border-white/5 flex items-center justify-between gap-2"
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
                class="bg-black/20 rounded-xl p-4 border border-white/5"
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

            <!-- NJump Link -->
            <div class="pt-4 border-t border-white/5">
              <a
                :href="getNjumpUrl(selectedItem)"
                target="_blank"
                rel="noopener noreferrer"
                class="group flex items-center justify-center gap-2 ui-panel rounded-xl p-3 border border-white/5 hover:border-(--app-primary)/30 transition-colors"
              >
                <ExternalLink
                  class="h-4 w-4 text-zinc-400 group-hover:text-(--app-primary) transition-colors"
                />
                <span
                  class="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors"
                  >View Event on njump.me</span
                >
              </a>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
