<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { MessageCircle, Search, X } from "@lucide/vue";
import { useRouter } from "vue-router";

import RoboAvatar from "@/components/RoboAvatar.vue";
import { useProfileStore } from "@/stores/profiles";
import { formatTime } from "@/lib/chatUtils";
import { escapeHtml } from "@/lib/escapeHtml";
import { roboHashGroupUrl, roboHashUrl, shortId } from "@/lib/crypto";
import { listRoomMeta, listStoredGroups, searchMessages } from "@/lib/idb";

const emit = defineEmits(["active-change"]);

const router = useRouter();
const { displayName, prefetch } = useProfileStore();

const query = ref("");
const results = ref({ dm: [], group: [] });
const roomMetaMap = ref(new Map());
const groupMap = ref(new Map());
const searching = ref(false);
const inputEl = ref(null);

const isActive = computed(() => Boolean(query.value.trim()));
const hasResults = computed(() => results.value.dm.length + results.value.group.length > 0);
const totalCount = computed(() => results.value.dm.length + results.value.group.length);

let debounceTimer = null;

async function loadLookupMaps() {
  const [rooms, groups] = await Promise.all([listRoomMeta(), listStoredGroups()]);
  roomMetaMap.value = new Map(rooms.map((room) => [room.roomId, room]));
  groupMap.value = new Map(groups.map((group) => [group.groupId, group]));

  const peerPubkeys = rooms.map((room) => room.peerPubkey).filter(Boolean);
  if (peerPubkeys.length) void prefetch(peerPubkeys);
}

function onGlobalKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    inputEl.value?.focus();
  }
}

onMounted(async () => {
  window.addEventListener("keydown", onGlobalKeydown);
  await loadLookupMaps();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
  clearTimeout(debounceTimer);
});

watch(
  isActive,
  (active) => {
    emit("active-change", active);
  },
  { immediate: true },
);

watch(query, (value) => {
  clearTimeout(debounceTimer);

  if (!value.trim()) {
    results.value = { dm: [], group: [] };
    searching.value = false;
    return;
  }

  searching.value = true;
  debounceTimer = setTimeout(async () => {
    results.value = await searchMessages(value.trim());
    searching.value = false;

    const senderPubkeys = [
      ...results.value.dm.map((row) => row.sender),
      ...results.value.group.map((row) => row.sender),
    ].filter(Boolean);
    if (senderPubkeys.length) void prefetch([...new Set(senderPubkeys)]);
  }, 250);
});

function clearSearch() {
  query.value = "";
  inputEl.value?.focus();
}

function highlight(text, currentQuery) {
  const safeText = escapeHtml(text);
  if (!currentQuery) return safeText;
  const escapedQuery = currentQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safeText.replace(
    new RegExp(`(${escapedQuery})`, "gi"),
    '<mark class="rounded px-0.5 bg-sky-400/25 text-sky-200">$1</mark>',
  );
}

function dmRoomName(roomId) {
  const meta = roomMetaMap.value.get(roomId);
  if (meta?.peerPubkey) return displayName(meta.peerPubkey);
  return `Room ${roomId.slice(0, 8)}…`;
}

function dmRoomAvatar(roomId) {
  const meta = roomMetaMap.value.get(roomId);
  return meta?.peerPubkey ? roboHashUrl(meta.peerPubkey) : null;
}

function dmRoomShortId(roomId) {
  const meta = roomMetaMap.value.get(roomId);
  return meta?.peerPubkey ? shortId(meta.peerPubkey) : roomId.slice(0, 12);
}

function groupName(groupId) {
  return groupMap.value.get(groupId)?.name || `Group ${groupId.slice(0, 8)}…`;
}

function openDm(roomId) {
  router.push(`/room/${roomId}`);
}

function openGroup(groupId) {
  router.push(`/groups/${groupId}`);
}
</script>

