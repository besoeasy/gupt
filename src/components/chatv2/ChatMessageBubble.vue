<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from "vue";
import {
  CircleAlert,
  Check,
  CheckCheck,
  Copy,
  Download,
  ImageOff,
  Mic,
  Reply,
  Pencil,
} from "@/icons";
import {
  formatBytes,
  formatTime,
  isImage,
  isVideo,
  getFileLabel,
  isMediaMessage,
} from "@/lib/chatUtils";
import { formatSeenByTitle } from "@/lib/chatListUtils";
import { triggerHaptic, HAPTIC } from "@/lib/haptics";
import { messagePlainText, resolveMessageFormat } from "@/lib/messageFormat";
import ChatMessageBody from "@/components/chatv2/ChatMessageBody.vue";
import ChatImageLightbox from "@/components/chatv2/ChatImageLightbox.vue";
import ChatMessageInfoDialog from "@/components/chatv2/ChatMessageInfoDialog.vue";
import ChatAudioPlayer from "@/components/chatv2/ChatAudioPlayer.vue";
import ChatReactionPicker from "@/components/chatv2/ChatReactionPicker.vue";
import ChatMediaAttachment from "@/components/chatv2/ChatMediaAttachment.vue";
import ChatLocationRow from "@/components/chatv2/ChatLocationRow.vue";
import MessageExpiryCountdown from "@/components/chatv2/MessageExpiryCountdown.vue";
import MediaDecryptStatus from "@/components/chat/MediaDecryptStatus.vue";
import RelayEventLink from "@/components/RelayEventLink.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { RABTA_EVENT_ID_RE } from "@/lib/rabta";
import { avatarUrl } from "@/lib/avatar";
import { MEDIA_PHASE } from "@/lib/mediaDecrypt";
import {
  getSendReport,
  relayAttemptsOf,
  sendReports,
} from "@/lib/engine/sendReport.js";

const props = defineProps({
  message: { type: Object, required: true },
  mine: { type: Boolean, default: false },
  blobUrl: { type: String, default: null },
  mediaProgress: { type: Object, default: null },
  hasFailed: { type: Boolean, default: false },
  /** The file is intact but this browser cannot preview it. */
  previewUnavailable: { type: Boolean, default: false },
  showSenderName: { type: Boolean, default: false },
  senderName: { type: String, default: "" },
  senderAvatar: { type: String, default: "" },
  selfHandle: { type: String, default: "" },
  isConsecutive: { type: Boolean, default: false },
});

const emit = defineEmits([
  "download",
  "retry",
  "retry-send",
  "reply",
  "react",
  "edit",
  "image-load",
  "visible",
  "media-visibility",
  "media-error",
  "expired",
]);

function react(emoji) {
  emit("react", { message: props.message, emoji });
}

const swipeX = ref(0);
let touchStartX = 0;
let touchStartY = 0;
let swipeTracking = false;
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 12;
let longPressTimer = null;
let longPressTriggered = false;

function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function openMessageInfo() {
  showMessageInfo.value = true;
}

function closeMessageInfo() {
  showMessageInfo.value = false;
}

function handleTouchStart(e) {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  swipeTracking = false;
  swipeX.value = 0;
  longPressTriggered = false;
  clearLongPressTimer();
  longPressTimer = setTimeout(() => {
    longPressTriggered = true;
    swipeX.value = 0;
    swipeTracking = false;
    openMessageInfo();
    triggerHaptic(HAPTIC.tap);
  }, LONG_PRESS_MS);
}

function handleTouchMove(e) {
  const dx = e.touches[0].clientX - touchStartX;
  const dy = e.touches[0].clientY - touchStartY;
  if (Math.abs(dx) > LONG_PRESS_MOVE_TOLERANCE || Math.abs(dy) > LONG_PRESS_MOVE_TOLERANCE) {
    clearLongPressTimer();
  }
  if (!swipeTracking) {
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < 8) return;
    swipeTracking = true;
  }
  const clamped = Math.max(0, Math.min(80, dx));
  swipeX.value = clamped;
  if (clamped > 0) e.preventDefault();
}

function handleTouchEnd() {
  clearLongPressTimer();
  if (longPressTriggered) {
    swipeX.value = 0;
    swipeTracking = false;
    return;
  }
  if (swipeX.value >= 60) {
    triggerHaptic(HAPTIC.swipe);
    emit("reply", props.message);
  }
  swipeX.value = 0;
  swipeTracking = false;
}

const bubbleTransform = computed(() => (swipeX.value ? `translateX(${swipeX.value}px)` : ""));
const bubbleTransition = computed(() => (swipeX.value ? "none" : "transform 0.2s ease-out"));

const showMessageInfo = ref(false);
const hoverCopied = ref(false);

const copyableMessageText = computed(() => {
  if (props.message?.type !== "text") return "";
  return messagePlainText(props.message, { includeUrls: true, compact: false }).trim();
});

const formatInfo = computed(() => {
  if (props.message?.type !== "text") return null;
  return resolveMessageFormat(props.message);
});

