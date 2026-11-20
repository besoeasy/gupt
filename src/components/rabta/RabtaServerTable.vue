<script setup>
import { computed } from "vue";
import { Trash2, Lock, ShieldCheck, Activity, HardDrive } from "@lucide/vue";
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
  if (server.online === null) return "rabta-server-table__muted";
  if (!server.online) return "rabta-server-table__danger";
  const ms = server.latencyMs;
  if (ms == null) return "rabta-server-table__muted";
  if (ms < 120) return "rabta-server-table__success";
  if (ms < 300) return "rabta-server-table__warning";
  return "rabta-server-table__danger-2";
}

function isDefaultServer(url) {
  return props.defaultRelays.includes(url) || DEFAULT_RELAYS.includes(url);
}
</script>

<template>
  <div class="rabta-server-table__block">
    <div class="rabta-server-table__block-2">
      <table class="rabta-server-table__table">
        <colgroup>
          <col class="rabta-server-table__col" />
          <col class="rabta-server-table__col-2" />
          <col class="rabta-server-table__col-3" />
          <col class="rabta-server-table__col-4" />
          <col class="rabta-server-table__col-5" />
        </colgroup>
        <thead>
          <tr class="rabta-server-table__row">
            <th scope="col" class="rabta-server-table__cell-node">Node</th>
            <th scope="col" class="rabta-server-table__cell-latency">Latency</th>
            <th scope="col" class="rabta-server-table__cell-events">Events</th>
            <th scope="col" class="rabta-server-table__cell-headroom">Headroom</th>
            <th scope="col" class="rabta-server-table__cell">
              <span class="rabta-server-table__text-actions">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody class="rabta-server-table__body">
          <tr
            v-for="server in displayServers"
            :key="server.url"
            class="rabta-server-table__row-2"
          >
            <!-- Column 1: Node & Status Dot -->
            <td class="rabta-server-table__cell-2">
              <div class="rabta-server-table__block-3">
                <span class="rabta-server-table__text">
                  <span
                    v-if="server.online === true"
                    class="rabta-server-table__text-2"
                  />
                  <span
                    class="rabta-server-table__text-3"
                    :class="{
                      'rabta-server-table__text--success': server.online === true,
                      'rabta-server-table__text--danger': server.online === false,
                      'rabta-server-table__text--pulse': server.online === null,
                    }"
                  />
                </span>
                <div class="rabta-server-table__block-4">
                  <div class="rabta-server-table__block-5">
                    <span
                      class="rabta-server-table__text-4"
                      :title="server.url"
                    >
                      {{ cleanUrl(server.url) }}
                    </span>
                    <span
                      v-if="server.battery?.backedOff"
                      class="rabta-server-table__text-5"
                      :title="`Sync cadence backed off (${server.battery.multiplier}x) for ${server.battery.label}`"
                    >
                      {{ server.battery.label }}
                    </span>
                  </div>
                  <p
                    v-if="server.online === false && server.error"
                    class="rabta-server-table__text-6"
                    :title="server.error"
                  >
                    {{ server.error }}
                  </p>
                  <p
                    v-else-if="server.nodeId"
                    class="rabta-server-table__text-7"
                    :title="server.nodeId"
                  >
                    id: {{ server.nodeId.slice(0, 10) }}…
                  </p>
                </div>
              </div>
            </td>

            <!-- Column 2: Latency / Status -->
            <td class="rabta-server-table__cell-3">
              <div class="rabta-server-table__block-6">
                <span
                  class="rabta-server-table__text-8"
                  :class="latencyColorClass(server)"
                >
                  <template v-if="server.online === null">Probing…</template>
                  <template v-else-if="!server.online">Offline</template>
                  <template v-else>{{ server.latencyMs != null ? `${server.latencyMs}ms` : '—' }}</template>
                </span>
              </div>
            </td>

            <!-- Column 3: Events on Node -->
            <td class="rabta-server-table__cell-4">
              <div class="rabta-server-table__block-7">
                <span class="rabta-server-table__text-9">
                  {{ server.userEvents != null ? server.userEvents.toLocaleString() : '0' }}
                </span>
                <span
                  v-if="server.userOurs != null || server.userInbound != null"
                  class="rabta-server-table__text-10"
                  :title="`${server.userOurs || 0} sent · ${server.userInbound || 0} received (Relay total: ${server.liveEvents || 0})`"
                >
                  {{ server.userOurs || 0 }}s · {{ server.userInbound || 0 }}r
                </span>
              </div>
            </td>

            <!-- Column 4: Storage Headroom (Desktop / Tablet) -->
            <td class="rabta-server-table__cell-5">
              <div class="rabta-server-table__block-8">
                <template v-if="server.storage?.writable === false">
                  <span class="rabta-server-table__text-read-only">
                    Read-only
                  </span>
                </template>
                <template v-else-if="server.storage">
                  {{ formatBytes(server.storage.remainingBytes) }}
                </template>
                <template v-else>
                  <span class="rabta-server-table__text-11">—</span>
                </template>
              </div>
            </td>

            <!-- Column 5: Action (Touch target min 44px) -->
            <td class="rabta-server-table__cell-6">
              <div class="rabta-server-table__block-9">
                <button
                  v-if="!isDefaultServer(server.url)"
                  type="button"
                  class="rabta-server-table__button-remove-server"
                  title="Remove server node"
                  aria-label="Remove server node"
                  @click="emit('remove', server.url)"
                >
                  <Trash2 class="rabta-server-table__trash2" :stroke-width="1.8" />
                </button>
                <span
                  v-else
                  class="rabta-server-table__text-default-core"
                  title="Default core mesh node"
                >
                  <span class="rabta-server-table__text-core">
                    core
                  </span>
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.rabta-server-table__row-2:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.rabta-server-table__button-remove-server:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.rabta-server-table__row-2:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-800) 30%,transparent);
}
}
}

