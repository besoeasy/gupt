<script setup>
import { computed } from "vue";
import { Trash2, Lock, ShieldCheck, Activity, HardDrive } from "@/icons";
import { DEFAULT_RELAYS } from "@/config/servers";

const props = defineProps({
  servers: {
    type: Array,
    default: () => [],
  },
  defaultRelays: {
    type: Array,
    default: () => [...DEFAULT_RELAYS],
  },
});

const emit = defineEmits(["remove"]);

const displayServers = computed(() => {
  if (props.servers && props.servers.length > 0) {
    return props.servers;
  }
  const fallback = props.defaultRelays && props.defaultRelays.length
    ? props.defaultRelays
    : DEFAULT_RELAYS;
  return fallback.map((url) => ({
    url,
    online: null,
    latencyMs: null,
    userEvents: null,
    storage: null,
  }));
});

function cleanUrl(url) {
  return String(url || "").replace(/^https?:\/\//i, "");
}

function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) return "Unlimited";
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${val} ${units[i]}`;
}

function latencyColorClass(server) {
  if (server.online === null) return "mesh-table__latency--muted";
  if (!server.online) return "mesh-table__latency--danger";
  const ms = server.latencyMs;
  if (ms == null) return "mesh-table__latency--muted";
  if (ms < 120) return "mesh-table__latency--success";
  if (ms < 300) return "mesh-table__latency--warning";
  return "mesh-table__latency--danger";
}

function isDefaultServer(url) {
  return props.defaultRelays.includes(url) || DEFAULT_RELAYS.includes(url);
}
</script>

<template>
  <div class="mesh-table">
    <div class="mesh-table__scroll">
      <table class="mesh-table__table">
        <colgroup>
          <col />
          <col class="mesh-table__col-latency" />
          <col class="mesh-table__col-events" />
          <col class="mesh-table__col-headroom" />
          <col class="mesh-table__col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Node</th>
            <th scope="col">Latency</th>
            <th scope="col">Events</th>
            <th scope="col" class="mesh-table__headroom-col">Headroom</th>
            <th scope="col"><span class="mesh-table__sr">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="server in displayServers" :key="server.url" class="mesh-table__row">
            <td class="mesh-table__node">
              <div class="mesh-table__node-inner">
                <span class="mesh-table__status" aria-hidden="true">
                  <span
                    class="mesh-table__dot"
                    :class="{
                      'mesh-table__dot--online': server.online === true,
                      'mesh-table__dot--offline': server.online === false,
                      'mesh-table__dot--probing': server.online === null,
                    }"
                  />
                </span>
                <div class="mesh-table__node-body">
                  <div class="mesh-table__node-line">
                    <span class="mesh-table__url" :title="server.url">{{ cleanUrl(server.url) }}</span>
                    <span
                      v-if="server.battery?.backedOff"
                      class="mesh-table__battery"
                      :title="`Sync cadence backed off (${server.battery.multiplier}x) for ${server.battery.label}`"
                    >
                      {{ server.battery.label }}
                    </span>
                  </div>
                  <p
                    v-if="server.online === false && server.error"
                    class="mesh-table__error"
                    :title="server.error"
                  >
                    {{ server.error }}
                  </p>
                  <p v-else-if="server.nodeId" class="mesh-table__id" :title="server.nodeId">
                    id: {{ server.nodeId.slice(0, 10) }}…
                  </p>
                </div>
              </div>
            </td>

            <td class="mesh-table__latency" :class="latencyColorClass(server)">
              <template v-if="server.online === null">Probing…</template>
              <template v-else-if="!server.online">Offline</template>
              <template v-else>{{ server.latencyMs != null ? `${server.latencyMs}ms` : '—' }}</template>
            </td>

            <td class="mesh-table__events">
              <span class="mesh-table__events-total">
                {{ server.userEvents != null ? server.userEvents.toLocaleString() : '0' }}
              </span>
              <span
                v-if="server.userOurs != null || server.userInbound != null"
                class="mesh-table__split"
                :title="`${server.userOurs || 0} sent · ${server.userInbound || 0} received (Relay total: ${server.liveEvents || 0})`"
              >
                {{ server.userOurs || 0 }}s · {{ server.userInbound || 0 }}r
              </span>
            </td>

            <td class="mesh-table__headroom">
              <template v-if="server.storage?.writable === false">
                <span class="mesh-table__readonly">Read-only</span>
              </template>
              <template v-else-if="server.storage">
                {{ formatBytes(server.storage.remainingBytes) }}
              </template>
              <template v-else>—</template>
            </td>

            <td class="mesh-table__actions">
              <button
                v-if="!isDefaultServer(server.url)"
                type="button"
                class="mesh-table__remove"
                title="Remove server node"
                aria-label="Remove server node"
                @click="emit('remove', server.url)"
              >
                <Trash2 class="mesh-table__remove-icon" :stroke-width="1.8" aria-hidden="true" />
              </button>
              <span v-else class="mesh-table__core" title="Default core mesh node">core</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* Ledger pass: the mesh table is a quiet ruled register. */

.mesh-table {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
}

.mesh-table__scroll {
  overflow-x: auto;
}

.mesh-table__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  text-align: left;
}

.mesh-table__table th {
  padding: 9px 12px;
  border-bottom: 1px solid var(--app-border);
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--app-muted-2);
}

.mesh-table__table td {
  padding: 10px 12px;
  vertical-align: middle;
}

.mesh-table__row + .mesh-table__row td {
  border-top: 1px solid var(--app-border);
}

.mesh-table__col-latency,
.mesh-table__col-events,
.mesh-table__col-headroom,
.mesh-table__col-actions {
  width: 1%;
}

.mesh-table__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.mesh-table__node-inner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.mesh-table__status {
  display: inline-flex;
  padding-top: 5px;
}

.mesh-table__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-border-strong);
}

.mesh-table__dot--online {
  background: var(--app-success);
  box-shadow: var(--app-glow-amber);
}

.mesh-table__dot--offline {
  background: var(--app-danger);
}

.mesh-table__dot--probing {
  background: var(--app-warning);
  animation: ledger-dot-pulse 1.6s var(--app-ease-standard) infinite;
}

.mesh-table__node-body {
  min-width: 0;
}

.mesh-table__node-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}

.mesh-table__url {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.mesh-table__battery {
  padding: 1px 5px;
  border: 1px solid color-mix(in oklab, var(--app-warning) 30%, var(--app-border));
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-warning);
}

.mesh-table__error {
  margin: 3px 0 0;
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 1.5;
  color: var(--app-danger);
  overflow-wrap: anywhere;
}

.mesh-table__id {
  margin: 3px 0 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
}

.mesh-table__latency,
.mesh-table__events,
.mesh-table__headroom {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.01em;
  white-space: nowrap;
  color: var(--app-muted);
  font-variant-numeric: tabular-nums;
}

.mesh-table__latency--success {
  color: var(--app-success);
}

.mesh-table__latency--warning {
  color: var(--app-warning);
}

.mesh-table__latency--danger {
  color: var(--app-danger);
}

.mesh-table__latency--muted {
  color: var(--app-muted-2);
}

.mesh-table__events-total {
  color: var(--app-text-soft);
}

.mesh-table__split {
  margin-left: 4px;
  font-size: 8.5px;
  color: var(--app-muted-2);
}

.mesh-table__readonly {
  color: var(--app-warning);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-size: 8.5px;
}

.mesh-table__actions {
  text-align: right;
}

.mesh-table__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: color-mix(in oklab, var(--app-danger) 70%, var(--app-muted));
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.mesh-table__remove-icon {
  width: 12px;
  height: 12px;
}

.mesh-table__core {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

@media (max-width: 36rem) {
  .mesh-table__headroom-col,
  .mesh-table__headroom {
    display: none;
  }

  .mesh-table__table th,
  .mesh-table__table td {
    padding-inline: 10px;
  }
}

@media (hover: hover) {
  .mesh-table__remove:hover {
    background: var(--app-danger-soft);
    color: var(--app-danger);
  }
}

@media (pointer: coarse) {
  .mesh-table__remove {
    width: var(--app-touch-h);
    height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mesh-table__dot--probing {
    animation: none;
  }

  .mesh-table__remove {
    transition: none;
  }
}
</style>
