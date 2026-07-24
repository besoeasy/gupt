<script setup>
import { ref } from "vue";
import { Paperclip, X, Copy, Check, FileText } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { createShareLink, formatBytes, validateShareFiles } from "@/lib/share";
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
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-[80rem] px-4 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-16">
      <div class="mx-auto max-w-2xl space-y-8">
        <header class="space-y-2 border-b border-(--app-border) pb-6">
          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c084fc]">
            Ephemeral share
          </p>
          <div class="space-y-1.5">
            <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Secure Share</h1>
            <p class="max-w-xl text-sm leading-6 text-zinc-500">
              Encrypt notes and files locally, then publish a link anyone can open — no account
              required.
            </p>
          </div>
        </header>

        <AppAlertBanner v-if="error" :message="error" />

        <form class="space-y-6" @submit.prevent="handleShare">
          <div>
            <label class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-300">
              <FileText class="h-4 w-4 text-zinc-500" aria-hidden="true" />
              Note (optional)
            </label>
            <textarea
              v-model="noteText"
              rows="5"
              placeholder="Write something to share…"
              class="block min-h-[120px] w-full resize-y rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
            />
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between gap-3">
              <label class="text-sm font-medium text-zinc-300">Attachments</label>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 text-xs font-semibold text-[#c084fc] transition-colors hover:text-[#d8b4fe]"
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
                class="flex items-center justify-between rounded-xl border border-(--app-border) bg-(--app-surface-soft) p-3"
              >
                <div class="min-w-0 flex-1 pr-4">
                  <p class="truncate text-sm font-medium">{{ file.name }}</p>
                  <p class="mt-0.5 text-xs text-zinc-500">{{ formatBytes(file.size) }}</p>
                </div>
                <button
                  type="button"
                  class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-zinc-400 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-red-400"
                  @click="removeFile(idx)"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>
            </div>
            <button
              v-else
              type="button"
              class="flex w-full flex-col items-center rounded-xl border border-dashed border-(--app-border-strong) bg-(--app-surface-soft) px-4 py-8 text-center transition-colors hover:border-(--app-primary) hover:bg-(--app-surface-hover)"
              @click="fileInput?.click()"
            >
              <Paperclip class="mb-2 h-5 w-5 text-zinc-600" aria-hidden="true" />
              <p class="text-sm text-zinc-500">No files attached</p>
              <p class="mt-1 text-xs text-zinc-600">Tap to add encrypted attachments</p>
            </button>
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-zinc-300"> Link Expiration </label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="opt in [
                  { label: '1 Hour', value: 3600 },
                  { label: '1 Day', value: 86400 },
                  { label: '7 Days', value: 604800 },
                  { label: '30 Days', value: 2592000 },
                  { label: 'Never', value: 0 },
                ]"
                :key="opt.value"
                type="button"
                :class="[
                  'px-4 py-2 text-xs font-semibold rounded-full border transition-all duration-200 cursor-pointer',
                  expirySeconds === opt.value
                    ? 'border-[#c084fc] bg-[#c084fc]/10 text-[#c084fc]'
                    : 'border-(--app-border) bg-(--app-surface-soft) text-zinc-400 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover)',
                ]"
                @click="expirySeconds = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <div v-if="isUploading" class="space-y-2">
            <div class="flex items-center justify-between text-xs text-zinc-500">
              <span>{{ uploadStatusText || "Processing…" }}</span>
              <span class="tabular-nums">{{ uploadProgress }}%</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                class="h-full rounded-full bg-[#c084fc] transition-all duration-300"
                :style="{ width: `${uploadProgress}%` }"
              />
            </div>
          </div>

          <PrimaryButton type="submit" :loading="isUploading" :disabled="!canShare()">
            Generate share link
          </PrimaryButton>
        </form>

        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 translate-y-3"
          enter-to-class="opacity-100 translate-y-0"
        >
          <section v-if="shareUrl" class="space-y-4 border-t border-(--app-border) pt-8">
            <div class="space-y-1.5">
              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Link ready
              </p>
              <h2 class="text-lg font-semibold tracking-tight">Share this link</h2>
              <p class="text-sm leading-6 text-zinc-500">
                Anyone with the link can decrypt your note and files. Send it over any channel.
              </p>
            </div>

            <div class="space-y-3 rounded-2xl border border-[#c084fc]/25 bg-[#c084fc]/5 p-4">
              <input
                type="text"
                readonly
                :value="shareUrl"
                class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) bg-black/20 px-[1.125rem] py-[0.875rem] font-mono text-xs leading-[1.5] text-(--app-text) transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
                @focus="$event.target.select()"
              />
              <button
                type="button"
                class="inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-(--app-primary) px-5 py-3.5 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-(--app-primary-strong) hover:shadow-[0_8px_20px_color-mix(in_srgb,var(--app-primary)_24%,transparent)] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
                :class="copied ? '!bg-emerald-500/15 !text-emerald-300' : ''"
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
