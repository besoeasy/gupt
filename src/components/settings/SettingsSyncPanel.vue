<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RefreshCw } from "@/icons";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import { useIdentityStore } from "@/stores/identity";
import { useReplicationStore } from "@/stores/replication";

const identityStore = useIdentityStore();
const replicationStore = useReplicationStore();

const now = ref(Date.now());
const syncing = ref(false);
const message = ref("");
const error = ref("");
let timer = null;

const statusLabel = computed(() => {
  if (!replicationStore.active) return "Idle";
  if (typeof document !== "undefined" && document.hidden) return "Paused";
  return "Active";
});

function agoOf(ts) {
  if (!ts) return "never";
  const diff = Math.max(0, Math.floor((now.value - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const lastAgo = computed(() => agoOf(replicationStore.lastTickAt));
const durabilityAgo = computed(() => agoOf(replicationStore.durability?.checkedAt));

const dots = computed(() => {
  const history = replicationStore.history || [];
  return Array.from({ length: 5 }, (_, index) => {
    const entry = history[index];
    if (!entry) return "empty";
    return entry.ok ? "ok" : "err";
  });
});

const durabilityMissing = computed(() => Number(replicationStore.durability?.missingEvents) || 0);
const durabilityChecked = computed(() => Number(replicationStore.durability?.events) || 0);

const lastTickFailed = computed(() => {
  const history = replicationStore.history || [];
  const latest = history[history.length - 1];
  return Boolean(latest && !latest.ok);
});

async function handleSync() {
  if (syncing.value) return;
  syncing.value = true;
  message.value = "";
  error.value = "";
  try {
    await replicationStore.triggerSyncNow(identityStore);
    message.value = "Relay sync finished.";
  } catch (e) {
    error.value = e.message || "Sync failed.";
  } finally {
    syncing.value = false;
  }
}

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="sync-panel">
    <p class="sync-panel__status" role="status">
      <span
        class="sync-panel__dot"
        :class="replicationStore.active ? 'sync-panel__dot--ok' : 'sync-panel__dot--idle'"
        aria-hidden="true"
      />
      <span class="sync-panel__status-text">{{ statusLabel }} · {{ lastAgo }}</span>
      <span v-if="syncing" class="sync-panel__syncing">
        <RefreshCw class="sync-panel__spin" :stroke-width="2" aria-hidden="true" />
        Syncing…
      </span>
    </p>

    <SettingsRow title="Recent relay ticks" description="Last five sync attempts on relays.">
      <span class="sync-panel__ticks" :title="`Last five attempts`" aria-hidden="true">
        <span
          v-for="(dot, index) in dots"
          :key="index"
          class="sync-panel__tick"
          :class="`sync-panel__tick--${dot}`"
        />
      </span>
      <button
        type="button"
        class="sync-panel__action"
        :disabled="syncing"
        @click="handleSync"
      >
        <RefreshCw :class="{ 'sync-panel__spin': syncing }" :stroke-width="2" aria-hidden="true" />
        {{ lastTickFailed ? "Retry" : "Sync now" }}
      </button>
    </SettingsRow>

    <SettingsRow
      v-if="replicationStore.durability"
      title="Relay copies"
      :description="`Newest vault events verified on relays · ${durabilityAgo}.`"
    >
      <span
        class="sync-panel__copies"
        :class="durabilityMissing ? 'sync-panel__copies--bad' : 'sync-panel__copies--ok'"
        :title="`${durabilityChecked} event heads checked`"
      >
        {{ durabilityMissing ? `${durabilityMissing} missing` : `${replicationStore.durability.liveCopies} copies` }}
      </span>
    </SettingsRow>

    <div v-if="message || error" class="sync-panel__alerts">
      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

.sync-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sync-panel__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding-bottom: calc(var(--spacing) * 2);
  font-size: 12px;
  color: var(--app-text-soft);
}

.sync-panel__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}

.sync-panel__dot--ok {
  background-color: var(--app-success);
}

.sync-panel__dot--idle {
  background-color: var(--app-muted);
}

.sync-panel__status-text {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text);
}

.sync-panel__syncing {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text-soft);
}

.sync-panel__ticks {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.sync-panel__tick {
  width: 7px;
  height: 7px;
  border-radius: 999px;
}

.sync-panel__tick--ok {
  background-color: var(--app-success);
}

.sync-panel__tick--err {
  background-color: var(--app-danger);
}

.sync-panel__tick--empty {
  background-color: var(--app-border-strong);
}

.sync-panel__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding-inline: calc(var(--spacing) * 3);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background-color: var(--app-surface);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard);
}

.sync-panel__action svg {
  width: 13px;
  height: 13px;
}

.sync-panel__action:disabled {
  opacity: 0.55;
  cursor: default;
}

.sync-panel__action:focus-visible {
  outline: 2px solid var(--app-primary);
  outline-offset: 2px;
}

.sync-panel__copies {
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.sync-panel__copies--ok {
  color: var(--app-success);
}

.sync-panel__copies--bad {
  color: var(--app-danger);
}

.sync-panel__alerts {
  display: flex;
  flex-direction: column;
  gap: var(--spacing);
  padding-top: calc(var(--spacing) * 3);
}

.sync-panel__spin {
  animation: var(--animate-spin);
}

@media (hover: hover) {
  .sync-panel__action:not(:disabled):hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-hover);
  }
}

@media (max-width: 26rem) {
  .sync-panel__syncing {
    margin-left: 0;
  }
}
</style>
