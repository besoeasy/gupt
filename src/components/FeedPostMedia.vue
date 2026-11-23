<script setup>
import { computed, onBeforeUnmount, onMounted } from "vue";
import { Download, FileHeadphone, FileText, Images, RefreshCw } from "@/icons";
import MediaDecryptStatus from "@/components/chat/MediaDecryptStatus.vue";
import { useChatMedia } from "@/composables/useChatMedia";
import { MEDIA_PHASE } from "@/lib/mediaDecrypt";
import { feedFilesToMediaMessages, formatBytes } from "@/lib/feed";
import { isAudio, isImage, isVideo } from "@/lib/chatUtils";

const props = defineProps({
  post: { type: Object, required: true },
  mediaList: { type: Array, default: () => [] },
});

const mediaMessages = computed(() => feedFilesToMediaMessages(props.mediaList));
const messageAt = (idx) => mediaMessages.value[idx];

const {
  mediaBlobUrls,
  mediaProgress,
  decryptFailed,
  preloadMedia,
  downloadMedia,
  retryMedia,
  cleanup: cleanupMedia,
} = useChatMedia();

const visualMedia = computed(() =>
  props.mediaList
    .map((file, idx) => ({ file, idx }))
    .filter(({ file }) => isImage(file.mime) || isVideo(file.mime)),
);
const audioMedia = computed(() =>
  props.mediaList.map((file, idx) => ({ file, idx })).filter(({ file }) => isAudio(file.mime)),
);
const fileMedia = computed(() =>
  props.mediaList
    .map((file, idx) => ({ file, idx }))
    .filter(({ file }) => !isImage(file.mime) && !isVideo(file.mime) && !isAudio(file.mime)),
);

const blobAt = (idx) => mediaBlobUrls[messageAt(idx)?.id];
const progressAt = (idx) => mediaProgress[messageAt(idx)?.id];
const failedAt = (idx) => Boolean(decryptFailed[messageAt(idx)?.id]);

function isLoading(idx) {
  const phase = progressAt(idx)?.phase;
  return phase === MEDIA_PHASE.FETCH || phase === MEDIA_PHASE.DECRYPT || phase === MEDIA_PHASE.QUEUED;
}

function retry(idx) {
  retryMedia(messageAt(idx));
}

async function download(idx, event) {
  event?.stopPropagation();
  await downloadMedia(messageAt(idx)).catch(() => {});
}

onMounted(() => {
  for (const message of mediaMessages.value) preloadMedia(message);
});

onBeforeUnmount(cleanupMedia);
</script>

<template>
  <div class="post-media" @click.stop>
    <div
      v-if="visualMedia.length"
      class="post-media__grid"
      :class="visualMedia.length === 1 ? 'post-media__grid--single' : 'post-media__grid--many'"
    >
      <div
        v-for="{ file, idx } in visualMedia"
        :key="`${post.eventId}:${idx}`"
        class="post-media__cell"
      >
        <img
          v-if="blobAt(idx) && isImage(file.mime)"
          :src="blobAt(idx)"
          :alt="file.name"
          class="post-media__image"
          loading="lazy"
        />
        <video
          v-else-if="blobAt(idx) && isVideo(file.mime)"
          :src="blobAt(idx)"
          controls
          preload="metadata"
          class="post-media__video"
        />
        <div v-else class="post-media__wait">
          <template v-if="isLoading(idx) || failedAt(idx)">
            <MediaDecryptStatus
              :progress="progressAt(idx)"
              :event-id="post.eventId"
              :file-name="file.name"
              :file-size="file.size"
              compact
              retryable
              @retry="retry(idx)"
            />
          </template>
          <template v-else>
            <Images class="post-media__wait-icon" :stroke-width="1.6" aria-hidden="true" />
            <p class="post-media__wait-name">{{ file.name }}</p>
            <p class="post-media__wait-size">{{ formatBytes(file.size) }}</p>
          </template>
        </div>
      </div>
    </div>

    <div v-if="audioMedia.length" class="post-media__stack">
      <div
        v-for="{ file, idx } in audioMedia"
        :key="`${post.eventId}:${idx}`"
        class="post-media__audio-row"
      >
        <div class="post-media__row-head">
          <FileHeadphone class="post-media__file-icon" :stroke-width="1.7" aria-hidden="true" />
          <p class="post-media__file-name">{{ file.name }}</p>
          <span class="post-media__file-size">{{ formatBytes(file.size) }}</span>
        </div>
        <audio
          v-if="blobAt(idx)"
          :src="blobAt(idx)"
          controls
          preload="metadata"
          class="post-media__audio"
        />
        <MediaDecryptStatus
          v-else-if="isLoading(idx) || failedAt(idx)"
          :progress="progressAt(idx)"
          :event-id="post.eventId"
          :file-name="file.name"
          :file-size="file.size"
          retryable
          compact
          @retry="retry(idx)"
        />
        <div v-else class="post-media__pending">Decrypting…</div>
      </div>
    </div>

    <div v-if="fileMedia.length" class="post-media__stack">
      <div
        v-for="{ file, idx } in fileMedia"
        :key="`${post.eventId}:${idx}`"
        class="post-media__file"
      >
        <div class="post-media__tile">
          <FileText class="post-media__file-icon" :stroke-width="1.7" aria-hidden="true" />
        </div>
        <div class="post-media__file-body">
          <p class="post-media__file-name">{{ file.name }}</p>
          <p class="post-media__file-size">
            {{ formatBytes(file.size) }}
            <span v-if="failedAt(idx)"> · decrypt failed</span>
          </p>
          <MediaDecryptStatus
            v-if="isLoading(idx) || failedAt(idx)"
            :progress="progressAt(idx)"
            :event-id="post.eventId"
            :file-name="file.name"
            :file-size="file.size"
            retryable
            compact
            @retry="retry(idx)"
          />
        </div>
        <div class="post-media__actions">
          <button v-if="failedAt(idx)" type="button" class="post-media__action" @click="retry(idx)">
            <RefreshCw class="post-media__action-icon" :stroke-width="1.8" aria-hidden="true" />
            <span>Retry</span>
          </button>
          <button type="button" class="post-media__action" @click="download(idx, $event)">
            <Download class="post-media__action-icon" :stroke-width="1.8" aria-hidden="true" />
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ledger pass: media is mounted in ruled wells, never floating tiles. */

