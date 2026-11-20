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
    '<mark class="chat-search-panel__mark">$1</mark>',
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
  <section class="chat-search-panel__section">
    <!-- Vercel/Geist search input -->
    <div class="chat-search-panel__block">
      <Search
        class="chat-search-panel__search"
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
        class="chat-search-panel__field-text"
      />
      <div
        v-if="!query"
        class="chat-search-panel__block-2"
      >
        <kbd
          class="chat-search-panel__key"
          >⌘K</kbd
        >
      </div>
      <button
        v-else
        @click="clearSearch"
        class="chat-search-panel__button-clear-search"
        aria-label="Clear search"
      >
        <X class="chat-search-panel__x" aria-hidden="true" />
      </button>
    </div>

    <!-- Interactive History Stretch Banner (AGENTS.md touch target >= 44px) -->
    <div
      v-if="isActive"
      class="chat-search-panel__block-3"
    >
      <div class="chat-search-panel__block-4">
        <Clock v-if="!searchAllHistory" class="chat-search-panel__clock" />
        <History v-else class="chat-search-panel__history" />
        <span class="chat-search-panel__text">
          {{ searchAllHistory ? "All conversation history" : "Last 10 days" }}
        </span>
        <span v-if="hasResults" class="chat-search-panel__text-2">({{ totalCount }} found)</span>
      </div>

      <button
        type="button"
        @click="toggleSearchHistory"
        class="chat-search-panel__button"
      >
        <span>{{ searchAllHistory ? "Limit to 10 days" : "Search older messages" }}</span>
        <span
          v-if="!searchAllHistory && olderMatchesCount > 0"
          class="chat-search-panel__text-3"
        >
          +{{ olderMatchesCount }}
        </span>
      </button>
    </div>

    <!-- Search results loading -->
    <div v-if="searching" class="chat-search-panel__status" role="status">
      <span class="chat-search-panel__text-4">Searching messages…</span>
      <div v-for="n in 3" :key="n" class="chat-search-panel__block-5" aria-hidden="true">
        <AppSkeleton class="chat-search-panel__app-skeleton" />
        <div class="chat-search-panel__block-6">
          <div class="chat-search-panel__block-7">
            <AppSkeleton class="chat-search-panel__app-skeleton-2" />
            <AppSkeleton class="chat-search-panel__app-skeleton-3" />
          </div>
          <AppSkeleton class="chat-search-panel__app-skeleton-4" />
          <AppSkeleton class="chat-search-panel__app-skeleton-5" />
          <AppSkeleton class="chat-search-panel__app-skeleton-6" />
        </div>
      </div>
    </div>

    <!-- No results -->
    <div
      v-else-if="isActive && !hasResults"
      class="chat-search-panel__block-8"
    >
      <p class="chat-search-panel__text-5">
        No results for "<span class="chat-search-panel__text-6">{{ query }}</span
        >"
      </p>
      <p class="chat-search-panel__text-7">
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
        class="chat-search-panel__button-2"
      >
        <History class="chat-search-panel__history-2" />
        <span>Search entire message history</span>
      </button>
    </div>

    <!-- Results list -->
    <template v-else-if="isActive && hasResults">
      <div class="chat-search-panel__block-9">
        <p class="chat-search-panel__text-result">
          {{ totalCount }} result{{ totalCount !== 1 ? "s" : "" }}
        </p>
      </div>

      <template v-if="results.dm.length">
        <div class="chat-search-panel__block-10">
          <p class="chat-search-panel__text-direct-messages">
            Direct messages
          </p>
        </div>
        <button
          v-for="message in results.dm"
          :key="message.id"
          @click="openDm(message.roomId)"
          class="chat-search-panel__button-3"
        >
          <RoboAvatar
            v-if="dmRoomAvatar(message.roomId)"
            :src="dmRoomAvatar(message.roomId)"
            size="md"
            rounded="lg"
            class="chat-search-panel__robo-avatar"
          />
          <div
            v-else
            class="chat-search-panel__block-11"
          >
            <MessageCircle class="chat-search-panel__message-circle" :stroke-width="1.5" aria-hidden="true" />
          </div>
          <div class="chat-search-panel__block-12">
            <div class="chat-search-panel__block-13">
              <p class="chat-search-panel__text-8">
                {{ dmRoomName(message.roomId) }}
              </p>
              <span class="chat-search-panel__text-9">{{
                formatTime(message.ts)
              }}</span>
            </div>
            <p class="chat-search-panel__text-10">
              {{ dmRoomShortId(message.roomId) }}
            </p>
            <p
              class="chat-search-panel__text-11"
              v-html="highlight(messagePlainText(message), query)"
            />
          </div>
        </button>
      </template>

      <template v-if="results.group.length">
        <div class="chat-search-panel__block-14">
          <p class="chat-search-panel__text-groups">Groups</p>
        </div>
        <button
          v-for="message in results.group"
          :key="message.id"
          @click="openGroup(message.groupId)"
          class="chat-search-panel__button-4"
        >
          <RoboAvatar
            :src="roboHashGroupUrl(message.groupId)"
            :alt="groupName(message.groupId)"
            size="md"
            rounded="lg"
            class="chat-search-panel__robo-avatar-2"
          />
          <div class="chat-search-panel__block-15">
            <div class="chat-search-panel__block-16">
              <p class="chat-search-panel__text-12">
                {{ groupName(message.groupId) }}
              </p>
              <span class="chat-search-panel__text-13">{{
                formatTime(message.ts)
              }}</span>
            </div>
            <p class="chat-search-panel__text-14">
              {{ displayName(message.sender) }}
            </p>
            <p
              class="chat-search-panel__text-15"
              v-html="highlight(messagePlainText(message), query)"
            />
          </div>
        </button>
      </template>
    </template>
  </section>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.chat-search-panel__block-3 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-search-panel__text-3 {
  background-color: color-mix(in oklab,var(--color-emerald-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-search-panel__block-3 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-search-panel__field-text {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 80%,transparent);
}
}

@media (hover:hover) {
.chat-search-panel__button-3:hover {
  border-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-search-panel__button-4:hover {
  border-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-search-panel__button-2:hover {
  background-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-search-panel__button-3:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
.chat-search-panel__button-4:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.chat-search-panel__button-3:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 50%,transparent);
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.chat-search-panel__button-4:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 50%,transparent);
}
}
}

