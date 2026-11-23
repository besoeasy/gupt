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
  <div class="chat-compose-bar__block">
    <!-- Replying Banner -->
    <div
      v-if="replyingTo"
      class="chat-compose-bar__block-2"
    >
      <div class="chat-compose-bar__block-3">
        <p class="chat-compose-bar__text-replying-to">
          Replying to message
        </p>
        <p class="chat-compose-bar__text">
          {{ replyPreview }}
        </p>
      </div>
      <button
        type="button"
        @click="emit('cancel-reply')"
        class="chat-compose-bar__button"
      >
        <X class="chat-compose-bar__x" :stroke-width="1.8" />
      </button>
    </div>

    <!-- Mentions Dropdown -->
    <div
      v-if="showMentions && filteredMentions.length"
      class="chat-compose-bar__block-4"
    >
      <div class="chat-compose-bar__block-mention-member">
        Mention Member
      </div>
      <button
        v-for="(user, idx) in filteredMentions"
        :key="user.pubkey"
        type="button"
        @click="insertMention(user)"
        class="chat-compose-bar__button-2"
        :class="
          idx === selectedMentionIdx
            ? 'chat-compose-bar__button--selected'
            : 'chat-compose-bar__button--muted'
        "
      >
        <RoboAvatar :pubkey="user.pubkey" size="xs" />
        <span class="chat-compose-bar__text-2">{{ user.name }}</span>
      </button>
    </div>

    <!-- Upload Status Banner -->
    <div
      v-if="uploadStatus"
      class="chat-compose-bar__block-5"
    >
      <div class="chat-compose-bar__block-6">
        <div class="chat-compose-bar__block-7">
          <span
            class="chat-compose-bar__text-3"
            :class="
              uploadStatus.phase === 'done'
                ? 'chat-compose-bar__text--pulse'
                : 'chat-compose-bar__text--variant-2'
            "
          />
          <span class="chat-compose-bar__text-4">
            <span v-if="uploadStatus.phase === 'encrypting'">
              Encrypting attachment<span v-if="uploadStatus.batchTotal > 1">
                {{ uploadStatus.batchIndex }} of {{ uploadStatus.batchTotal }}</span
              >…
            </span>
            <span v-else-if="uploadStatus.phase === 'uploading'">
              <span v-if="uploadStatus.retryCount" class="chat-compose-bar__text-5">
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
        <div class="chat-compose-bar__block-8">
          <span
            v-if="uploadStatus.phase === 'uploading'"
            class="chat-compose-bar__text-6"
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
      <div class="chat-compose-bar__block-9">
        <div
          class="chat-compose-bar__block-10"
          :class="uploadStatus.phase === 'done' ? 'chat-compose-bar__block--success' : 'chat-compose-bar__block--variant-2'"
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
      class="chat-compose-bar__block-11"
    >
      <div class="chat-compose-bar__block-12">
        <!-- Live Real-Time Equalizer Waveform -->
        <div class="chat-compose-bar__block-13">
          <span
            v-for="(lvl, i) in audioLevels.length ? audioLevels : new Array(24).fill(0.15)"
            :key="i"
            class="chat-compose-bar__text-7"
            :style="{ height: `${Math.max(4, Math.round(lvl * 24))}px` }"
          />
        </div>

        <span class="chat-compose-bar__text-8">
          {{ formatDuration(recordingSeconds) }}
        </span>
      </div>

      <div class="chat-compose-bar__block-14">
        <button
          type="button"
          @click="emit('cancel-recording')"
          class="chat-compose-bar__button-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          @click="emit('toggle-recording')"
          class="chat-compose-bar__button-send"
        >
          <Square class="chat-compose-bar__square" />
          Send
        </button>
      </div>
    </div>

    <!-- Location Draft -->
    <div
      v-else-if="locationDraft"
      class="chat-compose-bar__block-15"
    >
      <div class="chat-compose-bar__block-16">
        <div class="chat-compose-bar__block-17">
          <MapPin
            class="chat-compose-bar__map-pin"
            :stroke-width="1.8"
            :class="locationDraft.status === 'ready' ? 'chat-compose-bar__map-pin--success' : 'chat-compose-bar__map-pin--muted'"
          />
          <div class="chat-compose-bar__block-18">
            <p class="chat-compose-bar__text-9">
              <span v-if="locationDraft.status === 'locating'">Finding your position…</span>
              <span v-else-if="locationDraft.status === 'error'">Location unavailable</span>
              <span v-else>Share this location</span>
            </p>
            <p
              v-if="locationDraft.status === 'error'"
              class="chat-compose-bar__text-10"
              :title="locationDraft.error"
            >
              {{ locationDraft.error }}
            </p>
            <p
              v-else-if="locationDraft.status === 'ready'"
              class="chat-compose-bar__text-11"
            >
              {{ locationLabel || locationCoordsText }}
            </p>
          </div>
        </div>
        <div class="chat-compose-bar__block-19">
          <button
            type="button"
            @click="emit('cancel-location')"
            class="chat-compose-bar__button-cancel-2"
          >
            Cancel
          </button>
          <button
            v-if="locationDraft.status === 'ready'"
            type="button"
            @click="emit('send-location')"
            class="chat-compose-bar__button-send-2"
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
        class="chat-compose-bar__block-20"
      >
        <button
          v-for="option in [
            { value: LOCATION_PRECISION.EXACT, title: 'Exact position' },
            { value: LOCATION_PRECISION.APPROXIMATE, title: 'Approximate (~1km)' },
          ]"
          :key="option.value"
          type="button"
          @click="emit('set-location-precision', option.value)"
          class="chat-compose-bar__button-3"
          :class="
            locationDraft.precision === option.value
              ? 'chat-compose-bar__button--selected-2'
              : 'chat-compose-bar__button--muted-2'
          "
        >
          {{ option.title }}
        </button>
      </div>
    </div>

    <!-- Normal Input Card Container (Geist command-style input) -->
    <div
      v-else
      class="chat-compose-bar__block-21"
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
          class="chat-compose-bar__block-22"
        >
          <div class="chat-compose-bar__block-23">
            <span class="chat-compose-bar__text-format">
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

          <div class="chat-compose-bar__block-24">
            <button
              v-for="action in formatActions"
              :key="action.id"
              type="button"
              @click="applyFormat(action.id)"
              :title="`${action.label} · ${action.hint}`"
              :aria-label="action.label"
              class="chat-compose-bar__button-4"
            >
              <component :is="action.icon" class="chat-compose-bar__component" :stroke-width="1.8" />
            </button>
          </div>

          <div class="chat-compose-bar__block-25">
            <p class="chat-compose-bar__text-rendering">
              Rendering
            </p>
            <div
              class="chat-compose-bar__block-26"
            >
              <button
                v-for="mode in modeOptions"
                :key="mode.id"
                type="button"
                @click="templateMode = mode.id"
                class="chat-compose-bar__button-5"
                :class="
                  templateMode === mode.id
                    ? 'chat-compose-bar__button--selected-3'
                    : 'chat-compose-bar__button--muted-3'
                "
              >
                {{ mode.label }}
              </button>
            </div>
            <p class="chat-compose-bar__text-12">
              Auto renders only strong constructs. Formatted forces rendering; Plain sends the text
              untouched.
            </p>
          </div>

          <p
            class="chat-compose-bar__text-13"
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
          class="chat-compose-bar__block-27"
        >
          <div class="chat-compose-bar__block-28">
            <span class="chat-compose-bar__text-message-timer">
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

          <p class="chat-compose-bar__text-14">
            New messages disappear after the chosen time. Both sides share the latest change.
          </p>
        </div>
      </Transition>

      <!-- Formatting preview -->
      <div
        v-if="showPreview && text.trim()"
        class="chat-compose-bar__block-29"
      >
        <div class="chat-compose-bar__block-30">
          <span class="chat-compose-bar__text-preview">Preview</span>
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
        <p v-else class="chat-compose-bar__text-15">
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
      <div class="chat-compose-bar__block-31">
        <!-- Left: Attachments (Plus toggle) -->
        <div class="chat-compose-bar__block-32">
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
              class="chat-compose-bar__block-33"
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
              class="chat-compose-bar__text-16"
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

          <span class="chat-compose-bar__text-17">
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
        <div class="chat-compose-bar__block-34">
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
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.chat-compose-bar__button-message-timer--success:hover {
  border-color: #00bb7f99;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.chat-compose-bar__button-message-timer--success:hover {
  border-color: color-mix(in oklab,var(--color-emerald-500) 60%,transparent);
}
}
}

