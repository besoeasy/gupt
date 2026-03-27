<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { MessageCircle, Search, X, Users, Copy, Link2, Check } from "lucide-vue-next";
import { useRouter } from "vue-router";

import RoboAvatar from "@/components/RoboAvatar.vue";
import { useProfileCache } from "@/composables/useProfileCache";
import { formatTime } from "@/lib/chatUtils";
import { roboHashGroupUrl, roboHashUrl, shortId } from "@/lib/crypto";
import { listRoomMeta, listStoredGroups, searchMessages } from "@/lib/idb";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const props = defineProps({
  showActions: { type: Boolean, default: false },
  copied: { type: Boolean, default: false },
  inviteCopied: { type: Boolean, default: false },
});
const emit = defineEmits([
  "active-change",
  "open-create-dm",
  "open-create-group",
  "copy-id",
  "copy-invite",
]);

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
  <section :class="props.showActions ? 'px-6 pt-4 pb-2' : 'px-4 pt-1 pb-3'">
    <div class="flex items-center gap-4">
      <div class="relative flex-1">
        <Search
          class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10"
          :stroke-width="2"
          aria-hidden="true"
        />
        <Input
          ref="inputEl"
          v-model="query"
          type="text"
          placeholder="Search cached messages…"
          autocomplete="off"
          spellcheck="false"
          class="pl-12 pr-12 h-10 rounded-md bg-card border border-border"
        />
        <Button
          v-if="query"
          @click="clearSearch"
          variant="ghost"
          size="icon"
          class="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10"
          aria-label="Clear search"
        >
          <X class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
        </Button>
      </div>

      <div v-if="props.showActions" class="flex items-center gap-3">
        <Button
          @click.prevent="emit('open-create-dm')"
          variant="ghost"
          size="lg"
          class="hidden sm:inline-flex"
        >
          <MessageCircle class="w-4 h-4" />
          <span>New message</span>
        </Button>
        <Button
          @click.prevent="emit('open-create-dm')"
          variant="ghost"
          size="icon"
          class="sm:hidden"
          aria-label="New message"
        >
          <MessageCircle class="w-4 h-4" />
        </Button>

        <Button
          @click.prevent="emit('open-create-group')"
          variant="ghost"
          size="lg"
          class="hidden sm:inline-flex"
        >
          <Users class="w-4 h-4" />
          <span>New group</span>
        </Button>
        <Button
          @click.prevent="emit('open-create-group')"
          variant="ghost"
          size="icon"
          class="sm:hidden"
          aria-label="New group"
        >
          <Users class="w-4 h-4" />
        </Button>

        <Button
          @click.prevent="emit('copy-id')"
          variant="ghost"
          size="lg"
          class="hidden sm:inline-flex w-[105px]"
          :class="props.copied ? 'text-emerald-500 hover:text-emerald-600' : ''"
        >
          <Check v-if="props.copied" class="w-4 h-4 motion-safe:animate-pulse" />
          <Copy v-else class="w-4 h-4" />
          <span>{{ props.copied ? "Copied" : "Copy ID" }}</span>
        </Button>
        <Button
          @click.prevent="emit('copy-id')"
          variant="ghost"
          size="icon"
          class="sm:hidden"
          :class="props.copied ? 'text-emerald-500 hover:text-emerald-600' : ''"
          aria-label="Copy ID"
        >
          <Check v-if="props.copied" class="w-4 h-4 motion-safe:animate-pulse" />
          <Copy v-else class="w-4 h-4" />
        </Button>

        <Button
          @click.prevent="emit('copy-invite')"
          variant="ghost"
          size="lg"
          class="hidden sm:inline-flex w-[95px]"
          :class="props.inviteCopied ? 'text-emerald-500 hover:text-emerald-600' : ''"
        >
          <Check v-if="props.inviteCopied" class="w-4 h-4 motion-safe:animate-pulse" />
          <Link2 v-else class="w-4 h-4" />
          <span>{{ props.inviteCopied ? "Copied" : "Invite" }}</span>
        </Button>
        <Button
          @click.prevent="emit('copy-invite')"
          variant="ghost"
          size="icon"
          class="sm:hidden"
          :class="props.inviteCopied ? 'text-emerald-500 hover:text-emerald-600' : ''"
          aria-label="Invite"
        >
          <Check v-if="props.inviteCopied" class="w-4 h-4 motion-safe:animate-pulse" />
          <Link2 v-else class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <div v-if="searching" class="py-5 text-center text-sm text-muted-foreground">Searching…</div>

    <div
      v-else-if="isActive && !hasResults"
      class="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center"
    >
      <p class="text-sm text-muted-foreground">
        No results for "<span class="text-zinc-200">{{ query }}</span
        >"
      </p>
      <p class="text-xs text-zinc-600">Only cached text messages on this device are searched.</p>
    </div>

    <template v-else-if="isActive && hasResults">
      <div class="flex items-center justify-between px-1 pt-4 pb-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {{ totalCount }} result{{ totalCount !== 1 ? "s" : "" }}
        </p>
      </div>

      <template v-if="results.dm.length">
        <div class="px-1 pt-1 pb-2">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
            Direct messages
          </p>
        </div>
        <Button
          v-for="message in results.dm"
          :key="message.id"
          @click="openDm(message.roomId)"
          variant="ghost"
          class="flex w-full h-auto items-start gap-3 border-b border-white/4 px-1 py-3 text-left justify-start"
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
            class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted"
          >
            <MessageCircle class="h-5 w-5 text-zinc-600" :stroke-width="1.5" aria-hidden="true" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="mb-0.5 flex items-center justify-between gap-2">
              <p class="truncate text-sm font-semibold">{{ dmRoomName(message.roomId) }}</p>
              <span class="shrink-0 text-[11px] text-zinc-600">{{ formatTime(message.ts) }}</span>
            </div>
            <p class="mb-1 truncate font-mono text-xs text-muted-foreground">
              {{ dmRoomShortId(message.roomId) }}
            </p>
            <p
              class="line-clamp-2 text-xs leading-relaxed text-foreground"
              v-html="highlight(message.text, query)"
            />
          </div>
        </Button>
      </template>

      <template v-if="results.group.length">
        <div class="px-1 pt-4 pb-2">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Groups</p>
        </div>
        <Button
          v-for="message in results.group"
          :key="message.key"
          @click="openGroup(message.groupId)"
          variant="ghost"
          class="flex w-full h-auto items-start gap-3 border-b border-white/4 px-1 py-3 text-left justify-start"
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
            <p class="mb-1 truncate font-mono text-xs text-muted-foreground">
              {{ displayName(message.sender) }}
            </p>
            <p
              class="line-clamp-2 text-xs leading-relaxed text-foreground"
              v-html="highlight(message.text, query)"
            />
          </div>
        </Button>
      </template>
    </template>
  </section>
</template>
