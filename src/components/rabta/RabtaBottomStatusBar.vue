<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Radio, RefreshCw, ChevronRight } from "@/icons";
import { useRabtaSyncStore } from "@/stores/rabtaSync";

const router = useRouter();
const rabtaSyncStore = useRabtaSyncStore();

const statusDotClass = computed(() => {
  if (rabtaSyncStore.isSyncing) return "rabta-bottom-status-bar__warning";
  if (rabtaSyncStore.status === "error" || rabtaSyncStore.status === "offline") return "rabta-bottom-status-bar__danger";
  if (rabtaSyncStore.status === "paused" || rabtaSyncStore.onlineServers === 0) return "rabta-bottom-status-bar__muted";
  return "rabta-bottom-status-bar__success";
});

const statusText = computed(() => {
  if (rabtaSyncStore.isSyncing) return "Syncing…";
  if (rabtaSyncStore.status === "error") return "Error";
  if (rabtaSyncStore.status === "offline") return "Offline";
  if (rabtaSyncStore.status === "paused") return "Paused";
  return "Synced";
});

function openRabtaDashboard() {
  router.push("/rabta-sync");
}
</script>

<template>
  <aside
    class="rabta-bottom-status-bar__bar"
    aria-label="Rabta Mesh Sync Status"
  >
    <button
      type="button"
      class="rabta-bottom-status-bar__button"
      @click="openRabtaDashboard"
      :title="`Rabta Mesh: ${rabtaSyncStore.onlineServers}/${rabtaSyncStore.totalServers} online · ${rabtaSyncStore.ourTotalEvents} events · Tap to open sync dashboard`"
    >
      <!-- Left: Status Indicator & Node Count -->
      <div class="rabta-bottom-status-bar__nodes">
        <span class="rabta-bottom-status-bar__status">
          <span
            v-if="rabtaSyncStore.isSyncing"
            class="rabta-bottom-status-bar__status-pulse"
          />
          <span
            class="rabta-bottom-status-bar__status-light"
            :class="statusDotClass"
          />
        </span>

        <span class="rabta-bottom-status-bar__brand">
          Rabta
        </span>

        <span class="rabta-bottom-status-bar__sep">·</span>

        <span class="rabta-bottom-status-bar__nodes-count">
          {{ rabtaSyncStore.onlineServers }}/{{ rabtaSyncStore.totalServers }}
          <span class="rabta-bottom-status-bar__online">online</span>
        </span>
      </div>

      <!-- Center: Events & Consistency (hidden on very small viewports, visible on md+) -->
      <div class="rabta-bottom-status-bar__telemetry">
        <span class="rabta-bottom-status-bar__sep">·</span>
        <span class="rabta-bottom-status-bar__events">
          {{ rabtaSyncStore.ourTotalEvents.toLocaleString() }} our events
        </span>
        <span class="rabta-bottom-status-bar__sep">·</span>
        <span class="rabta-bottom-status-bar__sync-percent">
          {{ rabtaSyncStore.consistencyPct }}% sync
        </span>
      </div>

      <!-- Right: Sync status & Chevron link -->
      <div class="rabta-bottom-status-bar__sync">
        <RefreshCw
          v-if="rabtaSyncStore.isSyncing"
          class="rabta-bottom-status-bar__sync-icon"
          aria-hidden="true"
        />
        <Radio
          v-else
          class="rabta-bottom-status-bar__status-icon"
          aria-hidden="true"
        />

        <span class="rabta-bottom-status-bar__status-label">
          {{ statusText }}
        </span>

        <ChevronRight class="rabta-bottom-status-bar__chevron" />
      </div>
    </button>
  </aside>
</template>

<style scoped>
.rabta-bottom-status-bar__bar {
  position: sticky;
  bottom: 0;
  z-index: 30;
  display: block;
  width: 100%;
  flex-shrink: 0;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  border-top: 1px solid var(--app-border);
  background: var(--app-bg);
  user-select: none;
}

