<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Radio, X } from "@lucide/vue";

import { useKnownRelays } from "@/composables/useKnownRelays";
import { RELAY_RECOMMENDED_MIN, dismissRelayNudge, shouldShowRelayNudge } from "@/lib/relayNudge";
import { useIdentityStore } from "@/stores/identity";

const SETTLE_DELAY_MS = 5000;

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const { count } = useKnownRelays();

const settled = ref(false);
const visible = ref(false);
let settleTimer = null;

const suppressedRoute = computed(
  () =>
    route.path.startsWith("/call/") ||
    route.path.startsWith("/welcome") ||
    route.path.startsWith("/settings"),
);

const shortfall = computed(() => Math.max(0, RELAY_RECOMMENDED_MIN - count.value));

function evaluate() {
  visible.value =
    settled.value &&
    identity.isReady &&
    !suppressedRoute.value &&
    shouldShowRelayNudge(count.value);
}

function dismiss() {
  dismissRelayNudge(count.value);
  visible.value = false;
}

function reviewRelays() {
  dismiss();
  void router.push({ path: "/settings", query: { focus: "relays" } });
}

watch([() => identity.isReady, count, suppressedRoute], evaluate);

onMounted(() => {
  settleTimer = setTimeout(() => {
    settled.value = true;
    evaluate();
  }, SETTLE_DELAY_MS);
});

onUnmounted(() => {
  if (settleTimer) clearTimeout(settleTimer);
});
</script>

