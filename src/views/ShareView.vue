<script setup>
import { ref } from "vue";
import { Paperclip, X, Copy, Check, FileText, Loader2 } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import {
  createShareLink,
  formatBytes,
  validateShareFiles,
  SHARE_EXPIRY_OPTIONS,
} from "@/lib/share";
import { copyToClipboard } from "@/lib/clipboard";

const noteText = ref("");
const files = ref([]);
const fileInput = ref(null);
const isUploading = ref(false);
const uploadProgress = ref(0);
const uploadStatusText = ref("");
const shareUrl = ref("");
const copied = ref(false);
const error = ref("");
const expirySeconds = ref(604800); // default to 7 days

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
      expirySeconds: expirySeconds.value,
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

async function copyLink() {
  await copyToClipboard(shareUrl.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

const canShare = () => !isUploading.value && (noteText.value.trim() || files.value.length > 0);
</script>

<template>
  <main class="min-h-dvh overflow-y-auto overflow-x-hidden bg-black text-zinc-100 pb-16">
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-5">
        <header class="border-b border-zinc-800/80 pb-5">
          <p class="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
            Ephemeral share
          </p>
          <h1 class="mt-1 text-xl font-semibold tracking-tight text-white">Secure Share</h1>
          <p class="mt-1 text-sm leading-6 text-zinc-400">
            Encrypt notes and files locally, then publish a link anyone can open — no account
            required.
          </p>
        </header>

        <AppAlertBanner v-if="error" :message="error" />

        <form class="space-y-5" @submit.prevent="handleShare">
          <div>
            <label class="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
              <FileText class="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
              Note (optional)
            </label>
            <textarea
              v-model="noteText"
              rows="5"
              placeholder="Write something to share…"
              class="block min-h-[120px] w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-3 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between gap-3">
              <label class="text-xs font-medium text-zinc-300">Attachments</label>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-white cursor-pointer"
                @click="fileInput?.click()"
              >
                <Paperclip class="h-3.5 w-3.5" aria-hidden="true" />
                Add files
              </button>
            </div>
            <input ref="fileInput" type="file" multiple class="hidden" @change="onFileSelect" />

            <div v-if="files.length > 0" class="space-y-2">
              <div
                v-for="(file, idx) in files"
                :key="`${file.name}-${file.size}-${idx}`"
                class="flex items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-medium text-zinc-200 sm:text-sm">
                    {{ file.name }}
                  </p>
                  <p class="mt-0.5 font-mono text-[11px] tabular-nums text-zinc-500">
                    {{ formatBytes(file.size) }}
                  </p>
                </div>
                <button
                  type="button"
                  class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-red-400 cursor-pointer"
                  @click="removeFile(idx)"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>
            </div>
            <button
              v-else
              type="button"
              class="flex w-full flex-col items-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-8 text-center transition-colors hover:border-zinc-600 hover:bg-zinc-900/40 cursor-pointer"
              @click="fileInput?.click()"
            >
              <Paperclip class="mb-2 h-5 w-5 text-zinc-600" aria-hidden="true" />
              <p class="text-xs font-medium text-zinc-400">No files attached</p>
              <p class="mt-1 text-[11px] text-zinc-600">Tap to add encrypted attachments</p>
            </button>
          </div>

          <div>
            <label class="mb-2 block text-xs font-medium text-zinc-300"> Link Expiration </label>
            <div
              class="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              <button
                v-for="opt in SHARE_EXPIRY_OPTIONS"
                :key="opt.value"
                type="button"
                class="whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all cursor-pointer select-none"
                :class="
                  expirySeconds === opt.value
                    ? 'bg-zinc-800 text-white shadow-xs'
                    : 'text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200'
                "
                @click="expirySeconds = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <div v-if="isUploading" class="space-y-2">
            <div class="flex items-center justify-between text-xs text-zinc-500">
              <span>{{ uploadStatusText || "Processing…" }}</span>
              <span class="font-mono tabular-nums">{{ uploadProgress }}%</span>
            </div>
            <div class="h-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                class="h-full rounded-full bg-white transition-all duration-300"
                :style="{ width: `${uploadProgress}%` }"
              />
            </div>
          </div>

          <button
            type="submit"
            :disabled="!canShare()"
            class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <Loader2 v-if="isUploading" class="h-4 w-4 animate-spin" />
            <span>{{ isUploading ? "Generating…" : "Generate share link" }}</span>
          </button>
        </form>

        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 translate-y-3"
          enter-to-class="opacity-100 translate-y-0"
        >
          <section v-if="shareUrl" class="space-y-3 border-t border-zinc-800/80 pt-5">
            <div>
              <p class="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                Link ready
              </p>
              <h2 class="mt-1 text-base font-semibold tracking-tight text-white">
                Share this link
              </h2>
              <p class="mt-1 text-sm leading-6 text-zinc-400">
                Anyone with the link can decrypt your note and files. Send it over any channel.
              </p>
            </div>

            <div class="space-y-2 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
              <input
                type="text"
                readonly
                :value="shareUrl"
                class="block w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 font-mono text-xs text-zinc-200 focus:border-zinc-600 focus:outline-none"
                @focus="$event.target.select()"
              />
              <button
                type="button"
                class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-[0.99] cursor-pointer"
                @click="copyLink"
              >
                <Check v-if="copied" class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
                <Copy v-else class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                {{ copied ? "Link copied" : "Copy share link" }}
              </button>
            </div>
          </section>
        </Transition>
      </div>
    </div>
  </main>
</template>
