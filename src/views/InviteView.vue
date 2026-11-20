<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
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
} from "@/icons";
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

onMounted(async () => {
  tickTimer = setInterval(() => (tick.value = Date.now()), 30000);
  await identity.init();
  if (identity.pubkeyHex) {
    localProfile.value = await api.getLocalProfile(identity.pubkeyHex).catch(() => null);
  }
});

onUnmounted(() => {
  mounted = false;
  clearInterval(tickTimer);
  clearTimeout(copiedTimer);
});
</script>

<template>
  <div class="invite-view__block">
    <main class="invite-view__main">
      <!-- Page Header -->
      <header class="invite-view__header">
        <div
          class="invite-view__block-2"
        >
          <Share2 class="invite-view__share2" :stroke-width="2" />
        </div>
        <div class="invite-view__block-3">
          <h1 class="invite-view__title">Invite &amp; Connect</h1>
          <p class="invite-view__text">
            Choose between an expiring camouflaged lobby or your permanent identity.
          </p>
        </div>
      </header>

      <!-- Segmented Tab Switcher (clearly splitting permanent vs temp) -->
      <div
        class="invite-view__tablist"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'temp'"
          class="invite-view__tab"
          :class="
            activeTab === 'temp'
              ? 'invite-view__tab--selected'
              : 'invite-view__tab--muted'
          "
          @click="switchTab('temp')"
        >
          <Gamepad2
            class="invite-view__gamepad2"
            :class="activeTab === 'temp' ? 'invite-view__gamepad2--success' : 'invite-view__gamepad2--muted'"
            :stroke-width="2"
          />
          <div class="invite-view__block-4">
            <span>Temporary Lobby</span>
            <span
              class="invite-view__text-2"
            >
              &middot; Expiring
            </span>
          </div>
        </button>

        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'permanent'"
          class="invite-view__tab-2"
          :class="
            activeTab === 'permanent'
              ? 'invite-view__tab--selected-2'
              : 'invite-view__tab--muted-2'
          "
          @click="switchTab('permanent')"
        >
          <ShieldCheck
            class="invite-view__shield-check"
            :class="activeTab === 'permanent' ? 'invite-view__shield-check--success' : 'invite-view__shield-check--muted'"
            :stroke-width="2"
          />
          <div class="invite-view__block-5">
            <span>Permanent ID</span>
            <span
              class="invite-view__text-3"
            >
              &middot; Lifetime
            </span>
          </div>
        </button>
      </div>

      <!-- TAB 1: TEMPORARY (MATCH LOBBY) -->
      <div v-if="activeTab === 'temp'" class="invite-view__block-6">
        <!-- Configuration Card -->
        <section class="invite-view__section">
          <div class="invite-view__block-7">
            <div class="invite-view__block-8">
              <span class="invite-view__text-ephemeral-peer">
                Ephemeral Peer Discovery
              </span>
              <h2 class="invite-view__subtitle-disposable-match">
                Disposable Match Lobby
              </h2>
            </div>
            <span
              v-if="tempInvite"
              class="invite-view__text-4"
              :class="tempExpiry === 'expired' ? 'invite-view__text--danger' : 'invite-view__text--muted'"
            >
              <span
                class="invite-view__text-5"
                :class="
                  tempExpiry === 'expired'
                    ? 'invite-view__text--danger-2'
                    : tempStatus === 'live'
                      ? 'invite-view__text--success'
                      : 'invite-view__text--warning'
                "
              />
              {{ tempExpiry === "expired" ? "Expired" : `${tempExpiry} left` }}
              <span v-if="tempStatus === 'live'" class="invite-view__text-6">&middot; live</span>
              <span v-else-if="tempStatus === 'publishing'" class="invite-view__text-7">&middot; publishing…</span>
              <span v-else-if="tempStatus === 'queued'" class="invite-view__text-8">&middot; queued</span>
            </span>
          </div>

          <!-- Duration selection -->
          <div class="invite-view__block-9">
            <div class="invite-view__block-10">
              <p class="invite-view__text-lobby-duration">Lobby duration</p>
              <p class="invite-view__text-9">Auto-dropped by relays upon expiration.</p>
            </div>
            <div class="invite-view__group-lobby-expiry" role="group" aria-label="Lobby expiry duration">
              <button
                v-for="duration in TEMP_INVITE_DURATIONS"
                :key="duration.id"
                type="button"
                class="invite-view__button"
                :class="
                  tempDuration === duration.id
                    ? 'invite-view__button--selected'
                    : 'invite-view__button--muted'
                "
                :disabled="creating"
                @click="tempDuration = duration.id"
              >
                {{ duration.label }}
              </button>
            </div>
          </div>

          <!-- Gamertag randomizer -->
          <div class="invite-view__block-11">
            <div class="invite-view__block-12">
              <p class="invite-view__text-decoy-gamertag">Decoy gamertag</p>
              <p class="invite-view__text-10">Plausible cover pseudonym advertised in ticket.</p>
            </div>
            <div class="invite-view__block-13">
              <input
                v-model="gamertag"
                type="text"
                maxlength="32"
                placeholder="e.g. NeonKnight_42"
                class="invite-view__field-text"
              />
              <button
                type="button"
                class="invite-view__button-roll-random"
                title="Roll random gamertag"
                @click="generateRandomGamertag"
              >
                <Dices class="invite-view__dices" :stroke-width="2" />
              </button>
            </div>
          </div>

          <!-- Publish button -->
          <div class="invite-view__block-14">
            <p class="invite-view__text-11">Publishes under an ephemeral key.</p>
            <button
              type="button"
              class="invite-view__button-2"
              :disabled="creating"
              @click="createTempInvite"
            >
              <LoaderCircle v-if="creating" class="invite-view__loader-circle" :stroke-width="2.2" />
              <Sparkles v-else class="invite-view__sparkles" :stroke-width="2.2" />
              <span>{{ creating ? "Opening…" : tempInvite ? "Open new lobby" : "Open match lobby" }}</span>
            </button>
          </div>

          <AppAlertBanner v-if="createError" :message="createError" />
        </section>

        <!-- Generated Lobby Card -->
        <section v-if="tempInvite" class="invite-view__section-2">
          <div class="invite-view__block-15">
            <div class="invite-view__block-16">
              <span class="invite-view__text-ready-to">
                Ready to Share
              </span>
              <p class="invite-view__text-12">Paste into New Chat to connect immediately.</p>
            </div>
            <div class="invite-view__block-17">
              <button
                type="button"
                class="invite-view__button-3"
                :title="copied === 'game' ? 'Game invite copied!' : 'Copy full game invite message'"
                @click="copyValue(gameInviteMessage, 'game')"
              >
                <Check v-if="copied === 'game'" class="invite-view__check" :stroke-width="2.5" />
                <Gamepad2 v-else class="invite-view__gamepad2-2" :stroke-width="2" />
                <span>{{ copied === "game" ? "Copied invite!" : "Copy game invite" }}</span>
              </button>

              <button
                type="button"
                class="invite-view__button-4"
                :title="copied === 'code' ? 'Lobby code copied!' : 'Copy raw code'"
                @click="copyValue(tempInvite.code, 'code')"
              >
                <Check v-if="copied === 'code'" class="invite-view__check-2" :stroke-width="2.5" />
                <Copy v-else class="invite-view__copy" :stroke-width="2" />
                <span>{{ copied === "code" ? "Copied code" : "Copy code" }}</span>
              </button>
            </div>
          </div>

          <div
            class="invite-view__block-18"
          >
            {{ tempInvite.code }}
          </div>
        </section>

        <!-- Explainer Card -->
        <div class="invite-view__block-19">
          <div class="invite-view__block-20">
            <Gamepad2 class="invite-view__gamepad2-3" :stroke-width="2" />
            <span>Why does Gupt look like a game lobby here?</span>
          </div>
          <p class="invite-view__text-13">
            To protect your privacy against network surveillance, eavesdropping, and shoulder
            surfing, peer invites are camouflaged as casual multiplayer match lobbies
            (<span class="invite-view__text-match-lobby">match:lobby:...</span>) with decoy
            gamertags. Anyone seeing or intercepting this code will dismiss it as harmless
            gaming noise rather than a private messenger connection.
          </p>
        </div>
      </div>

      <!-- TAB 2: PERMANENT (PUBLIC ID) -->
      <div v-else-if="activeTab === 'permanent'" class="invite-view__block-21">
        <!-- Identity Card -->
        <section class="invite-view__section-3">
          <div class="invite-view__block-22">
            <div class="invite-view__block-23">
              <span class="invite-view__text-lifetime-identity">
                Lifetime Identity
              </span>
              <h2 class="invite-view__subtitle-permanent-public">
                Permanent Public Address
              </h2>
            </div>
            <span class="invite-view__text-never-expires">
              <span class="invite-view__text-14" />
              Never expires
            </span>
          </div>

          <!-- Profile info -->
          <div class="invite-view__block-24">
            <RoboAvatar :pubkey="identity.pubkeyHex" size="xl" rounded="2xl" />
            <div class="invite-view__block-25">
              <p class="invite-view__text-15">
                {{ localProfile?.name || identity.profileName || "Gupt User" }}
              </p>
              <p class="invite-view__text-16">
                {{ shortId(identity.pubkeyHex, 10, 8) }}
              </p>
              <p class="invite-view__text-17">Direct end-to-end encrypted inbox</p>
            </div>
          </div>

          <!-- Public Key Container -->
          <div class="invite-view__block-26">
            <div class="invite-view__block-27">
              <p class="invite-view__text-18">Public profile ID (64-char hex)</p>
              <button
                type="button"
                class="invite-view__button-5"
                :title="copied === 'id' ? 'Profile ID copied!' : 'Copy profile ID'"
                @click="copyValue(identity.pubkeyHex, 'id')"
              >
                <Check v-if="copied === 'id'" class="invite-view__check-3" :stroke-width="2.5" />
                <Copy v-else class="invite-view__copy-2" :stroke-width="2" />
                <span>{{ copied === "id" ? "Copied ID" : "Copy ID" }}</span>
              </button>
            </div>
            <div
              class="invite-view__block-28"
            >
              {{ identity.pubkeyHex }}
            </div>
          </div>
        </section>

        <!-- Permanent Explainer Card -->
        <div class="invite-view__block-29">
          <div class="invite-view__block-30">
            <ShieldCheck class="invite-view__shield-check-2" :stroke-width="2" />
            <span>How permanent invites work</span>
          </div>
          <p class="invite-view__text-19">
            This public key is your permanent cryptographic address. You can share it in bios, on websites, or with trusted contacts. Unlike temporary match lobbies, it never expires and requires no relays to store extra records. Anyone entering this key will send messages encrypted directly to your inbox. Your private keys never leave this device.
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div class="invite-view__block-31">
        <p class="invite-view__text-20">
          Encrypted Invites &middot; Peer Discovery
        </p>
      </div>
    </main>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.invite-view__button-3:hover {
  border-color: #00bb7f80;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.invite-view__button-3:hover {
  border-color: color-mix(in oklab,var(--color-emerald-500) 50%,transparent);
}
}
}