@media (hover:hover) {
.chat-compose-bar__button-cancel:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-compose-bar__button-cancel-2:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-compose-bar__button-4:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-compose-bar__button-attach-image--muted:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-compose-bar__button-format-message--muted:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-compose-bar__button-preview-formatting--muted:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-compose-bar__button-message-timer--muted:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-compose-bar__button-voice-note:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-compose-bar__button-send:hover {
  background-color: var(--color-red-600);
}
}

@media (hover:hover) {
.chat-compose-bar__button-send-2:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.chat-compose-bar__button-send-message:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.chat-compose-bar__button:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-compose-bar__button-close-formatting:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-compose-bar__button-4:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-compose-bar__button-close-message:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-compose-bar__button-send-images:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-compose-bar__button-attach-files:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-compose-bar__button-share-your:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-compose-bar__button-voice-note:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-compose-bar__button--muted-2:hover {
  background-color: var(--app-surface-raised-tint-soft);
}
}

@media (hover:hover) {
.chat-compose-bar__button--muted:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
.chat-compose-bar__button-attach-image--muted:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
.chat-compose-bar__button-format-message--muted:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
.chat-compose-bar__button-preview-formatting--muted:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
.chat-compose-bar__button-message-timer--muted:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
.chat-compose-bar__button-cancel:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-compose-bar__button-cancel-2:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-compose-bar__button-4:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-compose-bar__button-attach-image--muted:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-compose-bar__button-send-images:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-compose-bar__button-attach-files:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-compose-bar__button-share-your:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-compose-bar__button-format-message--muted:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-compose-bar__button-preview-formatting--muted:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-compose-bar__button-message-timer--muted:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-compose-bar__button-voice-note:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-compose-bar__button:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.chat-compose-bar__button--muted:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.chat-compose-bar__button-cancel-upload:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.chat-compose-bar__button--muted-2:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.chat-compose-bar__button-close-formatting:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.chat-compose-bar__button--muted-3:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.chat-compose-bar__button-close-message:hover {
  color: var(--ui-zinc-200);
}
}

@media (min-width:40rem) {
.chat-compose-bar__text-17 {
  display: inline-block;
}
}

@media (min-width:40rem) {
.chat-compose-bar__text-7 {
  width: var(--spacing);
}
}

@media (min-width:40rem) {
.chat-compose-bar__block-13 {
  gap: var(--spacing);
}
}

@media (min-width:40rem) {
.chat-compose-bar__block-12 {
  gap: calc(var(--spacing) * 3);
}
}

@media (min-width:40rem) {
.chat-compose-bar__block {
  padding-inline: calc(var(--spacing) * 4);
}
}

