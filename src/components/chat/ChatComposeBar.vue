<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { Check, ImagePlus, Mic, Paperclip, Plus, Send, X } from "@lucide/vue";
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
  editingMessage: { type: Object, default: null },
});

const emit = defineEmits([
  "update:modelValue",
  "send",
  "file-selected",
  "toggle-recording",
  "cancel-recording",
  "cancel-reply",
  "cancel-edit",
]);

const fileInput = ref(null);
const imageInput = ref(null);
const showAttachments = ref(false);
let attachTimer = null;

function toggleAttachments() {
  if (props.disabled || props.isRecording) return;
  clearTimeout(attachTimer);
  showAttachments.value = !showAttachments.value;
  if (showAttachments.value) {
    attachTimer = setTimeout(() => {
      showAttachments.value = false;
    }, 60_000);
  }
}

onUnmounted(() => clearTimeout(attachTimer));
const textareaEl = ref(null);
const mentionQuery = ref(null);
const showImageConfirm = ref(false);
const pendingImageUrl = ref(null);
const pendingImageFile = ref(null);

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

function autoResize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 144) + "px";
}

function onInput(e) {
  emit("update:modelValue", e.target.value);
  autoResize(e.target);
  const pos = e.target.selectionStart ?? e.target.value.length;
  const before = e.target.value.slice(0, pos);
  const match = before.match(/@(\S*)$/);
  mentionQuery.value = match ? match[1] : null;
}

watch(
  () => props.modelValue,
  (val) => {
    if (!val) {
      nextTick(() => {
        if (textareaEl.value) textareaEl.value.style.height = "auto";
      });
    }
  },
);

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

  // Animated formats must be sent as-is — drawing to a canvas flattens
  // the animation to a single static frame and destroys it.
  const ANIMATED_TYPES = new Set(["image/gif", "image/webp", "image/avif"]);
  if (ANIMATED_TYPES.has(file.type)) {
    emit("file-selected", file);
    return;
  }

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
  const ANIMATED_TYPES = new Set(["image/gif", "image/webp", "image/avif"]);
  if (ANIMATED_TYPES.has(file.type)) {
    emit("file-selected", file);
    return file;
  }

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

