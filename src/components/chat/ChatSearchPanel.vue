<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { MessageCircle, Search, X, Calendar, Clock, History } from "@lucide/vue";
import { useRouter } from "vue-router";

import RoboAvatar from "@/components/RoboAvatar.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
import { useProfileStore } from "@/stores/profiles";
import { formatTime } from "@/lib/chatUtils";
import { escapeHtml } from "@/lib/escapeHtml";
import { messagePlainText } from "@/lib/messageFormat";
import { roboHashGroupUrl, roboHashUrl, shortId } from "@/lib/crypto";
import { groupDisplayName } from "@/lib/groupIdentity";
import { listRoomMeta, listStoredGroups, searchMessages } from "@/lib/idb";

const emit = defineEmits(["active-change"]);

const router = useRouter();
const { displayName, prefetch } = useProfileStore();

const DEFAULT_SEARCH_DAYS = 10;
const query = ref("");
const results = ref({ dm: [], group: [] });
const roomMetaMap = ref(new Map());
const groupMap = ref(new Map());
const searching = ref(false);
const inputEl = ref(null);
const searchAllHistory = ref(false);
const hasOlderMatches = ref(false);
const olderMatchesCount = ref(0);

const isActive = computed(() => Boolean(query.value.trim()));
const hasResults = computed(() => results.value.dm.length + results.value.group.length > 0);
const totalCount = computed(() => results.value.dm.length + results.value.group.length);

let debounceTimer = null;
let searchToken = 0;

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

async function runSearch(value) {
  const token = ++searchToken;
  const trimmed = value.trim();
  if (!trimmed) {
    results.value = { dm: [], group: [] };
    hasOlderMatches.value = false;
    olderMatchesCount.value = 0;
    searching.value = false;
    return;
  }

  searching.value = true;
  try {
    const sinceTs = searchAllHistory.value
      ? null
      : Date.now() - DEFAULT_SEARCH_DAYS * 24 * 60 * 60 * 1000;

    const hits = await searchMessages(trimmed, {
      sinceTs,
      limitPerContact: 30,
    });

    if (token !== searchToken) return;

    const dm = hits.filter((h) => Boolean(h.roomId));
    const group = hits.filter((h) => Boolean(h.groupId));
    results.value = { dm, group };

    // If searching limited window, probe if older matches exist
    if (!searchAllHistory.value) {
      const allHits = await searchMessages(trimmed, { sinceTs: null });
      if (token === searchToken) {
        olderMatchesCount.value = Math.max(0, allHits.length - hits.length);
        hasOlderMatches.value = olderMatchesCount.value > 0;
      }
    } else {
      hasOlderMatches.value = false;
      olderMatchesCount.value = 0;
    }

    const senderPubkeys = [...dm.map((r) => r.sender), ...group.map((r) => r.sender)].filter(
      Boolean,
    );
    if (senderPubkeys.length) void prefetch([...new Set(senderPubkeys)]);
  } catch {
    results.value = { dm: [], group: [] };
  } finally {
    if (token === searchToken) searching.value = false;
  }
}

watch([query, searchAllHistory], ([q]) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runSearch(q), 200);
});

function toggleSearchHistory() {
  searchAllHistory.value = !searchAllHistory.value;
}

function clearSearch() {
  query.value = "";
  searchAllHistory.value = false;
  inputEl.value?.focus();
}

