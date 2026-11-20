<script setup>
import { computed } from "vue";
import { Server, Activity, Database, HardDrive, Trash2 } from "@/icons";

const props = defineProps({
  server: {
    type: Object,
    required: true,
  },
  canRemove: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["remove"]);

const formattedLatency = computed(() => {
  if (!props.server.online || props.server.latencyMs == null) return "—";
  return `${props.server.latencyMs}ms`;
});

const latencyColorClass = computed(() => {
  if (!props.server.online) return "rabta-server-card__muted";
  const ms = props.server.latencyMs;
  if (ms < 120) return "rabta-server-card__success";
  if (ms < 300) return "rabta-server-card__warning";
  return "rabta-server-card__danger";
});

const cleanUrl = computed(() => {
  return String(props.server.url || "").replace(/^https?:\/\//i, "");
});

function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) return "Unlimited";
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${val} ${units[i]}`;
}
</script>

<template>
  <div
    class="rabta-server-card__block"
  >
    <!-- Top row: Status & URL -->
    <div class="rabta-server-card__block-2">
      <div class="rabta-server-card__block-3">
        <span class="rabta-server-card__text">
          <span
            v-if="server.online"
            class="rabta-server-card__text-2"
          />
          <span
            class="rabta-server-card__text-3"
            :class="server.online ? 'rabta-server-card__text--success' : 'rabta-server-card__text--danger'"
          />
        </span>
        <div class="rabta-server-card__block-4">
          <p class="rabta-server-card__text-4" :title="server.url">
            {{ cleanUrl }}
          </p>
          <p
            v-if="server.nodeId"
            class="rabta-server-card__text-5"
            :title="server.nodeId"
          >
            id: {{ server.nodeId.slice(0, 16) }}…
          </p>
        </div>
      </div>

      <div class="rabta-server-card__block-5">
        <span
          v-if="server.battery?.backedOff"
          class="rabta-server-card__text-6"
          :title="`Sync cadence backed off (${server.battery.multiplier}x): relay is in ${server.battery.label} mode (${server.battery.level}%)`"
        >
          {{ server.battery.label }} ({{ server.battery.multiplier }}x)
        </span>
        <span
          v-else-if="server.online && server.battery && server.battery.level < 100"
          class="rabta-server-card__text-7"
          :title="`Relay battery level: ${server.battery.level}%`"
        >
          {{ server.battery.level }}%
        </span>

        <span
          class="rabta-server-card__text-8"
          :class="
            server.online
              ? 'rabta-server-card__text--success-2'
              : 'rabta-server-card__text--danger-2'
          "
        >
          {{ server.online ? "Online" : "Offline" }}
        </span>

        <button
          v-if="canRemove"
          type="button"
          class="rabta-server-card__button-remove-server"
          title="Remove server"
          aria-label="Remove server"
          @click="emit('remove', server.url)"
        >
          <Trash2 class="rabta-server-card__trash2" :stroke-width="1.8" />
        </button>
      </div>
    </div>

    <!-- Error message if offline -->
    <div
      v-if="!server.online && server.error"
      class="rabta-server-card__block-6"
      :title="server.error"
    >
      {{ server.error }}
    </div>

    <!-- Telemetry Stats -->
    <div class="rabta-server-card__block-7">
      <!-- Latency -->
      <div>
        <span class="rabta-server-card__text-latency">
          <Activity class="rabta-server-card__activity" :stroke-width="1.8" />
          Latency
        </span>
        <p class="rabta-server-card__text-9" :class="latencyColorClass">
          {{ formattedLatency }}
        </p>
      </div>

      <!-- Our Events on Relay -->
      <div>
        <span class="rabta-server-card__text-our-events">
          <Database class="rabta-server-card__database" :stroke-width="1.8" />
          Our Events
        </span>
        <p class="rabta-server-card__text-10">
          {{ server.userEvents != null ? server.userEvents.toLocaleString() : "0" }}
        </p>
        <span
          v-if="server.userOurs != null || server.userInbound != null"
          class="rabta-server-card__text-11"
          :title="`${server.userOurs || 0} sent · ${server.userInbound || 0} received (Relay global total: ${server.liveEvents || 0})`"
        >
          {{ server.userOurs || 0 }}s · {{ server.userInbound || 0 }}r
        </span>
      </div>

      <!-- Live Blobs -->
      <div>
        <span class="rabta-server-card__text-blobs">
          <HardDrive class="rabta-server-card__hard-drive" :stroke-width="1.8" />
          Blobs
        </span>
        <p class="rabta-server-card__text-12">
          {{ server.liveBlobs != null ? server.liveBlobs.toLocaleString() : "—" }}
        </p>
        <span
          v-if="server.liveEvents != null"
          class="rabta-server-card__text-all"
          :title="`Total public events stored across all users on this relay`"
        >
          all {{ server.liveEvents.toLocaleString() }}
        </span>
      </div>
    </div>

    <!-- Storage Capacity & Quota Limits -->
    <div
      v-if="server.storage"
      class="rabta-server-card__block-8"
    >
      <div class="rabta-server-card__block-9">
        <span
          class="rabta-server-card__text-13"
          :class="server.storage.writable ? 'rabta-server-card__text--success-3' : 'rabta-server-card__text--warning'"
        />
        <span class="rabta-server-card__text-14">
          {{ server.storage.writable ? "Headroom:" : "Read-Only Relay" }}
        </span>
        <span v-if="server.storage.writable" class="rabta-server-card__text-15">
          {{ formatBytes(server.storage.remainingBytes) }}
        </span>
      </div>

      <div class="rabta-server-card__block-10">
        <span
          v-if="server.battery?.backedOff && server.battery.activeThisRound === false"
          class="rabta-server-card__text-skipped-this"
          title="Skipped this bisection round to conserve relay battery"
        >
          cadence skip
        </span>
        <span
          v-if="server.storage.maxSingleBytes && Number.isFinite(server.storage.maxSingleBytes)"
          title="Max single blob size allowed"
        >
          cap {{ formatBytes(server.storage.maxSingleBytes) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.rabta-server-card__block:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.rabta-server-card__block:hover {
  border-color: color-mix(in oklab,var(--ui-zinc-700) 80%,transparent);
}
}
}

@media (hover:hover) {
.rabta-server-card__button-remove-server:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.rabta-server-card__block:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.rabta-server-card__block:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 80%,transparent);
}
}
}

@media (hover:hover) {
.rabta-server-card__button-remove-server:hover {
  color: var(--color-red-400);
}
}

@layer gupt-components {
.rabta-server-card__text-2 {
  position: absolute;
}
.rabta-server-card__block {
  position: relative;
}
.rabta-server-card__text {
  position: relative;
}
.rabta-server-card__text-3 {
  position: relative;
}
.rabta-server-card__text-9 {
  margin-top: calc(var(--spacing) * .5);
}
.rabta-server-card__text-10 {
  margin-top: calc(var(--spacing) * .5);
}
.rabta-server-card__text-12 {
  margin-top: calc(var(--spacing) * .5);
}
.rabta-server-card__block-6 {
  margin-top: calc(var(--spacing) * 2.5);
}
.rabta-server-card__block-8 {
  margin-top: calc(var(--spacing) * 3);
}
.rabta-server-card__block-7 {
  margin-top: calc(var(--spacing) * 3.5);
}
.rabta-server-card__text-11 {
  display: block;
}
.rabta-server-card__text-all {
  display: block;
}
.rabta-server-card__block {
  display: flex;
}
.rabta-server-card__block-2 {
  display: flex;
}
.rabta-server-card__block-3 {
  display: flex;
}
.rabta-server-card__text {
  display: flex;
}
.rabta-server-card__block-5 {
  display: flex;
}
.rabta-server-card__text-latency {
  display: flex;
}
.rabta-server-card__text-our-events {
  display: flex;
}
.rabta-server-card__text-blobs {
  display: flex;
}
.rabta-server-card__block-8 {
  display: flex;
}
.rabta-server-card__block-9 {
  display: flex;
}
.rabta-server-card__block-10 {
  display: flex;
}
.rabta-server-card__block-7 {
  display: grid;
}
.rabta-server-card__text-13 {
  display: inline-block;
}
.rabta-server-card__text-2 {
  display: inline-flex;
}
.rabta-server-card__text-3 {
  display: inline-flex;
}
.rabta-server-card__button-remove-server {
  display: inline-flex;
}
.rabta-server-card__text-13 {
  height: calc(var(--spacing) * 1.5);
}
.rabta-server-card__text {
  height: calc(var(--spacing) * 2.5);
}
.rabta-server-card__text-3 {
  height: calc(var(--spacing) * 2.5);
}
.rabta-server-card__activity {
  height: calc(var(--spacing) * 3);
}
.rabta-server-card__database {
  height: calc(var(--spacing) * 3);
}
.rabta-server-card__hard-drive {
  height: calc(var(--spacing) * 3);
}
.rabta-server-card__trash2 {
  height: calc(var(--spacing) * 3.5);
}
.rabta-server-card__button-remove-server {
  height: calc(var(--spacing) * 7);
}
.rabta-server-card__text-2 {
  height: 100%;
}
.rabta-server-card__text-13 {
  width: calc(var(--spacing) * 1.5);
}
.rabta-server-card__text {
  width: calc(var(--spacing) * 2.5);
}
.rabta-server-card__text-3 {
  width: calc(var(--spacing) * 2.5);
}
.rabta-server-card__activity {
  width: calc(var(--spacing) * 3);
}
.rabta-server-card__database {
  width: calc(var(--spacing) * 3);
}
.rabta-server-card__hard-drive {
  width: calc(var(--spacing) * 3);
}
.rabta-server-card__trash2 {
  width: calc(var(--spacing) * 3.5);
}
.rabta-server-card__button-remove-server {
  width: calc(var(--spacing) * 7);
}
.rabta-server-card__text-2 {
  width: 100%;
}
.rabta-server-card__block-3 {
  min-width: 0;
}
.rabta-server-card__block-4 {
  min-width: 0;
}
.rabta-server-card__block-9 {
  min-width: 0;
}
.rabta-server-card__text {
  flex-shrink: 0;
}
.rabta-server-card__text-13 {
  flex-shrink: 0;
}
.rabta-server-card__block-10 {
  flex-shrink: 0;
}
.rabta-server-card__text-2 {
  animation: var(--animate-ping);
}
.rabta-server-card__button-remove-server {
  cursor: pointer;
}
.rabta-server-card__block-7 {
  grid-template-columns: repeat(3,minmax(0,1fr));
}
.rabta-server-card__block {
  flex-direction: column;
}
.rabta-server-card__block-3 {
  align-items: center;
}
.rabta-server-card__block-5 {
  align-items: center;
}
.rabta-server-card__button-remove-server {
  align-items: center;
}
.rabta-server-card__text-latency {
  align-items: center;
}
.rabta-server-card__text-our-events {
  align-items: center;
}
.rabta-server-card__text-blobs {
  align-items: center;
}
.rabta-server-card__block-8 {
  align-items: center;
}
.rabta-server-card__block-9 {
  align-items: center;
}
.rabta-server-card__block-10 {
  align-items: center;
}
.rabta-server-card__block-2 {
  align-items: flex-start;
}
.rabta-server-card__block {
  justify-content: space-between;
}
.rabta-server-card__block-2 {
  justify-content: space-between;
}
.rabta-server-card__block-8 {
  justify-content: space-between;
}
.rabta-server-card__button-remove-server {
  justify-content: center;
}
.rabta-server-card__block-5 {
  gap: var(--spacing);
}
.rabta-server-card__text-latency {
  gap: var(--spacing);
}
.rabta-server-card__text-our-events {
  gap: var(--spacing);
}
.rabta-server-card__text-blobs {
  gap: var(--spacing);
}
.rabta-server-card__block-9 {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-server-card__block-10 {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-server-card__block-2 {
  gap: calc(var(--spacing) * 2);
}
.rabta-server-card__block-3 {
  gap: calc(var(--spacing) * 2);
}
.rabta-server-card__block-7 {
  gap: calc(var(--spacing) * 2);
}
.rabta-server-card__block-8 {
  gap: calc(var(--spacing) * 2);
}
.rabta-server-card__text-4 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-card__text-5 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-card__block-6 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-card__text-11 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-card__text-all {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-card__text-14 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-card__text-15 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-server-card__text-6 {
  border-radius: .25rem;
}
.rabta-server-card__text-7 {
  border-radius: .25rem;
}
.rabta-server-card__text-8 {
  border-radius: .25rem;
}
.rabta-server-card__button-remove-server {
  border-radius: .25rem;
}
.rabta-server-card__block-6 {
  border-radius: .25rem;
}
.rabta-server-card__text-2 {
  border-radius: 3.40282e38px;
}
.rabta-server-card__text-3 {
  border-radius: 3.40282e38px;
}
.rabta-server-card__text-13 {
  border-radius: 3.40282e38px;
}
.rabta-server-card__block {
  border-radius: var(--radius-xl);
}
.rabta-server-card__block {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-server-card__text-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-server-card__text-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-server-card__text--success-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-server-card__text--danger-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.rabta-server-card__block-7 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.rabta-server-card__block-8 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.rabta-server-card__text-6 {
  border-color: #f99c0040;
}
.rabta-server-card__text--success-2 {
  border-color: #00bb7f33;
}
.rabta-server-card__text--danger-2 {
  border-color: #fb2c3633;
}
.rabta-server-card__text-7 {
  border-color: var(--ui-zinc-700);
}
.rabta-server-card__block-8 {
  border-color: var(--ui-zinc-800);
}
.rabta-server-card__block-7 {
  border-color: var(--app-border-faint);
}
.rabta-server-card__block {
  border-color: var(--app-border-quiet);
}
.rabta-server-card__text--warning {
  background-color: var(--color-amber-400);
}
.rabta-server-card__text-6 {
  background-color: var(--app-warning-soft);
}
.rabta-server-card__text-2 {
  background-color: var(--color-emerald-400);
}
.rabta-server-card__text--success {
  background-color: var(--color-emerald-400);
}
.rabta-server-card__text--success-3 {
  background-color: var(--color-emerald-400);
}
.rabta-server-card__text--success-2 {
  background-color: #00bb7f1a;
}
.rabta-server-card__text--danger {
  background-color: var(--color-red-400);
}
.rabta-server-card__text--danger-2 {
  background-color: var(--app-danger-soft);
}
.rabta-server-card__block-6 {
  background-color: var(--app-danger-soft);
}
.rabta-server-card__text-7 {
  background-color: var(--ui-zinc-800);
}
.rabta-server-card__block {
  background-color: var(--ui-zinc-900);
}
.rabta-server-card__block {
  padding: calc(var(--spacing) * 4);
}
.rabta-server-card__text-6 {
  padding-inline: calc(var(--spacing) * 1.5);
}
.rabta-server-card__text-7 {
  padding-inline: calc(var(--spacing) * 1.5);
}
.rabta-server-card__text-8 {
  padding-inline: calc(var(--spacing) * 1.5);
}
.rabta-server-card__block-6 {
  padding-inline: calc(var(--spacing) * 2);
}
.rabta-server-card__text-6 {
  padding-block: calc(var(--spacing) * .5);
}
.rabta-server-card__text-7 {
  padding-block: calc(var(--spacing) * .5);
}
.rabta-server-card__text-8 {
  padding-block: calc(var(--spacing) * .5);
}
.rabta-server-card__block-6 {
  padding-block: var(--spacing);
}
.rabta-server-card__block-8 {
  padding-top: calc(var(--spacing) * 2.5);
}
.rabta-server-card__block-7 {
  padding-top: calc(var(--spacing) * 3);
}
.rabta-server-card__text-4 {
  font-family: var(--font-mono);
}
.rabta-server-card__text-5 {
  font-family: var(--font-mono);
}
.rabta-server-card__text-6 {
  font-family: var(--font-mono);
}
.rabta-server-card__text-7 {
  font-family: var(--font-mono);
}
.rabta-server-card__text-8 {
  font-family: var(--font-mono);
}
.rabta-server-card__block-6 {
  font-family: var(--font-mono);
}
.rabta-server-card__text-latency {
  font-family: var(--font-mono);
}
.rabta-server-card__text-9 {
  font-family: var(--font-mono);
}
.rabta-server-card__text-our-events {
  font-family: var(--font-mono);
}
.rabta-server-card__text-10 {
  font-family: var(--font-mono);
}
.rabta-server-card__text-11 {
  font-family: var(--font-mono);
}
.rabta-server-card__text-blobs {
  font-family: var(--font-mono);
}
.rabta-server-card__text-12 {
  font-family: var(--font-mono);
}
.rabta-server-card__text-all {
  font-family: var(--font-mono);
}
.rabta-server-card__block-8 {
  font-family: var(--font-mono);
}
.rabta-server-card__text-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-server-card__text-9 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-server-card__text-10 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-server-card__text-12 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.rabta-server-card__text-6 {
  font-size: 9px;
}
.rabta-server-card__text-7 {
  font-size: 9px;
}
.rabta-server-card__text-8 {
  font-size: 9px;
}
.rabta-server-card__text-11 {
  font-size: 9px;
}
.rabta-server-card__text-all {
  font-size: 9px;
}
.rabta-server-card__block-10 {
  font-size: 9px;
}
.rabta-server-card__text-5 {
  font-size: 10px;
}
.rabta-server-card__block-6 {
  font-size: 10px;
}
.rabta-server-card__text-latency {
  font-size: 10px;
}
.rabta-server-card__text-our-events {
  font-size: 10px;
}
.rabta-server-card__text-blobs {
  font-size: 10px;
}
.rabta-server-card__block-8 {
  font-size: 10px;
}
.rabta-server-card__text-10 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.rabta-server-card__text-6 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-server-card__text-7 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-server-card__text-8 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-server-card__text-our-events {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-server-card__text-skipped-this {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-server-card__text-4 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-server-card__text-9 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-server-card__text-12 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-server-card__text-15 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.rabta-server-card__text-6 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.rabta-server-card__text-7 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.rabta-server-card__text-8 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.rabta-server-card__text-6 {
  color: var(--color-amber-400);
}
.rabta-server-card__warning {
  color: var(--color-amber-400);
}
.rabta-server-card__text-skipped-this {
  color: #fcbb00e6;
}
.rabta-server-card__text--success-2 {
  color: var(--color-emerald-400);
}
.rabta-server-card__database {
  color: var(--color-emerald-400);
}
.rabta-server-card__text-10 {
  color: var(--color-emerald-400);
}
.rabta-server-card__success {
  color: var(--color-emerald-400);
}
.rabta-server-card__text-our-events {
  color: #00d294e6;
}
.rabta-server-card__text--danger-2 {
  color: var(--color-red-400);
}
.rabta-server-card__block-6 {
  color: var(--color-red-400);
}
.rabta-server-card__danger {
  color: var(--color-red-400);
}
.rabta-server-card__text-4 {
  color: var(--ui-zinc-100);
}
.rabta-server-card__text-12 {
  color: var(--ui-zinc-200);
}
.rabta-server-card__text-15 {
  color: var(--ui-zinc-200);
}
.rabta-server-card__text-7 {
  color: var(--ui-zinc-400);
}
.rabta-server-card__text-14 {
  color: var(--ui-zinc-400);
}
.rabta-server-card__text-5 {
  color: var(--ui-zinc-500);
}
.rabta-server-card__button-remove-server {
  color: var(--ui-zinc-500);
}
.rabta-server-card__text-latency {
  color: var(--ui-zinc-500);
}
.rabta-server-card__text-11 {
  color: var(--ui-zinc-500);
}
.rabta-server-card__text-blobs {
  color: var(--ui-zinc-500);
}
.rabta-server-card__text-all {
  color: var(--ui-zinc-500);
}
.rabta-server-card__block-10 {
  color: var(--ui-zinc-500);
}
.rabta-server-card__muted {
  color: var(--ui-zinc-600);
}
.rabta-server-card__text-6 {
  text-transform: uppercase;
}
.rabta-server-card__text-7 {
  text-transform: uppercase;
}
.rabta-server-card__text-8 {
  text-transform: uppercase;
}
.rabta-server-card__text-9 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-server-card__text-10 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-server-card__text-12 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-server-card__text-2 {
  opacity: .6;
}
.rabta-server-card__block {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-server-card__button-remove-server {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-server-card__block {
  --duration: .2s;
  transition-duration: .2s;
}
.rabta-server-card__button-remove-server:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
[data-theme="light"] .rabta-server-card__text-6 {
  color: var(--app-warning);
}
[data-theme="light"] .rabta-server-card__warning {
  color: var(--app-warning);
}
[data-theme="light"] .rabta-server-card__text--success-2 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-server-card__database {
  color: var(--app-success);
}
[data-theme="light"] .rabta-server-card__text-10 {
  color: var(--app-success);
}
[data-theme="light"] .rabta-server-card__success {
  color: var(--app-success);
}
[data-theme="light"] .rabta-server-card__text--danger-2 {
  color: var(--app-danger);
}
[data-theme="light"] .rabta-server-card__block-6 {
  color: var(--app-danger);
}
[data-theme="light"] .rabta-server-card__danger {
  color: var(--app-danger);
}
[data-theme="light"] .rabta-server-card__text-7 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-card__text-14 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-card__text-5 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-card__button-remove-server {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-card__text-latency {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-card__text-11 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-card__text-blobs {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-card__text-all {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-card__block-10 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-server-card__muted {
  color: var(--app-text-soft);
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.rabta-server-card__text-6 {
  border-color: color-mix(in oklab,var(--color-amber-500) 25%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-server-card__text--success-2 {
  border-color: color-mix(in oklab,var(--color-emerald-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-server-card__text--danger-2 {
  border-color: color-mix(in oklab,var(--color-red-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-server-card__text-7 {
  border-color: color-mix(in oklab,var(--ui-zinc-700) 50%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-server-card__block-8 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 50%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-server-card__text--success-2 {
  background-color: color-mix(in oklab,var(--color-emerald-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-server-card__text-7 {
  background-color: color-mix(in oklab,var(--ui-zinc-800) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-server-card__block {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 50%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-server-card__text-skipped-this {
  color: color-mix(in oklab,var(--color-amber-400) 90%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-server-card__text-our-events {
  color: color-mix(in oklab,var(--color-emerald-400) 90%,transparent);
}
}
}
</style>
