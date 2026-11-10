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
  <section class="space-y-2">
    <div class="px-1">
      <h2 class="text-xs font-semibold tracking-tight text-zinc-200 sm:text-sm">Sync</h2>
      <p class="mt-0.5 text-xs text-zinc-500">
        Keep encrypted vault items fresh on relays before they expire.
      </p>
    </div>

    <div class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5 space-y-3 shadow-xs">
      <div class="flex items-center justify-between gap-3">
        <div class="space-y-1">
          <p class="text-xs sm:text-sm font-semibold tracking-tight text-zinc-200">Relay sync</p>
          <p class="text-xs text-zinc-500 tabular-nums">{{ statusLabel }} · last {{ lastAgo }}</p>
        </div>
        <button
          type="button"
          :disabled="syncing || replicationStore.active"
          class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          @click="handleSync"
        >
          <RefreshCw
            class="h-3.5 w-3.5"
            :stroke-width="2"
            :class="{ 'animate-spin': syncing || replicationStore.active }"
          />
          Sync
        </button>
      </div>

      <div class="flex items-center gap-1.5">
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
      </div>

      <div class="border-t border-zinc-800/80 pt-3">
        <BackgroundSyncToggle />
      </div>

      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />
    </div>
  </section>
</template>
