<script setup>
import { computed, ref, onBeforeUnmount } from "vue";
import { copyToClipboard } from "@/lib/clipboard.js";
import { formatBytes } from "@/lib/chatUtils.js";
import { DOWNLOAD_PHASE } from "@/lib/downloader.js";

const props = defineProps({
  progress: {
    type: Object,
    default: () => ({}),
  },
  fileName: {
    type: String,
    default: "",
  },
  fileSize: {
    type: Number,
    default: 0,
  },
  fileMime: {
    type: String,
    default: "",
  },
  compact: {
    type: Boolean,
    default: false,
  },
  canRetry: {
    type: Boolean,
    default: true,
  },
  canDownload: {
    type: Boolean,
    default: true,
  },
  eventId: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["download", "retry", "save"]);

const phase = computed(() => props.progress?.phase || DOWNLOAD_PHASE.IDLE);
const percent = computed(() => {
  const p = Number(props.progress?.percent || 0);
  return Math.min(100, Math.max(0, Math.round(p)));
});

const parts = computed(() => {
  if (Array.isArray(props.progress?.parts) && props.progress.parts.length) {
    return props.progress.parts;
  }
  return [];
});

const totalParts = computed(() => props.progress?.partsTotal || parts.value.length || 1);
const loadedParts = computed(() => props.progress?.partsLoaded || parts.value.filter((p) => p.status === "done" || p.status === "available").length || 0);
const missingCount = computed(() => props.progress?.missingCount || parts.value.filter((p) => p.status === "missing").length || 0);

const isMissingParts = computed(() => phase.value === DOWNLOAD_PHASE.MISSING_PARTS || missingCount.value > 0);
const isProbing = computed(() => phase.value === DOWNLOAD_PHASE.PROBING);
const isDownloading = computed(() => phase.value === DOWNLOAD_PHASE.DOWNLOADING || phase.value === DOWNLOAD_PHASE.QUEUED);
const isDecrypting = computed(() => phase.value === DOWNLOAD_PHASE.DECRYPTING);
const isReady = computed(() => phase.value === DOWNLOAD_PHASE.READY || phase.value === DOWNLOAD_PHASE.CACHED);
const isFailed = computed(() => phase.value === DOWNLOAD_PHASE.FAILED);
const isBusy = computed(() => isProbing.value || isDownloading.value || isDecrypting.value);

// Circular SVG Progress Math (Radius 42, Circumference = 2 * PI * 42 ~= 263.89)
const CIRCUMFERENCE = 263.89;
const strokeDashoffset = computed(() => {
  return CIRCUMFERENCE - (percent.value / 100) * CIRCUMFERENCE;
});

const showInspector = ref(false);
const copiedIndex = ref(-1);
let copyTimer = null;

async function copyHash(hash, index) {
  if (!hash) return;
  await copyToClipboard(hash);
  copiedIndex.value = index;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copiedIndex.value = -1;
  }, 1800);
}

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer);
});

const statusTitle = computed(() => {
  if (isMissingParts.value) return "Incomplete Upload";
  if (isProbing.value) return "Scanning Relays";
  if (isDownloading.value) return "Downloading";
  if (isDecrypting.value) return "Decrypting";
  if (isReady.value) return "Ready to Open";
  if (isFailed.value) return "Download Failed";
  return "Encrypted File";
});

const statusSubtitle = computed(() => {
  if (isMissingParts.value) {
    return `${loadedParts.value} of ${totalParts.value} chunks available · ${missingCount.value} missing on relay`;
  }
  if (isProbing.value) {
    return `Verifying ${totalParts.value} chunk${totalParts.value > 1 ? "s" : ""} on relay cluster…`;
  }
  if (isDownloading.value) {
    const loaded = props.progress?.loadedBytes || 0;
    const total = props.progress?.totalBytes || props.fileSize || 0;
    if (loaded > 0 && total > 0) {
      return `${formatBytes(loaded)} / ${formatBytes(total)} (${percent.value}%)`;
    }
    return `${loadedParts.value}/${totalParts.value} parts (${percent.value}%)`;
  }
  if (isDecrypting.value) {
    return "Decrypting AES-GCM container…";
  }
  if (isReady.value) {
    return props.fileSize ? formatBytes(props.fileSize) : "Downloaded & verified";
  }
  if (isFailed.value) {
    return props.progress?.error || "Could not retrieve from relays";
  }
  return props.fileSize ? formatBytes(props.fileSize) : `${totalParts.value} chunk${totalParts.value > 1 ? "s" : ""}`;
});
</script>

