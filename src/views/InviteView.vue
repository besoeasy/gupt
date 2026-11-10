<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  Check,
  Clock,
  Copy,
  KeyRound,
  Link2,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
import PageBackHeader from "@/components/PageBackHeader.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { useOpenConversation } from "@/composables/useOpenConversation";
import { api } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { shortId } from "@/lib/crypto";
import { waitForRelayAck } from "@/lib/engine";
import { buildRelayInviteUrl, selectTopRelays, seedVerifiedInviteRelays } from "@/lib/relayInvite";
import { startAppSync } from "@/lib/sync";
import {
  openTempInvite,
  parseTempInvite,
  publishTempInvite,
  TEMP_INVITE_DURATIONS,
} from "@/lib/tempInvite";
import { useIdentityStore } from "@/stores/identity";
import { useProfileStore } from "@/stores/profiles";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const profileStore = useProfileStore();
const { openDmWith } = useOpenConversation();

const permanentUrl = ref("");
const loadingPermanent = ref(true);
const permanentError = ref("");
const copied = ref("");
let copiedTimer = null;

const tempDuration = ref("24h");
const creating = ref(false);
const createError = ref("");
const tempInvite = ref(null);
const tempStatus = ref("");

const received = ref(null);
const receivedLoading = ref(false);
const receivedError = ref("");
const inviterProfile = ref(null);
const openingChat = ref(false);

const tick = ref(Date.now());
let tickTimer = null;
let mounted = true;

const inviteId = computed(() => String(route.params.inviteId || ""));
const inviteKey = computed(() => String(route.params.inviteKey || ""));
const inviteRelays = computed(() => String(route.params.relays || ""));
const isReceived = computed(() => Boolean(inviteId.value || inviteKey.value));

const inviterName = computed(() => {
  if (inviterProfile.value?.name) return inviterProfile.value.name;
  if (received.value?.profile?.name) return received.value.profile.name;
  const pubkey = received.value?.profile?.pubkey;
  return pubkey ? shortId(pubkey) : "Someone";
});

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
const receivedExpiry = computed(() => (received.value ? timeLeft(received.value.expiresAt) : ""));

async function loadPermanent() {
  loadingPermanent.value = true;
  permanentError.value = "";
  try {
    if (!identity.pubkeyHex) {
      permanentError.value = "No identity is loaded on this device.";
      return;
    }
    const relays = await selectTopRelays();
    permanentUrl.value = buildRelayInviteUrl(identity.pubkeyHex, relays);
    if (!permanentUrl.value) permanentError.value = "Could not build your invite link.";
  } catch (e) {
    permanentError.value = e.message || "Could not build your invite link.";
  } finally {
    loadingPermanent.value = false;
  }
}

