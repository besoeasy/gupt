<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { Check, ImagePlus, Mic, Paperclip, Send, X } from "lucide-vue-next";
import { formatDuration } from "@/lib/chatUtils";

const props = defineProps({
  modelValue: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  disableMic: { type: Boolean, default: false },
  isRecording: { type: Boolean, default: false },
  recordingSeconds: { type: Number, default: 0 },
  uploadStatus: { type: Object, default: null },
  // Array of { pubkey, name, picture } — all members; spaces in names are stripped to form the handle
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
]);

const fileInput = ref(null);
const imageInput = ref(null);
const textareaEl = ref(null);
const mentionQuery = ref(null); // null = not in mention mode; string = current query
const showImageConfirm = ref(false);
const pendingImageUrl = ref(null);
const pendingImageFile = ref(null);

// Strip spaces → @-handle (e.g. "Luca The Reaper" → "LucaTheReaper")
function mentionHandle(name) {
  return name.replace(/\s+/g, "");
}

// Only show users whose handle starts with the current query (case-insensitive)
const filteredMentions = computed(() => {
  if (mentionQuery.value === null || !props.mentionableUsers.length) return [];
  const q = mentionQuery.value.toLowerCase();
  return props.mentionableUsers.filter((u) => mentionHandle(u.name).toLowerCase().startsWith(q));
});

// Deterministic unique color per pubkey — purely aesthetic, no security role
function avatarColor(pubkey) {
  const h = [...String(pubkey || "0")].reduce(
    (acc, c) => ((acc * 31 + c.charCodeAt(0)) & 0xffffff) >>> 0,
    0,
  );
  return `hsl(${h % 360}, 60%, 42%)`;
}

function onInput(e) {
  emit("update:modelValue", e.target.value);
  const pos = e.target.selectionStart ?? e.target.value.length;
  const before = e.target.value.slice(0, pos);
  const match = before.match(/@(\S*)$/);
  mentionQuery.value = match ? match[1] : null;
}

function insertMention(user) {
  const text = props.modelValue;
  const el = textareaEl.value;
  const pos = el?.selectionStart ?? text.length;
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const match = before.match(/@(\S*)$/);
  if (!match) {
    mentionQuery.value = null;
    return;
  }
  const newBefore = before.slice(0, match.index) + `@${mentionHandle(user.name)} `;
  emit("update:modelValue", newBefore + after);
  mentionQuery.value = null;
  nextTick(() => {
    el?.focus();
    el?.setSelectionRange(newBefore.length, newBefore.length);
  });
}

// Clear mention picker when parent resets the input (e.g. after send)
watch(
  () => props.modelValue,
  (val) => {
    if (!val) mentionQuery.value = null;
  },
);

function pickFile() {
  if (!props.disabled) fileInput.value?.click();
}

function pickImage() {
  if (!props.disabled) imageInput.value?.click();
}

function onFileChange(e) {
  const file = e.target.files?.[0];
  if (file) emit("file-selected", file);
  e.target.value = "";
}

async function onImageChange(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close();

  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const clean = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
      emit("file-selected", clean);
    },
    "image/jpeg",
    0.92,
  );
}

async function processImageFileAndEmit(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return resolve(null);
        const clean = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
        emit("file-selected", clean);
        resolve(clean);
      },
      "image/jpeg",
      0.92,
    );
  });
}

function onPaste(e) {
  try {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;
        pendingImageFile.value = file;
        pendingImageUrl.value = URL.createObjectURL(file);
        showImageConfirm.value = true;
        e.preventDefault();
        break;
      }
    }
  } catch (err) {
    console.error("paste handling error", err);
  }
}

async function confirmPaste() {
  if (!pendingImageFile.value) return;
  await processImageFileAndEmit(pendingImageFile.value);
  cleanupPasteState();
}

function cancelPaste() {
  cleanupPasteState();
}

function cleanupPasteState() {
  if (pendingImageUrl.value) URL.revokeObjectURL(pendingImageUrl.value);
  pendingImageUrl.value = null;
  pendingImageFile.value = null;
  showImageConfirm.value = false;
}

// Expose actions so parent routes can forward global paste events to this component
defineExpose({ onPaste, confirmPaste, cancelPaste });

function onKeydown(e) {
  if (e.key === "Escape" && mentionQuery.value !== null) {
    mentionQuery.value = null;
    return;
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    emit("send");
  }
}
</script>

