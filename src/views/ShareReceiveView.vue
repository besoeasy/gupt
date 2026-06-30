<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { Download, FileText, Lock, Loader2, ExternalLink } from "lucide-vue-next";
import { noteEncode } from "nostr-tools/nip19";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PageBackHeader from "@/components/PageBackHeader.vue";
import MediaDecryptStatus from "@/components/chat/MediaDecryptStatus.vue";
import { useShareMedia } from "@/composables/useShareMedia";
import { MEDIA_PHASE } from "@/lib/mediaDecrypt";
import { formatTime, isImage, isVideo, isAudio } from "@/lib/chatUtils";
import { fetchSharePayload, formatBytes } from "@/lib/share";

const route = useRoute();
const isLoading = ref(true);
const error = ref(null);
const payload = ref(null);
const isDecryptingAll = ref(false);
const njumpUrl = ref("");

const shareId = computed(() => String(route.query.id || ""));
const shareMedia = useShareMedia(shareId);

async function loadShare() {
  const eventId = route.query.id;
  const keyB64 = route.query.key;

  isLoading.value = true;
  error.value = null;
  payload.value = null;
  njumpUrl.value = "";
  shareMedia.cleanup();

  if (!eventId || !keyB64) {
    error.value = "Invalid share link. Missing ID or key.";
    isLoading.value = false;
    return;
  }

  try {
    njumpUrl.value = `https://njump.me/${noteEncode(eventId)}`;
  } catch {
    // Ignore invalid id
  }

  try {
    payload.value = await fetchSharePayload(eventId, keyB64);
    shareMedia.autoPreviewMedia(payload.value?.media || []);
  } catch (err) {
    console.error("Failed to load or decrypt shared content:", err);
    error.value =
      err?.message ||
      "Failed to load or decrypt content. The link may be broken or you do not have the correct key.";
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadShare);
watch(() => [route.query.id, route.query.key], loadShare);

function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${formatTime(ts)}`;
}

async function decryptAllFiles() {
  if (isDecryptingAll.value || !payload.value?.media?.length) return;
  isDecryptingAll.value = true;
  try {
    await shareMedia.decryptAll(payload.value.media);
  } finally {
    isDecryptingAll.value = false;
  }
}

async function downloadFile(file, idx) {
  try {
    const ok = await shareMedia.downloadFile(file, idx);
    if (!ok) error.value = `Failed to decrypt ${file.name}.`;
  } catch (err) {
    error.value = err?.message || `Failed to decrypt ${file.name}.`;
  }
}
</script>

<template>
  <main class="chat-shell min-h-dvh overflow-y-auto lg:h-full">
    <div class="app-page-shell mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <PageBackHeader
          back-to="/share"
          back-label="Secure Share"
          eyebrow="Encrypted delivery"
          eyebrow-class="text-[#c084fc]"
          title="Shared content"
        >
          <p class="text-sm leading-6 text-zinc-500">
            Decrypted locally in your browser. Nothing is stored on a central server.
          </p>
        </PageBackHeader>

        <div v-if="isLoading" class="flex flex-col items-center py-24 text-center">
          <Loader2 class="mb-4 h-8 w-8 animate-spin text-[#c084fc]" />
          <p class="font-medium text-zinc-300">Fetching and decrypting…</p>
          <p class="mt-1 text-xs text-zinc-500">Connecting to relays and Blossom servers</p>
        </div>

        <AppAlertBanner v-else-if="error" :message="error" />

        <div v-else-if="payload" class="space-y-8">
          <section
            v-if="payload.text"
            class="space-y-4 rounded-2xl border border-white/8 bg-white/[0.02] p-5"
          >
            <div class="flex items-center gap-2 border-b border-white/8 pb-4">
              <FileText class="h-4 w-4 text-zinc-500" aria-hidden="true" />
              <h2 class="text-sm font-semibold text-zinc-300">Note</h2>
              <span v-if="payload.createdAt" class="ml-auto text-xs text-zinc-500">{{
                formatDate(payload.createdAt)
              }}</span>
            </div>
            <div class="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
              {{ payload.text }}
            </div>
          </section>

          <section v-if="payload.media?.length" class="space-y-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div class="space-y-1">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Attachments
                </p>
                <h2 class="text-lg font-semibold tracking-tight">
                  {{ payload.media.length }} encrypted file{{
                    payload.media.length === 1 ? "" : "s"
                  }}
                </h2>
              </div>
              <button
                type="button"
                class="ui-button ui-button-secondary inline-flex h-9 items-center gap-1.5 px-3 text-xs"
                :disabled="isDecryptingAll"
                @click="decryptAllFiles"
              >
                <Loader2 v-if="isDecryptingAll" class="h-3.5 w-3.5 animate-spin" />
                <Lock v-else class="h-3.5 w-3.5" />
                Decrypt & preview all
              </button>
            </div>

            <div class="space-y-3">
              <div v-for="(file, idx) in payload.media" :key="idx" class="space-y-2">
                <div class="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium">{{ file.name }}</p>
                      <div class="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                        <span>{{ formatBytes(file.size) }}</span>
                        <span aria-hidden="true">·</span>
                        <span>{{
                          shareMedia.blobUrls[idx]
                            ? "Decrypted"
                            : shareMedia.failed[idx]
                              ? "Decrypt failed"
                              : shareMedia.progress[idx]?.phase === MEDIA_PHASE.FETCH ||
                                  shareMedia.progress[idx]?.phase === MEDIA_PHASE.DECRYPT
                                ? "Downloading…"
                                : "Encrypted"
                        }}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      class="ui-button ui-button-primary inline-flex h-9 shrink-0 items-center gap-1.5 px-4"
                      :disabled="
                        (shareMedia.progress[idx]?.phase === MEDIA_PHASE.FETCH ||
                          shareMedia.progress[idx]?.phase === MEDIA_PHASE.DECRYPT) &&
                        !shareMedia.blobUrls[idx]
                      "
                      @click="downloadFile(file, idx)"
                    >
                      <Loader2
                        v-if="
                          (shareMedia.progress[idx]?.phase === MEDIA_PHASE.FETCH ||
                            shareMedia.progress[idx]?.phase === MEDIA_PHASE.DECRYPT) &&
                          !shareMedia.blobUrls[idx]
                        "
                        class="h-4 w-4 animate-spin"
                      />
                      <template v-else>
                        <Download class="h-4 w-4" />
                        <span class="text-xs">{{
                          shareMedia.blobUrls[idx] ? "Download" : "Decrypt"
                        }}</span>
                      </template>
                    </button>
                  </div>
                </div>

                <MediaDecryptStatus
                  v-if="
                    shareMedia.progress[idx] &&
                    !shareMedia.blobUrls[idx] &&
                    (shareMedia.failed[idx] ||
                      shareMedia.progress[idx]?.phase === MEDIA_PHASE.FETCH ||
                      shareMedia.progress[idx]?.phase === MEDIA_PHASE.DECRYPT ||
                      shareMedia.progress[idx]?.phase === MEDIA_PHASE.FAILED)
                  "
                  :progress="shareMedia.progress[idx]"
                />

                <div
                  v-if="shareMedia.blobUrls[idx]"
                  class="flex min-h-[100px] items-center justify-center overflow-hidden rounded-xl"
                >
                  <img
                    v-if="isImage(file.mime)"
                    :src="shareMedia.blobUrls[idx]"
                    class="max-h-[400px] max-w-full object-contain"
                  />
                  <video
                    v-else-if="isVideo(file.mime)"
                    controls
                    :src="shareMedia.blobUrls[idx]"
                    class="max-h-[400px] max-w-full"
                  />
                  <audio
                    v-else-if="isAudio(file.mime)"
                    controls
                    :src="shareMedia.blobUrls[idx]"
                    class="w-full"
                  />
                  <div v-else class="flex items-center gap-2 py-6 text-sm text-zinc-500">
                    <FileText class="h-5 w-5" />
                    No preview available
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div v-if="njumpUrl" class="border-t border-white/8 pt-6">
            <a
              :href="njumpUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="group flex items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 transition-colors hover:border-[#c084fc]/30 hover:bg-white/[0.04]"
            >
              <ExternalLink
                class="h-4 w-4 text-zinc-500 transition-colors group-hover:text-[#c084fc]"
              />
              <span
                class="text-sm font-medium text-zinc-400 transition-colors group-hover:text-white"
              >
                View event on njump.me
              </span>
            </a>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