function onBeforeInput(e) {
  const RICH_INPUT_TYPES = new Set([
    "insertFromPaste",
    "insertContent",
    "insertFromPasteAsQuotation",
  ]);
  if (!RICH_INPUT_TYPES.has(e.inputType)) return;

  const files = e.dataTransfer?.files;
  if (!files?.length) return;

  for (const file of files) {
    if (file.type.startsWith("image/")) {
      e.preventDefault();
      pendingImageFile.value = file;
      pendingImageUrl.value = URL.createObjectURL(file);
      showImageConfirm.value = true;
      return;
    }
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

defineExpose({ onPaste, onBeforeInput, confirmPaste, cancelPaste });

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
  <div
    class="shrink-0 relative px-3 pt-3 pb-3 sm:px-4 sm:pb-4 border-t border-(--app-border) bg-[color-mix(in_srgb,var(--app-bg)_82%,transparent)] backdrop-blur-[22px] overflow-x-hidden"
  >
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
        class="border border-(--app-border) bg-(--app-surface-soft) mb-2.5 flex items-center justify-between gap-3 rounded-2xl py-2.5 pl-3 pr-2"
      >
        <div class="flex-1 min-w-0 pr-2 border-l-2 border-(--app-primary) pl-2.5">
          <p class="text-[10px] font-semibold text-(--app-primary) mb-0.5">Replying to message</p>
          <p class="truncate text-xs text-zinc-300">
            {{ replyingTo.text || replyingTo.media?.name || "Voice Note" }}
          </p>
        </div>
        <button
          @click="emit('cancel-reply')"
          class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          title="Cancel reply"
        >
          <X class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </Transition>

    <!-- Edit Banner -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="editingMessage"
        class="mb-2.5 flex items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 py-2.5 pl-3 pr-2"
      >
        <div class="flex-1 min-w-0 pr-2 border-l-2 border-amber-400 pl-2.5">
          <p class="text-[10px] font-semibold text-amber-400 mb-0.5">Editing message</p>
          <p class="truncate text-xs text-zinc-300">
            {{ editingMessage.text }}
          </p>
        </div>
        <button
          @click="emit('cancel-edit')"
          class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
          title="Cancel edit"
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
            ? 'border-emerald-500/25 bg-emerald-500/10 text-[#6ee7b7]'
            : 'border-[color-mix(in_srgb,var(--app-primary)_20%,transparent)] bg-[color-mix(in_srgb,var(--app-primary)_10%,transparent)] text-[color-mix(in_srgb,var(--app-primary)_72%,white)]'
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
              class="flex h-4 items-end gap-0.75"
              aria-hidden="true"
            >
              <span
                class="w-0.75 rounded-full bg-current animate-[pulse_0.9s_ease-in-out_infinite]"
                style="height: 45%"
              />
              <span
                class="w-0.75 rounded-full bg-current animate-[pulse_0.9s_0.12s_ease-in-out_infinite]"
                style="height: 100%"
              />
              <span
                class="w-0.75 rounded-full bg-current animate-[pulse_0.9s_0.24s_ease-in-out_infinite]"
                style="height: 65%"
              />
            </span>
            <span
              v-else
              class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/20"
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
          <span class="flex items-end gap-0.75 h-4">
            <span
              class="w-0.75 rounded-full bg-red-400 animate-[bounce_0.8s_ease-in-out_infinite]"
              style="height: 60%"
            />
            <span
              class="w-0.75 rounded-full bg-red-400 animate-[bounce_0.8s_0.15s_ease-in-out_infinite]"
              style="height: 100%"
            />
            <span
              class="w-0.75 rounded-full bg-red-400 animate-[bounce_0.8s_0.3s_ease-in-out_infinite]"
              style="height: 70%"
            />
            <span
              class="w-0.75 rounded-full bg-red-400 animate-[bounce_0.8s_0.1s_ease-in-out_infinite]"
              style="height: 90%"
            />
            <span
              class="w-0.75 rounded-full bg-red-400 animate-[bounce_0.8s_0.25s_ease-in-out_infinite]"
              style="height: 50%"
            />
          </span>
          <span class="text-sm font-mono tabular-nums">{{ formatDuration(recordingSeconds) }}</span>
        </div>
        <!-- Done / Cancel -->
        <div class="flex gap-2">
          <button
            @click="emit('toggle-recording')"
            class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-(--app-primary) hover:bg-(--app-primary-strong) text-[#ffffff] font-semibold transition-all duration-150 active:scale-95"
          >
            <Check class="w-3.5 h-3.5" :stroke-width="2.2" aria-hidden="true" />
            Done
          </button>
          <button
            @click="emit('cancel-recording')"
            class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-white/8 hover:bg-white/16 text-zinc-300 transition-all duration-150 active:scale-95"
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
      <div v-if="filteredMentions.length > 0" class="flex gap-2 overflow-x-auto mb-2">
        <button
          v-for="u in filteredMentions"
          :key="u.pubkey"
          @mousedown.prevent
          @click="insertMention(u)"
          class="border border-(--app-border) bg-(--app-surface-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) inline-flex items-center gap-1.5 shrink-0 pl-1 pr-3 py-1 rounded-full text-xs font-semibold text-zinc-300 transition-all duration-100 active:scale-95"
          :style="{ background: `color-mix(in srgb, ${avatarColor(u.pubkey)} 18%, transparent)` }"
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
    <div class="mx-auto flex max-w-4xl items-end gap-2 sm:gap-2.5">
      <!-- Attachment toggle -->
      <button
        @click="toggleAttachments"
        :disabled="disabled || isRecording"
        class="inline-flex shrink-0 h-11 w-11 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) disabled:opacity-40 active:scale-90 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
        :title="showAttachments ? 'Hide options' : 'More options'"
      >
        <Plus
          class="w-4 h-4 transition-transform duration-200"
          :class="showAttachments ? 'rotate-45' : 'rotate-0'"
          :stroke-width="2"
          aria-hidden="true"
        />
      </button>

      <!-- Expandable attachment buttons -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 -translate-x-2"
        enter-to-class="opacity-100 translate-x-0"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100 translate-x-0"
        leave-to-class="opacity-0 -translate-x-2"
      >
        <div v-if="showAttachments" class="flex items-end gap-2">
          <!-- Attach file -->
          <button
            @click="pickFile"
            :disabled="disabled || isRecording"
            class="inline-flex shrink-0 h-11 w-11 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) disabled:opacity-40 active:scale-90 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            title="Attach encrypted file"
          >
            <Paperclip class="w-4 h-4" :stroke-width="2" aria-hidden="true" />
          </button>

          <!-- Image picker -->
          <button
            @click="pickImage"
            :disabled="disabled || isRecording"
            class="inline-flex shrink-0 h-11 w-11 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) disabled:opacity-40 active:scale-90 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            title="Send image (EXIF data removed)"
          >
            <ImagePlus class="w-4 h-4" :stroke-width="1.8" aria-hidden="true" />
          </button>
        </div>
      </Transition>

      <!-- Text input -->
      <div
        class="flex-1 rounded-2xl px-4 py-3 transition-all duration-200 border border-(--app-border) bg-(--app-surface-soft) text-(--app-text) focus-within:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus-within:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))]"
      >
        <textarea
          ref="textareaEl"
          :value="modelValue"
          @input="onInput"
          rows="1"
          placeholder="Message…"
          class="w-full bg-transparent resize-none overflow-hidden text-sm placeholder-zinc-500 outline-none ring-0 leading-snug block"
          @keydown="onKeydown"
          @paste="onPaste"
          @beforeinput="onBeforeInput"
        />
      </div>

      <!-- Mic -->
      <button
        @click="emit('toggle-recording')"
        :disabled="disabled || disableMic"
        class="shrink-0 h-11 w-11 flex items-center justify-center rounded-2xl disabled:opacity-40 transition-all duration-150 active:scale-90"
        :class="
          isRecording
            ? 'text-red-400 bg-red-500/15 hover:bg-red-500/25 animate-pulse'
            : 'border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
        "
        :title="isRecording ? 'Stop and send voice note' : 'Record voice note'"
      >
        <Mic class="w-4 h-4" :stroke-width="1.8" aria-hidden="true" />
      </button>

      <!-- Send -->
      <button
        @click="emit('send')"
        :disabled="disabled || isRecording || !modelValue.trim()"
        class="group shrink-0 h-11 w-11 flex items-center justify-center rounded-2xl bg-(--app-primary) text-[#06101a] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-90 hover:bg-(--app-primary-strong) hover:text-white"
        title="Send"
      >
        <Send
          class="w-4 h-4 text-[#ffffff] transition-transform duration-150 group-hover:translate-x-0.5"
          :stroke-width="2.2"
          aria-hidden="true"
        />
      </button>
    </div>
    <!-- Pasted image confirmation modal (teleported to body for proper centering) -->
    <Teleport to="body">
      <div v-if="showImageConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60" @click="cancelPaste" />
        <div
          class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] relative z-10 w-full max-w-md min-w-0 overflow-hidden rounded-2xl p-4"
        >
          <p class="text-sm font-semibold mb-2">Send pasted image?</p>
          <img
            :src="pendingImageUrl"
            alt="Pasted preview"
            class="mb-3 block max-h-[50vh] w-full max-w-full rounded object-contain"
          />
          <div class="flex justify-end gap-2">
            <button
              @click="cancelPaste"
              class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/8 text-zinc-300 hover:bg-white/16"
            >
              <X class="w-4 h-4" :stroke-width="2" />
              Cancel
            </button>
            <button
              @click="confirmPaste"
              class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-(--app-primary) text-[#ffffff] hover:bg-(--app-primary-strong)"
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