const isGroupMessage = computed(() => Boolean(props.message?.groupId));
const clientMsgId = computed(() => String(props.message?.id || "").trim());
const envelopeId = computed(() => String(props.message?.wrapId || "").trim());

const eventId = computed(() => {
  if (isGroupMessage.value) return clientMsgId.value || "—";
  const wrapId = envelopeId.value;
  if (RABTA_EVENT_ID_RE.test(wrapId)) return wrapId;
  if (RABTA_EVENT_ID_RE.test(clientMsgId.value)) return clientMsgId.value;
  return wrapId || clientMsgId.value || "—";
});

/** Live send diagnostics for this bubble, fed by the replication worker. */
const sendKey = computed(() => String(eventId.value || "").toLowerCase());
const sendReport = computed(() => {
  if (!RABTA_EVENT_ID_RE.test(sendKey.value)) return null;
  // Touch the reactive map so worker updates re-render the report.
  void sendReports.get(sendKey.value)?.updatedAt;
  void sendReports.size;
  return getSendReport(sendKey.value);
});
const sendAttempts = computed(() => relayAttemptsOf(sendReport.value));
const sendError = computed(() => String(sendReport.value?.error || ""));
const nextRetryLabel = computed(() => {
  const at = Number(sendReport.value?.nextRetryAt) || 0;
  if (!at || at >= Number.MAX_SAFE_INTEGER) return "";
  const delta = Math.max(0, at - Date.now());
  if (delta <= 0) return "retrying now";
  const seconds = Math.ceil(delta / 1000);
  if (seconds < 60) return `retrying in ${seconds}s`;
  return `retrying in ${Math.ceil(seconds / 60)}m`;
});



const readByNames = computed(() => props.message?.readByNames || []);
const unreadByNames = computed(() => props.message?.unreadByNames || []);
const unknownByNames = computed(() => props.message?.unknownByNames || []);
const hasFullRead = computed(() => Boolean(props.message?.readByPeer || props.message?.readByAll));
const hasPartialRead = computed(
  () => !hasFullRead.value && (props.message?.readBy?.length || 0) > 0,
);
const seenTickTitle = computed(() => {
  const named = formatSeenByTitle(readByNames.value, hasFullRead.value);
  if (named) return named;
  if (hasFullRead.value) return "Delivered & Seen";
  return "Delivered";
});

const seenByCaption = computed(() =>
  formatSeenByTitle(readByNames.value, Boolean(props.message?.readByAll)),
);

const statusLabel = computed(() => {
  const status = props.message?.status;
  if (status === "pending") {
    if (sendReport.value?.state === "timedOut") return "Still trying — no relay answered yet";
    return "In send queue";
  }
  if (status === "sent") {
    const named = formatSeenByTitle(readByNames.value, hasFullRead.value);
    if (named) return named;
    if (hasFullRead.value) return "Delivered & Read";
    return "Sent to relays";
  }
  if (status === "failed") return "Failed to send";
  return props.mine ? "Delivered" : "Received";
});

const statusColorClass = computed(() => {
  const status = props.message?.status;
  if (status === "pending") return "chat-message-bubble__muted";
  if (status === "sent") {
    if (hasFullRead.value) return "chat-message-bubble__info";
    if (hasPartialRead.value) return "chat-message-bubble__muted";
    return "chat-message-bubble__success";
  }
  if (status === "failed") return "chat-message-bubble__danger";
  return "chat-message-bubble__variant-5";
});

const fullTimestamp = computed(() => {
  const ts = Number(props.message?.ts || props.message?.created_at || 0);
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
});

async function copyMessageTextFromHover() {
  const text = copyableMessageText.value;
  if (!text) return;
  try {
    await copyToClipboard(text);
    hoverCopied.value = true;
    setTimeout(() => (hoverCopied.value = false), 1500);
  } catch {}
}

const isMentioned = computed(() => {
  if (!props.selfHandle || props.mine || props.message?.type !== "text") return false;
  const text = props.message.text || "";
  return new RegExp(`@${props.selfHandle}(?:\\s|$|[^\\w])`, "i").test(text);
});

const mentionPulseActive = ref(false);
onMounted(() => {
  if (isMentioned.value) {
    mentionPulseActive.value = true;
    setTimeout(() => {
      mentionPulseActive.value = false;
    }, 3000);
  }
});

const isMediaBusy = computed(() => {
  if (props.blobUrl) return false;
  const phase = props.mediaProgress?.phase;
  const isRetrying = phase === MEDIA_PHASE.FAILED && Boolean(props.mediaProgress?.retry);
  return (
    phase === MEDIA_PHASE.FETCH ||
    phase === MEDIA_PHASE.DECRYPT ||
    phase === MEDIA_PHASE.QUEUED ||
    isRetrying
  );
});

const hasMediaAttachment = computed(() => {
  const type = props.message?.type;
  if (type === "voice") return true;
  if (type === "text") return false;
  return Boolean(props.message?.media);
});

