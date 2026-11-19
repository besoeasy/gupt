<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

import { useRelaySummary } from "@/composables/useRelaySummary";
import { useReplicationStore } from "@/stores/replication";

const emit = defineEmits(["navigate"]);

const replicationStore = useReplicationStore();
const { relayCount, healthyCount, unhealthyCount, suggestionCount, loaded } = useRelaySummary();

const now = ref(Date.now());
let tickTimer = null;

const syncTone = computed(() => {
  if (typeof document !== "undefined" && document.hidden) return "idle";
  if (!replicationStore.active) return "idle";
  const latest = (replicationStore.history || []).at(-1);
  if (latest && !latest.ok) return "warn";
  return "ok";
});

const syncLabel = computed(() => {
  if (syncTone.value === "idle") {
    return typeof document !== "undefined" && document.hidden ? "Paused" : "Idle";
  }
  return syncTone.value === "warn" ? "Retrying" : "Live";
});

const lastAgo = computed(() => {
  const ts = Number(replicationStore.lastTickAt) || 0;
  if (!ts) return "not yet";
  const diff = Math.max(0, Math.floor((now.value - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
});

const relaySub = computed(() => {
  if (!loaded.value) return "checking health…";
  if (unhealthyCount.value > 0) {
    return `${unhealthyCount.value} failing`;
  }
  return relayCount.value ? "all responding" : "none configured";
});
const suggestedSub = computed(() => {
  if (!loaded.value) return "checking hints…";
  if (!suggestionCount.value) return "none from your relays";
  return "verified, ready to add";
});

onMounted(() => {
  tickTimer = setInterval(() => {
    now.value = Date.now();
  }, 10_000);
});

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
});
</script>

<template>
  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
    <button
      type="button"
      class="group flex flex-col items-start justify-center rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-2.5 text-left transition-colors duration-200 hover:border-zinc-700 hover:bg-zinc-900/50 active:scale-[0.99]"
      aria-label="Go to sync settings"
      @click="emit('navigate', 'sync')"
    >
      <span class="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Sync</span>
      <span
        class="mt-1 flex items-center gap-1.5 text-sm font-semibold tracking-tight text-zinc-100"
      >
        <span
          class="h-1.5 w-1.5 rounded-full"
          :class="{
            'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.55)]': syncTone === 'ok',
            'bg-amber-400': syncTone === 'warn',
            'bg-zinc-600': syncTone === 'idle',
          }"
          aria-hidden="true"
        />
        {{ syncLabel }}
      </span>
      <span class="mt-0.5 font-mono text-[10px] text-zinc-500 tabular-nums">
        last tick {{ lastAgo }}
      </span>
    </button>

    <button
      type="button"
      class="group flex flex-col items-start justify-center rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-2.5 text-left transition-colors duration-200 hover:border-zinc-700 hover:bg-zinc-900/50 active:scale-[0.99]"
      aria-label="Go to relay settings"
      @click="emit('navigate', 'relays')"
    >
      <span class="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Relays</span>
      <span class="mt-1 text-sm font-semibold tracking-tight tabular-nums">
        <span :class="unhealthyCount ? 'text-amber-400' : 'text-zinc-100'">
          {{ healthyCount }} / {{ relayCount }}
        </span>
        <span class="text-[10px] font-medium text-zinc-500"> healthy</span>
      </span>
      <span class="mt-0.5 font-mono text-[10px] text-zinc-500 tabular-nums">{{ relaySub }}</span>
    </button>

    <button
      type="button"
      class="col-span-2 flex flex-col items-start justify-center rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-2.5 text-left transition-colors duration-200 hover:border-zinc-700 hover:bg-zinc-900/50 active:scale-[0.99] sm:col-span-1"
      aria-label="Go to suggested relays"
      @click="emit('navigate', 'relays')"
    >
      <span class="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
        Suggested
      </span>
      <span class="mt-1 text-sm font-semibold tracking-tight text-zinc-100 tabular-nums">
        {{ suggestionCount }}
        <span class="text-[10px] font-medium text-zinc-500">verified</span>
      </span>
      <span class="mt-0.5 font-mono text-[10px] text-zinc-500 tabular-nums">{{
        suggestedSub
      }}</span>
    </button>
  </div>
</template>
