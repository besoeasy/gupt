<script setup>
import { computed, onMounted, ref, watch, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import ChatSearchPanel from "@/components/chat/ChatSearchPanel.vue";
import HomeCreatePanel from "@/components/home/HomeCreatePanel.vue";
import HomeInboxSection from "@/components/home/HomeInboxSection.vue";
import HomeQuickActions from "@/components/home/HomeQuickActions.vue";
import { useDexieLiveQuery } from "@/composables/useDexieLiveQuery";
import { useIdentityStore } from "@/stores/identity";
import { useProfileCache } from "@/composables/useProfileCache";
import { dmRoomId, shortId, normalizeNostrPubkey } from "@/lib/crypto";
import { api } from "@/lib/api";
import { groupsApi } from "@/lib/groups";
import { listRoomMeta, listStoredGroups, putRoomMeta } from "@/lib/idb";
import { logStartupOnce } from "@/lib/startupMetrics";
import { startAppSync, syncGroups } from "@/lib/sync";
import { readConfiguredRetentionMs } from "@/config/retention";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const { displayName, profilePicture, prefetch } = useProfileCache();

const copied = ref(false);
const inviteCopied = ref(false);
const dmPubkey = ref("");
const openingDm = ref(false);
const saving = ref(false);
const error = ref("");
const name = ref("");
const description = ref("");
const activeCreatePanel = ref("");
const repliedPeerPubkeys = ref(new Set());
const activeTab = ref("messages");
const searchActive = ref(false);

const activeId = computed(() => {
  if (route.path.startsWith("/room/")) return String(route.params.roomId || "");
  if (route.path.startsWith("/groups/")) return String(route.params.groupId || "");
  return "";
});

const initPromise = identity.init().then(() => {
  void startAppSync(identity);
});

const { data: rooms, loading: roomsLoading } = useDexieLiveQuery(() => listRoomMeta(), {
  initialValue: [],
});
const { data: groupRows, loading: groupsLoading } = useDexieLiveQuery(() => listStoredGroups(), {
  initialValue: [],
});

watch(
  () => !roomsLoading.value && !groupsLoading.value,
  (ready) => {
    if (!ready) return;
    logStartupOnce("home-cache-ready", "home:cache-ready", {
      rooms: rooms.value.length,
      groups: groupRows.value.length,
    });
  },
  { immediate: true },
);

watch(
  rooms,
  (newRooms) => {
    const peerPubkeys = newRooms.filter((r) => r.peerPubkey).map((r) => r.peerPubkey);
    if (peerPubkeys.length) void prefetch(peerPubkeys);
  },
  { immediate: true },
);

const groups = computed(() =>
  groupRows.value.map((group) => ({
    ...group,
    memberCount: Array.isArray(group?.members) ? group.members.length : 0,
  })),
);

const inviteLink = computed(() => {
  if (!identity.pubkeyHex) return "";
  if (typeof window === "undefined") return `/#/profile/${identity.pubkeyHex}`;
  const base = window.location.origin + (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}/#/profile/${identity.pubkeyHex}`;
});

async function hydrateCachedRooms() {
  const cachedRooms = await listRoomMeta().catch(() => []);
  repliedPeerPubkeys.value = new Set(
    cachedRooms
      .filter((entry) => entry?.replied && entry?.peerPubkey)
      .map((entry) => entry.peerPubkey),
  );
}

async function refreshKnownPeers() {
  try {
    const [{ peers, sentToPeers }, incoming] = await Promise.all([
      api.listDirectPeers(identity.pubkeyHex),
      api.getIncomingDirectMessages(identity.privkeyHex, identity.pubkeyHex),
    ]);
    const latestIncomingByPeer = new Map();

    for (const message of incoming.messages) {
      if (!message?.sender || message.mine) continue;
      const nextTs = Number(message.ts || message.created_at || 0);
      const currentTs = Number(latestIncomingByPeer.get(message.sender) || 0);
      if (nextTs > currentTs) latestIncomingByPeer.set(message.sender, nextTs);
    }

    repliedPeerPubkeys.value = sentToPeers;

    for (const peerPubkey of peers) {
      const roomId = await dmRoomId(identity.pubkeyHex, peerPubkey);
      const roomName = `DM · ${shortId(peerPubkey)}`;
      await putRoomMeta(roomId, {
        peerPubkey,
        name: roomName,
        type: "dm",
        replied: sentToPeers.has(peerPubkey),
        lastMessageTs: latestIncomingByPeer.get(peerPubkey) || 0,
      });
    }
  } catch {
    // Relay inbox discovery is best effort.
  }
}

async function refreshGroups() {
  try {
    await syncGroups(identity);
  } catch {
    // Keep the last local projection visible if the refresh fails.
  }
}

onMounted(async () => {
  await initPromise;
  await hydrateCachedRooms();
  void refreshKnownPeers();
  void refreshGroups();
});

function flashCopied(state) {
  state.value = true;
  setTimeout(() => (state.value = false), 1500);
}

function copyPubkey() {
  navigator.clipboard.writeText(identity.pubkeyHex);
  flashCopied(copied);
}

async function copyInviteLink() {
  if (!inviteLink.value) return;
  await navigator.clipboard.writeText(inviteLink.value);
  flashCopied(inviteCopied);
}

function roomDisplayName(room) {
  if (room?.type === "dm" && room?.peerPubkey) return displayName(room.peerPubkey);
  return room?.name || "Unnamed room";
}

function roomSecondaryLabel(room) {
  if (room?.type === "dm" && room?.peerPubkey) return shortId(room.peerPubkey);
  return `${room.roomId.slice(0, 20)}…`;
}

function roomAgeLabel(room) {
  if (!room.lastMessageTs) return "";
  const diff = Date.now() - room.lastMessageTs;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function profileTitle(pName) {
  return `View ${pName}\u2019s profile`;
}

const dmConversations = computed(() =>
  rooms.value.filter((r) => !r.peerPubkey || repliedPeerPubkeys.value.has(r.peerPubkey)),
);

const dmRequests = computed(() => {
  const cutoff = Date.now() - readConfiguredRetentionMs();
  return rooms.value.filter(
    (r) =>
      r.peerPubkey &&
      !repliedPeerPubkeys.value.has(r.peerPubkey) &&
      r.lastMessageTs > 0 &&
      r.lastMessageTs >= cutoff,
  );
});

const messageItems = computed(() =>
  dmConversations.value.map((room) => ({
    id: room.roomId,
    roomId: room.roomId,
    peerPubkey: room.peerPubkey || "",
    displayName: roomDisplayName(room),
    secondaryLabel: roomSecondaryLabel(room),
    ageLabel: roomAgeLabel(room),
    avatarSrc: room.peerPubkey ? profilePicture(room.peerPubkey) : "",
    fallbackInitial: room.name?.charAt(0) || "#",
    profileTitle: room.peerPubkey ? profileTitle(roomDisplayName(room)) : "",
  })),
);

const requestItems = computed(() =>
  dmRequests.value.map((room) => ({
    id: room.roomId,
    roomId: room.roomId,
    peerPubkey: room.peerPubkey || "",
    displayName: roomDisplayName(room),
    secondaryLabel: roomSecondaryLabel(room),
    avatarSrc: room.peerPubkey ? profilePicture(room.peerPubkey) : "",
    profileTitle: room.peerPubkey ? profileTitle(roomDisplayName(room)) : "",
  })),
);

const groupItems = computed(() =>
  groups.value.map((group) => ({
    id: group.groupId,
    groupId: group.groupId,
    avatarKey: group.groupId || group.name,
    displayName: group.name,
    secondaryLabel: group.description || groupSecondaryLabel(group),
  })),
);

// Pick an initial tab once both rooms and groups have loaded — only once
const initialTabSet = ref(false);
watch(
  () => !roomsLoading.value && !groupsLoading.value,
  (ready) => {
    if (!ready || initialTabSet.value) return;
    initialTabSet.value = true;
    const hasMessages = dmConversations.value?.length > 0;
    const hasGroups = groups.value?.length > 0;
    const hasRequests = dmRequests.value?.length > 0;
    if (hasMessages) activeTab.value = "messages";
    else if (hasGroups) activeTab.value = "groups";
    else if (hasRequests) activeTab.value = "requests";
  },
  { immediate: true },
);

function groupSecondaryLabel(group) {
  return `${group.memberCount} member${group.memberCount !== 1 ? "s" : ""} · ${shortId(group.groupId)}`;
}

function toggleCreatePanel(panel) {
  activeCreatePanel.value = activeCreatePanel.value === panel ? "" : panel;
  error.value = "";
}

function openRoom(roomId) {
  router.push(`/room/${roomId}`);
}

function openGroup(groupId) {
  router.push(`/groups/${groupId}`);
}

function openProfile(pubkey) {
  router.push(`/profile/${pubkey}`);
}

async function createGroup() {
  await initPromise;
  error.value = "";
  if (!name.value.trim()) {
    error.value = "Enter a group name.";
    return;
  }

  saving.value = true;
  try {
    const group = await groupsApi.createGroup(identity, {
      name: name.value.trim(),
      description: description.value.trim(),
    });
    name.value = "";
    description.value = "";
    void refreshGroups();
    router.push(`/groups/${group.groupId}`);
  } catch (e) {
    error.value = e.message || "Unable to create group.";
  } finally {
    saving.value = false;
  }
}

async function createDM() {
  await initPromise;
  error.value = "";
  const peerPubkey = normalizeNostrPubkey(dmPubkey.value);
  if (!peerPubkey) {
    error.value =
      "Enter a valid public key. Both 64-char x-only and 66-char compressed keys are accepted.";
    return;
  }
  if (peerPubkey === identity.pubkeyHex) {
    error.value = "Use a different public key for the conversation.";
    return;
  }

  openingDm.value = true;
  try {
    const roomId = await dmRoomId(identity.pubkeyHex, peerPubkey);
    await putRoomMeta(roomId, {
      peerPubkey,
      name: `DM · ${shortId(peerPubkey)}`,
      type: "dm",
    });
    dmPubkey.value = "";
    router.push(`/room/${roomId}`);
  } catch (e) {
    error.value = e.message;
  } finally {
    openingDm.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-black text-white">
    <!-- Fixed header: title bar + search + compose panel -->
    <div class="shrink-0 px-4 pt-3 pb-2 space-y-3">
      <HomeQuickActions
        :active-panel="activeCreatePanel"
        :copied="copied"
        :invite-copied="inviteCopied"
        @toggle-panel="toggleCreatePanel"
        @copy-id="copyPubkey"
        @copy-invite="copyInviteLink"
      />

      <ChatSearchPanel @active-change="searchActive = $event" />

      <HomeCreatePanel
        :active-panel="activeCreatePanel"
        :dm-pubkey="dmPubkey"
        :name="name"
        :description="description"
        :opening-dm="openingDm"
        :saving="saving"
        @update:dm-pubkey="dmPubkey = $event"
        @update:name="name = $event"
        @update:description="description = $event"
        @create-dm="createDM"
        @create-group="createGroup"
      />

      <AppAlertBanner v-if="error" :message="error" />
    </div>

    <!-- Scrollable chat list -->
    <div class="flex-1 overflow-y-auto px-4 pb-3">
      <HomeInboxSection
        v-model:active-tab="activeTab"
        :active-id="activeId"
        :search-active="searchActive"
        :messages="messageItems"
        :groups="groupItems"
        :requests="requestItems"
        @open-room="openRoom"
        @open-group="openGroup"
        @open-profile="openProfile"
        @refresh-groups="refreshGroups"
      />
    </div>
  </div>
</template>