const showDecryptStatus = computed(() => {
  if (!hasMediaAttachment.value || props.blobUrl) return false;
  if (props.hasFailed || isMediaBusy.value) return true;
  const phase = props.mediaProgress?.phase;
  if (!phase || phase === MEDIA_PHASE.IDLE) return false;
  return phase !== MEDIA_PHASE.DONE && phase !== MEDIA_PHASE.CACHED;
});

// Viewport-aware media preloader: only preloads when the bubble comes within 500px of viewport
const rootEl = ref(null);
let mediaObserver = null;
// Second, long-lived observer: tells the media layer whether this attachment is
// on screen, so a failed one can be retried while it is in front of the reader.
let visibilityObserver = null;

function setupVisibilityObserver() {
  if (typeof IntersectionObserver === "undefined") return;
  if (!hasMediaAttachment.value || visibilityObserver) return;
  visibilityObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry) return;
      emit("media-visibility", { message: props.message, visible: entry.isIntersecting });
    },
    { threshold: 0 },
  );
  if (rootEl.value) visibilityObserver.observe(rootEl.value);
}

function setupMediaObserver() {
  if (typeof IntersectionObserver === "undefined") {
    if (hasMediaAttachment.value && !props.blobUrl) {
      emit("visible", props.message);
    }
    return;
  }

  if (!hasMediaAttachment.value || props.blobUrl) return;

  if (mediaObserver) {
    mediaObserver.disconnect();
    mediaObserver = null;
  }

  mediaObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry && entry.isIntersecting) {
        emit("visible", props.message);
        if (mediaObserver) {
          mediaObserver.disconnect();
          mediaObserver = null;
        }
      }
    },
    {
      rootMargin: "500px", // Preload attachments when within 500px of screen
    },
  );

  if (rootEl.value) {
    mediaObserver.observe(rootEl.value);
  }
}

onMounted(() => {
  setupMediaObserver();
  setupVisibilityObserver();
});

watch(
  () => props.blobUrl,
  (loaded) => {
    if (loaded && mediaObserver) {
      mediaObserver.disconnect();
      mediaObserver = null;
    }
  },
);

watch(
  () => hasMediaAttachment.value,
  (hasMedia) => {
    if (hasMedia && !props.blobUrl && !mediaObserver && rootEl.value) {
      setupMediaObserver();
    }
    if (hasMedia) setupVisibilityObserver();
  },
);

onUnmounted(() => {
  if (mediaObserver) {
    mediaObserver.disconnect();
    mediaObserver = null;
  }
  if (visibilityObserver) {
    visibilityObserver.disconnect();
    visibilityObserver = null;
    // Stop auto-retrying an attachment that is no longer rendered.
    if (hasMediaAttachment.value) {
      emit("media-visibility", { message: props.message, visible: false });
    }
  }
  clearLongPressTimer();
});

const lightboxOpen = ref(false);

const avatarError = ref(false);
watch(
  () => props.senderAvatar,
  () => {
    avatarError.value = false;
  },
);
function onAvatarError() {
  avatarError.value = true;
}
const avatarDisplaySrc = computed(() => avatarUrl(props.message?.sender || ""));

const mediaMime = computed(() => props.message?.media?.mime || "application/octet-stream");

const showExternalMediaPreview = computed(
  () =>
    isMediaMessage(props.message) &&
    Boolean(props.blobUrl) &&
    !props.previewUnavailable &&
    (isImage(mediaMime.value) || isVideo(mediaMime.value)),
);

// An intact picture the browser cannot decode: keep the file reachable through
// Download instead of leaving a broken frame (or no frame at all) on screen.
const showMediaDownloadTile = computed(
  () =>
    !showExternalMediaPreview.value &&
    props.previewUnavailable &&
    Boolean(props.blobUrl) &&
    (isImage(mediaMime.value) || isVideo(mediaMime.value)),
);

const isMediaMsg = computed(() => isMediaMessage(props.message));

const useInlineChrome = computed(() => isMediaMsg.value || props.message?.type === "voice");

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

const isLocationRow = computed(() => props.message?.type === "location");

