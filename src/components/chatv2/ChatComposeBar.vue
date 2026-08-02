<script setup>
import { ref, computed, watch, nextTick } from "vue";
import { Mic, Paperclip, ImagePlus, SendHorizontal, Square, X } from "@lucide/vue";
import { formatDuration } from "@/lib/chatUtils";
import RoboAvatar from "@/components/RoboAvatar.vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  isRecording: { type: Boolean, default: false },
  recordingSeconds: { type: Number, default: 0 },
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

function triggerFileInput() {
  fileInputRef.value?.click();
}

function triggerImageInput() {
  imageInputRef.value?.click();
}

function onFileChange(e) {
  const files = e.target?.files;
  if (files && files.length > 0) {
    emit("file-selected", files[0]);
    e.target.value = "";
  }
}

async function onImageChange(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;

  const ANIMATED_TYPES = new Set(["image/gif", "image/webp", "image/avif"]);
  if (ANIMATED_TYPES.has(file.type)) {
    emit("file-selected", file);
    return;
  }

  try {
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
  } catch {
    emit("file-selected", file);
  }
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
  for (const item of items) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) {
        emit("file-selected", file);
        e.preventDefault();
        return;
      }
    }
  }
}

defineExpose({
  focus: () => textareaRef.value?.focus?.(),
  onPaste,
});
</script>

<template>
  <div
    class="relative flex flex-col border-t border-(--app-border) bg-(--app-surface) p-3 sm:px-4 shrink-0"
  >
    <!-- Replying Banner -->
    <div
      v-if="replyingTo"
      class="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2 text-xs"
    >
      <div class="min-w-0 flex-1">
        <p class="font-bold text-(--app-primary) text-[11px]">Replying to message</p>
        <p class="truncate text-(--app-muted)">
          {{ replyingTo.text || replyingTo.replyExcerpt || "Attachment" }}
        </p>
      </div>
      <button
        type="button"
        @click="emit('cancel-reply')"
        class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
      >
        <X class="h-3.5 w-3.5" :stroke-width="2" />
      </button>
    </div>

    <!-- Mentions Dropdown -->
    <div
      v-if="showMentions && filteredMentions.length"
      class="absolute bottom-full left-4 mb-2 z-30 w-64 rounded-2xl border border-(--app-border) bg-(--app-surface) p-1.5 shadow-xl"
    >
      <div class="px-2 py-1 text-[10px] font-bold text-(--app-muted) uppercase tracking-wider">
        Mention Member
      </div>
      <button
        v-for="(user, idx) in filteredMentions"
        :key="user.pubkey"
        type="button"
        @click="insertMention(user)"
        class="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors"
        :class="
          idx === selectedMentionIdx
            ? 'bg-(--app-primary-soft) text-(--app-text)'
            : 'hover:bg-(--app-surface-hover)'
        "
      >
        <RoboAvatar :src="user.picture" :pubkey="user.pubkey" size="xs" />
        <span class="truncate font-semibold">{{ user.name }}</span>
      </button>
    </div>

    <!-- Upload Status Banner -->
    <div
      v-if="uploadStatus"
      class="mb-3 rounded-xl border border-(--app-border) bg-(--app-surface-soft) p-3 flex flex-col gap-2"
    >
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :class="
              uploadStatus.phase === 'done'
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-[#c084fc] animate-ping'
            "
          />
          <span class="font-semibold text-zinc-300">
            <span v-if="uploadStatus.phase === 'encrypting'">Encrypting attachment…</span>
            <span v-else-if="uploadStatus.phase === 'uploading'">
              Uploading to {{ uploadStatus.server || "relays" }}
            </span>
            <span v-else>Upload complete</span>
          </span>
        </div>
        <span
          v-if="uploadStatus.phase === 'uploading' && uploadStatus.totalCount"
          class="text-[10px] text-zinc-500 font-mono"
        >
          {{ uploadStatus.doneCount }}/{{ uploadStatus.totalCount }}
        </span>
      </div>

      <!-- Flat Progress Bar -->
      <div class="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-300"
          :class="uploadStatus.phase === 'done' ? 'bg-emerald-500' : 'bg-[#c084fc]'"
          :style="{
            width:
              uploadStatus.phase === 'done'
                ? '100%'
                : uploadStatus.phase === 'encrypting'
                  ? '30%'
                  : `${(uploadStatus.doneCount / (uploadStatus.totalCount || 1)) * 100}%`,
          }"
        />
      </div>
    </div>

    <!-- Voice Recording Mode -->
    <div v-if="isRecording" class="flex items-center justify-between gap-3 py-1">
      <div class="flex items-center gap-3 text-red-400">
        <span class="h-3 w-3 animate-ping rounded-full bg-red-500" />
        <span class="text-xs font-mono font-bold">
          Recording audio: {{ formatDuration(recordingSeconds) }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          @click="emit('cancel-recording')"
          class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-1.5 text-xs font-semibold text-(--app-text) hover:bg-(--app-surface-hover)"
        >
          Cancel
        </button>
        <button
          type="button"
          @click="emit('toggle-recording')"
          class="inline-flex items-center gap-1.5 rounded-2xl bg-red-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-600 active:scale-95"
        >
          <Square class="h-3.5 w-3.5 fill-current" />
          Send Recording
        </button>
      </div>
    </div>

    <!-- Normal Input Bar -->
    <div v-else class="flex items-end gap-2">
      <!-- Image Attach Button -->
      <button
        type="button"
        @click="triggerImageInput"
        :disabled="disabled"
        class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) transition-all hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-40 active:scale-95"
        title="Send Image"
      >
        <ImagePlus class="h-4.5 w-4.5" :stroke-width="2" />
      </button>

      <!-- File Attach Button -->
      <button
        type="button"
        @click="triggerFileInput"
        :disabled="disabled"
        class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) transition-all hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-40 active:scale-95"
        title="Attach File"
      >
        <Paperclip class="h-4.5 w-4.5" :stroke-width="2" />
      </button>

      <input
        ref="imageInputRef"
        type="file"
        accept="image/*"
        class="hidden"
        @change="onImageChange"
      />
      <input ref="fileInputRef" type="file" class="hidden" @change="onFileChange" />

      <!-- Textarea input -->
      <div class="relative flex min-h-10 flex-1 items-end">
        <textarea
          ref="textareaRef"
          v-model="text"
          :disabled="disabled"
          rows="1"
          placeholder="Message..."
          class="box-border w-full min-h-10 resize-none rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-2 text-sm leading-5 text-(--app-text) placeholder-(--app-muted) transition-colors focus:border-[color-mix(in_srgb,var(--app-primary)_60%,var(--app-border))] focus:bg-(--app-surface) focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] disabled:opacity-50"
          @keydown="handleKeydown"
          @paste="onPaste"
        />
      </div>

      <!-- Voice Record Button (when text is empty) -->
      <button
        v-if="!text.trim()"
        type="button"
        @click="emit('toggle-recording')"
        :disabled="disabled"
        class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) transition-all hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-40 active:scale-95"
        title="Voice Note"
      >
        <Mic class="h-4.5 w-4.5" :stroke-width="2" />
      </button>

      <!-- Send Button (when text is typed) -->
      <button
        v-else
        type="button"
        @click="handleSend"
        :disabled="disabled"
        class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-(--app-primary) text-zinc-950 transition-all hover:bg-(--app-primary-strong) hover:scale-105 active:scale-95 disabled:opacity-40"
        title="Send Message"
      >
        <SendHorizontal class="h-4.5 w-4.5" :stroke-width="2.2" />
      </button>
    </div>
  </div>
</template>
