<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RefreshCw } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import BackgroundSyncToggle from "@/components/settings/BackgroundSyncToggle.vue";
import { useIdentityStore } from "@/stores/identity";
import { useReplicationStore } from "@/stores/replication";

const identityStore = useIdentityStore();
const replicationStore = useReplicationStore();

const now = ref(Date.now());
const syncing = ref(false);
const message = ref("");
const error = ref("");
let timer = null;

const statusLabel = computed(() => {
  if (!replicationStore.active) return "Idle";
  if (typeof document !== "undefined" && document.hidden) return "Paused";
  return "Active";
});

const lastAgo = computed(() => {
  const ts = replicationStore.lastTickAt;
  if (!ts) return "never";
  const diff = Math.max(0, Math.floor((now.value - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
});

const dots = computed(() => {
  const history = replicationStore.history || [];
  return Array.from({ length: 5 }, (_, index) => {
    const entry = history[index];
    if (!entry) return "empty";
    return entry.ok ? "ok" : "err";
  });
});

const busy = computed(() => syncing.value || replicationStore.active);

const lastTickFailed = computed(() => {
  const history = replicationStore.history || [];
  const latest = history[history.length - 1];
  return Boolean(latest && !latest.ok);
});

async function handleSync() {
  if (syncing.value) return;
  syncing.value = true;
  message.value = "";
  error.value = "";
  try {
    await replicationStore.triggerSyncNow(identityStore);
    message.value = "Relay sync finished.";
  } catch (e) {
    error.value = e.message || "Sync failed.";
  } finally {
    syncing.value = false;
  }
}

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <section class="space-y-1">
    <div class="flex items-center justify-between gap-3 px-1">
      <h2 class="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">
        Sync
      </h2>
      <span
        class="inline-flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 tabular-nums"
      >
        <span
          class="h-1.5 w-1.5 rounded-full"
          :class="replicationStore.active ? 'bg-emerald-400' : 'bg-zinc-600'"
        />
        {{ statusLabel }} &middot; {{ lastAgo }}
      </span>
    </div>

    <div class="divide-y divide-zinc-800/70">
      <BackgroundSyncToggle />

      <div class="flex items-center gap-3 py-3.5">
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium tracking-tight text-zinc-200">
            Recent relay ticks
          </p>
          <p class="mt-0.5 truncate text-xs text-zinc-500">Last five sync attempts on relays.</p>
        </div>
        <span class="flex shrink-0 items-center gap-1">
          <span
            v-for="(dot, i) in dots"
            :key="i"
            class="h-1.5 w-1.5 rounded-full"
            :class="{
              'bg-emerald-400': dot === 'ok',
              'bg-red-400': dot === 'err',
              'bg-zinc-800': dot === 'empty',
            }"
          />
        </span>
        <span
          v-if="busy"
          class="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-zinc-500"
          aria-live="polite"
        >
          <RefreshCw class="h-3 w-3 animate-spin" :stroke-width="2" />
          Syncing…
        </span>
        <button
          v-else
          type="button"
          class="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors"
          :class="
            lastTickFailed
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15'
              : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white'
          "
          @click="handleSync"
        >
          <RefreshCw class="h-3 w-3" :stroke-width="2" />
          {{ lastTickFailed ? "Retry" : "Sync now" }}
        </button>
      </div>
    </div>

    <div v-if="message || error" class="space-y-2 pt-2">
      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />
    </div>
  </section>
</template>
