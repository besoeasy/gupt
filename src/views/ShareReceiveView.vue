<script setup>
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { Download, FileText, Lock, AlertCircle, Loader2 } from "lucide-vue-next";
import { gcm } from "@noble/ciphers/aes.js";
import { queryNostrEvents } from "@/lib/api";
import { aesDecrypt } from "@/lib/crypto";
import { base64ToBytes, formatTime, isImage, isVideo, isAudio } from "@/lib/chatUtils";
import { noteEncode } from "nostr-tools/nip19";
import { ExternalLink } from "lucide-vue-next";

const route = useRoute();
const isLoading = ref(true);
const error = ref(null);
const payload = ref(null);
const downloadingFiles = ref({});
const isDecryptingAll = ref(false);
const njumpUrl = ref("");

onMounted(async () => {
  const eventId = route.query.id;
  const keyB64 = route.query.key;

  if (!eventId || !keyB64) {
    error.value = "Invalid share link. Missing ID or Key.";
    isLoading.value = false;
    return;
  }

  try {
    njumpUrl.value = `https://njump.me/${noteEncode(eventId)}`;
  } catch (e) {
    // Ignore invalid id
  }

  try {
    const keyBytes = base64ToBytes(keyB64.replace(/-/g, "+").replace(/_/g, "/"));

    // Query Nostr for the event
    const events = await queryNostrEvents({ ids: [eventId], limit: 1 }, 10000);

    if (!events || events.length === 0) {
      throw new Error("Event not found. It may have expired or hasn't propagated yet.");
    }

    const event = events[0];

    // Decrypt the content
    let encryptedContent = event.content;
    const shareTag = event.tags?.find((t) => t[0] === "gupt_share");
    if (shareTag && shareTag[1]) {
      encryptedContent = shareTag[1];
    }

    const decryptedStr = await aesDecrypt(keyBytes, encryptedContent);

    payload.value = JSON.parse(decryptedStr);
  } catch (err) {
    console.error("Failed to load or decrypt shared content:", err);
    error.value =
      "Failed to load or decrypt content. The link may be broken or you do not have the correct key.";
  } finally {
    isLoading.value = false;
  }
});

function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString() + " " + formatTime(ts);
}

async function decryptFileLogic(file, idx) {
  if (file.blobUrl) return true;

  downloadingFiles.value[idx] = true;
  try {
    const fileKey = base64ToBytes(file.key);
    const fileNonce = base64ToBytes(file.nonce);
    let downloadedBlob = null;
    let fetchError = null;

    for (const loc of file.locations) {
      const url = loc.url || (loc.cid ? `https://ipfs.io/ipfs/${loc.cid}` : null);
      if (!url) continue;

      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const encryptedBuf = await response.arrayBuffer();
        const plainBuf = gcm(fileKey, fileNonce).decrypt(new Uint8Array(encryptedBuf));
        downloadedBlob = new Blob([plainBuf], { type: file.mime || "application/octet-stream" });
        break;
      } catch (err) {
        fetchError = err;
      }
    }

    if (!downloadedBlob) {
      throw fetchError || new Error("Could not download file from any source.");
    }

    file.blobUrl = URL.createObjectURL(downloadedBlob);
    return true;
  } catch (err) {
    console.error("Decrypt failed for", file.name, err);
    return false;
  } finally {
    downloadingFiles.value[idx] = false;
  }
}

async function decryptAllFiles() {
  if (isDecryptingAll.value) return;
  isDecryptingAll.value = true;

  const promises = [];
  for (let idx = 0; idx < payload.value.media.length; idx++) {
    promises.push(decryptFileLogic(payload.value.media[idx], idx));
  }

  await Promise.all(promises);
  isDecryptingAll.value = false;
}

async function downloadFile(file, idx) {
  if (!file.blobUrl) {
    const ok = await decryptFileLogic(file, idx);
    if (!ok) {
      alert("Failed to decrypt " + file.name);
      return;
    }
  }

  const a = document.createElement("a");
  a.href = file.blobUrl;
  a.download = file.name || "download";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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

    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="ui-panel rounded-2xl p-12 flex flex-col items-center justify-center"
    >
      <Loader2 class="h-8 w-8 animate-spin text-(--app-primary) mb-4" />
      <p class="text-zinc-300 font-medium">Fetching and decrypting content...</p>
      <p class="text-xs text-zinc-500 mt-2">
        This securely connects to relays and Blossom servers.
      </p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="ui-panel rounded-2xl p-6 border border-red-500/20 bg-red-500/5">
      <div class="flex items-start gap-4">
        <AlertCircle class="h-6 w-6 text-red-400 shrink-0" />
        <div>
          <h3 class="text-base font-semibold text-white mb-1">Access Error</h3>
          <p class="text-sm text-zinc-300">{{ error }}</p>
        </div>
      </div>
    </div>

    <!-- Content State -->
    <div v-else-if="payload" class="space-y-6">
      <!-- Text Note -->
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

      <!-- Attachments -->
      <div v-if="payload.media && payload.media.length > 0" class="ui-panel rounded-2xl p-6">
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
                  <span>{{ file.blobUrl ? "Decrypted" : "End-to-End Encrypted" }}</span>
                </div>
              </div>

              <button
                @click="downloadFile(file, idx)"
                :disabled="downloadingFiles[idx] && !file.blobUrl"
                class="ui-button ui-button-primary shrink-0 px-4 h-9"
              >
                <Loader2
                  v-if="downloadingFiles[idx] && !file.blobUrl"
                  class="h-4 w-4 animate-spin"
                />
                <template v-else>
                  <Download class="h-4 w-4 mr-1.5" />
                  <span class="text-xs">{{ file.blobUrl ? "Download" : "Decrypt" }}</span>
                </template>
              </button>
            </div>

            <!-- Media Preview -->
            <div
              v-if="file.blobUrl"
              class="mt-2 rounded-lg overflow-hidden bg-black/40 flex items-center justify-center min-h-[100px]"
            >
              <img
                v-if="isImage(file.mime)"
                :src="file.blobUrl"
                class="max-w-full max-h-[400px] object-contain"
              />
              <video
                v-else-if="isVideo(file.mime)"
                controls
                :src="file.blobUrl"
                class="max-w-full max-h-[400px]"
              ></video>
              <audio
                v-else-if="isAudio(file.mime)"
                controls
                :src="file.blobUrl"
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

      <!-- NJump Link -->
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
