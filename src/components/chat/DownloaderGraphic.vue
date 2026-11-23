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
    class="downloader"
    :class="{ 'downloader--compact': compact }"
  >
    <!-- Top Info Row -->
    <div class="downloader__head">
      <div class="downloader__head-body">
        <h4
          v-if="fileName"
          class="downloader__name"
          :title="fileName"
        >
          {{ fileName }}
        </h4>
        <div class="downloader__status">
          <span
            class="downloader__state"
            :class="[
              isMissingParts ? 'downloader__state--warn' : '',
              isReady ? 'downloader__state--ok' : '',
              isFailed ? 'downloader__state--bad' : '',
              isBusy ? 'downloader__state--info' : '',
              !isMissingParts && !isReady && !isFailed && !isBusy ? 'downloader__state--quiet' : '',
            ]"
          >
            {{ statusTitle }}
          </span>
          <span class="downloader__dot">·</span>
          <span class="downloader__sub">
            {{ statusSubtitle }}
          </span>
        </div>
      </div>

      <!-- Action Button (Min 44px touch target) -->
      <div class="downloader__actions">
        <button
          v-if="isReady"
          type="button"
          @click.stop="emit('save')"
          class="downloader__btn downloader__btn--ink"
          aria-label="Save file to device"
        >
          <svg class="downloader__btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
          class="downloader__btn"
          aria-label="Retry probe or download"
        >
          <svg class="downloader__btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
          class="downloader__btn downloader__btn--ink"
          aria-label="Download and decrypt file"
        >
          <svg class="downloader__btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Download</span>
        </button>
      </div>
    </div>

    <!-- Centerpiece SVG Stage -->
    <div class="downloader__stage">
      <div class="downloader__ring">
        <!-- Circular Progress Ring SVG -->
        <svg
          class="downloader__ring-svg"
          viewBox="0 0 100 100"
        >
          <defs>
            <linearGradient id="guptDownloadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="var(--app-primary)" />
              <stop offset="100%" stop-color="var(--app-success)" />
            </linearGradient>
            <linearGradient id="guptMissingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="var(--app-warning)" />
              <stop offset="100%" stop-color="var(--app-danger)" />
            </linearGradient>
          </defs>

          <!-- Background Track -->
          <circle
            cx="50"
            cy="50"
            r="42"
            class="downloader__track"
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
            class="downloader__arc"
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
            class="downloader__arc-missing"
          />
        </svg>

        <!-- Center Icon Graphic -->
        <div class="downloader__core">
          <!-- State: Missing Parts / Incomplete Upload -->
          <template v-if="isMissingParts">
            <svg class="downloader__core-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span class="downloader__code">404</span>
          </template>

          <!-- State: Probing -->
          <template v-else-if="isProbing">
            <div class="downloader__spinner">
              <span class="downloader__spinner-track" />
              <svg class="downloader__spinner-arc" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12" />
              </svg>
            </div>
            <span class="downloader__label">PROBING</span>
          </template>

          <!-- State: Downloading -->
          <template v-else-if="isDownloading">
            <svg class="downloader__core-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3v12" />
              <polyline points="8 11 12 15 16 11" />
              <path d="M5 20h14" />
            </svg>
            <span class="downloader__percent">
              {{ percent }}%
            </span>
          </template>

          <!-- State: Decrypting -->
          <template v-else-if="isDecrypting">
            <svg class="downloader__core-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
            <span class="downloader__label">DECRYPT</span>
          </template>

          <!-- State: Ready -->
          <template v-else-if="isReady">
            <svg class="downloader__core-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span class="downloader__label">READY</span>
          </template>

          <!-- State: Idle / Fallback -->
          <template v-else>
            <svg class="downloader__core-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </template>
        </div>
      </div>
    </div>

    <!-- Multi-Part Chunk Matrix (Segmented SVG strip) -->
    <div v-if="totalParts > 1" class="downloader__chunks">
      <div class="downloader__chunks-head">
        <span class="downloader__chunks-label">Chunk Health:</span>
        <span class="downloader__chunks-count" :class="missingCount > 0 ? 'downloader__chunks-count--warn' : 'downloader__chunks-count--ok'">
          {{ loadedParts }}/{{ totalParts }} verified
        </span>
      </div>

      <!-- Segmented Bar -->
      <div class="downloader__strip">
        <div
          v-for="(part, idx) in (parts.length ? parts : Array.from({ length: totalParts }, (_, i) => ({ index: i, status: 'pending' })))"
          :key="part.hash || idx"
          class="downloader__chunk"
          :class="[
            part.status === 'done' || part.status === 'available' ? 'downloader__chunk--done' : '',
            part.status === 'downloading' ? 'downloader__chunk--active' : '',
            part.status === 'probing' ? 'downloader__chunk--probe' : '',
            part.status === 'missing' ? 'downloader__chunk--missing' : '',
            part.status === 'pending' || !part.status ? 'downloader__chunk--pending' : '',
          ]"
          :title="`Chunk #${idx + 1}: ${part.status || 'pending'}`"
          @click="showInspector = !showInspector"
        />
      </div>

      <!-- Missing Parts Warning Banner -->
      <div
        v-if="isMissingParts"
        class="downloader__warn"
      >
        <svg class="downloader__warn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div class="downloader__warn-body">
          <p class="downloader__warn-title">Sender upload was interrupted</p>
          <p class="downloader__warn-note">
            Only {{ loadedParts }} of {{ totalParts }} pieces exist on the network. The sender closed their app before finishing the upload.
          </p>
        </div>
      </div>

      <!-- Toggle Detailed Inspector -->
      <div class="downloader__tools">
        <button
          type="button"
          @click.stop="showInspector = !showInspector"
          class="downloader__tool"
        >
          <span>{{ showInspector ? "Hide chunk hashes" : "Inspect chunk hashes" }}</span>
          <svg
            class="downloader__tool-icon"
            :class="showInspector ? 'downloader__tool-icon--open' : ''"
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
          class="downloader__link"
        >
          Relay Event ↗
        </a>
      </div>

      <!-- Collapsible Detailed Inspector -->
      <div
        v-if="showInspector && parts.length"
        class="downloader__inspector"
      >
        <div
          v-for="(part, idx) in parts"
          :key="part.hash || idx"
          class="downloader__part"
        >
          <span class="downloader__part-index">#{{ idx + 1 }}</span>
          <span
            class="downloader__part-hash"
            :class="part.status === 'missing' ? 'downloader__part-hash--missing' : 'downloader__part-hash--quiet'"
          >
            {{ part.hash ? `${part.hash.slice(0, 10)}…${part.hash.slice(-8)}` : "Pending" }}
          </span>

          <span
            class="downloader__part-status"
            :class="[
              part.status === 'available' || part.status === 'done' ? 'downloader__part-status--ok' : '',
              part.status === 'missing' ? 'downloader__part-status--missing' : '',
              part.status === 'downloading' ? 'downloader__part-status--active' : '',
              part.status === 'pending' || !part.status ? 'downloader__part-status--quiet' : '',
            ]"
          >
            {{ part.status === 'missing' ? '404 Missing' : (part.status === 'available' || part.status === 'done' ? 'OK' : part.status) }}
          </span>

          <button
            v-if="part.hash"
            type="button"
            @click.stop="copyHash(part.hash, idx)"
            class="downloader__copy"
            :title="`Copy hash of chunk #${idx + 1}`"
          >
            <svg v-if="copiedIndex === idx" class="downloader__copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <svg v-else class="downloader__copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