<template>
  <div class="border-t border-white/7 bg-black/95 backdrop-blur-sm px-3 pt-2.5 pb-3 shrink-0 relative">
    <!-- Reply Banner -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="replyingTo"
        class="mb-2.5 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 py-2 pl-3 pr-2"
      >
        <div class="flex-1 min-w-0 pr-2 border-l-2 border-[#0095f6] pl-2.5">
          <p class="text-[10px] font-semibold text-[#0095f6] mb-0.5">Replying to message</p>
          <p class="truncate text-xs text-zinc-300">
            {{ replyingTo.text || replyingTo.media?.name || "Voice Note" }}
          </p>
        </div>
        <button
          @click="emit('cancel-reply')"
          class="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
          title="Cancel reply"
        >
          <X class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </Transition>

    <Transition
      enter-active-class="transition-all duration-250 ease-out"
      enter-from-class="opacity-0 -translate-y-1 scale-[0.98]"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition-all duration-180 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 -translate-y-1 scale-[0.98]"
    >
      <div
        v-if="uploadStatus"
        class="mb-2.5 overflow-hidden rounded-2xl border px-3.5 py-2.5"
        :class="
          uploadStatus.phase === 'done'
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
            : 'border-sky-500/20 bg-sky-500/10 text-sky-100'
        "
      >
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
              {{ uploadStatus.phase }}
            </p>
            <p class="mt-1 truncate text-sm">
              <span v-if="uploadStatus.phase === 'encrypting'">Encrypting attachment…</span>
              <span v-else-if="uploadStatus.phase === 'uploading'">
                Uploading via {{ uploadStatus.server }}
              </span>
              <span v-else>Upload done via {{ uploadStatus.server }}</span>
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <span
              v-if="uploadStatus.phase !== 'done'"
              class="flex h-4 items-end gap-[3px]"
              aria-hidden="true"
            >
              <span
                class="w-[3px] rounded-full bg-current animate-[pulse_0.9s_ease-in-out_infinite]"
                style="height: 45%"
              />
              <span
                class="w-[3px] rounded-full bg-current animate-[pulse_0.9s_0.12s_ease-in-out_infinite]"
                style="height: 100%"
              />
              <span
                class="w-[3px] rounded-full bg-current animate-[pulse_0.9s_0.24s_ease-in-out_infinite]"
                style="height: 65%"
              />
            </span>
            <span
              v-else
              class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-200"
            >
              <Check class="h-3.5 w-3.5" :stroke-width="2.4" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Recording indicator -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1 scale-[0.98]"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 -translate-y-1 scale-[0.98]"
    >
      <div
        v-if="isRecording"
        class="flex items-center justify-between gap-3 rounded-2xl bg-red-950/50 border border-red-900/40 px-3.5 py-2.5 mb-2.5"
      >
        <!-- Waveform animation + timer -->
        <div class="flex items-center gap-3 text-red-300">
          <span class="flex items-end gap-[3px] h-4">
            <span
              class="w-[3px] rounded-full bg-red-400 animate-[bounce_0.8s_ease-in-out_infinite]"
              style="height: 60%"
            />
            <span
              class="w-[3px] rounded-full bg-red-400 animate-[bounce_0.8s_0.15s_ease-in-out_infinite]"
              style="height: 100%"
            />
            <span
              class="w-[3px] rounded-full bg-red-400 animate-[bounce_0.8s_0.3s_ease-in-out_infinite]"
              style="height: 70%"
            />
            <span
              class="w-[3px] rounded-full bg-red-400 animate-[bounce_0.8s_0.1s_ease-in-out_infinite]"
              style="height: 90%"
            />
            <span
              class="w-[3px] rounded-full bg-red-400 animate-[bounce_0.8s_0.25s_ease-in-out_infinite]"
              style="height: 50%"
            />
          </span>
          <span class="text-sm font-mono tabular-nums">{{ formatDuration(recordingSeconds) }}</span>
        </div>
        <!-- Done / Cancel -->
        <div class="flex gap-2">
          <button
            @click="emit('toggle-recording')"
            class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-[#0095f6] hover:bg-[#1aa1f7] text-white font-semibold transition-all duration-150 hover:shadow-[0_0_14px_rgba(0,149,246,0.4)] active:scale-95"
          >
            <Check class="w-3.5 h-3.5" :stroke-width="2.2" aria-hidden="true" />
            Done
          </button>
          <button
            @click="emit('cancel-recording')"
            class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all duration-150 active:scale-95"
          >
            <X class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />
            Cancel
          </button>
        </div>
      </div>
    </Transition>

    <!-- Mention picker -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="filteredMentions.length > 0"
        class="flex gap-2 overflow-x-auto mb-2"
        style="scrollbar-width: none; -ms-overflow-style: none"
      >
        <button
          v-for="u in filteredMentions"
          :key="u.pubkey"
          @mousedown.prevent
          @click="insertMention(u)"
          class="inline-flex items-center gap-1.5 shrink-0 pl-1 pr-3 py-1 rounded-full border border-white/10 text-xs font-semibold text-zinc-200 hover:border-white/25 transition-all duration-100 active:scale-95"
          :style="{ background: `color-mix(in srgb, ${avatarColor(u.pubkey)} 18%, #18181b)` }"
        >
          <span
            class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
            :style="{ background: avatarColor(u.pubkey) }"
            >{{ u.name[0].toUpperCase() }}</span
          >
          {{ u.name }}
        </button>
      </div>
    </Transition>

    <!-- Hidden file inputs -->
    <input ref="fileInput" type="file" class="hidden" @change="onFileChange" />
    <input ref="imageInput" type="file" accept="image/*" class="hidden" @change="onImageChange" />

    <!-- Input row -->
    <div class="flex items-end gap-2">
      <!-- Attach file -->
      <button
        @click="pickFile"
        :disabled="disabled || isRecording"
        class="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl bg-zinc-900 border border-white/7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 hover:border-white/15 disabled:opacity-40 transition-all duration-150 active:scale-90"
        title="Attach encrypted file"
      >
        <Paperclip class="w-4 h-4" :stroke-width="2" aria-hidden="true" />
      </button>

      <!-- Image picker -->
      <button
        @click="pickImage"
        :disabled="disabled || isRecording"
        class="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl bg-zinc-900 border border-white/7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 hover:border-white/15 disabled:opacity-40 transition-all duration-150 active:scale-90"
        title="Send image (EXIF data removed)"
      >
        <ImagePlus class="w-4 h-4" :stroke-width="1.8" aria-hidden="true" />
      </button>

      <!-- Text input -->
      <div
        class="flex-1 bg-zinc-900 border border-white/7 rounded-2xl px-3.5 py-2 transition-all duration-200 focus-within:border-white/20 focus-within:bg-zinc-800/60"
      >
        <textarea
          ref="textareaEl"
          :value="modelValue"
          @input="onInput"
          rows="1"
          placeholder="Message…"
          class="w-full bg-transparent resize-none max-h-36 text-sm placeholder-zinc-600 outline-none ring-0 leading-snug block"
          @keydown="onKeydown"
          @paste="onPaste"
        />
      </div>

      <!-- Mic -->
      <button
        @click="emit('toggle-recording')"
        :disabled="disabled || disableMic"
        class="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl bg-zinc-900 border disabled:opacity-40 transition-all duration-150 active:scale-90"
        :class="
          isRecording
            ? 'text-red-400 border-red-900/60 bg-red-950/40 hover:bg-red-950/60 animate-pulse'
            : 'border-white/7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 hover:border-white/15'
        "
        :title="isRecording ? 'Stop and send voice note' : 'Record voice note'"
      >
        <Mic class="w-4 h-4" :stroke-width="1.8" aria-hidden="true" />
      </button>

      <!-- Send -->
      <button
        @click="emit('send')"
        :disabled="disabled || isRecording || !modelValue.trim()"
        class="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl bg-[#0095f6] hover:bg-[#1aa1f7] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 hover:shadow-[0_0_16px_rgba(0,149,246,0.45)] active:scale-90"
        title="Send"
      >
        <Send
          class="w-4 h-4 text-white transition-transform duration-150 group-hover:translate-x-0.5"
          :stroke-width="2.2"
          aria-hidden="true"
        />
      </button>
    </div>
    <!-- Pasted image confirmation modal (teleported to body for proper centering) -->
    <Teleport to="body">
      <div v-if="showImageConfirm" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/60" @click="cancelPaste" />
        <div class="relative z-10 w-full max-w-md rounded-xl bg-zinc-900 p-4 border border-white/8">
          <p class="text-sm font-semibold mb-2">Send pasted image?</p>
          <img :src="pendingImageUrl" alt="Pasted preview" class="w-full h-auto rounded mb-3" />
          <div class="flex justify-end gap-2">
            <button
              @click="cancelPaste"
              class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            >
              <X class="w-4 h-4" :stroke-width="2" />
              Cancel
            </button>
            <button
              @click="confirmPaste"
              class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0095f6] text-white hover:bg-[#1aa1f7]"
            >
              <Check class="w-4 h-4" :stroke-width="2" />
              Send
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
