<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Server, RotateCcw, Gauge, ArrowUp, ArrowDown } from "@lucide/vue";
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
const testPhase = ref("upload");
const liveUploadMs = ref(null);
const liveElapsedMs = ref(0);
const result = ref(null);
const displayedRating = ref(0);

const windowSeconds = Math.round(ORIGINLESS_RATING_WINDOW_MS / 1000);

const GAUGE_R = 80;
const GAUGE_C = 2 * Math.PI * GAUGE_R;
const GAUGE_ARC = (GAUGE_C * 240) / 360;
const GAUGE_ROTATE = 150;

let tickTimer = null;
let rafId = 0;
let testController = null;

const isDirty = computed(() => draftServerUrl.value.trim() !== server.value);

const gaugeDash = computed(() => `${(displayedRating.value / 100) * GAUGE_ARC} ${GAUGE_C}`);

const ticks = computed(() =>
  [0, 25, 50, 75, 100].map((value) => {
    const angle = ((GAUGE_ROTATE + (value / 100) * 240) * Math.PI) / 180;
    return {
      value,
      x1: 100 + (GAUGE_R - 6) * Math.cos(angle),
      y1: 100 + (GAUGE_R - 6) * Math.sin(angle),
      x2: 100 + (GAUGE_R + 6) * Math.cos(angle),
      y2: 100 + (GAUGE_R + 6) * Math.sin(angle),
      lx: 100 + (GAUGE_R - 20) * Math.cos(angle),
      ly: 100 + (GAUGE_R - 20) * Math.sin(angle),
    };
  }),
);

const phaseLabel = computed(() => {
  if (testing.value) return testPhase.value === "upload" ? "Uploading…" : "Fetching back…";
  if (!result.value) return "Not tested yet";
  return result.value.ok ? "Verified" : "Failed";
});

