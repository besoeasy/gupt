<script setup>
import { MessageCircle, RefreshCw, Users, Inbox } from "lucide-vue-next";
import RoboAvatar from "@/components/RoboAvatar.vue";

defineProps({
  activeTab: { type: String, default: "messages" },
  activeId: { type: String, default: "" },
  searchActive: { type: Boolean, default: false },
  messages: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] },
  requests: { type: Array, default: () => [] },
});

const emit = defineEmits([
  "update:activeTab",
  "open-room",
  "open-group",
  "open-profile",
  "refresh-groups",
]);
</script>

<template>
  <section v-if="!searchActive">
    <!-- Messenger-style filter chips -->
    <div class="flex items-center gap-2 pb-3">
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
          :class="activeTab === 'messages' ? 'text-zinc-300' : 'text-zinc-600'"
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
          :class="activeTab === 'groups' ? 'text-zinc-300' : 'text-zinc-600'"
          >{{ groups.length }}</span
        >
      </button>
      <button
        v-if="requests.length"
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150"
        :class="
          activeTab === 'requests'
            ? 'bg-amber-500/20 text-amber-300'
            : 'bg-white/5 text-zinc-500 hover:bg-white/8 hover:text-zinc-300'
        "
        @click="emit('update:activeTab', 'requests')"
      >
        Requests
        <span class="text-[10px] text-amber-500 tabular-nums">{{ requests.length }}</span>
      </button>

      <!-- Refresh for groups tab -->
      <button
        v-if="activeTab === 'groups' && groups.length"
        class="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-300 transition-colors"
        @click="emit('refresh-groups')"
      >
        <RefreshCw class="w-3 h-3" :stroke-width="1.8" aria-hidden="true" />
      </button>
    </div>

    <!-- Messages list -->
    <div v-if="activeTab === 'messages'" class="space-y-0.5">
      <button
        v-for="room in messages"
        :key="room.id"
        class="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-150"
        :class="activeId && activeId === room.roomId ? 'bg-white/[0.10]' : 'hover:bg-white/[0.05] active:bg-white/[0.07]'"
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
          <div class="flex items-baseline justify-between gap-2">
            <p class="truncate text-sm font-semibold text-white leading-snug">
              {{ room.displayName }}
            </p>
            <span
              v-if="room.ageLabel"
              class="shrink-0 text-[11px] text-zinc-600 tabular-nums"
              >{{ room.ageLabel }}</span
            >
          </div>
          <p class="mt-0.5 truncate text-xs text-zinc-500">
            {{ room.secondaryLabel }}
          </p>
        </div>
      </button>
    </div>

    <!-- Groups list -->
    <div v-if="activeTab === 'groups'" class="space-y-0.5">
      <button
        v-for="group in groups"
        :key="group.id"
        class="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-150"
        :class="activeId && activeId === group.groupId ? 'bg-white/[0.10]' : 'hover:bg-white/[0.05] active:bg-white/[0.07]'"
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

    <!-- Requests list -->
    <div v-if="activeTab === 'requests'" class="space-y-0.5">
      <button
        v-for="room in requests"
        :key="room.id"
        class="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-150"
        :class="activeId && activeId === room.roomId ? 'bg-white/[0.10]' : 'hover:bg-white/[0.05] active:bg-white/[0.07]'"
        @click="emit('open-room', room.roomId)"
      >
        <div
          class="relative shrink-0"
          @click.stop="emit('open-profile', room.peerPubkey)"
        >
          <RoboAvatar
            :pubkey="room.peerPubkey"
            :src="room.avatarSrc"
            size="lg"
            :alt="room.displayName"
            :hoverable="true"
            class="opacity-70"
          />
          <span
            class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-black"
          />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-zinc-200 leading-snug">
            {{ room.displayName }}
          </p>
          <p class="mt-0.5 text-xs text-amber-400/70">Message request</p>
        </div>
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="!messages.length && !groups.length && !requests.length" class="py-20 text-center">
      <MessageCircle
        class="mx-auto mb-3 h-8 w-8 text-zinc-700"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      <p class="text-sm font-semibold text-zinc-400">No conversations yet</p>
      <p class="mt-1 text-xs text-zinc-600">
        Tap <span class="text-zinc-400">compose</span> to start a new chat
      </p>
    </div>
  </section>
</template>
