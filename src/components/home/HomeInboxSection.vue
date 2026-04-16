<script setup>
import { MessageCircle, RefreshCw, Users, Pin, PinOff } from "lucide-vue-next";
import RoboAvatar from "@/components/RoboAvatar.vue";

defineProps({
  activeTab: { type: String, default: "messages" },
  activeId: { type: String, default: "" },
  searchActive: { type: Boolean, default: false },
  messages: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] },
});

const emit = defineEmits([
  "update:activeTab",
  "open-room",
  "open-group",
  "open-profile",
  "refresh-groups",
  "toggle-pin",
]);
</script>

<template>
  <section v-if="!searchActive">
    <!-- Messenger-style filter chips — sticky so it stays visible while scrolling -->
    <div class="sticky top-0 z-10 bg-black flex items-center gap-2 py-2 -mx-4 px-4 mb-1">
      <button
        v-if="messages.length"
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150"
        :class="
          activeTab === 'messages'
            ? 'bg-white/15 text-white'
            : 'bg-white/5 text-zinc-500 hover:bg-white/8 hover:text-zinc-300'
        "
        @click="emit('update:activeTab', 'messages')"
      >
        Messages
        <span
          class="text-[10px] tabular-nums"
          :class="activeTab === 'messages' ? 'text-zinc-300' : 'text-zinc-500'"
          >{{ messages.length }}</span
        >
      </button>
      <button
        v-if="groups.length"
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150"
        :class="
          activeTab === 'groups'
            ? 'bg-white/15 text-white'
            : 'bg-white/5 text-zinc-500 hover:bg-white/8 hover:text-zinc-300'
        "
        @click="emit('update:activeTab', 'groups')"
      >
        Groups
        <span
          class="text-[10px] tabular-nums"
          :class="activeTab === 'groups' ? 'text-zinc-300' : 'text-zinc-500'"
          >{{ groups.length }}</span
        >
      </button>

      <!-- Refresh for groups tab -->
      <button
        v-if="activeTab === 'groups' && groups.length"
        class="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
        @click="emit('refresh-groups')"
      >
        <RefreshCw class="w-3 h-3" :stroke-width="1.8" aria-hidden="true" />
      </button>
    </div>

    <!-- Messages list -->
    <div v-if="activeTab === 'messages'" class="space-y-0.5">
      <!-- Pinned section label -->
      <p
        v-if="messages.some((r) => r.pinned)"
        class="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
      >
        Pinned
      </p>

      <template v-for="(room, idx) in messages" :key="room.id">
        <!-- Divider between pinned and unpinned -->
        <p
          v-if="idx > 0 && !room.pinned && messages[idx - 1]?.pinned"
          class="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
        >
          All
        </p>

        <button
          class="group relative flex w-full items-center gap-3 rounded-xl pl-2 pr-9 py-2.5 text-left transition-colors duration-150"
          :class="
            activeId && activeId === room.roomId
              ? 'bg-white/[0.10]'
              : 'hover:bg-white/[0.05] active:bg-white/[0.07]'
          "
          @click="emit('open-room', room.roomId)"
        >
          <!-- Avatar -->
          <div
            v-if="room.peerPubkey"
            class="shrink-0"
            @click.stop="emit('open-profile', room.peerPubkey)"
          >
            <RoboAvatar
              :pubkey="room.peerPubkey"
              :src="room.avatarSrc"
              size="lg"
              :story-ring="false"
              :hoverable="true"
              :alt="room.displayName"
            />
          </div>
          <div
            v-else
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/8 text-lg font-bold text-white"
          >
            {{ room.fallbackInitial }}
          </div>

          <!-- Text -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <div class="flex min-w-0 items-center gap-1">
                <p
                  class="truncate text-sm leading-snug"
                  :class="room.unread ? 'font-bold text-white' : 'font-semibold text-white'"
                >
                  {{ room.displayName }}
                </p>
                <Pin
                  v-if="room.pinned"
                  class="h-3 w-3 shrink-0 text-zinc-500"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <span
                  v-if="room.unread"
                  class="inline-block h-2 w-2 rounded-full bg-(--ig-blue)"
                  aria-label="Unread messages"
                />
                <span v-if="room.ageLabel" class="text-[11px] text-zinc-500 tabular-nums">{{
                  room.ageLabel
                }}</span>
              </div>
            </div>
            <p
              class="mt-0.5 truncate text-xs"
              :class="room.unread ? 'text-zinc-300' : 'text-zinc-500'"
            >
              {{ room.secondaryLabel }}
            </p>
          </div>

          <!-- Pin / unpin button — visible on hover -->
          <div
            role="button"
            tabindex="0"
            class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100"
            :class="
              room.pinned
                ? 'text-zinc-300 bg-white/10'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/8'
            "
            :title="room.pinned ? 'Unpin chat' : 'Pin chat'"
            @click.stop="emit('toggle-pin', room.roomId)"
            @keydown.enter.stop="emit('toggle-pin', room.roomId)"
            @keydown.space.stop.prevent="emit('toggle-pin', room.roomId)"
          >
            <PinOff v-if="room.pinned" class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
            <Pin v-else class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
          </div>
        </button>
      </template>
    </div>

    <!-- Groups list -->
    <div v-if="activeTab === 'groups'" class="space-y-0.5">
      <button
        v-for="group in groups"
        :key="group.id"
        class="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-150"
        :class="
          activeId && activeId === group.groupId
            ? 'bg-white/[0.10]'
            : 'hover:bg-white/[0.05] active:bg-white/[0.07]'
        "
        @click="emit('open-group', group.groupId)"
      >
        <RoboAvatar :group-id="group.avatarKey" :alt="group.displayName" size="lg" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-white leading-snug">
            {{ group.displayName }}
          </p>
          <p class="mt-0.5 truncate text-xs text-zinc-500">{{ group.secondaryLabel }}</p>
        </div>
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="!messages.length && !groups.length" class="py-20 text-center">
      <MessageCircle
        class="mx-auto mb-3 h-8 w-8 text-zinc-500"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      <p class="text-sm font-semibold text-zinc-400">No conversations yet</p>
      <p class="mt-1 text-xs text-zinc-500">
        Tap <span class="text-zinc-400">compose</span> to start a new chat
      </p>
    </div>
  </section>
</template>