@media (hover:hover) {
.chat-search-panel__button:hover {
  color: var(--color-emerald-300);
}
}

@media (hover:hover) {
.chat-search-panel__button-2:hover {
  color: var(--color-emerald-300);
}
}

@media (hover:hover) {
.chat-search-panel__button-clear-search:hover {
  color: var(--ui-zinc-200);
}
}

@media (min-width:40rem) {
.chat-search-panel__block-2 {
  display: flex;
}
}

@layer gupt-components {
:deep(.chat-search-panel__mark) {
  border-radius: 0.25rem;
  padding-inline: 0.125rem;
  background-color: color-mix(in srgb, var(--color-emerald-500) 25%, transparent);
  color: var(--color-emerald-200);
  font-weight: 500;
}
[data-theme="light"] :deep(.chat-search-panel__mark) {
  color: #059669;
}
.chat-search-panel__search {
  pointer-events: none;
}
.chat-search-panel__block-2 {
  pointer-events: none;
}
.chat-search-panel__text-4 {
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  position: absolute;
  overflow: hidden;
}
.chat-search-panel__search {
  position: absolute;
}
.chat-search-panel__block-2 {
  position: absolute;
}
.chat-search-panel__button-clear-search {
  position: absolute;
}
.chat-search-panel__block {
  position: relative;
}
.chat-search-panel__search {
  top: 50%;
}
.chat-search-panel__block-2 {
  top: 50%;
}
.chat-search-panel__button-clear-search {
  top: 50%;
}
.chat-search-panel__block-2 {
  right: calc(var(--spacing) * 2.5);
}
.chat-search-panel__button-clear-search {
  right: calc(var(--spacing) * 2.5);
}
.chat-search-panel__search {
  left: calc(var(--spacing) * 3);
}
.chat-search-panel__app-skeleton {
  margin-top: calc(var(--spacing) * .5);
}
.chat-search-panel__robo-avatar {
  margin-top: calc(var(--spacing) * .5);
}
.chat-search-panel__block-11 {
  margin-top: calc(var(--spacing) * .5);
}
.chat-search-panel__robo-avatar-2 {
  margin-top: calc(var(--spacing) * .5);
}
.chat-search-panel__button-2 {
  margin-top: calc(var(--spacing) * 2);
}
.chat-search-panel__block-13 {
  margin-bottom: calc(var(--spacing) * .5);
}
.chat-search-panel__block-16 {
  margin-bottom: calc(var(--spacing) * .5);
}
.chat-search-panel__text-10 {
  margin-bottom: var(--spacing);
}
.chat-search-panel__text-14 {
  margin-bottom: var(--spacing);
}
.chat-search-panel__text-11 {
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  display: -webkit-box;
  overflow: hidden;
}
.chat-search-panel__text-15 {
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  display: -webkit-box;
  overflow: hidden;
}
.chat-search-panel__block {
  display: flex;
}
.chat-search-panel__button-clear-search {
  display: flex;
}
.chat-search-panel__block-3 {
  display: flex;
}
.chat-search-panel__block-4 {
  display: flex;
}
.chat-search-panel__button {
  display: flex;
}
.chat-search-panel__block-5 {
  display: flex;
}
.chat-search-panel__block-7 {
  display: flex;
}
.chat-search-panel__block-8 {
  display: flex;
}
.chat-search-panel__block-9 {
  display: flex;
}
.chat-search-panel__button-3 {
  display: flex;
}
.chat-search-panel__block-11 {
  display: flex;
}
.chat-search-panel__block-13 {
  display: flex;
}
.chat-search-panel__button-4 {
  display: flex;
}
.chat-search-panel__block-16 {
  display: flex;
}
.chat-search-panel__block-2 {
  display: none;
}
.chat-search-panel__button-2 {
  display: inline-flex;
}
.chat-search-panel__app-skeleton-3 {
  height: calc(var(--spacing) * 2.5);
}
.chat-search-panel__app-skeleton-4 {
  height: calc(var(--spacing) * 2.5);
}
.chat-search-panel__app-skeleton-5 {
  height: calc(var(--spacing) * 2.5);
}
.chat-search-panel__app-skeleton-6 {
  height: calc(var(--spacing) * 2.5);
}
.chat-search-panel__clock {
  height: calc(var(--spacing) * 3);
}
.chat-search-panel__history {
  height: calc(var(--spacing) * 3);
}
.chat-search-panel__app-skeleton-2 {
  height: calc(var(--spacing) * 3);
}
.chat-search-panel__search {
  height: calc(var(--spacing) * 3.5);
}
.chat-search-panel__x {
  height: calc(var(--spacing) * 3.5);
}
.chat-search-panel__history-2 {
  height: calc(var(--spacing) * 3.5);
}
.chat-search-panel__message-circle {
  height: calc(var(--spacing) * 4);
}
.chat-search-panel__field-text {
  height: calc(var(--spacing) * 9);
}
.chat-search-panel__app-skeleton {
  height: calc(var(--spacing) * 9);
}
.chat-search-panel__block-11 {
  height: calc(var(--spacing) * 9);
}
.chat-search-panel__button-clear-search {
  min-height: 32px;
}
.chat-search-panel__button {
  min-height: 44px;
}
.chat-search-panel__button-2 {
  min-height: 44px;
}
.chat-search-panel__button-3 {
  min-height: 44px;
}
.chat-search-panel__button-4 {
  min-height: 44px;
}
.chat-search-panel__app-skeleton-6 {
  width: 66.6667%;
}
.chat-search-panel__clock {
  width: calc(var(--spacing) * 3);
}
.chat-search-panel__history {
  width: calc(var(--spacing) * 3);
}
.chat-search-panel__search {
  width: calc(var(--spacing) * 3.5);
}
.chat-search-panel__x {
  width: calc(var(--spacing) * 3.5);
}
.chat-search-panel__history-2 {
  width: calc(var(--spacing) * 3.5);
}
.chat-search-panel__message-circle {
  width: calc(var(--spacing) * 4);
}
.chat-search-panel__app-skeleton {
  width: calc(var(--spacing) * 9);
}
.chat-search-panel__block-11 {
  width: calc(var(--spacing) * 9);
}
.chat-search-panel__app-skeleton-3 {
  width: calc(var(--spacing) * 10);
}
.chat-search-panel__app-skeleton-4 {
  width: calc(var(--spacing) * 20);
}
.chat-search-panel__app-skeleton-2 {
  width: calc(var(--spacing) * 32);
}
.chat-search-panel__field-text {
  width: 100%;
}
.chat-search-panel__app-skeleton-5 {
  width: 100%;
}
.chat-search-panel__button-3 {
  width: 100%;
}
.chat-search-panel__button-4 {
  width: 100%;
}
.chat-search-panel__app-skeleton-2 {
  max-width: 100%;
}
.chat-search-panel__text-7 {
  max-width: var(--container-xs);
}
.chat-search-panel__block-4 {
  min-width: 0;
}
.chat-search-panel__block-6 {
  min-width: 0;
}
.chat-search-panel__block-12 {
  min-width: 0;
}
.chat-search-panel__block-15 {
  min-width: 0;
}
.chat-search-panel__button-clear-search {
  min-width: 32px;
}
.chat-search-panel__block-6 {
  flex: 1;
}
.chat-search-panel__block-12 {
  flex: 1;
}
.chat-search-panel__block-15 {
  flex: 1;
}
.chat-search-panel__clock {
  flex-shrink: 0;
}
.chat-search-panel__history {
  flex-shrink: 0;
}
.chat-search-panel__button {
  flex-shrink: 0;
}
.chat-search-panel__app-skeleton {
  flex-shrink: 0;
}
.chat-search-panel__app-skeleton-3 {
  flex-shrink: 0;
}
.chat-search-panel__block-11 {
  flex-shrink: 0;
}
.chat-search-panel__text-9 {
  flex-shrink: 0;
}
.chat-search-panel__text-13 {
  flex-shrink: 0;
}
.chat-search-panel__search {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.chat-search-panel__block-2 {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.chat-search-panel__button-clear-search {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.chat-search-panel__button-clear-search {
  cursor: pointer;
}
.chat-search-panel__button {
  cursor: pointer;
}
.chat-search-panel__button-2 {
  cursor: pointer;
}
.chat-search-panel__button-3 {
  cursor: pointer;
}
.chat-search-panel__button-4 {
  cursor: pointer;
}
.chat-search-panel__block-8 {
  flex-direction: column;
}
.chat-search-panel__block {
  align-items: center;
}
.chat-search-panel__block-2 {
  align-items: center;
}
.chat-search-panel__button-clear-search {
  align-items: center;
}
.chat-search-panel__block-3 {
  align-items: center;
}
.chat-search-panel__block-4 {
  align-items: center;
}
.chat-search-panel__button {
  align-items: center;
}
.chat-search-panel__block-7 {
  align-items: center;
}
.chat-search-panel__block-8 {
  align-items: center;
}
.chat-search-panel__button-2 {
  align-items: center;
}
.chat-search-panel__block-9 {
  align-items: center;
}
.chat-search-panel__block-11 {
  align-items: center;
}
.chat-search-panel__block-13 {
  align-items: center;
}
.chat-search-panel__block-16 {
  align-items: center;
}
.chat-search-panel__block-5 {
  align-items: flex-start;
}
.chat-search-panel__button-3 {
  align-items: flex-start;
}
.chat-search-panel__button-4 {
  align-items: flex-start;
}
.chat-search-panel__block-3 {
  justify-content: space-between;
}
.chat-search-panel__block-7 {
  justify-content: space-between;
}
.chat-search-panel__block-9 {
  justify-content: space-between;
}
.chat-search-panel__block-13 {
  justify-content: space-between;
}
.chat-search-panel__block-16 {
  justify-content: space-between;
}
.chat-search-panel__button-clear-search {
  justify-content: center;
}
.chat-search-panel__block-8 {
  justify-content: center;
}
.chat-search-panel__block-11 {
  justify-content: center;
}
.chat-search-panel__block-2 {
  gap: calc(var(--spacing) * .5);
}
.chat-search-panel__button {
  gap: var(--spacing);
}
.chat-search-panel__block-4 {
  gap: calc(var(--spacing) * 1.5);
}
.chat-search-panel__button-2 {
  gap: calc(var(--spacing) * 1.5);
}
.chat-search-panel__block-3 {
  gap: calc(var(--spacing) * 2);
}
.chat-search-panel__block-7 {
  gap: calc(var(--spacing) * 2);
}
.chat-search-panel__block-8 {
  gap: calc(var(--spacing) * 2);
}
.chat-search-panel__block-13 {
  gap: calc(var(--spacing) * 2);
}
.chat-search-panel__block-16 {
  gap: calc(var(--spacing) * 2);
}
.chat-search-panel__block-5 {
  gap: calc(var(--spacing) * 3);
}
.chat-search-panel__button-3 {
  gap: calc(var(--spacing) * 3);
}
.chat-search-panel__button-4 {
  gap: calc(var(--spacing) * 3);
}
:where(.chat-search-panel__status>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.chat-search-panel__section>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.chat-search-panel__block-6>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
.chat-search-panel__text {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-search-panel__text-8 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-search-panel__text-10 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-search-panel__text-12 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-search-panel__text-14 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-search-panel__key {
  border-radius: .25rem;
}
.chat-search-panel__text-3 {
  border-radius: 3.40282e38px;
}
.chat-search-panel__field-text {
  border-radius: var(--radius-lg);
}
.chat-search-panel__block-3 {
  border-radius: var(--radius-lg);
}
.chat-search-panel__app-skeleton {
  border-radius: var(--radius-lg);
}
.chat-search-panel__button-2 {
  border-radius: var(--radius-lg);
}
.chat-search-panel__button-3 {
  border-radius: var(--radius-lg);
}
.chat-search-panel__block-11 {
  border-radius: var(--radius-lg);
}
.chat-search-panel__button-4 {
  border-radius: var(--radius-lg);
}
.chat-search-panel__field-text {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-search-panel__key {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-search-panel__block-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-search-panel__button-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-search-panel__button-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-search-panel__block-11 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-search-panel__button-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-search-panel__button-3 {
  border-color: #0000;
}
.chat-search-panel__button-4 {
  border-color: #0000;
}
.chat-search-panel__button-2 {
  border-color: var(--ui-zinc-700);
}
.chat-search-panel__field-text {
  border-color: var(--ui-zinc-800);
}
.chat-search-panel__key {
  border-color: var(--ui-zinc-800);
}
.chat-search-panel__block-11 {
  border-color: var(--ui-zinc-800);
}
.chat-search-panel__block-3 {
  border-color: var(--ui-zinc-800);
}
.chat-search-panel__text-3 {
  background-color: #00bb7f33;
}
.chat-search-panel__button-2 {
  background-color: var(--ui-zinc-800);
}
.chat-search-panel__key {
  background-color: var(--ui-zinc-900);
}
.chat-search-panel__block-11 {
  background-color: var(--ui-zinc-900);
}
.chat-search-panel__block-3 {
  background-color: var(--ui-zinc-900);
}
.chat-search-panel__field-text {
  background-color: var(--ui-zinc-950);
}
.chat-search-panel__button-clear-search {
  padding: var(--spacing);
}
.chat-search-panel__block-5 {
  padding: calc(var(--spacing) * 2.5);
}
.chat-search-panel__button-3 {
  padding: calc(var(--spacing) * 2.5);
}
.chat-search-panel__button-4 {
  padding: calc(var(--spacing) * 2.5);
}
.chat-search-panel__block-9 {
  padding-inline: var(--spacing);
}
.chat-search-panel__block-10 {
  padding-inline: var(--spacing);
}
.chat-search-panel__block-14 {
  padding-inline: var(--spacing);
}
.chat-search-panel__key {
  padding-inline: calc(var(--spacing) * 1.5);
}
.chat-search-panel__text-3 {
  padding-inline: calc(var(--spacing) * 1.5);
}
.chat-search-panel__block-3 {
  padding-inline: calc(var(--spacing) * 3);
}
.chat-search-panel__button-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.chat-search-panel__block-8 {
  padding-inline: calc(var(--spacing) * 4);
}
.chat-search-panel__key {
  padding-block: calc(var(--spacing) * .5);
}
.chat-search-panel__block-3 {
  padding-block: var(--spacing);
}
.chat-search-panel__block-8 {
  padding-block: calc(var(--spacing) * 8);
}
.chat-search-panel__block-10 {
  padding-top: var(--spacing);
}
.chat-search-panel__status {
  padding-top: calc(var(--spacing) * 2);
}
.chat-search-panel__block-9 {
  padding-top: calc(var(--spacing) * 2);
}
.chat-search-panel__block-14 {
  padding-top: calc(var(--spacing) * 3);
}
.chat-search-panel__field-text {
  padding-right: calc(var(--spacing) * 14);
}
.chat-search-panel__block-9 {
  padding-bottom: var(--spacing);
}
.chat-search-panel__block-10 {
  padding-bottom: var(--spacing);
}
.chat-search-panel__block-14 {
  padding-bottom: var(--spacing);
}
.chat-search-panel__field-text {
  padding-left: calc(var(--spacing) * 9);
}
.chat-search-panel__block-8 {
  text-align: center;
}
.chat-search-panel__button-3 {
  text-align: left;
}
.chat-search-panel__button-4 {
  text-align: left;
}
.chat-search-panel__key {
  font-family: var(--font-mono);
}
.chat-search-panel__block-4 {
  font-family: var(--font-mono);
}
.chat-search-panel__text-3 {
  font-family: var(--font-mono);
}
.chat-search-panel__text-result {
  font-family: var(--font-mono);
}
.chat-search-panel__text-direct-messages {
  font-family: var(--font-mono);
}
.chat-search-panel__text-9 {
  font-family: var(--font-mono);
}
.chat-search-panel__text-10 {
  font-family: var(--font-mono);
}
.chat-search-panel__text-groups {
  font-family: var(--font-mono);
}
.chat-search-panel__text-13 {
  font-family: var(--font-mono);
}
.chat-search-panel__text-14 {
  font-family: var(--font-mono);
}
.chat-search-panel__field-text {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-search-panel__block-3 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-search-panel__text-5 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-search-panel__button-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-search-panel__text-8 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-search-panel__text-11 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-search-panel__text-12 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-search-panel__text-15 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-search-panel__key {
  font-size: 10px;
}
.chat-search-panel__text-3 {
  font-size: 10px;
}
.chat-search-panel__text-direct-messages {
  font-size: 10px;
}
.chat-search-panel__text-9 {
  font-size: 10px;
}
.chat-search-panel__text-10 {
  font-size: 10px;
}
.chat-search-panel__text-groups {
  font-size: 10px;
}
.chat-search-panel__text-13 {
  font-size: 10px;
}
.chat-search-panel__text-14 {
  font-size: 10px;
}
.chat-search-panel__block-4 {
  font-size: 11px;
}
.chat-search-panel__button {
  font-size: 11px;
}
.chat-search-panel__text-7 {
  font-size: 11px;
}
.chat-search-panel__text-result {
  font-size: 11px;
}
.chat-search-panel__text-7 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.chat-search-panel__text-11 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.chat-search-panel__text-15 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.chat-search-panel__button {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-search-panel__text-6 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-search-panel__button-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-search-panel__text-8 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.chat-search-panel__text-12 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.chat-search-panel__text-result {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-search-panel__text-direct-messages {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-search-panel__text-groups {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-search-panel__text-3 {
  color: var(--color-emerald-300);
}
.chat-search-panel__history {
  color: var(--color-emerald-400);
}
.chat-search-panel__button {
  color: var(--color-emerald-400);
}
.chat-search-panel__button-2 {
  color: var(--color-emerald-400);
}
.chat-search-panel__text-6 {
  color: var(--color-white);
}
.chat-search-panel__field-text {
  color: var(--ui-zinc-200);
}
.chat-search-panel__text-8 {
  color: var(--ui-zinc-200);
}
.chat-search-panel__text-12 {
  color: var(--ui-zinc-200);
}
.chat-search-panel__text-5 {
  color: var(--ui-zinc-300);
}
.chat-search-panel__block-4 {
  color: var(--ui-zinc-400);
}
.chat-search-panel__text-11 {
  color: var(--ui-zinc-400);
}
.chat-search-panel__text-15 {
  color: var(--ui-zinc-400);
}
.chat-search-panel__search {
  color: var(--ui-zinc-500);
}
.chat-search-panel__key {
  color: var(--ui-zinc-500);
}
.chat-search-panel__button-clear-search {
  color: var(--ui-zinc-500);
}
.chat-search-panel__clock {
  color: var(--ui-zinc-500);
}
.chat-search-panel__text-7 {
  color: var(--ui-zinc-500);
}
.chat-search-panel__text-result {
  color: var(--ui-zinc-500);
}
.chat-search-panel__message-circle {
  color: var(--ui-zinc-500);
}
.chat-search-panel__text-9 {
  color: var(--ui-zinc-500);
}
.chat-search-panel__text-13 {
  color: var(--ui-zinc-500);
}
.chat-search-panel__text-2 {
  color: var(--ui-zinc-600);
}
.chat-search-panel__text-direct-messages {
  color: var(--ui-zinc-600);
}
.chat-search-panel__text-10 {
  color: var(--ui-zinc-600);
}
.chat-search-panel__text-groups {
  color: var(--ui-zinc-600);
}
.chat-search-panel__text-14 {
  color: var(--ui-zinc-600);
}
.chat-search-panel__text-result {
  text-transform: uppercase;
}
.chat-search-panel__text-direct-messages {
  text-transform: uppercase;
}
.chat-search-panel__text-groups {
  text-transform: uppercase;
}
.chat-search-panel__text-9 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.chat-search-panel__text-13 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.chat-search-panel__field-text {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.chat-search-panel__field-text {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-search-panel__button-3 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-search-panel__button-4 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-search-panel__block-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-search-panel__button {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-search-panel__button-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-search-panel__button {
  -webkit-user-select: none;
  user-select: none;
}
.chat-search-panel__field-text::placeholder {
  color: var(--ui-zinc-500);
}
.chat-search-panel__field-text:focus {
  border-color: var(--ui-zinc-600);
}
.chat-search-panel__field-text:focus {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(1px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(1px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.chat-search-panel__field-text:focus {
  --ring-color: var(--ui-zinc-600);
}
.chat-search-panel__field-text:focus {
  --outline-style: none;
  outline-style: none;
}
[data-theme="light"] .chat-search-panel__text-3 {
  color: #059669;
}
[data-theme="light"] .chat-search-panel__history {
  color: #059669;
}
[data-theme="light"] .chat-search-panel__button {
  color: #059669;
}
[data-theme="light"] .chat-search-panel__button-2 {
  color: #059669;
}
[data-theme="light"] .chat-search-panel__text-5 {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-search-panel__block-4 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-search-panel__text-11 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-search-panel__text-15 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-search-panel__search {
  color: var(--app-muted);
}
[data-theme="light"] .chat-search-panel__key {
  color: var(--app-muted);
}
[data-theme="light"] .chat-search-panel__button-clear-search {
  color: var(--app-muted);
}
[data-theme="light"] .chat-search-panel__clock {
  color: var(--app-muted);
}
[data-theme="light"] .chat-search-panel__text-7 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-search-panel__text-result {
  color: var(--app-muted);
}
[data-theme="light"] .chat-search-panel__message-circle {
  color: var(--app-muted);
}
[data-theme="light"] .chat-search-panel__text-9 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-search-panel__text-13 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-search-panel__text-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-search-panel__text-direct-messages {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-search-panel__text-10 {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-search-panel__text-groups {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-search-panel__text-14 {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-search-panel__button-clear-search:hover {
  color: var(--app-text) !important;
}
}
}
</style>
