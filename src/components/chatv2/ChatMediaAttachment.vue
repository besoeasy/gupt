<script setup>
import { computed } from "vue";
import { Download } from "@/icons";
import { getFileLabel, isAudio, isImage, isVideo } from "@/lib/chatUtils";
import { MEDIA_PHASE } from "@/lib/mediaDecrypt";
import ChatAudioPlayer from "@/components/chatv2/ChatAudioPlayer.vue";

const props = defineProps({
  message: { type: Object, required: true },
  blobUrl: { type: String, default: null },
  previewUnavailable: { type: Boolean, default: false },
  isMediaBusy: { type: Boolean, default: false },
  mediaProgress: { type: Object, default: null },
  hasFailed: { type: Boolean, default: false },
  /** A non-previewable intact file tile is rendered separately in the parent. */
  showMediaDownloadTile: { type: Boolean, default: false },
  /** Media preview rendered outside the bubble; hide the in-bubble copy. */
  showExternalMediaPreview: { type: Boolean, default: false },
});

const emit = defineEmits(["download", "retry", "image-load", "media-error", "open-lightbox"]);

const mediaMime = computed(() => props.message?.media?.mime || "application/octet-stream");

const showInBubbleImage = computed(
  () =>
    !props.showExternalMediaPreview &&
    !props.previewUnavailable &&
    isImage(mediaMime.value) &&
    Boolean(props.blobUrl),
);
const showInBubbleVideo = computed(
  () =>
    !props.showExternalMediaPreview &&
    !props.previewUnavailable &&
    isVideo(mediaMime.value) &&
    Boolean(props.blobUrl),
);
const showAudio = computed(() => isAudio(mediaMime.value) && Boolean(props.blobUrl));

const fileExtension = computed(() => {
  const name = String(getFileLabel(props.message) || "");
  const fromName = name.match(/\.([a-z0-9]+)$/i);
  if (fromName) return fromName[1].toLowerCase();
  const subtype = String(mediaMime.value).split("/")[1] || "";
  return subtype && subtype !== "octet-stream" ? subtype : "";
});

const fileBaseName = computed(() => {
  const name = String(getFileLabel(props.message) || "Attachment");
  if (!fileExtension.value) return name;
  const stripped = name.replace(new RegExp(`\\.${fileExtension.value}$`, "i"), "");
  return stripped || name;
});

const mediaPartsCount = computed(() => {
  const parts = props.message?.media?.parts;
  return Array.isArray(parts) ? parts.length : 0;
});

const downloadActionLabel = computed(() => {
  if (props.blobUrl) return "Download";
  if (!props.isMediaBusy) return "Decrypt";
  const pct = props.mediaProgress?.percent;
  if (typeof pct === "number" && pct > 0) return `${Math.round(pct)}%`;
  const partsLoaded = props.mediaProgress?.partsLoaded;
  const totalParts = props.mediaProgress?.totalParts;
  if (partsLoaded && totalParts && totalParts > 1) return `${partsLoaded}/${totalParts}`;
  const phase = props.mediaProgress?.phase;
  if (phase === MEDIA_PHASE.QUEUED) return "Queued…";
  if (phase === MEDIA_PHASE.DECRYPT) return "Decrypting…";
  return "Downloading…";
});


function onImageError() {
  emit("media-error", props.message);
}
</script>

