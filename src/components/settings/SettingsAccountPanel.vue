<script setup>
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { Check, Copy } from "@lucide/vue";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { shortId } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";

const identity = useIdentityStore();
const copied = ref(false);

const identityLabel = computed(() =>
  identity.pubkeyHex ? shortId(identity.pubkeyHex, 10, 6) : "no account",
);

async function copyIdentity() {
  if (!identity.pubkeyHex) return;
  await copyToClipboard(identity.pubkeyHex);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<template>
  <div>
    <SettingsRow
      title="Your identity"
      description="Your public key. Contacts verify it, not a server."
    >
      <code class="font-mono text-[11px] text-zinc-400">{{ identityLabel }}</code>
      <button
        type="button"
        class="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 active:scale-[0.98] sm:h-8 sm:w-8"
        :aria-label="copied ? 'Identity copied' : 'Copy identity'"
        :title="copied ? 'Copied' : 'Copy public key'"
        @click="copyIdentity"
      >
        <Check v-if="copied" class="h-3.5 w-3.5 text-emerald-400" :stroke-width="2" />
        <Copy v-else class="h-3.5 w-3.5" :stroke-width="2" />
      </button>
    </SettingsRow>

    <SettingsRow
      title="Profile & devices"
      description="Name, about, linked devices, and signing out."
    >
      <RouterLink
        to="/me"
        class="inline-flex min-h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-[0.98] sm:min-h-8"
      >
        Manage
      </RouterLink>
    </SettingsRow>

    <SettingsRow
      title="Backup node"
      description="Keep a verified copy of your events on a machine you own."
    >
      <RouterLink
        to="/integrations/backup"
        class="inline-flex min-h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-[0.98] sm:min-h-8"
      >
        Set up
      </RouterLink>
    </SettingsRow>

    <SettingsRow title="Integrations" description="Markdown capture and other local tools.">
      <RouterLink
        to="/integrations"
        class="inline-flex min-h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-[0.98] sm:min-h-8"
      >
        Open
      </RouterLink>
    </SettingsRow>
  </div>
</template>
