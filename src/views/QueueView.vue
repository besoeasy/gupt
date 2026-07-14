<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, RefreshCw, Clock, RotateCcw, Layers } from "@lucide/vue";
import { pendingCount, getSendQueueSnapshot, cancelAllTasks } from "@/lib/sendQueue";

const router = useRouter();

// Re-derive the task list whenever pendingCount changes (pendingCount is reactive).
// We also poll every second to keep waitedMs fresh.
const snapshot = ref(getSendQueueSnapshot());
let ticker = null;

function refresh() {
  snapshot.value = getSendQueueSnapshot();
}

onMounted(() => {
  refresh();
  ticker = setInterval(refresh, 1000);
});

onUnmounted(() => clearInterval(ticker));

const tasks = computed(() => snapshot.value.tasks);

const grouped = computed(() => {
  const groups = {};
  for (const task of tasks.value) {
    const k = task.kind || "dm";
    if (!groups[k]) groups[k] = [];
    groups[k].push(task);
  }
  return groups;
});

const kindLabel = {
  dm: { label: "Messages", color: "text-violet-400", bg: "bg-violet-400/10 border-violet-400/20" },
  group: { label: "Group msgs", color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20" },
  receipt: {
    label: "Read receipts",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
  },
  reaction: {
    label: "Reactions",
    color: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
  },
  edit: { label: "Edits", color: "text-sky-400", bg: "bg-sky-400/10 border-sky-400/20" },
  profile: { label: "Profile", color: "text-pink-400", bg: "bg-pink-400/10 border-pink-400/20" },
  "group-admin": {
    label: "Invites",
    color: "text-orange-400",
    bg: "bg-orange-400/10 border-orange-400/20",
  },
};

function meta(kind) {
  return (
    kindLabel[kind] || {
      label: kind,
      color: "text-(--app-muted)",
      bg: "bg-(--app-surface-soft) border-(--app-border)",
    }
  );
}

function formatWait(ms) {
  if (ms < 1000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function handleCancelAll() {
  cancelAllTasks();
  refresh();
}
</script>

<template>
  <div class="flex h-full flex-col bg-(--app-bg)">
    <!-- Header -->
    <div class="flex items-center gap-3 border-b border-(--app-border) px-4 py-3">
      <button
        @click="router.back()"
        class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors"
        title="Back"
      >
        <ArrowLeft class="h-4 w-4" :stroke-width="2" />
      </button>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-(--app-text)">Pending actions</p>
        <p class="text-xs text-(--app-muted)">Relay writes waiting to be confirmed</p>
      </div>
      <button
        @click="refresh"
        class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors"
        title="Refresh"
      >
        <RefreshCw class="h-3.5 w-3.5" :stroke-width="2" />
      </button>
    </div>

    <!-- Empty state -->
    <div
      v-if="tasks.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-3 text-center px-6"
    >
      <div
        class="flex h-14 w-14 items-center justify-center rounded-2xl bg-(--app-surface-soft) border border-(--app-border)"
      >
        <Layers class="h-6 w-6 text-(--app-muted)" :stroke-width="1.5" />
      </div>
      <p class="text-sm font-semibold text-(--app-text)">All clear</p>
      <p class="text-xs text-(--app-muted) max-w-[220px]">
        No pending relay writes. Everything has been sent.
      </p>
    </div>

    <!-- Task list -->
    <div v-else class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <!-- Summary chip row -->
      <div class="flex flex-wrap gap-2">
        <div
          v-for="(items, kind) in grouped"
          :key="kind"
          class="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
          :class="meta(kind).bg"
        >
          <span :class="meta(kind).color">{{ meta(kind).label }}</span>
          <span class="text-(--app-muted)">{{ items.length }}</span>
        </div>
      </div>

      <!-- Per-kind groups -->
      <div v-for="(items, kind) in grouped" :key="kind" class="space-y-2">
        <p class="text-[11px] font-semibold uppercase tracking-wider" :class="meta(kind).color">
          {{ meta(kind).label }}
        </p>

        <div
          v-for="task in items"
          :key="task.id"
          class="flex items-start gap-3 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2.5"
        >
          <!-- Pulsing dot -->
          <span class="relative mt-0.5 flex h-2 w-2 shrink-0">
            <span
              class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              :class="meta(kind).color.replace('text-', 'bg-')"
            />
            <span
              class="relative inline-flex h-2 w-2 rounded-full"
              :class="meta(kind).color.replace('text-', 'bg-')"
            />
          </span>

          <div class="min-w-0 flex-1 space-y-1">
            <!-- Task ID (truncated) -->
            <p class="truncate font-mono text-[11px] text-(--app-muted)" :title="task.id">
              {{ task.id }}
            </p>

            <div
              class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-(--app-muted)"
            >
              <!-- Waited time -->
              <span class="inline-flex items-center gap-1">
                <Clock class="h-3 w-3 shrink-0" :stroke-width="2" />
                {{ formatWait(task.waitedMs) }}
              </span>
              <!-- Retry count -->
              <span v-if="task.attempts > 0" class="inline-flex items-center gap-1 text-amber-400">
                <RotateCcw class="h-3 w-3 shrink-0" :stroke-width="2" />
                {{ task.attempts }} {{ task.attempts === 1 ? "retry" : "retries" }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Cancel all -->
      <div class="pt-2 pb-6">
        <button
          @click="handleCancelAll"
          class="w-full rounded-xl border border-red-500/20 bg-red-500/5 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Cancel all pending
        </button>
      </div>
    </div>
  </div>
</template>