function formatMs(value) {
  if (!Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function formatLiveSeconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
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

function ratingColor(rating) {
  if (!Number.isFinite(rating)) return "text-zinc-500";
  if (rating <= 0) return "text-red-400";
  if (rating < 40) return "text-amber-400";
  return "text-emerald-400";
}

const gaugeColor = computed(() =>
  testing.value ? "text-zinc-400" : ratingColor(result.value?.rating),
);

function animateRatingTo(target) {
  cancelAnimationFrame(rafId);
  const from = displayedRating.value;
  const start = performance.now();
  const duration = 900;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    displayedRating.value = Math.round(from + (target - from) * eased);
    if (t < 1) rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

function stopTicker() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

onMounted(() => {
  draftServerUrl.value = server.value;
  const last = getLastOriginlessRating();
  if (last && last.server === server.value) {
    result.value = last;
    displayedRating.value = last.rating;
  }
});

onUnmounted(() => {
  stopTicker();
  cancelAnimationFrame(rafId);
  try {
    testController?.abort(new DOMException("Test aborted", "AbortError"));
  } catch {}
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
  displayedRating.value = result.value?.rating || 0;
}

function onReset() {
  resetToDefaults();
  draftServerUrl.value = server.value;
  saveErrorKey.value = "";
  result.value = null;
  displayedRating.value = 0;
}

async function onTest() {
  if (testing.value) return;
  testing.value = true;
  testPhase.value = "upload";
  liveUploadMs.value = null;
  result.value = null;
  displayedRating.value = 0;
  const startedAt = Date.now();
  liveElapsedMs.value = 0;
  tickTimer = setInterval(() => {
    liveElapsedMs.value = Date.now() - startedAt;
  }, 100);
  testController = new AbortController();
  try {
    const next = await rateOriginlessServer(server.value, {
      signal: testController.signal,
      onPhase(update) {
        if (update?.phase === "fetch") {
          testPhase.value = "fetch";
          liveUploadMs.value = update.uploadMs;
        }
      },
    });
    result.value = next;
    animateRatingTo(next.rating);
  } catch {
    result.value = null;
  } finally {
    stopTicker();
    testing.value = false;
    testController = null;
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
        <Gauge class="h-3.5 w-3.5" :stroke-width="2" :class="{ 'animate-spin': testing }" />
        {{ testing ? "Testing…" : "Test" }}
      </button>
    </div>
    <p v-if="isDirty" class="text-[11px] text-amber-400">Save before testing.</p>

    <div
      v-if="testing || result"
      class="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-4 space-y-3"
    >
      <div class="relative mx-auto w-52">
        <svg viewBox="0 0 200 200" class="block w-full">
          <circle
            cx="100"
            cy="100"
            :r="GAUGE_R"
            fill="none"
            stroke-width="10"
            class="stroke-zinc-800/80"
            :stroke-dasharray="`${GAUGE_ARC} ${GAUGE_C}`"
            stroke-linecap="round"
            :transform="`rotate(${GAUGE_ROTATE} 100 100)`"
          />
          <circle
            v-if="testing"
            cx="100"
            cy="100"
            :r="GAUGE_R"
            fill="none"
            stroke="currentColor"
            stroke-width="10"
            stroke-linecap="round"
            class="gauge-sweep text-zinc-400"
            :stroke-dasharray="`${GAUGE_ARC * 0.22} ${GAUGE_C}`"
          />
          <circle
            v-else
            cx="100"
            cy="100"
            :r="GAUGE_R"
            fill="none"
            stroke="currentColor"
            stroke-width="10"
            stroke-linecap="round"
            class="gauge-value"
            :class="gaugeColor"
            :stroke-dasharray="gaugeDash"
            :transform="`rotate(${GAUGE_ROTATE} 100 100)`"
          />
          <g class="stroke-zinc-700" stroke-width="2">
            <line
              v-for="tick in ticks"
              :key="tick.value"
              :x1="tick.x1"
              :y1="tick.y1"
              :x2="tick.x2"
              :y2="tick.y2"
            />
          </g>
          <g class="fill-zinc-600 font-mono" font-size="9" text-anchor="middle">
            <text v-for="tick in ticks" :key="`label-${tick.value}`" :x="tick.lx" :y="tick.ly + 3">
              {{ tick.value }}
            </text>
          </g>
        </svg>
        <div
          class="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none"
        >
          <p
            v-if="testing"
            class="font-mono text-3xl font-semibold text-white tabular-nums tracking-tight"
          >
            {{ formatLiveSeconds(liveElapsedMs) }}
          </p>
          <p
            v-else
            class="font-mono text-4xl font-semibold tabular-nums tracking-tight"
            :class="ratingColor(result?.rating)"
          >
            {{ displayedRating }}
          </p>
          <p class="mt-1 text-[11px] font-medium text-zinc-400">{{ phaseLabel }}</p>
        </div>
      </div>

      <div class="mx-auto grid w-full max-w-xs grid-cols-2 gap-2">
        <div
          class="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-2.5 py-1.5"
        >
          <ArrowUp
            class="h-3.5 w-3.5 shrink-0"
            :stroke-width="2"
            :class="testPhase === 'upload' && testing ? 'text-emerald-400' : 'text-zinc-500'"
          />
          <div class="min-w-0">
            <p class="text-[10px] uppercase tracking-wider text-zinc-500">Upload</p>
            <p class="font-mono text-xs text-zinc-200 tabular-nums">
              {{
                formatMs(
                  testing
                    ? testPhase === "upload"
                      ? liveElapsedMs
                      : liveUploadMs
                    : result?.uploadMs,
                )
              }}
            </p>
          </div>
        </div>
        <div
          class="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-2.5 py-1.5"
        >
          <ArrowDown
            class="h-3.5 w-3.5 shrink-0"
            :stroke-width="2"
            :class="testPhase === 'fetch' && testing ? 'text-emerald-400' : 'text-zinc-500'"
          />
          <div class="min-w-0">
            <p class="text-[10px] uppercase tracking-wider text-zinc-500">Download</p>
            <p class="font-mono text-xs text-zinc-200 tabular-nums">
              {{
                formatMs(
                  testing
                    ? testPhase === "fetch" && liveUploadMs != null
                      ? liveElapsedMs - liveUploadMs
                      : null
                    : result?.fetchMs,
                )
              }}
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="!testing && result"
        class="space-y-1 text-center font-mono text-[10px] text-zinc-500 tabular-nums"
      >
        <p>round trip {{ formatMs(result.totalMs) }} &middot; tested {{ formatTime(result.at) }}</p>
        <p v-if="result.cid" class="truncate px-4 text-zinc-600" :title="result.cid">
          {{ result.cid }}
        </p>
        <p v-if="!result.ok" class="text-[11px] text-red-400 font-sans">{{ result.error }}</p>
      </div>
    </div>

    <p class="text-[11px] text-zinc-500 leading-relaxed">
      Test uploads a random 8&nbsp;KB text blob and fetches it back. Rating is linear 100&rarr;0
      over a {{ windowSeconds }}&nbsp;s round trip; slower or failed is 0.
    </p>
  </div>
</template>

<style scoped>
.gauge-value {
  transition: stroke-dasharray 0.9s cubic-bezier(0.22, 1, 0.36, 1);
}
.gauge-sweep {
  transform-origin: center;
  transform-box: fill-box;
  animation: gauge-sweep 1.2s linear infinite;
}
@keyframes gauge-sweep {
  to {
    transform: rotate(360deg);
  }
}
</style>