@media (hover:hover) {
.invite-view__button--muted:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.invite-view__button-roll-random:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.invite-view__button-4:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.invite-view__button-5:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.invite-view__button-3:hover {
  background-color: #005f4666;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.invite-view__button-3:hover {
  background-color: color-mix(in oklab,var(--color-emerald-800) 40%,transparent);
}
}
}

@media (hover:hover) {
.invite-view__button-2:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.invite-view__button-roll-random:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.invite-view__button-4:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.invite-view__button-5:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.invite-view__tab--muted:hover {
  background-color: var(--app-surface-tint-soft);
}
}

@media (hover:hover) {
.invite-view__tab--muted-2:hover {
  background-color: var(--app-surface-tint-soft);
}
}

@media (hover:hover) {
.invite-view__button-roll-random:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.invite-view__button-4:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.invite-view__button-5:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.invite-view__tab--muted:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.invite-view__tab--muted-2:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.invite-view__button--muted:hover {
  color: var(--ui-zinc-200);
}
}

@media (min-width:40rem) {
.invite-view__text-2 {
  display: inline;
}
}

@media (min-width:40rem) {
.invite-view__text-3 {
  display: inline;
}
}

@media (min-width:40rem) {
.invite-view__button-3 {
  height: calc(var(--spacing) * 7);
}
}

