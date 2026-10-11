<script setup>
import { computed, ref, watch } from "vue";
import { Check, Copy, Link2, RefreshCw } from "@lucide/vue";
import { copyToClipboard } from "@/lib/clipboard";
import { buildRelayInviteUrl, selectTopRelays, MAX_INVITE_RELAY_COUNT } from "@/lib/relayInvite";
import { useIdentityStore } from "@/stores/identity";

const identity = useIdentityStore();

const relays = ref([]);
const loading = ref(false);
const copied = ref(false);

const inviteUrl = computed(() =>
  identity.pubkeyHex ? buildRelayInviteUrl(identity.pubkeyHex, relays.value) : "",
);

const urlLength = computed(() => inviteUrl.value.length);

async function loadRelays() {
  if (!identity.pubkeyHex) return;
  loading.value = true;
  try {
    relays.value = await selectTopRelays();
  } finally {
    loading.value = false;
  }
}

async function copyInviteUrl() {
  if (!inviteUrl.value) return;
  await copyToClipboard(inviteUrl.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

watch(
  () => identity.pubkeyHex,
  (pubkey) => {
    if (pubkey) loadRelays();
  },
  { immediate: true },
);
</script>

<template>
  <div class="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4 sm:p-5 space-y-4 shadow-xs">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 space-y-1">
        <h2 class="text-sm font-semibold tracking-tight text-white">Invite link</h2>
        <p class="text-xs text-zinc-500 leading-relaxed">
          Carries your public key and your best relays. Anyone who opens it adds those relays
          instantly, then lands on your profile.
        </p>
      </div>
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400"
      >
        <Link2 class="h-4 w-4" :stroke-width="2" />
      </div>
    </div>

    <div class="flex items-center gap-2">
      <input
        :value="inviteUrl"
        type="text"
        readonly
        spellcheck="false"
        class="block min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 font-mono text-xs text-zinc-400 select-all"
      />
      <button
        type="button"
        :disabled="!inviteUrl || loading"
        class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-95 disabled:opacity-50 cursor-pointer"
        :title="copied ? 'Copied to clipboard!' : 'Copy invite link'"
        @click="copyInviteUrl"
      >
        <Check v-if="copied" class="h-4 w-4 text-emerald-600" :stroke-width="2.5" />
        <Copy v-else class="h-4 w-4" :stroke-width="2" />
      </button>
      <button
        type="button"
        :disabled="loading"
        class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-50 cursor-pointer"
        title="Pick relays again"
        @click="loadRelays"
      >
        <RefreshCw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" :stroke-width="2" />
      </button>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="font-mono text-[11px] tabular-nums text-zinc-500">
        {{ relays.length }} / {{ MAX_INVITE_RELAY_COUNT }} relays · {{ urlLength }} chars
      </span>
      <span v-if="identity.mode === 'ephemeral'" class="text-[11px] text-amber-400">
        Ephemeral identity — this link breaks when you log out
      </span>
    </div>
  </div>
</template>