@layer gupt-components {
.chat-compose-bar__block-4 {
  position: absolute;
}
.chat-compose-bar__block-22 {
  position: absolute;
}
.chat-compose-bar__block-27 {
  position: absolute;
}
.chat-compose-bar__block-33 {
  position: absolute;
}
.chat-compose-bar__text-16 {
  position: absolute;
}
.chat-compose-bar__block {
  position: relative;
}
.chat-compose-bar__block-21 {
  position: relative;
}
.chat-compose-bar__block-32 {
  position: relative;
}
.chat-compose-bar__button-format-message {
  position: relative;
}
.chat-compose-bar__text-16 {
  top: calc(var(--spacing) * -.5);
}
.chat-compose-bar__text-16 {
  right: calc(var(--spacing) * -.5);
}
.chat-compose-bar__block-4 {
  bottom: 100%;
}
.chat-compose-bar__block-22 {
  bottom: 100%;
}
.chat-compose-bar__block-27 {
  bottom: 100%;
}
.chat-compose-bar__block-33 {
  bottom: 100%;
}
.chat-compose-bar__block-22 {
  left: 0;
}
.chat-compose-bar__block-27 {
  left: 0;
}
.chat-compose-bar__block-33 {
  left: 0;
}
.chat-compose-bar__block-4 {
  left: calc(var(--spacing) * 4);
}
.chat-compose-bar__block-4 {
  z-index: 30;
}
.chat-compose-bar__block-22 {
  z-index: 30;
}
.chat-compose-bar__block-27 {
  z-index: 30;
}
.chat-compose-bar__block-33 {
  z-index: 30;
}
.chat-compose-bar__text-12 {
  margin-top: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__text-14 {
  margin-top: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__block-25 {
  margin-top: calc(var(--spacing) * 2);
}
.chat-compose-bar__text-13 {
  margin-top: calc(var(--spacing) * 2);
}
.chat-compose-bar__text-rendering {
  margin-bottom: var(--spacing);
}
.chat-compose-bar__block-29 {
  margin-bottom: var(--spacing);
}
.chat-compose-bar__block-30 {
  margin-bottom: var(--spacing);
}
.chat-compose-bar__block-23 {
  margin-bottom: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__block-28 {
  margin-bottom: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__block-2 {
  margin-bottom: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-4 {
  margin-bottom: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-22 {
  margin-bottom: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-27 {
  margin-bottom: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-33 {
  margin-bottom: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-5 {
  margin-bottom: calc(var(--spacing) * 2.5);
}
.chat-compose-bar__field-type-a {
  box-sizing: border-box;
}
.chat-compose-bar__block {
  display: flex;
}
.chat-compose-bar__block-2 {
  display: flex;
}
.chat-compose-bar__button-2 {
  display: flex;
}
.chat-compose-bar__block-5 {
  display: flex;
}
.chat-compose-bar__block-6 {
  display: flex;
}
.chat-compose-bar__block-7 {
  display: flex;
}
.chat-compose-bar__block-8 {
  display: flex;
}
.chat-compose-bar__block-11 {
  display: flex;
}
.chat-compose-bar__block-12 {
  display: flex;
}
.chat-compose-bar__block-13 {
  display: flex;
}
.chat-compose-bar__block-14 {
  display: flex;
}
.chat-compose-bar__block-15 {
  display: flex;
}
.chat-compose-bar__block-16 {
  display: flex;
}
.chat-compose-bar__block-17 {
  display: flex;
}
.chat-compose-bar__block-19 {
  display: flex;
}
.chat-compose-bar__block-20 {
  display: flex;
}
.chat-compose-bar__block-21 {
  display: flex;
}
.chat-compose-bar__block-23 {
  display: flex;
}
.chat-compose-bar__block-28 {
  display: flex;
}
.chat-compose-bar__block-30 {
  display: flex;
}
.chat-compose-bar__block-31 {
  display: flex;
}
.chat-compose-bar__block-32 {
  display: flex;
}
.chat-compose-bar__block-33 {
  display: flex;
}
.chat-compose-bar__block-34 {
  display: flex;
}
.chat-compose-bar__block-24 {
  display: grid;
}
.chat-compose-bar__block-26 {
  display: grid;
}
.chat-compose-bar__text-17 {
  display: none;
}
.chat-compose-bar__field-file {
  display: none;
}
.chat-compose-bar__field-file-2 {
  display: none;
}
.chat-compose-bar__button {
  display: inline-flex;
}
.chat-compose-bar__button-send {
  display: inline-flex;
}
.chat-compose-bar__button-send-2 {
  display: inline-flex;
}
.chat-compose-bar__button-close-formatting {
  display: inline-flex;
}
.chat-compose-bar__button-4 {
  display: inline-flex;
}
.chat-compose-bar__button-close-message {
  display: inline-flex;
}
.chat-compose-bar__button-attach-image {
  display: inline-flex;
}
.chat-compose-bar__button-send-images {
  display: inline-flex;
}
.chat-compose-bar__button-attach-files {
  display: inline-flex;
}
.chat-compose-bar__button-share-your {
  display: inline-flex;
}
.chat-compose-bar__button-format-message {
  display: inline-flex;
}
.chat-compose-bar__button-preview-formatting {
  display: inline-flex;
}
.chat-compose-bar__button-message-timer {
  display: inline-flex;
}
.chat-compose-bar__button-voice-note {
  display: inline-flex;
}
.chat-compose-bar__button-send-message {
  display: inline-flex;
}
.chat-compose-bar__block-9 {
  height: var(--spacing);
}
.chat-compose-bar__text-16 {
  height: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__text-3 {
  height: calc(var(--spacing) * 2);
}
.chat-compose-bar__x {
  height: calc(var(--spacing) * 3);
}
.chat-compose-bar__square {
  height: calc(var(--spacing) * 3);
}
.chat-compose-bar__send-horizontal {
  height: calc(var(--spacing) * 3);
}
.chat-compose-bar__x-3 {
  height: calc(var(--spacing) * 3);
}
.chat-compose-bar__x-4 {
  height: calc(var(--spacing) * 3);
}
.chat-compose-bar__send-horizontal-2 {
  height: 14px;
}
.chat-compose-bar__x-2 {
  height: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__component {
  height: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__plus {
  height: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__image-plus {
  height: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__paperclip {
  height: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__map-pin-2 {
  height: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__type {
  height: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__eye {
  height: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__timer {
  height: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__mic {
  height: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__map-pin {
  height: calc(var(--spacing) * 4);
}
.chat-compose-bar__button {
  height: calc(var(--spacing) * 5);
}
.chat-compose-bar__button-close-formatting {
  height: calc(var(--spacing) * 5);
}
.chat-compose-bar__button-close-message {
  height: calc(var(--spacing) * 5);
}
.chat-compose-bar__block-13 {
  height: calc(var(--spacing) * 6);
}
.chat-compose-bar__button-attach-image {
  height: 28px;

}
.chat-compose-bar__button-format-message {
  height: 28px;

}
.chat-compose-bar__button-preview-formatting {
  height: 28px;

}
.chat-compose-bar__button-message-timer {
  height: 28px;

}
.chat-compose-bar__button-voice-note {
  height: 30px;

}
.chat-compose-bar__button-send-message {
  height: 30px;

}
.chat-compose-bar__button-4 {
  height: calc(var(--spacing) * 8);
}
.chat-compose-bar__block-10 {
  height: 100%;
}
.chat-compose-bar__field-type-a {
  max-height: calc(var(--spacing) * 36);
}
.chat-compose-bar__block-29 {
  max-height: calc(var(--spacing) * 40);
}
.chat-compose-bar__field-type-a {
  min-height: 40px;

}
.chat-compose-bar__text-7 {
  width: calc(var(--spacing) * .75);
}
.chat-compose-bar__text-16 {
  width: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__text-3 {
  width: calc(var(--spacing) * 2);
}
.chat-compose-bar__x {
  width: calc(var(--spacing) * 3);
}
.chat-compose-bar__square {
  width: calc(var(--spacing) * 3);
}
.chat-compose-bar__send-horizontal {
  width: calc(var(--spacing) * 3);
}
.chat-compose-bar__x-3 {
  width: calc(var(--spacing) * 3);
}
.chat-compose-bar__x-4 {
  width: calc(var(--spacing) * 3);
}
.chat-compose-bar__send-horizontal-2 {
  width: 14px;
}
.chat-compose-bar__x-2 {
  width: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__component {
  width: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__plus {
  width: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__image-plus {
  width: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__paperclip {
  width: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__map-pin-2 {
  width: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__type {
  width: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__eye {
  width: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__timer {
  width: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__mic {
  width: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__map-pin {
  width: calc(var(--spacing) * 4);
}
.chat-compose-bar__button {
  width: calc(var(--spacing) * 5);
}
.chat-compose-bar__button-close-formatting {
  width: calc(var(--spacing) * 5);
}
.chat-compose-bar__button-close-message {
  width: calc(var(--spacing) * 5);
}
.chat-compose-bar__button-attach-image {
  width: 28px;

}
.chat-compose-bar__button-format-message {
  width: 28px;

}
.chat-compose-bar__button-preview-formatting {
  width: 28px;

}
.chat-compose-bar__button-voice-note {
  width: 30px;

}
.chat-compose-bar__block-4 {
  width: calc(var(--spacing) * 64);
}
.chat-compose-bar__block-27 {
  width: 17rem;
}
.chat-compose-bar__block-22 {
  width: 19rem;
}
.chat-compose-bar__button-2 {
  width: 100%;
}
.chat-compose-bar__block-9 {
  width: 100%;
}
.chat-compose-bar__field-type-a {
  width: 100%;
}
.chat-compose-bar__block-22 {
  max-width: calc(100vw - 1.5rem);
}
.chat-compose-bar__block-27 {
  max-width: calc(100vw - 2rem);
}
.chat-compose-bar__block-3 {
  min-width: 0;
}
.chat-compose-bar__block-7 {
  min-width: 0;
}
.chat-compose-bar__block-12 {
  min-width: 0;
}
.chat-compose-bar__block-17 {
  min-width: 0;
}
.chat-compose-bar__block-18 {
  min-width: 0;
}
.chat-compose-bar__block-3 {
  flex: 1;
}
.chat-compose-bar__block-12 {
  flex: 1;
}
.chat-compose-bar__block-17 {
  flex: 1;
}
.chat-compose-bar__block-18 {
  flex: 1;
}
.chat-compose-bar__button-3 {
  flex: 1;
}
.chat-compose-bar__block {
  flex-shrink: 0;
}
.chat-compose-bar__button {
  flex-shrink: 0;
}
.chat-compose-bar__text-3 {
  flex-shrink: 0;
}
.chat-compose-bar__block-8 {
  flex-shrink: 0;
}
.chat-compose-bar__block-13 {
  flex-shrink: 0;
}
.chat-compose-bar__text-8 {
  flex-shrink: 0;
}
.chat-compose-bar__block-14 {
  flex-shrink: 0;
}
.chat-compose-bar__map-pin {
  flex-shrink: 0;
}
.chat-compose-bar__block-19 {
  flex-shrink: 0;
}
.chat-compose-bar__timer {
  flex-shrink: 0;
}
.chat-compose-bar__enter-from-class {
  --translate-y: calc(var(--spacing) * -1);
  translate: var(--translate-x,0) calc(var(--spacing) * -1);
}
.chat-compose-bar__leave-from-class {
  --translate-y: calc(var(--spacing) * -1);
  translate: var(--translate-x,0) calc(var(--spacing) * -1);
}
.chat-compose-bar__enter-from-class-2 {
  --translate-y: calc(var(--spacing) * -1);
  translate: var(--translate-x,0) calc(var(--spacing) * -1);
}
.chat-compose-bar__leave-from-class-2 {
  --translate-y: calc(var(--spacing) * -1);
  translate: var(--translate-x,0) calc(var(--spacing) * -1);
}
.chat-compose-bar__enter-from-class-3 {
  --translate-y: calc(var(--spacing) * -1);
  translate: var(--translate-x,0) calc(var(--spacing) * -1);
}
.chat-compose-bar__leave-from-class-3 {
  --translate-y: calc(var(--spacing) * -1);
  translate: var(--translate-x,0) calc(var(--spacing) * -1);
}
.chat-compose-bar__text--variant-2 {
  animation: var(--animate-ping);
}
.chat-compose-bar__text--pulse {
  animation: var(--animate-pulse);
}
.chat-compose-bar__button {
  cursor: pointer;
}
.chat-compose-bar__button-2 {
  cursor: pointer;
}
.chat-compose-bar__button-cancel-upload {
  cursor: pointer;
}
.chat-compose-bar__button-cancel {
  cursor: pointer;
}
.chat-compose-bar__button-send {
  cursor: pointer;
}
.chat-compose-bar__button-cancel-2 {
  cursor: pointer;
}
.chat-compose-bar__button-send-2 {
  cursor: pointer;
}
.chat-compose-bar__button-3 {
  cursor: pointer;
}
.chat-compose-bar__button-close-formatting {
  cursor: pointer;
}
.chat-compose-bar__button-4 {
  cursor: pointer;
}
.chat-compose-bar__button-5 {
  cursor: pointer;
}
.chat-compose-bar__button-close-message {
  cursor: pointer;
}
.chat-compose-bar__button-attach-image {
  cursor: pointer;
}
.chat-compose-bar__button-send-images {
  cursor: pointer;
}
.chat-compose-bar__button-attach-files {
  cursor: pointer;
}
.chat-compose-bar__button-share-your {
  cursor: pointer;
}
.chat-compose-bar__button-format-message {
  cursor: pointer;
}
.chat-compose-bar__button-preview-formatting {
  cursor: pointer;
}
.chat-compose-bar__button-message-timer {
  cursor: pointer;
}
.chat-compose-bar__button-voice-note {
  cursor: pointer;
}
.chat-compose-bar__button-send-message {
  cursor: pointer;
}
.chat-compose-bar__field-type-a {
  resize: none;
}
.chat-compose-bar__block-26 {
  grid-template-columns: repeat(3,minmax(0,1fr));
}
.chat-compose-bar__block-24 {
  grid-template-columns: repeat(4,minmax(0,1fr));
}
.chat-compose-bar__block {
  flex-direction: column;
}
.chat-compose-bar__block-5 {
  flex-direction: column;
}
.chat-compose-bar__block-15 {
  flex-direction: column;
}
.chat-compose-bar__block-21 {
  flex-direction: column;
}
.chat-compose-bar__block-33 {
  flex-direction: column;
}
.chat-compose-bar__block-2 {
  align-items: center;
}
.chat-compose-bar__button {
  align-items: center;
}
.chat-compose-bar__button-2 {
  align-items: center;
}
.chat-compose-bar__block-6 {
  align-items: center;
}
.chat-compose-bar__block-7 {
  align-items: center;
}
.chat-compose-bar__block-8 {
  align-items: center;
}
.chat-compose-bar__block-11 {
  align-items: center;
}
.chat-compose-bar__block-12 {
  align-items: center;
}
.chat-compose-bar__block-13 {
  align-items: center;
}
.chat-compose-bar__block-14 {
  align-items: center;
}
.chat-compose-bar__button-send {
  align-items: center;
}
.chat-compose-bar__block-16 {
  align-items: center;
}
.chat-compose-bar__block-17 {
  align-items: center;
}
.chat-compose-bar__block-19 {
  align-items: center;
}
.chat-compose-bar__button-send-2 {
  align-items: center;
}
.chat-compose-bar__block-20 {
  align-items: center;
}
.chat-compose-bar__block-23 {
  align-items: center;
}
.chat-compose-bar__button-close-formatting {
  align-items: center;
}
.chat-compose-bar__button-4 {
  align-items: center;
}
.chat-compose-bar__block-28 {
  align-items: center;
}
.chat-compose-bar__button-close-message {
  align-items: center;
}
.chat-compose-bar__block-30 {
  align-items: center;
}
.chat-compose-bar__block-31 {
  align-items: center;
}
.chat-compose-bar__block-32 {
  align-items: center;
}
.chat-compose-bar__button-attach-image {
  align-items: center;
}
.chat-compose-bar__button-send-images {
  align-items: center;
}
.chat-compose-bar__button-attach-files {
  align-items: center;
}
.chat-compose-bar__button-share-your {
  align-items: center;
}
.chat-compose-bar__button-format-message {
  align-items: center;
}
.chat-compose-bar__button-preview-formatting {
  align-items: center;
}
.chat-compose-bar__button-message-timer {
  align-items: center;
}
.chat-compose-bar__block-34 {
  align-items: center;
}
.chat-compose-bar__button-voice-note {
  align-items: center;
}
.chat-compose-bar__button-send-message {
  align-items: center;
}
.chat-compose-bar__block-2 {
  justify-content: space-between;
}
.chat-compose-bar__block-6 {
  justify-content: space-between;
}
.chat-compose-bar__block-11 {
  justify-content: space-between;
}
.chat-compose-bar__block-16 {
  justify-content: space-between;
}
.chat-compose-bar__block-23 {
  justify-content: space-between;
}
.chat-compose-bar__block-28 {
  justify-content: space-between;
}
.chat-compose-bar__block-30 {
  justify-content: space-between;
}
.chat-compose-bar__block-31 {
  justify-content: space-between;
}
.chat-compose-bar__button {
  justify-content: center;
}
.chat-compose-bar__button-close-formatting {
  justify-content: center;
}
.chat-compose-bar__button-4 {
  justify-content: center;
}
.chat-compose-bar__button-close-message {
  justify-content: center;
}
.chat-compose-bar__button-attach-image {
  justify-content: center;
}
.chat-compose-bar__button-format-message {
  justify-content: center;
}
.chat-compose-bar__button-preview-formatting {
  justify-content: center;
}
.chat-compose-bar__button-voice-note {
  justify-content: center;
}
.chat-compose-bar__button-send-message {
  justify-content: center;
}
.chat-compose-bar__block-13 {
  gap: calc(var(--spacing) * .5);
}
.chat-compose-bar__block-26 {
  gap: calc(var(--spacing) * .5);
}
.chat-compose-bar__block-33 {
  gap: calc(var(--spacing) * .5);
}
.chat-compose-bar__block-20 {
  gap: var(--spacing);
}
.chat-compose-bar__block-24 {
  gap: var(--spacing);
}
.chat-compose-bar__block-32 {
  gap: var(--spacing);
}
.chat-compose-bar__button-message-timer {
  gap: var(--spacing);
}
.chat-compose-bar__button-send {
  gap: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__button-send-2 {
  gap: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__block-34 {
  gap: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__button-send-message {
  gap: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__block-2 {
  gap: calc(var(--spacing) * 2);
}
.chat-compose-bar__button-2 {
  gap: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-5 {
  gap: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-7 {
  gap: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-8 {
  gap: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-14 {
  gap: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-19 {
  gap: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-30 {
  gap: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-31 {
  gap: calc(var(--spacing) * 2);
}
.chat-compose-bar__button-send-images {
  gap: calc(var(--spacing) * 2);
}
.chat-compose-bar__button-attach-files {
  gap: calc(var(--spacing) * 2);
}
.chat-compose-bar__button-share-your {
  gap: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-12 {
  gap: calc(var(--spacing) * 2.5);
}
.chat-compose-bar__block-15 {
  gap: calc(var(--spacing) * 2.5);
}
.chat-compose-bar__block-17 {
  gap: calc(var(--spacing) * 2.5);
}
.chat-compose-bar__block-11 {
  gap: calc(var(--spacing) * 3);
}
.chat-compose-bar__block-16 {
  gap: calc(var(--spacing) * 3);
}
.chat-compose-bar__text {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-compose-bar__text-2 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-compose-bar__text-4 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-compose-bar__text-10 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-compose-bar__text-11 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-compose-bar__block-9 {
  overflow: hidden;
}
.chat-compose-bar__block-29 {
  overflow-y: auto;
}
.chat-compose-bar__button-cancel-upload {
  border-radius: .25rem;
}
.chat-compose-bar__text-3 {
  border-radius: 3.40282e38px;
}
.chat-compose-bar__block-9 {
  border-radius: 3.40282e38px;
}
.chat-compose-bar__block-10 {
  border-radius: 3.40282e38px;
}
.chat-compose-bar__text-7 {
  border-radius: 3.40282e38px;
}
.chat-compose-bar__text-16 {
  border-radius: 3.40282e38px;
}
.chat-compose-bar__block-2 {
  border-radius: var(--app-radius-sm);

}
.chat-compose-bar__button-2 {
  border-radius: var(--radius-lg);
}
.chat-compose-bar__button-cancel {
  border-radius: var(--radius-lg);
}
.chat-compose-bar__button-send {
  border-radius: var(--radius-lg);
}
.chat-compose-bar__button-cancel-2 {
  border-radius: var(--radius-lg);
}
.chat-compose-bar__button-send-2 {
  border-radius: var(--radius-lg);
}
.chat-compose-bar__block-20 {
  border-radius: var(--radius-lg);
}
.chat-compose-bar__button-4 {
  border-radius: var(--radius-lg);
}
.chat-compose-bar__block-26 {
  border-radius: var(--radius-lg);
}
.chat-compose-bar__block-29 {
  border-radius: var(--radius-lg);
}
.chat-compose-bar__button-attach-image {
  border-radius: var(--app-radius-sm);

}
.chat-compose-bar__block-33 {
  border-radius: var(--radius-lg);
}
.chat-compose-bar__button-format-message {
  border-radius: var(--app-radius-sm);

}
.chat-compose-bar__button-preview-formatting {
  border-radius: var(--app-radius-sm);

}
.chat-compose-bar__button-message-timer {
  border-radius: var(--app-radius-sm);

}
.chat-compose-bar__button-voice-note {
  border-radius: var(--app-radius-sm);

}
.chat-compose-bar__button-send-message {
  border-radius: var(--app-radius-sm);

}
.chat-compose-bar__button {
  border-radius: var(--radius-md);
}
.chat-compose-bar__button-3 {
  border-radius: var(--radius-md);
}
.chat-compose-bar__button-close-formatting {
  border-radius: var(--radius-md);
}
.chat-compose-bar__button-5 {
  border-radius: var(--radius-md);
}
.chat-compose-bar__button-close-message {
  border-radius: var(--radius-md);
}
.chat-compose-bar__button-send-images {
  border-radius: var(--radius-md);
}
.chat-compose-bar__button-attach-files {
  border-radius: var(--radius-md);
}
.chat-compose-bar__button-share-your {
  border-radius: var(--radius-md);
}
.chat-compose-bar__block-4 {
  border-radius: var(--radius-xl);
}
.chat-compose-bar__block-5 {
  border-radius: var(--radius-xl);
}
.chat-compose-bar__block-11 {
  border-radius: var(--radius-xl);
}
.chat-compose-bar__block-15 {
  border-radius: var(--radius-xl);
}
.chat-compose-bar__block-21 {
  border-radius: var(--app-radius-md);

}
.chat-compose-bar__block-22 {
  border-radius: var(--radius-xl);
}
.chat-compose-bar__block-27 {
  border-radius: var(--radius-xl);
}
.chat-compose-bar__block-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__block-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__block-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__block-11 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__button-cancel {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__block-15 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__button-cancel-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__block-20 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__block-21 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__block-22 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__button-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__block-26 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__block-27 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__block-29 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__button-attach-image {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__block-33 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__button-format-message {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__button-preview-formatting {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__button-message-timer {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__button-voice-note {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-compose-bar__block-25 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.chat-compose-bar__text-13 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.chat-compose-bar__button-message-timer--success {
  border-color: #00bb7f66;
}
.chat-compose-bar__block-11 {
  border-color: #fb2c364d;
}
.chat-compose-bar__button-attach-image--selected {
  border-color: var(--ui-zinc-700);
}
.chat-compose-bar__button-format-message--selected {
  border-color: var(--ui-zinc-700);
}
.chat-compose-bar__button-preview-formatting--selected {
  border-color: var(--ui-zinc-700);
}
.chat-compose-bar__button-message-timer--selected {
  border-color: var(--ui-zinc-700);
}
.chat-compose-bar__block-2 {
  border-color: var(--app-border);

}
.chat-compose-bar__block-4 {
  border-color: var(--ui-zinc-800);
}
.chat-compose-bar__block-5 {
  border-color: var(--ui-zinc-800);
}
.chat-compose-bar__button-cancel {
  border-color: var(--ui-zinc-800);
}
.chat-compose-bar__block-15 {
  border-color: var(--ui-zinc-800);
}
.chat-compose-bar__button-cancel-2 {
  border-color: var(--ui-zinc-800);
}
.chat-compose-bar__block-20 {
  border-color: var(--ui-zinc-800);
}
.chat-compose-bar__block-21 {
  border-color: var(--app-border);

}
.chat-compose-bar__block-22 {
  border-color: var(--ui-zinc-800);
}
.chat-compose-bar__block-26 {
  border-color: var(--ui-zinc-800);
}
.chat-compose-bar__block-27 {
  border-color: var(--ui-zinc-800);
}
.chat-compose-bar__block-33 {
  border-color: var(--ui-zinc-800);
}
.chat-compose-bar__button-voice-note {
  border-color: transparent;

}
.chat-compose-bar__button-4 {
  border-color: var(--app-border-quiet);
}
.chat-compose-bar__block-25 {
  border-color: var(--app-border-quiet);
}
.chat-compose-bar__text-13 {
  border-color: var(--app-border-quiet);
}
.chat-compose-bar__block-29 {
  border-color: var(--app-border-quiet);
}
.chat-compose-bar__button-attach-image {
  border-color: var(--app-border-quiet);
}
.chat-compose-bar__button-format-message {
  border-color: var(--app-border-quiet);
}
.chat-compose-bar__button-preview-formatting {
  border-color: var(--app-border-quiet);
}
.chat-compose-bar__button-message-timer {
  border-color: var(--app-border-quiet);
}
.chat-compose-bar__text-16 {
  background-color: var(--color-emerald-400);
}
.chat-compose-bar__text--pulse {
  background-color: var(--color-emerald-500);
}
.chat-compose-bar__block--success {
  background-color: var(--color-emerald-500);
}
.chat-compose-bar__button-message-timer--success {
  background-color: #00bb7f1a;
}
.chat-compose-bar__text-7 {
  background-color: var(--color-red-500);
}
.chat-compose-bar__button-send {
  background-color: var(--color-red-500);
}
.chat-compose-bar__field-type-a {
  background-color: #0000;
}
.chat-compose-bar__text--variant-2 {
  background-color: var(--color-white);
}
.chat-compose-bar__block--variant-2 {
  background-color: var(--color-white);
}
.chat-compose-bar__button-send-2 {
  background-color: var(--color-white);
}
.chat-compose-bar__button-send-message {
  background-color: var(--app-text);

}
.chat-compose-bar__button--selected {
  background-color: var(--ui-zinc-800);
}
.chat-compose-bar__block-9 {
  background-color: var(--ui-zinc-800);
}
.chat-compose-bar__button--selected-2 {
  background-color: var(--ui-zinc-800);
}
.chat-compose-bar__button--selected-3 {
  background-color: var(--ui-zinc-800);
}
.chat-compose-bar__button-attach-image--selected {
  background-color: var(--ui-zinc-800);
}
.chat-compose-bar__button-format-message--selected {
  background-color: var(--ui-zinc-800);
}
.chat-compose-bar__button-preview-formatting--selected {
  background-color: var(--ui-zinc-800);
}
.chat-compose-bar__button-message-timer--selected {
  background-color: var(--ui-zinc-800);
}
.chat-compose-bar__button-cancel {
  background-color: var(--ui-zinc-900);
}
.chat-compose-bar__button-cancel-2 {
  background-color: var(--ui-zinc-900);
}
.chat-compose-bar__block-29 {
  background-color: var(--app-surface-tint-soft);
}
.chat-compose-bar__block-20 {
  background-color: var(--ui-zinc-900);
}
.chat-compose-bar__block-2 {
  background-color: var(--app-surface-soft);

}
.chat-compose-bar__button-4 {
  background-color: var(--app-surface-tint);
}
.chat-compose-bar__block-26 {
  background-color: var(--app-surface-tint);
}
.chat-compose-bar__button-attach-image {
  background-color: var(--app-surface-tint);
}
.chat-compose-bar__button-format-message {
  background-color: var(--app-surface-tint);
}
.chat-compose-bar__button-preview-formatting {
  background-color: var(--app-surface-tint);
}
.chat-compose-bar__button-message-timer {
  background-color: var(--app-surface-tint);
}
.chat-compose-bar__button-voice-note {
  background-color: var(--app-text);

}
.chat-compose-bar__block-4 {
  background-color: var(--ui-zinc-950);
}
.chat-compose-bar__block-22 {
  background-color: var(--ui-zinc-950);
}
.chat-compose-bar__block-27 {
  background-color: var(--ui-zinc-950);
}
.chat-compose-bar__block-33 {
  background-color: var(--ui-zinc-950);
}
.chat-compose-bar__block-5 {
  background-color: var(--ui-zinc-950);
}
.chat-compose-bar__block-11 {
  background-color: var(--ui-zinc-950);
}
.chat-compose-bar__block-15 {
  background-color: var(--ui-zinc-950);
}
.chat-compose-bar__block-21 {
  background-color: var(--app-surface);

}
.chat-compose-bar__square {
  fill: currentColor;
}
.chat-compose-bar__button-cancel-upload {
  padding: calc(var(--spacing) * .5);
}
.chat-compose-bar__block-26 {
  padding: calc(var(--spacing) * .5);
}
.chat-compose-bar__block-20 {
  padding: var(--spacing);
}
.chat-compose-bar__block-33 {
  padding: var(--spacing);
}
.chat-compose-bar__block-4 {
  padding: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__block-21 {
  padding: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-22 {
  padding: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-27 {
  padding: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-11 {
  padding: calc(var(--spacing) * 2.5);
}
.chat-compose-bar__block {
  padding: calc(var(--spacing) * 3);
}
.chat-compose-bar__block-5 {
  padding: calc(var(--spacing) * 3);
}
.chat-compose-bar__block-15 {
  padding: calc(var(--spacing) * 3);
}
.chat-compose-bar__block-23 {
  padding-inline: var(--spacing);
}
.chat-compose-bar__text-rendering {
  padding-inline: var(--spacing);
}
.chat-compose-bar__text-12 {
  padding-inline: var(--spacing);
}
.chat-compose-bar__text-13 {
  padding-inline: var(--spacing);
}
.chat-compose-bar__block-28 {
  padding-inline: var(--spacing);
}
.chat-compose-bar__text-14 {
  padding-inline: var(--spacing);
}
.chat-compose-bar__block-31 {
  padding-inline: var(--spacing);
}
.chat-compose-bar__button-message-timer {
  padding-inline: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__block-mention-member {
  padding-inline: calc(var(--spacing) * 2);
}
.chat-compose-bar__button-3 {
  padding-inline: calc(var(--spacing) * 2);
}
.chat-compose-bar__button-5 {
  padding-inline: calc(var(--spacing) * 2);
}
.chat-compose-bar__field-type-a {
  padding-inline: 10px;

}
.chat-compose-bar__button-2 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.chat-compose-bar__button-send-images {
  padding-inline: calc(var(--spacing) * 2.5);
}
.chat-compose-bar__button-attach-files {
  padding-inline: calc(var(--spacing) * 2.5);
}
.chat-compose-bar__button-share-your {
  padding-inline: calc(var(--spacing) * 2.5);
}
.chat-compose-bar__block-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.chat-compose-bar__button-cancel {
  padding-inline: calc(var(--spacing) * 3);
}
.chat-compose-bar__button-cancel-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.chat-compose-bar__block-29 {
  padding-inline: calc(var(--spacing) * 3);
}
.chat-compose-bar__button-send-message {
  padding-inline: 12px;

}
.chat-compose-bar__button-send {
  padding-inline: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__button-send-2 {
  padding-inline: calc(var(--spacing) * 3.5);
}
.chat-compose-bar__block-mention-member {
  padding-block: var(--spacing);
}
.chat-compose-bar__button-5 {
  padding-block: var(--spacing);
}
.chat-compose-bar__field-type-a {
  padding-block: var(--spacing);
}
.chat-compose-bar__block-2 {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__button-2 {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__button-cancel {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__button-send {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__button-cancel-2 {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__button-send-2 {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__button-3 {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__button-send-images {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__button-attach-files {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__button-share-your {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-compose-bar__block-29 {
  padding-block: calc(var(--spacing) * 2);
}
.chat-compose-bar__block-31 {
  padding-top: var(--spacing);
}
.chat-compose-bar__block-25 {
  padding-top: calc(var(--spacing) * 2);
}
.chat-compose-bar__text-13 {
  padding-top: calc(var(--spacing) * 2);
}
.chat-compose-bar__text-17 {
  padding-left: var(--spacing);
}
.chat-compose-bar__button-2 {
  text-align: left;
}
.chat-compose-bar__button-send-images {
  text-align: left;
}
.chat-compose-bar__button-attach-files {
  text-align: left;
}
.chat-compose-bar__button-share-your {
  text-align: left;
}
.chat-compose-bar__text-replying-to {
  font-family: var(--font-mono);
}
.chat-compose-bar__block-mention-member {
  font-family: var(--font-mono);
}
.chat-compose-bar__text-6 {
  font-family: var(--font-mono);
}
.chat-compose-bar__text-8 {
  font-family: var(--font-mono);
}
.chat-compose-bar__text-10 {
  font-family: var(--font-mono);
}
.chat-compose-bar__text-11 {
  font-family: var(--font-mono);
}
.chat-compose-bar__text-format {
  font-family: var(--font-mono);
}
.chat-compose-bar__text-rendering {
  font-family: var(--font-mono);
}
.chat-compose-bar__text-13 {
  font-family: var(--font-mono);
}
.chat-compose-bar__text-message-timer {
  font-family: var(--font-mono);
}
.chat-compose-bar__text-preview {
  font-family: var(--font-mono);
}
.chat-compose-bar__button-message-timer {
  font-family: var(--font-mono);
}
.chat-compose-bar__text-17 {
  font-family: var(--font-mono);
}
.chat-compose-bar__button-send-message {
  font-family: var(--font-mono);
}
.chat-compose-bar__chat-message-body {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.chat-compose-bar__text-15 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.chat-compose-bar__field-type-a {
  font-size: var(--app-text-body);
  line-height: 1.55;


}
.chat-compose-bar__block-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-compose-bar__button-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-compose-bar__block-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-compose-bar__text-8 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-compose-bar__button-cancel {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-compose-bar__button-send {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-compose-bar__text-9 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-compose-bar__button-cancel-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-compose-bar__button-send-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-compose-bar__button-3 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-compose-bar__button-send-images {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-compose-bar__button-attach-files {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-compose-bar__button-share-your {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-compose-bar__button-send-message {
  font-size: 10px;
  line-height: var(--leading,var(--text-xs--line-height));

}
.chat-compose-bar__text-rendering {
  font-size: 9px;
}
.chat-compose-bar__text-preview {
  font-size: 9px;
}
.chat-compose-bar__text-replying-to {
  font-size: 10px;
}
.chat-compose-bar__block-mention-member {
  font-size: 10px;
}
.chat-compose-bar__text-6 {
  font-size: 10px;
}
.chat-compose-bar__text-format {
  font-size: 10px;
}
.chat-compose-bar__text-12 {
  font-size: 10px;
}
.chat-compose-bar__text-13 {
  font-size: 10px;
}
.chat-compose-bar__text-message-timer {
  font-size: 10px;
}
.chat-compose-bar__text-14 {
  font-size: 10px;
}
.chat-compose-bar__text-no-formatting {
  font-size: 10px;
}
.chat-compose-bar__text-sent-as {
  font-size: 10px;
}
.chat-compose-bar__button-message-timer {
  font-size: 10px;
}
.chat-compose-bar__text-10 {
  font-size: 11px;
}
.chat-compose-bar__text-11 {
  font-size: 11px;
}
.chat-compose-bar__button-5 {
  font-size: 11px;
}
.chat-compose-bar__text-17 {
  font-size: 11px;
}
.chat-compose-bar__text-12 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.chat-compose-bar__text-13 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.chat-compose-bar__text-14 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.chat-compose-bar__text-15 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.chat-compose-bar__field-type-a {
  --leading: var(--leading-relaxed);
  line-height: 1.55;

}
.chat-compose-bar__text-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-compose-bar__text-4 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-compose-bar__text-8 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-compose-bar__button-cancel {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-compose-bar__button-send {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-compose-bar__text-9 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-compose-bar__button-cancel-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-compose-bar__button-send-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-compose-bar__button-3 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-compose-bar__button-5 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-compose-bar__button-send-images {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-compose-bar__button-attach-files {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-compose-bar__button-share-your {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-compose-bar__button-send-message {
  --font-weight: var(--font-weight-semibold);
  font-weight: 500;

}
.chat-compose-bar__text-replying-to {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-compose-bar__block-mention-member {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-compose-bar__text-format {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-compose-bar__text-rendering {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-compose-bar__text-message-timer {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-compose-bar__text-preview {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-compose-bar__text-13 {
  overflow-wrap: break-word;
}
.chat-compose-bar__text-15 {
  overflow-wrap: break-word;
}
.chat-compose-bar__button-send-images {
  white-space: nowrap;
}
.chat-compose-bar__button-attach-files {
  white-space: nowrap;
}
.chat-compose-bar__button-share-your {
  white-space: nowrap;
}
.chat-compose-bar__text-15 {
  white-space: pre-wrap;
}
.chat-compose-bar__text-5 {
  color: var(--color-amber-400);
}
.chat-compose-bar__button-send-2 {
  color: var(--ui-black);
}
.chat-compose-bar__button-send-message {
  color: var(--app-bg);

}
.chat-compose-bar__button-message-timer--success {
  color: var(--color-emerald-300);
}
.chat-compose-bar__map-pin--success {
  color: var(--color-emerald-400);
}
.chat-compose-bar__text-8 {
  color: var(--color-red-400);
}
.chat-compose-bar__button--selected {
  color: var(--color-white);
}
.chat-compose-bar__button-send {
  color: var(--color-white);
}
.chat-compose-bar__button--selected-2 {
  color: var(--color-white);
}
.chat-compose-bar__button--selected-3 {
  color: var(--color-white);
}
.chat-compose-bar__button-attach-image--selected {
  color: var(--color-white);
}
.chat-compose-bar__button-format-message--selected {
  color: var(--color-white);
}
.chat-compose-bar__button-preview-formatting--selected {
  color: var(--color-white);
}
.chat-compose-bar__button-message-timer--selected {
  color: var(--color-white);
}
.chat-compose-bar__field-type-a {
  color: var(--app-text);

}
.chat-compose-bar__text-4 {
  color: var(--ui-zinc-200);
}
.chat-compose-bar__text-9 {
  color: var(--ui-zinc-200);
}
.chat-compose-bar__chat-message-body {
  color: var(--ui-zinc-200);
}
.chat-compose-bar__text {
  color: var(--ui-zinc-300);
}
.chat-compose-bar__button-cancel {
  color: var(--ui-zinc-300);
}
.chat-compose-bar__button-cancel-2 {
  color: var(--ui-zinc-300);
}
.chat-compose-bar__button-send-images {
  color: var(--ui-zinc-300);
}
.chat-compose-bar__button-attach-files {
  color: var(--ui-zinc-300);
}
.chat-compose-bar__button-share-your {
  color: var(--ui-zinc-300);
}
.chat-compose-bar__text-replying-to {
  color: var(--ui-zinc-400);
}
.chat-compose-bar__button--muted {
  color: var(--ui-zinc-400);
}
.chat-compose-bar__text-6 {
  color: var(--ui-zinc-400);
}
.chat-compose-bar__text-11 {
  color: var(--ui-zinc-400);
}
.chat-compose-bar__button--muted-2 {
  color: var(--ui-zinc-400);
}
.chat-compose-bar__button-4 {
  color: var(--ui-zinc-400);
}
.chat-compose-bar__button--muted-3 {
  color: var(--ui-zinc-400);
}
.chat-compose-bar__text-15 {
  color: var(--ui-zinc-400);
}
.chat-compose-bar__button-attach-image--muted {
  color: var(--ui-zinc-400);
}
.chat-compose-bar__button-format-message--muted {
  color: var(--ui-zinc-400);
}
.chat-compose-bar__button-preview-formatting--muted {
  color: var(--ui-zinc-400);
}
.chat-compose-bar__button-message-timer--muted {
  color: var(--ui-zinc-400);
}
.chat-compose-bar__button-voice-note {
  color: var(--app-bg);

}
.chat-compose-bar__button {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__block-mention-member {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__button-cancel-upload {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__map-pin--muted {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__text-10 {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__text-format {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__button-close-formatting {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__text-rendering {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__text-12 {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__text-13 {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__text-message-timer {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__button-close-message {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__text-14 {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__text-preview {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__text-no-formatting {
  color: var(--ui-zinc-600);
}
.chat-compose-bar__text-sent-as {
  color: var(--ui-zinc-600);
}
.chat-compose-bar__text-17 {
  color: var(--app-muted-2);
}
.chat-compose-bar__text-replying-to {
  text-transform: uppercase;
}
.chat-compose-bar__block-mention-member {
  text-transform: uppercase;
}
.chat-compose-bar__text-format {
  text-transform: uppercase;
}
.chat-compose-bar__text-rendering {
  text-transform: uppercase;
}
.chat-compose-bar__text-message-timer {
  text-transform: uppercase;
}
.chat-compose-bar__text-preview {
  text-transform: uppercase;
}
.chat-compose-bar__text-8 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.chat-compose-bar__button-message-timer {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.chat-compose-bar__field-type-a::placeholder {
  color: var(--ui-zinc-500);
}
.chat-compose-bar__enter-from-class {
  opacity: 0;
}
.chat-compose-bar__leave-from-class {
  opacity: 0;
}
.chat-compose-bar__enter-from-class-2 {
  opacity: 0;
}
.chat-compose-bar__leave-from-class-2 {
  opacity: 0;
}
.chat-compose-bar__enter-from-class-3 {
  opacity: 0;
}
.chat-compose-bar__leave-from-class-3 {
  opacity: 0;
}
.chat-compose-bar__block-4 {
  --shadow: 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
}
.chat-compose-bar__block-22 {
  --shadow: 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
}
.chat-compose-bar__block-27 {
  --shadow: 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
}
.chat-compose-bar__block-33 {
  --shadow: 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 20px 25px -5px var(--shadow-color,#0000001a), 0 8px 10px -6px var(--shadow-color,#0000001a);
}
.chat-compose-bar__button-send {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.chat-compose-bar__button-send-2 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.chat-compose-bar__block-21 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.chat-compose-bar__button-send-message {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.chat-compose-bar__block-33 {
  --backdrop-blur: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
  backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
}
.chat-compose-bar__block-10 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__text-7 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__block-21 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__enter-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__leave-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__enter-active-class-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__leave-active-class-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__enter-active-class-3 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__leave-active-class-3 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-cancel-upload {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-cancel {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-send {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-cancel-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-send-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-4 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-5 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-attach-image {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-send-images {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-attach-files {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-share-your {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-format-message {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-preview-formatting {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-message-timer {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-voice-note {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__button-send-message {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-compose-bar__text-7 {
  --duration: 75ms;
  transition-duration: 75ms;
}
.chat-compose-bar__leave-active-class {
  --duration: .1s;
  transition-duration: .1s;
}
.chat-compose-bar__leave-active-class-2 {
  --duration: .1s;
  transition-duration: .1s;
}
.chat-compose-bar__leave-active-class-3 {
  --duration: .1s;
  transition-duration: .1s;
}
.chat-compose-bar__block-21 {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-compose-bar__enter-active-class {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-compose-bar__enter-active-class-2 {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-compose-bar__enter-active-class-3 {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-compose-bar__block-10 {
  --duration: .3s;
  transition-duration: .3s;
}
.chat-compose-bar__leave-active-class {
  --ease: var(--ease-in);
  transition-timing-function: var(--ease-in);
}
.chat-compose-bar__leave-active-class-2 {
  --ease: var(--ease-in);
  transition-timing-function: var(--ease-in);
}
.chat-compose-bar__leave-active-class-3 {
  --ease: var(--ease-in);
  transition-timing-function: var(--ease-in);
}
.chat-compose-bar__text-7 {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.chat-compose-bar__enter-active-class {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.chat-compose-bar__enter-active-class-2 {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.chat-compose-bar__enter-active-class-3 {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.chat-compose-bar__text-17 {
  -webkit-user-select: none;
  user-select: none;
}
.chat-compose-bar__block-21:focus-within {
  border-color: var(--app-border-strong);
}
.chat-compose-bar__block-21:focus-within {
  box-shadow: var(--app-focus-ring);
}
.chat-compose-bar__block-21:focus-within {
  --ring-color: color-mix(in srgb, var(--app-primary) 70%, transparent);
}
.chat-compose-bar__field-type-a:focus {
  --outline-style: none;
  outline-style: none;
}
.chat-compose-bar__button-send-message:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
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
[data-theme="light"] .chat-compose-bar__text-5 {
  color: var(--app-warning);
}
[data-theme="light"] .chat-compose-bar__button-message-timer--success {
  color: var(--app-success);
}
[data-theme="light"] .chat-compose-bar__map-pin--success {
  color: var(--app-success);
}
[data-theme="light"] .chat-compose-bar__text-8 {
  color: var(--app-danger);
}
[data-theme="light"] .chat-compose-bar__text {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-compose-bar__button-cancel {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-compose-bar__button-cancel-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-compose-bar__button-send-images {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-compose-bar__button-attach-files {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-compose-bar__button-share-your {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-compose-bar__text-replying-to {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__button--muted {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__text-6 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__text-11 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__button--muted-2 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__button-4 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__button--muted-3 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__text-15 {
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
[data-theme="light"] .chat-compose-bar__button-voice-note {
  color: var(--app-bg);
}
[data-theme="light"] .chat-compose-bar__button {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__block-mention-member {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__button-cancel-upload {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__map-pin--muted {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__text-10 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__text-format {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__button-close-formatting {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__text-rendering {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__text-12 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__text-13 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__text-message-timer {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__button-close-message {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__text-14 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__text-preview {
  color: var(--app-muted);
}
[data-theme="light"] .chat-compose-bar__text-no-formatting {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-compose-bar__text-sent-as {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-compose-bar__text-17 {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-compose-bar__button:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .chat-compose-bar__button--muted:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .chat-compose-bar__button-cancel-upload:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .chat-compose-bar__button--muted-2:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .chat-compose-bar__button-close-formatting:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .chat-compose-bar__button--muted-3:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .chat-compose-bar__button-close-message:hover {
  color: var(--app-text) !important;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.chat-compose-bar__button-message-timer--success {
  border-color: color-mix(in oklab,var(--color-emerald-500) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-compose-bar__block-11 {
  border-color: color-mix(in oklab,var(--color-red-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-compose-bar__button-message-timer--success {
  background-color: color-mix(in oklab,var(--color-emerald-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-compose-bar__block-20 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 50%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-compose-bar__block-5 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-compose-bar__block-11 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-compose-bar__block-15 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-compose-bar__block-21 {
  background-color: var(--app-surface);

}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-compose-bar__block-21:focus-within {
  --ring-color: color-mix(in srgb, var(--app-primary) 45%, transparent);
}
}
}

/* Ledger pass: square tool buttons, ink send, no glass. */

.chat-compose-bar__block-21,
.chat-compose-bar__button-send-message {
  box-shadow: none;
}

.chat-compose-bar__button-attach-image:focus-visible,
.chat-compose-bar__button-format-message:focus-visible,
.chat-compose-bar__button-preview-formatting:focus-visible,
.chat-compose-bar__button-message-timer:focus-visible,
.chat-compose-bar__button-voice-note:focus-visible,
.chat-compose-bar__button-send-message:focus-visible,
.chat-compose-bar__button-cancel-upload:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 2px;
}

.chat-compose-bar__button-send-message,
.chat-compose-bar__button-voice-note {
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
}

.chat-compose-bar__text-17 {
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

@media (hover: hover) {
  .chat-compose-bar__button-send-message:hover,
  .chat-compose-bar__button-voice-note:hover {
    background-color: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .chat-compose-bar__button-attach-image:hover,
  .chat-compose-bar__button-format-message:hover,
  .chat-compose-bar__button-preview-formatting:hover,
  .chat-compose-bar__button-message-timer:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .chat-compose-bar__button-attach-image,
  .chat-compose-bar__button-format-message,
  .chat-compose-bar__button-preview-formatting,
  .chat-compose-bar__button-message-timer,
  .chat-compose-bar__button-voice-note,
  .chat-compose-bar__button-send-message {
    min-height: var(--app-touch-h);
  }

  .chat-compose-bar__button-attach-image,
  .chat-compose-bar__button-format-message,
  .chat-compose-bar__button-preview-formatting,
  .chat-compose-bar__button-voice-note {
    min-width: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-compose-bar__block-21 {
    transition: none;
  }
}
</style>