<template>
  <div
    class="w-full select-none rounded-2xl border border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md p-3.5 shadow-xl transition-all duration-300 animate-in fade-in"
    :class="compact ? 'max-w-xs' : 'max-w-md'"
  >
    <!-- Top Info Row -->
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="min-w-0 flex-1">
        <h4
          v-if="fileName"
          class="truncate text-sm font-semibold text-zinc-100 tracking-tight"
          :title="fileName"
        >
          {{ fileName }}
        </h4>
        <div class="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] font-mono">
          <span
            class="font-medium"
            :class="[
              isMissingParts ? 'text-amber-400' : '',
              isReady ? 'text-emerald-400' : '',
              isFailed ? 'text-red-400' : '',
              isBusy ? 'text-sky-400' : '',
              !isMissingParts && !isReady && !isFailed && !isBusy ? 'text-zinc-400' : '',
            ]"
          >
            {{ statusTitle }}
          </span>
          <span class="text-zinc-600">·</span>
          <span class="truncate text-zinc-400 text-[10px]">
            {{ statusSubtitle }}
          </span>
        </div>
      </div>

      <!-- Action Button (Min 44px touch target) -->
      <div class="flex items-center gap-1 shrink-0">
        <button
          v-if="isReady"
          type="button"
          @click.stop="emit('save')"
          class="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 active:scale-95 transition-all duration-150 inline-flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer"
          aria-label="Save file to device"
        >
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Save</span>
        </button>

        <button
          v-else-if="isMissingParts || isFailed"
          type="button"
          @click.stop="emit('retry')"
          class="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 hover:text-white active:scale-95 transition-all duration-150 inline-flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer"
          aria-label="Retry probe or download"
        >
          <svg class="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span>Retry</span>
        </button>

        <button
          v-else-if="!isBusy"
          type="button"
          @click.stop="emit('download')"
          class="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:bg-sky-500/20 active:scale-95 transition-all duration-150 inline-flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer"
          aria-label="Download and decrypt file"
        >
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Download</span>
        </button>
      </div>
    </div>

    <!-- Centerpiece SVG Stage -->
    <div class="relative flex flex-col items-center justify-center py-2.5">
      <div class="relative flex items-center justify-center">
        <!-- Circular Progress Ring SVG -->
        <svg
          class="h-24 w-24 -rotate-90 transform"
          viewBox="0 0 100 100"
        >
          <defs>
            <linearGradient id="guptDownloadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#38bdf8" />
              <stop offset="100%" stop-color="#10b981" />
            </linearGradient>
            <linearGradient id="guptMissingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f59e0b" />
              <stop offset="100%" stop-color="#ef4444" />
            </linearGradient>
          </defs>

          <!-- Background Track -->
          <circle
            cx="50"
            cy="50"
            r="42"
            class="stroke-zinc-800"
            stroke-width="5"
            fill="none"
          />

          <!-- Live Progress Stroke -->
          <circle
            v-if="isBusy || isReady"
            cx="50"
            cy="50"
            r="42"
            stroke="url(#guptDownloadGrad)"
            stroke-width="5"
            fill="none"
            stroke-linecap="round"
            class="transition-all duration-300 ease-out"
            :stroke-dasharray="CIRCUMFERENCE"
            :stroke-dashoffset="strokeDashoffset"
          />

          <!-- Warning Ring for Missing Chunks -->
          <circle
            v-else-if="isMissingParts"
            cx="50"
            cy="50"
            r="42"
            stroke="url(#guptMissingGrad)"
            stroke-width="5"
            stroke-dasharray="6 6"
            fill="none"
            class="animate-pulse"
          />
        </svg>

        <!-- Center Icon Graphic -->
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <!-- State: Missing Parts / Incomplete Upload -->
          <template v-if="isMissingParts">
            <svg class="h-8 w-8 text-amber-400 animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span class="text-[10px] font-mono font-bold text-amber-300 mt-0.5">404</span>
          </template>

          <!-- State: Probing -->
          <template v-else-if="isProbing">
            <div class="relative flex items-center justify-center">
              <span class="absolute h-8 w-8 rounded-full bg-sky-500/20 animate-ping" />
              <svg class="h-7 w-7 text-sky-400 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12" />
              </svg>
            </div>
            <span class="text-[9px] font-mono text-sky-300 mt-1">PROBING</span>
          </template>

          <!-- State: Downloading -->
          <template v-else-if="isDownloading">
            <svg class="h-6 w-6 text-sky-400 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3v12" />
              <polyline points="8 11 12 15 16 11" />
              <path d="M5 20h14" />
            </svg>
            <span class="text-[11px] font-mono font-bold text-zinc-200 tabular-nums">
              {{ percent }}%
            </span>
          </template>

          <!-- State: Decrypting -->
          <template v-else-if="isDecrypting">
            <svg class="h-7 w-7 text-emerald-400 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
            <span class="text-[9px] font-mono text-emerald-300 mt-0.5">DECRYPT</span>
          </template>

          <!-- State: Ready -->
          <template v-else-if="isReady">
            <svg class="h-8 w-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span class="text-[9px] font-mono text-emerald-300 font-bold mt-0.5">READY</span>
          </template>

          <!-- State: Idle / Fallback -->
          <template v-else>
            <svg class="h-7 w-7 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </template>
        </div>
      </div>
    </div>

    <!-- Multi-Part Chunk Matrix (Segmented SVG strip) -->
    <div v-if="totalParts > 1" class="mt-2 pt-2 border-t border-zinc-900">
      <div class="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1 px-0.5">
        <span class="uppercase tracking-wider font-semibold">Chunk Health:</span>
        <span class="tabular-nums font-semibold" :class="missingCount > 0 ? 'text-amber-400' : 'text-zinc-300'">
          {{ loadedParts }}/{{ totalParts }} verified
        </span>
      </div>

      <!-- Segmented Bar -->
      <div class="flex items-center gap-1 w-full h-3 py-0.5">
        <div
          v-for="(part, idx) in (parts.length ? parts : Array.from({ length: totalParts }, (_, i) => ({ index: i, status: 'pending' })))"
          :key="part.hash || idx"
          class="h-2 flex-1 rounded-sm transition-all duration-200 relative group cursor-pointer"
          :class="[
            part.status === 'done' || part.status === 'available' ? 'bg-emerald-500 shadow-sm shadow-emerald-500/20' : '',
            part.status === 'downloading' ? 'bg-sky-400 animate-pulse' : '',
            part.status === 'probing' ? 'bg-sky-600 animate-pulse' : '',
            part.status === 'missing' ? 'bg-red-500/90 border border-red-400' : '',
            part.status === 'pending' || !part.status ? 'bg-zinc-800' : '',
          ]"
          :title="`Chunk #${idx + 1}: ${part.status || 'pending'}`"
          @click="showInspector = !showInspector"
        />
      </div>

      <!-- Missing Parts Warning Banner -->
      <div
        v-if="isMissingParts"
        class="mt-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200 font-mono leading-relaxed flex items-start gap-2"
      >
        <svg class="h-4 w-4 text-amber-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-amber-300">Sender upload was interrupted</p>
          <p class="text-amber-200/80 text-[10px] mt-0.5">
            Only {{ loadedParts }} of {{ totalParts }} pieces exist on the network. The sender closed their app before finishing the upload.
          </p>
        </div>
      </div>

      <!-- Toggle Detailed Inspector -->
      <div class="mt-2 flex items-center justify-between">
        <button
          type="button"
          @click.stop="showInspector = !showInspector"
          class="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors py-1 cursor-pointer"
        >
          <span>{{ showInspector ? "Hide chunk hashes" : "Inspect chunk hashes" }}</span>
          <svg
            class="h-3 w-3 transform transition-transform duration-200"
            :class="showInspector ? 'rotate-180' : ''"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <a
          v-if="eventId"
          :href="`https://rabta.gupt.app/api/v1/events/${eventId}`"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors py-1 cursor-pointer"
        >
          Relay Event ↗
        </a>
      </div>

      <!-- Collapsible Detailed Inspector -->
      <div
        v-if="showInspector && parts.length"
        class="mt-2 max-h-40 overflow-y-auto space-y-1 rounded-xl bg-black/40 border border-zinc-900 p-2 font-mono text-[10px]"
      >
        <div
          v-for="(part, idx) in parts"
          :key="part.hash || idx"
          class="flex items-center justify-between gap-2 py-1 px-1.5 rounded-lg hover:bg-zinc-900/60 transition-colors"
        >
          <span class="text-zinc-500 shrink-0">#{{ idx + 1 }}</span>
          <span
            class="truncate font-mono"
            :class="part.status === 'missing' ? 'text-red-400' : 'text-zinc-300'"
          >
            {{ part.hash ? `${part.hash.slice(0, 10)}…${part.hash.slice(-8)}` : "Pending" }}
          </span>

          <span
            class="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold shrink-0"
            :class="[
              part.status === 'available' || part.status === 'done' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : '',
              part.status === 'missing' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : '',
              part.status === 'downloading' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : '',
              part.status === 'pending' || !part.status ? 'bg-zinc-800 text-zinc-400' : '',
            ]"
          >
            {{ part.status === 'missing' ? '404 Missing' : (part.status === 'available' || part.status === 'done' ? 'OK' : part.status) }}
          </span>

          <button
            v-if="part.hash"
            type="button"
            @click.stop="copyHash(part.hash, idx)"
            class="p-1 hover:text-white text-zinc-400 transition-colors cursor-pointer"
            :title="`Copy hash of chunk #${idx + 1}`"
          >
            <svg v-if="copiedIndex === idx" class="h-3 w-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <svg v-else class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
