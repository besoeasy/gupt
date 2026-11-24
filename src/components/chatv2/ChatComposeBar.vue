<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import {
  Mic,
  Paperclip,
  ImagePlus,
  Plus,
  SendHorizontal,
  Square,
  X,
  MapPin,
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  Quote,
  Link as LinkIcon,
  MousePointerClick,
  Type,
  Eye,
  Timer,
} from "@/icons";
import { formatDuration } from "@/lib/chatUtils";
import { formatCoords, formatAccuracy, LOCATION_PRECISION } from "@/lib/location";
import { applyFormatAction } from "@/lib/formatInsert";
import { isComposingKeydown } from "@/lib/composeInput";
import { messagePlainText, resolveMessageFormat } from "@/lib/messageFormat";
import {
  CHAT_TIMER_DEFAULT_SEC,
  chatTimerLabel,
} from "@/lib/chatTimer";
import RoboAvatar from "@/components/RoboAvatar.vue";
import ChatMessageBody from "@/components/chatv2/ChatMessageBody.vue";
import ChatTimerPresetGrid from "@/components/chatv2/ChatTimerPresetGrid.vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  templateMode: { type: String, default: "auto" },
  disabled: { type: Boolean, default: false },
  isRecording: { type: Boolean, default: false },
  recordingSeconds: { type: Number, default: 0 },
  audioLevels: { type: Array, default: () => [] },
  uploadStatus: { type: Object, default: null },
  mentionableUsers: { type: Array, default: () => [] },
  replyingTo: { type: Object, default: null },
  locationDraft: { type: Object, default: null },
  /** Show the per-conversation message timer picker (private DMs only). */
  showTimer: { type: Boolean, default: false },
  timerSec: { type: Number, default: CHAT_TIMER_DEFAULT_SEC },
});

const emit = defineEmits([
  "update:modelValue",
  "update:templateMode",
  "update:timer",
  "send",
  "file-selected",
  "toggle-recording",
  "cancel-recording",
  "cancel-reply",
  "cancel-upload",
  "request-location",
  "set-location-precision",
  "send-location",
  "cancel-location",
]);

const fileInputRef = ref(null);
const imageInputRef = ref(null);
const textareaRef = ref(null);
// Menu panels and their triggers: a pointer outside both closes them, but a
// click on the trigger must fall through to its own toggle.
const formatMenuRef = ref(null);
const timerMenuRef = ref(null);
const attachMenuRef = ref(null);
const formatButtonRef = ref(null);
const timerButtonRef = ref(null);
const attachButtonRef = ref(null);

const text = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const templateMode = computed({
  get: () => props.templateMode,
  set: (val) => emit("update:templateMode", val),
});

const formatActions = [
  { id: "bold", label: "Bold", hint: "**bold**", icon: Bold },
  { id: "italic", label: "Italic", hint: "*italic*", icon: Italic },
  { id: "strike", label: "Strikethrough", hint: "~~strike~~", icon: Strikethrough },
  { id: "code", label: "Inline code", hint: "`code`", icon: Code },
  { id: "list", label: "List", hint: "- item", icon: List },
  { id: "quote", label: "Quote", hint: "> quote", icon: Quote },
  { id: "link", label: "Link", hint: "[label](https://…)", icon: LinkIcon },
  { id: "button", label: "Button", hint: '{{button "Label" https://…}}', icon: MousePointerClick },
];

const formatHint = '**bold** · *italic* · `code` · - list · > quote · {{button "Label" https://…}}';

const modeOptions = [
  { id: "auto", label: "Auto" },
  { id: "formatted", label: "Formatted" },
  { id: "plain", label: "Plain" },
];

const showFormatMenu = ref(false);
const showPreview = ref(false);
const showTimerMenu = ref(false);

const timerLabel = computed(() => chatTimerLabel(props.timerSec));
const timerIsDefault = computed(() => props.timerSec === CHAT_TIMER_DEFAULT_SEC);

function closeTimerMenu() {
  showTimerMenu.value = false;
}

function toggleTimerMenu() {
  showTimerMenu.value = !showTimerMenu.value;
  if (showTimerMenu.value) {
    closeAttachMenu();
    closeFormatMenu();
    showPreview.value = false;
  }
}

function selectTimer(sec) {
  closeTimerMenu();
  emit("update:timer", sec);
}

function closeFormatMenu() {
  showFormatMenu.value = false;
}

function toggleFormatMenu() {
  showFormatMenu.value = !showFormatMenu.value;
  if (showFormatMenu.value) closeAttachMenu();
  closeTimerMenu();
}

function togglePreview() {
  showPreview.value = !showPreview.value;
}

function applyFormat(action) {
  const el = textareaRef.value;
  const start = el?.selectionStart ?? text.value.length;
  const end = el?.selectionEnd ?? start;
  const result = applyFormatAction(text.value, start, end, action);
  text.value = result.text;
  closeFormatMenu();
  nextTick(() => {
    const node = textareaRef.value;
    if (!node) return;
    node.focus();
    node.setSelectionRange(result.selectionStart, result.selectionEnd);
    adjustTextareaHeight();
  });
}

const previewInfo = computed(() => {
  if (!showPreview.value || !text.value.trim()) return null;
  return resolveMessageFormat({
    text: text.value,
    template:
      templateMode.value === "formatted" ? true : templateMode.value === "plain" ? false : null,
  });
});

const replyPreview = computed(() => {
  const message = props.replyingTo;
  if (!message) return "";
  return messagePlainText(message).trim() || message.replyExcerpt || "Attachment";
});

function handleKeydown(e) {
  // Enter that confirms an IME candidate must not send the message.
  if (isComposingKeydown(e)) return;

  if ((e.metaKey || e.ctrlKey) && !e.altKey) {
    const key = e.key.toLowerCase();
    const shortcut =
      key === "b"
        ? "bold"
        : key === "i"
          ? "italic"
          : key === "k"
            ? "link"
            : key === "e"
              ? "code"
              : null;
    if (shortcut) {
      e.preventDefault();
      applyFormat(shortcut);
      return;
    }
  }

  if (showMentions.value) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedMentionIdx.value = (selectedMentionIdx.value + 1) % filteredMentions.value.length;
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedMentionIdx.value =
        (selectedMentionIdx.value - 1 + filteredMentions.value.length) %
        filteredMentions.value.length;
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (filteredMentions.value[selectedMentionIdx.value]) {
        insertMention(filteredMentions.value[selectedMentionIdx.value]);
      }
      return;
    }
    if (e.key === "Escape") {
      showMentions.value = false;
      return;
    }
  }

  if (e.key === "Escape") {
    if (showTimerMenu.value) {
      closeTimerMenu();
      return;
    }
    if (showFormatMenu.value) {
      closeFormatMenu();
      return;
    }
    if (showPreview.value) {
      showPreview.value = false;
      return;
    }
  }

  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

