<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ChevronDown, ExternalLink } from "@/icons";
import { DEFAULT_RELAYS, readConfiguredRelays } from "@/config/servers";
import { RABTA_EVENT_ID_RE } from "@/lib/rabta";

const props = defineProps({
  eventId: { type: String, default: "" },
  label: { type: String, default: "Rabta relay" },
  // "link" renders a small inline trigger, "button" a full-width trigger.
  variant: { type: String, default: "link" },
  // Popover side relative to the trigger.
  placement: { type: String, default: "bottom" },
});

const hasEvent = computed(() => RABTA_EVENT_ID_RE.test(String(props.eventId || "").trim()));

const relays = computed(() => {
  const list = readConfiguredRelays();
  return list.length ? list : [...DEFAULT_RELAYS];
});

const open = ref(false);
const root = ref(null);

function relayHost(relay) {
  try {
    return new URL(relay).host;
  } catch {
    return relay;
  }
}

function eventUrl(relay) {
  const base = String(relay || "")
    .trim()
    .replace(/\/+$/, "");
  return `${base}/api/v1/events/${encodeURIComponent(String(props.eventId).trim())}`;
}

function toggle() {
  if (!hasEvent.value) return;
  open.value = !open.value;
}

function openOnRelay(relay) {
  window.open(eventUrl(relay), "_blank", "noopener,noreferrer");
  open.value = false;
}

function onDocClick(event) {
  if (open.value && root.value && !root.value.contains(event.target)) open.value = false;
}

function onKeydown(event) {
  if (event.key === "Escape") open.value = false;
}

