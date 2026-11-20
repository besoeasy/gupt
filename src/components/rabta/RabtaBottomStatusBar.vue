<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Radio, RefreshCw, ChevronRight } from "@lucide/vue";
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
    class="rabta-bottom-status-bar__aside-rabta-mesh"
    aria-label="Rabta Mesh Sync Status"
  >
    <button
      type="button"
      class="rabta-bottom-status-bar__button"
      @click="openRabtaDashboard"
      :title="`Rabta Mesh: ${rabtaSyncStore.onlineServers}/${rabtaSyncStore.totalServers} online · ${rabtaSyncStore.ourTotalEvents} events · Tap to open sync dashboard`"
    >
      <!-- Left: Status Indicator & Node Count -->
      <div class="rabta-bottom-status-bar__block">
        <span class="rabta-bottom-status-bar__text">
          <span
            v-if="rabtaSyncStore.isSyncing"
            class="rabta-bottom-status-bar__text-2"
          />
          <span
            class="rabta-bottom-status-bar__text-3"
            :class="statusDotClass"
          />
        </span>

        <span class="rabta-bottom-status-bar__text-rabta">
          Rabta
        </span>

        <span class="rabta-bottom-status-bar__text-4">·</span>

        <span class="rabta-bottom-status-bar__text-5">
          {{ rabtaSyncStore.onlineServers }}/{{ rabtaSyncStore.totalServers }}
          <span class="rabta-bottom-status-bar__text-online">online</span>
        </span>
      </div>

      <!-- Center: Events & Consistency (hidden on very small viewports, visible on md+) -->
      <div class="rabta-bottom-status-bar__block-2">
        <span class="rabta-bottom-status-bar__text-6">·</span>
        <span class="rabta-bottom-status-bar__text-our-events">
          {{ rabtaSyncStore.ourTotalEvents.toLocaleString() }} our events
        </span>
        <span class="rabta-bottom-status-bar__text-7">·</span>
        <span class="rabta-bottom-status-bar__text-8">
          {{ rabtaSyncStore.consistencyPct }}% sync
        </span>
      </div>

      <!-- Right: Sync status & Chevron link -->
      <div class="rabta-bottom-status-bar__block-3">
        <RefreshCw
          v-if="rabtaSyncStore.isSyncing"
          class="rabta-bottom-status-bar__refresh-cw"
          aria-hidden="true"
        />
        <Radio
          v-else
          class="rabta-bottom-status-bar__radio"
          aria-hidden="true"
        />

        <span class="rabta-bottom-status-bar__text-9">
          {{ statusText }}
        </span>

        <ChevronRight class="rabta-bottom-status-bar__chevron-right" />
      </div>
    </button>
  </aside>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.rabta-bottom-status-bar__aside-rabta-mesh {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-bottom-status-bar__aside-rabta-mesh {
  background-color: color-mix(in oklab,var(--ui-black) 90%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-bottom-status-bar__text-8 {
  color: color-mix(in oklab,var(--color-emerald-400) 90%,transparent);
}
}

@media (hover:hover) {
.rabta-bottom-status-bar__chevron-right:is(:where(.rabta-bottom-status-bar__button):hover *) {
  --translate-x: calc(var(--spacing) * .5);
  translate: calc(var(--spacing) * .5) var(--translate-y,0);
}
}

@media (hover:hover) {
.rabta-bottom-status-bar__text-rabta:is(:where(.rabta-bottom-status-bar__button):hover *) {
  color: var(--color-amber-300);
}
}

@media (hover:hover) {
.rabta-bottom-status-bar__radio:is(:where(.rabta-bottom-status-bar__button):hover *) {
  color: var(--color-amber-300);
}
}

@media (hover:hover) {
.rabta-bottom-status-bar__block-3:is(:where(.rabta-bottom-status-bar__button):hover *) {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.rabta-bottom-status-bar__chevron-right:is(:where(.rabta-bottom-status-bar__button):hover *) {
  color: var(--ui-zinc-400);
}
}

@media (hover:hover) {
.rabta-bottom-status-bar__button:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.rabta-bottom-status-bar__button:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 80%,transparent);
}
}
}

@media (hover:hover) {
.rabta-bottom-status-bar__button:hover {
  color: var(--ui-zinc-200);
}
}