function handleSend() {
  if (!text.value.trim() || props.disabled) return;
  emit("send");
  showMentions.value = false;
  showPreview.value = false;
  closeFormatMenu();
  closeTimerMenu();
  nextTick(() => adjustTextareaHeight());
}

// Attach menu: single toggle button revealing Image / File options
const showAttachMenu = ref(false);
const ATTACH_MENU_TIMEOUT_MS = 10_000;
let attachMenuTimer = null;

function closeAttachMenu() {
  showAttachMenu.value = false;
  if (attachMenuTimer) {
    clearTimeout(attachMenuTimer);
    attachMenuTimer = null;
  }
}

function toggleAttachMenu() {
  showAttachMenu.value = !showAttachMenu.value;
  if (showAttachMenu.value) {
    closeFormatMenu();
    closeTimerMenu();
    if (attachMenuTimer) clearTimeout(attachMenuTimer);
    attachMenuTimer = setTimeout(() => {
      showAttachMenu.value = false;
      attachMenuTimer = null;
    }, ATTACH_MENU_TIMEOUT_MS);
  } else {
    closeAttachMenu();
  }
}

function triggerFileInput() {
  closeAttachMenu();
  fileInputRef.value?.click();
}

function triggerImageInput() {
  closeAttachMenu();
  imageInputRef.value?.click();
}

function triggerLocationShare() {
  closeAttachMenu();
  emit("request-location");
}

const locationLabel = computed(() => props.locationDraft?.label || "");
const locationCoordsText = computed(() => {
  const draft = props.locationDraft;
  if (!draft?.lat || !draft?.lon) return "";
  const shown =
    draft.precision === LOCATION_PRECISION.APPROXIMATE
      ? draft.snapped
      : { lat: draft.lat, lon: draft.lon };
  const base = formatCoords(shown.lat, shown.lon);
  const accuracy =
    draft.precision === LOCATION_PRECISION.APPROXIMATE
      ? "~1km grid"
      : formatAccuracy(draft.accuracy);
  return accuracy ? `${base} · ${accuracy}` : base;
});

watch(
  () => props.isRecording,
  (rec) => {
    if (rec) {
      closeAttachMenu();
      closeFormatMenu();
      closeTimerMenu();
    }
  },
);

// A menu is dismissed by the same gestures that dismiss a native popover:
// a pointer anywhere outside it, or Escape. Both listen on the document,
// because once a trigger has focus the textarea no longer sees the key.
let menusBound = false;

function anyComposeMenuOpen() {
  return showFormatMenu.value || showTimerMenu.value || showAttachMenu.value;
}

function isWithinMenuOrTrigger(target) {
  if (!target) return false;
  return [
    formatMenuRef.value,
    timerMenuRef.value,
    attachMenuRef.value,
    formatButtonRef.value,
    timerButtonRef.value,
    attachButtonRef.value,
  ].some((el) => el && typeof el.contains === "function" && el.contains(target));
}

function onComposePointerDown(e) {
  if (!anyComposeMenuOpen()) return;
  if (isWithinMenuOrTrigger(e.target)) return;
  closeAttachMenu();
  closeFormatMenu();
  closeTimerMenu();
}

function onComposeEscape(e) {
  if (e.key !== "Escape" || !anyComposeMenuOpen()) return;
  e.preventDefault();
  closeAttachMenu();
  closeFormatMenu();
  closeTimerMenu();
  textareaRef.value?.focus?.();
}

onMounted(() => {
  if (menusBound) return;
  menusBound = true;
  document.addEventListener("pointerdown", onComposePointerDown, true);
  document.addEventListener("keydown", onComposeEscape);
});

onUnmounted(() => {
  if (menusBound) {
    menusBound = false;
    document.removeEventListener("pointerdown", onComposePointerDown, true);
    document.removeEventListener("keydown", onComposeEscape);
  }
  closeAttachMenu();
  closeFormatMenu();
  closeTimerMenu();
});

const ANIMATED_TYPES = new Set(["image/gif", "image/webp", "image/avif"]);

function filesFromInput(e) {
  return Array.from(e.target?.files || []);
}

