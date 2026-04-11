<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowLeft, AtSign, RefreshCw, Shield, UserPlus, Users, X } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import ChatComposeBar from "@/components/chat/ChatComposeBar.vue";
import ChatMessageBubble from "@/components/chat/ChatMessageBubble.vue";
import LoadOlderButton from "@/components/LoadOlderButton.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { useDexieLiveQuery } from "@/composables/useDexieLiveQuery";
import { api, rememberRelayHint } from "@/lib/api";
import { bytesToBase64, getFileLabel } from "@/lib/chatUtils";
import { normalizeNostrPubkey, roboHashGroupUrl, roboHashUrl, shortId } from "@/lib/crypto";
import { groupsApi } from "@/lib/groups";
import {
  clearStagedUpload,
  getStagedUpload,
  getStoredGroup,
  listStoredGroupMessages,
  putDecCached,
  stageUpload,
} from "@/lib/idb";
import { logStartupOnce } from "@/lib/startupMetrics";
import { useChatMedia } from "@/composables/useChatMedia";
import { useChatRecorder } from "@/composables/useChatRecorder";
import { useProfileCache } from "@/composables/useProfileCache";
import { useIdentityStore } from "@/stores/identity";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const { displayName, profilePicture, prefetch } = useProfileCache();
const initPromise = identity.init();

const inputText = ref("");
const invitePubkey = ref("");
const syncing = ref(false);
const sending = ref(false);
const inviting = ref(false);
const rotatingKeys = ref(false);
const removingMember = ref("");
const uploadLoading = ref(false);
const uploadStatus = ref(null);
const error = ref("");
const initialSyncComplete = ref(false);
const drawerOpen = ref(false);
const msgsContainer = ref(null);
const loadingOlder = ref(false);
const hasMoreOlder = ref(true);
let pollTimer = null;
let liveSubscription = null;

const replyingTo = ref(null);

function cancelReply() {
  replyingTo.value = null;
}

function handleReply(message) {
  replyingTo.value = message;
}

async function handleLike(message) {
  await initPromise;
  if (!canCompose.value) return;

  error.value = "";
  try {
    await groupsApi.sendGroupMessage(identity, groupId.value, {
      type: "like",
      replyTo: message.id,
    });
  } catch (e) {
    error.value = e.message || "Unable to send reaction.";
  }
}

const groupId = computed(() => String(route.params.groupId || ""));
const { data: groupData, loading: groupLoading } = useDexieLiveQuery(
  () => (groupId.value ? getStoredGroup(groupId.value) : null),
  { deps: [() => groupId.value], initialValue: null },
);
const { data: messageRows, loading: messagesLoading } = useDexieLiveQuery(
  () => (groupId.value ? listStoredGroupMessages(groupId.value) : []),
  { deps: [() => groupId.value], initialValue: [] },
);

const group = computed(() => groupData.value);
const messages = computed(() => {
  const rows = messageRows.value || [];
  const active = [];
  const likeMap = new Map();

  for (const row of rows) {
    if (row.type === "like") {
      if (row.replyTo) {
        let likes = likeMap.get(row.replyTo);
        if (!likes) {
          likes = [];
          likeMap.set(row.replyTo, likes);
        }
        if (!likes.includes(row.sender)) {
          likes.push(row.sender);
        }
      }
    } else {
      active.push(row);
    }
  }

  return active.map((msg) => {
    const likes = likeMap.get(msg.id);
    if (likes) {
      return { ...msg, likes };
    }
    return msg;
  });
});
const loading = computed(
  () => groupLoading.value || messagesLoading.value || (!initialSyncComplete.value && !group.value),
);
const oldestTs = computed(() => Number(messages.value[0]?.ts || 0));
const groupAvatarUrl = computed(() =>
  roboHashGroupUrl(group.value?.groupId || groupId.value || "group"),
);
const groupMemberCount = computed(() =>
  Number(group.value?.memberCount || group.value?.members?.length || 0),
);
const groupAdminCount = computed(() => Number(group.value?.admins?.length || 0));
const selfPubkey = computed(() => normalizeNostrPubkey(identity.pubkeyHex) || "");
const isAdmin = computed(() =>
  Boolean(selfPubkey.value && group.value?.admins?.includes(selfPubkey.value)),
);
const isActiveMember = computed(
  () =>
    Boolean(selfPubkey.value && group.value?.members?.includes(selfPubkey.value)) &&
    !group.value?.removedAt,
);

