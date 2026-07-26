<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { MessageCircle, Search, X } from "@lucide/vue";
import { useRouter } from "vue-router";

import RoboAvatar from "@/components/RoboAvatar.vue";
import { useProfileCache } from "@/composables/useProfileCache";
import { formatTime } from "@/lib/chatUtils";
import { escapeHtml } from "@/lib/escapeHtml";
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
    <!-- Messenger-style pill search bar -->
    <div class="relative flex items-center">
      <Search
        class="pointer-events-none absolute left-3.5 h-4 w-4 text-zinc-500"
        :stroke-width="2.2"
        aria-hidden="true"
      />
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        placeholder="Search"
        autocomplete="off"
        spellcheck="false"
        class="w-full rounded-2xl py-2.5 pl-10 pr-10 text-sm placeholder-zinc-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] border border-(--app-border) bg-(--app-surface-soft) text-(--app-text) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))]"
      />
      <button
        v-if="query"
        @click="clearSearch"
        class="absolute right-3 flex h-5 w-5 items-center justify-center rounded-full bg-(--app-muted) text-(--app-surface) transition-colors hover:bg-(--app-text-soft)"
        aria-label="Clear search"
      >
        <X class="h-3 w-3" :stroke-width="3" aria-hidden="true" />
      </button>
    </div>

    <!-- Search results -->
    <div v-if="searching" class="py-5 text-center text-sm text-(--app-muted)">Searching…</div>

    <div
      v-else-if="isActive && !hasResults"
      class="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center"
    >
      <p class="text-sm text-(--app-muted)">
        No results for "<span class="text-(--app-text)">{{ query }}</span
        >"
      </p>
      <p class="text-xs text-(--app-muted)">
        Only cached text messages on this device are searched.
      </p>
    </div>

    <template v-else-if="isActive && hasResults">
      <div class="flex items-center justify-between px-1 pt-4 pb-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-(--app-muted)">
          {{ totalCount }} result{{ totalCount !== 1 ? "s" : "" }}
        </p>
      </div>

      <template v-if="results.dm.length">
        <div class="px-1 pt-1 pb-2">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-(--app-muted)">
            Direct messages
          </p>
        </div>
        <button
          v-for="message in results.dm"
          :key="message.id"
          @click="openDm(message.roomId)"
          class="flex w-full items-start gap-3 px-1 py-3 text-left rounded-xl transition-colors hover:bg-(--app-surface-hover)"
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
            class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--app-surface-soft)"
          >
            <MessageCircle
              class="h-5 w-5 text-(--app-muted)"
              :stroke-width="1.5"
              aria-hidden="true"
            />
          </div>
          <div class="min-w-0 flex-1">
            <div class="mb-0.5 flex items-center justify-between gap-2">
              <p class="truncate text-sm font-semibold text-(--app-text)">
                {{ dmRoomName(message.roomId) }}
              </p>
              <span class="shrink-0 text-[11px] text-(--app-muted)">{{
                formatTime(message.ts)
              }}</span>
            </div>
            <p class="mb-1 truncate font-mono text-xs text-(--app-muted)">
              {{ dmRoomShortId(message.roomId) }}
            </p>
            <p
              class="line-clamp-2 text-xs leading-relaxed text-(--app-text-soft)"
              v-html="highlight(message.text, query)"
            />
          </div>
        </button>
      </template>

      <template v-if="results.group.length">
        <div class="px-1 pt-4 pb-2">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-(--app-muted)">
            Groups
          </p>
        </div>
        <button
          v-for="message in results.group"
          :key="message.key"
          @click="openGroup(message.groupId)"
          class="flex w-full items-start gap-3 px-1 py-3 text-left rounded-xl transition-colors hover:bg-(--app-surface-hover)"
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
              <p class="truncate text-sm font-semibold text-(--app-text)">
                {{ groupName(message.groupId) }}
              </p>
              <span class="shrink-0 text-[11px] text-(--app-muted)">{{
                formatTime(message.ts)
              }}</span>
            </div>
            <p class="mb-1 truncate font-mono text-xs text-(--app-muted)">
              {{ displayName(message.sender) }}
            </p>
            <p
              class="line-clamp-2 text-xs leading-relaxed text-(--app-text-soft)"
              v-html="highlight(message.text, query)"
            />
          </div>
        </button>
      </template>
    </template>
  </section>
</template>
