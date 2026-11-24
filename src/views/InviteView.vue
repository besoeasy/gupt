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
import QrCode from "@/components/QrCode.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { api } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { shortId } from "@/lib/crypto";
import { waitForRelayAck } from "@/lib/engine";
import { permanentInviteUrl } from "@/lib/qr/payload";
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

// The same deep link the app already accepts from a URL. A system camera opens
// Gupt and fills the key in; no new protocol and no extra fields.
const permanentQr = computed(() => {
  if (!identity.pubkeyHex || typeof window === "undefined") return "";
  try {
    return permanentInviteUrl(window.location.origin, identity.pubkeyHex);
  } catch {
    return "";
  }
});

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
  <div class="invite-view">
    <main class="invite-view__main">
      <!-- Page Header -->
      <header class="invite-view__header">
        <div
          class="invite-view__header-icon"
        >
          <Share2 class="invite-view__share2" :stroke-width="2" />
        </div>
        <div class="invite-view__header-text">
          <p class="invite-view__eyebrow">Share</p>
          <h1 class="invite-view__title">Invite &amp; Connect</h1>
          <p class="invite-view__header-lede">
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
            class="invite-view__tab-icon"
            :class="activeTab === 'temp' ? 'invite-view__tab-icon--success' : 'invite-view__tab-icon--muted'"
            :stroke-width="2"
          />
          <div class="invite-view__tab-text">
            <span>Temporary Lobby</span>
            <span
              class="invite-view__tab-title"
            >
              &middot; Expiring
            </span>
          </div>
        </button>

        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'permanent'"
          class="invite-view__tab-permanent"
          :class="
            activeTab === 'permanent'
              ? 'invite-view__tab--selected-2'
              : 'invite-view__tab--muted-2'
          "
          @click="switchTab('permanent')"
        >
          <ShieldCheck
            class="invite-view__permanent-tab-icon"
            :class="activeTab === 'permanent' ? 'invite-view__permanent-tab-icon--success' : 'invite-view__permanent-tab-icon--muted'"
            :stroke-width="2"
          />
          <div class="invite-view__tab-text-permanent">
            <span>Permanent ID</span>
            <span
              class="invite-view__tab-title-permanent"
            >
              &middot; Lifetime
            </span>
          </div>
        </button>
      </div>

      <!-- TAB 1: TEMPORARY (MATCH LOBBY) -->
      <div v-if="activeTab === 'temp'" class="invite-view__temp-panel">
        <!-- Configuration Card -->
        <section class="invite-view__section">
          <div class="invite-view__temp-head">
            <div class="invite-view__temp-status">
              <span class="invite-view__text-ephemeral-peer">
                Ephemeral Peer Discovery
              </span>
              <h2 class="invite-view__subtitle-disposable-match">
                Disposable Match Lobby
              </h2>
            </div>
            <span
              v-if="tempInvite"
              class="invite-view__temp-expiry"
              :class="tempExpiry === 'expired' ? 'invite-view__temp-expiry--danger' : 'invite-view__temp-expiry--muted'"
            >
              <span
                class="invite-view__temp-status-dot"
                :class="
                  tempExpiry === 'expired'
                    ? 'invite-view__temp-status-dot--danger'
                    : tempStatus === 'live'
                      ? 'invite-view__temp-status-dot--success'
                      : 'invite-view__temp-status-dot--warning'
                "
              />
              {{ tempExpiry === "expired" ? "Expired" : `${tempExpiry} left` }}
              <span v-if="tempStatus === 'live'" class="invite-view__temp-state-live">&middot; live</span>
              <span v-else-if="tempStatus === 'publishing'" class="invite-view__temp-state-publishing">&middot; publishing…</span>
              <span v-else-if="tempStatus === 'queued'" class="invite-view__temp-state-queued">&middot; queued</span>
            </span>
          </div>

          <!-- Duration selection -->
          <div class="invite-view__temp-duration">
            <div class="invite-view__temp-duration-text">
              <p class="invite-view__text-lobby-duration">Lobby duration</p>
              <p class="invite-view__temp-duration-hint">Auto-dropped by relays upon expiration.</p>
            </div>
            <div class="invite-view__group-lobby-expiry" role="group" aria-label="Lobby expiry duration">
              <button
                v-for="duration in TEMP_INVITE_DURATIONS"
                :key="duration.id"
                type="button"
                class="invite-view__expiry-option"
                :class="
                  tempDuration === duration.id
                    ? 'invite-view__expiry-option--selected'
                    : 'invite-view__expiry-option--muted'
                "
                :disabled="creating"
                @click="tempDuration = duration.id"
              >
                {{ duration.label }}
              </button>
            </div>
          </div>

          <!-- Gamertag randomizer -->
          <div class="invite-view__temp-decoy">
            <div class="invite-view__temp-decoy-text">
              <p class="invite-view__text-decoy-gamertag">Decoy gamertag</p>
              <p class="invite-view__temp-decoy-hint">Plausible cover pseudonym advertised in ticket.</p>
            </div>
            <div class="invite-view__temp-decoy-input">
              <input
                v-model="gamertag"
                type="text"
                maxlength="32"
                placeholder="e.g. NeonKnight_42"
                class="invite-view__field-text"
              />
              <button
                type="button"
                class="invite-view__expiry-option-roll-random"
                title="Roll random gamertag"
                @click="generateRandomGamertag"
              >
                <Dices class="invite-view__dices" :stroke-width="2" />
              </button>
            </div>
          </div>

          <!-- Publish button -->
          <div class="invite-view__temp-create">
            <p class="invite-view__temp-create-hint">Publishes under an ephemeral key.</p>
            <button
              type="button"
              class="invite-view__temp-create-button"
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
          <div class="invite-view__temp-result-head">
            <div class="invite-view__temp-result-title">
              <span class="invite-view__text-ready-to">
                Ready to Share
              </span>
              <p class="invite-view__temp-result-hint">Paste into New Chat to connect immediately.</p>
            </div>
            <div class="invite-view__temp-result-actions">
              <button
                type="button"
                class="invite-view__copy-game"
                :title="copied === 'game' ? 'Game invite copied!' : 'Copy full game invite message'"
                @click="copyValue(gameInviteMessage, 'game')"
              >
                <Check v-if="copied === 'game'" class="invite-view__check" :stroke-width="2.5" />
                <Gamepad2 v-else class="invite-view__copy-game-icon" :stroke-width="2" />
                <span>{{ copied === "game" ? "Copied invite!" : "Copy game invite" }}</span>
              </button>

              <button
                type="button"
                class="invite-view__copy-code"
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
            class="invite-view__temp-qr-card"
          >
            {{ tempInvite.code }}
          </div>

          <div class="invite-view__qr">
            <QrCode
              :text="tempInvite.code"
              :size="210"
              label="QR code for this match lobby"
            />
            <div class="invite-view__qr-copy">
              <p class="invite-view__qr-title">Scan to join this lobby</p>
              <p class="invite-view__qr-text">
                On the other phone, open New Chat and tap the QR button. The lobby code
                is filled in and opened — no typing.
              </p>
            </div>
          </div>
        </section>

        <!-- Explainer Card -->
        <div class="invite-view__temp-footnote">
          <div class="invite-view__temp-footnote-icon">
            <Gamepad2 class="invite-view__footnote-icon" :stroke-width="2" />
            <span>Why does Gupt look like a game lobby here?</span>
          </div>
          <p class="invite-view__temp-footnote-text">
            To protect your privacy against network surveillance, eavesdropping, and shoulder
            surfing, peer invites are camouflaged as casual multiplayer match lobbies
            (<span class="invite-view__text-match-lobby">match:lobby:...</span>) with decoy
            gamertags. Anyone seeing or intercepting this code will dismiss it as harmless
            gaming noise rather than a private messenger connection.
          </p>
        </div>
      </div>

      <!-- TAB 2: PERMANENT (PUBLIC ID) -->
      <div v-else-if="activeTab === 'permanent'" class="invite-view__permanent-panel">
        <!-- Identity Card -->
        <section class="invite-view__section-3">
          <div class="invite-view__permanent-head">
            <div class="invite-view__permanent-head-text">
              <span class="invite-view__text-lifetime-identity">
                Lifetime Identity
              </span>
              <h2 class="invite-view__subtitle-permanent-public">
                Permanent Public Address
              </h2>
            </div>
            <span class="invite-view__text-never-expires">
              <span class="invite-view__permanent-dot" />
              Never expires
            </span>
          </div>

          <!-- Profile info -->
          <div class="invite-view__permanent-body">
            <RoboAvatar :pubkey="identity.pubkeyHex" size="xl" rounded="2xl" />
            <div class="invite-view__permanent-identity">
              <p class="invite-view__permanent-name">
                {{ localProfile?.name || identity.profileName || "Gupt User" }}
              </p>
              <p class="invite-view__permanent-handle">
                {{ shortId(identity.pubkeyHex, 10, 8) }}
              </p>
              <p class="invite-view__permanent-handle-hint">Direct end-to-end encrypted inbox</p>
            </div>
          </div>

          <!-- Public Key Container -->
          <div class="invite-view__permanent-id-row">
            <div class="invite-view__permanent-id-text">
              <p class="invite-view__permanent-id-label">Public profile ID (64-char hex)</p>
              <button
                type="button"
                class="invite-view__copy-id"
                :title="copied === 'id' ? 'Profile ID copied!' : 'Copy profile ID'"
                @click="copyValue(identity.pubkeyHex, 'id')"
              >
                <Check v-if="copied === 'id'" class="invite-view__check-3" :stroke-width="2.5" />
                <Copy v-else class="invite-view__copy-2" :stroke-width="2" />
                <span>{{ copied === "id" ? "Copied ID" : "Copy ID" }}</span>
              </button>
            </div>
            <div
              class="invite-view__permanent-field"
            >
              {{ identity.pubkeyHex }}
            </div>
          </div>

          <div v-if="permanentQr" class="invite-view__qr">
            <QrCode
              :text="permanentQr"
              :size="220"
              label="QR code with your permanent Gupt invite"
            />
            <div class="invite-view__qr-copy">
              <p class="invite-view__qr-title">Scan to chat with me</p>
              <p class="invite-view__qr-text">
                A phone camera opens Gupt with this key ready. In Gupt, tap the QR button
                in New Chat instead.
              </p>
              <button
                type="button"
                class="invite-view__qr-link"
                @click="copyValue(permanentQr, 'link')"
              >
                <Check v-if="copied === 'link'" :stroke-width="2.5" aria-hidden="true" />
                <Copy v-else :stroke-width="2" aria-hidden="true" />
                <span>{{ copied === "link" ? "Invite link copied" : "Copy invite link" }}</span>
              </button>
            </div>
          </div>
        </section>

        <!-- Permanent Explainer Card -->
        <div class="invite-view__permanent-footnote">
          <div class="invite-view__permanent-footnote-icon">
            <ShieldCheck class="invite-view__permanent-footnote-icon" :stroke-width="2" />
            <span>How permanent invites work</span>
          </div>
          <p class="invite-view__permanent-footnote-text">
            This public key is your permanent cryptographic address. You can share it in bios, on websites, or with trusted contacts. Unlike temporary match lobbies, it never expires and requires no relays to store extra records. Anyone entering this key will send messages encrypted directly to your inbox. Your private keys never leave this device.
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div class="invite-view__privacy">
        <p class="invite-view__privacy-text">
          Encrypted Invites &middot; Peer Discovery
        </p>
      </div>
    </main>
  </div>