const linkifyText = computed(() => {
  const text = props.message?.text || "";
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const URL_RE = /https?:\/\/[^\s<>"']+/gi;
  let result = "";
  let lastIndex = 0;
  let m;
  while ((m = URL_RE.exec(text)) !== null) {
    result += esc(text.slice(lastIndex, m.index));
    const url = esc(m[0]);
    result += `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-message-bubble__link">${url}</a>`;
    lastIndex = m.index + m[0].length;
  }
  result += esc(text.slice(lastIndex));
  return result;
});
</script>

<template>
  <div
    ref="rootEl"
    class="chat-message-bubble"
    :class="[mine ? 'chat-message-bubble--mine' : 'chat-message-bubble--peer', isConsecutive ? 'chat-message-bubble--consecutive' : 'chat-message-bubble--first']"
    :style="{ transform: bubbleTransform, transition: bubbleTransition }"
    @touchstart.passive="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend.passive="handleTouchEnd"
  >
    <!-- Peer avatar: only on first message of a group -->
    <img
      v-if="!mine && senderAvatar && !isConsecutive"
      :src="avatarDisplaySrc"
      class="chat-message-bubble__image"
      alt=""
      :title="senderName"
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="onAvatarError"
    />
    <div v-else-if="!mine && isConsecutive" class="chat-message-bubble__avatar-spacer" />

    <div
      class="chat-message-bubble__body"
      :class="mine ? 'chat-message-bubble__body--mine' : 'chat-message-bubble__body--peer'"
    >
      <!-- Hover Actions -->
      <div
        class="chat-message-bubble__actions"
        :class="mine ? 'chat-message-bubble__actions--mine' : 'chat-message-bubble__actions--peer'"
      >
        <!-- Reaction picker trigger -->
        <ChatReactionPicker :mine="mine" @react="react" />
        <!-- Edit (own text messages) -->
        <button
          v-if="mine && message.type === 'text'"
          type="button"
          @click="emit('edit', message)"
          class="chat-message-bubble__button-edit-message"
          title="Edit message"
        >
          <Pencil class="chat-message-bubble__pencil" :stroke-width="1.8" />
        </button>
        <button
          type="button"
          @click="emit('reply', message)"
          class="chat-message-bubble__button-reply"
          title="Reply"
        >
          <Reply class="chat-message-bubble__reply" :stroke-width="1.8" />
        </button>
        <button
          v-if="copyableMessageText"
          type="button"
          @click="copyMessageTextFromHover"
          class="chat-message-bubble__copy-text"
          :title="hoverCopied ? 'Copied!' : 'Copy text'"
        >
          <Check v-if="hoverCopied" class="chat-message-bubble__check" :stroke-width="2" />
          <Copy v-else class="chat-message-bubble__copy" :stroke-width="1.8" />
        </button>
      </div>

      <!-- Intact file the browser cannot draw: keep it saveable -->
      <div
        v-if="showMediaDownloadTile"
        class="chat-message-bubble__file-tile"
      >
        <span
          class="chat-message-bubble__file-tile-icon"
          aria-hidden="true"
        >
          <ImageOff class="chat-message-bubble__image-off" :stroke-width="1.8" />
        </span>
        <div class="chat-message-bubble__file-tile-text">
          <p class="chat-message-bubble__file-name">
            {{ getFileLabel(message) }}
          </p>
          <p class="chat-message-bubble__text-preview-unavailable">
            Preview unavailable<span v-if="message.media?.size">
              · {{ formatBytes(message.media.size) }}</span
            >
          </p>
        </div>
        <button
          type="button"
          class="chat-message-bubble__button-download-file"
          title="Download file"
          aria-label="Download file"
          @click="emit('download', message)"
        >
          <Download class="chat-message-bubble__download" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>

      <!-- Media preview outside the colored bubble -->
      <div
        v-if="showExternalMediaPreview"
        class="chat-message-bubble__media"
      >
        <img
          v-if="isImage(mediaMime)"
          :src="blobUrl"
          :alt="getFileLabel(message)"
          class="chat-message-bubble__image-2"
          @click="lightboxOpen = true"
          @load="emit('image-load')"
          @error="emit('media-error', message)"
        />
        <video
          v-else
          :src="blobUrl"
          controls
          class="chat-message-bubble__video"
          @error="emit('media-error', message)"
        />

        <!-- A picture carries its deadline on the picture, where it is seen. -->
        <MessageExpiryCountdown
          framed
          class="chat-message-bubble__message-expiry-countdown"
          :expires-at="Number(message.expiresAt || 0)"
          :started-at="Number(message.ts || 0)"
          @expired="emit('expired', message)"
        />
      </div>

      <!-- Bubble (Geist sharp card style) -->
      <div
        class="chat-message-bubble__bubble"
        :class="
          useInlineChrome
            ? 'chat-message-bubble__bubble--inline'
            : mine
              ? 'chat-message-bubble__bubble--mine'
              : isMentioned
                ? `chat-message-bubble__bubble--mentioned${mentionPulseActive ? ' chat-message-bubble__bubble--pulse' : ''}`
                : 'chat-message-bubble__bubble--peer'
        "
        @contextmenu.prevent="openMessageInfo"
      >
        <!-- Replied-to Snippet -->
        <div
          v-if="message.replyTo"
          class="chat-message-bubble__reply-snippet"
          :class="useInlineChrome ? 'chat-message-bubble__reply-snippet--inline' : ''"
        >
          <p class="chat-message-bubble__text-replied-to">
            Replied to message
          </p>
          <p class="chat-message-bubble__reply-excerpt">
            {{ message.replyExcerpt || "Audio/Media" }}
          </p>
        </div>

        <!-- Sender name (groups) -->
        <p
          v-if="showSenderName && !mine"
          class="chat-message-bubble__sender-name"
        >
          {{ senderName }}
        </p>

        <!-- ── Text ── -->
        <template v-if="message.type === 'text'">
          <ChatMessageBody v-if="formatInfo" :nodes="formatInfo.nodes" />
          <p
            v-else
            class="chat-message-bubble__message-text"
            v-html="linkifyText"
          ></p>
          <span v-if="message.editedAt" class="chat-message-bubble__edited">
            · edited</span
          >
        </template>

        <!-- ── Voice note ── -->
        <template v-else-if="message.type === 'voice'">
          <ChatAudioPlayer
            v-if="blobUrl"
            variant="voice"
            :src="blobUrl"
            :message="message"
            :duration-ms="Number(message.durationMs || 0)"
            :is-media-busy="isMediaBusy"
            @download="emit('download', message)"
          />

          <div v-else class="chat-message-bubble__voice-fallback">
            <button
              type="button"
              @click="emit('download', message)"
              class="chat-message-bubble__voice-fallback-button"
              :disabled="isMediaBusy"
            >
              <Mic class="chat-message-bubble__mic" :stroke-width="1.8" />
              <span>{{ isMediaBusy ? "Decrypting…" : "Play voice note" }}</span>
            </button>
          </div>
        </template>

        <!-- ── Media attachment ── -->
        <template v-else-if="isMediaMessage(message)">
          <ChatMediaAttachment
            :message="message"
            :blob-url="blobUrl"
            :preview-unavailable="previewUnavailable"
            :is-media-busy="isMediaBusy"
            :media-progress="mediaProgress"
            :has-failed="hasFailed"
            :show-media-download-tile="showMediaDownloadTile"
            :show-external-media-preview="showExternalMediaPreview"
            @download="emit('download', message)"
            @retry="emit('retry', message)"
            @image-load="emit('image-load')"
            @media-error="emit('media-error', message)"
            @open-lightbox="lightboxOpen = true"
          />
        </template>

        <!-- Keyed on the row type rather than on valid coordinates: a location
             message carrying unusable coords still needs to say so. Gating on
             `isLocationMessage` would drop it into the empty fallback and
             render an empty bubble. -->
        <template v-else-if="isLocationRow" class="chat-message-bubble__group">
          <ChatLocationRow :message="message" />
        </template>

        <template v-else />

        <!-- Reactions list -->
        <div
          v-if="message.reactions?.length"
          class="chat-message-bubble__reactions"
          :class="mine ? 'chat-message-bubble__reactions--mine' : 'chat-message-bubble__reactions--peer'"
        >
          <span
            v-for="r in message.reactions"
            :key="r.emoji"
            class="chat-message-bubble__reaction"
            :title="`${r.count} reaction${r.count > 1 ? 's' : ''}`"
          >
            {{ r.emoji
            }}<span v-if="r.count > 1" class="chat-message-bubble__reaction-count">{{ r.count }}</span>
          </span>
        </div>
      </div>

      <MediaDecryptStatus
        v-if="showDecryptStatus"
        :progress="mediaProgress"
        :event-id="eventId"
        :file-name="fileBaseName || message.text || ''"
        :file-size="message.media?.size || 0"
        :retryable="true"
        compact
        class="chat-message-bubble__media-decrypt-status"
        @retry="emit('retry', message)"
        @download="emit('download', message)"
      />

      <!-- Timestamp + Status -->
      <div
        class="message-meta chat-message-bubble__meta"
        :class="[
          mine ? 'chat-message-bubble__meta--mine' : 'chat-message-bubble__meta--peer',
          mine
            ? 'chat-message-bubble__meta--end'
            : 'chat-message-bubble__meta--hidden',
        ]"
      >
        <p class="chat-message-bubble__time">
          {{ formatTime(message.ts) }}
        </p>

        <!-- Glowing dot in send queue -->
        <span
          v-if="mine && message.status === 'pending'"
          class="chat-message-bubble__text-in-send"
          title="In send queue"
        >
          <span
            class="chat-message-bubble__send-dot-ring"
          />
          <span class="chat-message-bubble__send-dot-core" />
        </span>

        <!-- Double tick when everyone has seen, or delivered -->
        <span
          v-else-if="mine && (hasFullRead || message.status === 'delivered')"
          class="chat-message-bubble__tick-read"
          :title="seenTickTitle"
        >
          <CheckCheck class="chat-message-bubble__check-check" :stroke-width="2.2" />
        </span>

        <!-- Grey double tick when some group members have seen -->
        <span v-else-if="mine && hasPartialRead" class="chat-message-bubble__tick-partial" :title="seenTickTitle">
          <CheckCheck class="chat-message-bubble__check-check-2" :stroke-width="2.2" />
        </span>

        <!-- Single tick when sent to relays -->
        <span
          v-else-if="mine && message.status === 'sent'"
          class="chat-message-bubble__text-sent-to"
          title="Sent to relays"
        >
          <Check class="chat-message-bubble__check-2" :stroke-width="2.2" />
        </span>

        <!-- Alert icon when failed -->
        <span
          v-else-if="mine && message.status === 'failed'"
          class="chat-message-bubble__text-failed-to"
          title="Failed to send"
        >
          <CircleAlert class="chat-message-bubble__circle-alert" :stroke-width="2" />
        </span>

        <!-- Time left before this message disappears (short chat timers).
             Pictures show the same badge on the picture itself, so skip it
             here to avoid two clocks for one message. -->
        <MessageExpiryCountdown
          v-if="!showExternalMediaPreview"
          :expires-at="Number(message.expiresAt || 0)"
          :started-at="Number(message.ts || 0)"
          @expired="emit('expired', message)"
        />
      </div>
      <p
        v-if="!mine && isGroupMessage && seenByCaption"
        class="chat-message-bubble__seen-caption"
        :title="seenByCaption"
      >
        {{ seenByCaption }}
      </p>
    </div>
  </div>

  <!-- Message Info (extracted child component) -->
  <ChatMessageInfoDialog
    :open="showMessageInfo"
    :message="message"
    :mine="mine"
    :event-id="eventId"
    :is-group-message="isGroupMessage"
    :copyable-message-text="copyableMessageText"
    :status-label="statusLabel"
    :status-color-class="statusColorClass"
    :send-error="sendError"
    :next-retry-label="nextRetryLabel"
    :send-attempts="sendAttempts"
    :read-by-names="readByNames"
    :unread-by-names="unreadByNames"
    :unknown-by-names="unknownByNames"
    :full-timestamp="fullTimestamp"
    @close="closeMessageInfo"
    @react="react"
    @retry-send="emit('retry-send', message)"
  />

  <!-- Lightbox (extracted child component) -->
  <ChatImageLightbox
    :open="lightboxOpen"
    :src="blobUrl"
    :message="message"
    @close="lightboxOpen = false"
    @download="emit('download', message)"
  />
