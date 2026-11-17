<script setup>
import { computed } from "vue";
import { Server, Activity, Database, HardDrive, Trash2 } from "@lucide/vue";

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
  if (!props.server.online) return "text-zinc-600";
  const ms = props.server.latencyMs;
  if (ms < 120) return "text-emerald-400";
  if (ms < 300) return "text-amber-400";
  return "text-red-400";
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
    class="group relative flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4 transition-all duration-200 hover:border-zinc-700/80 hover:bg-zinc-900/80"
  >
    <!-- Top row: Status & URL -->
    <div class="flex items-start justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <span class="relative flex h-2.5 w-2.5 shrink-0">
          <span
            v-if="server.online"
            class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"
          />
          <span
            class="relative inline-flex h-2.5 w-2.5 rounded-full"
            :class="server.online ? 'bg-emerald-400' : 'bg-red-400'"
          />
        </span>
        <div class="min-w-0">
          <p class="truncate font-mono text-xs font-semibold text-zinc-100" :title="server.url">
            {{ cleanUrl }}
          </p>
          <p
            v-if="server.nodeId"
            class="truncate font-mono text-[10px] text-zinc-500"
            :title="server.nodeId"
          >
            id: {{ server.nodeId.slice(0, 16) }}…
          </p>
        </div>
      </div>

      <div class="flex items-center gap-1">
        <span
          class="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider font-medium"
          :class="
            server.online
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          "
        >
          {{ server.online ? "Online" : "Offline" }}
        </span>

        <button
          v-if="canRemove"
          type="button"
          class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400 active:scale-95"
          title="Remove server"
          aria-label="Remove server"
          @click="emit('remove', server.url)"
        >
          <Trash2 class="h-3.5 w-3.5" :stroke-width="1.8" />
        </button>
      </div>
    </div>

    <!-- Error message if offline -->
    <div
      v-if="!server.online && server.error"
      class="mt-2.5 truncate rounded bg-red-500/10 px-2 py-1 font-mono text-[10px] text-red-400"
      :title="server.error"
    >
      {{ server.error }}
    </div>

    <!-- Telemetry Stats -->
    <div class="mt-3.5 grid grid-cols-3 gap-2 border-t border-zinc-800/60 pt-3">
      <!-- Latency -->
      <div>
        <span class="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
          <Activity class="h-3 w-3" :stroke-width="1.8" />
          Latency
        </span>
        <p class="mt-0.5 font-mono text-xs font-semibold tabular-nums" :class="latencyColorClass">
          {{ formattedLatency }}
        </p>
      </div>

      <!-- Live Events -->
      <div>
        <span class="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
          <Database class="h-3 w-3" :stroke-width="1.8" />
          Events
        </span>
        <p class="mt-0.5 font-mono text-xs font-semibold tabular-nums text-zinc-200">
          {{ server.liveEvents != null ? server.liveEvents.toLocaleString() : "—" }}
        </p>
      </div>

      <!-- Live Blobs -->
      <div>
        <span class="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
          <HardDrive class="h-3 w-3" :stroke-width="1.8" />
          Blobs
        </span>
        <p class="mt-0.5 font-mono text-xs font-semibold tabular-nums text-zinc-200">
          {{ server.liveBlobs != null ? server.liveBlobs.toLocaleString() : "—" }}
        </p>
      </div>
    </div>

    <!-- Storage Capacity & Quota Limits -->
    <div
      v-if="server.storage"
      class="mt-3 flex items-center justify-between gap-2 border-t border-zinc-800/50 pt-2.5 font-mono text-[10px]"
    >
      <div class="flex min-w-0 items-center gap-1.5">
        <span
          class="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          :class="server.storage.writable ? 'bg-emerald-400' : 'bg-amber-400'"
        />
        <span class="truncate text-zinc-400">
          {{ server.storage.writable ? "Headroom:" : "Read-Only Relay" }}
        </span>
        <span v-if="server.storage.writable" class="truncate font-semibold text-zinc-200">
          {{ formatBytes(server.storage.remainingBytes) }}
        </span>
      </div>

      <span
        v-if="server.storage.maxSingleBytes && Number.isFinite(server.storage.maxSingleBytes)"
        class="shrink-0 text-[9px] text-zinc-500"
        title="Max single blob size allowed"
      >
        cap {{ formatBytes(server.storage.maxSingleBytes) }}
      </span>
    </div>
  </div>
</template>