@supports (color:color-mix(in lab,red,red)) {
.rabta-bottom-status-bar__button:active {
  background-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@media (min-width:40rem) {
.rabta-bottom-status-bar__text-online {
  display: inline;
}
}

@media (min-width:40rem) {
.rabta-bottom-status-bar__button {
  height: calc(var(--spacing) * 6.5);
}
}

@media (min-width:48rem) {
.rabta-bottom-status-bar__block-2 {
  display: flex;
}
}

@layer gupt-components {
.rabta-bottom-status-bar__text-2 {
  position: absolute;
}
.rabta-bottom-status-bar__text {
  position: relative;
}
.rabta-bottom-status-bar__text-3 {
  position: relative;
}
.rabta-bottom-status-bar__aside-rabta-mesh {
  position: sticky;
}
.rabta-bottom-status-bar__aside-rabta-mesh {
  bottom: 0;
}
.rabta-bottom-status-bar__aside-rabta-mesh {
  z-index: 30;
}
.rabta-bottom-status-bar__button {
  display: flex;
}
.rabta-bottom-status-bar__block {
  display: flex;
}
.rabta-bottom-status-bar__text {
  display: flex;
}
.rabta-bottom-status-bar__block-3 {
  display: flex;
}
.rabta-bottom-status-bar__text-online {
  display: none;
}
.rabta-bottom-status-bar__block-2 {
  display: none;
}
.rabta-bottom-status-bar__text-2 {
  display: inline-flex;
}
.rabta-bottom-status-bar__text-3 {
  display: inline-flex;
}
.rabta-bottom-status-bar__text-3 {
  height: calc(var(--spacing) * 1.5);
}
.rabta-bottom-status-bar__text {
  height: calc(var(--spacing) * 2);
}
.rabta-bottom-status-bar__refresh-cw {
  height: calc(var(--spacing) * 3);
}
.rabta-bottom-status-bar__radio {
  height: calc(var(--spacing) * 3);
}
.rabta-bottom-status-bar__chevron-right {
  height: calc(var(--spacing) * 3);
}
.rabta-bottom-status-bar__button {
  height: calc(var(--spacing) * 7);
}
.rabta-bottom-status-bar__text-2 {
  height: 100%;
}
.rabta-bottom-status-bar__text-3 {
  width: calc(var(--spacing) * 1.5);
}
.rabta-bottom-status-bar__text {
  width: calc(var(--spacing) * 2);
}
.rabta-bottom-status-bar__refresh-cw {
  width: calc(var(--spacing) * 3);
}
.rabta-bottom-status-bar__radio {
  width: calc(var(--spacing) * 3);
}
.rabta-bottom-status-bar__chevron-right {
  width: calc(var(--spacing) * 3);
}
.rabta-bottom-status-bar__aside-rabta-mesh {
  width: 100%;
}
.rabta-bottom-status-bar__button {
  width: 100%;
}
.rabta-bottom-status-bar__text-2 {
  width: 100%;
}
.rabta-bottom-status-bar__aside-rabta-mesh {
  flex-shrink: 0;
}
.rabta-bottom-status-bar__text {
  flex-shrink: 0;
}
.rabta-bottom-status-bar__block-3 {
  flex-shrink: 0;
}
.rabta-bottom-status-bar__text-2 {
  animation: var(--animate-ping);
}
.rabta-bottom-status-bar__refresh-cw {
  animation: var(--animate-spin);
}
.rabta-bottom-status-bar__button {
  cursor: pointer;
}
.rabta-bottom-status-bar__button {
  align-items: center;
}
.rabta-bottom-status-bar__block {
  align-items: center;
}
.rabta-bottom-status-bar__text {
  align-items: center;
}
.rabta-bottom-status-bar__block-2 {
  align-items: center;
}
.rabta-bottom-status-bar__block-3 {
  align-items: center;
}
.rabta-bottom-status-bar__button {
  justify-content: space-between;
}
.rabta-bottom-status-bar__text {
  justify-content: center;
}
.rabta-bottom-status-bar__block-3 {
  gap: calc(var(--spacing) * 1.5);
}
.rabta-bottom-status-bar__block {
  gap: calc(var(--spacing) * 2);
}
.rabta-bottom-status-bar__block-2 {
  gap: calc(var(--spacing) * 2);
}
.rabta-bottom-status-bar__block {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-bottom-status-bar__block-2 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.rabta-bottom-status-bar__text-2 {
  border-radius: 3.40282e38px;
}
.rabta-bottom-status-bar__text-3 {
  border-radius: 3.40282e38px;
}
.rabta-bottom-status-bar__aside-rabta-mesh {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.rabta-bottom-status-bar__aside-rabta-mesh {
  border-color: var(--ui-zinc-800);
}
.rabta-bottom-status-bar__text-2 {
  background-color: var(--color-amber-400);
}
.rabta-bottom-status-bar__warning {
  background-color: var(--color-amber-400);
}
.rabta-bottom-status-bar__aside-rabta-mesh {
  background-color: var(--ui-black);
}
.rabta-bottom-status-bar__success {
  background-color: var(--color-emerald-400);
}
.rabta-bottom-status-bar__danger {
  background-color: var(--color-red-400);
}
.rabta-bottom-status-bar__muted {
  background-color: var(--ui-zinc-500);
}
.rabta-bottom-status-bar__button {
  padding-inline: calc(var(--spacing) * 3);
}
.rabta-bottom-status-bar__aside-rabta-mesh {
  padding-bottom: env(safe-area-inset-bottom,0px);
}
.rabta-bottom-status-bar__button {
  font-family: var(--font-mono);
}
.rabta-bottom-status-bar__button {
  font-size: 11px;
}
.rabta-bottom-status-bar__button {
  --leading: 1;
  line-height: 1;
}
.rabta-bottom-status-bar__text-rabta {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-bottom-status-bar__text-8 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-bottom-status-bar__text-9 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.rabta-bottom-status-bar__refresh-cw {
  color: var(--color-amber-400);
}
.rabta-bottom-status-bar__text-8 {
  color: #00d294e6;
}
.rabta-bottom-status-bar__text-rabta {
  color: var(--ui-zinc-300);
}
.rabta-bottom-status-bar__button {
  color: var(--ui-zinc-400);
}
.rabta-bottom-status-bar__text-5 {
  color: var(--ui-zinc-400);
}
.rabta-bottom-status-bar__block-2 {
  color: var(--ui-zinc-400);
}
.rabta-bottom-status-bar__block-3 {
  color: var(--ui-zinc-400);
}
.rabta-bottom-status-bar__text-4 {
  color: var(--ui-zinc-500);
}
.rabta-bottom-status-bar__text-6 {
  color: var(--ui-zinc-500);
}
.rabta-bottom-status-bar__text-7 {
  color: var(--ui-zinc-500);
}
.rabta-bottom-status-bar__radio {
  color: var(--ui-zinc-500);
}
.rabta-bottom-status-bar__chevron-right {
  color: var(--ui-zinc-600);
}
.rabta-bottom-status-bar__text-5 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-bottom-status-bar__text-our-events {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-bottom-status-bar__text-8 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-bottom-status-bar__text-9 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.rabta-bottom-status-bar__text-2 {
  opacity: .75;
}
.rabta-bottom-status-bar__aside-rabta-mesh {
  --backdrop-blur: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
  backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
}
.rabta-bottom-status-bar__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-bottom-status-bar__aside-rabta-mesh {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-bottom-status-bar__text-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-bottom-status-bar__text-rabta {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-bottom-status-bar__block-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-bottom-status-bar__radio {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-bottom-status-bar__chevron-right {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.rabta-bottom-status-bar__button {
  --duration: .15s;
  transition-duration: .15s;
}
.rabta-bottom-status-bar__chevron-right {
  --duration: .2s;
  transition-duration: .2s;
}
.rabta-bottom-status-bar__aside-rabta-mesh {
  -webkit-user-select: none;
  user-select: none;
}
.rabta-bottom-status-bar__button:active {
  scale: .998;
}
.rabta-bottom-status-bar__button:active {
  background-color: var(--ui-zinc-800);
}
[data-theme="light"] .rabta-bottom-status-bar__refresh-cw {
  color: var(--app-warning);
}
[data-theme="light"] .rabta-bottom-status-bar__text-rabta {
  color: var(--app-text-soft);
}
[data-theme="light"] .rabta-bottom-status-bar__button {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-bottom-status-bar__text-5 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-bottom-status-bar__block-2 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-bottom-status-bar__block-3 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-bottom-status-bar__text-4 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-bottom-status-bar__text-6 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-bottom-status-bar__text-7 {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-bottom-status-bar__radio {
  color: var(--app-muted);
}
[data-theme="light"] .rabta-bottom-status-bar__chevron-right {
  color: var(--app-text-soft);
}
[data-theme="light"] .rabta-bottom-status-bar__button:hover {
  color: var(--app-text) !important;
}
}
}
</style>