@media (min-width:40rem) {
.invite-view__button-4 {
  height: calc(var(--spacing) * 7);
}
}

@media (min-width:40rem) {
.invite-view__button-5 {
  height: calc(var(--spacing) * 7);
}
}

@media (min-width:40rem) {
.invite-view__button-roll-random {
  height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.invite-view__button {
  min-height: 0;
}
}

@media (min-width:40rem) {
.invite-view__button-roll-random {
  min-height: 0;
}
}

@media (min-width:40rem) {
.invite-view__button-3 {
  min-height: 0;
}
}

@media (min-width:40rem) {
.invite-view__button-4 {
  min-height: 0;
}
}

@media (min-width:40rem) {
.invite-view__button-5 {
  min-height: 0;
}
}

@media (min-width:40rem) {
.invite-view__button-roll-random {
  width: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.invite-view__button-roll-random {
  min-width: 0;
}
}

@media (min-width:40rem) {
.invite-view__block-4 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.invite-view__block-5 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.invite-view__block-9 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.invite-view__block-11 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.invite-view__block-15 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.invite-view__block-4 {
  align-items: center;
}
}

@media (min-width:40rem) {
.invite-view__block-5 {
  align-items: center;
}
}

@media (min-width:40rem) {
.invite-view__block-9 {
  align-items: center;
}
}

@media (min-width:40rem) {
.invite-view__block-11 {
  align-items: center;
}
}

@media (min-width:40rem) {
.invite-view__block-15 {
  align-items: center;
}
}

@media (min-width:40rem) {
.invite-view__block-9 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.invite-view__block-11 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.invite-view__block-15 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.invite-view__block-4 {
  gap: calc(var(--spacing) * 1.5);
}
}

@media (min-width:40rem) {
.invite-view__block-5 {
  gap: calc(var(--spacing) * 1.5);
}
}

@media (min-width:40rem) {
.invite-view__section {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.invite-view__section-2 {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.invite-view__section-3 {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.invite-view__main {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.invite-view__main {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.invite-view__main {
  margin-inline: auto;
}
.invite-view__text {
  margin-top: calc(var(--spacing) * .5);
}
.invite-view__subtitle-disposable-match {
  margin-top: calc(var(--spacing) * .5);
}
.invite-view__text-12 {
  margin-top: calc(var(--spacing) * .5);
}
.invite-view__subtitle-permanent-public {
  margin-top: calc(var(--spacing) * .5);
}
.invite-view__text-16 {
  margin-top: calc(var(--spacing) * .5);
}
.invite-view__text-17 {
  margin-top: var(--spacing);
}
.invite-view__tablist {
  margin-bottom: calc(var(--spacing) * 6);
}
.invite-view__header {
  display: flex;
}
.invite-view__block-2 {
  display: flex;
}
.invite-view__block-4 {
  display: flex;
}
.invite-view__block-5 {
  display: flex;
}
.invite-view__block-7 {
  display: flex;
}
.invite-view__block-9 {
  display: flex;
}
.invite-view__group-lobby-expiry {
  display: flex;
}
.invite-view__block-11 {
  display: flex;
}
.invite-view__block-13 {
  display: flex;
}
.invite-view__block-14 {
  display: flex;
}
.invite-view__block-15 {
  display: flex;
}
.invite-view__block-17 {
  display: flex;
}
.invite-view__block-20 {
  display: flex;
}
.invite-view__block-22 {
  display: flex;
}
.invite-view__block-24 {
  display: flex;
}
.invite-view__block-27 {
  display: flex;
}
.invite-view__block-30 {
  display: flex;
}
.invite-view__tablist {
  display: grid;
}
.invite-view__text-2 {
  display: none;
}
.invite-view__text-3 {
  display: none;
}
.invite-view__tab {
  display: inline-flex;
}
.invite-view__tab-2 {
  display: inline-flex;
}
.invite-view__text-4 {
  display: inline-flex;
}
.invite-view__button-roll-random {
  display: inline-flex;
}
.invite-view__button-2 {
  display: inline-flex;
}
.invite-view__button-3 {
  display: inline-flex;
}
.invite-view__button-4 {
  display: inline-flex;
}
.invite-view__text-never-expires {
  display: inline-flex;
}
.invite-view__button-5 {
  display: inline-flex;
}
.invite-view__text-5 {
  height: calc(var(--spacing) * 1.5);
}
.invite-view__text-14 {
  height: calc(var(--spacing) * 1.5);
}
.invite-view__check {
  height: calc(var(--spacing) * 3);
}
.invite-view__gamepad2-2 {
  height: calc(var(--spacing) * 3);
}
.invite-view__check-2 {
  height: calc(var(--spacing) * 3);
}
.invite-view__copy {
  height: calc(var(--spacing) * 3);
}
.invite-view__check-3 {
  height: calc(var(--spacing) * 3);
}
.invite-view__copy-2 {
  height: calc(var(--spacing) * 3);
}
.invite-view__gamepad2 {
  height: calc(var(--spacing) * 3.5);
}
.invite-view__shield-check {
  height: calc(var(--spacing) * 3.5);
}
.invite-view__dices {
  height: calc(var(--spacing) * 3.5);
}
.invite-view__loader-circle {
  height: calc(var(--spacing) * 3.5);
}
.invite-view__sparkles {
  height: calc(var(--spacing) * 3.5);
}
.invite-view__share2 {
  height: calc(var(--spacing) * 4);
}
.invite-view__gamepad2-3 {
  height: calc(var(--spacing) * 4);
}
.invite-view__shield-check-2 {
  height: calc(var(--spacing) * 4);
}
.invite-view__field-text {
  height: calc(var(--spacing) * 8);
}
.invite-view__button-2 {
  height: calc(var(--spacing) * 9);
}
.invite-view__block-2 {
  height: calc(var(--spacing) * 10);
}
.invite-view__block {
  height: 100%;
}
.invite-view__button {
  min-height: 40px;
}
.invite-view__tab {
  min-height: 44px;
}
.invite-view__tab-2 {
  min-height: 44px;
}
.invite-view__button-roll-random {
  min-height: 44px;
}
.invite-view__button-3 {
  min-height: 44px;
}
.invite-view__button-4 {
  min-height: 44px;
}
.invite-view__button-5 {
  min-height: 44px;
}
.invite-view__text-5 {
  width: calc(var(--spacing) * 1.5);
}
.invite-view__text-14 {
  width: calc(var(--spacing) * 1.5);
}
.invite-view__check {
  width: calc(var(--spacing) * 3);
}
.invite-view__gamepad2-2 {
  width: calc(var(--spacing) * 3);
}
.invite-view__check-2 {
  width: calc(var(--spacing) * 3);
}
.invite-view__copy {
  width: calc(var(--spacing) * 3);
}
.invite-view__check-3 {
  width: calc(var(--spacing) * 3);
}
.invite-view__copy-2 {
  width: calc(var(--spacing) * 3);
}
.invite-view__gamepad2 {
  width: calc(var(--spacing) * 3.5);
}
.invite-view__shield-check {
  width: calc(var(--spacing) * 3.5);
}
.invite-view__dices {
  width: calc(var(--spacing) * 3.5);
}
.invite-view__loader-circle {
  width: calc(var(--spacing) * 3.5);
}
.invite-view__sparkles {
  width: calc(var(--spacing) * 3.5);
}
.invite-view__share2 {
  width: calc(var(--spacing) * 4);
}
.invite-view__gamepad2-3 {
  width: calc(var(--spacing) * 4);
}
.invite-view__shield-check-2 {
  width: calc(var(--spacing) * 4);
}
.invite-view__block-2 {
  width: calc(var(--spacing) * 10);
}
.invite-view__field-text {
  width: calc(var(--spacing) * 44);
}
.invite-view__block {
  width: 100%;
}
.invite-view__main {
  width: 100%;
}
.invite-view__main {
  max-width: var(--container-6xl);
}
.invite-view__block {
  min-width: 0;
}
.invite-view__block-3 {
  min-width: 0;
}
.invite-view__block-8 {
  min-width: 0;
}
.invite-view__block-10 {
  min-width: 0;
}
.invite-view__block-12 {
  min-width: 0;
}
.invite-view__block-16 {
  min-width: 0;
}
.invite-view__block-23 {
  min-width: 0;
}
.invite-view__block-24 {
  min-width: 0;
}
.invite-view__block-25 {
  min-width: 0;
}
.invite-view__button-roll-random {
  min-width: 44px;
}
.invite-view__block-25 {
  flex: 1;
}
.invite-view__block-2 {
  flex-shrink: 0;
}
.invite-view__gamepad2 {
  flex-shrink: 0;
}
.invite-view__shield-check {
  flex-shrink: 0;
}
.invite-view__block-13 {
  flex-shrink: 0;
}
.invite-view__button-roll-random {
  flex-shrink: 0;
}
.invite-view__button-2 {
  flex-shrink: 0;
}
.invite-view__block-17 {
  flex-shrink: 0;
}
.invite-view__button-3 {
  flex-shrink: 0;
}
.invite-view__button-4 {
  flex-shrink: 0;
}
.invite-view__button-5 {
  flex-shrink: 0;
}
.invite-view__loader-circle {
  animation: var(--animate-spin);
}
.invite-view__tab {
  cursor: pointer;
}
.invite-view__tab-2 {
  cursor: pointer;
}
.invite-view__button {
  cursor: pointer;
}
.invite-view__button-roll-random {
  cursor: pointer;
}
.invite-view__button-2 {
  cursor: pointer;
}
.invite-view__button-3 {
  cursor: pointer;
}
.invite-view__button-4 {
  cursor: pointer;
}
.invite-view__button-5 {
  cursor: pointer;
}
.invite-view__tablist {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
.invite-view__block-4 {
  flex-direction: column;
}
.invite-view__block-5 {
  flex-direction: column;
}
.invite-view__block-9 {
  flex-direction: column;
}
.invite-view__block-11 {
  flex-direction: column;
}
.invite-view__block-15 {
  flex-direction: column;
}
.invite-view__group-lobby-expiry {
  flex-wrap: wrap;
}
.invite-view__block-17 {
  flex-wrap: wrap;
}
.invite-view__header {
  align-items: center;
}
.invite-view__block-2 {
  align-items: center;
}
.invite-view__tab {
  align-items: center;
}
.invite-view__tab-2 {
  align-items: center;
}
.invite-view__block-7 {
  align-items: center;
}
.invite-view__text-4 {
  align-items: center;
}
.invite-view__block-13 {
  align-items: center;
}
.invite-view__button-roll-random {
  align-items: center;
}
.invite-view__block-14 {
  align-items: center;
}
.invite-view__button-2 {
  align-items: center;
}
.invite-view__block-17 {
  align-items: center;
}
.invite-view__button-3 {
  align-items: center;
}
.invite-view__button-4 {
  align-items: center;
}
.invite-view__block-20 {
  align-items: center;
}
.invite-view__block-22 {
  align-items: center;
}
.invite-view__text-never-expires {
  align-items: center;
}
.invite-view__block-24 {
  align-items: center;
}
.invite-view__block-27 {
  align-items: center;
}
.invite-view__button-5 {
  align-items: center;
}
.invite-view__block-30 {
  align-items: center;
}
.invite-view__block-4 {
  align-items: flex-start;
}
.invite-view__block-5 {
  align-items: flex-start;
}
.invite-view__block-7 {
  justify-content: space-between;
}
.invite-view__block-14 {
  justify-content: space-between;
}
.invite-view__block-22 {
  justify-content: space-between;
}
.invite-view__block-27 {
  justify-content: space-between;
}
.invite-view__block-2 {
  justify-content: center;
}
.invite-view__tab {
  justify-content: center;
}
.invite-view__tab-2 {
  justify-content: center;
}
.invite-view__button-roll-random {
  justify-content: center;
}
.invite-view__button-2 {
  justify-content: center;
}
.invite-view__tablist {
  gap: var(--spacing);
}
.invite-view__button-4 {
  gap: var(--spacing);
}
.invite-view__button-5 {
  gap: var(--spacing);
}
.invite-view__text-4 {
  gap: calc(var(--spacing) * 1.5);
}
.invite-view__group-lobby-expiry {
  gap: calc(var(--spacing) * 1.5);
}
.invite-view__block-13 {
  gap: calc(var(--spacing) * 1.5);
}
.invite-view__button-2 {
  gap: calc(var(--spacing) * 1.5);
}
.invite-view__block-17 {
  gap: calc(var(--spacing) * 1.5);
}
.invite-view__button-3 {
  gap: calc(var(--spacing) * 1.5);
}
.invite-view__block-20 {
  gap: calc(var(--spacing) * 1.5);
}
.invite-view__text-never-expires {
  gap: calc(var(--spacing) * 1.5);
}
.invite-view__block-30 {
  gap: calc(var(--spacing) * 1.5);
}
.invite-view__tab {
  gap: calc(var(--spacing) * 2);
}
.invite-view__tab-2 {
  gap: calc(var(--spacing) * 2);
}
.invite-view__block-27 {
  gap: calc(var(--spacing) * 2);
}
.invite-view__block-9 {
  gap: calc(var(--spacing) * 2.5);
}
.invite-view__block-11 {
  gap: calc(var(--spacing) * 2.5);
}
.invite-view__block-15 {
  gap: calc(var(--spacing) * 2.5);
}
.invite-view__header {
  gap: calc(var(--spacing) * 3);
}
.invite-view__block-7 {
  gap: calc(var(--spacing) * 3);
}
.invite-view__block-14 {
  gap: calc(var(--spacing) * 3);
}
.invite-view__block-22 {
  gap: calc(var(--spacing) * 3);
}
.invite-view__block-24 {
  gap: calc(var(--spacing) * 4);
}
:where(.invite-view__block-19>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.invite-view__block-26>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.invite-view__block-29>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.invite-view__section-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.invite-view__section>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.invite-view__main>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.invite-view__section-3>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.invite-view__block-6>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
:where(.invite-view__block-21>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
.invite-view__title {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.invite-view__text {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.invite-view__text-15 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.invite-view__block {
  overflow-y: auto;
}
.invite-view__section {
  border-radius: var(--radius-2xl);
}
.invite-view__section-2 {
  border-radius: var(--radius-2xl);
}
.invite-view__section-3 {
  border-radius: var(--radius-2xl);
}
.invite-view__text-5 {
  border-radius: 3.40282e38px;
}
.invite-view__text-14 {
  border-radius: 3.40282e38px;
}
.invite-view__tab {
  border-radius: var(--radius-lg);
}
.invite-view__tab-2 {
  border-radius: var(--radius-lg);
}
.invite-view__button-2 {
  border-radius: var(--radius-lg);
}
.invite-view__button {
  border-radius: var(--radius-md);
}
.invite-view__field-text {
  border-radius: var(--radius-md);
}
.invite-view__button-roll-random {
  border-radius: var(--radius-md);
}
.invite-view__button-3 {
  border-radius: var(--radius-md);
}
.invite-view__button-4 {
  border-radius: var(--radius-md);
}
.invite-view__button-5 {
  border-radius: var(--radius-md);
}
.invite-view__block-2 {
  border-radius: var(--radius-xl);
}
.invite-view__tablist {
  border-radius: var(--radius-xl);
}
.invite-view__block-18 {
  border-radius: var(--radius-xl);
}
.invite-view__block-19 {
  border-radius: var(--radius-xl);
}
.invite-view__block-28 {
  border-radius: var(--radius-xl);
}
.invite-view__block-29 {
  border-radius: var(--radius-xl);
}
.invite-view__block-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__tablist {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__tab--selected {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__tab--muted {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__tab--selected-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__tab--muted-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__section {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__field-text {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__button-roll-random {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__section-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__button-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__button-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__block-18 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__block-19 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__section-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__button-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__block-28 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__block-29 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.invite-view__block-11 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.invite-view__block-14 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.invite-view__block-26 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.invite-view__block-7 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.invite-view__block-22 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.invite-view__section-2 {
  border-color: #00bb7f33;
}
.invite-view__button-3 {
  border-color: #00bb7f4d;
}
.invite-view__tab--muted {
  border-color: #0000;
}
.invite-view__tab--muted-2 {
  border-color: #0000;
}
.invite-view__button--selected {
  border-color: var(--ui-zinc-600);
}
.invite-view__tab--selected {
  border-color: var(--ui-zinc-700);
}
.invite-view__tab--selected-2 {
  border-color: var(--ui-zinc-700);
}
.invite-view__button--muted {
  border-color: var(--ui-zinc-800);
}
.invite-view__field-text {
  border-color: var(--ui-zinc-800);
}
.invite-view__button-roll-random {
  border-color: var(--ui-zinc-800);
}
.invite-view__button-4 {
  border-color: var(--ui-zinc-800);
}
.invite-view__button-5 {
  border-color: var(--ui-zinc-800);
}
.invite-view__block-7 {
  border-color: var(--app-border-faint);
}
.invite-view__block-11 {
  border-color: var(--app-border-faint);
}
.invite-view__block-14 {
  border-color: var(--app-border-faint);
}
.invite-view__block-22 {
  border-color: var(--app-border-faint);
}
.invite-view__block-26 {
  border-color: var(--app-border-faint);
}
.invite-view__block-2 {
  border-color: var(--app-border-quiet);
}
.invite-view__tablist {
  border-color: var(--app-border-quiet);
}
.invite-view__section {
  border-color: var(--app-border-quiet);
}
.invite-view__block-18 {
  border-color: var(--app-border-quiet);
}
.invite-view__block-19 {
  border-color: var(--app-border-quiet);
}
.invite-view__section-3 {
  border-color: var(--app-border-quiet);
}
.invite-view__block-28 {
  border-color: var(--app-border-quiet);
}
.invite-view__block-29 {
  border-color: var(--app-border-quiet);
}
.invite-view__text--warning {
  background-color: var(--color-amber-400);
}
.invite-view__block {
  background-color: var(--ui-black);
}
.invite-view__block-18 {
  background-color: var(--ui-black);
}
.invite-view__block-28 {
  background-color: var(--ui-black);
}
.invite-view__text--success {
  background-color: var(--color-emerald-400);
}
.invite-view__text-14 {
  background-color: var(--color-emerald-400);
}
.invite-view__button-3 {
  background-color: #004e3b4d;
}
.invite-view__section-2 {
  background-color: #002c221a;
}
.invite-view__text--danger-2 {
  background-color: var(--color-red-400);
}
.invite-view__button-2 {
  background-color: var(--color-white);
}
.invite-view__tab--selected {
  background-color: var(--ui-zinc-800);
}
.invite-view__tab--selected-2 {
  background-color: var(--ui-zinc-800);
}
.invite-view__button--selected {
  background-color: var(--ui-zinc-800);
}
.invite-view__button--muted {
  background-color: var(--app-surface-tint-soft);
}
.invite-view__field-text {
  background-color: var(--app-surface-tint);
}
.invite-view__button-roll-random {
  background-color: var(--app-surface-tint);
}
.invite-view__button-4 {
  background-color: var(--app-surface-tint);
}
.invite-view__button-5 {
  background-color: var(--app-surface-tint);
}
.invite-view__block-2 {
  background-color: var(--app-surface-inset);
}
.invite-view__section {
  background-color: var(--app-surface-inset);
}
.invite-view__section-3 {
  background-color: var(--app-surface-inset);
}
.invite-view__tablist {
  background-color: var(--app-surface-inset-strong);
}
.invite-view__block-19 {
  background-color: var(--app-surface-inset-strong);
}
.invite-view__block-29 {
  background-color: var(--app-surface-inset-strong);
}
.invite-view__tablist {
  padding: var(--spacing);
}
.invite-view__block-18 {
  padding: calc(var(--spacing) * 3);
}
.invite-view__block-28 {
  padding: calc(var(--spacing) * 3);
}
.invite-view__section {
  padding: calc(var(--spacing) * 4);
}
.invite-view__section-2 {
  padding: calc(var(--spacing) * 4);
}
.invite-view__block-19 {
  padding: calc(var(--spacing) * 4);
}
.invite-view__section-3 {
  padding: calc(var(--spacing) * 4);
}
.invite-view__block-29 {
  padding: calc(var(--spacing) * 4);
}
.invite-view__button {
  padding-inline: calc(var(--spacing) * 2.5);
}
.invite-view__field-text {
  padding-inline: calc(var(--spacing) * 2.5);
}
.invite-view__button-4 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.invite-view__tab {
  padding-inline: calc(var(--spacing) * 3);
}
.invite-view__tab-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.invite-view__button-3 {
  padding-inline: calc(var(--spacing) * 3);
}
.invite-view__button-5 {
  padding-inline: calc(var(--spacing) * 3);
}
.invite-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.invite-view__button-2 {
  padding-inline: calc(var(--spacing) * 4);
}
.invite-view__button {
  padding-block: var(--spacing);
}
.invite-view__tab {
  padding-block: calc(var(--spacing) * 2);
}
.invite-view__tab-2 {
  padding-block: calc(var(--spacing) * 2);
}
.invite-view__main {
  padding-block: calc(var(--spacing) * 6);
}
.invite-view__block-11 {
  padding-top: calc(var(--spacing) * 3);
}
.invite-view__block-14 {
  padding-top: calc(var(--spacing) * 3);
}
.invite-view__block-26 {
  padding-top: calc(var(--spacing) * 4);
}
.invite-view__block-31 {
  padding-top: calc(var(--spacing) * 8);
}
.invite-view__block-7 {
  padding-bottom: calc(var(--spacing) * 3);
}
.invite-view__block-22 {
  padding-bottom: calc(var(--spacing) * 3);
}
.invite-view__block-31 {
  padding-bottom: calc(var(--spacing) * 4);
}
.invite-view__header {
  padding-bottom: calc(var(--spacing) * 6);
}
.invite-view__block {
  padding-bottom: calc(var(--spacing) * 16);
}
.invite-view__block-31 {
  text-align: center;
}
.invite-view__block-4 {
  text-align: left;
}
.invite-view__block-5 {
  text-align: left;
}
.invite-view__text-2 {
  font-family: var(--font-mono);
}
.invite-view__text-3 {
  font-family: var(--font-mono);
}
.invite-view__text-ephemeral-peer {
  font-family: var(--font-mono);
}
.invite-view__text-4 {
  font-family: var(--font-mono);
}
.invite-view__field-text {
  font-family: var(--font-mono);
}
.invite-view__text-ready-to {
  font-family: var(--font-mono);
}
.invite-view__block-18 {
  font-family: var(--font-mono);
}
.invite-view__text-match-lobby {
  font-family: var(--font-mono);
}
.invite-view__text-lifetime-identity {
  font-family: var(--font-mono);
}
.invite-view__text-never-expires {
  font-family: var(--font-mono);
}
.invite-view__text-16 {
  font-family: var(--font-mono);
}
.invite-view__block-28 {
  font-family: var(--font-mono);
}
.invite-view__text-20 {
  font-family: var(--font-mono);
}
.invite-view__text-15 {
  font-size: var(--text-base);
  line-height: var(--leading,var(--text-base--line-height));
}
.invite-view__title {
  font-size: var(--text-lg);
  line-height: var(--leading,var(--text-lg--line-height));
}
.invite-view__subtitle-disposable-match {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.invite-view__subtitle-permanent-public {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.invite-view__text {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__tab {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__tab-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__text-lobby-duration {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__text-decoy-gamertag {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__field-text {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__text-11 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__button-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__text-12 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__block-19 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__text-16 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__text-17 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__text-18 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__block-29 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.invite-view__text-2 {
  font-size: 9px;
}
.invite-view__text-3 {
  font-size: 9px;
}
.invite-view__text-ephemeral-peer {
  font-size: 10px;
}
.invite-view__text-4 {
  font-size: 10px;
}
.invite-view__text-ready-to {
  font-size: 10px;
}
.invite-view__text-lifetime-identity {
  font-size: 10px;
}
.invite-view__text-never-expires {
  font-size: 10px;
}
.invite-view__text-20 {
  font-size: 10px;
}
.invite-view__text-9 {
  font-size: 11px;
}
.invite-view__text-10 {
  font-size: 11px;
}
.invite-view__button-3 {
  font-size: 11px;
}
.invite-view__button-4 {
  font-size: 11px;
}
.invite-view__block-18 {
  font-size: 11px;
}
.invite-view__button-5 {
  font-size: 11px;
}
.invite-view__block-28 {
  font-size: 11px;
}
.invite-view__text {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.invite-view__block-18 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.invite-view__text-13 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.invite-view__block-28 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.invite-view__text-19 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.invite-view__text-ephemeral-peer {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.invite-view__text-lobby-duration {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.invite-view__button {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.invite-view__text-decoy-gamertag {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.invite-view__text-ready-to {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.invite-view__button-3 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.invite-view__button-4 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.invite-view__block-20 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.invite-view__text-lifetime-identity {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.invite-view__text-18 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.invite-view__button-5 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.invite-view__block-30 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.invite-view__title {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.invite-view__tab {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.invite-view__tab-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.invite-view__subtitle-disposable-match {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.invite-view__button-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.invite-view__subtitle-permanent-public {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.invite-view__text-15 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.invite-view__text-ephemeral-peer {
  --tracking: .16em;
  letter-spacing: .16em;
}
.invite-view__text-ready-to {
  --tracking: .16em;
  letter-spacing: .16em;
}
.invite-view__text-lifetime-identity {
  --tracking: .16em;
  letter-spacing: .16em;
}
.invite-view__title {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.invite-view__subtitle-disposable-match {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.invite-view__subtitle-permanent-public {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.invite-view__text-2 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.invite-view__text-3 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.invite-view__text-20 {
  --tracking: var(--tracking-widest);
  letter-spacing: var(--tracking-widest);
}
.invite-view__block-18 {
  word-break: break-all;
}
.invite-view__block-28 {
  word-break: break-all;
}
.invite-view__text-7 {
  color: var(--color-amber-400);
}
.invite-view__text-8 {
  color: var(--color-amber-400);
}
.invite-view__button-2 {
  color: var(--ui-black);
}
.invite-view__button-3 {
  color: var(--color-emerald-200);
}
.invite-view__block-18 {
  color: var(--color-emerald-200);
}
.invite-view__block-2 {
  color: var(--color-emerald-400);
}
.invite-view__gamepad2--success {
  color: var(--color-emerald-400);
}
.invite-view__text-2 {
  color: var(--color-emerald-400);
}
.invite-view__shield-check--success {
  color: var(--color-emerald-400);
}
.invite-view__text-ephemeral-peer {
  color: var(--color-emerald-400);
}
.invite-view__text-6 {
  color: var(--color-emerald-400);
}
.invite-view__text-ready-to {
  color: var(--color-emerald-400);
}
.invite-view__check {
  color: var(--color-emerald-400);
}
.invite-view__gamepad2-2 {
  color: var(--color-emerald-400);
}
.invite-view__check-2 {
  color: var(--color-emerald-400);
}
.invite-view__gamepad2-3 {
  color: var(--color-emerald-400);
}
.invite-view__text-never-expires {
  color: var(--color-emerald-400);
}
.invite-view__check-3 {
  color: var(--color-emerald-400);
}
.invite-view__shield-check-2 {
  color: var(--color-emerald-400);
}
.invite-view__text--danger {
  color: var(--color-red-400);
}
.invite-view__title {
  color: var(--color-white);
}
.invite-view__tab--selected {
  color: var(--color-white);
}
.invite-view__tab--selected-2 {
  color: var(--color-white);
}
.invite-view__subtitle-disposable-match {
  color: var(--color-white);
}
.invite-view__button--selected {
  color: var(--color-white);
}
.invite-view__subtitle-permanent-public {
  color: var(--color-white);
}
.invite-view__text-15 {
  color: var(--color-white);
}
.invite-view__block {
  color: var(--ui-zinc-100);
}
.invite-view__text-lobby-duration {
  color: var(--ui-zinc-200);
}
.invite-view__text-decoy-gamertag {
  color: var(--ui-zinc-200);
}
.invite-view__field-text {
  color: var(--ui-zinc-200);
}
.invite-view__block-20 {
  color: var(--ui-zinc-200);
}
.invite-view__block-30 {
  color: var(--ui-zinc-200);
}
.invite-view__button-4 {
  color: var(--ui-zinc-300);
}
.invite-view__text-match-lobby {
  color: var(--ui-zinc-300);
}
.invite-view__text-18 {
  color: var(--ui-zinc-300);
}
.invite-view__button-5 {
  color: var(--ui-zinc-300);
}
.invite-view__block-28 {
  color: var(--ui-zinc-300);
}
.invite-view__tab--muted {
  color: var(--ui-zinc-400);
}
.invite-view__tab--muted-2 {
  color: var(--ui-zinc-400);
}
.invite-view__text--muted {
  color: var(--ui-zinc-400);
}
.invite-view__button--muted {
  color: var(--ui-zinc-400);
}
.invite-view__button-roll-random {
  color: var(--ui-zinc-400);
}
.invite-view__text-12 {
  color: var(--ui-zinc-400);
}
.invite-view__block-19 {
  color: var(--ui-zinc-400);
}
.invite-view__text-13 {
  color: var(--ui-zinc-400);
}
.invite-view__text-lifetime-identity {
  color: var(--ui-zinc-400);
}
.invite-view__text-17 {
  color: var(--ui-zinc-400);
}
.invite-view__block-29 {
  color: var(--ui-zinc-400);
}
.invite-view__text-19 {
  color: var(--ui-zinc-400);
}
.invite-view__text {
  color: var(--ui-zinc-500);
}
.invite-view__gamepad2--muted {
  color: var(--ui-zinc-500);
}
.invite-view__shield-check--muted {
  color: var(--ui-zinc-500);
}
.invite-view__text-3 {
  color: var(--ui-zinc-500);
}
.invite-view__text-9 {
  color: var(--ui-zinc-500);
}
.invite-view__text-10 {
  color: var(--ui-zinc-500);
}
.invite-view__text-11 {
  color: var(--ui-zinc-500);
}
.invite-view__text-16 {
  color: var(--ui-zinc-500);
}
.invite-view__text-20 {
  color: var(--ui-zinc-600);
}
.invite-view__text-2 {
  text-transform: uppercase;
}
.invite-view__text-3 {
  text-transform: uppercase;
}
.invite-view__text-ephemeral-peer {
  text-transform: uppercase;
}
.invite-view__text-ready-to {
  text-transform: uppercase;
}
.invite-view__text-lifetime-identity {
  text-transform: uppercase;
}
.invite-view__text-20 {
  text-transform: uppercase;
}
.invite-view__text-4 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.invite-view__text-20 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.invite-view__tab--selected {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.invite-view__tab--selected-2 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.invite-view__tab {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.invite-view__tab-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.invite-view__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.invite-view__button-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.invite-view__field-text {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.invite-view__button-roll-random {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.invite-view__button-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.invite-view__button-4 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.invite-view__button-5 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.invite-view__tab {
  --duration: .2s;
  transition-duration: .2s;
}
.invite-view__tab-2 {
  --duration: .2s;
  transition-duration: .2s;
}
.invite-view__block-18 {
  -webkit-user-select: all;
  user-select: all;
}
.invite-view__block-28 {
  -webkit-user-select: all;
  user-select: all;
}
.invite-view__field-text::placeholder {
  color: var(--ui-zinc-600);
}
.invite-view__field-text:focus {
  border-color: var(--ui-zinc-600);
}
.invite-view__field-text:focus {
  background-color: var(--ui-zinc-900);
}
.invite-view__field-text:focus {
  --outline-style: none;
  outline-style: none;
}
.invite-view__button:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.invite-view__button-roll-random:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.invite-view__button-2:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.invite-view__button-3:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.invite-view__button-4:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.invite-view__button-5:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.invite-view__tab:active {
  scale: .98;
}
.invite-view__tab-2:active {
  scale: .98;
}
.invite-view__button-2:disabled {
  cursor: not-allowed;
}
.invite-view__button:disabled {
  opacity: .5;
}
.invite-view__button-2:disabled {
  opacity: .5;
}
[data-theme="light"] .invite-view__text-7 {
  color: var(--app-warning);
}
[data-theme="light"] .invite-view__text-8 {
  color: var(--app-warning);
}
[data-theme="light"] .invite-view__button-3 {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__block-18 {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__block-2 {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__gamepad2--success {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__text-2 {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__shield-check--success {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__text-ephemeral-peer {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__text-6 {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__text-ready-to {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__check {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__gamepad2-2 {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__check-2 {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__gamepad2-3 {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__text-never-expires {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__check-3 {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__shield-check-2 {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__text--danger {
  color: var(--app-danger);
}
[data-theme="light"] .invite-view__button-4 {
  color: var(--app-text-soft);
}
[data-theme="light"] .invite-view__text-match-lobby {
  color: var(--app-text-soft);
}
[data-theme="light"] .invite-view__text-18 {
  color: var(--app-text-soft);
}
[data-theme="light"] .invite-view__button-5 {
  color: var(--app-text-soft);
}
[data-theme="light"] .invite-view__block-28 {
  color: var(--app-text-soft);
}
[data-theme="light"] .invite-view__tab--muted {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__tab--muted-2 {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__text--muted {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__button--muted {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__button-roll-random {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__text-12 {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__block-19 {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__text-13 {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__text-lifetime-identity {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__text-17 {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__block-29 {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__text-19 {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__text {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__gamepad2--muted {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__shield-check--muted {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__text-3 {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__text-9 {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__text-10 {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__text-11 {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__text-16 {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__text-20 {
  color: var(--app-text-soft);
}
[data-theme="light"] .invite-view__tab--muted:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .invite-view__tab--muted-2:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .invite-view__button--muted:hover {
  color: var(--app-text) !important;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.invite-view__section-2 {
  border-color: color-mix(in oklab,var(--color-emerald-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.invite-view__button-3 {
  border-color: color-mix(in oklab,var(--color-emerald-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.invite-view__tab--selected {
  border-color: color-mix(in oklab,var(--ui-zinc-700) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.invite-view__tab--selected-2 {
  border-color: color-mix(in oklab,var(--ui-zinc-700) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.invite-view__block-18 {
  background-color: color-mix(in oklab,var(--ui-black) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.invite-view__block-28 {
  background-color: color-mix(in oklab,var(--ui-black) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.invite-view__button-3 {
  background-color: color-mix(in oklab,var(--color-emerald-900) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.invite-view__section-2 {
  background-color: color-mix(in oklab,var(--color-emerald-950) 10%,transparent);
}
}

}
</style>
