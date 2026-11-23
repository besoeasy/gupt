<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { MessageCircle, Search, X, Calendar, Clock, History } from "@/icons";
import { useRouter } from "vue-router";

import RoboAvatar from "@/components/RoboAvatar.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
import { useProfileStore } from "@/stores/profiles";
import { formatTime } from "@/lib/chatUtils";
import { escapeHtml } from "@/lib/escapeHtml";
import { messagePlainText } from "@/lib/messageFormat";
import { groupAvatarUrl, avatarUrl } from "@/lib/avatar";
import { shortId } from "@/lib/crypto";
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
    '<mark class="search-panel__mark">$1</mark>',
  );
}

function dmRoomName(roomId) {
  const meta = roomMetaMap.value.get(roomId);
  if (meta?.peerPubkey) return displayName(meta.peerPubkey);
  return `Room ${roomId.slice(0, 8)}…`;
}

function dmRoomAvatar(roomId) {
  const meta = roomMetaMap.value.get(roomId);
  return meta?.peerPubkey ? avatarUrl(meta.peerPubkey) : null;
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
  <section class="search-panel">
    <!-- Search field -->
    <div class="search-panel__field">
      <Search class="search-panel__search-icon" :stroke-width="2" aria-hidden="true" />
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        placeholder="Search last messages across contacts…"
        autocomplete="off"
        spellcheck="false"
        class="search-panel__input"
      />
      <kbd v-if="!query" class="search-panel__kbd">⌘K</kbd>
      <button
        v-else
        type="button"
        class="search-panel__clear"
        aria-label="Clear search"
        @click="clearSearch"
      >
        <X class="search-panel__clear-icon" :stroke-width="2" aria-hidden="true" />
      </button>
    </div>

    <!-- Scope bar -->
    <div v-if="isActive" class="search-panel__scope">
      <div class="search-panel__scope-info">
        <Clock v-if="!searchAllHistory" class="search-panel__scope-icon" :stroke-width="1.9" aria-hidden="true" />
        <History v-else class="search-panel__scope-icon" :stroke-width="1.9" aria-hidden="true" />
        <span class="search-panel__scope-label">
          {{ searchAllHistory ? "All conversation history" : "Last 10 days" }}
        </span>
        <span v-if="hasResults" class="search-panel__scope-count">{{ totalCount }} found</span>
      </div>

      <button type="button" class="search-panel__toggle" @click="toggleSearchHistory">
        <span>{{ searchAllHistory ? "Limit to 10 days" : "Search older messages" }}</span>
        <span v-if="!searchAllHistory && olderMatchesCount > 0" class="search-panel__toggle-count">
          +{{ olderMatchesCount }}
        </span>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="searching" class="search-panel__loading" role="status">
      <span class="search-panel__sr">Searching messages…</span>
      <div v-for="n in 3" :key="n" class="search-panel__skeleton" aria-hidden="true">
        <AppSkeleton class="search-panel__skeleton-avatar" />
        <div class="search-panel__skeleton-body">
          <div class="search-panel__skeleton-head">
            <AppSkeleton class="search-panel__skeleton-name" />
            <AppSkeleton class="search-panel__skeleton-time" />
          </div>
          <AppSkeleton class="search-panel__skeleton-line search-panel__skeleton-line--short" />
          <AppSkeleton class="search-panel__skeleton-line" />
        </div>
      </div>
    </div>

    <!-- No results -->
    <div v-else-if="isActive && !hasResults" class="search-panel__empty">
      <p class="search-panel__empty-title">
        No results for "<span class="search-panel__empty-query">{{ query }}</span
        >"
      </p>
      <p class="search-panel__empty-note">
        {{
          searchAllHistory
            ? "No matches found across your stored message history."
            : "No matches found in the last 10 days."
        }}
      </p>
      <button v-if="!searchAllHistory" type="button" class="search-panel__btn" @click="toggleSearchHistory">
        <History class="search-panel__btn-icon" :stroke-width="1.9" aria-hidden="true" />
        <span>Search entire message history</span>
      </button>
    </div>

    <!-- Results -->
    <template v-else-if="isActive && hasResults">
      <p class="search-panel__count">
        {{ totalCount }} result{{ totalCount !== 1 ? "s" : "" }}
      </p>

      <template v-if="results.dm.length">
        <h3 class="search-panel__group-label">Direct messages</h3>

        <div class="search-panel__sheet">
          <button
            v-for="message in results.dm"
            :key="message.id"
            type="button"
            class="search-panel__row"
            @click="openDm(message.roomId)"
          >
            <RoboAvatar
              v-if="dmRoomAvatar(message.roomId)"
              :src="dmRoomAvatar(message.roomId)"
              size="md"
              rounded="lg"
            />
            <span v-else class="search-panel__row-mark">
              <MessageCircle class="search-panel__row-mark-icon" :stroke-width="1.5" aria-hidden="true" />
            </span>

            <span class="search-panel__row-body">
              <span class="search-panel__row-head">
                <span class="search-panel__row-name">{{ dmRoomName(message.roomId) }}</span>
                <span class="search-panel__row-time">{{ formatTime(message.ts) }}</span>
              </span>
              <span class="search-panel__row-meta">{{ dmRoomShortId(message.roomId) }}</span>
              <span
                class="search-panel__row-text"
                v-html="highlight(messagePlainText(message), query)"
              />
            </span>
          </button>
        </div>
      </template>

      <template v-if="results.group.length">
        <h3 class="search-panel__group-label">Groups</h3>

        <div class="search-panel__sheet">
          <button
            v-for="message in results.group"
            :key="message.id"
            type="button"
            class="search-panel__row"
            @click="openGroup(message.groupId)"
          >
            <RoboAvatar
              :src="groupAvatarUrl(message.groupId)"
              :alt="groupName(message.groupId)"
              size="md"
              rounded="lg"
            />

            <span class="search-panel__row-body">
              <span class="search-panel__row-head">
                <span class="search-panel__row-name">{{ groupName(message.groupId) }}</span>
                <span class="search-panel__row-time">{{ formatTime(message.ts) }}</span>
              </span>
              <span class="search-panel__row-meta">{{ displayName(message.sender) }}</span>
              <span
                class="search-panel__row-text"
                v-html="highlight(messagePlainText(message), query)"
              />
            </span>
          </button>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
/* Ledger pass: a search field over one ruled result sheet. */

.search-panel {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  padding: var(--app-space-4);
  background: var(--app-surface);
}

.search-panel__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* ---- Field ---- */

.search-panel__field {
  position: relative;
  display: flex;
  align-items: center;
}

.search-panel__search-icon {
  position: absolute;
  left: 11px;
  width: 13px;
  height: 13px;
  color: var(--app-muted-2);
  pointer-events: none;
}

.search-panel__input {
  width: 100%;
  min-height: 40px;
  padding: 9px 76px 9px 32px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-size: var(--app-text-body);
  color: var(--app-text);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.search-panel__input::placeholder {
  color: var(--app-muted-2);
}

.search-panel__input:focus {
  outline: none;
  border-color: var(--app-border-strong);
  background: var(--app-surface);
  box-shadow: var(--app-focus-ring);
}

.search-panel__kbd {
  position: absolute;
  right: 10px;
  padding: 1px 5px;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  background: var(--app-surface);
  font-family: var(--font-mono);
  font-size: 8.5px;
  color: var(--app-muted-2);
  pointer-events: none;
}

.search-panel__clear {
  position: absolute;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.search-panel__clear-icon {
  width: 12px;
  height: 12px;
}

/* ---- Scope ---- */

.search-panel__scope {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 10px;
}

.search-panel__scope-info {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.search-panel__scope-icon {
  width: 11px;
  height: 11px;
  color: var(--app-muted-2);
}

.search-panel__scope-label {
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

.search-panel__scope-count {
  font-family: var(--font-mono);
  font-size: 8.5px;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.search-panel__toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--app-text);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  cursor: pointer;
}

.search-panel__toggle-count {
  color: var(--app-success);
  text-decoration: none;
}

/* ---- Loading ---- */

.search-panel__loading {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.search-panel__skeleton {
  display: flex;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
}

.search-panel__skeleton-avatar {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
}

.search-panel__skeleton-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}

.search-panel__skeleton-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.search-panel__skeleton-name {
  width: 38%;
  height: 9px;
}

.search-panel__skeleton-time {
  width: 32px;
  height: 9px;
}

.search-panel__skeleton-line {
  width: 100%;
  height: 8px;
}

.search-panel__skeleton-line--short {
  width: 58%;
}

/* ---- Empty ---- */

.search-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: var(--app-space-5) var(--app-space-4);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface-soft);
}

.search-panel__empty-title {
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.search-panel__empty-query {
  font-family: var(--font-mono);
  color: var(--app-text);
}

.search-panel__empty-note {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--app-muted-2);
}

.search-panel__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  margin-top: 4px;
  padding-inline: 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.search-panel__btn-icon {
  width: 11px;
  height: 11px;
}

/* ---- Results ---- */

.search-panel__count {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.search-panel__group-label {
  margin: 4px 0 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

.search-panel__sheet {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
}

.search-panel__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--app-dur-fast) var(--app-ease-standard);
}

.search-panel__row + .search-panel__row {
  border-top: 1px solid var(--app-border);
}

.search-panel__row-mark {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface-soft);
  color: var(--app-muted-2);
}

.search-panel__row-mark-icon {
  width: 16px;
  height: 16px;
}

.search-panel__row-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.search-panel__row-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.search-panel__row-name {
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-panel__row-time {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.search-panel__row-meta {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-panel__row-text {
  margin-top: 2px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--app-muted);
  overflow-wrap: anywhere;
}

.search-panel__row-text :deep(mark),
:deep(.search-panel__mark) {
  padding: 0 2px;
  border-radius: 2px;
  background: color-mix(in oklab, var(--app-success) 22%, transparent);
  color: var(--app-text);
  font-weight: 500;
}

@media (hover: hover) {
  .search-panel__clear:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }

  .search-panel__toggle:hover,
  .search-panel__btn:hover {
    color: var(--app-text);
    border-color: var(--app-border-strong);
  }

  .search-panel__row:hover {
    background: var(--app-surface-soft);
  }
}

@media (pointer: coarse) {
  .search-panel__clear,
  .search-panel__toggle,
  .search-panel__btn {
    min-height: var(--app-touch-h);
  }

  .search-panel__clear {
    min-width: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .search-panel__input,
  .search-panel__clear,
  .search-panel__btn,
  .search-panel__row {
    transition: none;
  }
}
</style>
