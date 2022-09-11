<script setup>
import { ref } from "vue";
import { Paperclip, X, UploadCloud, Copy, Check } from "lucide-vue-next";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { createShareLink, formatBytes, validateShareFiles } from "@/lib/share";

const noteText = ref("");
const files = ref([]);
const fileInput = ref(null);
const isUploading = ref(false);
const uploadProgress = ref(0);
const uploadStatusText = ref("");
const shareUrl = ref("");
const copied = ref(false);
const error = ref("");

function onFileSelect(e) {
  const selected = Array.from(e.target.files || []);
  const validation = validateShareFiles([...files.value, ...selected]);
  if (!validation.ok) {
    error.value = validation.error;
    e.target.value = "";
    return;
  }

  error.value = "";
  for (const f of selected) files.value.push(f);
  e.target.value = "";
}

function removeFile(index) {
  files.value.splice(index, 1);
  error.value = "";
}

async function handleShare() {
  if (!noteText.value.trim() && files.value.length === 0) return;

  isUploading.value = true;
  shareUrl.value = "";
  error.value = "";
  uploadProgress.value = 0;
  uploadStatusText.value = "Preparing share...";

  try {
    const result = await createShareLink({
      noteText: noteText.value,
      files: files.value,
      onProgress({ percent, message }) {
        uploadProgress.value = percent ?? uploadProgress.value;
        uploadStatusText.value = message || uploadStatusText.value;
      },
    });

    shareUrl.value = result.shareUrl;
  } catch (err) {
    console.error(err);
    error.value = err?.message || "Error during sharing.";
  } finally {
    isUploading.value = false;
    uploadStatusText.value = "";
  }
}

function copyLink() {
  navigator.clipboard.writeText(shareUrl.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-8">
    <div class="mb-8 flex items-center justify-between">
      <h1 class="text-2xl font-bold text-white flex items-center gap-2">
        <UploadCloud class="h-6 w-6 text-(--app-primary)" />
        Secure Share
      </h1>
      <router-link to="/" class="text-sm text-zinc-400 hover:text-white transition-colors">
        Back Home
      </router-link>
    </div>

    <AppAlertBanner v-if="error" :message="error" class="mb-4" />

    <div class="ui-panel rounded-2xl p-4 sm:p-6 mb-6">
      <p class="text-sm text-zinc-300 mb-6">
        Share encrypted notes and files. Content is encrypted locally before being uploaded. Only
        those with the share link can decrypt the content.
      </p>

      <div class="mb-4">
        <label class="block text-sm font-medium text-zinc-300 mb-2">Note (Optional)</label>
        <textarea
          v-model="noteText"
          rows="4"
          placeholder="Write something to share..."
          class="ui-input w-full resize-none"
        ></textarea>
      </div>

      <div class="mb-6">
        <div class="flex items-center justify-between mb-2">
          <label class="block text-sm font-medium text-zinc-300">Attachments</label>
          <button
            @click="fileInput?.click()"
            class="text-xs font-semibold text-(--app-primary) hover:text-(--app-primary-strong) transition-colors flex items-center gap-1"
          >
            <Paperclip class="h-3 w-3" />
            Add Files
          </button>
        </div>
        <input type="file" multiple ref="fileInput" class="hidden" @change="onFileSelect" />

        <div v-if="files.length > 0" class="space-y-2">
          <div
            v-for="(file, idx) in files"
            :key="`${file.name}-${file.size}-${idx}`"
            class="flex items-center justify-between bg-white/5 rounded-xl p-3 border border-white/5"
          >
            <div class="min-w-0 flex-1 pr-4">
              <p class="text-sm font-medium text-white truncate">{{ file.name }}</p>
              <p class="text-xs text-zinc-400 mt-0.5">{{ formatBytes(file.size) }}</p>
            </div>
            <button
              @click="removeFile(idx)"
              class="ui-icon-button h-8 w-8 shrink-0 text-zinc-400 hover:text-red-400"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>
        <div
          v-else
          class="text-center py-6 border-2 border-dashed border-white/10 rounded-xl bg-white/5"
        >
          <p class="text-sm text-zinc-500">No files attached</p>
        </div>
      </div>

      <div v-if="isUploading" class="mb-4">
        <div class="mb-2 flex items-center justify-between text-xs text-zinc-400">
          <span>{{ uploadStatusText || "Processing..." }}</span>
          <span>{{ uploadProgress }}%</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-(--app-primary) transition-all duration-300"
            :style="{ width: `${uploadProgress}%` }"
          />
        </div>
      </div>

      <div class="flex justify-end">
        <button
          @click="handleShare"
          :disabled="isUploading || (!noteText.trim() && files.length === 0)"
          class="ui-button ui-button-primary"
        >
          <span v-if="!isUploading" class="flex items-center gap-2">Generate Share Link</span>
          <span v-else class="flex items-center gap-2">
            <span
              class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"
            ></span>
            {{ uploadStatusText || "Processing..." }}
          </span>
        </button>
      </div>
    </div>

    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
    >
      <div
        v-if="shareUrl"
        class="ui-panel rounded-2xl p-4 sm:p-6 border border-(--app-primary)/30 bg-(--app-primary)/5"
      >
        <div class="flex items-start gap-4">
          <div
            class="h-10 w-10 shrink-0 rounded-full bg-(--app-primary)/20 flex items-center justify-center text-(--app-primary)"
          >
            <Check class="h-5 w-5" stroke-width="2.5" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-base font-semibold text-white mb-1">Share Link Ready</h3>
            <p class="text-sm text-zinc-300 mb-4">
              Anyone with this link can decrypt and access your note and files.
            </p>

            <div class="flex items-center gap-2">
              <input
                type="text"
                readonly
                :value="shareUrl"
                class="ui-input w-full text-xs font-mono py-2.5 px-3 bg-black/20"
                @focus="$event.target.select()"
              />
              <button @click="copyLink" class="ui-button ui-button-primary shrink-0 px-4">
                <Copy v-if="!copied" class="h-4 w-4" />
                <Check v-else class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>