</template>

<style scoped>
@media (hover: hover) {
  .chat-message-bubble__actions:is(:where(.chat-message-bubble):hover *) {
    opacity: 1;
  }

  .chat-message-bubble__meta--hidden:is(:where(.chat-message-bubble):hover *) {
    opacity: 1;
  }

  .chat-message-bubble__file-tile-icon:is(:where(.chat-message-bubble__file-tile):hover *) {
    color: var(--app-text);
  }

  .chat-message-bubble__file-tile:hover {
    border-color: var(--app-border-strong);
    background-color: color-mix(in oklab,var(--app-surface) 70%,transparent);
  }

  .chat-message-bubble__button-download-file:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }

  .chat-message-bubble__button-edit-message:hover {
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }

  .chat-message-bubble__button-reply:hover {
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }

  .chat-message-bubble__copy-text:hover {
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }

  .chat-message-bubble__voice-fallback-button:hover {
    color: var(--app-text);
  }

  .chat-message-bubble__image:hover {
    opacity: 1;
  }
}

@media (min-width: 40rem) {
  .chat-message-bubble__body {
    max-width: 72%;
  }
}

@media (min-width: 64rem) {
  .chat-message-bubble__body {
    max-width: 64%;
  }
}

@media (min-width: 80rem) {
  .chat-message-bubble__body {
    max-width: 58%;
  }
}

