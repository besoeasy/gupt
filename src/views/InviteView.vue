<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  KeyRound,
  LoaderCircle,
  Sparkles,
  UserPlus,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { api } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { waitForRelayAck } from "@/lib/engine";
import { startAppSync } from "@/lib/sync";
import { publishTempInvite, TEMP_INVITE_DURATIONS } from "@/lib/tempInvite";
import { useIdentityStore } from "@/stores/identity";

const identity = useIdentityStore();

const copied = ref("");
let copiedTimer = null;

const tempDuration = ref("24h");
const creating = ref(false);
const createError = ref("");
const tempInvite = ref(null);
const tempStatus = ref("");

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

onMounted(async () => {
  tickTimer = setInterval(() => (tick.value = Date.now()), 30000);
  await identity.init();
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
      <div class="mb-4">
        <RouterLink
          to="/chat"
          class="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <ArrowLeft class="h-3.5 w-3.5" :stroke-width="2" />
          Chat
        </RouterLink>
      </div>

      <header class="flex items-center gap-3 pb-6">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-950/40 text-zinc-500"
        >
          <UserPlus class="h-4 w-4" :stroke-width="2" />
        </div>
        <div class="min-w-0">
          <h1 class="truncate text-lg font-semibold tracking-tight text-white">Invite</h1>
          <p class="mt-0.5 truncate text-xs leading-relaxed text-zinc-500">
            Create an encrypted invite code that carries your profile ID and relays.
          </p>
        </div>
      </header>

      <div class="space-y-7">
        <section class="space-y-1">
          <div class="flex items-center justify-between gap-3 px-1">
            <h2 class="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">
              Temporary invite code
            </h2>
            <span
              v-if="tempInvite"
              class="inline-flex items-center gap-1.5 font-mono text-[10px] tabular-nums"
              :class="tempExpiry === 'expired' ? 'text-red-400' : 'text-zinc-500'"
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
              <span v-else-if="tempStatus === 'publishing'" class="text-amber-400">
                &middot; publishing…
              </span>
              <span v-else-if="tempStatus === 'queued'" class="text-amber-400">
                &middot; queued
              </span>
            </span>
          </div>

          <div class="divide-y divide-zinc-800/70">
            <div
              class="flex flex-col gap-2.5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium tracking-tight text-zinc-200">
                  Expiry duration
                </p>
                <p class="mt-0.5 truncate text-xs text-zinc-500">
                  Relays drop the encrypted record when the timer expires.
                </p>
              </div>
              <div class="flex shrink-0 flex-wrap gap-1.5" role="group" aria-label="Invite expiry">
                <button
                  v-for="duration in TEMP_INVITE_DURATIONS"
                  :key="duration.id"
                  type="button"
                  class="cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-all disabled:opacity-50"
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

            <div class="flex items-center justify-between gap-3 py-3.5">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium tracking-tight text-zinc-200">
                  {{ tempInvite ? "Create another invite" : "Publish encrypted invite" }}
                </p>
                <p class="mt-0.5 truncate text-xs text-zinc-500">
                  Publishes your profile ID and relay endpoints under an ephemeral key.
                </p>
              </div>
              <button
                type="button"
                class="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black transition-all hover:bg-zinc-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="creating"
                @click="createTempInvite"
              >
                <LoaderCircle
                  v-if="creating"
                  class="h-3.5 w-3.5 animate-spin"
                  :stroke-width="2.2"
                />
                <Sparkles v-else class="h-3.5 w-3.5" :stroke-width="2.2" />
                <span>{{
                  creating ? "Creating…" : tempInvite ? "Create another" : "Create code"
                }}</span>
              </button>
            </div>

            <div v-if="createError" class="py-2">
              <AppAlertBanner :message="createError" />
            </div>

            <div v-if="tempInvite" class="space-y-2 py-3.5">
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium tracking-tight text-zinc-200">
                    Invite code
                  </p>
                  <p class="mt-0.5 truncate text-xs text-zinc-500">
                    Paste this code into New Chat to connect immediately.
                  </p>
                </div>
                <button
                  type="button"
                  class="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
                  :title="copied === 'code' ? 'Invite code copied!' : 'Copy invite code'"
                  @click="copyValue(tempInvite.code, 'code')"
                >
                  <Check
                    v-if="copied === 'code'"
                    class="h-3 w-3 text-emerald-400"
                    :stroke-width="2.5"
                  />
                  <Copy v-else class="h-3 w-3" :stroke-width="2" />
                  <span>{{ copied === "code" ? "Copied" : "Copy code" }}</span>
                </button>
              </div>
              <div
                class="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3 font-mono text-[11px] leading-relaxed break-all text-zinc-300 select-all"
              >
                {{ tempInvite.code }}
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-1">
          <h2
            class="px-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600"
          >
            Direct identity
          </h2>

          <div class="divide-y divide-zinc-800/70">
            <div class="space-y-2.5 py-3.5">
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium tracking-tight text-zinc-200">
                    Public profile ID
                  </p>
                  <p class="mt-0.5 truncate text-xs text-zinc-500">
                    Share your Nostr public key for direct contact.
                  </p>
                </div>
                <button
                  type="button"
                  class="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
                  :title="copied === 'id' ? 'Profile ID copied!' : 'Copy profile ID'"
                  @click="copyValue(identity.pubkeyHex, 'id')"
                >
                  <Check
                    v-if="copied === 'id'"
                    class="h-3 w-3 text-emerald-400"
                    :stroke-width="2.5"
                  />
                  <Copy v-else class="h-3 w-3" :stroke-width="2" />
                  <span>{{ copied === "id" ? "Copied" : "Copy ID" }}</span>
                </button>
              </div>
              <div
                class="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3 font-mono text-[11px] leading-relaxed break-all text-zinc-300 select-all"
              >
                {{ identity.pubkeyHex }}
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-1">
          <h2
            class="px-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600"
          >
            Security &amp; Privacy
          </h2>
          <div class="divide-y divide-zinc-800/70">
            <div class="py-3.5">
              <p class="text-xs leading-relaxed text-zinc-500">
                Anyone with your invite code can resolve your profile ID and relay endpoints.
                Private keys never leave this device. When the expiration time arrives, relays drop
                the encrypted event automatically.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div class="pt-8 pb-4 text-center">
        <p class="font-mono text-[10px] uppercase tracking-widest text-zinc-600 tabular-nums">
          Encrypted Invites &middot; Peer Discovery
        </p>
      </div>
    </main>
  </div>
</template>