async function loadReceived() {
  receivedLoading.value = true;
  receivedError.value = "";
  try {
    const parsed = parseTempInvite(inviteId.value, inviteKey.value, inviteRelays.value);
    received.value = await openTempInvite(parsed);
    inviterProfile.value = await profileStore
      .fetchProfileDetails(received.value.profile.pubkey)
      .catch(() => null);
  } catch (e) {
    receivedError.value = e.message || "Could not open this invite.";
  } finally {
    receivedLoading.value = false;
  }
}

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
    const localProfile = await api.getLocalProfile(identity.pubkeyHex).catch(() => null);
    const invite = await publishTempInvite({
      privkeyHex: identity.privkeyHex,
      pubkeyHex: identity.pubkeyHex,
      name: localProfile?.name || identity.profileName,
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
    createError.value = e.message || "Could not create the invite.";
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

async function openReceivedChat() {
  if (!received.value || openingChat.value) return;
  if (!identity.isReady) {
    router.push({ path: "/welcome", query: { next: route.fullPath } });
    return;
  }
  openingChat.value = true;
  receivedError.value = "";
  try {
    void seedVerifiedInviteRelays(received.value.profile.relays).catch(() => {});
    await openDmWith(identity, received.value.profile.pubkey, { label: inviterName.value });
  } catch (e) {
    receivedError.value = e.message || "Could not open the chat.";
  } finally {
    openingChat.value = false;
  }
}

onMounted(async () => {
  tickTimer = setInterval(() => (tick.value = Date.now()), 30000);
  await identity.init();
  if (isReceived.value) {
    await loadReceived();
  } else {
    await loadPermanent();
  }
});

onUnmounted(() => {
  mounted = false;
  clearInterval(tickTimer);
  clearTimeout(copiedTimer);
});
</script>

<template>
  <div class="h-full w-full min-w-0 overflow-y-auto bg-black text-zinc-100 pb-16">
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-5">
      <PageBackHeader
        back-to="/chat"
        back-label="Chat"
        eyebrow="Share"
        title="Invite"
        eyebrow-class="text-zinc-500"
      >
        <p class="text-sm leading-6 text-zinc-500">
          {{
            isReceived
              ? "Someone shared a temporary invite with you."
              : "Create a temporary link or share a permanent one that carries your profile ID and relays."
          }}
        </p>
      </PageBackHeader>

      <template v-if="isReceived">
        <div v-if="receivedLoading" class="space-y-4" role="status">
          <span class="sr-only">Opening invite…</span>
          <div
            class="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 text-center shadow-xs"
            aria-hidden="true"
          >
            <AppSkeleton class="mx-auto h-20 w-20 rounded-3xl" />
            <AppSkeleton class="mx-auto mt-4 h-5 w-40" />
            <AppSkeleton class="mx-auto mt-2 h-3 w-56 max-w-full" />
            <AppSkeleton class="mx-auto mt-5 h-9 w-40 rounded-lg" />
          </div>
        </div>

        <template v-else-if="received">
          <AppAlertBanner v-if="receivedError" :message="receivedError" />

          <div class="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 text-center shadow-xs">
            <div class="mx-auto w-fit">
              <RoboAvatar
                :pubkey="received.profile.pubkey"
                size="hero"
                rounded="3xl"
                alt="Inviter avatar"
              />
            </div>
            <h2 class="mt-4 text-xl font-bold tracking-tight text-white">{{ inviterName }}</h2>
            <p class="mt-1 text-sm leading-relaxed text-zinc-400">
              Invited you to start an end-to-end encrypted chat.
            </p>
            <p
              class="mt-2 inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] font-medium text-zinc-400"
            >
              <Clock class="h-3 w-3" :stroke-width="2" aria-hidden="true" />
              Temporary invite · {{ receivedExpiry }} left
            </p>

            <div class="mt-5 flex flex-col items-center gap-2.5">
              <button
                type="button"
                class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white px-4 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-95 disabled:opacity-50 cursor-pointer"
                :disabled="openingChat"
                @click="openReceivedChat"
              >
                <LoaderCircle
                  v-if="openingChat"
                  class="h-3.5 w-3.5 animate-spin"
                  :stroke-width="2.2"
                />
                <MessageCircle v-else class="h-3.5 w-3.5" :stroke-width="2.2" />
                <span>{{ openingChat ? "Opening…" : "Message" }}</span>
              </button>
              <RouterLink
                :to="`/profile/${received.profile.pubkey}`"
                class="text-xs font-medium text-zinc-400 transition-colors hover:text-white"
              >
                View profile
              </RouterLink>
            </div>

            <p class="mt-5 text-[11px] leading-relaxed text-zinc-600">
              This link stops working when it expires. The relay deletes the encrypted invite
              automatically.
            </p>
          </div>
        </template>

        <div v-else class="space-y-3">
          <AppAlertBanner :message="receivedError || 'Could not open this invite.'" />
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white cursor-pointer"
            @click="loadReceived"
          >
            <RefreshCw class="h-3.5 w-3.5" :stroke-width="2" />
            <span>Try again</span>
          </button>
        </div>
      </template>

      <template v-else>
        <section
          class="space-y-4 rounded-xl border border-emerald-500/20 bg-zinc-950/60 p-4 shadow-xs sm:p-5"
        >
          <div class="flex items-start gap-3">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            >
              <Clock class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
            </div>
            <div class="min-w-0 flex-1">
              <h2
                class="flex flex-wrap items-center gap-2 text-sm font-semibold tracking-tight text-white"
              >
                <span>Temporary invite</span>
                <span
                  class="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300"
                >
                  Recommended
                </span>
              </h2>
              <p class="mt-0.5 text-xs leading-relaxed text-zinc-500">
                Publishes an encrypted event to Rabta relays with your profile ID and relays. The
                relay drops it when the timer ends.
              </p>
            </div>
          </div>

          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Invite expiry">
            <button
              v-for="duration in TEMP_INVITE_DURATIONS"
              :key="duration.id"
              type="button"
              class="rounded-lg border px-2.5 py-1 text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
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

          <button
            type="button"
            class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white px-4 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            :disabled="creating"
            @click="createTempInvite"
          >
            <LoaderCircle v-if="creating" class="h-3.5 w-3.5 animate-spin" :stroke-width="2.2" />
            <Link2 v-else class="h-3.5 w-3.5" :stroke-width="2.2" />
            <span>{{
              creating ? "Creating…" : tempInvite ? "Create another invite" : "Create invite link"
            }}</span>
          </button>

          <AppAlertBanner v-if="createError" :message="createError" />

          <div v-if="tempInvite" class="space-y-2">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <p
                class="min-w-0 flex-1 break-all rounded-lg border border-zinc-800 bg-black/40 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-300 select-all"
              >
                {{ tempInvite.url }}
              </p>
              <button
                type="button"
                class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95 cursor-pointer"
                :title="copied === 'temp' ? 'Temporary invite copied!' : 'Copy temporary invite'"
                @click="copyValue(tempInvite.url, 'temp')"
              >
                <Check
                  v-if="copied === 'temp'"
                  class="h-3.5 w-3.5 text-emerald-400"
                  :stroke-width="2.5"
                />
                <Copy v-else class="h-3.5 w-3.5" :stroke-width="2" />
                <span>{{ copied === "temp" ? "Copied" : "Copy" }}</span>
              </button>
            </div>
            <p class="text-[11px] text-zinc-500">
              <span :class="tempExpiry === 'expired' ? 'text-red-400' : ''">
                {{
                  tempExpiry === "expired"
                    ? "Expired — create a new link"
                    : `Expires in ${tempExpiry}`
                }}
              </span>
              <span v-if="tempStatus === 'live'" class="text-emerald-400"> · live on relays</span>
              <span v-else-if="tempStatus === 'publishing'" class="text-amber-400">
                · publishing to relays…
              </span>
              <span v-else-if="tempStatus === 'queued'" class="text-amber-400">
                · queued; relays will receive it when reachable
              </span>
            </p>
          </div>

          <p class="text-[11px] leading-relaxed text-zinc-600">
            Anyone with the link can read it. It contains your public profile ID and relay list,
            never your private keys.
          </p>
        </section>

        <section
          class="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 shadow-xs sm:p-5"
        >
          <div class="space-y-1">
            <h2 class="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-white">
              <Link2 class="h-4 w-4 text-zinc-400" :stroke-width="2" aria-hidden="true" />
              Permanent invite
            </h2>
            <p class="text-xs leading-relaxed text-zinc-500">
              A link that never expires. It carries your profile ID and relays without publishing
              anything extra.
            </p>
          </div>

          <AppAlertBanner v-if="permanentError" :message="permanentError" />

          <div v-if="loadingPermanent" class="space-y-2" role="status">
            <span class="sr-only">Building your permanent invite…</span>
            <AppSkeleton class="h-10 w-full rounded-lg" />
          </div>

          <div v-else-if="!permanentError" class="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <p
              class="min-w-0 flex-1 break-all rounded-lg border border-zinc-800 bg-black/40 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-300 select-all"
            >
              {{ permanentUrl }}
            </p>
            <button
              type="button"
              class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95 cursor-pointer"
              :title="copied === 'url' ? 'Permanent invite copied!' : 'Copy permanent invite'"
              @click="copyValue(permanentUrl, 'url')"
            >
              <Check
                v-if="copied === 'url'"
                class="h-3.5 w-3.5 text-emerald-400"
                :stroke-width="2.5"
              />
              <Copy v-else class="h-3.5 w-3.5" :stroke-width="2" />
              <span>{{ copied === "url" ? "Copied" : "Copy" }}</span>
            </button>
          </div>
        </section>

        <section class="space-y-3">
          <div class="px-1">
            <h2 class="text-sm font-semibold tracking-tight text-white">Profile ID</h2>
            <p class="mt-0.5 text-xs leading-relaxed text-zinc-500">
              Your public key. Click to copy it for someone who prefers to add you directly.
            </p>
          </div>

          <button
            type="button"
            class="group flex w-full items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900/50 sm:p-3.5 cursor-pointer"
            :title="copied === 'id' ? 'Profile ID copied!' : 'Copy your profile ID'"
            @click="copyValue(identity.pubkeyHex, 'id')"
          >
            <span
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 sm:h-11 sm:w-11"
            >
              <KeyRound class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-xs font-semibold tracking-tight text-zinc-200">
                {{ copied === "id" ? "Copied to clipboard" : "Public key" }}
              </span>
              <span
                class="mt-1 block break-all font-mono text-[11px] leading-relaxed text-zinc-400"
              >
                {{ identity.pubkeyHex }}
              </span>
            </span>
            <Check
              v-if="copied === 'id'"
              class="h-4 w-4 shrink-0 text-emerald-400"
              :stroke-width="2.5"
              aria-hidden="true"
            />
            <Copy
              v-else
              class="h-4 w-4 shrink-0 text-zinc-500 transition-colors group-hover:text-zinc-300"
              :stroke-width="2"
              aria-hidden="true"
            />
          </button>
        </section>
      </template>
    </div>
  </div>
</template>
