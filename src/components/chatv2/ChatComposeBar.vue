<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { Mic, Paperclip, ImagePlus, Plus, SendHorizontal, Square, X } from "@lucide/vue";
import { formatDuration } from "@/lib/chatUtils";
import RoboAvatar from "@/components/RoboAvatar.vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  isRecording: { type: Boolean, default: false },
  recordingSeconds: { type: Number, default: 0 },
  audioLevels: { type: Array, default: () => [] },
  uploadStatus: { type: Object, default: null },
  mentionableUsers: { type: Array, default: () => [] },
  replyingTo: { type: Object, default: null },
});

const emit = defineEmits([
  "update:modelValue",
  "send",
  "file-selected",
  "toggle-recording",
  "cancel-recording",
  "cancel-reply",
  "cancel-upload",
]);

const fileInputRef = ref(null);
const imageInputRef = ref(null);
const textareaRef = ref(null);

const text = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

function handleKeydown(e) {
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

  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

function handleSend() {
  if (!text.value.trim() || props.disabled) return;
  emit("send");
  showMentions.value = false;
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

watch(
  () => props.isRecording,
  (rec) => {
    if (rec) closeAttachMenu();
  },
);

onUnmounted(closeAttachMenu);

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
  <div class="relative flex flex-col p-3 sm:px-4 shrink-0">
    <!-- Replying Banner -->
    <div
      v-if="replyingTo"
      class="mb-2 flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs"
    >
      <div class="min-w-0 flex-1">
        <p class="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          Replying to message
        </p>
        <p class="truncate text-zinc-300">
          {{ replyingTo.text || replyingTo.replyExcerpt || "Attachment" }}
        </p>
      </div>
      <button
        type="button"
        @click="emit('cancel-reply')"
        class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
      >
        <X class="h-3 w-3" :stroke-width="1.8" />
      </button>
    </div>

    <!-- Mentions Dropdown -->
    <div
      v-if="showMentions && filteredMentions.length"
      class="absolute bottom-full left-4 mb-2 z-30 w-64 rounded-xl border border-zinc-800 bg-zinc-950 p-1.5 shadow-xl"
    >
      <div class="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
        Mention Member
      </div>
      <button
        v-for="(user, idx) in filteredMentions"
        :key="user.pubkey"
        type="button"
        @click="insertMention(user)"
        class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer"
        :class="
          idx === selectedMentionIdx
            ? 'bg-zinc-800 text-white'
            : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
        "
      >
        <RoboAvatar :src="user.picture" :pubkey="user.pubkey" size="xs" />
        <span class="truncate font-medium">{{ user.name }}</span>
      </button>
    </div>

    <!-- Upload Status Banner -->
    <div
      v-if="uploadStatus"
      class="mb-2.5 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 flex flex-col gap-2"
    >
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :class="
              uploadStatus.phase === 'done'
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-white animate-ping'
            "
          />
          <span class="font-medium text-zinc-200 truncate">
            <span v-if="uploadStatus.phase === 'encrypting'">
              Encrypting attachment<span v-if="uploadStatus.batchTotal > 1">
                {{ uploadStatus.batchIndex }} of {{ uploadStatus.batchTotal }}</span
              >…
            </span>
            <span v-else-if="uploadStatus.phase === 'uploading'">
              <span v-if="uploadStatus.retryCount" class="text-amber-400">
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
        <div class="flex items-center gap-2 shrink-0">
          <span
            v-if="uploadStatus.phase === 'uploading'"
            class="text-[10px] text-zinc-400 font-mono"
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
            class="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 rounded cursor-pointer"
            title="Cancel upload"
            @click="emit('cancel-upload')"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <!-- Flat Progress Bar -->
      <div class="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-300"
          :class="uploadStatus.phase === 'done' ? 'bg-emerald-500' : 'bg-white'"
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
      class="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-zinc-950/80 p-2.5"
    >
      <div class="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
        <!-- Live Real-Time Equalizer Waveform -->
        <div class="flex items-center gap-0.5 sm:gap-1 h-6 shrink-0">
          <span
            v-for="(lvl, i) in audioLevels.length ? audioLevels : new Array(24).fill(0.15)"
            :key="i"
            class="w-0.75 sm:w-1 rounded-full bg-red-500 transition-all duration-75 ease-out"
            :style="{ height: `${Math.max(4, Math.round(lvl * 24))}px` }"
          />
        </div>

        <span class="text-xs font-mono font-medium text-red-400 tabular-nums shrink-0">
          {{ formatDuration(recordingSeconds) }}
        </span>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          @click="emit('cancel-recording')"
          class="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:text-white transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          @click="emit('toggle-recording')"
          class="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-red-600 transition-colors cursor-pointer"
        >
          <Square class="h-3 w-3 fill-current" />
          Send
        </button>
      </div>
    </div>

    <!-- Normal Input Card Container (Geist command-style input) -->
    <div
      v-else
      class="relative flex flex-col rounded-xl border border-zinc-800 bg-zinc-950/80 p-2 shadow-xs transition-all duration-150 focus-within:border-zinc-600 focus-within:ring-1 focus-within:ring-zinc-600/40"
    >
      <!-- Textarea input -->
      <textarea
        ref="textareaRef"
        v-model="text"
        :disabled="disabled"
        rows="1"
        placeholder="Type a message..."
        class="box-border w-full min-h-[38px] max-h-36 resize-none bg-transparent px-2 py-1 text-sm leading-relaxed text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-50"
        @keydown="handleKeydown"
        @paste="onPaste"
      />

      <!-- Action Footer Row -->
      <div class="flex items-center justify-between gap-2 pt-1 px-1">
        <!-- Left: Attachments (Plus toggle) -->
        <div class="relative flex items-center gap-1">
          <button
            type="button"
            @click="toggleAttachMenu"
            :disabled="disabled"
            :class="
              showAttachMenu
                ? 'border-zinc-700 bg-zinc-800 text-white'
                : 'text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-white'
            "
            class="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800/80 bg-zinc-900/60 transition-colors cursor-pointer disabled:opacity-40"
            title="Attach image or file"
            aria-label="Attach image or file"
            :aria-expanded="showAttachMenu"
          >
            <Plus class="h-3.5 w-3.5" :stroke-width="1.8" />
          </button>

          <Transition
            enter-active-class="transition-all duration-150 ease-out"
            enter-from-class="opacity-0 -translate-y-1"
            leave-active-class="transition-all duration-100 ease-in"
            leave-from-class="opacity-0 -translate-y-1"
          >
            <div
              v-if="showAttachMenu"
              class="absolute bottom-full left-0 mb-2 z-30 flex flex-col gap-0.5 rounded-lg border border-zinc-800 bg-zinc-950 p-1 shadow-xl backdrop-blur-md"
            >
              <button
                type="button"
                @click="triggerImageInput"
                class="inline-flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                title="Send images"
              >
                <ImagePlus class="h-3.5 w-3.5" :stroke-width="1.8" />
                Image
              </button>
              <button
                type="button"
                @click="triggerFileInput"
                class="inline-flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                title="Attach files"
              >
                <Paperclip class="h-3.5 w-3.5" :stroke-width="1.8" />
                File
              </button>
            </div>
          </Transition>

          <span class="text-[11px] font-mono text-zinc-600 select-none pl-1 hidden sm:inline-block">
            ↵ Enter to send
          </span>
        </div>

        <input
          ref="imageInputRef"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          @change="onImageChange"
        />
        <input ref="fileInputRef" type="file" multiple class="hidden" @change="onFileChange" />

        <!-- Right: Voice note or Send button -->
        <div class="flex items-center gap-1.5">
          <button
            v-if="!text.trim()"
            type="button"
            @click="emit('toggle-recording')"
            :disabled="disabled"
            class="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-40 cursor-pointer"
            title="Voice Note"
          >
            <Mic class="h-3.5 w-3.5" :stroke-width="1.8" />
          </button>

          <button
            v-else
            type="button"
            @click="handleSend"
            :disabled="disabled"
            class="inline-flex h-7 items-center justify-center gap-1.5 rounded-lg bg-white px-3 font-mono text-xs font-semibold text-black transition-colors hover:bg-zinc-200 active:scale-95 disabled:opacity-40 cursor-pointer shadow-xs"
            title="Send Message"
          >
            <span>Send</span>
            <SendHorizontal class="h-3 w-3" :stroke-width="2.2" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