@media (hover:hover) {
.rabta-server-table__button-remove-server:hover {
  color: var(--color-red-400);
}
}

@media (min-width:40rem) {
.rabta-server-table__cell-headroom {
  display: table-cell;
}
}

@media (min-width:40rem) {
.rabta-server-table__cell-5 {
  display: table-cell;
}
}

@media (min-width:40rem) {
.rabta-server-table__col-4 {
  display: table-column;
}
}

@media (min-width:40rem) {
.rabta-server-table__col-5 {
  width: 10%;
}
}

@media (min-width:40rem) {
.rabta-server-table__col-4 {
  width: 15%;
}
}

@media (min-width:40rem) {
.rabta-server-table__col-2 {
  width: 20%;
}
}

@media (min-width:40rem) {
.rabta-server-table__col-3 {
  width: 20%;
}
}

@media (min-width:40rem) {
.rabta-server-table__col {
  width: 35%;
}
}

@media (min-width:40rem) {
.rabta-server-table__cell-events {
  text-align: left;
}
}

@media (min-width:40rem) {
.rabta-server-table__cell-4 {
  text-align: left;
}
}

@layer gupt-components {
.rabta-server-table__text-actions {
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  position: absolute;
  overflow: hidden;
}
.rabta-server-table__text-2 {
  position: absolute;
}
.rabta-server-table__text {
  position: relative;
}
.rabta-server-table__text-3 {
  position: relative;
}
.rabta-server-table__text-10 {
  display: block;
}
.rabta-server-table__block-3 {
  display: flex;
}
.rabta-server-table__text {
  display: flex;
}
.rabta-server-table__block-5 {
  display: flex;
}
.rabta-server-table__block-9 {
  display: flex;
}
.rabta-server-table__col-4 {
  display: none;
}
.rabta-server-table__cell-headroom {
  display: none;
}
.rabta-server-table__cell-5 {
  display: none;
}
.rabta-server-table__text-2 {
  display: inline-flex;
}
.rabta-server-table__text-3 {
  display: inline-flex;
}
.rabta-server-table__button-remove-server {
  display: inline-flex;
}
.rabta-server-table__text-default-core {
  display: inline-flex;
}
.rabta-server-table__text {
  height: calc(var(--spacing) * 2);
}
.rabta-server-table__text-3 {
  height: calc(var(--spacing) * 2);
}
.rabta-server-table__trash2 {
  height: calc(var(--spacing) * 3.5);
}
.rabta-server-table__text-2 {
  height: 100%;
}
.rabta-server-table__button-remove-server {
  min-height: 44px;
}
.rabta-server-table__text-default-core {
  min-height: 44px;
}
.rabta-server-table__text {
  width: calc(var(--spacing) * 2);
}
.rabta-server-table__text-3 {
  width: calc(var(--spacing) * 2);
}
.rabta-server-table__trash2 {
  width: calc(var(--spacing) * 3.5);
}
.rabta-server-table__col-2 {
  width: 25%;
}
.rabta-server-table__col-3 {
  width: 30%;
}
.rabta-server-table__col-5 {
  width: 44px;
}
.rabta-server-table__col {
  width: 45%;
}
.rabta-server-table__block-2 {
  width: 100%;
}
.rabta-server-table__table {
  width: 100%;
}
.rabta-server-table__text-2 {
  width: 100%;
}
.rabta-server-table__block-3 {
  min-width: 0;
}
.rabta-server-table__block-4 {
  min-width: 0;
}
.rabta-server-table__button-remove-server {
  min-width: 44px;
}
.rabta-server-table__text-default-core {
  min-width: 44px;
}
.rabta-server-table__text {
  flex-shrink: 0;
}
.rabta-server-table__text-5 {
  flex-shrink: 0;
}
.rabta-server-table__table {
  table-layout: fixed;
}
.rabta-server-table__text-2 {
  animation: var(--animate-ping);
}
.rabta-server-table__text--pulse {
  animation: var(--animate-pulse);
}
.rabta-server-table__button-remove-server {
  cursor: pointer;
}
.rabta-server-table__block-3 {
  align-items: center;
}
.rabta-server-table__block-5 {
  align-items: center;
}
.rabta-server-table__block-9 {
  align-items: center;
}
.rabta-server-table__button-remove-server {
  align-items: center;
}
.rabta-server-table__text-default-core {
  align-items: center;
}
.rabta-server-table__button-remove-server {
  justify-content: center;
}
.rabta-server-table__text-default-core {
  justify-content: center;
}
.rabta-server-table__block-9 {
  justify-content: flex-end;
}
.rabta-server-table__block-5 {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-server-table__block-3 {
  gap: calc(var(--spacing) * 2);
}
:where(.rabta-server-table__body>:not(:last-child)) {
  --divide-y-reverse: 0;
  border-bottom-style: var(--border-style,solid);
  border-top-style: var(--border-style,solid);
  border-top-width: calc(1px * 0);
  border-bottom-width: calc(1px * calc(1 - 0));
}
:where(.rabta-server-table__body>:not(:last-child)) {
  border-color: var(--ui-zinc-800);
}
.rabta-server-table__block-4 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-table__block-5 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-table__text-4 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-table__text-6 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-table__text-7 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-table__block-6 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-table__block-7 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-table__text-10 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-table__block-8 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-table__block {
  overflow: hidden;
}
.rabta-server-table__text-5 {
  border-radius: .25rem;
}
.rabta-server-table__text-read-only {
  border-radius: .25rem;
}
.rabta-server-table__text-core {
  border-radius: .25rem;
}
.rabta-server-table__text-2 {
  border-radius: 3.40282e38px;
}
.rabta-server-table__text-3 {
  border-radius: 3.40282e38px;
}
.rabta-server-table__button-remove-server {
  border-radius: var(--radius-lg);
}
.rabta-server-table__block {
  border-radius: var(--radius-xl);
}
.rabta-server-table__block {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-server-table__text-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-server-table__text-read-only {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-server-table__row {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.rabta-server-table__text-read-only {
  border-color: #f99c0033;
}
.rabta-server-table__text-5 {
  border-color: #f99c0040;
}
.rabta-server-table__block {
  border-color: var(--app-border-quiet);
}
.rabta-server-table__row {
  border-color: var(--app-border-quiet);
}
.rabta-server-table__text-5 {
  background-color: var(--app-warning-soft);
}
.rabta-server-table__text-read-only {
  background-color: var(--app-warning-soft);
}
.rabta-server-table__text-2 {
  background-color: var(--color-emerald-400);
}
.rabta-server-table__text--success {
  background-color: var(--color-emerald-400);
}
.rabta-server-table__text--danger {
  background-color: var(--color-red-400);
}
.rabta-server-table__text--pulse {
  background-color: var(--ui-zinc-500);
}
.rabta-server-table__text-core {
  background-color: var(--app-surface-raised-tint-soft);
}
.rabta-server-table__block {
  background-color: var(--app-surface-tint-soft);
}
.rabta-server-table__row {
  background-color: var(--ui-zinc-950);
}
.rabta-server-table__text-5 {
  padding-inline: var(--spacing);
}
.rabta-server-table__text-read-only {
  padding-inline: calc(var(--spacing) * 1.5);
}
.rabta-server-table__text-core {
  padding-inline: calc(var(--spacing) * 1.5);
}
.rabta-server-table__cell-latency {
  padding-inline: calc(var(--spacing) * 2);
}
.rabta-server-table__cell-events {
  padding-inline: calc(var(--spacing) * 2);
}
.rabta-server-table__cell-headroom {
  padding-inline: calc(var(--spacing) * 2);
}
.rabta-server-table__cell-3 {
  padding-inline: calc(var(--spacing) * 2);
}
.rabta-server-table__cell-4 {
  padding-inline: calc(var(--spacing) * 2);
}
.rabta-server-table__cell-5 {
  padding-inline: calc(var(--spacing) * 2);
}
.rabta-server-table__text-5 {
  padding-block: calc(var(--spacing) * .5);
}
.rabta-server-table__text-read-only {
  padding-block: calc(var(--spacing) * .5);
}
.rabta-server-table__text-core {
  padding-block: calc(var(--spacing) * .5);
}
.rabta-server-table__cell-6 {
  padding-block: var(--spacing);
}
.rabta-server-table__cell-node {
  padding-block: calc(var(--spacing) * 2.5);
}
.rabta-server-table__cell-latency {
  padding-block: calc(var(--spacing) * 2.5);
}
.rabta-server-table__cell-events {
  padding-block: calc(var(--spacing) * 2.5);
}
.rabta-server-table__cell-headroom {
  padding-block: calc(var(--spacing) * 2.5);
}
.rabta-server-table__cell {
  padding-block: calc(var(--spacing) * 2.5);
}
.rabta-server-table__cell-2 {
  padding-block: calc(var(--spacing) * 3);
}
.rabta-server-table__cell-3 {
  padding-block: calc(var(--spacing) * 3);
}
.rabta-server-table__cell-4 {
  padding-block: calc(var(--spacing) * 3);
}
.rabta-server-table__cell-5 {
  padding-block: calc(var(--spacing) * 3);
}
.rabta-server-table__cell-node {
  padding-right: calc(var(--spacing) * 2);
}
.rabta-server-table__cell-2 {
  padding-right: calc(var(--spacing) * 2);
}
.rabta-server-table__cell {
  padding-right: calc(var(--spacing) * 3);
}
.rabta-server-table__cell-6 {
  padding-right: calc(var(--spacing) * 3);
}
.rabta-server-table__cell {
  padding-left: var(--spacing);
}
.rabta-server-table__cell-6 {
  padding-left: var(--spacing);
}
.rabta-server-table__cell-node {
  padding-left: calc(var(--spacing) * 3.5);
}
.rabta-server-table__cell-2 {
  padding-left: calc(var(--spacing) * 3.5);
}
.rabta-server-table__table {
  text-align: left;
}
.rabta-server-table__cell-events {
  text-align: right;
}
.rabta-server-table__cell {
  text-align: right;
}
.rabta-server-table__cell-4 {
  text-align: right;
}
.rabta-server-table__cell-6 {
  text-align: right;
}
.rabta-server-table__cell-2 {
  vertical-align: middle;
}
.rabta-server-table__cell-3 {
  vertical-align: middle;
}
.rabta-server-table__cell-4 {
  vertical-align: middle;
}
.rabta-server-table__cell-5 {
  vertical-align: middle;
}
.rabta-server-table__cell-6 {
  vertical-align: middle;
}
.rabta-server-table__table {
  font-family: var(--font-mono);
}
.rabta-server-table__text-4 {
  font-family: var(--font-mono);
}
.rabta-server-table__text-5 {
  font-family: var(--font-mono);
}
.rabta-server-table__text-6 {
  font-family: var(--font-mono);
}
.rabta-server-table__text-7 {
  font-family: var(--font-mono);
}
.rabta-server-table__text-8 {
  font-family: var(--font-mono);
}
.rabta-server-table__text-9 {
  font-family: var(--font-mono);
}
.rabta-server-table__text-10 {
  font-family: var(--font-mono);
}
.rabta-server-table__block-8 {
  font-family: var(--font-mono);
}
.rabta-server-table__text-core {
  font-family: var(--font-mono);
}
.rabta-server-table__table {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-server-table__text-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-server-table__text-8 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-server-table__text-9 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-server-table__block-8 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-server-table__text-5 {
  font-size: 9px;
}
.rabta-server-table__text-10 {
  font-size: 9px;
}
.rabta-server-table__text-core {
  font-size: 9px;
}
.rabta-server-table__row {
  font-size: 10px;
}
.rabta-server-table__text-6 {
  font-size: 10px;
}
.rabta-server-table__text-7 {
  font-size: 10px;
}
.rabta-server-table__text-read-only {
  font-size: 10px;
}
.rabta-server-table__text-9 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.rabta-server-table__cell-node {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-server-table__cell-latency {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-server-table__cell-events {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-server-table__cell-headroom {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-server-table__cell {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-server-table__text-5 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-server-table__text-4 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-server-table__success {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-server-table__warning {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-server-table__danger-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-server-table__row {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.rabta-server-table__text-5 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.rabta-server-table__text-core {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.rabta-server-table__text-5 {
  color: var(--color-amber-400);
}
.rabta-server-table__text-read-only {
  color: var(--color-amber-400);
}
.rabta-server-table__warning {
  color: var(--color-amber-400);
}
.rabta-server-table__text-9 {
  color: var(--color-emerald-400);
}
.rabta-server-table__success {
  color: var(--color-emerald-400);
}
.rabta-server-table__danger {
  color: var(--color-red-400);
}
.rabta-server-table__danger-2 {
  color: var(--color-red-400);
}
.rabta-server-table__text-6 {
  color: #ff6568e6;
}
.rabta-server-table__text-4 {
  color: var(--ui-zinc-100);
}
.rabta-server-table__block-8 {
  color: var(--ui-zinc-300);
}
.rabta-server-table__row {
  color: var(--ui-zinc-500);
}
.rabta-server-table__text-7 {
  color: var(--ui-zinc-500);
}
.rabta-server-table__text-10 {
  color: var(--ui-zinc-500);
}
.rabta-server-table__button-remove-server {
  color: var(--ui-zinc-500);
}
.rabta-server-table__text-core {
  color: var(--ui-zinc-500);
}
.rabta-server-table__muted {
  color: var(--ui-zinc-500);
}
.rabta-server-table__text-11 {
  color: var(--ui-zinc-600);
}
.rabta-server-table__text-default-core {
  color: var(--ui-zinc-600);
}
.rabta-server-table__row {
  text-transform: uppercase;
}
.rabta-server-table__text-5 {
  text-transform: uppercase;
}
.rabta-server-table__text-core {
  text-transform: uppercase;
}
.rabta-server-table__block-6 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-server-table__block-7 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-server-table__block-8 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-server-table__text-2 {
  opacity: .6;
}
.rabta-server-table__block {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.rabta-server-table__block {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-server-table__row-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-server-table__button-remove-server {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-server-table__row-2 {
  --duration: .15s;
  transition-duration: .15s;
}
.rabta-server-table__block {
  --duration: .2s;
  transition-duration: .2s;
}
.rabta-server-table__row {
  -webkit-user-select: none;
  user-select: none;
}
.rabta-server-table__text-default-core {
  -webkit-user-select: none;
  user-select: none;
}
.rabta-server-table__button-remove-server:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
[data-theme="light"] .rabta-server-table__text-5 {
  color: var(--app-warning);
}
[data-theme="light"] .rabta-server-table__text-read-only {
  color: var(--app-warning);
}
[data-theme="light"] .rabta-server-table__warning {
  color: var(--app-warning);
}
[data-theme="light"] .rabta-server-table__text-9 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-server-table__success {
  color: var(--app-success);
}
[data-theme="light"] .rabta-server-table__danger {
  color: var(--app-danger);
}
[data-theme="light"] .rabta-server-table__danger-2 {
  color: var(--app-danger);
}
[data-theme="light"] .rabta-server-table__block-8 {
  color: var(--app-text-soft);
}
[data-theme="light"] .rabta-server-table__row {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-table__text-7 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-table__text-10 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-table__button-remove-server {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-table__text-core {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-table__muted {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-table__text-11 {
  color: var(--app-text-soft);
}
[data-theme="light"] .rabta-server-table__text-default-core {
  color: var(--app-text-soft);
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
:where(.rabta-server-table__body>:not(:last-child)) {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 50%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-server-table__text-read-only {
  border-color: color-mix(in oklab,var(--color-amber-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-server-table__text-5 {
  border-color: color-mix(in oklab,var(--color-amber-500) 25%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-server-table__row {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 50%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-server-table__text-6 {
  color: color-mix(in oklab,var(--color-red-400) 90%,transparent);
}
}
}
</style>
