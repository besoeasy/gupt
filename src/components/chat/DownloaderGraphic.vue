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
    class="downloader-graphic__block"
    :class="compact ? 'downloader-graphic__block--variant-1' : 'downloader-graphic__block--variant-2'"
  >
    <!-- Top Info Row -->
    <div class="downloader-graphic__block-2">
      <div class="downloader-graphic__block-3">
        <h4
          v-if="fileName"
          class="downloader-graphic__heading"
          :title="fileName"
        >
          {{ fileName }}
        </h4>
        <div class="downloader-graphic__block-4">
          <span
            class="downloader-graphic__text"
            :class="[
              isMissingParts ? 'downloader-graphic__text--warning' : '',
              isReady ? 'downloader-graphic__text--success' : '',
              isFailed ? 'downloader-graphic__text--danger' : '',
              isBusy ? 'downloader-graphic__text--info' : '',
              !isMissingParts && !isReady && !isFailed && !isBusy ? 'downloader-graphic__text--muted' : '',
            ]"
          >
            {{ statusTitle }}
          </span>
          <span class="downloader-graphic__text-2">·</span>
          <span class="downloader-graphic__text-3">
            {{ statusSubtitle }}
          </span>
        </div>
      </div>

      <!-- Action Button (Min 44px touch target) -->
      <div class="downloader-graphic__block-5">
        <button
          v-if="isReady"
          type="button"
          @click.stop="emit('save')"
          class="downloader-graphic__button-save-file"
          aria-label="Save file to device"
        >
          <svg class="downloader-graphic__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
          class="downloader-graphic__button-retry-probe"
          aria-label="Retry probe or download"
        >
          <svg class="downloader-graphic__icon-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
          class="downloader-graphic__button-download-and"
          aria-label="Download and decrypt file"
        >
          <svg class="downloader-graphic__icon-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Download</span>
        </button>
      </div>
    </div>

    <!-- Centerpiece SVG Stage -->
    <div class="downloader-graphic__block-6">
      <div class="downloader-graphic__block-7">
        <!-- Circular Progress Ring SVG -->
        <svg
          class="downloader-graphic__icon-4"
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
            class="downloader-graphic__icon-shape"
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
            class="downloader-graphic__icon-shape-2"
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
            class="downloader-graphic__icon-shape-3"
          />
        </svg>

        <!-- Center Icon Graphic -->
        <div class="downloader-graphic__block-8">
          <!-- State: Missing Parts / Incomplete Upload -->
          <template v-if="isMissingParts">
            <svg class="downloader-graphic__icon-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span class="downloader-graphic__text-404">404</span>
          </template>

          <!-- State: Probing -->
          <template v-else-if="isProbing">
            <div class="downloader-graphic__block-9">
              <span class="downloader-graphic__text-4" />
              <svg class="downloader-graphic__icon-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12" />
              </svg>
            </div>
            <span class="downloader-graphic__text-probing">PROBING</span>
          </template>

          <!-- State: Downloading -->
          <template v-else-if="isDownloading">
            <svg class="downloader-graphic__icon-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3v12" />
              <polyline points="8 11 12 15 16 11" />
              <path d="M5 20h14" />
            </svg>
            <span class="downloader-graphic__text-5">
              {{ percent }}%
            </span>
          </template>

          <!-- State: Decrypting -->
          <template v-else-if="isDecrypting">
            <svg class="downloader-graphic__icon-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
            <span class="downloader-graphic__text-decrypt">DECRYPT</span>
          </template>

          <!-- State: Ready -->
          <template v-else-if="isReady">
            <svg class="downloader-graphic__icon-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span class="downloader-graphic__text-ready">READY</span>
          </template>

          <!-- State: Idle / Fallback -->
          <template v-else>
            <svg class="downloader-graphic__icon-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </template>
        </div>
      </div>
    </div>

    <!-- Multi-Part Chunk Matrix (Segmented SVG strip) -->
    <div v-if="totalParts > 1" class="downloader-graphic__block-10">
      <div class="downloader-graphic__block-11">
        <span class="downloader-graphic__text-chunk-health">Chunk Health:</span>
        <span class="downloader-graphic__text-6" :class="missingCount > 0 ? 'downloader-graphic__text--warning-2' : 'downloader-graphic__text--variant-2'">
          {{ loadedParts }}/{{ totalParts }} verified
        </span>
      </div>

      <!-- Segmented Bar -->
      <div class="downloader-graphic__block-12">
        <div
          v-for="(part, idx) in (parts.length ? parts : Array.from({ length: totalParts }, (_, i) => ({ index: i, status: 'pending' })))"
          :key="part.hash || idx"
          class="downloader-graphic__block-13"
          :class="[
            part.status === 'done' || part.status === 'available' ? 'downloader-graphic__block--success' : '',
            part.status === 'downloading' ? 'downloader-graphic__block--pulse' : '',
            part.status === 'probing' ? 'downloader-graphic__block--pulse-2' : '',
            part.status === 'missing' ? 'downloader-graphic__block--danger' : '',
            part.status === 'pending' || !part.status ? 'downloader-graphic__block--selected' : '',
          ]"
          :title="`Chunk #${idx + 1}: ${part.status || 'pending'}`"
          @click="showInspector = !showInspector"
        />
      </div>

      <!-- Missing Parts Warning Banner -->
      <div
        v-if="isMissingParts"
        class="downloader-graphic__block-14"
      >
        <svg class="downloader-graphic__icon-11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div class="downloader-graphic__block-15">
          <p class="downloader-graphic__text-7">Sender upload was interrupted</p>
          <p class="downloader-graphic__text-8">
            Only {{ loadedParts }} of {{ totalParts }} pieces exist on the network. The sender closed their app before finishing the upload.
          </p>
        </div>
      </div>

      <!-- Toggle Detailed Inspector -->
      <div class="downloader-graphic__block-16">
        <button
          type="button"
          @click.stop="showInspector = !showInspector"
          class="downloader-graphic__button"
        >
          <span>{{ showInspector ? "Hide chunk hashes" : "Inspect chunk hashes" }}</span>
          <svg
            class="downloader-graphic__icon-12"
            :class="showInspector ? 'downloader-graphic__icon--variant-1' : ''"
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
          class="downloader-graphic__link"
        >
          Relay Event ↗
        </a>
      </div>

      <!-- Collapsible Detailed Inspector -->
      <div
        v-if="showInspector && parts.length"
        class="downloader-graphic__block-17"
      >
        <div
          v-for="(part, idx) in parts"
          :key="part.hash || idx"
          class="downloader-graphic__block-18"
        >
          <span class="downloader-graphic__text-9">#{{ idx + 1 }}</span>
          <span
            class="downloader-graphic__text-10"
            :class="part.status === 'missing' ? 'downloader-graphic__text--danger-2' : 'downloader-graphic__text--variant-2-2'"
          >
            {{ part.hash ? `${part.hash.slice(0, 10)}…${part.hash.slice(-8)}` : "Pending" }}
          </span>

          <span
            class="downloader-graphic__text-11"
            :class="[
              part.status === 'available' || part.status === 'done' ? 'downloader-graphic__text--success-2' : '',
              part.status === 'missing' ? 'downloader-graphic__text--danger-3' : '',
              part.status === 'downloading' ? 'downloader-graphic__text--info-2' : '',
              part.status === 'pending' || !part.status ? 'downloader-graphic__text--muted-2' : '',
            ]"
          >
            {{ part.status === 'missing' ? '404 Missing' : (part.status === 'available' || part.status === 'done' ? 'OK' : part.status) }}
          </span>

          <button
            v-if="part.hash"
            type="button"
            @click.stop="copyHash(part.hash, idx)"
            class="downloader-graphic__button-2"
            :title="`Copy hash of chunk #${idx + 1}`"
          >
            <svg v-if="copiedIndex === idx" class="downloader-graphic__icon-13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <svg v-else class="downloader-graphic__icon-14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {






































@media (hover:hover) {
.downloader-graphic__button-save-file:hover {
  background-color: #00bb7f33;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__button-save-file:hover {
  background-color: color-mix(in oklab,var(--color-emerald-500) 20%,transparent);
}
}
}