.post-media {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
}

/* ---- Visuals ---- */

.post-media__grid {
  display: grid;
  gap: 1px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-border);
  overflow: hidden;
}

.post-media__grid--single {
  grid-template-columns: 1fr;
}

.post-media__grid--many {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.post-media__cell {
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 120px;
  background: var(--app-surface-inset);
  overflow: hidden;
}

.post-media__image {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 420px;
  object-fit: cover;
  transition: transform var(--app-dur-xslow) var(--app-ease-swift);
}

.post-media__grid--many .post-media__image {
  height: 200px;
}

.post-media__video {
  display: block;
  width: 100%;
  max-height: 420px;
}

.post-media__wait {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--app-space-4);
  text-align: center;
}

.post-media__wait-icon {
  width: 18px;
  height: 18px;
  color: var(--app-muted-2);
}

.post-media__wait-name {
  margin: 0;
  font-size: 11.5px;
  color: var(--app-muted);
  overflow-wrap: anywhere;
}

.post-media__wait-size {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted-2);
}

/* ---- Rows ---- */

.post-media__stack {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
}

.post-media__audio-row {
  padding: var(--app-space-3);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.post-media__row-head {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  min-width: 0;
}

.post-media__file-icon {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
  color: var(--app-muted);
}

.post-media__file-name {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.post-media__file-size {
  flex-shrink: 0;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--app-muted-2);
}

.post-media__audio {
  width: 100%;
  margin-top: var(--app-space-2);
}

.post-media__pending {
  padding-top: var(--app-space-2);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted);
}

/* ---- Files ---- */

.post-media__file {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  min-width: 0;
  padding: var(--app-space-2) var(--app-space-3);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
  transition: border-color var(--app-dur-fast) var(--app-ease-standard);
}

.post-media__tile {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--app-surface);
  color: var(--app-muted);
}

.post-media__file-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.post-media__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
}

.post-media__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

.post-media__action-icon {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
}

.post-media__action:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 2px;
}

@media (hover: hover) {
  .post-media__cell:hover .post-media__image {
    transform: scale(1.012);
  }

  .post-media__action:hover {
    color: var(--app-text);
    background: var(--app-surface-soft);
  }

  .post-media__file:hover {
    border-color: var(--app-border-strong);
  }
}

@media (pointer: coarse) {
  .post-media__action {
    min-height: var(--app-control-h);
  }
}

@media (max-width: 30rem) {
  .post-media__grid--many {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .post-media__audio-row,
  .post-media__file {
    animation: none;
  }

  .post-media__image,
  .post-media__action,
  .post-media__file {
    transition: none;
  }

  .post-media__cell:hover .post-media__image {
    transform: none;
  }
}
</style>