/* Ledger pass: a download is a small instrument panel, not a poster. */

.downloader {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface-soft);
  color: var(--app-text);
  animation: ledger-fade 240ms var(--app-ease-standard) both;
}

.downloader--compact {
  max-width: 320px;
}

/* ---- Head ---- */

.downloader__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.downloader__head-body {
  min-width: 0;
}

.downloader__name {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloader__status {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  margin-top: 3px;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.downloader__state {
  font-weight: 500;
}

.downloader__state--quiet {
  color: var(--app-muted-2);
}

.downloader__state--info {
  color: var(--app-primary);
}

.downloader__state--ok {
  color: var(--app-success);
}

.downloader__state--warn {
  color: var(--app-warning);
}

.downloader__state--bad {
  color: var(--app-danger);
}

.downloader__dot {
  color: var(--app-border-strong);
}

.downloader__sub {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.downloader__actions {
  display: flex;
  flex-shrink: 0;
  gap: 5px;
}

.downloader__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 28px;
  padding-inline: 9px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.downloader__btn--ink {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.downloader__btn:active {
  transform: translateY(1px);
}

.downloader__btn-icon {
  width: 11px;
  height: 11px;
}

.downloader__btn:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
}

/* ---- Ring stage ---- */

.downloader__stage {
  display: flex;
  justify-content: center;
  padding-block: 4px;
}

.downloader__ring {
  position: relative;
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
}

.downloader__ring-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.downloader__track {
  stroke: var(--app-surface-inset-strong);
}

.downloader__arc {
  stroke: var(--app-primary);
  transition: stroke-dashoffset 320ms var(--app-ease-standard);
}

.downloader__arc-missing {
  stroke: var(--app-warning);
}

.downloader__core {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--app-text);
}

.downloader__core-icon {
  width: 20px;
  height: 20px;
  color: var(--app-muted);
}

.downloader__percent {
  font-family: var(--font-mono);
  font-size: 17px;
  font-weight: 500;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--app-text);
}

.downloader__code {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--app-warning);
}

