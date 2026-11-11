<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Check, Clock, Copy, KeyRound, LoaderCircle } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PageBackHeader from "@/components/PageBackHeader.vue";
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
          Create an encrypted invite code that carries your profile ID and relays.
        </p>
      </PageBackHeader>

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
              <span>Invite code</span>
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
          <KeyRound v-else class="h-3.5 w-3.5" :stroke-width="2.2" />
          <span>{{
            creating ? "Creating…" : tempInvite ? "Create another invite" : "Create invite code"
          }}</span>
        </button>

        <AppAlertBanner v-if="createError" :message="createError" />

        <div v-if="tempInvite" class="space-y-3">
          <div class="space-y-1.5">
            <div class="text-[11px] font-medium text-zinc-400">Invite code</div>
            <div class="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <p
                class="min-w-0 flex-1 break-all rounded-lg border border-zinc-800 bg-black/40 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-300 select-all"
              >
                {{ tempInvite.code }}
              </p>
              <button
                type="button"
                class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95 cursor-pointer"
                :title="copied === 'code' ? 'Invite code copied!' : 'Copy invite code'"
                @click="copyValue(tempInvite.code, 'code')"
              >
                <Check
                  v-if="copied === 'code'"
                  class="h-3.5 w-3.5 text-emerald-400"
                  :stroke-width="2.5"
                />
                <Copy v-else class="h-3.5 w-3.5" :stroke-width="2" />
                <span>{{ copied === "code" ? "Copied" : "Copy code" }}</span>
              </button>
            </div>
          </div>

          <p class="text-[11px] text-zinc-500">
            <span :class="tempExpiry === 'expired' ? 'text-red-400' : ''">
              {{
                tempExpiry === "expired"
                  ? "Expired — create a new invite"
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
          Anyone with the invite code can read it. It contains your public profile ID and relay
          list, never your private keys.
        </p>
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
            <span class="mt-1 block break-all font-mono text-[11px] leading-relaxed text-zinc-400">
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
    </div>
  </div>
</template>