</template>

<style scoped>
@media (hover: hover) {
  .invite-view__copy-game:hover {
    border-color: color-mix(in oklab,var(--app-success) 50%,transparent);
    background-color: color-mix(in oklab, var(--app-success) 20%, transparent);
  }
  .invite-view__expiry-option--muted:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }
  .invite-view__expiry-option-roll-random:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .invite-view__copy-code:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .invite-view__copy-id:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .invite-view__temp-create-button:hover {
    background-color: var(--app-text);
  }
  .invite-view__tab--muted:hover {
    background-color: var(--app-surface-tint-soft);
    color: var(--app-text);
  }
  .invite-view__tab--muted-2:hover {
    background-color: var(--app-surface-tint-soft);
    color: var(--app-text);
  }
}
@media (min-width: 40rem) {
  .invite-view__tab-title {
    display: inline;
  }
  .invite-view__tab-title-permanent {
    display: inline;
  }
  .invite-view__copy-game {
    height: 1.75rem;
    min-height: 0;
  }
  .invite-view__copy-code {
    height: 1.75rem;
    min-height: 0;
  }
  .invite-view__copy-id {
    height: 1.75rem;
    min-height: 0;
  }
  .invite-view__expiry-option-roll-random {
    height: 2rem;
    min-height: 0;
    width: 2rem;
    min-width: 0;
  }
  .invite-view__expiry-option {
    min-height: 0;
  }
  .invite-view__tab-text {
    flex-direction: row;
    align-items: center;
    gap: 0.375rem;
  }
  .invite-view__tab-text-permanent {
    flex-direction: row;
    align-items: center;
    gap: 0.375rem;
  }
  .invite-view__temp-duration {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .invite-view__temp-decoy {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .invite-view__temp-result-head {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .invite-view__section {
    padding: 1.25rem;
  }
  .invite-view__section-2 {
    padding: 1.25rem;
  }
  .invite-view__section-3 {
    padding: 1.25rem;
  }
  .invite-view__main {
    padding-inline: 1.5rem;
  }
}
@media (min-width: 64rem) {
  .invite-view__main {
    padding-inline: 2rem;
  }
}
.invite-view__main {
  margin-inline: auto;
  width: 100%;
  max-width: 72rem;
  padding-inline: 1rem;
  padding-block: 1.5rem;
}
.invite-view__header-lede {
  text-overflow: ellipsis;
  overflow: hidden;
  margin-top: 4px;
  font-size: var(--app-text-meta);
  line-height: 1.55;
  color: var(--app-muted);
  white-space: normal;
}
.invite-view__subtitle-disposable-match {
  margin-top: 0.125rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: var(--app-text);
}
.invite-view__temp-result-hint {
  line-height: 1.5;
  margin-top: 3px;
  font-size: var(--app-text-meta);
  color: var(--app-muted);
}
.invite-view__subtitle-permanent-public {
  margin-top: 0.125rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: var(--app-text);
}
.invite-view__permanent-handle {
  line-height: 1.5;
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted-2);
}
.invite-view__permanent-handle-hint {
  line-height: 1.5;
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--app-muted);
}
.invite-view__tablist {
  grid-template-columns: repeat(2,minmax(0,1fr));
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  background-color: var(--app-surface-inset-strong);
  display: flex;
  gap: var(--app-space-6);
  margin-bottom: var(--app-space-6);
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--app-border);
  border-radius: 0;
  background: transparent;
}
.invite-view__header {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  padding-bottom: var(--app-space-6);
  border-bottom: 1px solid var(--app-border);
  animation: ledger-rise 480ms var(--app-ease-emphasized) both;
}
.invite-view__header-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  background-color: var(--app-surface-inset);
  width: 44px;
  height: 44px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-success-soft);
  color: var(--app-success);
}
.invite-view__tab-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}
.invite-view__tab-text-permanent {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}
.invite-view__temp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom-style: solid;
  border-bottom-width: 1px;
  border-color: var(--app-border-faint);
  padding-bottom: 0.75rem;
}
.invite-view__temp-duration {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}
.invite-view__group-lobby-expiry {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.invite-view__temp-decoy {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  border-top-style: solid;
  border-top-width: 1px;
  border-color: var(--app-border-faint);
  padding-top: var(--app-space-4);
  border-top: 1px solid var(--app-border);
}
.invite-view__temp-decoy-input {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.375rem;
}
.invite-view__temp-create {
  justify-content: space-between;
  border-top-style: solid;
  border-top-width: 1px;
  border-color: var(--app-border-faint);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--app-space-3);
  padding-top: var(--app-space-4);
  border-top: 1px solid var(--app-border);
}
.invite-view__temp-result-head {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}
.invite-view__temp-result-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}
.invite-view__temp-footnote-icon {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 500;
  color: var(--app-text);
}
.invite-view__permanent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom-style: solid;
  border-bottom-width: 1px;
  border-color: var(--app-border-faint);
  padding-bottom: 0.75rem;
}
.invite-view__permanent-body {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--app-space-3);
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
}
.invite-view__permanent-id-text {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.invite-view__permanent-footnote-icon {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 500;
  color: var(--app-text);
}
.invite-view__tab-title {
  display: none;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.05em;
  color: var(--app-success);
  text-transform: uppercase;
}
.invite-view__tab-title-permanent {
  display: none;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.05em;
  color: var(--app-muted);
  text-transform: uppercase;
}
.invite-view__tab {
  display: inline-flex;
  min-height: 44px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: var(--app-radius-lg);
  padding-inline: 0.75rem;
  padding-block: 0.5rem;
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 600;
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .2s;
}
.invite-view__tab-permanent {
  display: inline-flex;
  min-height: 44px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: var(--app-radius-lg);
  padding-inline: 0.75rem;
  padding-block: 0.5rem;
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 600;
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .2s;
}
.invite-view__temp-expiry {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-family: var(--font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.invite-view__expiry-option-roll-random {
  display: inline-flex;
  min-height: 44px;
  flex-shrink: 0;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-tint);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  width: 40px;
  height: 40px;
  min-width: 40px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-muted);
}
.invite-view__temp-create-button {
  display: inline-flex;
  flex-shrink: 0;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  line-height: 1.5;
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  width: 100%;
  height: 40px;
  padding-inline: 16px;
  border: 1px solid var(--app-text);
  border-radius: var(--app-radius-sm);
  background: var(--app-text);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-bg);
}
.invite-view__copy-game {
  display: inline-flex;
  min-height: 44px;
  flex-shrink: 0;
  cursor: pointer;
  align-items: center;
  gap: 0.375rem;
  border-radius: var(--app-radius-md);
  border-style: solid;
  border-width: 1px;
  padding-inline: 0.75rem;
  font-size: 11px;
  font-weight: 500;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  background-color: color-mix(in oklab, var(--app-success) 8%, transparent);
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}
.invite-view__copy-code {
  display: inline-flex;
  min-height: 44px;
  flex-shrink: 0;
  cursor: pointer;
  align-items: center;
  gap: 0.25rem;
  border-radius: var(--app-radius-md);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-tint);
  padding-inline: 0.625rem;
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.invite-view__text-never-expires {
  display: inline-flex;
  align-items: center;
  font-family: var(--font-mono);
  gap: 6px;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--app-success) 24%, var(--app-border));
  border-radius: 4px;
  background: var(--app-success-soft);
  font-size: 9px;
  letter-spacing: 0.04em;
  color: var(--app-success);
}
.invite-view__copy-id {
  display: inline-flex;
  min-height: 44px;
  flex-shrink: 0;
  cursor: pointer;
  align-items: center;
  gap: 0.25rem;
  border-radius: var(--app-radius-md);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-tint);
  padding-inline: 0.75rem;
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.invite-view__temp-status-dot {
  height: 0.375rem;
  width: 0.375rem;
  border-radius: 9999px;
}
.invite-view__permanent-dot {
  border-radius: 9999px;
  background-color: var(--app-success);
  width: 5px;
  height: 5px;
}
.invite-view__check {
  height: 0.75rem;
  width: 0.75rem;
  color: var(--app-success);
}
.invite-view__copy-game-icon {
  height: 0.75rem;
  width: 0.75rem;
  color: var(--app-success);
}
.invite-view__check-2 {
  height: 0.75rem;
  width: 0.75rem;
  color: var(--app-success);
}
.invite-view__copy {
  height: 0.75rem;
  width: 0.75rem;
}
.invite-view__check-3 {
  height: 0.75rem;
  width: 0.75rem;
  color: var(--app-success);
}
.invite-view__copy-2 {
  height: 0.75rem;
  width: 0.75rem;
}
.invite-view__tab-icon {
  height: 0.875rem;
  width: 0.875rem;
  flex-shrink: 0;
}
.invite-view__permanent-tab-icon {
  height: 0.875rem;
  width: 0.875rem;
  flex-shrink: 0;
}
.invite-view__dices {
  height: 0.875rem;
  width: 0.875rem;
}
.invite-view__loader-circle {
  height: 0.875rem;
  width: 0.875rem;
  animation: spin 1s linear infinite;
}
.invite-view__sparkles {
  height: 0.875rem;
  width: 0.875rem;
}
.invite-view__share2 {
  width: 16px;
  height: 16px;
}
.invite-view__footnote-icon {
  height: 1rem;
  width: 1rem;
  color: var(--app-success);
}
.invite-view__permanent-footnote-icon {
  height: 1rem;
  width: 1rem;
  color: var(--app-success);
}
.invite-view__field-text {
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-tint);
  line-height: 1.5;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  width: 100%;
  height: 40px;
  padding-inline: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text);
}
.invite-view {
  height: 100%;
  width: 100%;
  min-width: 0;
  overflow-y: auto;
  background-color: var(--app-bg);
  padding-bottom: 4rem;
  color: var(--app-text);
}
.invite-view__expiry-option {
  min-height: 40px;
  cursor: pointer;
  border-style: solid;
  border-width: 1px;
  padding-inline: 0.625rem;
  padding-block: 0.25rem;
  line-height: 1.5;
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  padding: 5px 9px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--app-muted);
}
.invite-view__header-text {
  min-width: 0;
}
.invite-view__temp-status {
  min-width: 0;
}
.invite-view__temp-duration-text {
  min-width: 0;
}
.invite-view__temp-decoy-text {
  min-width: 0;
}
.invite-view__temp-result-title {
  min-width: 0;
}
.invite-view__permanent-head-text {
  min-width: 0;
}
.invite-view__permanent-identity {
  min-width: 0;
  flex: 1;
}
:where(.invite-view__temp-footnote>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.5rem;
}
:where(.invite-view__permanent-id-row>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.5rem;
}
:where(.invite-view__permanent-footnote>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.5rem;
}
:where(.invite-view__section-2>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.75rem;
}
:where(.invite-view__section>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 1rem;
}
:where(.invite-view__main>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 1.25rem;
}
:where(.invite-view__section-3>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 1.25rem;
}
:where(.invite-view__temp-panel>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 1.5rem;
}
:where(.invite-view__permanent-panel>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 1.5rem;
}
.invite-view__title {
  text-overflow: ellipsis;
  overflow: hidden;
  font-size: var(--app-text-display);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: var(--app-tracking-display);
  color: var(--app-text);
  white-space: normal;
}
.invite-view__permanent-name {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  line-height: 1.55;
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text);
}
.invite-view__section {
  border-radius: 22px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  background-color: var(--app-surface-inset);
  padding: 1rem;
}
.invite-view__section-2 {
  border-radius: 22px;
  border-style: solid;
  border-width: 1px;
  padding: 1rem;
  border-color: color-mix(in oklab,var(--app-success) 20%,transparent);
  background-color: color-mix(in oklab, var(--app-success) 6%, transparent);
  border-left: 2px solid var(--app-success);
}
.invite-view__section-3 {
  border-radius: 22px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  background-color: var(--app-surface-inset);
  padding: 1rem;
}
.invite-view__temp-qr-card {
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  padding: 0.75rem;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.625;
  word-break: break-all;
  color: var(--app-success);
  -webkit-user-select: all;
  user-select: all;
  background-color: color-mix(in oklab,var(--app-bg) 60%,transparent);
}
.invite-view__temp-footnote {
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  background-color: var(--app-surface-inset-strong);
  padding: 1rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--app-text-soft);
}
.invite-view__permanent-field {
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  padding: 0.75rem;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.625;
  word-break: break-all;
  color: var(--app-text-soft);
  -webkit-user-select: all;
  user-select: all;
  background-color: color-mix(in oklab,var(--app-bg) 60%,transparent);
}
.invite-view__permanent-footnote {
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  background-color: var(--app-surface-inset-strong);
  padding: 1rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--app-text-soft);
}
.invite-view__tab--selected {
  border-style: solid;
  border-width: 1px;
  background-color: var(--app-surface-raised);
  color: var(--app-text);
  box-shadow: 0 1px 2px color-mix(in oklab, var(--app-text) 8%, transparent);
  border-color: color-mix(in oklab,var(--app-border-strong) 80%,transparent);
}
.invite-view__tab--muted {
  border-style: solid;
  border-width: 1px;
  border-color: transparent;
  color: var(--app-text-soft);
}
.invite-view__tab--selected-2 {
  border-style: solid;
  border-width: 1px;
  background-color: var(--app-surface-raised);
  color: var(--app-text);
  box-shadow: 0 1px 2px color-mix(in oklab, var(--app-text) 8%, transparent);
  border-color: color-mix(in oklab,var(--app-border-strong) 80%,transparent);
}
.invite-view__tab--muted-2 {
  border-style: solid;
  border-width: 1px;
  border-color: transparent;
  color: var(--app-text-soft);
}
.invite-view__permanent-id-row {
  border-top-style: solid;
  border-top-width: 1px;
  border-color: var(--app-border-faint);
  padding-top: var(--app-space-4);
  border-top: 1px solid var(--app-border);
}
.invite-view__expiry-option--selected {
  background-color: var(--app-surface-raised);
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}
.invite-view__expiry-option--muted {
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-tint-soft);
  color: var(--app-text-soft);
}
.invite-view__temp-status-dot--warning {
  background-color: var(--app-warning);
}
.invite-view__temp-status-dot--success {
  background-color: var(--app-success);
}
.invite-view__temp-status-dot--danger {
  background-color: var(--app-danger);
}
.invite-view__privacy {
  padding-top: 2rem;
  padding-bottom: 1rem;
  padding-block: var(--app-space-6);
  border-top: 1px solid var(--app-border);
  text-align: center;
}
.invite-view__text-ephemeral-peer {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: .16em;
  color: var(--app-success);
  text-transform: uppercase;
}
.invite-view__text-ready-to {
  font-weight: 500;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-success);
}
.invite-view__text-match-lobby {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-primary);
}
.invite-view__text-lifetime-identity {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: .16em;
  color: var(--app-text-soft);
  text-transform: uppercase;
}
.invite-view__privacy-text {
  font-family: var(--font-mono);
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  margin: 0;
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  color: var(--app-muted-2);
}
.invite-view__text-lobby-duration {
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--app-text);
}
.invite-view__text-decoy-gamertag {
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--app-text);
}
.invite-view__temp-create-hint {
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--app-muted);
}
.invite-view__permanent-id-label {
  line-height: 1.5;
  font-weight: 500;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}
