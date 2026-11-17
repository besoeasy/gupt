<script setup>
import { computed } from "vue";
import DownloaderGraphic from "./DownloaderGraphic.vue";
import { DOWNLOAD_PHASE } from "@/lib/downloader.js";

const props = defineProps({
  progress: { type: Object, default: null },
  compact: { type: Boolean, default: false },
  retryable: { type: Boolean, default: true },
  eventId: { type: String, default: "" },
  fileName: { type: String, default: "" },
  fileSize: { type: Number, default: 0 },
});

const emit = defineEmits(["retry", "download", "save"]);

const normalizedProgress = computed(() => {
  if (!props.progress) return null;
  const raw = props.progress;
  let phase = raw.phase;

  // Map legacy phases if present
  if (phase === "fetch") phase = DOWNLOAD_PHASE.DOWNLOADING;
  if (phase === "decrypt") phase = DOWNLOAD_PHASE.DECRYPTING;
  if (phase === "done" || phase === "cached") phase = DOWNLOAD_PHASE.READY;
  if (phase === "queued") phase = DOWNLOAD_PHASE.QUEUED;
  if (phase === "failed") {
    const errStr = String(raw.error || "").toLowerCase();
    if (
      errStr.includes("not available yet") ||
      errStr.includes("missing") ||
      errStr.includes("incomplete") ||
      (raw.missingCount && raw.missingCount > 0)
    ) {
      phase = DOWNLOAD_PHASE.MISSING_PARTS;
    } else {
      phase = DOWNLOAD_PHASE.FAILED;
    }
  }

  const rawParts = Array.isArray(raw.parts)
    ? raw.parts
    : Array.isArray(raw.sources?.[0]?.parts)
      ? raw.sources[0].parts
      : [];

  const parts = rawParts.map((p, idx) => {
    if (typeof p === "string") {
      const isMissing =
        phase === DOWNLOAD_PHASE.MISSING_PARTS &&
        (idx > 0 || (raw.missingCount && idx >= raw.partsLoaded));
      return {
        index: idx,
        hash: p,
        status: isMissing ? "missing" : (raw.partsLoaded > idx ? "done" : "pending"),
      };
    }
    return p;
  });

  const partsTotal = raw.partsTotal || raw.totalParts || parts.length || 1;
  const partsLoaded = raw.partsLoaded || parts.filter((p) => p.status === "done" || p.status === "available").length;
  const missingCount = raw.missingCount || (phase === DOWNLOAD_PHASE.MISSING_PARTS ? Math.max(1, partsTotal - partsLoaded) : 0);

  return {
    ...raw,
    phase,
    percent: typeof raw.percent === "number" ? raw.percent : 0,
    partsTotal,
    partsLoaded,
    missingCount,
    parts,
    error: raw.error,
  };
});

const rawEventId = computed(() => {
  const explicit = String(props.eventId || "").trim();
  if (explicit) return explicit;
  return String(props.progress?.eventId || "").trim();
});
</script>

<template>
  <div v-if="normalizedProgress" class="w-full transition-opacity duration-300">
    <DownloaderGraphic
      :progress="normalizedProgress"
      :compact="compact"
      :file-name="fileName"
      :file-size="fileSize"
      :can-retry="retryable"
      :event-id="rawEventId"
      @retry="emit('retry')"
      @download="emit('download')"
      @save="emit('save')"
    />
  </div>
</template>
