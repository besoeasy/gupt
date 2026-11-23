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
  <div v-if="hasEvent" ref="root" class="relay-link">
    <button
      v-if="variant === 'button'"
      type="button"
      class="relay-link__wide"
      :aria-expanded="open"
      @click="toggle"
    >
      <ExternalLink class="relay-link__icon" :stroke-width="1.8" aria-hidden="true" />
      {{ label }}
      <ChevronDown class="relay-link__chevron" :class="{ 'relay-link__chevron--open': open }" :stroke-width="1.9" aria-hidden="true" />
    </button>
    <button
      v-else
      type="button"
      class="relay-link__inline"
      :aria-expanded="open"
      @click="toggle"
    >
      <ExternalLink class="relay-link__icon" :stroke-width="1.9" aria-hidden="true" />
      <span>{{ label }}</span>
    </button>

    <div
      v-if="open"
      class="relay-link__pop"
      :class="placement === 'top' ? 'relay-link__pop--top' : 'relay-link__pop--bottom'"
    >
      <p class="relay-link__pop-label">Open event on relay</p>
      <button
        v-for="relay in relays"
        :key="relay"
        type="button"
        class="relay-link__row"
        @click="openOnRelay(relay)"
      >
        <ExternalLink class="relay-link__row-icon" :stroke-width="1.8" aria-hidden="true" />
        <span class="relay-link__row-host">{{ relayHost(relay) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Ledger pass: an inline relay trigger with a hairline popover. */

.relay-link {
  position: relative;
  display: inline-flex;
  max-width: 100%;
}

.relay-link__inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.relay-link__wide {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 34px;
  padding-inline: 11px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.relay-link__icon {
  width: 10px;
  height: 10px;
}

.relay-link__chevron {
  width: 11px;
  height: 11px;
  transition: transform var(--app-dur-fast) var(--app-ease-standard);
}

.relay-link__chevron--open {
  transform: rotate(180deg);
}

/* ---- Popover ---- */

.relay-link__pop {
  position: absolute;
  right: 0;
  z-index: 40;
  width: max-content;
  min-width: 190px;
  max-width: min(280px, calc(100vw - 2rem));
  padding: 5px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface);
  box-shadow: 0 18px 40px -24px rgba(0, 0, 0, 0.55);
  animation: ledger-fade 160ms var(--app-ease-standard) both;
}

.relay-link__pop--bottom {
  top: calc(100% + 6px);
}

.relay-link__pop--top {
  bottom: calc(100% + 6px);
}

.relay-link__pop-label {
  margin: 0;
  padding: 5px 7px 7px;
  border-bottom: 1px solid var(--app-border);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.relay-link__row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-height: 32px;
  padding: 6px 7px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--app-dur-fast) var(--app-ease-standard);
}

.relay-link__row + .relay-link__row {
  border-top: 1px solid var(--app-border);
  border-radius: 0 0 3px 3px;
}

.relay-link__row-icon {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  color: var(--app-muted-2);
}

.relay-link__row-host {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--app-text-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (hover: hover) {
  .relay-link__inline:hover,
  .relay-link__wide:hover {
    color: var(--app-text);
  }

  .relay-link__wide:hover {
    border-color: var(--app-border-strong);
  }

  .relay-link__row:hover {
    background: var(--app-surface-soft);
  }
}

@media (pointer: coarse) {
  .relay-link__inline,
  .relay-link__wide,
  .relay-link__row {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .relay-link__pop {
    animation: none;
  }

  .relay-link__inline,
  .relay-link__wide,
  .relay-link__chevron,
  .relay-link__row {
    transition: none;
  }
}
</style>