.downloader__label {
  font-family: var(--font-mono);
  font-size: 7.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.downloader__spinner {
  position: relative;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
}

.downloader__spinner-track,
.downloader__spinner-arc {
  position: absolute;
  inset: 0;
  width: 22px;
  height: 22px;
}

.downloader__spinner-track {
  border: 1px solid var(--app-border-strong);
  border-radius: 50%;
}

.downloader__spinner-arc {
  color: var(--app-primary);
  animation: var(--animate-spin);
}

/* ---- Chunks ---- */

.downloader__chunks {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-top: 10px;
  border-top: 1px solid var(--app-border);
}

.downloader__chunks-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.downloader__chunks-label {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.downloader__chunks-count {
  font-family: var(--font-mono);
  font-size: 8px;
  font-variant-numeric: tabular-nums;
}

.downloader__chunks-count--ok {
  color: var(--app-success);
}

.downloader__chunks-count--warn {
  color: var(--app-warning);
}

.downloader__strip {
  display: flex;
  gap: 2px;
}

.downloader__chunk {
  flex: 1;
  height: 14px;
  border: 1px solid var(--app-border);
  border-radius: 2px;
  background: transparent;
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

.downloader__chunk--pending {
  background: var(--app-surface-inset-strong);
}

.downloader__chunk--done {
  border-color: var(--app-text);
  background: var(--app-text);
}

.downloader__chunk--active {
  border-color: var(--app-primary);
  background: color-mix(in oklab, var(--app-primary) 40%, transparent);
  animation: downloader-chunk-pulse 1.2s var(--app-ease-standard) infinite;
}

.downloader__chunk--probe {
  border-color: var(--app-primary);
  animation: downloader-chunk-pulse 1.6s var(--app-ease-standard) infinite;
}

.downloader__chunk--missing {
  border-color: color-mix(in oklab, var(--app-danger) 50%, var(--app-border));
  background: var(--app-danger-soft);
}

@keyframes downloader-chunk-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

/* ---- Warning ---- */

.downloader__warn {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 8px 9px;
  border: 1px solid color-mix(in oklab, var(--app-warning) 30%, var(--app-border));
  border-radius: var(--app-radius-sm);
  background: var(--app-warning-soft);
}

.downloader__warn-icon {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  margin-top: 1px;
  color: var(--app-warning);
}

.downloader__warn-body {
  min-width: 0;
}

.downloader__warn-title {
  margin: 0;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--app-warning);
}

.downloader__warn-note {
  margin: 2px 0 0;
  font-size: 10px;
  line-height: 1.55;
  color: var(--app-muted);
}

/* ---- Tools ---- */

.downloader__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.downloader__tool {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.downloader__tool-icon {
  width: 10px;
  height: 10px;
  transition: transform var(--app-dur-fast) var(--app-ease-standard);
}

.downloader__tool-icon--open {
  transform: rotate(180deg);
}

.downloader__link {
  min-height: 24px;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-primary);
  text-decoration: none;
}

/* ---- Inspector ---- */

.downloader__inspector {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-fade 200ms var(--app-ease-standard) both;
}

.downloader__part {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 5px 8px;
}

.downloader__part + .downloader__part {
  border-top: 1px solid var(--app-border);
}

.downloader__part-index {
  flex-shrink: 0;
  width: 22px;
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.downloader__part-hash {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  color: var(--app-text-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloader__part-hash--missing {
  color: var(--app-danger);
}

.downloader__part-hash--quiet {
  color: var(--app-muted-2);
}

.downloader__part-status {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 7.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.downloader__part-status--ok {
  color: var(--app-success);
}

.downloader__part-status--missing {
  color: var(--app-danger);
}

.downloader__part-status--active {
  color: var(--app-primary);
}

.downloader__part-status--quiet {
  color: var(--app-muted-2);
}

.downloader__copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.downloader__copy-icon {
  width: 9px;
  height: 9px;
}

@media (hover: hover) {
  .downloader__btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .downloader__btn--ink:hover {
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .downloader__chunk:hover {
    border-color: var(--app-border-strong);
  }

  .downloader__tool:hover,
  .downloader__link:hover,
  .downloader__copy:hover {
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .downloader__btn,
  .downloader__tool,
  .downloader__link,
  .downloader__copy {
    min-height: var(--app-touch-h);
  }

  .downloader__copy {
    min-width: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .downloader,
  .downloader__inspector,
  .downloader__chunk--active,
  .downloader__chunk--probe,
  .downloader__spinner-arc {
    animation: none;
  }

  .downloader__arc,
  .downloader__btn,
  .downloader__chunk,
  .downloader__tool,
  .downloader__tool-icon,
  .downloader__copy {
    transition: none;
  }
}
</style>
