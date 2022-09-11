<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { Download, FileText, Lock, Loader2, ExternalLink } from "lucide-vue-next";
import { noteEncode } from "nostr-tools/nip19";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { useShareMedia } from "@/composables/useShareMedia";
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
  <div class="mx-auto max-w-2xl px-4 py-8">
    <div class="mb-8 flex items-center justify-between">
      <h1 class="text-2xl font-bold text-white flex items-center gap-2">
        <Lock class="h-6 w-6 text-(--app-primary)" />
        Shared Content
      </h1>
      <router-link to="/" class="text-sm text-zinc-400 hover:text-white transition-colors">
        Back Home
      </router-link>
    </div>

    <div
      v-if="isLoading"
      class="ui-panel rounded-2xl p-12 flex flex-col items-center justify-center"
    >
      <Loader2 class="h-8 w-8 animate-spin text-(--app-primary) mb-4" />
      <p class="text-zinc-300 font-medium">Fetching and decrypting content...</p>
      <p class="text-xs text-zinc-500 mt-2">This securely connects to relays and Blossom servers.</p>
    </div>

    <AppAlertBanner v-else-if="error" :message="error" class="mb-4" />

    <div v-else-if="payload" class="space-y-6">
      <div v-if="payload.text" class="ui-panel rounded-2xl p-6">
        <div class="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
          <FileText class="h-4 w-4 text-zinc-400" />
          <h2 class="text-sm font-medium text-zinc-300 uppercase tracking-wider">Note</h2>
          <span v-if="payload.createdAt" class="ml-auto text-xs text-zinc-500">{{
            formatDate(payload.createdAt)
          }}</span>
        </div>
        <div class="text-white whitespace-pre-wrap text-sm leading-relaxed">{{ payload.text }}</div>
      </div>

      <div v-if="payload.media?.length" class="ui-panel rounded-2xl p-6">
        <div class="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
          <div class="flex items-center gap-2">
            <Lock class="h-4 w-4 text-zinc-400" />
            <h2 class="text-sm font-medium text-zinc-300 uppercase tracking-wider">
              Secure Attachments ({{ payload.media.length }})
            </h2>
          </div>
          <button
            @click="decryptAllFiles"
            :disabled="isDecryptingAll"
            class="ui-button ui-button-secondary h-8 px-3 text-xs"
          >
            <Loader2 v-if="isDecryptingAll" class="h-3 w-3 animate-spin mr-1.5" />
            <Lock v-else class="h-3 w-3 mr-1.5" />
            Decrypt & Preview All
          </button>
        </div>

        <div class="space-y-4">
          <div
            v-for="(file, idx) in payload.media"
            :key="idx"
            class="flex flex-col bg-black/20 rounded-xl p-3 border border-white/5 overflow-hidden"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="min-w-0 flex-1 pr-4">
                <p class="text-sm font-medium text-white truncate mb-0.5">{{ file.name }}</p>
                <div class="flex items-center gap-2 text-xs text-zinc-400">
                  <span>{{ formatBytes(file.size) }}</span>
                  <span>•</span>
                  <span>{{
                    shareMedia.blobUrls[idx]
                      ? "Decrypted"
                      : shareMedia.failed[idx]
                        ? "Decrypt failed"
                        : "End-to-End Encrypted"
                  }}</span>
                </div>
              </div>

              <button
                @click="downloadFile(file, idx)"
                :disabled="shareMedia.loading[idx] && !shareMedia.blobUrls[idx]"
                class="ui-button ui-button-primary shrink-0 px-4 h-9"
              >
                <Loader2
                  v-if="shareMedia.loading[idx] && !shareMedia.blobUrls[idx]"
                  class="h-4 w-4 animate-spin"
                />
                <template v-else>
                  <Download class="h-4 w-4 mr-1.5" />
                  <span class="text-xs">{{ shareMedia.blobUrls[idx] ? "Download" : "Decrypt" }}</span>
                </template>
              </button>
            </div>

            <div
              v-if="shareMedia.blobUrls[idx]"
              class="mt-2 rounded-lg overflow-hidden bg-black/40 flex items-center justify-center min-h-[100px]"
            >
              <img
                v-if="isImage(file.mime)"
                :src="shareMedia.blobUrls[idx]"
                class="max-w-full max-h-[400px] object-contain"
              />
              <video
                v-else-if="isVideo(file.mime)"
                controls
                :src="shareMedia.blobUrls[idx]"
                class="max-w-full max-h-[400px]"
              ></video>
              <audio
                v-else-if="isAudio(file.mime)"
                controls
                :src="shareMedia.blobUrls[idx]"
                class="w-full"
              ></audio>
              <div v-else class="py-6 text-zinc-500 text-sm flex items-center gap-2">
                <FileText class="h-5 w-5" />
                No preview available
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="njumpUrl" class="flex justify-center mt-6">
        <a
          :href="njumpUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="group flex items-center gap-2 ui-panel rounded-xl px-4 py-3 border border-white/5 hover:border-(--app-primary)/30 transition-colors w-full sm:w-auto"
        >
          <ExternalLink
            class="h-4 w-4 text-zinc-400 group-hover:text-(--app-primary) transition-colors"
          />
          <span class="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors"
            >View Event on njump.me</span
          >
        </a>
      </div>
    </div>
  </div>
</template>