<template>
  <div class="chat-message-bubble__media-body">
    <!-- In-bubble preview only when not shown outside (decrypting / non-visual) -->
    <div v-if="showInBubbleImage" class="chat-message-bubble__media-image">
      <img
        :src="blobUrl"
        :alt="getFileLabel(message)"
        class="chat-message-bubble__image-3"
        @click="emit('open-lightbox')"
        @load="emit('image-load')"
        @error="onImageError"
      />
    </div>
    <div v-else-if="showInBubbleVideo" class="chat-message-bubble__media-video">
      <video
        :src="blobUrl"
        controls
        class="chat-message-bubble__video-2"
        @error="onImageError"
      />
    </div>
    <div v-else-if="showAudio">
      <ChatAudioPlayer
        variant="audio"
        :src="blobUrl"
        :message="message"
        :duration-ms="Number(message.durationMs || 0)"
        :is-media-busy="isMediaBusy"
      />
    </div>

    <!-- File meta + download — one inline row: name · format · action -->
    <div class="chat-message-bubble__file-row">
      <span class="chat-message-bubble__file-base">{{ fileBaseName }}</span>
      <template v-if="fileExtension">
        <span class="chat-message-bubble__file-sep" aria-hidden="true">·</span>
        <span class="chat-message-bubble__file-ext">{{ fileExtension }}</span>
      </template>
      <template v-if="mediaPartsCount > 1">
        <span class="chat-message-bubble__file-parts-sep" aria-hidden="true">·</span>
        <span class="chat-message-bubble__file-parts">
          {{
            isMediaBusy && mediaProgress?.partsLoaded
              ? `${mediaProgress.partsLoaded}/${mediaPartsCount} parts`
              : `${mediaPartsCount} parts`
          }}
        </span>
      </template>
      <span class="chat-message-bubble__file-action-sep" aria-hidden="true">·</span>
      <button
        v-if="!showMediaDownloadTile"
        type="button"
        @click="emit('download')"
        class="chat-message-bubble__file-download"
        :disabled="isMediaBusy"
      >
        <Download class="chat-message-bubble__download-3" :stroke-width="1.8" />
        {{ downloadActionLabel }}
      </button>
      <button
        v-if="hasFailed"
        type="button"
        @click="emit('retry')"
        class="chat-message-bubble__button-retry"
      >
        Retry
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-message-bubble__media-body {
  min-width: 0;
}
.chat-message-bubble__media-image {
  max-width: 100%;
  overflow: hidden;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: color-mix(in oklab,var(--app-bg) 40%,transparent);
}
.chat-message-bubble__image-3 {
  display: block;
  max-height: 16rem;
  width: 100%;
  max-width: 100%;
  cursor: zoom-in;
  object-fit: contain;
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-message-bubble__media-video {
  max-width: 100%;
  overflow: hidden;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: color-mix(in oklab,var(--app-bg) 40%,transparent);
}
.chat-message-bubble__video-2 {
  max-height: 16rem;
  width: 100%;
  max-width: 100%;
}

.chat-message-bubble__file-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 0.375rem;
  row-gap: 0.25rem;
  padding-inline: 0.25rem;
  padding-block: 0.25rem;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text-soft);
}
.chat-message-bubble__file-base {
  min-width: 0;
  line-height: 1.375;
  overflow-wrap: break-word;
  white-space: normal;
  color: var(--app-text);
}
.chat-message-bubble__file-sep { flex-shrink: 0; opacity: .4; }
.chat-message-bubble__file-ext { flex-shrink: 0; letter-spacing: 0.025em; text-transform: uppercase; }
.chat-message-bubble__file-parts-sep { flex-shrink: 0; opacity: .4; }
.chat-message-bubble__file-parts { flex-shrink: 0; color: var(--app-text-soft); }
.chat-message-bubble__file-action-sep { flex-shrink: 0; opacity: .4; }
.chat-message-bubble__file-download {
  display: inline-flex;
  flex-shrink: 0;
  cursor: pointer;
  align-items: center;
  gap: 0.25rem;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-message-bubble__file-download:disabled { opacity: .5; }
.chat-message-bubble__button-retry {
  display: inline-flex;
  flex-shrink: 0;
  cursor: pointer;
  align-items: center;
  gap: 0.25rem;
  color: var(--app-danger);
}
.chat-message-bubble__download-3 { height: 0.875rem; width: 0.875rem; }

@media (hover: hover) {
  .chat-message-bubble__image-3:hover { scale: 1.01; }
  .chat-message-bubble__file-download:hover { color: var(--app-text); }
  .chat-message-bubble__button-retry:hover { opacity: .8; }
}

@media (prefers-reduced-motion: reduce) {
  .chat-message-bubble__image-3,
  .chat-message-bubble__file-download {
    transition: none;
  }
}
</style>
