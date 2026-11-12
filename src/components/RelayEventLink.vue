<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ChevronDown, ExternalLink } from "@lucide/vue";
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
  const base = String(relay || "").trim().replace(/\/+$/, "");
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
  <div v-if="hasEvent" ref="root" class="relative inline-flex">
    <button
      v-if="variant === 'button'"
      type="button"
      class="w-full inline-flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 font-medium hover:border-zinc-700 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
      :aria-expanded="open"
      @click="toggle"
    >
      <ExternalLink class="w-3.5 h-3.5" :stroke-width="1.8" />
      {{ label }}
      <ChevronDown
        class="w-3 h-3 text-zinc-500 transition-transform duration-150"
        :class="open ? 'rotate-180' : ''"
      />
    </button>
    <button
      v-else
      type="button"
      class="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-200 cursor-pointer"
      :aria-expanded="open"
      @click="toggle"
    >
      <ExternalLink class="h-3 w-3" />
      <span>{{ label }}</span>
    </button>

    <div
      v-if="open"
      class="absolute z-50 w-64 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/50"
      :class="
        placement === 'top'
          ? 'bottom-full left-0 mb-1.5'
          : 'top-full left-0 mt-1.5'
      "
    >
      <p class="px-3 pt-2 pb-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
        Open event on relay
      </p>
      <button
        v-for="relay in relays"
        :key="relay"
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white cursor-pointer"
        @click="openOnRelay(relay)"
      >
        <ExternalLink class="h-3 w-3 shrink-0 text-zinc-500" />
        <span class="truncate">{{ relayHost(relay) }}</span>
      </button>
    </div>
  </div>
</template>