onMounted(() => {
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocClick, true);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div v-if="hasEvent" ref="root" class="relay-event-link__block">
    <button
      v-if="variant === 'button'"
      type="button"
      class="relay-event-link__button"
      :aria-expanded="open"
      @click="toggle"
    >
      <ExternalLink class="relay-event-link__external-link" :stroke-width="1.8" />
      {{ label }}
      <ChevronDown
        class="relay-event-link__chevron-down"
        :class="open ? 'relay-event-link__chevron-down--variant-1' : ''"
      />
    </button>
    <button
      v-else
      type="button"
      class="relay-event-link__button-2"
      :aria-expanded="open"
      @click="toggle"
    >
      <ExternalLink class="relay-event-link__external-link-2" />
      <span>{{ label }}</span>
    </button>

    <div
      v-if="open"
      class="relay-event-link__block-2"
      :class="placement === 'top' ? 'relay-event-link__block--variant-1' : 'relay-event-link__block--variant-2'"
    >
      <p class="relay-event-link__text-open-event">
        Open event on relay
      </p>
      <button
        v-for="relay in relays"
        :key="relay"
        type="button"
        class="relay-event-link__button-3"
        @click="openOnRelay(relay)"
      >
        <ExternalLink class="relay-event-link__external-link-3" />
        <span class="relay-event-link__text">{{ relayHost(relay) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {


@media (hover:hover) {
.relay-event-link__button:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.relay-event-link__button:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.relay-event-link__button-3:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
.relay-event-link__button:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.relay-event-link__button-3:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.relay-event-link__button-2:hover {
  color: var(--ui-zinc-200);
}
}

@layer gupt-components {
.relay-event-link__block-2 {
  position: absolute;
}
.relay-event-link__block {
  position: relative;
}
.relay-event-link__block--variant-2 {
  top: 100%;
}
.relay-event-link__block--variant-1 {
  bottom: 100%;
}
.relay-event-link__block--variant-1 {
  left: 0;
}
.relay-event-link__block--variant-2 {
  left: 0;
}
.relay-event-link__block-2 {
  z-index: 50;
}
.relay-event-link__block--variant-2 {
  margin-top: calc(var(--spacing) * 1.5);
}
.relay-event-link__block--variant-1 {
  margin-bottom: calc(var(--spacing) * 1.5);
}
.relay-event-link__button-3 {
  display: flex;
}
.relay-event-link__block {
  display: inline-flex;
}
.relay-event-link__button {
  display: inline-flex;
}
.relay-event-link__button-2 {
  display: inline-flex;
}
.relay-event-link__chevron-down {
  height: calc(var(--spacing) * 3);
}
.relay-event-link__external-link-2 {
  height: calc(var(--spacing) * 3);
}
.relay-event-link__external-link-3 {
  height: calc(var(--spacing) * 3);
}
.relay-event-link__external-link {
  height: calc(var(--spacing) * 3.5);
}
.relay-event-link__chevron-down {
  width: calc(var(--spacing) * 3);
}
.relay-event-link__external-link-2 {
  width: calc(var(--spacing) * 3);
}
.relay-event-link__external-link-3 {
  width: calc(var(--spacing) * 3);
}
.relay-event-link__external-link {
  width: calc(var(--spacing) * 3.5);
}
.relay-event-link__block-2 {
  width: calc(var(--spacing) * 64);
}
.relay-event-link__button {
  width: 100%;
}
.relay-event-link__button-3 {
  width: 100%;
}
.relay-event-link__external-link-3 {
  flex-shrink: 0;
}
.relay-event-link__chevron-down--variant-1 {
  rotate: 180deg;
}
.relay-event-link__button {
  cursor: pointer;
}
.relay-event-link__button-2 {
  cursor: pointer;
}
.relay-event-link__button-3 {
  cursor: pointer;
}
.relay-event-link__button {
  align-items: center;
}
.relay-event-link__button-2 {
  align-items: center;
}
.relay-event-link__button-3 {
  align-items: center;
}
.relay-event-link__button {
  justify-content: center;
}
.relay-event-link__button-2 {
  gap: var(--spacing);
}
.relay-event-link__button {
  gap: calc(var(--spacing) * 2);
}
.relay-event-link__button-3 {
  gap: calc(var(--spacing) * 2);
}
.relay-event-link__text {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.relay-event-link__block-2 {
  overflow: hidden;
}
.relay-event-link__button {
  border-radius: var(--radius-lg);
}
.relay-event-link__block-2 {
  border-radius: var(--radius-lg);
}
.relay-event-link__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.relay-event-link__block-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.relay-event-link__button {
  border-color: var(--ui-zinc-800);
}
.relay-event-link__block-2 {
  border-color: var(--ui-zinc-800);
}
.relay-event-link__button {
  background-color: var(--ui-zinc-900);
}
.relay-event-link__block-2 {
  background-color: var(--ui-zinc-950);
}
.relay-event-link__button {
  padding-inline: calc(var(--spacing) * 3);
}
.relay-event-link__text-open-event {
  padding-inline: calc(var(--spacing) * 3);
}
.relay-event-link__button-3 {
  padding-inline: calc(var(--spacing) * 3);
}
.relay-event-link__button {
  padding-block: calc(var(--spacing) * 2);
}
.relay-event-link__button-3 {
  padding-block: calc(var(--spacing) * 2);
}
.relay-event-link__text-open-event {
  padding-top: calc(var(--spacing) * 2);
}
.relay-event-link__text-open-event {
  padding-bottom: var(--spacing);
}
.relay-event-link__button-3 {
  text-align: left;
}
.relay-event-link__text-open-event {
  font-family: var(--font-mono);
}
.relay-event-link__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.relay-event-link__button-3 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.relay-event-link__text-open-event {
  font-size: 10px;
}
.relay-event-link__button-2 {
  font-size: 11px;
}
.relay-event-link__button {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.relay-event-link__button-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.relay-event-link__text-open-event {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.relay-event-link__button {
  color: var(--ui-zinc-200);
}
.relay-event-link__button-3 {
  color: var(--ui-zinc-300);
}
.relay-event-link__chevron-down {
  color: var(--ui-zinc-500);
}
.relay-event-link__button-2 {
  color: var(--ui-zinc-500);
}
.relay-event-link__external-link-3 {
  color: var(--ui-zinc-500);
}
.relay-event-link__text-open-event {
  color: var(--ui-zinc-600);
}
.relay-event-link__text-open-event {
  text-transform: uppercase;
}
.relay-event-link__block-2 {
  --shadow: 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
}
.relay-event-link__block-2 {
  --shadow-color: var(--ui-black);
}
.relay-event-link__button {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.relay-event-link__chevron-down {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.relay-event-link__chevron-down {
  --duration: .15s;
  transition-duration: .15s;
}
[data-theme="light"] .relay-event-link__button-3 {
  color: var(--app-text-soft);
}
[data-theme="light"] .relay-event-link__chevron-down {
  color: var(--app-muted);
}
[data-theme="light"] .relay-event-link__button-2 {
  color: var(--app-muted);
}
[data-theme="light"] .relay-event-link__external-link-3 {
  color: var(--app-muted);
}
[data-theme="light"] .relay-event-link__text-open-event {
  color: var(--app-text-soft);
}
[data-theme="light"] .relay-event-link__button-2:hover {
  color: var(--app-text) !important;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.relay-event-link__block-2 {
  --shadow-color: color-mix(in oklab, color-mix(in oklab, var(--ui-black) 50%, transparent) var(--shadow-alpha,100%), transparent);
}
}
}
</style>