<template>
  <Transition
    appear
    enter-active-class="relay-nudge-banner__enter-active-class"
    enter-from-class="relay-nudge-banner__enter-from-class"
    enter-to-class="relay-nudge-banner__enter-to-class"
    leave-active-class="relay-nudge-banner__leave-active-class"
    leave-from-class="relay-nudge-banner__leave-from-class"
    leave-to-class="relay-nudge-banner__leave-to-class"
  >
    <div
      v-if="visible"
      class="relay-nudge-banner__status"
      role="status"
      aria-live="polite"
    >
      <div
        class="relay-nudge-banner__block"
      >
        <span
          class="relay-nudge-banner__text"
        >
          <Radio class="relay-nudge-banner__radio" :stroke-width="2" aria-hidden="true" />
        </span>

        <div class="relay-nudge-banner__block-2">
          <p class="relay-nudge-banner__text-2">
            {{ count }} Rabta {{ count === 1 ? "relay" : "relays" }} configured
            <span class="relay-nudge-banner__text-3">·</span>
            {{ RELAY_RECOMMENDED_MIN }} recommended
          </p>
          <p class="relay-nudge-banner__text-4">
            Add {{ shortfall }} more so one failing node can't cut you off.
          </p>
        </div>

        <div class="relay-nudge-banner__block-3">
          <button
            type="button"
            class="relay-nudge-banner__button-review-relays"
            @click="reviewRelays"
          >
            Review relays
          </button>
          <button
            type="button"
            class="relay-nudge-banner__button-later"
            @click="dismiss"
          >
            Later
          </button>
          <button
            type="button"
            class="relay-nudge-banner__button-dismiss-relay"
            aria-label="Dismiss relay recommendation"
            @click="dismiss"
          >
            <X class="relay-nudge-banner__x" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.relay-nudge-banner__block {
  border-color: color-mix(in oklab,var(--color-amber-500) 25%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.relay-nudge-banner__block {
  background-color: color-mix(in oklab,var(--color-amber-500) 8%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.relay-nudge-banner__text {
  background-color: color-mix(in oklab,var(--color-amber-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.relay-nudge-banner__button-review-relays {
  background-color: color-mix(in oklab,var(--color-amber-500) 15%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.relay-nudge-banner__text-3 {
  color: color-mix(in oklab,var(--color-amber-500) 70%,transparent);
}
}

@media (hover:hover) {
.relay-nudge-banner__button-review-relays:hover {
  background-color: #f99c0040;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.relay-nudge-banner__button-review-relays:hover {
  background-color: color-mix(in oklab,var(--color-amber-500) 25%,transparent);
}
}
}

@media (hover:hover) {
.relay-nudge-banner__button-later:hover {
  background-color: #ffffff0d;
}
}

@media (hover:hover) {
.relay-nudge-banner__button-dismiss-relay:hover {
  background-color: #ffffff0d;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.relay-nudge-banner__button-later:hover {
  background-color: color-mix(in oklab,var(--color-white) 5%,transparent);
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.relay-nudge-banner__button-dismiss-relay:hover {
  background-color: color-mix(in oklab,var(--color-white) 5%,transparent);
}
}
}

@media (hover:hover) {
.relay-nudge-banner__button-later:hover {
  color: var(--ui-zinc-300);
}
}

@media (hover:hover) {
.relay-nudge-banner__button-dismiss-relay:hover {
  color: var(--ui-zinc-300);
}
}

@media (min-width:40rem) {
.relay-nudge-banner__button-dismiss-relay {
  height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.relay-nudge-banner__button-review-relays {
  min-height: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.relay-nudge-banner__button-later {
  min-height: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.relay-nudge-banner__status {
  margin-inline: auto;
}
.relay-nudge-banner__block {
  display: flex;
}
.relay-nudge-banner__text {
  display: flex;
}
.relay-nudge-banner__block-3 {
  display: flex;
}
.relay-nudge-banner__button-review-relays {
  display: inline-flex;
}
.relay-nudge-banner__button-later {
  display: inline-flex;
}
.relay-nudge-banner__button-dismiss-relay {
  display: inline-flex;
}
.relay-nudge-banner__radio {
  height: calc(var(--spacing) * 3.5);
}
.relay-nudge-banner__x {
  height: calc(var(--spacing) * 3.5);
}
.relay-nudge-banner__text {
  height: calc(var(--spacing) * 6);
}
.relay-nudge-banner__button-dismiss-relay {
  height: calc(var(--spacing) * 11);
}
.relay-nudge-banner__button-review-relays {
  min-height: calc(var(--spacing) * 11);
}
.relay-nudge-banner__button-later {
  min-height: calc(var(--spacing) * 11);
}
.relay-nudge-banner__radio {
  width: calc(var(--spacing) * 3.5);
}
.relay-nudge-banner__x {
  width: calc(var(--spacing) * 3.5);
}
.relay-nudge-banner__text {
  width: calc(var(--spacing) * 6);
}
.relay-nudge-banner__button-dismiss-relay {
  width: calc(var(--spacing) * 8);
}
.relay-nudge-banner__status {
  width: 100%;
}
.relay-nudge-banner__status {
  max-width: var(--container-6xl);
}
.relay-nudge-banner__block-2 {
  min-width: 0;
}
.relay-nudge-banner__block-2 {
  flex: 1;
}
.relay-nudge-banner__text {
  flex-shrink: 0;
}
.relay-nudge-banner__block-3 {
  flex-shrink: 0;
}
.relay-nudge-banner__enter-from-class {
  --translate-y: calc(var(--spacing) * -2);
  translate: var(--translate-x,0) calc(var(--spacing) * -2);
}
.relay-nudge-banner__leave-to-class {
  --translate-y: calc(var(--spacing) * -2);
  translate: var(--translate-x,0) calc(var(--spacing) * -2);
}
.relay-nudge-banner__enter-to-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.relay-nudge-banner__leave-from-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.relay-nudge-banner__button-review-relays {
  cursor: pointer;
}
.relay-nudge-banner__button-later {
  cursor: pointer;
}
.relay-nudge-banner__button-dismiss-relay {
  cursor: pointer;
}
.relay-nudge-banner__block {
  flex-wrap: wrap;
}
.relay-nudge-banner__block {
  align-items: center;
}
.relay-nudge-banner__text {
  align-items: center;
}
.relay-nudge-banner__block-3 {
  align-items: center;
}
.relay-nudge-banner__button-review-relays {
  align-items: center;
}
.relay-nudge-banner__button-later {
  align-items: center;
}
.relay-nudge-banner__button-dismiss-relay {
  align-items: center;
}
.relay-nudge-banner__text {
  justify-content: center;
}
.relay-nudge-banner__button-review-relays {
  justify-content: center;
}
.relay-nudge-banner__button-later {
  justify-content: center;
}
.relay-nudge-banner__button-dismiss-relay {
  justify-content: center;
}
.relay-nudge-banner__block-3 {
  gap: var(--spacing);
}
.relay-nudge-banner__block {
  column-gap: calc(var(--spacing) * 2);
}
.relay-nudge-banner__block {
  row-gap: calc(var(--spacing) * 1.5);
}
.relay-nudge-banner__text-4 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.relay-nudge-banner__text {
  border-radius: var(--radius-lg);
}
.relay-nudge-banner__button-review-relays {
  border-radius: var(--radius-lg);
}
.relay-nudge-banner__button-later {
  border-radius: var(--radius-lg);
}
.relay-nudge-banner__button-dismiss-relay {
  border-radius: var(--radius-lg);
}
.relay-nudge-banner__block {
  border-radius: var(--radius-xl);
}
.relay-nudge-banner__block {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.relay-nudge-banner__block {
  border-color: #f99c0040;
}
.relay-nudge-banner__block {
  background-color: #f99c0014;
}
.relay-nudge-banner__text {
  background-color: #f99c001a;
}
.relay-nudge-banner__button-review-relays {
  background-color: #f99c0026;
}
.relay-nudge-banner__button-later {
  padding-inline: calc(var(--spacing) * 2);
}
.relay-nudge-banner__button-review-relays {
  padding-inline: calc(var(--spacing) * 2.5);
}
.relay-nudge-banner__status {
  padding-inline: calc(var(--spacing) * 3);
}
.relay-nudge-banner__block {
  padding-inline: calc(var(--spacing) * 3);
}
.relay-nudge-banner__block {
  padding-block: calc(var(--spacing) * 2);
}
.relay-nudge-banner__status {
  padding-top: var(--spacing);
}
.relay-nudge-banner__status {
  padding-bottom: calc(var(--spacing) * .5);
}
.relay-nudge-banner__button-review-relays {
  font-family: var(--font-mono);
}
.relay-nudge-banner__button-later {
  font-family: var(--font-mono);
}
.relay-nudge-banner__text-4 {
  font-size: 10px;
}
.relay-nudge-banner__button-review-relays {
  font-size: 10px;
}
.relay-nudge-banner__button-later {
  font-size: 10px;
}
.relay-nudge-banner__text-2 {
  font-size: 11px;
}
.relay-nudge-banner__text-4 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.relay-nudge-banner__text-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.relay-nudge-banner__button-review-relays {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.relay-nudge-banner__text-2 {
  color: var(--color-amber-200);
}
.relay-nudge-banner__button-review-relays {
  color: var(--color-amber-200);
}
.relay-nudge-banner__text {
  color: var(--color-amber-400);
}
.relay-nudge-banner__text-3 {
  color: #f99c00b3;
}
.relay-nudge-banner__text-4 {
  color: var(--ui-zinc-500);
}
.relay-nudge-banner__button-later {
  color: var(--ui-zinc-500);
}
.relay-nudge-banner__button-dismiss-relay {
  color: var(--ui-zinc-500);
}
.relay-nudge-banner__enter-from-class {
  opacity: 0;
}
.relay-nudge-banner__leave-to-class {
  opacity: 0;
}
.relay-nudge-banner__enter-to-class {
  opacity: 1;
}
.relay-nudge-banner__leave-from-class {
  opacity: 1;
}
.relay-nudge-banner__enter-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.relay-nudge-banner__leave-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.relay-nudge-banner__button-review-relays {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.relay-nudge-banner__button-later {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.relay-nudge-banner__button-dismiss-relay {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.relay-nudge-banner__leave-active-class {
  --duration: .2s;
  transition-duration: .2s;
}
.relay-nudge-banner__enter-active-class {
  --duration: .3s;
  transition-duration: .3s;
}
.relay-nudge-banner__leave-active-class {
  --ease: var(--ease-in);
  transition-timing-function: var(--ease-in);
}
.relay-nudge-banner__enter-active-class {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.relay-nudge-banner__button-review-relays:active {
  scale: .98;
}
.relay-nudge-banner__button-later:active {
  scale: .98;
}
.relay-nudge-banner__button-dismiss-relay:active {
  scale: .98;
}
[data-theme="light"] .relay-nudge-banner__text-2 {
  color: #b45309;
}
[data-theme="light"] .relay-nudge-banner__button-review-relays {
  color: #b45309;
}
[data-theme="light"] .relay-nudge-banner__text {
  color: #d97706;
}
[data-theme="light"] .relay-nudge-banner__text-4 {
  color: var(--app-muted);
}
[data-theme="light"] .relay-nudge-banner__button-later {
  color: var(--app-muted);
}
[data-theme="light"] .relay-nudge-banner__button-dismiss-relay {
  color: var(--app-muted);
}
[data-theme="light"] .relay-nudge-banner__button-later:hover {
  background-color: var(--app-surface-hover) !important;
}
[data-theme="light"] .relay-nudge-banner__button-dismiss-relay:hover {
  background-color: var(--app-surface-hover) !important;
}
[data-theme="light"] .relay-nudge-banner__button-later:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .relay-nudge-banner__button-dismiss-relay:hover {
  color: var(--app-text) !important;
}
}
}
</style>
