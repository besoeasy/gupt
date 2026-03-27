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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
const messageLimit = ref(50);
const { data: messageRows, loading: messagesLoading } = useDexieLiveQuery(
  () => (groupId.value ? listStoredGroupMessages(groupId.value, messageLimit.value) : []),
  { deps: [() => groupId.value, () => messageLimit.value], initialValue: [] },
);

const group = computed(() => groupData.value);
const messages = computed(() => messageRows.value.filter((m) => m.type !== "reaction"));
const reactionsByMessage = computed(() => {
  const grouped = {};
  for (const m of messageRows.value) {
    if (m.type === "reaction" && m.targetId) {
      if (!grouped[m.targetId]) grouped[m.targetId] = [];
      grouped[m.targetId].push(m);
    }
  }
  return grouped;
});
const loading = computed(
  () => groupLoading.value || messagesLoading.value || (!initialSyncComplete.value && !group.value),
);
const oldestTs = computed(() => Number(messageRows.value[0]?.ts || 0));

const composeBar = ref(null);

const replyingTo = ref(null);
function handleReply(msg) {
  replyingTo.value = msg;
  composeBar.value?.focusInput?.();
}
function cancelReply() {
  replyingTo.value = null;
}

async function handleReact(messageId, reactionText = "❤️") {
  await initPromise;
  if (!canCompose.value) return;

  const now = Date.now();
  const payload = {
    type: "reaction",
    targetId: messageId,
    reaction: reactionText,
    reactor: identity.pubkeyHex,
    ts: now,
  };

  try {
    await groupsApi.sendGroupMessage(identity, groupId.value, payload);
  } catch (e) {
    error.value = e.message || "Unable to send reaction.";
  }
}
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
  requestAnimationFrame(() => {
    if (msgsContainer.value) {
      msgsContainer.value.scrollTop = msgsContainer.value.scrollHeight;
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
    }
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
    const payload = { type: "text", text };
    if (replyingTo.value) {
      payload.replyTo = replyingTo.value.id;
      payload.replyPreview = {
        sender: displayName(replyingTo.value.sender),
        text:
          replyingTo.value.type === "text" ? replyingTo.value.text : `[${replyingTo.value.type}]`,
      };
      replyingTo.value = null;
    }
    await groupsApi.sendGroupMessage(identity, groupId.value, payload);
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

    const payload = {
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
    };

    if (replyingTo.value) {
      payload.replyTo = replyingTo.value.id;
      payload.replyPreview = {
        sender: displayName(replyingTo.value.sender),
        text:
          replyingTo.value.type === "text" ? replyingTo.value.text : `[${replyingTo.value.type}]`,
      };
      replyingTo.value = null;
    }

    const nextMessages = await groupsApi.sendGroupMessage(identity, groupId.value, payload);

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
  <div class="w-full max-w-7xl mx-auto flex-1 flex flex-col relative h-[100dvh]">
    <!-- Header -->
    <header
      class="sticky top-[57px] z-30 flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background/90 px-4 backdrop-blur-xl"
    >
      <div class="flex min-w-0 items-center gap-3">
        <button
          @click="router.push('/')"
          class="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          title="Back to messages"
        >
          <ArrowLeft class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
        </button>
        <div class="flex min-w-0 items-center gap-2.5">
          <RoboAvatar :src="groupAvatarUrl" :alt="group?.name || 'Group'" size="sm" />
          <div class="flex min-w-0 flex-col">
            <span class="truncate text-sm font-semibold leading-tight">{{
              group?.name || "Group"
            }}</span>
            <div class="flex items-center gap-1.5">
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              <span class="truncate text-[10px] font-medium text-muted-foreground">
                {{ groupMemberCount }} member{{ groupMemberCount !== 1 ? "s" : "" }}
                <template v-if="group?.currentEpoch">· epoch {{ group.currentEpoch }}</template>
              </span>
            </div>
          </div>
        </div>
      </div>

      <button
        @click="refresh"
        :disabled="syncing"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/80 px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-50"
      >
        <RefreshCw
          class="h-3.5 w-3.5"
          :class="syncing ? 'animate-spin' : ''"
          :stroke-width="1.8"
          aria-hidden="true"
        />
        <span class="hidden sm:inline">{{ syncing ? "Syncing…" : "Sync" }}</span>
      </button>
    </header>

    <main class="flex w-full flex-1 flex-col">
      <Tabs
        :default-value="activeMobilePanel"
        @update:model-value="activeMobilePanel = $event"
        class="w-full flex-1 flex flex-col min-h-0"
      >
        <div
          class="px-4 py-2 border-b border-border bg-background/95 backdrop-blur-sm sticky top-14 z-20"
        >
          <TabsList class="w-auto flex justify-start">
            <TabsTrigger value="chat" class="gap-2 px-6">
              <MessageCircle class="w-4 h-4" /> Chat
            </TabsTrigger>
            <TabsTrigger value="people" class="gap-2 px-6">
              <UserPlus class="w-4 h-4" /> People
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent
          value="people"
          class="flex-1 flex-col m-0 outline-none data-[state=inactive]:hidden data-[state=active]:flex"
        >
          <!-- People panel -->
          <section v-if="isAdmin" class="border-b border-border px-4 py-4 space-y-3">
            <p class="text-sm font-semibold">Invite Member</p>
            <input
              v-model="invitePubkey"
              placeholder="Public key or group contact"
              class="w-full bg-background border border-border rounded-2xl px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none"
            />
            <PrimaryButton @click="inviteMember" :loading="inviting">
              <UserPlus class="w-4 h-4" :stroke-width="1.9" aria-hidden="true" />
              {{ inviting ? "Inviting…" : "Send Invite" }}
            </PrimaryButton>
            <p class="text-zinc-600 text-xs">
              Invites publish a new private membership snapshot and rotate the group epoch.
            </p>
          </section>

          <section v-if="isAdmin" class="border-b border-border px-4 py-4 space-y-3">
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
          <section v-if="group?.admins?.length" class="border-b border-border px-4 py-4 space-y-3">
            <p class="text-sm font-semibold">Admins</p>
            <div
              v-for="admin in group.admins"
              :key="admin"
              class="flex items-center gap-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors -mx-1 px-1 py-1 cursor-pointer"
              @click="router.push('/profile/' + admin)"
            >
              <RoboAvatar
                :pubkey="admin"
                :src="profilePicture(admin)"
                size="md"
                :hoverable="true"
              />
              <div class="min-w-0">
                <p class="text-sm font-semibold truncate">{{ displayName(admin) }}</p>
                <p class="text-[11px] text-muted-foreground font-mono truncate">
                  {{ shortId(admin) }}
                </p>
              </div>
            </div>
          </section>

          <!-- Members -->
          <section v-if="group?.members?.length" class="border-b border-border px-4 py-4 space-y-3">
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
                <p class="text-[11px] text-muted-foreground font-mono truncate">
                  {{ shortId(member) }}
                </p>
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
        </TabsContent>
        <!-- Chat panel -->
        <TabsContent
          value="chat"
          :class="activeMobilePanel === 'chat' ? 'flex' : 'hidden'"
          class="order-1 flex flex-1 min-h-0 min-w-0 flex-col bg-background relative"
        >
          <div v-if="loading" class="flex-1 flex items-center justify-center text-zinc-600 text-sm">
            Loading group…
          </div>

          <div v-else-if="missingGroupMessage" class="flex-1 flex items-center justify-center px-6">
            <div class="text-center space-y-3 max-w-sm">
              <p class="text-red-400 text-sm">{{ missingGroupMessage }}</p>
            </div>
          </div>

          <div
            v-else
            ref="msgsContainer"
            class="flex-1 overflow-y-auto px-3 py-4 space-y-1 pb-6 relative"
          >
            <div class="flex flex-col items-center gap-2 py-6 mb-2 text-center">
              <RoboAvatar
                :src="groupAvatarUrl"
                :alt="group?.name || 'Group'"
                size="xxl"
                rounded="3xl"
              />
              <p class="text-base font-semibold">{{ group?.name || "Group" }}</p>
              <p class="text-xs text-muted-foreground">
                Private wrapped inbox delivery · Epoch-based membership
              </p>
              <p v-if="group?.description" class="max-w-md text-xs leading-relaxed text-zinc-600">
                {{ group.description }}
              </p>
              <div
                class="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-[11px] text-muted-foreground"
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
                :reactions="reactionsByMessage[message.id] || []"
                @download="downloadMedia"
                @reply="handleReply"
                @react="handleReact"
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
            ref="composeBar"
            class="sticky bottom-0 z-30"
            v-model="inputText"
            :disabled="!isActiveMember || uploadLoading"
            :is-recording="isRecording"
            :recording-seconds="recordingSeconds"
            :upload-status="uploadStatus"
            :mentionable-users="mentionableUsers"
            :replying-to="replyingTo"
            @cancel-reply="cancelReply"
            @send="sendTextMessage"
            @file-selected="handleFileSelected"
            @toggle-recording="handleToggleRecording"
            @cancel-recording="cancelVoiceRecording"
          />
        </TabsContent>
      </Tabs>
    </main>
  </div>
</template>