watch(
  () => !loading.value,
  (ready) => {
    if (!ready) return;
    logStartupOnce("group-room-cache-ready", "group-room:cache-ready", {
      groupId: shortId(groupId.value),
      hasGroup: Boolean(group.value),
      messages: messages.value.length,
    });
  },
  { immediate: true },
);

const {
  mediaBlobUrls,
  mediaLoading,
  decryptFailed,
  rememberBlobUrl,
  preloadMedia,
  downloadMedia: _downloadMedia,
  cleanup: cleanupMedia,
} = useChatMedia();

async function downloadMedia(msg) {
  await initPromise;
  try {
    await _downloadMedia(msg);
  } catch (e) {
    error.value = e.message || "Unable to decrypt attachment.";
  }
}

const { isRecording, recordingSeconds, toggleVoiceRecording, cancelVoiceRecording } =
  useChatRecorder({
    onVoiceReady: async (rawBuf, mimeType, durationMs) => {
      uploadLoading.value = true;
      try {
        await postEncryptedMedia(rawBuf, {
          mimeType,
          fileName: `voice-note-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`,
          msgType: "voice",
          extra: { durationMs },
        });
      } catch (e) {
        error.value = e.message || "Unable to send voice note.";
      } finally {
        uploadLoading.value = false;
      }
    },
  });

async function handleToggleRecording() {
  error.value = "";
  try {
    await toggleVoiceRecording();
  } catch (e) {
    error.value = e.message || "Microphone access failed.";
  }
}

let uploadStatusTimer = null;

function setUploadStatus(status) {
  if (uploadStatusTimer) {
    clearTimeout(uploadStatusTimer);
    uploadStatusTimer = null;
  }
  uploadStatus.value = status;
}

function completeUploadStatus(server = "") {
  setUploadStatus({ phase: "done", server });
  uploadStatusTimer = setTimeout(() => {
    uploadStatus.value = null;
    uploadStatusTimer = null;
  }, 1400);
}

const canCompose = computed(
  () => isActiveMember.value && !sending.value && !uploadLoading.value && !isRecording.value,
);

const mentionableUsers = computed(() => {
  const members = group.value?.members || [];
  return members
    .filter((pk) => pk !== selfPubkey.value)
    .map((pk) => ({ pubkey: pk, name: displayName(pk), picture: profilePicture(pk) }))
    .filter((u) => Boolean(u.name));
});

const selfMentionHandle = computed(() => displayName(selfPubkey.value).replace(/\s+/g, ""));

const lastMentionId = computed(() => {
  if (!selfMentionHandle.value) return null;
  const re = new RegExp(`@${selfMentionHandle.value}(?:\\s|$|[^\\w])`, "i");
  const slice = messages.value.slice(-100);
  for (let i = slice.length - 1; i >= 0; i--) {
    const m = slice[i];
    if (m.sender !== selfPubkey.value && m.type === "text" && re.test(m.text || "")) {
      return m.id;
    }
  }
  return null;
});

const mentionDismissed = ref(false);

watch(lastMentionId, () => {
  mentionDismissed.value = false;
});