<template>
  <section>
    <!-- Vercel/Geist search input -->
    <div class="relative flex items-center">
      <Search
        class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500"
        :stroke-width="2"
        aria-hidden="true"
      />
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        placeholder="Search messages by keyword or sender…"
        autocomplete="off"
        spellcheck="false"
        class="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950/80 pl-9 pr-14 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 focus:outline-none transition-all shadow-xs"
      />
      <div
        v-if="!query"
        class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5"
      >
        <kbd
          class="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500"
          >⌘K</kbd
        >
      </div>
      <button
        v-else
        @click="clearSearch"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 cursor-pointer p-0.5"
        aria-label="Clear search"
      >
        <X class="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>

    <!-- Search results -->
    <div v-if="searching" class="py-5 text-center text-xs text-zinc-500 font-mono">Searching…</div>

    <div
      v-else-if="isActive && !hasResults"
      class="flex flex-col items-center justify-center gap-1.5 px-4 py-8 text-center"
    >
      <p class="text-xs text-zinc-400">
        No results for "<span class="text-white font-medium">{{ query }}</span
        >"
      </p>
      <p class="text-[11px] text-zinc-600">
        Only cached text messages on this device are searched.
      </p>
    </div>

    <template v-else-if="isActive && hasResults">
      <div class="flex items-center justify-between px-1 pt-3 pb-1.5">
        <p class="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
          {{ totalCount }} result{{ totalCount !== 1 ? "s" : "" }}
        </p>
      </div>

      <template v-if="results.dm.length">
        <div class="px-1 pt-1 pb-1">
          <p class="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
            Direct messages
          </p>
        </div>
        <button
          v-for="message in results.dm"
          :key="message.id"
          @click="openDm(message.roomId)"
          class="flex w-full items-start gap-3 p-2.5 text-left rounded-lg border border-transparent hover:border-zinc-800 hover:bg-zinc-900/50 transition-all cursor-pointer"
        >
          <RoboAvatar
            v-if="dmRoomAvatar(message.roomId)"
            :src="dmRoomAvatar(message.roomId)"
            size="md"
            rounded="lg"
            class="mt-0.5"
          />
          <div
            v-else
            class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900"
          >
            <MessageCircle class="h-4 w-4 text-zinc-500" :stroke-width="1.5" aria-hidden="true" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="mb-0.5 flex items-center justify-between gap-2">
              <p class="truncate text-xs font-semibold text-zinc-200">
                {{ dmRoomName(message.roomId) }}
              </p>
              <span class="shrink-0 font-mono text-[10px] text-zinc-500 tabular-nums">{{
                formatTime(message.ts)
              }}</span>
            </div>
            <p class="mb-1 truncate font-mono text-[10px] text-zinc-600">
              {{ dmRoomShortId(message.roomId) }}
            </p>
            <p
              class="line-clamp-2 text-xs leading-relaxed text-zinc-400"
              v-html="highlight(message.text, query)"
            />
          </div>
        </button>
      </template>

      <template v-if="results.group.length">
        <div class="px-1 pt-3 pb-1">
          <p class="text-[10px] font-mono uppercase tracking-wider text-zinc-600">Groups</p>
        </div>
        <button
          v-for="message in results.group"
          :key="message.key"
          @click="openGroup(message.groupId)"
          class="flex w-full items-start gap-3 p-2.5 text-left rounded-lg border border-transparent hover:border-zinc-800 hover:bg-zinc-900/50 transition-all cursor-pointer"
        >
          <RoboAvatar
            :src="roboHashGroupUrl(message.groupId)"
            :alt="groupName(message.groupId)"
            size="md"
            rounded="lg"
            class="mt-0.5"
          />
          <div class="min-w-0 flex-1">
            <div class="mb-0.5 flex items-center justify-between gap-2">
              <p class="truncate text-xs font-semibold text-zinc-200">
                {{ groupName(message.groupId) }}
              </p>
              <span class="shrink-0 font-mono text-[10px] text-zinc-500 tabular-nums">{{
                formatTime(message.ts)
              }}</span>
            </div>
            <p class="mb-1 truncate font-mono text-[10px] text-zinc-600">
              {{ displayName(message.sender) }}
            </p>
            <p
              class="line-clamp-2 text-xs leading-relaxed text-zinc-400"
              v-html="highlight(message.text, query)"
            />
          </div>
        </button>
      </template>
    </template>
  </section>
</template>
