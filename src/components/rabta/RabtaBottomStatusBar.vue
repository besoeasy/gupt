<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Radio, RefreshCw, ChevronRight } from "@lucide/vue";
import { useRabtaSyncStore } from "@/stores/rabtaSync";

const router = useRouter();
const rabtaSyncStore = useRabtaSyncStore();

const statusDotClass = computed(() => {
  if (rabtaSyncStore.isSyncing) return "bg-amber-400";
  if (rabtaSyncStore.status === "error" || rabtaSyncStore.status === "offline") return "bg-red-400";
  if (rabtaSyncStore.status === "paused" || rabtaSyncStore.onlineServers === 0) return "bg-zinc-500";
  return "bg-emerald-400";
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
    class="sticky bottom-0 z-30 w-full shrink-0 border-t border-zinc-800/80 bg-black/90 backdrop-blur-md select-none transition-colors pb-[env(safe-area-inset-bottom,0px)]"
    aria-label="Rabta Mesh Sync Status"
  >
    <button
      type="button"
      class="group flex h-7 sm:h-6.5 w-full cursor-pointer items-center justify-between px-3 text-[11px] font-mono leading-none text-zinc-400 transition-all duration-150 hover:bg-zinc-900/80 hover:text-zinc-200 active:scale-[0.998] active:bg-zinc-800/80"
      @click="openRabtaDashboard"
      :title="`Rabta Mesh: ${rabtaSyncStore.onlineServers}/${rabtaSyncStore.totalServers} online · ${rabtaSyncStore.ourTotalEvents} events · Tap to open sync dashboard`"
    >
      <!-- Left: Status Indicator & Node Count -->
      <div class="flex items-center gap-2 truncate">
        <span class="relative flex h-2 w-2 shrink-0 items-center justify-center">
          <span
            v-if="rabtaSyncStore.isSyncing"
            class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"
          />
          <span
            class="relative inline-flex h-1.5 w-1.5 rounded-full transition-colors"
            :class="statusDotClass"
          />
        </span>

        <span class="font-medium text-zinc-300 group-hover:text-amber-300 transition-colors">
          Rabta
        </span>

        <span class="text-zinc-500">·</span>

        <span class="tabular-nums text-zinc-400">
          {{ rabtaSyncStore.onlineServers }}/{{ rabtaSyncStore.totalServers }}
          <span class="hidden sm:inline">online</span>
        </span>
      </div>

      <!-- Center: Events & Consistency (hidden on very small viewports, visible on md+) -->
      <div class="hidden items-center gap-2 text-zinc-400 md:flex truncate">
        <span class="text-zinc-500">·</span>
        <span class="tabular-nums">
          {{ rabtaSyncStore.ourTotalEvents.toLocaleString() }} our events
        </span>
        <span class="text-zinc-500">·</span>
        <span class="tabular-nums text-emerald-400/90 font-medium">
          {{ rabtaSyncStore.consistencyPct }}% sync
        </span>
      </div>

      <!-- Right: Sync status & Chevron link -->
      <div class="flex items-center gap-1.5 shrink-0 text-zinc-400 group-hover:text-zinc-200 transition-colors">
        <RefreshCw
          v-if="rabtaSyncStore.isSyncing"
          class="h-3 w-3 animate-spin text-amber-400"
          aria-hidden="true"
        />
        <Radio
          v-else
          class="h-3 w-3 text-zinc-500 group-hover:text-amber-300 transition-colors"
          aria-hidden="true"
        />

        <span class="tabular-nums font-medium">
          {{ statusText }}
        </span>

        <ChevronRight class="h-3 w-3 text-zinc-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
      </div>
    </button>
  </aside>
</template>