:deep(.chat-message-bubble__link) {
  text-decoration-line: underline;
  text-underline-offset: 2px;
  opacity: 0.9;
  overflow-wrap: break-word;
  word-break: break-all;
}

:deep(.chat-message-bubble__link:hover) {
  opacity: 1;
}

.chat-message-bubble__message-expiry-countdown {
  pointer-events: none;
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 10;
}

.chat-message-bubble__actions {
  position: absolute;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.125rem;
  border-radius: var(--app-radius-sm);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border);
  padding: 0.125rem;
  opacity: 0;
  box-shadow: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  transition-property: opacity;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .15s;
  background-color: var(--app-surface);
}

.chat-message-bubble__reactions {
  position: absolute;
  bottom: -0.625rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 6px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border);
  background-color: var(--app-surface-soft);
  padding-inline: 0.5rem;
  padding-block: 0.125rem;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text);
  box-shadow: none;
}

.chat-message-bubble__send-dot-ring {
  position: absolute;
  display: inline-flex;
  height: 0.625rem;
  width: 0.625rem;
  animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
  border-radius: 9999px;
  background-color: var(--app-text-soft);
  opacity: .75;
}

.chat-message-bubble__body {
  position: relative;
  display: flex;
  width: 100%;
  max-width: calc(100% - 2.75rem);
  min-width: 0;
  flex-direction: column;
}

.chat-message-bubble__media {
  position: relative;
  margin-bottom: 0.375rem;
  max-width: 100%;
  overflow: hidden;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: color-mix(in oklab,var(--app-bg) 40%,transparent);
}

.chat-message-bubble__bubble {
  position: relative;
  max-width: 100%;
  min-width: 0;
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: break-word;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .15s;
}

.chat-message-bubble__text-in-send {
  position: relative;
  display: flex;
  height: 0.5rem;
  width: 0.5rem;
  align-items: center;
  justify-content: center;
}

.chat-message-bubble__send-dot-core {
  position: relative;
  display: inline-flex;
  height: 0.375rem;
  width: 0.375rem;
  border-radius: 9999px;
  background-color: var(--app-text);
  box-shadow: 0 1px 2px color-mix(in oklab, var(--app-text) 8%, transparent);
}

.chat-message-bubble__reactions--peer {
  right: 0.5rem;
}

.chat-message-bubble__actions--mine {
  right: 100%;
  margin-right: 0.5rem;
}

