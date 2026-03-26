<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  ArrowLeft,
  AtSign,
  MessageCircle,
  RefreshCw,
  Shield,
  UserPlus,
  Users,
  X,
} from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import ChatComposeBar from "@/components/chat/ChatComposeBar.vue";
import ChatMessageBubble from "@/components/chat/ChatMessageBubble.vue";
import LoadOlderButton from "@/components/LoadOlderButton.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { useDexieLiveQuery } from "@/composables/useDexieLiveQuery";
import { api, rememberRelayHint } from "@/lib/api";
import { bytesToBase64 } from "@/lib/chatUtils";
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
import { startAppSync } from "@/lib/sync";
import { useChatMedia } from "@/composables/useChatMedia";
import { useChatRecorder } from "@/composables/useChatRecorder";
import { useProfileCache } from "@/composables/useProfileCache";
import { useIdentityStore } from "@/stores/identity";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const { displayName, profilePicture, prefetch } = useProfileCache();
const initPromise = identity.init().then(() => {
  void startAppSync(identity);
});

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
const activeMobilePanel = ref("chat");
const msgsContainer = ref(null);
const loadingOlder = ref(false);
const hasMoreOlder = ref(true);
let pollTimer = null;
let liveSubscription = null;

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
const messages = computed(() => messageRows.value);
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

// Members eligible for @-mention: all members except self
// Names with spaces become spaceless handles (e.g. "Luca The Reaper" → @LucaTheReaper)
const mentionableUsers = computed(() => {
  const members = group.value?.members || [];
  return members
    .filter((pk) => pk !== selfPubkey.value)
    .map((pk) => ({ pubkey: pk, name: displayName(pk), picture: profilePicture(pk) }))
    .filter((u) => Boolean(u.name));
});

// Spaceless handle for the current user — used to detect incoming @-mentions
const selfMentionHandle = computed(() => displayName(selfPubkey.value).replace(/\s+/g, ""));