function highlight(text, currentQuery) {
  const safeText = escapeHtml(text);
  if (!currentQuery) return safeText;
  const escapedQuery = currentQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safeText.replace(
    new RegExp(`(${escapedQuery})`, "gi"),
    '<mark class="rounded px-0.5 bg-emerald-500/25 text-emerald-200 font-medium">$1</mark>',
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
  return groupDisplayName(groupId, [...groupMap.value.keys()]);
}

function openDm(roomId) {
  const meta = roomMetaMap.value.get(roomId);
  const target = meta?.peerPubkey || roomId;
  router.push(`/chat/dm:${target}`);
}

function openGroup(groupId) {
  router.push(`/chat/group:${groupId}`);
}
</script>

<template>
  <section class="space-y-2">
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
        placeholder="Search last messages across contacts…"
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
        class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 cursor-pointer p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
        aria-label="Clear search"
      >
        <X class="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>

    <!-- Interactive History Stretch Banner (AGENTS.md touch target >= 44px) -->
    <div
      v-if="isActive"
      class="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-1 text-xs transition-colors"
    >
      <div class="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400 min-w-0">
        <Clock v-if="!searchAllHistory" class="h-3 w-3 shrink-0 text-zinc-500" />
        <History v-else class="h-3 w-3 shrink-0 text-emerald-400" />
        <span class="truncate">
          {{ searchAllHistory ? "All conversation history" : "Last 10 days" }}
        </span>
        <span v-if="hasResults" class="text-zinc-600">({{ totalCount }} found)</span>
      </div>

      <button
        type="button"
        @click="toggleSearchHistory"
        class="min-h-[44px] shrink-0 font-medium text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer flex items-center gap-1 select-none"
      >
        <span>{{ searchAllHistory ? "Limit to 10 days" : "Search older messages" }}</span>
        <span
          v-if="!searchAllHistory && olderMatchesCount > 0"
          class="rounded-full bg-emerald-500/20 px-1.5 py-0.2 font-mono text-[10px] text-emerald-300"
        >
          +{{ olderMatchesCount }}
        </span>
      </button>
    </div>

    <!-- Search results loading -->
    <div v-if="searching" class="space-y-1 pt-2" role="status">
      <span class="sr-only">Searching messages…</span>
      <div v-for="n in 3" :key="n" class="flex items-start gap-3 p-2.5" aria-hidden="true">
        <AppSkeleton class="mt-0.5 h-9 w-9 shrink-0 rounded-lg" />
        <div class="min-w-0 flex-1 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <AppSkeleton class="h-3 w-32 max-w-full" />
            <AppSkeleton class="h-2.5 w-10 shrink-0" />
          </div>
          <AppSkeleton class="h-2.5 w-20" />
          <AppSkeleton class="h-2.5 w-full" />
          <AppSkeleton class="h-2.5 w-2/3" />
        </div>
      </div>
    </div>

    <!-- No results -->
    <div
      v-else-if="isActive && !hasResults"
      class="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center"
    >
      <p class="text-xs text-zinc-300">
        No results for "<span class="text-white font-medium">{{ query }}</span
        >"
      </p>
      <p class="text-[11px] text-zinc-500 max-w-xs leading-relaxed">
        {{
          searchAllHistory
            ? "No matches found across your stored message history."
            : "No matches found in the last 10 days."
        }}
      </p>
      <button
        v-if="!searchAllHistory"
        type="button"
        @click="toggleSearchHistory"
        class="mt-2 min-h-[44px] px-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-xs font-medium text-emerald-400 hover:bg-zinc-700 hover:text-emerald-300 transition-colors cursor-pointer"
      >
        <History class="h-3.5 w-3.5" />
        <span>Search entire message history</span>
      </button>
    </div>

    <!-- Results list -->
    <template v-else-if="isActive && hasResults">
      <div class="flex items-center justify-between px-1 pt-2 pb-1">
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
          class="flex w-full items-start gap-3 p-2.5 text-left rounded-lg border border-transparent hover:border-zinc-800 hover:bg-zinc-900/50 transition-all cursor-pointer min-h-[44px]"
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
              v-html="highlight(messagePlainText(message), query)"
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
          :key="message.id"
          @click="openGroup(message.groupId)"
          class="flex w-full items-start gap-3 p-2.5 text-left rounded-lg border border-transparent hover:border-zinc-800 hover:bg-zinc-900/50 transition-all cursor-pointer min-h-[44px]"
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
              v-html="highlight(messagePlainText(message), query)"
            />
          </div>
        </button>
      </template>
    </template>
  </section>
</template>