.chat-message-bubble__reactions--mine {
  left: 0.5rem;
}

.chat-message-bubble__actions--peer {
  left: 100%;
  margin-left: 0.5rem;
}

.chat-message-bubble__seen-caption {
  margin-top: 0.125rem;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  padding-inline: 0.25rem;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted-2);
}

.chat-message-bubble--consecutive {
  margin-top: 0.25rem;
}

.chat-message-bubble__image {
  margin-top: 0.25rem;
  height: 2rem;
  width: 2rem;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  object-fit: cover;
  opacity: .95;
  transition-property: opacity;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .15s;
}

.chat-message-bubble__meta {
  margin-top: 0.25rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding-inline: 0.25rem;
}

.chat-message-bubble__media-decrypt-status {
  margin-top: 0.375rem;
  width: 100%;
  max-width: 24rem;
}

.chat-message-bubble--first {
  margin-top: 0.75rem;
}

.chat-message-bubble__text-replied-to {
  margin-bottom: 0.125rem;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--app-text-soft);
  text-transform: uppercase;
}

.chat-message-bubble__sender-name {
  margin-bottom: 0.25rem;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--app-muted);
  text-transform: uppercase;
}

.chat-message-bubble__file-tile {
  margin-bottom: 0.375rem;
  display: flex;
  width: 100%;
  max-width: 24rem;
  align-items: center;
  gap: 0.625rem;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  padding: 0.625rem;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .15s;
  background-color: color-mix(in oklab,var(--app-bg-soft) 70%,transparent);
}

.chat-message-bubble__reply-snippet {
  margin-bottom: 0.5rem;
  border-radius: var(--app-radius-md);
  border-left-style: solid;
  border-left-width: 2px;
  border-color: var(--app-muted);
  background-color: var(--app-surface-inset);
  padding-inline: 0.625rem;
  padding-block: 0.25rem;
  font-size: 0.75rem;
  line-height: 1.5;
}

.chat-message-bubble__reaction-count {
  margin-left: 0.125rem;
  font-size: 10px;
  color: var(--app-text-soft);
}

.chat-message-bubble__image-2 {
  display: block;
  max-height: 18rem;
  width: 100%;
  max-width: 100%;
  cursor: zoom-in;
  object-fit: contain;
}

.chat-message-bubble {
  display: flex;
  max-width: 100%;
  min-width: 0;
  gap: 0.625rem;
}

.chat-message-bubble__file-tile-icon {
  display: flex;
  height: 2.25rem;
  width: 2.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  background-color: color-mix(in oklab,var(--app-surface) 80%,transparent);
}

.chat-message-bubble__voice-fallback {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  color: var(--app-text-soft);
}

.chat-message-bubble__button-edit-message {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-md);
  padding: 0.25rem;
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}

.chat-message-bubble__button-reply {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-md);
  padding: 0.25rem;
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}

.chat-message-bubble__copy-text {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-md);
  padding: 0.25rem;
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}

.chat-message-bubble__button-download-file {
  display: inline-flex;
  min-height: 44px;
  min-width: 44px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface);
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .15s;
}

.chat-message-bubble__voice-fallback-button {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  gap: 0.375rem;
  padding-inline: 0.25rem;
  padding-block: 0.25rem;
  font-size: 0.75rem;
  line-height: 1.5;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}

.chat-message-bubble__check-check {
  height: 0.75rem;
  width: 0.75rem;
}

.chat-message-bubble__check-check-2 {
  height: 0.75rem;
  width: 0.75rem;
}

.chat-message-bubble__check-2 {
  height: 0.75rem;
  width: 0.75rem;
}

.chat-message-bubble__circle-alert {
  height: 0.75rem;
  width: 0.75rem;
}

.chat-message-bubble__pencil {
  height: 0.875rem;
  width: 0.875rem;
}

.chat-message-bubble__reply {
  height: 0.875rem;
  width: 0.875rem;
}

.chat-message-bubble__check {
  height: 0.875rem;
  width: 0.875rem;
  color: var(--app-success);
}

.chat-message-bubble__copy {
  height: 0.875rem;
  width: 0.875rem;
}

.chat-message-bubble__mic {
  height: 0.875rem;
  width: 0.875rem;
  flex-shrink: 0;
}

.chat-message-bubble__image-off {
  height: 1rem;
  width: 1rem;
}

.chat-message-bubble__download {
  height: 1rem;
  width: 1rem;
}

.chat-message-bubble__video {
  max-height: 18rem;
  width: 100%;
  max-width: 100%;
  background-color: color-mix(in oklab,var(--app-bg) 40%,transparent);
}

.chat-message-bubble__avatar-spacer {
  width: 2rem;
  flex-shrink: 0;
}

.chat-message-bubble__reply-excerpt {
  max-width: 12.5rem;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  color: var(--app-text-soft);
}

.chat-message-bubble__message-text {
  max-width: 100%;
  min-width: 0;
  line-height: 1.6;
  overflow-wrap: break-word;
}