async function prepareImageFile(file) {
  if (ANIMATED_TYPES.has(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

function emitFiles(files) {
  if (!files.length) return;
  emit("file-selected", files.length === 1 ? files[0] : files);
}

function onFileChange(e) {
  const files = filesFromInput(e);
  e.target.value = "";
  emitFiles(files);
}

async function onImageChange(e) {
  const picked = filesFromInput(e);
  e.target.value = "";
  if (!picked.length) return;
  const prepared = [];
  for (const file of picked) {
    prepared.push(await prepareImageFile(file));
  }
  emitFiles(prepared);
}

function adjustTextareaHeight() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(Math.max(el.scrollHeight, 40), 140)}px`;
}

watch(text, () => {
  nextTick(() => adjustTextareaHeight());
  checkMentions();
});

// Mention Logic
const showMentions = ref(false);
const mentionQuery = ref("");
const selectedMentionIdx = ref(0);

const filteredMentions = computed(() => {
  if (!mentionQuery.value) return props.mentionableUsers.slice(0, 5);
  const q = mentionQuery.value.toLowerCase();
  return props.mentionableUsers.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 5);
});

function checkMentions() {
  if (!props.mentionableUsers.length) {
    showMentions.value = false;
    return;
  }
  const el = textareaRef.value;
  if (!el) return;
  const val = text.value;
  const pos = el.selectionStart || val.length;
  const left = val.slice(0, pos);
  const lastAt = left.lastIndexOf("@");
  if (lastAt !== -1 && (lastAt === 0 || /\s/.test(left[lastAt - 1]))) {
    const query = left.slice(lastAt + 1);
    if (!/\s/.test(query)) {
      mentionQuery.value = query;
      showMentions.value = true;
      selectedMentionIdx.value = 0;
      return;
    }
  }
  showMentions.value = false;
}

function insertMention(user) {
  const el = textareaRef.value;
  const val = text.value;
  const pos = el?.selectionStart || val.length;
  const left = val.slice(0, pos);
  const lastAt = left.lastIndexOf("@");
  const mentionText = `@${user.name.replace(/\s+/g, "")} `;
  text.value = val.slice(0, lastAt) + mentionText + val.slice(pos);
  showMentions.value = false;
  nextTick(() => {
    if (el) {
      const nextPos = lastAt + mentionText.length;
      el.setSelectionRange(nextPos, nextPos);
      el.focus();
    }
  });
}

function onPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  if (!files.length) return;
  emitFiles(files);
  e.preventDefault();
}

defineExpose({
  focus: () => textareaRef.value?.focus?.(),
  onPaste,
});
</script>

<template>
  <div class="chat-compose-bar">
    <!-- Replying Banner -->
    <div
      v-if="replyingTo"
      class="chat-compose-bar__reply-banner"
    >
      <div class="chat-compose-bar__reply-text">
        <p class="chat-compose-bar__text-replying-to">
          Replying to message
        </p>
        <p class="chat-compose-bar__reply-preview">
          {{ replyPreview }}
        </p>
      </div>
      <button
        type="button"
        @click="emit('cancel-reply')"
        class="chat-compose-bar__reply-close"
      >
        <X class="chat-compose-bar__x" :stroke-width="1.8" />
      </button>
    </div>

    <!-- Mentions Dropdown -->
    <div
      v-if="showMentions && filteredMentions.length"
      class="chat-compose-bar__mentions"
    >
      <div class="chat-compose-bar__mentions-heading">
        Mention Member
      </div>
      <button
        v-for="(user, idx) in filteredMentions"
        :key="user.pubkey"
        type="button"
        @click="insertMention(user)"
        class="chat-compose-bar__mention-option"
        :class="
          idx === selectedMentionIdx
            ? 'chat-compose-bar__mention-option--selected'
            : 'chat-compose-bar__mention-option--muted'
        "
      >
        <RoboAvatar :pubkey="user.pubkey" size="xs" />
        <span class="chat-compose-bar__mention-name">{{ user.name }}</span>
      </button>
    </div>

    <!-- Upload Status Banner -->
    <div
      v-if="uploadStatus"
      class="chat-compose-bar__upload"
    >
      <div class="chat-compose-bar__upload-row">
        <div class="chat-compose-bar__upload-label">
          <span
            class="chat-compose-bar__upload-dot"
            :class="
              uploadStatus.phase === 'done'
                ? 'chat-compose-bar__upload-dot--done'
                : 'chat-compose-bar__upload-dot--busy'
            "
          />
          <span class="chat-compose-bar__upload-status">
            <span v-if="uploadStatus.phase === 'encrypting'">
              Encrypting attachment<span v-if="uploadStatus.batchTotal > 1">
                {{ uploadStatus.batchIndex }} of {{ uploadStatus.batchTotal }}</span
              >…
            </span>
            <span v-else-if="uploadStatus.phase === 'uploading'">
              <span v-if="uploadStatus.retryCount" class="chat-compose-bar__upload-retry">
                Stalled · Retrying ({{ uploadStatus.retryCount }}/{{ uploadStatus.maxRetries }}) to
                {{ uploadStatus.server }}…
              </span>
              <span v-else>
                Uploading<span v-if="uploadStatus.batchTotal > 1">
                  {{ uploadStatus.batchIndex }} of {{ uploadStatus.batchTotal }}</span
                >
                to {{ uploadStatus.server || "relays" }}
              </span>
            </span>
            <span v-else>Upload complete</span>
          </span>
        </div>
        <div class="chat-compose-bar__upload-meta">
          <span
            v-if="uploadStatus.phase === 'uploading'"
            class="chat-compose-bar__upload-percent"
          >
            {{
              uploadStatus.percent != null
                ? `${uploadStatus.percent}%`
                : uploadStatus.totalCount
                  ? `${uploadStatus.doneCount}/${uploadStatus.totalCount}`
                  : ""
            }}
          </span>
          <button
            v-if="uploadStatus.phase !== 'done'"
            type="button"
            class="chat-compose-bar__button-cancel-upload"
            title="Cancel upload"
            @click="emit('cancel-upload')"
          >
            <X class="chat-compose-bar__x-2" />
          </button>
        </div>
      </div>

      <!-- Flat Progress Bar -->
      <div class="chat-compose-bar__upload-track">
        <div
          class="chat-compose-bar__upload-progress"
          :class="uploadStatus.phase === 'done' ? 'chat-compose-bar__upload-progress--done' : 'chat-compose-bar__upload-progress--busy'"
          :style="{
            width:
              uploadStatus.phase === 'done'
                ? '100%'
                : uploadStatus.phase === 'encrypting'
                  ? '30%'
                  : uploadStatus.percent != null
                    ? `${uploadStatus.percent}%`
                    : `${(uploadStatus.doneCount / (uploadStatus.totalCount || 1)) * 100}%`,
          }"
        />
      </div>
    </div>

    <!-- Voice Recording Mode -->
    <div
      v-if="isRecording"
      class="chat-compose-bar__recording"
    >
      <div class="chat-compose-bar__recording-meter">
        <!-- Live Real-Time Equalizer Waveform -->
        <div class="chat-compose-bar__waveform">
          <span
            v-for="(lvl, i) in audioLevels.length ? audioLevels : new Array(24).fill(0.15)"
            :key="i"
            class="chat-compose-bar__waveform-bar"
            :style="{ height: `${Math.max(4, Math.round(lvl * 24))}px` }"
          />
        </div>

        <span class="chat-compose-bar__recording-time">
          {{ formatDuration(recordingSeconds) }}
        </span>
      </div>

      <div class="chat-compose-bar__recording-actions">
        <button
          type="button"
          @click="emit('cancel-recording')"
          class="chat-compose-bar__record-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          @click="emit('toggle-recording')"
          class="chat-compose-bar__record-send"
        >
          <Square class="chat-compose-bar__square" />
          Send
        </button>
      </div>
    </div>

    <!-- Location Draft -->
    <div
      v-else-if="locationDraft"
      class="chat-compose-bar__location"
    >
      <div class="chat-compose-bar__location-row">
        <div class="chat-compose-bar__location-main">
          <MapPin
            class="chat-compose-bar__map-pin"
            :stroke-width="1.8"
            :class="locationDraft.status === 'ready' ? 'chat-compose-bar__map-pin--success' : 'chat-compose-bar__map-pin--muted'"
          />
          <div class="chat-compose-bar__location-text">
            <p class="chat-compose-bar__location-title">
              <span v-if="locationDraft.status === 'locating'">Finding your position…</span>
              <span v-else-if="locationDraft.status === 'error'">Location unavailable</span>
              <span v-else>Share this location</span>
            </p>
            <p
              v-if="locationDraft.status === 'error'"
              class="chat-compose-bar__location-error"
              :title="locationDraft.error"
            >
              {{ locationDraft.error }}
            </p>
            <p
              v-else-if="locationDraft.status === 'ready'"
              class="chat-compose-bar__location-value"
            >
              {{ locationLabel || locationCoordsText }}
            </p>
          </div>
        </div>
        <div class="chat-compose-bar__location-actions">
          <button
            type="button"
            @click="emit('cancel-location')"
            class="chat-compose-bar__location-cancel"
          >
            Cancel
          </button>
          <button
            v-if="locationDraft.status === 'ready'"
            type="button"
            @click="emit('send-location')"
            class="chat-compose-bar__location-send"
          >
            Send
            <SendHorizontal class="chat-compose-bar__send-horizontal" :stroke-width="2.2" />
          </button>
        </div>
      </div>

      <!-- Precision choice. Defaulted to approximate: a precise fix is a real
           disclosure, so asking for it has to be a deliberate act. -->
      <div
        v-if="locationDraft.status === 'ready'"
        class="chat-compose-bar__location-precision"
      >
        <button
          v-for="option in [
            { value: LOCATION_PRECISION.EXACT, title: 'Exact position' },
            { value: LOCATION_PRECISION.APPROXIMATE, title: 'Approximate (~1km)' },
          ]"
          :key="option.value"
          type="button"
          @click="emit('set-location-precision', option.value)"
          class="chat-compose-bar__precision-option"
          :class="
            locationDraft.precision === option.value
              ? 'chat-compose-bar__precision-option--selected'
              : 'chat-compose-bar__precision-option--muted'
          "
        >
          {{ option.title }}
        </button>
      </div>
    </div>

    <!-- Normal Input Card Container (Geist command-style input) -->
    <div
      v-else
      class="chat-compose-bar__input-card"
    >
      <!-- Formatting menu -->
      <Transition
        enter-active-class="chat-compose-bar__enter-active-class"
        enter-from-class="chat-compose-bar__enter-from-class"
        leave-active-class="chat-compose-bar__leave-active-class"
        leave-from-class="chat-compose-bar__leave-from-class"
      >
        <div
          v-if="showFormatMenu"
          ref="formatMenuRef"
          class="chat-compose-bar__format-menu"
        >
          <div class="chat-compose-bar__format-head">
            <span class="chat-compose-bar__format-title">
              Format
            </span>
            <button
              type="button"
              @click="closeFormatMenu"
              class="chat-compose-bar__button-close-formatting"
              title="Close formatting menu"
              aria-label="Close formatting menu"
            >
              <X class="chat-compose-bar__x-3" :stroke-width="1.8" />
            </button>
          </div>

          <div class="chat-compose-bar__format-actions">
            <button
              v-for="action in formatActions"
              :key="action.id"
              type="button"
              @click="applyFormat(action.id)"
              :title="`${action.label} · ${action.hint}`"
              :aria-label="action.label"
              class="chat-compose-bar__format-action"
            >
              <component :is="action.icon" class="chat-compose-bar__format-icon" :stroke-width="1.8" />
            </button>
          </div>

          <div class="chat-compose-bar__format-rendering">
            <p class="chat-compose-bar__format-rendering-label">
              Rendering
            </p>
            <div
              class="chat-compose-bar__format-modes"
            >
              <button
                v-for="mode in modeOptions"
                :key="mode.id"
                type="button"
                @click="templateMode = mode.id"
                class="chat-compose-bar__render-option"
                :class="
                  templateMode === mode.id
                    ? 'chat-compose-bar__render-option--selected'
                    : 'chat-compose-bar__render-option--muted'
                "
              >
                {{ mode.label }}
              </button>
            </div>
            <p class="chat-compose-bar__format-rendering-hint">
              Auto renders only strong constructs. Formatted forces rendering; Plain sends the text
              untouched.
            </p>
          </div>

          <p
            class="chat-compose-bar__format-hint"
          >
            {{ formatHint }}
          </p>
        </div>
      </Transition>

      <!-- Message timer picker (opens from the timer chip in the footer) -->
      <Transition
        enter-active-class="chat-compose-bar__enter-active-class-2"
        enter-from-class="chat-compose-bar__enter-from-class-2"
        leave-active-class="chat-compose-bar__leave-active-class-2"
        leave-from-class="chat-compose-bar__leave-from-class-2"
      >
        <div
          v-if="showTimerMenu"
          ref="timerMenuRef"
          class="chat-compose-bar__timer-menu"
        >
          <div class="chat-compose-bar__timer-head">
            <span class="chat-compose-bar__timer-title">
              Message Timer
            </span>
            <button
              type="button"
              @click="closeTimerMenu"
              class="chat-compose-bar__button-close-message"
              title="Close message timer menu"
              aria-label="Close message timer menu"
            >
              <X class="chat-compose-bar__x-4" :stroke-width="1.8" />
            </button>
          </div>

          <ChatTimerPresetGrid :model-value="timerSec" :columns="4" @select="selectTimer" />

          <p class="chat-compose-bar__timer-hint">
            New messages disappear after the chosen time. Both sides share the latest change.
          </p>
        </div>
      </Transition>

      <!-- Formatting preview -->
      <div
        v-if="showPreview && text.trim()"
        class="chat-compose-bar__preview"
      >
        <div class="chat-compose-bar__preview-head">
          <span class="chat-compose-bar__preview-label">Preview</span>
          <span v-if="templateMode === 'auto' && !previewInfo" class="chat-compose-bar__text-no-formatting">
            No formatting detected
          </span>
          <span v-else-if="templateMode === 'plain'" class="chat-compose-bar__text-sent-as">
            Sent as plain text
          </span>
        </div>
        <ChatMessageBody
          v-if="previewInfo"
          :nodes="previewInfo.nodes"
          class="chat-compose-bar__chat-message-body"
        />
        <p v-else class="chat-compose-bar__preview-plain">
          {{ text }}
        </p>
      </div>

      <!-- Textarea input -->
      <textarea
        ref="textareaRef"
        v-model="text"
        :disabled="disabled"
        rows="1"
        placeholder="Type a message..."
        class="chat-compose-bar__field-type-a"
        @keydown="handleKeydown"
        @paste="onPaste"
      />

      <!-- Action Footer Row -->
      <div class="chat-compose-bar__footer">
        <!-- Left: Attachments (Plus toggle) -->
        <div class="chat-compose-bar__footer-actions">
          <button
            type="button"
            @click="toggleAttachMenu"
            ref="attachButtonRef"
            :disabled="disabled"
            :class="
              showAttachMenu
                ? 'chat-compose-bar__button-attach-image--selected'
                : 'chat-compose-bar__button-attach-image--muted'
            "
            class="chat-compose-bar__button-attach-image"
            title="Attach image or file"
            aria-label="Attach image or file"
            aria-haspopup="menu"
            :aria-expanded="showAttachMenu"
          >
            <Plus class="chat-compose-bar__plus" :stroke-width="1.8" />
          </button>

          <Transition
            enter-active-class="chat-compose-bar__enter-active-class-3"
            enter-from-class="chat-compose-bar__enter-from-class-3"
            leave-active-class="chat-compose-bar__leave-active-class-3"
            leave-from-class="chat-compose-bar__leave-from-class-3"
          >
            <div
              v-if="showAttachMenu"
              ref="attachMenuRef"
              class="chat-compose-bar__attach-menu"
            >
              <button
                type="button"
                @click="triggerImageInput"
                class="chat-compose-bar__button-send-images"
                title="Send images"
              >
                <ImagePlus class="chat-compose-bar__image-plus" :stroke-width="1.8" />
                Image
              </button>
              <button
                type="button"
                @click="triggerFileInput"
                class="chat-compose-bar__button-attach-files"
                title="Attach files"
              >
                <Paperclip class="chat-compose-bar__paperclip" :stroke-width="1.8" />
                File
              </button>
              <button
                type="button"
                @click="triggerLocationShare"
                class="chat-compose-bar__button-share-your"
                title="Share your location"
              >
                <MapPin class="chat-compose-bar__map-pin-2" :stroke-width="1.8" />
                Location
              </button>
            </div>
          </Transition>

          <button
            type="button"
            @click="toggleFormatMenu"
            ref="formatButtonRef"
            :disabled="disabled"
            :class="
              showFormatMenu || templateMode !== 'auto'
                ? 'chat-compose-bar__button-format-message--selected'
                : 'chat-compose-bar__button-format-message--muted'
            "
            class="chat-compose-bar__button-format-message"
            title="Format message"
            aria-label="Format message"
            aria-haspopup="menu"
            :aria-expanded="showFormatMenu"
          >
            <Type class="chat-compose-bar__type" :stroke-width="1.8" />
            <span
              v-if="templateMode !== 'auto'"
              class="chat-compose-bar__format-badge"
            />
          </button>

          <button
            v-if="text.trim()"
            type="button"
            @click="togglePreview"
            :class="
              showPreview
                ? 'chat-compose-bar__button-preview-formatting--selected'
                : 'chat-compose-bar__button-preview-formatting--muted'
            "
            class="chat-compose-bar__button-preview-formatting"
            title="Preview formatting"
            aria-label="Preview formatting"
            :aria-pressed="showPreview"
          >
            <Eye class="chat-compose-bar__eye" :stroke-width="1.8" />
          </button>

          <!-- Message timer: how long messages sent from now on survive -->
          <button
            v-if="showTimer"
            type="button"
            @click="toggleTimerMenu"
            ref="timerButtonRef"
            :disabled="disabled"
            :class="
              showTimerMenu
                ? 'chat-compose-bar__button-message-timer--selected'
                : timerIsDefault
                  ? 'chat-compose-bar__button-message-timer--muted'
                  : 'chat-compose-bar__button-message-timer--success'
            "
            class="chat-compose-bar__button-message-timer"
            title="Message timer"
            aria-label="Message timer"
            aria-haspopup="menu"
            :aria-expanded="showTimerMenu"
          >
            <Timer class="chat-compose-bar__timer" :stroke-width="1.8" />
            <span>{{ timerLabel }}</span>
          </button>

          <span class="chat-compose-bar__footer-hint">
            ↵ Enter to send
          </span>
        </div>

        <input
          ref="imageInputRef"
          type="file"
          accept="image/*"
          multiple
          class="chat-compose-bar__field-file"
          @change="onImageChange"
        />
        <input ref="fileInputRef" type="file" multiple class="chat-compose-bar__field-file-2" @change="onFileChange" />

        <!-- Right: Voice note or Send button -->
        <div class="chat-compose-bar__footer-send">
          <button
            v-if="!text.trim()"
            type="button"
            @click="emit('toggle-recording')"
            :disabled="disabled"
            class="chat-compose-bar__button-voice-note"
            title="Voice Note"
          >
            <Mic class="chat-compose-bar__mic" :stroke-width="1.8" />
          </button>

          <button
            v-else
            type="button"
            @click="handleSend"
            :disabled="disabled"
            class="chat-compose-bar__button-send-message"
            title="Send Message"
          >
            <span>Send</span>
            <SendHorizontal class="chat-compose-bar__send-horizontal-2" :stroke-width="2.2" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (hover: hover) {
  .chat-compose-bar__button-message-timer--success:hover {
    border-color: color-mix(in oklab,var(--app-success) 60%,transparent);
  }
  .chat-compose-bar__record-cancel:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }
  .chat-compose-bar__location-cancel:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }
  .chat-compose-bar__format-action:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .chat-compose-bar__button-attach-image--muted:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface);
    color: var(--app-text);
  }
  .chat-compose-bar__button-format-message--muted:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface);
    color: var(--app-text);
  }
  .chat-compose-bar__button-preview-formatting--muted:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface);
    color: var(--app-text);
  }
  .chat-compose-bar__button-message-timer--muted:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface);
    color: var(--app-text);
  }
  .chat-compose-bar__button-voice-note:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .chat-compose-bar__record-send:hover {
    background-color: var(--app-danger);
  }
  .chat-compose-bar__location-send:hover {
    background-color: var(--app-text);
  }
  .chat-compose-bar__button-send-message:hover {
    background-color: var(--app-text);
  }
  .chat-compose-bar__reply-close:hover {
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .chat-compose-bar__button-close-formatting:hover {
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .chat-compose-bar__button-close-message:hover {
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .chat-compose-bar__button-send-images:hover {
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .chat-compose-bar__button-attach-files:hover {
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .chat-compose-bar__button-share-your:hover {
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .chat-compose-bar__precision-option--muted:hover {
    background-color: var(--app-surface-raised-tint-soft);
    color: var(--app-text);
  }
  .chat-compose-bar__mention-option--muted:hover {
    background-color: var(--app-surface);
    color: var(--app-text);
  }
  .chat-compose-bar__button-cancel-upload:hover {
    color: var(--app-text);
  }
  .chat-compose-bar__render-option--muted:hover {
    color: var(--app-text);
  }
}
@media (min-width: 40rem) {
  .chat-compose-bar__footer-hint {
    display: inline-block;
  }
  .chat-compose-bar__waveform-bar {
    width: 0.25rem;
  }
  .chat-compose-bar__waveform {
    gap: 0.25rem;
  }
  .chat-compose-bar__recording-meter {
    gap: 0.75rem;
  }
  .chat-compose-bar {
    padding-inline: 1rem;
  }
}
.chat-compose-bar__mentions {
  position: absolute;
  bottom: 100%;
  left: 1rem;
  z-index: 30;
  margin-bottom: 0.5rem;
  width: 16rem;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-bg-soft);
  padding: 0.375rem;
  box-shadow: var(--app-shadow);
}
.chat-compose-bar__format-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  z-index: 30;
  margin-bottom: 0.5rem;
  width: 19rem;
  max-width: calc(100vw - 1.5rem);
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-bg-soft);
  padding: 0.5rem;
  box-shadow: var(--app-shadow);
}
.chat-compose-bar__timer-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  z-index: 30;
  margin-bottom: 0.5rem;
  width: 17rem;
  max-width: calc(100vw - 2rem);
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-bg-soft);
  padding: 0.5rem;
  box-shadow: var(--app-shadow);
}
.chat-compose-bar__attach-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  z-index: 30;
  margin-bottom: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-bg-soft);
  padding: 0.25rem;
  box-shadow: var(--app-shadow);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}
.chat-compose-bar__format-badge {
  position: absolute;
  top: -0.125rem;
  right: -0.125rem;
  height: 0.375rem;
  width: 0.375rem;
  border-radius: 9999px;
  background-color: var(--app-success);
}
.chat-compose-bar {
  position: relative;
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  padding: 0.75rem;
}
.chat-compose-bar__input-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: var(--app-radius-md);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border);
  padding: 0.5rem;
  box-shadow: 0 1px 2px color-mix(in oklab, var(--app-text) 8%, transparent);
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .15s;
  background-color: var(--app-surface);
}
.chat-compose-bar__footer-actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.chat-compose-bar__button-format-message {
  position: relative;
  display: inline-flex;
  height: 28px;
  width: 28px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-sm);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  background-color: var(--app-surface-tint);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__format-rendering-hint {
  margin-top: 0.375rem;
  padding-inline: 0.25rem;
  font-size: 10px;
  line-height: 1.625;
  color: var(--app-muted);
}
.chat-compose-bar__timer-hint {
  margin-top: 0.375rem;
  padding-inline: 0.25rem;
  font-size: 10px;
  line-height: 1.625;
  color: var(--app-muted);
}
.chat-compose-bar__format-rendering {
  margin-top: 0.5rem;
  border-top-style: solid;
  border-top-width: 1px;
  border-color: var(--app-border-quiet);
  padding-top: 0.5rem;
}
.chat-compose-bar__format-hint {
  margin-top: 0.5rem;
  border-top-style: solid;
  border-top-width: 1px;
  border-color: var(--app-border-quiet);
  padding-inline: 0.25rem;
  padding-top: 0.5rem;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.625;
  overflow-wrap: break-word;
  color: var(--app-muted);
}
.chat-compose-bar__format-rendering-label {
  margin-bottom: 0.25rem;
  padding-inline: 0.25rem;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.05em;
  color: var(--app-muted);
  text-transform: uppercase;
}
.chat-compose-bar__preview {
  margin-bottom: 0.25rem;
  max-height: 10rem;
  overflow-y: auto;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  background-color: var(--app-surface-tint-soft);
  padding-inline: 0.75rem;
  padding-block: 0.5rem;
}
.chat-compose-bar__preview-head {
  margin-bottom: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.chat-compose-bar__format-head {
  margin-bottom: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: 0.25rem;
}
.chat-compose-bar__timer-head {
  margin-bottom: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: 0.25rem;
}
.chat-compose-bar__reply-banner {
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-radius: var(--app-radius-sm);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border);
  background-color: var(--app-surface-soft);
  padding-inline: 0.75rem;
  padding-block: 0.375rem;
  font-size: 0.75rem;
  line-height: 1.5;
}
.chat-compose-bar__upload {
  margin-bottom: 0.625rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  padding: 0.75rem;
  background-color: color-mix(in oklab,var(--app-bg-soft) 80%,transparent);
}
.chat-compose-bar__field-type-a {
  box-sizing: border-box;
  max-height: 9rem;
  min-height: 40px;
  width: 100%;
  resize: none;
  background-color: transparent;
  padding-inline: 10px;
  padding-block: 0.25rem;
  font-size: var(--app-text-body);
  line-height: 1.55;
  color: var(--app-text);
}
.chat-compose-bar__mention-option {
  display: flex;
  width: 100%;
  cursor: pointer;
  align-items: center;
  gap: 0.5rem;
  border-radius: var(--app-radius-lg);
  padding-inline: 0.625rem;
  padding-block: 0.375rem;
  text-align: left;
  font-size: 0.75rem;
  line-height: 1.5;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__upload-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.75rem;
  line-height: 1.5;
}
.chat-compose-bar__upload-label {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
}
.chat-compose-bar__upload-meta {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
}
.chat-compose-bar__recording {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  padding: 0.625rem;
  border-color: color-mix(in oklab,var(--app-danger) 30%,transparent);
  background-color: color-mix(in oklab,var(--app-bg-soft) 80%,transparent);
}
.chat-compose-bar__recording-meter {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.625rem;
}
.chat-compose-bar__waveform {
  display: flex;
  height: 1.5rem;
  flex-shrink: 0;
  align-items: center;
  gap: 0.125rem;
}
.chat-compose-bar__recording-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
}
.chat-compose-bar__location {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  padding: 0.75rem;
  background-color: color-mix(in oklab,var(--app-bg-soft) 80%,transparent);
}
.chat-compose-bar__location-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.chat-compose-bar__location-main {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.625rem;
}
.chat-compose-bar__location-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
}
.chat-compose-bar__location-precision {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  padding: 0.25rem;
  background-color: color-mix(in oklab,var(--app-surface) 50%,transparent);
}
.chat-compose-bar__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding-inline: 0.25rem;
  padding-top: 0.25rem;
}
.chat-compose-bar__footer-send {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.chat-compose-bar__format-actions {
  display: grid;
  grid-template-columns: repeat(4,minmax(0,1fr));
  gap: 0.25rem;
}
.chat-compose-bar__format-modes {
  display: grid;
  grid-template-columns: repeat(3,minmax(0,1fr));
  gap: 0.125rem;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-tint);
  padding: 0.125rem;
}
.chat-compose-bar__footer-hint {
  display: none;
  padding-left: 0.25rem;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-muted-2);
  -webkit-user-select: none;
  user-select: none;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.chat-compose-bar__field-file {
  display: none;
}
.chat-compose-bar__field-file-2 {
  display: none;
}
.chat-compose-bar__reply-close {
  display: inline-flex;
  height: 1.25rem;
  width: 1.25rem;
  flex-shrink: 0;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-md);
  color: var(--app-muted);
}
.chat-compose-bar__record-send {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  gap: 0.375rem;
  border-radius: var(--app-radius-lg);
  background-color: var(--app-danger);
  padding-inline: 0.875rem;
  padding-block: 0.375rem;
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--color-white);
  box-shadow: 0 1px 2px color-mix(in oklab, var(--app-text) 8%, transparent);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__location-send {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  gap: 0.375rem;
  border-radius: var(--app-radius-lg);
  background-color: var(--app-text);
  padding-inline: 0.875rem;
  padding-block: 0.375rem;
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--app-bg);
  box-shadow: 0 1px 2px color-mix(in oklab, var(--app-text) 8%, transparent);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__button-close-formatting {
  display: inline-flex;
  height: 1.25rem;
  width: 1.25rem;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-md);
  color: var(--app-muted);
}
.chat-compose-bar__format-action {
  display: inline-flex;
  height: 2rem;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  background-color: var(--app-surface-tint);
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__button-close-message {
  display: inline-flex;
  height: 1.25rem;
  width: 1.25rem;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-md);
  color: var(--app-muted);
}
.chat-compose-bar__button-attach-image {
  display: inline-flex;
  height: 28px;
  width: 28px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-sm);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  background-color: var(--app-surface-tint);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__button-send-images {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  gap: 0.5rem;
  border-radius: var(--app-radius-md);
  padding-inline: 0.625rem;
  padding-block: 0.375rem;
  text-align: left;
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  white-space: nowrap;
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__button-attach-files {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  gap: 0.5rem;
  border-radius: var(--app-radius-md);
  padding-inline: 0.625rem;
  padding-block: 0.375rem;
  text-align: left;
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  white-space: nowrap;
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__button-share-your {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  gap: 0.5rem;
  border-radius: var(--app-radius-md);
  padding-inline: 0.625rem;
  padding-block: 0.375rem;
  text-align: left;
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  white-space: nowrap;
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__button-preview-formatting {
  display: inline-flex;
  height: 28px;
  width: 28px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-sm);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  background-color: var(--app-surface-tint);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__button-message-timer {
  display: inline-flex;
  height: 28px;
  cursor: pointer;
  align-items: center;
  gap: 0.25rem;
  border-radius: var(--app-radius-sm);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  background-color: var(--app-surface-tint);
  padding-inline: 0.375rem;
  font-family: var(--font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__button-voice-note {
  display: inline-flex;
  height: 30px;
  width: 30px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-sm);
  border-style: solid;
  border-width: 1px;
  border-color: transparent;
  background-color: var(--app-text);
  color: var(--app-bg);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__button-send-message {
  display: inline-flex;
  height: 30px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  border-radius: var(--app-radius-sm);
  background-color: var(--app-text);
  padding-inline: 12px;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.5;
  font-weight: 500;
  color: var(--app-bg);
  box-shadow: 0 1px 2px color-mix(in oklab, var(--app-text) 8%, transparent);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__upload-track {
  height: 0.25rem;
  width: 100%;
  overflow: hidden;
  border-radius: 9999px;
  background-color: var(--app-surface-raised);
}
.chat-compose-bar__upload-dot {
  height: 0.5rem;
  width: 0.5rem;
  flex-shrink: 0;
  border-radius: 9999px;
}
.chat-compose-bar__x {
  height: 0.75rem;
  width: 0.75rem;
}
.chat-compose-bar__square {
  height: 0.75rem;
  width: 0.75rem;
  fill: currentColor;
}
.chat-compose-bar__send-horizontal {
  height: 0.75rem;
  width: 0.75rem;
}
.chat-compose-bar__x-3 {
  height: 0.75rem;
  width: 0.75rem;
}
.chat-compose-bar__x-4 {
  height: 0.75rem;
  width: 0.75rem;
}
.chat-compose-bar__send-horizontal-2 {
  height: 14px;
  width: 14px;
}
.chat-compose-bar__x-2 {
  height: 0.875rem;
  width: 0.875rem;
}
.chat-compose-bar__format-icon {
  height: 0.875rem;
  width: 0.875rem;
}
.chat-compose-bar__plus {
  height: 0.875rem;
  width: 0.875rem;
}
.chat-compose-bar__image-plus {
  height: 0.875rem;
  width: 0.875rem;
}
.chat-compose-bar__paperclip {
  height: 0.875rem;
  width: 0.875rem;
}
.chat-compose-bar__map-pin-2 {
  height: 0.875rem;
  width: 0.875rem;
}
.chat-compose-bar__type {
  height: 0.875rem;
  width: 0.875rem;
}
.chat-compose-bar__eye {
  height: 0.875rem;
  width: 0.875rem;
}
.chat-compose-bar__timer {
  height: 0.875rem;
  width: 0.875rem;
  flex-shrink: 0;
}
.chat-compose-bar__mic {
  height: 0.875rem;
  width: 0.875rem;
}
.chat-compose-bar__map-pin {
  height: 1rem;
  width: 1rem;
  flex-shrink: 0;
}
.chat-compose-bar__upload-progress {
  height: 100%;
  border-radius: 9999px;
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .3s;
}
.chat-compose-bar__waveform-bar {
  width: 0.1875rem;
  border-radius: 9999px;
  background-color: var(--app-danger);
  transition-property: all;
  transition-duration: 75ms;
  transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
}
.chat-compose-bar__reply-text {
  min-width: 0;
  flex: 1;
}
.chat-compose-bar__location-text {
  min-width: 0;
  flex: 1;
}
.chat-compose-bar__precision-option {
  flex: 1;
  cursor: pointer;
  border-radius: var(--app-radius-md);
  padding-inline: 0.5rem;
  padding-block: 0.375rem;
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__recording-time {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--app-danger);
  font-variant-numeric: tabular-nums;
}
.chat-compose-bar__enter-from-class {
  translate: 0 -0.25rem;
  opacity: 0;
}
.chat-compose-bar__leave-from-class {
  translate: 0 -0.25rem;
  opacity: 0;
}
.chat-compose-bar__enter-from-class-2 {
  translate: 0 -0.25rem;
  opacity: 0;
}
.chat-compose-bar__leave-from-class-2 {
  translate: 0 -0.25rem;
  opacity: 0;
}
.chat-compose-bar__enter-from-class-3 {
  translate: 0 -0.25rem;
  opacity: 0;
}
.chat-compose-bar__leave-from-class-3 {
  translate: 0 -0.25rem;
  opacity: 0;
}
.chat-compose-bar__upload-dot--busy {
  animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
  background-color: var(--app-text);
}
.chat-compose-bar__upload-dot--done {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  background-color: var(--app-success);
}
.chat-compose-bar__button-cancel-upload {
  cursor: pointer;
  border-radius: .25rem;
  padding: 0.125rem;
  color: var(--app-muted);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__record-cancel {
  cursor: pointer;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface);
  padding-inline: 0.75rem;
  padding-block: 0.375rem;
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__location-cancel {
  cursor: pointer;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface);
  padding-inline: 0.75rem;
  padding-block: 0.375rem;
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__render-option {
  cursor: pointer;
  border-radius: var(--app-radius-md);
  padding-inline: 0.5rem;
  padding-block: 0.25rem;
  font-size: 11px;
  font-weight: 500;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-compose-bar__reply-preview {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  color: var(--app-text-soft);
}
.chat-compose-bar__mention-name {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  font-weight: 500;
}
.chat-compose-bar__upload-status {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  font-weight: 500;
  color: var(--app-text);
}
.chat-compose-bar__location-error {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-muted);
}
.chat-compose-bar__location-value {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text-soft);
}
.chat-compose-bar__button-message-timer--success {
  color: var(--app-success);
  border-color: color-mix(in oklab,var(--app-success) 40%,transparent);
  background-color: color-mix(in oklab,var(--app-success) 10%,transparent);
}
.chat-compose-bar__button-attach-image--selected {
  border-color: var(--app-border-strong);
  background-color: var(--app-surface-raised);
  color: var(--app-text);
}
.chat-compose-bar__button-format-message--selected {
  border-color: var(--app-border-strong);
  background-color: var(--app-surface-raised);
  color: var(--app-text);
}
.chat-compose-bar__button-preview-formatting--selected {
  border-color: var(--app-border-strong);
  background-color: var(--app-surface-raised);
  color: var(--app-text);
}
.chat-compose-bar__button-message-timer--selected {
  border-color: var(--app-border-strong);
  background-color: var(--app-surface-raised);
  color: var(--app-text);
}
.chat-compose-bar__upload-progress--done {
  background-color: var(--app-success);
}
.chat-compose-bar__upload-progress--busy {
  background-color: var(--app-text);
}
.chat-compose-bar__mention-option--selected {
  background-color: var(--app-surface-raised);
  color: var(--app-text);
}
.chat-compose-bar__precision-option--selected {
  background-color: var(--app-surface-raised);
  color: var(--app-text);
}
.chat-compose-bar__render-option--selected {
  background-color: var(--app-surface-raised);
  color: var(--app-text);
}
.chat-compose-bar__mentions-heading {
  padding-inline: 0.5rem;
  padding-block: 0.25rem;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--app-muted);
  text-transform: uppercase;
}
.chat-compose-bar__text-replying-to {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--app-text-soft);
  text-transform: uppercase;
}
.chat-compose-bar__upload-percent {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-text-soft);
}
.chat-compose-bar__format-title {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--app-muted);
  text-transform: uppercase;
}
.chat-compose-bar__timer-title {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--app-muted);
  text-transform: uppercase;
}
.chat-compose-bar__preview-label {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.05em;
  color: var(--app-muted);
  text-transform: uppercase;
}
.chat-compose-bar__chat-message-body {
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--app-text);
}
.chat-compose-bar__preview-plain {
  font-size: 0.8125rem;
  line-height: 1.625;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  color: var(--app-text-soft);
}
.chat-compose-bar__location-title {
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--app-text);
}
.chat-compose-bar__text-no-formatting {
  font-size: 10px;
  color: var(--app-muted-2);
}
.chat-compose-bar__text-sent-as {
  font-size: 10px;
  color: var(--app-muted-2);
}
.chat-compose-bar__upload-retry {
  color: var(--app-warning);
}
.chat-compose-bar__map-pin--success {
  color: var(--app-success);
}
.chat-compose-bar__mention-option--muted {
  color: var(--app-text-soft);
}
.chat-compose-bar__precision-option--muted {
  color: var(--app-text-soft);
}
.chat-compose-bar__render-option--muted {
  color: var(--app-text-soft);
}
.chat-compose-bar__button-attach-image--muted {
  color: var(--app-text-soft);
}
.chat-compose-bar__button-format-message--muted {
  color: var(--app-text-soft);
}
.chat-compose-bar__button-preview-formatting--muted {
  color: var(--app-text-soft);
}
.chat-compose-bar__button-message-timer--muted {
  color: var(--app-text-soft);
}
.chat-compose-bar__map-pin--muted {
  color: var(--app-muted);
}
.chat-compose-bar__field-type-a::placeholder {
  color: var(--app-muted);
}
.chat-compose-bar__enter-active-class {
  transition-property: all;
  transition-duration: .15s;
  transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
}
.chat-compose-bar__leave-active-class {
  transition-property: all;
  transition-duration: .1s;
  transition-timing-function: var(--app-ease-in);
}
.chat-compose-bar__enter-active-class-2 {
  transition-property: all;
  transition-duration: .15s;
  transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
}
.chat-compose-bar__leave-active-class-2 {
  transition-property: all;
  transition-duration: .1s;
  transition-timing-function: var(--app-ease-in);
}
.chat-compose-bar__enter-active-class-3 {
  transition-property: all;
  transition-duration: .15s;
  transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
}
.chat-compose-bar__leave-active-class-3 {
  transition-property: all;
  transition-duration: .1s;
  transition-timing-function: var(--app-ease-in);
}
.chat-compose-bar__input-card:focus-within {
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}
.chat-compose-bar__field-type-a:focus {
  outline-style: none;
}
.chat-compose-bar__button-send-message:active {
  scale: 95% 95%;
}
.chat-compose-bar__button-attach-image:disabled {
  opacity: .4;
}
.chat-compose-bar__button-format-message:disabled {
  opacity: .4;
}
.chat-compose-bar__button-message-timer:disabled {
  opacity: .4;
}
.chat-compose-bar__button-voice-note:disabled {
  opacity: .4;
}
.chat-compose-bar__button-send-message:disabled {
  opacity: .4;
}
.chat-compose-bar__field-type-a:disabled {
  opacity: .5;
}
[data-theme="light"] .chat-compose-bar__text-replying-to {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__mention-option--muted {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__upload-percent {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__location-value {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__precision-option--muted {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__format-action {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__render-option--muted {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__preview-plain {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__button-attach-image--muted {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__button-format-message--muted {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__button-preview-formatting--muted {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__button-message-timer--muted {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__text-no-formatting {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-compose-bar__text-sent-as {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-compose-bar__footer-hint {
  color: var(--app-text-soft);
}
.chat-compose-bar__input-card, .chat-compose-bar__button-send-message {
  box-shadow: none;
}
.chat-compose-bar__button-attach-image:focus-visible, .chat-compose-bar__button-format-message:focus-visible, .chat-compose-bar__button-preview-formatting:focus-visible, .chat-compose-bar__button-message-timer:focus-visible, .chat-compose-bar__button-voice-note:focus-visible, .chat-compose-bar__button-send-message:focus-visible, .chat-compose-bar__button-cancel-upload:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 2px;
}
.chat-compose-bar__button-send-message, .chat-compose-bar__button-voice-note {
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
}
@media (hover: hover) {
  .chat-compose-bar__button-send-message:hover, .chat-compose-bar__button-voice-note:hover {
    background-color: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }
  .chat-compose-bar__button-attach-image:hover, .chat-compose-bar__button-format-message:hover, .chat-compose-bar__button-preview-formatting:hover, .chat-compose-bar__button-message-timer:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }
}
@media (pointer: coarse) {
  .chat-compose-bar__button-attach-image, .chat-compose-bar__button-format-message, .chat-compose-bar__button-preview-formatting, .chat-compose-bar__button-message-timer, .chat-compose-bar__button-voice-note, .chat-compose-bar__button-send-message {
    min-height: var(--app-touch-h);
  }
  .chat-compose-bar__button-attach-image, .chat-compose-bar__button-format-message, .chat-compose-bar__button-preview-formatting, .chat-compose-bar__button-voice-note {
    min-width: var(--app-touch-h);
  }
}
@media (prefers-reduced-motion: reduce) {
  .chat-compose-bar__input-card {
    transition: none;
  }
}
</style>
