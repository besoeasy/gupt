<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import QRCode from "qrcode";
import {
  Check,
  Clock,
  Copy,
  Dices,
  Gamepad2,
  KeyRound,
  LoaderCircle,
  Share2,
  ShieldCheck,
  Sparkles,
  User,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { api } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { shortId } from "@/lib/crypto";
import { waitForRelayAck } from "@/lib/engine";
import { startAppSync } from "@/lib/sync";
import { publishTempInvite, TEMP_INVITE_DURATIONS } from "@/lib/tempInvite";
import { useIdentityStore } from "@/stores/identity";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();

const activeTab = ref(route.query.type === "permanent" ? "permanent" : "temp");

watch(
  () => route.query.type,
  (type) => {
    if (type === "permanent" || type === "temp") {
      activeTab.value = type;
    }
  },
);

function switchTab(tabId) {
  activeTab.value = tabId;
  void router.replace({ query: { ...route.query, type: tabId } });
}

const copied = ref("");
let copiedTimer = null;

// Gamertag randomizer
const GAMERTAG_PREFIXES = [
  "Shadow", "Cyber", "Neon", "Ghost", "Pixel", "Vortex", "Hyper", "Retro",
  "Alpha", "Zero", "Cosmic", "Iron", "Phantom", "Blaze", "Turbo", "Quantum",
  "Apex", "Frost", "Static", "Titan"
];

const GAMERTAG_SUFFIXES = [
  "Ranger", "Runner", "Sniper", "Striker", "Rider", "Ninja", "Knight", "Player",
  "Pilot", "Falcon", "Viper", "Slayer", "Hunter", "Gamer", "Ace", "Spectre",
  "Samurai", "Operative", "Drifter", "Warden"
];

function getRandomGamertag() {
  const prefix = GAMERTAG_PREFIXES[Math.floor(Math.random() * GAMERTAG_PREFIXES.length)];
  const suffix = GAMERTAG_SUFFIXES[Math.floor(Math.random() * GAMERTAG_SUFFIXES.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${prefix}${suffix}_${num}`;
}

const gamertag = ref(getRandomGamertag());

function generateRandomGamertag() {
  gamertag.value = getRandomGamertag();
}

// Temporary invite state
const tempDuration = ref("24h");
const creating = ref(false);
const createError = ref("");
const tempInvite = ref(null);
const tempStatus = ref("");

// Permanent invite state
const localProfile = ref(null);
const qrDataUrl = ref("");

const tick = ref(Date.now());
let tickTimer = null;
let mounted = true;

function timeLeft(expiresAt) {
  const diff = Number(expiresAt || 0) - tick.value;
  if (diff <= 0) return "expired";
  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

const tempExpiry = computed(() => (tempInvite.value ? timeLeft(tempInvite.value.expiresAt) : ""));

const gameInviteMessage = computed(() => {
  if (!tempInvite.value?.code) return "";
  const duration =
    TEMP_INVITE_DURATIONS.find((item) => item.id === tempDuration.value)?.label || "24 hours";
  const tag = tempInvite.value?.payload?.gamertag || gamertag.value.trim();
  const host = tag ? ` from ${tag}` : "";
  return `🎮 Join my match lobby${host}!\nRoom ticket: ${tempInvite.value.code}\n(Valid for ${duration}. Paste in lobby/chat screen)`;
});

async function createTempInvite() {
  if (creating.value) return;
  creating.value = true;
  createError.value = "";
  tempStatus.value = "";
  try {
    await identity.init();
    if (!identity.isReady) throw new Error("No identity is loaded on this device.");
    const duration =
      TEMP_INVITE_DURATIONS.find((item) => item.id === tempDuration.value) ||
      TEMP_INVITE_DURATIONS[2];
    await startAppSync(identity);
    const profile = await api.getLocalProfile(identity.pubkeyHex).catch(() => null);
    localProfile.value = profile;
    const invite = await publishTempInvite({
      privkeyHex: identity.privkeyHex,
      pubkeyHex: identity.pubkeyHex,
      name: gamertag.value.trim() || profile?.name || identity.profileName || "Player",
      seconds: duration.seconds,
    });
    tempInvite.value = invite;
    tempStatus.value = "publishing";
    waitForRelayAck(invite.eventId, 15000)
      .then(() => {
        if (mounted && tempInvite.value?.eventId === invite.eventId) tempStatus.value = "live";
      })
      .catch(() => {
        if (mounted && tempInvite.value?.eventId === invite.eventId) tempStatus.value = "queued";
      });
  } catch (e) {
    createError.value = e.message || "Could not create the lobby.";
  } finally {
    creating.value = false;
  }
}

async function copyValue(value, key) {
  if (!value) return;
  await copyToClipboard(value);
  copied.value = key;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copied.value = ""), 2000);
}

async function generateQr() {
  if (!identity.pubkeyHex) return;
  try {
    qrDataUrl.value = await QRCode.toDataURL(identity.pubkeyHex, {
      width: 220,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {}
}

onMounted(async () => {
  tickTimer = setInterval(() => (tick.value = Date.now()), 30000);
  await identity.init();
  if (identity.pubkeyHex) {
    localProfile.value = await api.getLocalProfile(identity.pubkeyHex).catch(() => null);
    void generateQr();
  }
});

onUnmounted(() => {
  mounted = false;
  clearInterval(tickTimer);
  clearTimeout(copiedTimer);
});
</script>

<template>
  <div class="h-full w-full min-w-0 overflow-y-auto bg-black pb-16 text-zinc-100">
    <main class="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
      <!-- Page Header -->
      <header class="flex items-center gap-3 pb-6">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-950/40 text-emerald-400"
        >
          <Share2 class="h-4 w-4" :stroke-width="2" />
        </div>
        <div class="min-w-0">
          <h1 class="truncate text-lg font-semibold tracking-tight text-white">Invite &amp; Connect</h1>
          <p class="mt-0.5 truncate text-xs leading-relaxed text-zinc-500">
            Choose between an expiring camouflaged lobby or your permanent identity.
          </p>
        </div>
      </header>

      <!-- Segmented Tab Switcher (clearly splitting permanent vs temp) -->
      <div
        class="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-1"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'temp'"
          class="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200 active:scale-[0.98]"
          :class="
            activeTab === 'temp'
              ? 'border border-zinc-700/80 bg-zinc-800 text-white shadow-xs'
              : 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
          "
          @click="switchTab('temp')"
        >
          <Gamepad2
            class="h-3.5 w-3.5 shrink-0"
            :class="activeTab === 'temp' ? 'text-emerald-400' : 'text-zinc-500'"
            :stroke-width="2"
          />
          <div class="flex flex-col items-start text-left sm:flex-row sm:items-center sm:gap-1.5">
            <span>Temporary Lobby</span>
            <span
              class="hidden font-mono text-[9px] uppercase tracking-wider text-emerald-400 sm:inline"
            >
              &middot; Expiring
            </span>
          </div>
        </button>

        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'permanent'"
          class="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200 active:scale-[0.98]"
          :class="
            activeTab === 'permanent'
              ? 'border border-zinc-700/80 bg-zinc-800 text-white shadow-xs'
              : 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
          "
          @click="switchTab('permanent')"
        >
          <ShieldCheck
            class="h-3.5 w-3.5 shrink-0"
            :class="activeTab === 'permanent' ? 'text-emerald-400' : 'text-zinc-500'"
            :stroke-width="2"
          />
          <div class="flex flex-col items-start text-left sm:flex-row sm:items-center sm:gap-1.5">
            <span>Permanent ID</span>
            <span
              class="hidden font-mono text-[9px] uppercase tracking-wider text-zinc-500 sm:inline"
            >
              &middot; Lifetime
            </span>
          </div>
        </button>
      </div>

      <!-- TAB 1: TEMPORARY (MATCH LOBBY) -->
      <div v-if="activeTab === 'temp'" class="space-y-6">
        <!-- Configuration Card -->
        <section class="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4 sm:p-5 space-y-4">
          <div class="flex items-center justify-between gap-3 border-b border-zinc-800/60 pb-3">
            <div class="min-w-0">
              <span class="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-400">
                Ephemeral Peer Discovery
              </span>
              <h2 class="text-sm font-semibold tracking-tight text-white mt-0.5">
                Disposable Match Lobby
              </h2>
            </div>
            <span
              v-if="tempInvite"
              class="inline-flex items-center gap-1.5 font-mono text-[10px] tabular-nums"
              :class="tempExpiry === 'expired' ? 'text-red-400' : 'text-zinc-400'"
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                :class="
                  tempExpiry === 'expired'
                    ? 'bg-red-400'
                    : tempStatus === 'live'
                      ? 'bg-emerald-400'
                      : 'bg-amber-400'
                "
              />
              {{ tempExpiry === "expired" ? "Expired" : `${tempExpiry} left` }}
              <span v-if="tempStatus === 'live'" class="text-emerald-400">&middot; live</span>
              <span v-else-if="tempStatus === 'publishing'" class="text-amber-400">&middot; publishing…</span>
              <span v-else-if="tempStatus === 'queued'" class="text-amber-400">&middot; queued</span>
            </span>
          </div>

          <!-- Duration selection -->
          <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <p class="text-xs font-medium text-zinc-200">Lobby duration</p>
              <p class="text-[11px] text-zinc-500">Auto-dropped by relays upon expiration.</p>
            </div>
            <div class="flex flex-wrap gap-1.5" role="group" aria-label="Lobby expiry duration">
              <button
                v-for="duration in TEMP_INVITE_DURATIONS"
                :key="duration.id"
                type="button"
                class="min-h-[40px] sm:min-h-0 cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-all disabled:opacity-50 active:scale-95"
                :class="
                  tempDuration === duration.id
                    ? 'border-zinc-600 bg-zinc-800 text-white'
                    : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                "
                :disabled="creating"
                @click="tempDuration = duration.id"
              >
                {{ duration.label }}
              </button>
            </div>
          </div>

          <!-- Gamertag randomizer -->
          <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-t border-zinc-800/60 pt-3">
            <div class="min-w-0">
              <p class="text-xs font-medium text-zinc-200">Decoy gamertag</p>
              <p class="text-[11px] text-zinc-500">Plausible cover pseudonym advertised in ticket.</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <input
                v-model="gamertag"
                type="text"
                maxlength="32"
                placeholder="e.g. NeonKnight_42"
                class="h-8 w-44 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 font-mono text-xs text-zinc-200 transition-colors placeholder:text-zinc-600 focus:border-zinc-600 focus:bg-zinc-900 focus:outline-none"
              />
              <button
                type="button"
                class="inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-8 sm:w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95"
                title="Roll random gamertag"
                @click="generateRandomGamertag"
              >
                <Dices class="h-3.5 w-3.5" :stroke-width="2" />
              </button>
            </div>
          </div>

          <!-- Publish button -->
          <div class="border-t border-zinc-800/60 pt-3 flex items-center justify-between gap-3">
            <p class="text-xs text-zinc-500">Publishes under an ephemeral key.</p>
            <button
              type="button"
              class="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white px-4 text-xs font-semibold text-black transition-all hover:bg-zinc-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="creating"
              @click="createTempInvite"
            >
              <LoaderCircle v-if="creating" class="h-3.5 w-3.5 animate-spin" :stroke-width="2.2" />
              <Sparkles v-else class="h-3.5 w-3.5" :stroke-width="2.2" />
              <span>{{ creating ? "Opening…" : tempInvite ? "Open new lobby" : "Open match lobby" }}</span>
            </button>
          </div>

          <AppAlertBanner v-if="createError" :message="createError" />
        </section>

        <!-- Generated Lobby Card -->
        <section v-if="tempInvite" class="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-4 sm:p-5 space-y-3">
          <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <span class="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-400">
                Ready to Share
              </span>
              <p class="text-xs text-zinc-400 mt-0.5">Paste into New Chat to connect immediately.</p>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                class="inline-flex min-h-[44px] sm:min-h-0 sm:h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-900/30 px-3 text-[11px] font-medium text-emerald-200 transition-colors hover:border-emerald-500/50 hover:bg-emerald-800/40 active:scale-95"
                :title="copied === 'game' ? 'Game invite copied!' : 'Copy full game invite message'"
                @click="copyValue(gameInviteMessage, 'game')"
              >
                <Check v-if="copied === 'game'" class="h-3 w-3 text-emerald-400" :stroke-width="2.5" />
                <Gamepad2 v-else class="h-3 w-3 text-emerald-400" :stroke-width="2" />
                <span>{{ copied === "game" ? "Copied invite!" : "Copy game invite" }}</span>
              </button>

              <button
                type="button"
                class="inline-flex min-h-[44px] sm:min-h-0 sm:h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95"
                :title="copied === 'code' ? 'Lobby code copied!' : 'Copy raw code'"
                @click="copyValue(tempInvite.code, 'code')"
              >
                <Check v-if="copied === 'code'" class="h-3 w-3 text-emerald-400" :stroke-width="2.5" />
                <Copy v-else class="h-3 w-3" :stroke-width="2" />
                <span>{{ copied === "code" ? "Copied code" : "Copy code" }}</span>
              </button>
            </div>
          </div>

          <div
            class="rounded-xl border border-zinc-800/80 bg-black/60 p-3 font-mono text-[11px] leading-relaxed break-all text-emerald-200 select-all"
          >
            {{ tempInvite.code }}
          </div>
        </section>

        <!-- Explainer Card -->
        <div class="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-xs text-zinc-400 space-y-2">
          <div class="flex items-center gap-1.5 font-medium text-zinc-200">
            <Gamepad2 class="h-4 w-4 text-emerald-400" :stroke-width="2" />
            <span>Why does Gupt look like a game lobby here?</span>
          </div>
          <p class="leading-relaxed text-zinc-400">
            To protect your privacy against network surveillance, eavesdropping, and shoulder
            surfing, peer invites are camouflaged as casual multiplayer match lobbies
            (<span class="font-mono text-zinc-300">match:lobby:...</span>) with decoy
            gamertags. Anyone seeing or intercepting this code will dismiss it as harmless
            gaming noise rather than a private messenger connection.
          </p>
        </div>
      </div>

      <!-- TAB 2: PERMANENT (PUBLIC ID) -->
      <div v-else-if="activeTab === 'permanent'" class="space-y-6">
        <!-- Identity Card & QR Code -->
        <section class="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4 sm:p-5 space-y-5">
          <div class="flex items-center justify-between gap-3 border-b border-zinc-800/60 pb-3">
            <div class="min-w-0">
              <span class="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">
                Lifetime Identity
              </span>
              <h2 class="text-sm font-semibold tracking-tight text-white mt-0.5">
                Permanent Public Address
              </h2>
            </div>
            <span class="inline-flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Never expires
            </span>
          </div>

          <!-- Profile info & Scannable QR code -->
          <div class="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex items-center gap-3.5 min-w-0">
              <RoboAvatar :pubkey="identity.pubkeyHex" size="xl" rounded="2xl" />
              <div class="min-w-0">
                <p class="truncate text-base font-semibold text-white">
                  {{ localProfile?.name || identity.profileName || "Gupt User" }}
                </p>
                <p class="font-mono text-xs text-zinc-500 mt-0.5">
                  {{ shortId(identity.pubkeyHex, 10, 8) }}
                </p>
                <p class="text-xs text-zinc-400 mt-1">Direct end-to-end encrypted inbox</p>
              </div>
            </div>

            <!-- Scannable QR -->
            <div v-if="qrDataUrl" class="flex flex-col items-center gap-1.5 shrink-0">
              <div class="rounded-xl border border-zinc-700/80 bg-white p-2 shadow-md">
                <img :src="qrDataUrl" alt="Permanent Profile QR Code" class="h-28 w-28 sm:h-32 sm:w-32" />
              </div>
              <span class="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Scan to add
              </span>
            </div>
          </div>

          <!-- Public Key Container -->
          <div class="border-t border-zinc-800/60 pt-4 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-medium text-zinc-300">Public profile ID (64-char hex)</p>
              <button
                type="button"
                class="inline-flex min-h-[44px] sm:min-h-0 sm:h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95"
                :title="copied === 'id' ? 'Profile ID copied!' : 'Copy profile ID'"
                @click="copyValue(identity.pubkeyHex, 'id')"
              >
                <Check v-if="copied === 'id'" class="h-3 w-3 text-emerald-400" :stroke-width="2.5" />
                <Copy v-else class="h-3 w-3" :stroke-width="2" />
                <span>{{ copied === "id" ? "Copied ID" : "Copy ID" }}</span>
              </button>
            </div>
            <div
              class="rounded-xl border border-zinc-800/80 bg-black/60 p-3 font-mono text-[11px] leading-relaxed break-all text-zinc-300 select-all"
            >
              {{ identity.pubkeyHex }}
            </div>
          </div>
        </section>

        <!-- Permanent Explainer Card -->
        <div class="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-xs text-zinc-400 space-y-2">
          <div class="flex items-center gap-1.5 font-medium text-zinc-200">
            <ShieldCheck class="h-4 w-4 text-emerald-400" :stroke-width="2" />
            <span>How permanent invites work</span>
          </div>
          <p class="leading-relaxed text-zinc-400">
            This public key is your permanent cryptographic address. You can share it in bios, on websites, or with trusted contacts. Unlike temporary match lobbies, it never expires and requires no relays to store extra records. Anyone entering this key will send messages encrypted directly to your inbox. Your private keys never leave this device.
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div class="pt-8 pb-4 text-center">
        <p class="font-mono text-[10px] uppercase tracking-widest text-zinc-600 tabular-nums">
          Encrypted Invites &middot; Peer Discovery
        </p>
      </div>
    </main>
  </div>
</template>