.rabta-bottom-status-bar__button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 40px;
  padding-inline: var(--app-space-4);
  gap: var(--app-space-3);
  border: 0;
  background: transparent;
  color: var(--app-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.rabta-bottom-status-bar__button:active {
  background: var(--app-surface-soft);
  scale: 1;
}

.rabta-bottom-status-bar__button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: -2px;
}

.rabta-bottom-status-bar__nodes {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.rabta-bottom-status-bar__status {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}

.rabta-bottom-status-bar__status-pulse {
  position: absolute;
  display: inline-flex;
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: var(--app-warning);
  opacity: 0.6;
  animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
}

.rabta-bottom-status-bar__status-light {
  position: relative;
  display: inline-flex;
  width: 6px;
  height: 6px;
  border-radius: 9999px;
}

.rabta-bottom-status-bar__warning {
  background-color: var(--app-warning);
}

.rabta-bottom-status-bar__success {
  background-color: var(--app-success);
}

.rabta-bottom-status-bar__danger {
  background-color: var(--app-danger);
}

.rabta-bottom-status-bar__muted {
  background-color: var(--app-muted);
}

.rabta-bottom-status-bar__brand {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-text);
}

.rabta-bottom-status-bar__sep {
  color: var(--app-border-strong);
}

.rabta-bottom-status-bar__nodes-count {
  color: var(--app-muted);
  font-variant-numeric: tabular-nums;
}

.rabta-bottom-status-bar__online {
  display: none;
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.rabta-bottom-status-bar__telemetry {
  display: none;
  align-items: center;
  gap: 7px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--app-muted-2);
}

.rabta-bottom-status-bar__events {
  font-variant-numeric: tabular-nums;
}

.rabta-bottom-status-bar__sync-percent {
  font-weight: 500;
  color: var(--app-success);
  font-variant-numeric: tabular-nums;
}

.rabta-bottom-status-bar__sync {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  color: var(--app-muted);
}

.rabta-bottom-status-bar__sync-icon {
  width: 12px;
  height: 12px;
  color: var(--app-warning);
  animation: spin 1s linear infinite;
}

.rabta-bottom-status-bar__status-icon {
  width: 12px;
  height: 12px;
  color: var(--app-muted-2);
}

.rabta-bottom-status-bar__status-label {
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--app-muted);
  font-variant-numeric: tabular-nums;
}

.rabta-bottom-status-bar__chevron {
  width: 12px;
  height: 12px;
  color: var(--app-border-strong);
  transition:
    transform var(--app-dur-base) var(--app-ease-swift),
    color var(--app-dur-fast) var(--app-ease-standard);
}

@media (min-width: 40rem) {
  .rabta-bottom-status-bar__online {
    display: inline;
  }

  .rabta-bottom-status-bar__button {
    height: 38px;
    padding-inline: var(--app-space-5);
  }
}

@media (min-width: 48rem) {
  .rabta-bottom-status-bar__telemetry {
    display: flex;
  }
}

@media (hover: hover) {
  .rabta-bottom-status-bar__button:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }

  .rabta-bottom-status-bar__button:hover .rabta-bottom-status-bar__brand {
    color: var(--app-warning);
  }

  .rabta-bottom-status-bar__button:hover .rabta-bottom-status-bar__status-icon {
    color: var(--app-warning);
  }

  .rabta-bottom-status-bar__button:hover .rabta-bottom-status-bar__sync {
    color: var(--app-text);
  }

  .rabta-bottom-status-bar__button:hover .rabta-bottom-status-bar__chevron {
    color: var(--app-muted);
    transform: translateX(2px);
  }
}

@media (pointer: coarse) {
  .rabta-bottom-status-bar__button {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rabta-bottom-status-bar__button,
  .rabta-bottom-status-bar__chevron {
    transition: none;
  }

  .rabta-bottom-status-bar__status-pulse,
  .rabta-bottom-status-bar__sync-icon {
    animation: none;
  }
}
</style>

