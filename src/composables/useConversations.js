import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useIdentityStore } from "@/stores/identity";
import { useProfileCache } from "@/composables/useProfileCache";
import { shortId } from "@/lib/crypto";
import { logStartupOnce } from "@/lib/startupMetrics";
import { messenger } from "@/stores/messenger";
import { startAppSync, reconcileFromRelays } from "@/lib/sync";
import { countUnreadMessages, tsOf } from "@/lib/chatListUtils";

const PINNED_KEY = "gupt_pinned_chats";

export function useConversations() {
  const route = useRoute();
  const router = useRouter();
  const identity = useIdentityStore();
  const { displayName, profilePicture, prefetch } = useProfileCache();

  const searchActive = ref(false);
  const pinnedIds = ref(new Set(JSON.parse(localStorage.getItem(PINNED_KEY) || "[]")));

  function markRoomSeen(id) {
    if (!id) return;
    if (route.path.startsWith("/room/")) {
      void messenger.markConversationSeen(id);
      return;
    }
    if (route.path.startsWith("/groups/")) {
      void messenger.markGroupSeen(id);
    }
  }

  function togglePin(roomId) {
    const next = new Set(pinnedIds.value);
    if (next.has(roomId)) next.delete(roomId);
    else next.add(roomId);
    pinnedIds.value = next;
    localStorage.setItem(PINNED_KEY, JSON.stringify([...next]));
  }

  const activeId = computed(() => {
    if (route.path.startsWith("/room/")) return String(route.params.roomId || "");
    if (route.path.startsWith("/groups/")) return String(route.params.groupId || "");
    return "";
  });

  watch(activeId, (id) => markRoomSeen(id), { immediate: true });

  const initPromise = identity.init().then(() => {
    void startAppSync(identity);
  });

  const { data: rooms, loading: roomsLoading } = (() => {
    const data = computed(() => Object.values(messenger.roomMeta));
    const loading = computed(() => !messenger.hydratedInbox.value);
    return { data, loading };
  })();
  const { data: groupRows, loading: groupsLoading } = (() => {
    const data = computed(() => Object.values(messenger.groupMeta));
    const loading = computed(() => !messenger.hydratedInbox.value);
    return { data, loading };
  })();

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

  async function refreshGroups() {
    try {
      await reconcileFromRelays(identity);
    } catch {
      
    }
  }

  function peerPubkeyForRoom(room) {
    if (room?.peerPubkey) return room.peerPubkey;
    const rows = messenger.roomMessages[room?.roomId] || [];
    return (
      rows.find((row) => row.peerPubkey)?.peerPubkey ||
      rows.find((row) => !row.mine && row.sender)?.sender ||
      ""
    );
  }

  function roomDisplayName(room) {
    const peer = peerPubkeyForRoom(room);
    if (room?.type === "dm" && peer) return displayName(peer);
    if (peer) return displayName(peer);
    return room?.name || "Unnamed room";
  }

  function roomSecondaryLabel(room) {
    if (room.lastMessageText) {
      const prefix = room.lastMessageMine ? "You: " : "";
      return prefix + room.lastMessageText.slice(0, 45);
    }
    if (room?.type === "dm" && room?.peerPubkey) return shortId(room.peerPubkey);
    return `${room.roomId.slice(0, 20)}…`;
  }

  function lastMessageTsForRoom(room) {
    const fromMeta = Number(room?.lastMessageTs || 0);
    if (fromMeta) return fromMeta;
    const rows = messenger.roomMessages[room?.roomId] || [];
    if (!rows.length) return 0;
    return rows.reduce((latest, row) => Math.max(latest, tsOf(row)), 0);
  }

  function roomAgeLabel(room) {
    const ts = lastMessageTsForRoom(room);
    if (!ts) return "";
    const diff = Date.now() - ts;
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

  function roomUnreadCount(room) {
    const persisted = Number(room.unreadCount || 0);
    if (persisted > 0) return persisted;
    const seen = Number(room.lastSeenTs || 0);
    const fallback = room.lastMessageTs > seen && !room.lastMessageMine ? 1 : 0;
    return countUnreadMessages(messenger.roomMessages[room.roomId], seen, fallback);
  }

  function groupUnreadCount(group) {
    const persisted = Number(group.unreadCount || 0);
    if (persisted > 0) return persisted;
    const seen = Number(group.lastSeenTs || 0);
    const fallback = group.lastMessageTs > seen ? 1 : 0;
    return countUnreadMessages(messenger.groupMessages[group.groupId], seen, fallback);
  }

  const inboxLoading = computed(() => !messenger.hydratedInbox.value);

  const conversations = computed(() => {
    const dms = rooms.value.map((room) => {
      const msgs = messenger.roomMessages[room.roomId] || [];
      let sentCount = 0;
      for (const m of msgs) {
        if (m.mine) sentCount++;
        if (sentCount >= 7) break;
      }
      return {
        id: room.roomId,
        roomId: room.roomId,
        peerPubkey: peerPubkeyForRoom(room) || room.peerPubkey || "",
        displayName: roomDisplayName(room),
        secondaryLabel: roomSecondaryLabel(room),
        ageLabel: roomAgeLabel(room),
        avatarSrc: peerPubkeyForRoom(room) ? profilePicture(peerPubkeyForRoom(room)) : "",
        fallbackInitial: room.name?.charAt(0) || "#",
        profileTitle: peerPubkeyForRoom(room) ? profileTitle(roomDisplayName(room)) : "",
        pinned: pinnedIds.value.has(room.roomId),
        unreadCount: roomUnreadCount(room),
        lastMessageMine: room.lastMessageMine ?? false,
        lastMessageTs: lastMessageTsForRoom(room),
        isTrusted: sentCount >= 7,
        isGroup: false,
      };
    });

    const grps = groups.value.map((group) => ({
      id: group.groupId,
      roomId: group.groupId,
      isGroup: true,
      avatarKey: group.groupId || group.name,
      displayName: group.name,
      secondaryLabel: group.description || groupSecondaryLabel(group),
      fallbackInitial: group.name?.charAt(0) || "#",
      peerPubkey: null,
      pinned: pinnedIds.value.has(group.groupId),
      unreadCount: groupUnreadCount(group),
      lastMessageTs: Number(group.lastMessageTs || 0),
      isTrusted: true,
      ageLabel: roomAgeLabel({ lastMessageTs: Number(group.lastMessageTs || 0) }),
    }));

    return [...dms, ...grps].sort((a, b) => {
      const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      if (pinDiff !== 0) return pinDiff;
      return b.lastMessageTs - a.lastMessageTs;
    });
  });

  const unreadTotal = computed(() =>
    conversations.value.reduce((sum, c) => sum + (c.unreadCount > 0 ? 1 : 0), 0),
  );

  function groupSecondaryLabel(group) {
    return `${group.memberCount} member${group.memberCount !== 1 ? "s" : ""} · ${shortId(group.groupId)}`;
  }

  function openRoom(conv) {
    if (conv.isGroup) {
      router.push(`/groups/${conv.roomId}`);
    } else {
      router.push(`/room/${conv.roomId}`);
    }
  }

  function openProfile(pubkey) {
    router.push(`/profile/${pubkey}`);
  }

  return {
    initPromise,
    activeId,
    searchActive,
    pinnedIds,
    conversations,
    unreadTotal,
    inboxLoading,
    refreshGroups,
    togglePin,
    markRoomSeen,
    openRoom,
    openProfile,
  };
}