@media (hover:hover) {
.downloader-graphic__button-download-and:hover {
  background-color: #00a5ef33;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__button-download-and:hover {
  background-color: color-mix(in oklab,var(--color-sky-500) 20%,transparent);
}
}
}

@media (hover:hover) {
.downloader-graphic__button-retry-probe:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.downloader-graphic__block-18:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__block-18:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}
}

@media (hover:hover) {
.downloader-graphic__button-retry-probe:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.downloader-graphic__button-2:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.downloader-graphic__button:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.downloader-graphic__link:hover {
  color: var(--ui-zinc-300);
}
}

@layer gupt-components {
.downloader-graphic__block-8 {
  pointer-events: none;
}
.downloader-graphic__block-8 {
  position: absolute;
}
.downloader-graphic__text-4 {
  position: absolute;
}
.downloader-graphic__block-6 {
  position: relative;
}
.downloader-graphic__block-7 {
  position: relative;
}
.downloader-graphic__block-9 {
  position: relative;
}
.downloader-graphic__block-13 {
  position: relative;
}
.downloader-graphic__block-8 {
  inset: 0;
}
.downloader-graphic__block-4 {
  margin-top: calc(var(--spacing) * .5);
}
.downloader-graphic__text-404 {
  margin-top: calc(var(--spacing) * .5);
}
.downloader-graphic__text-decrypt {
  margin-top: calc(var(--spacing) * .5);
}
.downloader-graphic__text-ready {
  margin-top: calc(var(--spacing) * .5);
}
.downloader-graphic__icon-11 {
  margin-top: calc(var(--spacing) * .5);
}
.downloader-graphic__text-8 {
  margin-top: calc(var(--spacing) * .5);
}
.downloader-graphic__text-probing {
  margin-top: var(--spacing);
}
.downloader-graphic__block-10 {
  margin-top: calc(var(--spacing) * 2);
}
.downloader-graphic__block-16 {
  margin-top: calc(var(--spacing) * 2);
}
.downloader-graphic__block-17 {
  margin-top: calc(var(--spacing) * 2);
}
.downloader-graphic__block-14 {
  margin-top: calc(var(--spacing) * 2.5);
}
.downloader-graphic__block-11 {
  margin-bottom: var(--spacing);
}
.downloader-graphic__block-2 {
  margin-bottom: calc(var(--spacing) * 3);
}
.downloader-graphic__block-2 {
  display: flex;
}
.downloader-graphic__block-4 {
  display: flex;
}
.downloader-graphic__block-5 {
  display: flex;
}
.downloader-graphic__block-6 {
  display: flex;
}
.downloader-graphic__block-7 {
  display: flex;
}
.downloader-graphic__block-8 {
  display: flex;
}
.downloader-graphic__block-9 {
  display: flex;
}
.downloader-graphic__block-11 {
  display: flex;
}
.downloader-graphic__block-12 {
  display: flex;
}
.downloader-graphic__block-14 {
  display: flex;
}
.downloader-graphic__block-16 {
  display: flex;
}
.downloader-graphic__block-18 {
  display: flex;
}
.downloader-graphic__button-save-file {
  display: inline-flex;
}
.downloader-graphic__button-retry-probe {
  display: inline-flex;
}
.downloader-graphic__button-download-and {
  display: inline-flex;
}
.downloader-graphic__button {
  display: inline-flex;
}
.downloader-graphic__block-13 {
  height: calc(var(--spacing) * 2);
}
.downloader-graphic__block-12 {
  height: calc(var(--spacing) * 3);
}
.downloader-graphic__icon-12 {
  height: calc(var(--spacing) * 3);
}
.downloader-graphic__icon-13 {
  height: calc(var(--spacing) * 3);
}
.downloader-graphic__icon-14 {
  height: calc(var(--spacing) * 3);
}
.downloader-graphic__icon {
  height: calc(var(--spacing) * 4);
}
.downloader-graphic__icon-2 {
  height: calc(var(--spacing) * 4);
}
.downloader-graphic__icon-3 {
  height: calc(var(--spacing) * 4);
}
.downloader-graphic__icon-11 {
  height: calc(var(--spacing) * 4);
}
.downloader-graphic__icon-7 {
  height: calc(var(--spacing) * 6);
}
.downloader-graphic__icon-6 {
  height: calc(var(--spacing) * 7);
}
.downloader-graphic__icon-8 {
  height: calc(var(--spacing) * 7);
}
.downloader-graphic__icon-10 {
  height: calc(var(--spacing) * 7);
}
.downloader-graphic__icon-5 {
  height: calc(var(--spacing) * 8);
}
.downloader-graphic__text-4 {
  height: calc(var(--spacing) * 8);
}
.downloader-graphic__icon-9 {
  height: calc(var(--spacing) * 8);
}
.downloader-graphic__icon-4 {
  height: calc(var(--spacing) * 24);
}
.downloader-graphic__block-17 {
  max-height: calc(var(--spacing) * 40);
}
.downloader-graphic__button-save-file {
  min-height: 44px;
}
.downloader-graphic__button-retry-probe {
  min-height: 44px;
}
.downloader-graphic__button-download-and {
  min-height: 44px;
}
.downloader-graphic__icon-12 {
  width: calc(var(--spacing) * 3);
}
.downloader-graphic__icon-13 {
  width: calc(var(--spacing) * 3);
}
.downloader-graphic__icon-14 {
  width: calc(var(--spacing) * 3);
}
.downloader-graphic__icon {
  width: calc(var(--spacing) * 4);
}
.downloader-graphic__icon-2 {
  width: calc(var(--spacing) * 4);
}
.downloader-graphic__icon-3 {
  width: calc(var(--spacing) * 4);
}
.downloader-graphic__icon-11 {
  width: calc(var(--spacing) * 4);
}
.downloader-graphic__icon-7 {
  width: calc(var(--spacing) * 6);
}
.downloader-graphic__icon-6 {
  width: calc(var(--spacing) * 7);
}
.downloader-graphic__icon-8 {
  width: calc(var(--spacing) * 7);
}
.downloader-graphic__icon-10 {
  width: calc(var(--spacing) * 7);
}
.downloader-graphic__icon-5 {
  width: calc(var(--spacing) * 8);
}
.downloader-graphic__text-4 {
  width: calc(var(--spacing) * 8);
}
.downloader-graphic__icon-9 {
  width: calc(var(--spacing) * 8);
}
.downloader-graphic__icon-4 {
  width: calc(var(--spacing) * 24);
}
.downloader-graphic__block {
  width: 100%;
}
.downloader-graphic__block-12 {
  width: 100%;
}
.downloader-graphic__block--variant-2 {
  max-width: var(--container-md);
}
.downloader-graphic__block--variant-1 {
  max-width: var(--container-xs);
}
.downloader-graphic__block-3 {
  min-width: 0;
}
.downloader-graphic__block-15 {
  min-width: 0;
}
.downloader-graphic__button-save-file {
  min-width: 44px;
}
.downloader-graphic__button-retry-probe {
  min-width: 44px;
}
.downloader-graphic__button-download-and {
  min-width: 44px;
}
.downloader-graphic__block-3 {
  flex: 1;
}
.downloader-graphic__block-13 {
  flex: 1;
}
.downloader-graphic__block-15 {
  flex: 1;
}
.downloader-graphic__block-5 {
  flex-shrink: 0;
}
.downloader-graphic__icon {
  flex-shrink: 0;
}
.downloader-graphic__icon-2 {
  flex-shrink: 0;
}
.downloader-graphic__icon-3 {
  flex-shrink: 0;
}
.downloader-graphic__icon-11 {
  flex-shrink: 0;
}
.downloader-graphic__text-9 {
  flex-shrink: 0;
}
.downloader-graphic__text-11 {
  flex-shrink: 0;
}
.downloader-graphic__icon-4 {
  rotate: -90deg;
}
.downloader-graphic__icon--variant-1 {
  rotate: 180deg;
}
.downloader-graphic__icon-4 {
  transform: var(--rotate-x,) var(--rotate-y,) var(--rotate-z,) var(--skew-x,) var(--skew-y,);
}
.downloader-graphic__icon-12 {
  transform: var(--rotate-x,) var(--rotate-y,) var(--rotate-z,) var(--skew-x,) var(--skew-y,);
}
.downloader-graphic__icon-5 {
  animation: var(--animate-bounce);
}
.downloader-graphic__text-4 {
  animation: var(--animate-ping);
}
.downloader-graphic__icon-shape-3 {
  animation: var(--animate-pulse);
}
.downloader-graphic__icon-7 {
  animation: var(--animate-pulse);
}
.downloader-graphic__icon-8 {
  animation: var(--animate-pulse);
}
.downloader-graphic__block--pulse {
  animation: var(--animate-pulse);
}
.downloader-graphic__block--pulse-2 {
  animation: var(--animate-pulse);
}
.downloader-graphic__icon-6 {
  animation: var(--animate-spin);
}
.downloader-graphic__button-save-file {
  cursor: pointer;
}
.downloader-graphic__button-retry-probe {
  cursor: pointer;
}
.downloader-graphic__button-download-and {
  cursor: pointer;
}
.downloader-graphic__block-13 {
  cursor: pointer;
}
.downloader-graphic__button {
  cursor: pointer;
}
.downloader-graphic__link {
  cursor: pointer;
}
.downloader-graphic__button-2 {
  cursor: pointer;
}
.downloader-graphic__block-6 {
  flex-direction: column;
}
.downloader-graphic__block-8 {
  flex-direction: column;
}
.downloader-graphic__block-4 {
  flex-wrap: wrap;
}
.downloader-graphic__block-4 {
  align-items: center;
}
.downloader-graphic__block-5 {
  align-items: center;
}
.downloader-graphic__button-save-file {
  align-items: center;
}
.downloader-graphic__button-retry-probe {
  align-items: center;
}
.downloader-graphic__button-download-and {
  align-items: center;
}
.downloader-graphic__block-6 {
  align-items: center;
}
.downloader-graphic__block-7 {
  align-items: center;
}
.downloader-graphic__block-8 {
  align-items: center;
}
.downloader-graphic__block-9 {
  align-items: center;
}
.downloader-graphic__block-11 {
  align-items: center;
}
.downloader-graphic__block-12 {
  align-items: center;
}
.downloader-graphic__block-16 {
  align-items: center;
}
.downloader-graphic__button {
  align-items: center;
}
.downloader-graphic__block-18 {
  align-items: center;
}
.downloader-graphic__block-2 {
  align-items: flex-start;
}
.downloader-graphic__block-14 {
  align-items: flex-start;
}
.downloader-graphic__block-2 {
  justify-content: space-between;
}
.downloader-graphic__block-11 {
  justify-content: space-between;
}
.downloader-graphic__block-16 {
  justify-content: space-between;
}
.downloader-graphic__block-18 {
  justify-content: space-between;
}
.downloader-graphic__button-save-file {
  justify-content: center;
}
.downloader-graphic__button-retry-probe {
  justify-content: center;
}
.downloader-graphic__button-download-and {
  justify-content: center;
}
.downloader-graphic__block-6 {
  justify-content: center;
}
.downloader-graphic__block-7 {
  justify-content: center;
}
.downloader-graphic__block-8 {
  justify-content: center;
}
.downloader-graphic__block-9 {
  justify-content: center;
}
.downloader-graphic__block-5 {
  gap: var(--spacing);
}
.downloader-graphic__block-12 {
  gap: var(--spacing);
}
.downloader-graphic__button {
  gap: var(--spacing);
}
.downloader-graphic__block-4 {
  gap: calc(var(--spacing) * 1.5);
}
.downloader-graphic__button-save-file {
  gap: calc(var(--spacing) * 1.5);
}
.downloader-graphic__button-retry-probe {
  gap: calc(var(--spacing) * 1.5);
}
.downloader-graphic__button-download-and {
  gap: calc(var(--spacing) * 1.5);
}
.downloader-graphic__block-14 {
  gap: calc(var(--spacing) * 2);
}
.downloader-graphic__block-18 {
  gap: calc(var(--spacing) * 2);
}
.downloader-graphic__block-2 {
  gap: calc(var(--spacing) * 3);
}
:where(.downloader-graphic__block-17>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
.downloader-graphic__heading {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.downloader-graphic__text-3 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.downloader-graphic__text-10 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.downloader-graphic__block-17 {
  overflow-y: auto;
}
.downloader-graphic__text-11 {
  border-radius: .25rem;
}
.downloader-graphic__block {
  border-radius: var(--radius-2xl);
}
.downloader-graphic__text-4 {
  border-radius: 3.40282e38px;
}
.downloader-graphic__block-18 {
  border-radius: var(--radius-lg);
}
.downloader-graphic__block-13 {
  border-radius: var(--radius-sm);
}
.downloader-graphic__button-save-file {
  border-radius: var(--radius-xl);
}
.downloader-graphic__button-retry-probe {
  border-radius: var(--radius-xl);
}
.downloader-graphic__button-download-and {
  border-radius: var(--radius-xl);
}
.downloader-graphic__block-14 {
  border-radius: var(--radius-xl);
}
.downloader-graphic__block-17 {
  border-radius: var(--radius-xl);
}
.downloader-graphic__block {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.downloader-graphic__button-save-file {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.downloader-graphic__button-retry-probe {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.downloader-graphic__button-download-and {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.downloader-graphic__block--danger {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.downloader-graphic__block-14 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.downloader-graphic__block-17 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.downloader-graphic__text--success-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.downloader-graphic__text--danger-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.downloader-graphic__text--info-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.downloader-graphic__block-10 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.downloader-graphic__block-14 {
  border-color: #f99c004d;
}
.downloader-graphic__text--success-2 {
  border-color: #00bb7f33;
}
.downloader-graphic__button-save-file {
  border-color: #00bb7f4d;
}
.downloader-graphic__block--danger {
  border-color: var(--color-red-400);
}
.downloader-graphic__text--danger-3 {
  border-color: #fb2c3633;
}
.downloader-graphic__text--info-2 {
  border-color: #00a5ef33;
}
.downloader-graphic__button-download-and {
  border-color: #00a5ef4d;
}
.downloader-graphic__button-retry-probe {
  border-color: var(--ui-zinc-700);
}
.downloader-graphic__block {
  border-color: var(--ui-zinc-800);
}
.downloader-graphic__block-10 {
  border-color: var(--ui-zinc-900);
}
.downloader-graphic__block-17 {
  border-color: var(--ui-zinc-900);
}
.downloader-graphic__block-14 {
  background-color: var(--app-warning-soft);
}
.downloader-graphic__block-17 {
  background-color: var(--ui-black);
}
.downloader-graphic__block--success {
  background-color: var(--color-emerald-500);
}
.downloader-graphic__button-save-file {
  background-color: #00bb7f1a;
}
.downloader-graphic__text--success-2 {
  background-color: #00bb7f1a;
}
.downloader-graphic__text--danger-3 {
  background-color: var(--app-danger-soft);
}
.downloader-graphic__block--danger {
  background-color: #fb2c36e6;
}
.downloader-graphic__block--pulse {
  background-color: var(--color-sky-400);
}
.downloader-graphic__button-download-and {
  background-color: var(--app-info-soft);
}
.downloader-graphic__text--info-2 {
  background-color: var(--app-info-soft);
}
.downloader-graphic__text-4 {
  background-color: #00a5ef33;
}
.downloader-graphic__block--pulse-2 {
  background-color: var(--color-sky-600);
}
.downloader-graphic__block--selected {
  background-color: var(--ui-zinc-800);
}
.downloader-graphic__text--muted-2 {
  background-color: var(--ui-zinc-800);
}
.downloader-graphic__button-retry-probe {
  background-color: var(--ui-zinc-900);
}
.downloader-graphic__block {
  background-color: var(--ui-zinc-950);
}
.downloader-graphic__icon-shape {
  stroke: var(--ui-zinc-800);
}
.downloader-graphic__button-2 {
  padding: var(--spacing);
}
.downloader-graphic__block-17 {
  padding: calc(var(--spacing) * 2);
}
.downloader-graphic__block-14 {
  padding: calc(var(--spacing) * 2.5);
}
.downloader-graphic__block {
  padding: calc(var(--spacing) * 3.5);
}
.downloader-graphic__block-11 {
  padding-inline: calc(var(--spacing) * .5);
}
.downloader-graphic__block-18 {
  padding-inline: calc(var(--spacing) * 1.5);
}
.downloader-graphic__text-11 {
  padding-inline: calc(var(--spacing) * 1.5);
}
.downloader-graphic__button-save-file {
  padding-inline: calc(var(--spacing) * 3.5);
}
.downloader-graphic__button-retry-probe {
  padding-inline: calc(var(--spacing) * 3.5);
}
.downloader-graphic__button-download-and {
  padding-inline: calc(var(--spacing) * 3.5);
}
.downloader-graphic__block-12 {
  padding-block: calc(var(--spacing) * .5);
}
.downloader-graphic__text-11 {
  padding-block: calc(var(--spacing) * .5);
}
.downloader-graphic__button {
  padding-block: var(--spacing);
}
.downloader-graphic__link {
  padding-block: var(--spacing);
}
.downloader-graphic__block-18 {
  padding-block: var(--spacing);
}
.downloader-graphic__block-6 {
  padding-block: calc(var(--spacing) * 2.5);
}
.downloader-graphic__block-10 {
  padding-top: calc(var(--spacing) * 2);
}
.downloader-graphic__block-4 {
  font-family: var(--font-mono);
}
.downloader-graphic__text-404 {
  font-family: var(--font-mono);
}
.downloader-graphic__text-probing {
  font-family: var(--font-mono);
}
.downloader-graphic__text-5 {
  font-family: var(--font-mono);
}
.downloader-graphic__text-decrypt {
  font-family: var(--font-mono);
}
.downloader-graphic__text-ready {
  font-family: var(--font-mono);
}
.downloader-graphic__block-11 {
  font-family: var(--font-mono);
}
.downloader-graphic__block-14 {
  font-family: var(--font-mono);
}
.downloader-graphic__button {
  font-family: var(--font-mono);
}
.downloader-graphic__link {
  font-family: var(--font-mono);
}
.downloader-graphic__block-17 {
  font-family: var(--font-mono);
}
.downloader-graphic__text-10 {
  font-family: var(--font-mono);
}
.downloader-graphic__heading {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.downloader-graphic__button-save-file {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.downloader-graphic__button-retry-probe {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.downloader-graphic__button-download-and {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.downloader-graphic__text-probing {
  font-size: 9px;
}
.downloader-graphic__text-decrypt {
  font-size: 9px;
}
.downloader-graphic__text-ready {
  font-size: 9px;
}
.downloader-graphic__text-11 {
  font-size: 9px;
}
.downloader-graphic__text-3 {
  font-size: 10px;
}
.downloader-graphic__text-404 {
  font-size: 10px;
}
.downloader-graphic__block-11 {
  font-size: 10px;
}
.downloader-graphic__text-8 {
  font-size: 10px;
}
.downloader-graphic__button {
  font-size: 10px;
}
.downloader-graphic__link {
  font-size: 10px;
}
.downloader-graphic__block-17 {
  font-size: 10px;
}
.downloader-graphic__block-4 {
  font-size: 11px;
}
.downloader-graphic__text-5 {
  font-size: 11px;
}
.downloader-graphic__block-14 {
  font-size: 11px;
}
.downloader-graphic__block-14 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.downloader-graphic__text-404 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.downloader-graphic__text-5 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.downloader-graphic__text-ready {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.downloader-graphic__text-11 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.downloader-graphic__text {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.downloader-graphic__heading {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.downloader-graphic__button-save-file {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.downloader-graphic__button-retry-probe {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.downloader-graphic__button-download-and {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.downloader-graphic__text-chunk-health {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.downloader-graphic__text-6 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.downloader-graphic__text-7 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.downloader-graphic__heading {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.downloader-graphic__text-chunk-health {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.downloader-graphic__block-14 {
  color: var(--color-amber-200);
}
.downloader-graphic__text-8 {
  color: #fee685cc;
}
.downloader-graphic__text-404 {
  color: var(--color-amber-300);
}
.downloader-graphic__text-7 {
  color: var(--color-amber-300);
}
.downloader-graphic__text--warning {
  color: var(--color-amber-400);
}
.downloader-graphic__icon-5 {
  color: var(--color-amber-400);
}
.downloader-graphic__text--warning-2 {
  color: var(--color-amber-400);
}
.downloader-graphic__icon-11 {
  color: var(--color-amber-400);
}
.downloader-graphic__button-save-file {
  color: var(--color-emerald-300);
}
.downloader-graphic__text-decrypt {
  color: var(--color-emerald-300);
}
.downloader-graphic__text-ready {
  color: var(--color-emerald-300);
}
.downloader-graphic__text--success {
  color: var(--color-emerald-400);
}
.downloader-graphic__icon-8 {
  color: var(--color-emerald-400);
}
.downloader-graphic__icon-9 {
  color: var(--color-emerald-400);
}
.downloader-graphic__text--success-2 {
  color: var(--color-emerald-400);
}
.downloader-graphic__icon-13 {
  color: var(--color-emerald-400);
}
.downloader-graphic__text--danger {
  color: var(--color-red-400);
}
.downloader-graphic__text--danger-2 {
  color: var(--color-red-400);
}
.downloader-graphic__text--danger-3 {
  color: var(--color-red-400);
}
.downloader-graphic__button-download-and {
  color: var(--color-sky-300);
}
.downloader-graphic__text-probing {
  color: var(--color-sky-300);
}
.downloader-graphic__text--info {
  color: var(--color-sky-400);
}
.downloader-graphic__icon-6 {
  color: var(--color-sky-400);
}
.downloader-graphic__icon-7 {
  color: var(--color-sky-400);
}
.downloader-graphic__text--info-2 {
  color: var(--color-sky-400);
}
.downloader-graphic__heading {
  color: var(--ui-zinc-100);
}
.downloader-graphic__button-retry-probe {
  color: var(--ui-zinc-200);
}
.downloader-graphic__text-5 {
  color: var(--ui-zinc-200);
}
.downloader-graphic__text--variant-2 {
  color: var(--ui-zinc-300);
}
.downloader-graphic__text--variant-2-2 {
  color: var(--ui-zinc-300);
}
.downloader-graphic__text--muted {
  color: var(--ui-zinc-400);
}
.downloader-graphic__text-3 {
  color: var(--ui-zinc-400);
}
.downloader-graphic__icon-2 {
  color: var(--ui-zinc-400);
}
.downloader-graphic__icon-10 {
  color: var(--ui-zinc-400);
}
.downloader-graphic__block-11 {
  color: var(--ui-zinc-400);
}
.downloader-graphic__button {
  color: var(--ui-zinc-400);
}
.downloader-graphic__text--muted-2 {
  color: var(--ui-zinc-400);
}
.downloader-graphic__button-2 {
  color: var(--ui-zinc-400);
}
.downloader-graphic__link {
  color: var(--ui-zinc-500);
}
.downloader-graphic__text-9 {
  color: var(--ui-zinc-500);
}
.downloader-graphic__text-2 {
  color: var(--ui-zinc-600);
}
.downloader-graphic__text-chunk-health {
  text-transform: uppercase;
}
.downloader-graphic__text-11 {
  text-transform: uppercase;
}
.downloader-graphic__text-5 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.downloader-graphic__text-6 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.downloader-graphic__link {
  text-decoration-line: underline;
}
.downloader-graphic__link {
  text-underline-offset: 2px;
}
.downloader-graphic__block--success {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.downloader-graphic__block {
  --shadow: 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
}
.downloader-graphic__block--success {
  --shadow-color: #00bb7f33;
}
.downloader-graphic__block {
  --backdrop-blur: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
  backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
}
.downloader-graphic__block {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.downloader-graphic__button-save-file {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.downloader-graphic__button-retry-probe {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.downloader-graphic__button-download-and {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.downloader-graphic__icon-shape-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.downloader-graphic__block-13 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.downloader-graphic__button {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.downloader-graphic__link {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.downloader-graphic__block-18 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.downloader-graphic__button-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.downloader-graphic__icon-12 {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.downloader-graphic__button-save-file {
  --duration: .15s;
  transition-duration: .15s;
}
.downloader-graphic__button-retry-probe {
  --duration: .15s;
  transition-duration: .15s;
}
.downloader-graphic__button-download-and {
  --duration: .15s;
  transition-duration: .15s;
}
.downloader-graphic__block-13 {
  --duration: .2s;
  transition-duration: .2s;
}
.downloader-graphic__icon-12 {
  --duration: .2s;
  transition-duration: .2s;
}
.downloader-graphic__block {
  --duration: .3s;
  transition-duration: .3s;
}
.downloader-graphic__icon-shape-2 {
  --duration: .3s;
  transition-duration: .3s;
}
.downloader-graphic__icon-shape-2 {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.downloader-graphic__block {
  -webkit-user-select: none;
  user-select: none;
}
.downloader-graphic__button-save-file:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.downloader-graphic__button-retry-probe:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.downloader-graphic__button-download-and:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
[data-theme="light"] .downloader-graphic__block-14 {
  color: var(--app-warning-strong);
}
[data-theme="light"] .downloader-graphic__text-404 {
  color: var(--app-warning-strong);
}
[data-theme="light"] .downloader-graphic__text-7 {
  color: var(--app-warning-strong);
}
[data-theme="light"] .downloader-graphic__text--warning {
  color: var(--app-warning);
}
[data-theme="light"] .downloader-graphic__icon-5 {
  color: var(--app-warning);
}
[data-theme="light"] .downloader-graphic__text--warning-2 {
  color: var(--app-warning);
}
[data-theme="light"] .downloader-graphic__icon-11 {
  color: var(--app-warning);
}
[data-theme="light"] .downloader-graphic__button-save-file {
  color: var(--app-success);
}
[data-theme="light"] .downloader-graphic__text-decrypt {
  color: var(--app-success);
}
[data-theme="light"] .downloader-graphic__text-ready {
  color: var(--app-success);
}
[data-theme="light"] .downloader-graphic__text--success {
  color: var(--app-success);
}
[data-theme="light"] .downloader-graphic__icon-8 {
  color: var(--app-success);
}
[data-theme="light"] .downloader-graphic__icon-9 {
  color: var(--app-success);
}
[data-theme="light"] .downloader-graphic__text--success-2 {
  color: var(--app-success);
}
[data-theme="light"] .downloader-graphic__icon-13 {
  color: var(--app-success);
}
[data-theme="light"] .downloader-graphic__text--danger {
  color: var(--app-danger);
}
[data-theme="light"] .downloader-graphic__text--danger-2 {
  color: var(--app-danger);
}
[data-theme="light"] .downloader-graphic__text--danger-3 {
  color: var(--app-danger);
}
[data-theme="light"] .downloader-graphic__button-download-and {
  color: var(--app-info);
}
[data-theme="light"] .downloader-graphic__text-probing {
  color: var(--app-info);
}
[data-theme="light"] .downloader-graphic__text--info {
  color: var(--app-info);
}
[data-theme="light"] .downloader-graphic__icon-6 {
  color: var(--app-info);
}
[data-theme="light"] .downloader-graphic__icon-7 {
  color: var(--app-info);
}
[data-theme="light"] .downloader-graphic__text--info-2 {
  color: var(--app-info);
}
[data-theme="light"] .downloader-graphic__text--variant-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .downloader-graphic__text--variant-2-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .downloader-graphic__text--muted {
  color: var(--app-muted);
}
[data-theme="light"] .downloader-graphic__text-3 {
  color: var(--app-muted);
}
[data-theme="light"] .downloader-graphic__icon-2 {
  color: var(--app-muted);
}
[data-theme="light"] .downloader-graphic__icon-10 {
  color: var(--app-muted);
}
[data-theme="light"] .downloader-graphic__block-11 {
  color: var(--app-muted);
}
[data-theme="light"] .downloader-graphic__button {
  color: var(--app-muted);
}
[data-theme="light"] .downloader-graphic__text--muted-2 {
  color: var(--app-muted);
}
[data-theme="light"] .downloader-graphic__button-2 {
  color: var(--app-muted);
}
[data-theme="light"] .downloader-graphic__link {
  color: var(--app-muted);
}
[data-theme="light"] .downloader-graphic__text-9 {
  color: var(--app-muted);
}
[data-theme="light"] .downloader-graphic__text-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .downloader-graphic__button:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .downloader-graphic__link:hover {
  color: var(--app-text) !important;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__block-14 {
  border-color: color-mix(in oklab,var(--color-amber-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__text--success-2 {
  border-color: color-mix(in oklab,var(--color-emerald-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__button-save-file {
  border-color: color-mix(in oklab,var(--color-emerald-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__text--danger-3 {
  border-color: color-mix(in oklab,var(--color-red-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__text--info-2 {
  border-color: color-mix(in oklab,var(--color-sky-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__button-download-and {
  border-color: color-mix(in oklab,var(--color-sky-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__block {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__block-17 {
  background-color: color-mix(in oklab,var(--ui-black) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__button-save-file {
  background-color: color-mix(in oklab,var(--color-emerald-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__text--success-2 {
  background-color: color-mix(in oklab,var(--color-emerald-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__block--danger {
  background-color: color-mix(in oklab,var(--color-red-500) 90%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__text-4 {
  background-color: color-mix(in oklab,var(--color-sky-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__block {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 90%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__text-8 {
  color: color-mix(in oklab,var(--color-amber-200) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.downloader-graphic__block--success {
  --shadow-color: color-mix(in oklab, color-mix(in oklab, var(--color-emerald-500) 20%, transparent) var(--shadow-alpha,100%), transparent);
}
}
}
</style>
