<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { MessageCircle, Search, X } from "lucide-vue-next";
import { useRouter } from "vue-router";

import RoboAvatar from "@/components/RoboAvatar.vue";
import { useProfileCache } from "@/composables/useProfileCache";
import { formatTime } from "@/lib/chatUtils";
import { roboHashGroupUrl, roboHashUrl, shortId } from "@/lib/crypto";
import { listRoomMeta, listStoredGroups, searchMessages } from "@/lib/idb";

const emit = defineEmits(["active-change"]);

const router = useRouter();
const { displayName, prefetch } = useProfileCache();

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

onMounted(async () => {
  await loadLookupMaps();
});

onUnmounted(() => {
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
  if (!currentQuery) return text;
  const escaped = currentQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(text || "").replace(
    new RegExp(`(${escaped})`, "gi"),
    '<mark class="rounded px-0.5 bg-emerald-400/25 text-emerald-100">$1</mark>',
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
  <section class="px-2 sm:px-4 py-2 sm:py-3">
    <div class="relative flex items-center">
      <Search
        class="pointer-events-none absolute left-3 h-5 w-5 text-zinc-400 group-focus-within:text-emerald-400 transition-colors"
        :stroke-width="2.2"
        aria-hidden="true"
      />
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        placeholder="Search cached messages…"
        autocomplete="off"
        spellcheck="false"
        class="w-full rounded-md sm:rounded-xl border border-zinc-700 bg-zinc-900/70 pl-10 pr-10 py-2 text-sm text-white placeholder-zinc-500 transition-colors focus:border-emerald-400 focus:bg-zinc-900/80 focus:outline-none"
      />
      <button
        v-if="query"
        @click="clearSearch"
        class="absolute right-3 text-zinc-500 hover:text-emerald-400 transition-colors"
        aria-label="Clear search"
      >
        <X class="h-5 w-5" :stroke-width="2.5" aria-hidden="true" />
      </button>
    </div>

    <div v-if="searching" class="py-5 text-center text-sm text-zinc-500">Searching…</div>

    <div
      v-else-if="isActive && !hasResults"
      class="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center"
    >
      <p class="text-sm text-zinc-400">
        No results for "<span class="text-zinc-200">{{ query }}</span
        >"
      </p>
      <p class="text-xs text-zinc-600">Only cached text messages on this device are searched.</p>
    </div>

    <template v-else-if="isActive && hasResults">
      <div class="flex items-center justify-between px-1 pt-4 pb-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {{ totalCount }} result{{ totalCount !== 1 ? "s" : "" }}
        </p>
      </div>

      <template v-if="results.dm.length">
        <div class="px-1 pt-1 pb-2">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
            Direct messages
          </p>
        </div>
        <button
          v-for="message in results.dm"
          :key="message.id"
          @click="openDm(message.roomId)"
          class="flex w-full items-start gap-3 border-b border-white/4 px-1 py-3 text-left transition-colors hover:bg-white/4 active:bg-white/7"
        >
          <RoboAvatar
            v-if="dmRoomAvatar(message.roomId)"
            :src="dmRoomAvatar(message.roomId)"
            size="md"
            rounded="xl"
            class="mt-0.5"
          />
          <div
            v-else
            class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800"
          >
            <MessageCircle class="h-5 w-5 text-zinc-600" :stroke-width="1.5" aria-hidden="true" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="mb-0.5 flex items-center justify-between gap-2">
              <p class="truncate text-sm font-semibold">{{ dmRoomName(message.roomId) }}</p>
              <span class="shrink-0 text-[11px] text-zinc-600">{{ formatTime(message.ts) }}</span>
            </div>
            <p class="mb-1 truncate font-mono text-xs text-zinc-500">
              {{ dmRoomShortId(message.roomId) }}
            </p>
            <p
              class="line-clamp-2 text-xs leading-relaxed text-zinc-300"
              v-html="highlight(message.text, query)"
            />
          </div>
        </button>
      </template>

      <template v-if="results.group.length">
        <div class="px-1 pt-4 pb-2">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Groups</p>
        </div>
        <button
          v-for="message in results.group"
          :key="message.key"
          @click="openGroup(message.groupId)"
          class="flex w-full items-start gap-3 border-b border-white/4 px-1 py-3 text-left transition-colors hover:bg-white/4 active:bg-white/7"
        >
          <RoboAvatar
            :src="roboHashGroupUrl(message.groupId)"
            :alt="groupName(message.groupId)"
            size="md"
            rounded="xl"
            class="mt-0.5"
          />
          <div class="min-w-0 flex-1">
            <div class="mb-0.5 flex items-center justify-between gap-2">
              <p class="truncate text-sm font-semibold">{{ groupName(message.groupId) }}</p>
              <span class="shrink-0 text-[11px] text-zinc-600">{{ formatTime(message.ts) }}</span>
            </div>
            <p class="mb-1 truncate font-mono text-xs text-zinc-500">
              {{ displayName(message.sender) }}
            </p>
            <p
              class="line-clamp-2 text-xs leading-relaxed text-zinc-300"
              v-html="highlight(message.text, query)"
            />
          </div>
        </button>
      </template>
    </template>
  </section>
</template>