.invite-view__temp-duration-hint {
  font-size: 11px;
  color: var(--app-muted);
}
.invite-view__temp-decoy-hint {
  font-size: 11px;
  color: var(--app-muted);
}
.invite-view__temp-footnote-text {
  line-height: 1.625;
  color: var(--app-text-soft);
}
.invite-view__permanent-footnote-text {
  line-height: 1.625;
  color: var(--app-text-soft);
}
.invite-view__temp-state-publishing {
  color: var(--app-warning);
}
.invite-view__temp-state-queued {
  color: var(--app-warning);
}
.invite-view__tab-icon--success {
  color: var(--app-success);
}
.invite-view__permanent-tab-icon--success {
  color: var(--app-success);
}
.invite-view__temp-state-live {
  color: var(--app-success);
}
.invite-view__temp-expiry--danger {
  color: var(--app-danger);
}
.invite-view__temp-expiry--muted {
  color: var(--app-text-soft);
}
.invite-view__tab-icon--muted {
  color: var(--app-muted);
}
.invite-view__permanent-tab-icon--muted {
  color: var(--app-muted);
}
.invite-view__field-text::placeholder {
  color: var(--app-muted-2);
}
.invite-view__field-text:focus {
  background-color: var(--app-surface);
  outline-style: none;
  outline: none;
  border-color: var(--app-border-strong);
  background: var(--app-surface);
  box-shadow: var(--app-focus-ring);
}
.invite-view__expiry-option:active {
  scale: 95% 95%;
}
.invite-view__expiry-option-roll-random:active {
  scale: 95% 95%;
}
.invite-view__temp-create-button:active {
  scale: 95% 95%;
}
.invite-view__copy-game:active {
  scale: 95% 95%;
}
.invite-view__copy-code:active {
  scale: 95% 95%;
}
.invite-view__copy-id:active {
  scale: 95% 95%;
}
.invite-view__tab:active {
  scale: .98;
}
.invite-view__tab-permanent:active {
  scale: .98;
}
.invite-view__temp-create-button:disabled {
  cursor: not-allowed;
  opacity: .5;
}
.invite-view__expiry-option:disabled {
  opacity: .5;
}
[data-theme="light"] .invite-view__copy-game {
  color: var(--app-success);
}
[data-theme="light"] .invite-view__text-match-lobby {
  color: var(--app-text-soft);
}
[data-theme="light"] .invite-view__permanent-id-label {
  color: var(--app-text-soft);
}
[data-theme="light"] .invite-view__tab--muted {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__tab--muted-2 {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__temp-expiry--muted {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__expiry-option--muted {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__temp-footnote {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__temp-footnote-text {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__text-lifetime-identity {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__permanent-footnote {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__permanent-footnote-text {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__permanent-handle {
  color: var(--app-muted);
}
[data-theme="light"] .invite-view__privacy-text {
  color: var(--app-text-soft);
}
.invite-view__qr {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface-soft);
}
.invite-view__qr .qr-code {
  flex: 0 1 210px;
  width: 100%;
  max-width: 210px;
  margin-inline: auto;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-qr-paper);
  padding: 8px;
}
.invite-view__qr-copy {
  flex: 1 1 200px;
  min-width: 0;
}
.invite-view__qr-title {
  font-weight: 700;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-text);
}
.invite-view__qr-text {
  margin: 0;
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.55;
  color: var(--app-muted);
}
.invite-view__qr-link {
  font-weight: 600;
  border-radius: 999px;
  transition: color var(--app-dur-fast) var(--app-ease-standard), background-color var(--app-dur-fast) var(--app-ease-standard), border-color var(--app-dur-fast) var(--app-ease-standard), transform var(--app-dur-fast) var(--app-ease-standard);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  margin-top: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--app-primary);
  cursor: pointer;
}
.invite-view__qr-link svg {
  width: 16px;
  height: 16px;
}
.invite-view__qr-link:active {
  transform: scale(0.97);
}
@media (hover: hover) {
  .invite-view__qr-link:hover {
    color: var(--app-text);
    background: var(--app-surface-hover);
    border-color: var(--app-border-strong);
  }
}
.invite-view__eyebrow {
  margin: 0 0 4px;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}
.invite-view__tab, .invite-view__tab-permanent {
  position: relative;
  justify-content: flex-start;
  gap: 8px;
  min-height: 44px;
  padding: 12px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: var(--app-muted-2);
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}
.invite-view__tab::after, .invite-view__tab-permanent::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 1px;
  background: currentColor;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform var(--app-dur-base) var(--app-ease-emphasized);
}
.invite-view__tab--selected, .invite-view__tab--selected-2 {
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--app-text);
}
.invite-view__tab--selected::after, .invite-view__tab--selected-2::after {
  transform: scaleX(1);
  animation: ledger-draw var(--app-dur-slow) var(--app-ease-emphasized) both;
}
.invite-view__tab-icon, .invite-view__permanent-tab-icon {
  width: 14px;
  height: 14px;
}
.invite-view__tab-text, .invite-view__tab-text-permanent {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
}
.invite-view__tab-title, .invite-view__tab-title-permanent {
  font-size: 9px;
  letter-spacing: 0.04em;
  color: var(--app-muted-2);
}
.invite-view__section, .invite-view__section-2, .invite-view__section-3 {
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}
.invite-view__temp-head, .invite-view__permanent-head {
  padding-bottom: var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
}
.invite-view__text-ephemeral-peer, .invite-view__text-lifetime-identity {
  font-size: var(--app-text-label);
  letter-spacing: var(--app-tracking-label);
  color: var(--app-muted-2);
}
.invite-view__subtitle-disposable-match, .invite-view__subtitle-permanent-public {
  margin-top: 4px;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}
.invite-view__text-lobby-duration, .invite-view__text-decoy-gamertag {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}
.invite-view__temp-duration-hint, .invite-view__temp-decoy-hint, .invite-view__temp-create-hint {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--app-muted-2);
}
.invite-view__copy-game, .invite-view__copy-code, .invite-view__copy-id {
  height: 30px;
  padding-inline: 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}
.invite-view__temp-qr-card, .invite-view__permanent-field {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--app-text);
  word-break: break-all;
  user-select: all;
}
.invite-view__temp-footnote, .invite-view__permanent-footnote {
  padding: var(--app-space-4);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: transparent;
}
.invite-view__temp-footnote-icon, .invite-view__permanent-footnote-icon {
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-text);
}
.invite-view__footnote-icon, .invite-view__permanent-footnote-icon {
  width: 13px;
  height: 13px;
  color: var(--app-warning);
}
.invite-view__temp-footnote-text, .invite-view__permanent-footnote-text {
  margin-top: 8px;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--app-muted);
}
@media (min-width: 40rem) {
  .invite-view__header {
    gap: var(--app-space-4);
  }
  .invite-view__section, .invite-view__section-2, .invite-view__section-3 {
    padding: var(--app-space-6);
  }
  .invite-view__temp-create-button {
    width: auto;
  }
}
@media (max-width: 30rem) {
  .invite-view__title {
    font-size: 26px;
  }
  .invite-view__tablist {
    gap: var(--app-space-5);
  }
}
@media (hover: hover) {
  .invite-view__tab:hover, .invite-view__tab-permanent:hover {
    color: var(--app-text);
  }
  .invite-view__expiry-option:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }
  .invite-view__expiry-option--selected:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }
  .invite-view__temp-create-button:hover {
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }
  .invite-view__copy-game:hover, .invite-view__copy-code:hover, .invite-view__copy-id:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }
  .invite-view__copy-game:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }
  .invite-view__expiry-option-roll-random:hover {
    border-color: var(--app-border-strong);
    background: var(--app-surface-soft);
    color: var(--app-text);
  }
  .invite-view__qr-link:hover {
    color: var(--app-text);
  }
}
@media (pointer: coarse) {
  .invite-view__expiry-option, .invite-view__temp-create-button, .invite-view__copy-game, .invite-view__copy-code, .invite-view__copy-id, .invite-view__expiry-option-roll-random, .invite-view__qr-link {
    min-height: var(--app-touch-h);
  }
}
@media (prefers-reduced-motion: reduce) {
  .invite-view__header, .invite-view__section, .invite-view__section-2, .invite-view__section-3, .invite-view__tab--selected::after, .invite-view__tab--selected-2::after {
    animation: none;
  }
  .invite-view__tab, .invite-view__tab-permanent, .invite-view__tab::after, .invite-view__tab-permanent::after, .invite-view__expiry-option, .invite-view__temp-create-button, .invite-view__copy-game, .invite-view__copy-code, .invite-view__copy-id, .invite-view__expiry-option-roll-random {
    transition: none;
  }
}
</style>
