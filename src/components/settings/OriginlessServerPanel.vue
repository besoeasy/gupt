<script setup>
import { computed, onMounted, ref } from "vue";
import { Server, RotateCcw, Gauge, Loader2 } from "@lucide/vue";
import { useOriginlessServer } from "@/composables/useOriginlessServer";
import {
  getLastOriginlessRating,
  rateOriginlessServer,
  ORIGINLESS_RATING_WINDOW_MS,
} from "@/lib/originlessRating";

const { server, save, resetToDefaults } = useOriginlessServer();

const draftServerUrl = ref("");
const saveErrorKey = ref("");
const savedFlash = ref(false);
const testing = ref(false);
const result = ref(null);

const windowSeconds = Math.round(ORIGINLESS_RATING_WINDOW_MS / 1000);

const isDirty = computed(() => draftServerUrl.value.trim() !== server.value);

function formatMs(value) {
  if (!Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function formatTime(at) {
  try {
    return new Date(at).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function ratingClass(rating) {
  if (!Number.isFinite(rating)) return "text-zinc-500";
  if (rating <= 0) return "text-red-400";
  if (rating < 40) return "text-amber-400";
  return "text-emerald-400";
}

onMounted(() => {
  draftServerUrl.value = server.value;
  const last = getLastOriginlessRating();
  if (last && last.server === server.value) result.value = last;
});

function onSave() {
  const res = save(draftServerUrl.value);
  saveErrorKey.value = res.ok ? "" : res.reason;
  if (!res.ok) return;
  draftServerUrl.value = res.server;
  savedFlash.value = true;
  setTimeout(() => {
    savedFlash.value = false;
  }, 1500);
  const last = getLastOriginlessRating();
  result.value = last && last.server === res.server ? last : null;
}

function onReset() {
  resetToDefaults();
  draftServerUrl.value = server.value;
  saveErrorKey.value = "";
  result.value = null;
}

async function onTest() {
  if (testing.value) return;
  testing.value = true;
  try {
    result.value = await rateOriginlessServer(server.value);
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <div class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5 space-y-4 shadow-xs">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2 min-w-0">
        <Server class="h-4 w-4 text-zinc-400 shrink-0" :stroke-width="1.9" />
        <p class="text-sm font-semibold tracking-tight text-white truncate">Originless Server</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer tabular-nums"
        title="Reset to default server"
        @click="onReset"
      >
        <RotateCcw class="h-3 w-3" :stroke-width="2" />
        Reset
      </button>
    </div>

    <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <label class="space-y-1.5">
        <span class="text-[11px] text-zinc-500">Server URL</span>
        <input
          v-model="draftServerUrl"
          type="url"
          placeholder="https://originless.gupt.app"
          spellcheck="false"
          class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600/40"
          @keydown.enter="onSave"
        />
        <p v-if="saveErrorKey === 'invalid'" class="text-[11px] text-red-400">
          Enter a valid http or https URL.
        </p>
        <p v-else-if="savedFlash" class="text-[11px] text-emerald-400">Saved.</p>
      </label>
      <button
        type="button"
        :disabled="!draftServerUrl.trim()"
        class="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-xs font-medium text-black shadow-xs transition-all hover:bg-zinc-200 disabled:opacity-40 cursor-pointer sm:self-end"
        @click="onSave"
      >
        Save
      </button>
      <button
        type="button"
        :disabled="testing || isDirty"
        title="Upload a random blob and fetch it back, then rate the round trip"
        class="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-40 cursor-pointer sm:self-end"
        @click="onTest"
      >
        <Loader2 v-if="testing" class="h-3.5 w-3.5 animate-spin" :stroke-width="2" />
        <Gauge v-else class="h-3.5 w-3.5" :stroke-width="2" />
        {{ testing ? "Testing…" : "Test" }}
      </button>
    </div>
    <p v-if="isDirty" class="text-[11px] text-amber-400">Save before testing.</p>

    <div
      v-if="result"
      class="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5 space-y-2"
    >
      <div class="flex items-center gap-3">
        <p
          class="font-mono text-2xl font-semibold tabular-nums"
          :class="ratingClass(result.rating)"
        >
          {{ result.rating }}
        </p>
        <div class="min-w-0">
          <p class="text-xs font-medium text-zinc-200">Rating / 100</p>
          <p class="font-mono text-[10px] text-zinc-500 tabular-nums">
            round trip {{ formatMs(result.totalMs) }} &middot; tested {{ formatTime(result.at) }}
          </p>
        </div>
        <span
          v-if="result.ok"
          class="ml-auto shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider"
        >
          Verified
        </span>
        <span
          v-else
          class="ml-auto shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400 uppercase tracking-wider"
        >
          Failed
        </span>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-400 tabular-nums">
        <span>up {{ formatMs(result.uploadMs) }}</span>
        <span>down {{ formatMs(result.fetchMs) }}</span>
        <span class="truncate text-zinc-600" :title="result.cid">{{ result.cid }}</span>
      </div>
      <p v-if="!result.ok" class="text-[11px] text-red-400">{{ result.error }}</p>
    </div>

    <p class="text-[11px] text-zinc-500 leading-relaxed">
      Test uploads a random 8&nbsp;KB text blob and fetches it back. Rating is linear 100&rarr;0
      over a {{ windowSeconds }}&nbsp;s round trip; slower or failed is 0.
    </p>
  </div>
</template>