// Find the id of the most recent message in the last 100 that mentions the current user
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
  inputText.value = ""; // clear optimistically before relay round-trip
  sending.value = true;
  try {
    await groupsApi.sendGroupMessage(identity, groupId.value, text);
  } catch (e) {
    error.value = e.message || "Unable to send message.";
    inputText.value = text; // restore on failure
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
        next() {
          // Dexie live queries update the UI; no local state mutation needed here.
        },
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

    const nextMessages = await groupsApi.sendGroupMessage(identity, groupId.value, {
      type: msgType,
      text: fileName,
      media: {
        key: bytesToBase64(mediaKey),
        nonce: bytesToBase64(mediaNonce),
        mime: mimeType || "application/octet-stream",
        name: fileName,
        size: rawBuf.byteLength,
        locations: uploaded.locations.map((loc) => ({
          server: loc.server || "",
          type: loc.type || "",
          ok: Boolean(loc.ok),
          url: loc.url || "",
          cid: loc.cid || "",
          sha256: loc.sha256 || "",
          method: loc.method || "",
          raw: loc.raw || null,
        })),
      },
      durationMs: Number(extra.durationMs || 0),
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
  <div class="flex flex-col h-dvh bg-black text-white">
    <!-- Sub-header -->
    <div class="border-b border-white/7 shrink-0">
      <div
        class="flex w-full flex-wrap items-center gap-2 bg-black px-4 py-2 text-xs text-zinc-500 sm:flex-nowrap"
      >
        <button
          @click="router.push('/')"
          class="-ml-1 h-8 w-8 flex items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors shrink-0"
          title="Back to messages"
        >
          <ArrowLeft class="w-4 h-4" :stroke-width="1.9" aria-hidden="true" />
        </button>
        <span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
        <span v-if="group" class="shrink-0 flex-1"
          >{{ group.memberCount }} member{{ group.memberCount !== 1 ? "s" : ""
          }}<span v-if="group.currentEpoch"> · epoch {{ group.currentEpoch }}</span></span
        >
      </div>
    </div>

    <!-- Mobile tab bar -->
    <div class="border-b border-white/7 shrink-0">
      <div class="flex w-full">
        <button
          @click="activeMobilePanel = 'chat'"
          :class="
            activeMobilePanel === 'chat'
              ? 'text-white border-b-2 border-white'
              : 'text-zinc-500 border-b-2 border-transparent'
          "
          class="flex-1 inline-flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-colors"
        >
          <MessageCircle class="w-4 h-4" :stroke-width="1.8" aria-hidden="true" />
          Chat
        </button>
        <button
          @click="activeMobilePanel = 'people'"
          :class="
            activeMobilePanel === 'people'
              ? 'text-white border-b-2 border-white'
              : 'text-zinc-500 border-b-2 border-transparent'
          "
          class="flex-1 inline-flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-colors"
        >
          <UserPlus class="w-4 h-4" :stroke-width="1.8" aria-hidden="true" />
          People
        </button>
      </div>
    </div>

    <main class="flex w-full flex-1 min-h-0 flex-col">
      <aside
        :class="activeMobilePanel === 'chat' ? 'hidden' : 'flex'"
        class="order-2 min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <!-- People panel -->
        <section
          v-if="isAdmin"
          :class="activeMobilePanel === 'people' ? 'block' : 'hidden'"
          class="border-b border-white/7 px-4 py-4 space-y-3"
        >
          <p class="text-sm font-semibold">Invite Member</p>
          <input
            v-model="invitePubkey"
            placeholder="Public key or group contact"
            class="w-full bg-black border border-white/7 rounded-2xl px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none"
          />
          <PrimaryButton @click="inviteMember" :loading="inviting">
            <UserPlus class="w-4 h-4" :stroke-width="1.9" aria-hidden="true" />
            {{ inviting ? "Inviting…" : "Send Invite" }}
          </PrimaryButton>
          <p class="text-zinc-600 text-xs">
            Invites publish a new private membership snapshot and rotate the group epoch.
          </p>
        </section>

        <section
          v-if="isAdmin"
          :class="activeMobilePanel === 'people' ? 'block' : 'hidden'"
          class="border-b border-white/7 px-4 py-4 space-y-3"
        >
          <p class="text-sm font-semibold">Security</p>
          <PrimaryButton @click="rotateGroupKeys" :loading="rotatingKeys">
            <Shield class="w-4 h-4" :stroke-width="1.9" aria-hidden="true" />
            {{ rotatingKeys ? "Rotating…" : "Rotate Group Epoch" }}
          </PrimaryButton>
          <p class="text-zinc-600 text-xs">
            Rotation moves all future messages to a new private epoch without changing the room
            identity.
          </p>
        </section>

        <!-- Admins -->
        <section
          v-if="group?.admins?.length"
          :class="activeMobilePanel === 'people' ? 'block' : 'hidden'"
          class="border-b border-white/7 px-4 py-4 space-y-3"
        >
          <p class="text-sm font-semibold">Admins</p>
          <div
            v-for="admin in group.admins"
            :key="admin"
            class="flex items-center gap-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors -mx-1 px-1 py-1 cursor-pointer"
            @click="router.push('/profile/' + admin)"
          >
            <RoboAvatar :pubkey="admin" :src="profilePicture(admin)" size="md" :hoverable="true" />
            <div class="min-w-0">
              <p class="text-sm font-semibold truncate">{{ displayName(admin) }}</p>
              <p class="text-[11px] text-zinc-500 font-mono truncate">{{ shortId(admin) }}</p>
            </div>
          </div>
        </section>

        <!-- Members -->
        <section
          v-if="group?.members?.length"
          :class="activeMobilePanel === 'people' ? 'block' : 'hidden'"
          class="border-b border-white/7 px-4 py-4 space-y-3"
        >
          <p class="text-sm font-semibold">Members</p>
          <div
            v-for="member in group.members"
            :key="member"
            class="flex items-center gap-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors -mx-1 px-1 py-1"
            :class="member !== selfPubkey ? 'cursor-pointer' : ''"
            @click="member !== selfPubkey && router.push('/profile/' + member)"
          >
            <RoboAvatar
              :pubkey="member"
              :src="profilePicture(member)"
              size="md"
              :hoverable="member !== selfPubkey"
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold truncate">
                {{ member === selfPubkey ? "You" : displayName(member) }}
              </p>
              <p class="text-[11px] text-zinc-500 font-mono truncate">{{ shortId(member) }}</p>
            </div>
            <button
              v-if="isAdmin && member !== selfPubkey"
              class="shrink-0 rounded-full border border-red-500/20 px-2.5 py-1 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              :disabled="removingMember === member"
              @click.stop="removeMemberFromGroup(member)"
            >
              {{ removingMember === member ? "Removing…" : "Remove" }}
            </button>
          </div>
        </section>
      </aside>

      <!-- Chat panel -->
      <section
        :class="activeMobilePanel === 'chat' ? 'flex' : 'hidden'"
        class="order-1 flex flex-1 min-h-0 min-w-0 flex-col bg-black"
      >
        <!-- Chat header -->
        <div
          class="px-4 py-4 border-b border-white/7 flex items-start justify-between gap-3 shrink-0"
        >
          <div class="flex items-center gap-3 min-w-0">
            <RoboAvatar :src="groupAvatarUrl" :alt="group?.name || 'Group'" size="lg" />
            <div class="min-w-0">
              <p class="text-base font-semibold truncate">{{ group?.name || "Group" }}</p>
              <p class="text-xs text-zinc-500 truncate">
                {{ groupMemberCount }} member{{ groupMemberCount !== 1 ? "s" : "" }}
                <span v-if="groupAdminCount">
                  · {{ groupAdminCount }} admin{{ groupAdminCount !== 1 ? "s" : "" }}</span
                >
                <span v-if="group?.currentEpoch"> · epoch {{ group.currentEpoch }}</span>
              </p>
              <p v-if="group?.description" class="text-xs text-zinc-600 truncate mt-1">
                {{ group.description }}
              </p>
            </div>
          </div>
          <button
            @click="refresh"
            :disabled="syncing"
            class="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900/80 px-3 py-1.5 text-xs text-[#0095f6] font-semibold disabled:opacity-50 shrink-0"
          >
            <RefreshCw
              class="w-3.5 h-3.5"
              :class="syncing ? 'animate-spin' : ''"
              :stroke-width="1.8"
              aria-hidden="true"
            />
            {{ syncing ? "Syncing…" : "Sync" }}
          </button>
        </div>

        <div v-if="loading" class="flex-1 flex items-center justify-center text-zinc-600 text-sm">
          Loading group…
        </div>

        <div v-else-if="missingGroupMessage" class="flex-1 flex items-center justify-center px-6">
          <div class="text-center space-y-3 max-w-sm">
            <p class="text-red-400 text-sm">{{ missingGroupMessage }}</p>
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
              class="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-zinc-950/60 px-3 py-1 text-[11px] text-zinc-500"
            >
              <Shield class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />
              {{ groupMemberCount }} members · epoch {{ group?.currentEpoch || 1 }}
            </div>
          </div>

          <AppAlertBanner v-if="error" :message="error" class="mb-3" />
          <AppAlertBanner
            v-if="group?.removedAt && !isActiveMember"
            message="You were removed from this group. History remains available, but you cannot read new epochs or send messages."
            class="mb-3"
          />
          <div v-if="!messages.length" class="text-zinc-600 text-sm text-center py-10">
            No messages yet. Start the thread.
          </div>

          <!-- Load older messages button -->
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
            class="shrink-0 flex items-center justify-between gap-2 px-3.5 py-2 bg-amber-950/80 border-t border-amber-500/25 backdrop-blur-sm"
          >
            <button
              @click="jumpToMention"
              class="flex items-center gap-2 text-amber-300 text-xs font-semibold hover:text-amber-200 transition-colors"
            >
              <AtSign class="w-3.5 h-3.5 shrink-0" :stroke-width="2" aria-hidden="true" />
              You were mentioned — tap to jump
            </button>
            <button
              @click="mentionDismissed = true"
              class="text-amber-500 hover:text-amber-300 transition-colors p-0.5"
              aria-label="Dismiss mention"
            >
              <X class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />
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
          @send="sendTextMessage"
          @file-selected="handleFileSelected"
          @toggle-recording="handleToggleRecording"
          @cancel-recording="cancelVoiceRecording"
        />
      </section>
    </main>
  </div>
</template>