.chat-message-bubble__file-tile-text {
  min-width: 0;
  flex: 1;
}

.chat-message-bubble__group {
  min-width: 0;
}

.chat-message-bubble__bubble--pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.chat-message-bubble--peer {
  flex-direction: row;
}

.chat-message-bubble--mine {
  flex-direction: row-reverse;
}

.chat-message-bubble__body--mine {
  align-items: flex-end;
}

.chat-message-bubble__body--peer {
  align-items: flex-start;
}

.chat-message-bubble__meta--mine {
  justify-content: flex-end;
}

.chat-message-bubble__meta--peer {
  justify-content: flex-start;
}

.chat-message-bubble__file-name {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.25;
  color: var(--app-text);
}

.chat-message-bubble__bubble--mine {
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  padding-inline: 0.875rem;
  padding-block: 0.625rem;
  color: var(--app-text);
  box-shadow: none;
  border-color: color-mix(in srgb, var(--app-primary) 24%, var(--app-border));
  background-color: color-mix(in srgb, var(--app-primary) 9%, var(--app-surface));
}

.chat-message-bubble__bubble--mentioned {
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  background-color: var(--app-warning-soft);
  padding-inline: 0.875rem;
  padding-block: 0.625rem;
  color: var(--app-text);
  box-shadow: 0 1px 2px color-mix(in oklab, var(--app-text) 8%, transparent);
  border-color: color-mix(in oklab,var(--app-warning) 40%,transparent);
}

.chat-message-bubble__bubble--peer {
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border);
  background-color: var(--app-surface);
  padding-inline: 0.875rem;
  padding-block: 0.625rem;
  color: var(--app-text);
  box-shadow: none;
}

.chat-message-bubble__bubble--inline {
  padding-inline: 0.25rem;
  padding-block: 0.125rem;
  color: var(--app-text);
}

.chat-message-bubble__text-preview-unavailable {
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.25;
  color: var(--app-muted);
}

.chat-message-bubble__edited {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted);
  -webkit-user-select: none;
  user-select: none;
}

.chat-message-bubble__time {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
  -webkit-user-select: none;
  user-select: none;
}

.chat-message-bubble__reaction {
  font-size: 12px;
  line-height: 1;
}

.chat-message-bubble__success {
  color: var(--app-success);
}

.chat-message-bubble__text-failed-to {
  color: var(--app-danger);
}

.chat-message-bubble__danger {
  color: var(--app-danger);
}

.chat-message-bubble__tick-read {
  color: var(--app-info);
}

.chat-message-bubble__info {
  color: var(--app-info);
}

.chat-message-bubble__variant-5 {
  color: var(--app-text-soft);
}

.chat-message-bubble__reply-snippet--inline {
  color: var(--app-text-soft);
}

.chat-message-bubble__muted {
  color: var(--app-text-soft);
}

.chat-message-bubble__tick-partial {
  color: var(--app-muted);
}

.chat-message-bubble__text-sent-to {
  color: var(--app-muted);
}

.chat-message-bubble__meta--hidden {
  opacity: 0;
}

.chat-message-bubble__meta--end {
  opacity: .8;
}

.chat-message-bubble__button-download-file:active {
  scale: 95% 95%;
}

.chat-message-bubble__voice-fallback-button:disabled {
  opacity: .5;
}

.chat-message-bubble__meta--hidden:has([data-expiry]) {
  opacity: 1;
}

[data-theme="light"] .chat-message-bubble__reactions {
  color: var(--app-text-soft);
}

[data-theme="light"] .chat-message-bubble__button-edit-message {
  color: var(--app-muted);
}

[data-theme="light"] .chat-message-bubble__button-reply {
  color: var(--app-muted);
}

[data-theme="light"] .chat-message-bubble__copy-text {
  color: var(--app-muted);
}

[data-theme="light"] .chat-message-bubble__file-tile-icon {
  color: var(--app-muted);
}

[data-theme="light"] .chat-message-bubble__reply-snippet--inline {
  color: var(--app-muted);
}

[data-theme="light"] .chat-message-bubble__text-replied-to {
  color: var(--app-muted);
}

[data-theme="light"] .chat-message-bubble__voice-fallback {
  color: var(--app-muted);
}

[data-theme="light"] .chat-message-bubble__reaction-count {
  color: var(--app-muted);
}

[data-theme="light"] .chat-message-bubble__muted {
  color: var(--app-muted);
}

[data-theme="light"] .chat-message-bubble__time {
  color: var(--app-muted);
}

[data-theme="light"] .chat-message-bubble__seen-caption {
  color: var(--app-muted);
}

.chat-message-bubble__button-edit-message,
.chat-message-bubble__button-reply,
.chat-message-bubble__copy-text {
  border-radius: 4px;
}

.chat-message-bubble__button-edit-message:focus-visible,
.chat-message-bubble__button-reply:focus-visible,
.chat-message-bubble__copy-text:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 1px;
}

@media (hover: none) {
  .chat-message-bubble__meta--hidden {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-message-bubble,
.chat-message-bubble *,
.chat-message-bubble::before,
.chat-message-bubble::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
</style>