function jumpToMention() {
  if (!lastMentionId.value) return;
  const el = document.getElementById(`msg-${lastMentionId.value}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    mentionDismissed.value = true;
  }
}

function scrollBottom() {
  nextTick(() => {
    if (msgsContainer.value) msgsContainer.value.scrollTop = msgsContainer.value.scrollHeight;
  });
}

watch(
  messages,
  (rows, previousRows = []) => {
    for (const message of rows) {
      preloadMedia(message);
    }

    const nextLastId = rows.at(-1)?.id;
    const previousLastId = previousRows.at(-1)?.id;
    if (
      !previousRows.length ||
      (nextLastId && nextLastId !== previousLastId && !loadingOlder.value)
    ) {
      scrollBottom();
    }
  },
  { immediate: true },
);

function parseInviteTarget(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("gupt-group:")) {
    const decoded = JSON.parse(atob(trimmed.slice("gupt-group:".length)));
    return {
      pubkey: normalizeNostrPubkey(decoded?.pubkey),
      relays: Array.isArray(decoded?.relays) ? decoded.relays : [],
    };
  }

  if (trimmed.startsWith("{")) {
    const decoded = JSON.parse(trimmed);
    return {
      pubkey: normalizeNostrPubkey(decoded?.pubkey),
      relays: Array.isArray(decoded?.relays) ? decoded.relays : [],
    };
  }

  return {
    pubkey: normalizeNostrPubkey(trimmed),
    relays: [],
  };
}

async function refresh() {
  await initPromise;
  syncing.value = true;
  error.value = "";
  try {
    await groupsApi.syncGroup(identity, groupId.value);
  } catch (e) {
    error.value = e.message || "Unable to sync group.";
  } finally {
    syncing.value = false;
  }
}

const missingGroupMessage = computed(() => {
  if (loading.value || group.value) return "";
  return (
    error.value ||
    "This group is not in local storage yet. Go back and refresh your groups, or reopen the invite first."
  );
});

async function loadOlderMessages() {
  await initPromise;
  if (!oldestTs.value || loadingOlder.value) return;
  loadingOlder.value = true;
  try {
    const result = await groupsApi.loadOlderGroupMessages(identity, groupId.value, oldestTs.value);
    if (!result.hasMore) {
      hasMoreOlder.value = false;
    }
  } catch (e) {
    error.value = e.message || "Unable to load older messages.";
  } finally {
    loadingOlder.value = false;
  }
}

async function sendTextMessage() {
  await initPromise;
  const text = inputText.value.trim();
  if (!text || !canCompose.value) return;

  error.value = "";
  inputText.value = "";
  sending.value = true;
  const replyMeta = replyingTo.value
    ? {
        replyTo: replyingTo.value.id,
        replyExcerpt: getFileLabel(replyingTo.value) || replyingTo.value.text?.slice(0, 40) || "",
      }
    : {};
  replyingTo.value = null;
  try {
    await groupsApi.sendGroupMessage(identity, groupId.value, { type: "text", text, ...replyMeta });
  } catch (e) {
    error.value = e.message || "Unable to send message.";
    inputText.value = text;
  } finally {
    sending.value = false;
  }
}

async function inviteMember() {
  await initPromise;
  if (!isAdmin.value) {
    error.value = "Only group admins can invite members.";
    return;
  }
  let target;
  try {
    target = parseInviteTarget(invitePubkey.value);
  } catch {
    error.value = "Enter a valid public key or group contact string.";
    return;
  }

  const pubkey = target?.pubkey;
  if (!pubkey) {
    error.value = "Enter a valid public key or group contact string.";
    return;
  }

  inviting.value = true;
  error.value = "";
  try {
    await Promise.all(
      (target.relays || []).map((relay) => rememberRelayHint(relay).catch(() => null)),
    );
    await groupsApi.inviteToGroup(identity, groupId.value, { pubkey, relays: target.relays || [] });
    invitePubkey.value = "";
  } catch (e) {
    error.value = e.message || "Unable to send invite.";
  } finally {
    inviting.value = false;
  }
}

async function rotateGroupKeys() {
  await initPromise;
  if (!isAdmin.value) {
    error.value = "Only group admins can rotate keys.";
    return;
  }

  rotatingKeys.value = true;
  error.value = "";
  try {
    await groupsApi.rotateGroupEpoch(identity, groupId.value);
  } catch (e) {
    error.value = e.message || "Unable to rotate group keys.";
  } finally {
    rotatingKeys.value = false;
  }
}

async function removeMemberFromGroup(memberPubkey) {
  await initPromise;
  if (!isAdmin.value) {
    error.value = "Only group admins can remove members.";
    return;
  }

  const targetPubkey = normalizeNostrPubkey(memberPubkey);
  if (!targetPubkey || targetPubkey === selfPubkey.value) return;
  if (
    !window.confirm(
      `Remove ${displayName(targetPubkey)} from this group and rotate to a new epoch?`,
    )
  ) {
    return;
  }

  removingMember.value = targetPubkey;
  error.value = "";
  try {
    await groupsApi.removeMember(identity, groupId.value, targetPubkey);
  } catch (e) {
    error.value = e.message || "Unable to remove member.";
  } finally {
    removingMember.value = "";
  }
}

function startPolling() {
  pollTimer = setInterval(refresh, 5000);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function startLiveSubscription() {
  await initPromise;
  if (!groupId.value) return;

  stopLiveSubscription();
  try {
    liveSubscription = await groupsApi.subscribeGroupMessages(
      identity,
      groupId.value,
      {
        next() {},
        error(subscriptionError) {
          error.value = subscriptionError.message || "Realtime relay subscription failed.";
        },
      },
      Date.now() - 5000,
    );
  } catch (e) {
    error.value = e.message || "Unable to start realtime group sync.";
  }
}

function stopLiveSubscription() {
  liveSubscription?.unsubscribe?.();
  liveSubscription = null;
}

async function postEncryptedMedia(rawBuf, { mimeType, fileName, msgType, extra = {} }) {
  await initPromise;
  const tempKey = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  setUploadStatus({ phase: "encrypting", server: "" });
  const mediaKey = crypto.getRandomValues(new Uint8Array(32));
  const mediaNonce = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey("raw", mediaKey, "AES-GCM", false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: mediaNonce },
    cryptoKey,
    rawBuf,
  );

  await stageUpload(tempKey, encrypted);

  try {
    const staged = (await getStagedUpload(tempKey)) || encrypted;
    const encryptedFile = new File([staged], `${fileName}.enc`, {
      type: "application/octet-stream",
    });
    const uploaded = await api.uploadFile(encryptedFile, {
      onProgress(update) {
        setUploadStatus({ phase: "uploading", server: update.server || "" });
      },
    });
    if (!uploaded.locations || !uploaded.locations.some((l) => l?.ok)) {
      throw new Error("Upload failed: no successful upload locations.");
    }

    const replyMeta = replyingTo.value
      ? {
          replyTo: replyingTo.value.id,
          replyExcerpt: getFileLabel(replyingTo.value) || replyingTo.value.text?.slice(0, 40) || "",
        }
      : {};
    replyingTo.value = null;

    const nextMessages = await groupsApi.sendGroupMessage(identity, groupId.value, {
      type: msgType,
      text: fileName,
      media: {
        key: bytesToBase64(mediaKey),
        nonce: bytesToBase64(mediaNonce),
        mime: mimeType || "application/octet-stream",
        name: fileName,
        size: rawBuf.byteLength,
        locations: (uploaded.locations || [])
          .filter((l) => l?.ok)
          .map((loc) => ({
            type: loc.type || "",
            url: loc.url || "",
            cid: loc.cid || "",
            sha256: loc.sha256 || "",
          })),
      },
      durationMs: Number(extra.durationMs || 0),
      ...replyMeta,
    });

    const latestMessage = [...nextMessages]
      .reverse()
      .find(
        (message) =>
          message.sender === selfPubkey.value && message?.media?.key === bytesToBase64(mediaKey),
      );
    if (latestMessage) {
      await putDecCached(latestMessage.id, rawBuf, mimeType || "application/octet-stream");
      rememberBlobUrl(latestMessage.id, rawBuf, mimeType || "application/octet-stream");
    }

    completeUploadStatus(uploaded.server || "");
  } finally {
    await clearStagedUpload(tempKey).catch(() => {});
  }
}

async function handleFileSelected(file) {
  await initPromise;
  if (!file) return;
  error.value = "";
  uploadLoading.value = true;
  try {
    const rawBuf = await file.arrayBuffer();
    await postEncryptedMedia(rawBuf, {
      mimeType: file.type || "application/octet-stream",
      fileName: file.name,
      msgType: "media",
    });
  } catch (err) {
    error.value = err.message || "Unable to upload attachment.";
  } finally {
    uploadLoading.value = false;
  }
}

onMounted(async () => {
  await initPromise;
  const hasCachedGroup = Boolean(group.value);
  const refreshPromise = refresh();

  if (hasCachedGroup) {
    initialSyncComplete.value = true;
  } else {
    await refreshPromise;
    initialSyncComplete.value = true;
  }

  void startLiveSubscription();
  startPolling();
});

onBeforeUnmount(() => {
  if (uploadStatusTimer) clearTimeout(uploadStatusTimer);
  stopLiveSubscription();
  stopPolling();
  cancelVoiceRecording();
  cleanupMedia();
});
</script>

<template>
  <div class="relative flex flex-col h-dvh lg:h-full bg-black text-white">
    <!-- Chat header -->
    <div class="px-4 py-3 border-b border-white/7 flex items-center justify-between gap-3 shrink-0">
      <div class="flex items-center gap-3 min-w-0">
        <button
          @click="router.push('/')"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors lg:hidden"
          title="Back"
        >
          <ArrowLeft class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
        </button>
        <RoboAvatar :src="groupAvatarUrl" :alt="group?.name || 'Group'" size="md" />
        <div class="min-w-0">
          <p class="text-sm font-semibold truncate">{{ group?.name || "Group" }}</p>
          <p class="text-[11px] text-zinc-500 truncate">
            {{ groupMemberCount }} member{{ groupMemberCount !== 1 ? "s" : "" }}
            <span v-if="group?.currentEpoch"> · epoch {{ group.currentEpoch }}</span>
          </p>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button
          @click="refresh"
          :disabled="syncing"
          class="flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-zinc-300 transition-colors hover:bg-white/14 hover:text-white disabled:opacity-50"
          title="Sync"
        >
          <RefreshCw
            class="h-4 w-4"
            :class="syncing ? 'animate-spin' : ''"
            :stroke-width="1.8"
            aria-hidden="true"
          />
        </button>
        <button
          @click="drawerOpen = !drawerOpen"
          class="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          :class="
            drawerOpen
              ? 'bg-white/15 text-white'
              : 'bg-white/8 text-zinc-300 hover:bg-white/14 hover:text-white'
          "
          title="Members"
        >
          <Users class="h-4 w-4" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Main content area -->
    <div class="flex flex-1 min-h-0">
      <!-- Chat panel (always visible) -->
      <section class="flex flex-1 min-h-0 min-w-0 flex-col">
        <div v-if="loading" class="flex flex-1 items-center justify-center text-sm text-zinc-600">
          Loading group…
        </div>

        <div v-else-if="missingGroupMessage" class="flex flex-1 items-center justify-center px-6">
          <div class="max-w-sm space-y-3 text-center">
            <p class="text-sm text-red-400">{{ missingGroupMessage }}</p>
          </div>
        </div>

        <div v-else ref="msgsContainer" class="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div class="flex flex-col items-center gap-2 py-6 mb-2 text-center">
            <RoboAvatar
              :src="groupAvatarUrl"
              :alt="group?.name || 'Group'"
              size="xxl"
              rounded="3xl"
            />
            <p class="text-base font-semibold">{{ group?.name || "Group" }}</p>
            <p class="text-xs text-zinc-500">
              Private wrapped inbox delivery · Epoch-based membership
            </p>
            <p v-if="group?.description" class="max-w-md text-xs leading-relaxed text-zinc-600">
              {{ group.description }}
            </p>
            <div
              class="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1 text-[11px] text-zinc-500"
            >
              <Shield class="h-3.5 w-3.5" :stroke-width="1.8" aria-hidden="true" />
              {{ groupMemberCount }} members · epoch {{ group?.currentEpoch || 1 }}
            </div>
          </div>

          <AppAlertBanner v-if="error" :message="error" class="mb-3" />
          <AppAlertBanner
            v-if="group?.removedAt && !isActiveMember"
            message="You were removed from this group. History remains available, but you cannot read new epochs or send messages."
            class="mb-3"
          />
          <div v-if="!messages.length" class="py-10 text-center text-sm text-zinc-600">
            No messages yet. Start the thread.
          </div>

          <LoadOlderButton
            v-if="hasMoreOlder && oldestTs"
            :loading="loadingOlder"
            @click="loadOlderMessages"
          />

          <div v-for="message in messages" :key="message.id" :id="'msg-' + message.id">
            <ChatMessageBubble
              :message="message"
              :mine="message.sender === selfPubkey"
              :blob-url="mediaBlobUrls[message.id] || null"
              :is-loading="!!mediaLoading[message.id]"
              :has-failed="!!decryptFailed[message.id]"
              :show-sender-name="true"
              :sender-name="displayName(message.sender)"
              :sender-avatar="profilePicture(message.sender) || roboHashUrl(message.sender)"
              :self-handle="selfMentionHandle"
              @download="downloadMedia"
              @reply="handleReply"
              @like="handleLike"
            />
          </div>
        </div>

        <!-- Mention jump bar -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-2"
        >
          <div
            v-if="lastMentionId && !mentionDismissed"
            class="flex shrink-0 items-center justify-between gap-2 bg-amber-500/10 px-3.5 py-2"
          >
            <button
              @click="jumpToMention"
              class="flex items-center gap-2 text-xs font-semibold text-amber-300 transition-colors hover:text-amber-200"
            >
              <AtSign class="h-3.5 w-3.5 shrink-0" :stroke-width="2" aria-hidden="true" />
              You were mentioned — tap to jump
            </button>
            <button
              @click="mentionDismissed = true"
              class="p-0.5 text-amber-500 transition-colors hover:text-amber-300"
              aria-label="Dismiss mention"
            >
              <X class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
        </Transition>

        <ChatComposeBar
          v-model="inputText"
          :disabled="!isActiveMember || uploadLoading"
          :is-recording="isRecording"
          :recording-seconds="recordingSeconds"
          :upload-status="uploadStatus"
          :mentionable-users="mentionableUsers"
          :replying-to="replyingTo"
          @send="sendTextMessage"
          @file-selected="handleFileSelected"
          @toggle-recording="handleToggleRecording"
          @cancel-recording="cancelVoiceRecording"
          @cancel-reply="cancelReply"
        />
      </section>

      <!-- Members drawer -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-full opacity-0"
      >
        <aside
          v-if="drawerOpen"
          class="members-drawer shrink-0 border-l border-white/7 overflow-y-auto bg-black"
        >
          <!-- Drawer header -->
          <div
            class="sticky top-0 z-10 flex items-center justify-between bg-black/95 px-4 py-3 backdrop-blur-sm"
          >
            <h3 class="text-sm font-semibold">Members</h3>
            <button
              @click="drawerOpen = false"
              class="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>

          <!-- Invite section (admin only) -->
          <section v-if="isAdmin" class="px-4 py-4 space-y-3">
            <p class="text-xs font-semibold text-zinc-400">Invite Member</p>
            <input
              v-model="invitePubkey"
              placeholder="Public key or contact"
              class="w-full rounded-full bg-white/8 px-3 py-2 text-xs placeholder-zinc-600 focus:bg-white/12 focus:outline-none"
            />
            <PrimaryButton @click="inviteMember" :loading="inviting" class="text-xs">
              <UserPlus class="h-3.5 w-3.5" :stroke-width="1.9" aria-hidden="true" />
              {{ inviting ? "Inviting…" : "Send Invite" }}
            </PrimaryButton>
          </section>

          <!-- Security section (admin only) -->
          <section v-if="isAdmin" class="px-4 py-4 space-y-3">
            <p class="text-xs font-semibold text-zinc-400">Security</p>
            <PrimaryButton @click="rotateGroupKeys" :loading="rotatingKeys" class="text-xs">
              <Shield class="h-3.5 w-3.5" :stroke-width="1.9" aria-hidden="true" />
              {{ rotatingKeys ? "Rotating…" : "Rotate Epoch" }}
            </PrimaryButton>
            <p class="text-[11px] text-zinc-600 leading-relaxed">
              Moves future messages to a new private epoch.
            </p>
          </section>

          <!-- Admins list -->
          <section v-if="group?.admins?.length" class="px-4 py-4 space-y-2">
            <p class="text-xs font-semibold text-zinc-400">
              Admins
              <span class="text-zinc-600">{{ group.admins.length }}</span>
            </p>
            <div
              v-for="admin in group.admins"
              :key="admin"
              class="-mx-1 flex cursor-pointer items-center gap-2.5 rounded-xl px-1 py-1.5 transition-colors hover:bg-white/5 active:bg-white/10"
              @click="router.push('/profile/' + admin)"
            >
              <RoboAvatar
                :pubkey="admin"
                :src="profilePicture(admin)"
                size="sm"
                :hoverable="true"
              />
              <div class="min-w-0">
                <p class="truncate text-xs font-semibold">{{ displayName(admin) }}</p>
                <p class="truncate font-mono text-[10px] text-zinc-600">{{ shortId(admin) }}</p>
              </div>
            </div>
          </section>

          <!-- Members list -->
          <section v-if="group?.members?.length" class="px-4 py-4 space-y-2">
            <p class="text-xs font-semibold text-zinc-400">
              Members
              <span class="text-zinc-600">{{ group.members.length }}</span>
            </p>
            <div
              v-for="member in group.members"
              :key="member"
              class="-mx-1 flex items-center gap-2.5 rounded-xl px-1 py-1.5 transition-colors hover:bg-white/5 active:bg-white/10"
              :class="member !== selfPubkey ? 'cursor-pointer' : ''"
              @click="member !== selfPubkey && router.push('/profile/' + member)"
            >
              <RoboAvatar
                :pubkey="member"
                :src="profilePicture(member)"
                size="sm"
                :hoverable="member !== selfPubkey"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-semibold">
                  {{ member === selfPubkey ? "You" : displayName(member) }}
                </p>
                <p class="truncate font-mono text-[10px] text-zinc-600">{{ shortId(member) }}</p>
              </div>
              <button
                v-if="isAdmin && member !== selfPubkey"
                class="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                :disabled="removingMember === member"
                @click.stop="removeMemberFromGroup(member)"
              >
                {{ removingMember === member ? "…" : "Remove" }}
              </button>
            </div>
          </section>
        </aside>
      </Transition>
    </div>

    <!-- Mobile drawer overlay -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="drawerOpen"
        class="fixed inset-0 z-40 bg-black/60 lg:hidden"
        @click="drawerOpen = false"
      />
    </Transition>
  </div>
</template>

<style scoped>
.members-drawer {
  width: 280px;
}

/* Mobile: drawer is a fixed overlay from the right */
@media (max-width: 1023px) {
  .members-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    width: min(320px, 85vw);
  }
}

@media (min-width: 1280px) {
  .members-drawer {
    width: 300px;
  }
}
</style>
