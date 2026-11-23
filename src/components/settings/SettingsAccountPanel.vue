<script setup>
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { Check, Copy } from "@/icons";
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
  <div class="account-panel">
    <SettingsRow title="Your identity" description="Your public key. Contacts verify it, not a server.">
      <code class="account-panel__key">{{ identityLabel }}</code>
      <button
        type="button"
        class="account-panel__copy"
        :aria-label="copied ? 'Identity copied' : 'Copy identity'"
        :title="copied ? 'Copied' : 'Copy public key'"
        @click="copyIdentity"
      >
        <Check v-if="copied" :stroke-width="2" aria-hidden="true" />
        <Copy v-else :stroke-width="2" aria-hidden="true" />
      </button>
    </SettingsRow>

    <SettingsRow
      title="Backup node"
      description="Keep a verified copy of your events on a machine you own."
    >
      <RouterLink to="/integrations/backup" class="account-panel__link">Set up</RouterLink>
    </SettingsRow>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

.account-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.account-panel__key {
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--app-text);
}

.account-panel__copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background-color: transparent;
  color: var(--app-text-soft);
  cursor: pointer;
  transition:
    color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

.account-panel__copy svg {
  width: 15px;
  height: 15px;
}

.account-panel__copy:active {
  scale: 0.98;
}

.account-panel__copy:focus-visible,
.account-panel__link:focus-visible {
  outline: 2px solid var(--app-primary);
  outline-offset: 2px;
}

.account-panel__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding-inline: calc(var(--spacing) * 3.5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background-color: var(--app-surface);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text);
  text-decoration: none;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard);
}

@media (hover: hover) {
  .account-panel__copy:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-hover);
    color: var(--app-text);
  }

  .account-panel__link:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-hover);
  }
}
</style>
