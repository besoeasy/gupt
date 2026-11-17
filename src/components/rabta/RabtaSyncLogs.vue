<script setup>
import { computed } from "vue";
import { Terminal, Trash2 } from "@lucide/vue";

const props = defineProps({
  logs: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["clear"]);

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toTimeString().split(" ")[0];
}

function levelClass(level) {
  if (level === "error") return "text-red-400 bg-red-500/10 border-red-500/20";
  if (level === "warn") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-zinc-400 bg-zinc-800 border-zinc-700/50";
}
</script>

<template>
  <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Terminal class="h-4 w-4 text-zinc-400" :stroke-width="1.8" />
        <h3 class="text-sm font-semibold tracking-tight text-zinc-100">Live Worker Sync Audit</h3>
        <span class="font-mono text-xs text-zinc-500 tabular-nums">({{ logs.length }})</span>
      </div>

      <button
        v-if="logs.length"
        type="button"
        class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 text-[11px] font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 active:scale-95"
        @click="emit('clear')"
      >
        <Trash2 class="h-3 w-3" :stroke-width="2" />
        Clear
      </button>
    </div>

    <!-- Log records -->
    <div
      v-if="logs.length"
      class="max-h-56 space-y-1.5 overflow-y-auto pr-1 font-mono text-[11px] [scrollbar-width:thin]"
    >
      <div
        v-for="log in logs"
        :key="log.id"
        class="flex items-start gap-2 rounded bg-zinc-950/60 px-2.5 py-1.5 text-zinc-300"
      >
        <span class="shrink-0 text-zinc-600 tabular-nums">{{ formatTime(log.timestamp) }}</span>
        <span
          class="shrink-0 rounded px-1 text-[9px] uppercase tracking-wider font-semibold border"
          :class="levelClass(log.level)"
        >
          {{ log.level }}
        </span>
        <span class="min-w-0 flex-1 break-words">{{ log.message }}</span>
      </div>
    </div>

    <div
      v-else
      class="py-6 text-center font-mono text-xs text-zinc-500 rounded-lg border border-dashed border-zinc-800/60"
    >
      Worker idle. Logs from cross-server sync operations will appear here in real time.
    </div>
  </div>
</template>
