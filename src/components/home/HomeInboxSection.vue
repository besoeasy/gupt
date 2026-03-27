<script setup>
import { MessageCircle, RefreshCw, Users, Inbox } from "lucide-vue-next";
import RoboAvatar from "@/components/RoboAvatar.vue";

defineProps({
  activeTab: { type: String, default: "messages" },
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
    <!-- Flat tab row -->
    <div class="flex justify-center items-center gap-8 border-b border-white/8 px-3 py-3">
      <button
        v-if="messages.length"
        class="inline-flex items-center gap-1.5 px-2 py-1 pb-3 text-sm font-semibold transition-all duration-150 border-b-2 -mb-px"
        :class="
          activeTab === 'messages'
            ? 'border-white text-white'
            : 'border-transparent text-zinc-500 hover:text-zinc-300'
        "
        @click="emit('update:activeTab', 'messages')"
      >
        <MessageCircle class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />
        Messages
        <span
          class="text-[10px] px-1.5 py-0.5 rounded-full"
          :class="activeTab === 'messages' ? 'bg-white/10 text-zinc-300' : 'text-zinc-600'"
          >{{ messages.length }}</span
        >
      </button>
      <button
        v-if="groups.length"
        class="inline-flex items-center gap-1.5 px-2 py-1 pb-3 text-sm font-semibold transition-all duration-150 border-b-2 -mb-px"
        :class="
          activeTab === 'groups'
            ? 'border-white text-white'
            : 'border-transparent text-zinc-500 hover:text-zinc-300'
        "
        @click="emit('update:activeTab', 'groups')"
      >
        <Users class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />
        Groups
        <span
          class="text-[10px] px-1.5 py-0.5 rounded-full"
          :class="activeTab === 'groups' ? 'bg-white/10 text-zinc-300' : 'text-zinc-600'"
          >{{ groups.length }}</span
        >
      </button>
      <button
        v-if="requests.length"
        class="inline-flex items-center gap-1.5 px-2 py-1 pb-3 text-sm font-semibold transition-all duration-150 border-b-2 -mb-px"
        :class="
          activeTab === 'requests'
            ? 'border-amber-400 text-amber-300'
            : 'border-transparent text-zinc-500 hover:text-zinc-300'
        "
        @click="emit('update:activeTab', 'requests')"
      >
        <Inbox class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />
        Requests
        <span class="text-[10px] text-amber-500">{{ requests.length }}</span>
      </button>
    </div>

    <!-- Messages list -->
    <div v-if="activeTab === 'messages'" class="mt-3">
      <button
        v-for="room in messages"
        :key="room.id"
        class="group w-full px-1 py-3 text-left rounded-xl transition-colors duration-150 hover:bg-white/[0.04] active:bg-white/[0.06]"
        @click="emit('open-room', room.roomId)"
      >
        <div class="flex items-center gap-3">
          <!-- Avatar -->
          <button
            v-if="room.peerPubkey"
            class="shrink-0 focus:outline-none"
            :title="room.profileTitle"
            @click.stop="emit('open-profile', room.peerPubkey)"
          >
            <RoboAvatar
              :pubkey="room.peerPubkey"
              :src="room.avatarSrc"
              size="lg"
              :story-ring="true"
              :hoverable="true"
              :alt="room.displayName"
            />
          </button>
          <div
            v-else
            class="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 text-white font-bold text-lg"
          >
            {{ room.fallbackInitial }}
          </div>

          <!-- Text -->
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline justify-between gap-2">
              <p class="text-sm font-semibold text-white truncate leading-snug">
                {{ room.displayName }}
              </p>
              <span v-if="room.ageLabel" class="text-[11px] text-zinc-500 shrink-0 tabular-nums">{{
                room.ageLabel
              }}</span>
            </div>
            <p
              class="text-[11px] text-zinc-600 truncate mt-0.5 transition-opacity duration-150 group-hover:opacity-0 group-focus:opacity-0"
            >
              {{ room.secondaryLabel }}
            </p>
          </div>
        </div>
      </button>
    </div>

    <!-- Groups list -->
    <div v-if="activeTab === 'groups'" class="mt-3">
      <div class="py-2 flex justify-end">
        <button
          class="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
          @click="emit('refresh-groups')"
        >
          <RefreshCw class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />Refresh
        </button>
      </div>
      <button
        v-for="group in groups"
        :key="group.id"
        class="group w-full px-1 py-3 text-left rounded-xl transition-colors duration-150 hover:bg-white/[0.04] active:bg-white/[0.06]"
        @click="emit('open-group', group.groupId)"
      >
        <div class="flex items-center gap-3">
          <RoboAvatar :group-id="group.avatarKey" :alt="group.displayName" size="lg" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-white truncate leading-snug">
              {{ group.displayName }}
            </p>
            <p class="text-[11px] text-zinc-500 truncate mt-0.5">{{ group.secondaryLabel }}</p>
          </div>
        </div>
      </button>
    </div>

    <!-- Requests list -->
    <div v-if="activeTab === 'requests'" class="mt-3">
      <button
        v-for="room in requests"
        :key="room.id"
        class="group w-full px-1 py-3 text-left rounded-xl transition-colors duration-150 hover:bg-amber-500/[0.04] active:bg-amber-500/[0.07]"
        @click="emit('open-room', room.roomId)"
      >
        <div class="flex items-center gap-3">
          <button
            class="shrink-0 focus:outline-none relative"
            :title="room.profileTitle"
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
            <!-- Amber dot -->
            <span
              class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-black"
            />
          </button>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-zinc-200 truncate leading-snug">
              {{ room.displayName }}
            </p>
            <p class="text-[11px] text-amber-400/70 mt-0.5">Message request</p>
          </div>
        </div>
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="!messages.length && !groups.length && !requests.length" class="py-16 text-center">
      <MessageCircle
        class="w-7 h-7 text-zinc-700 mx-auto mb-3"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      <p class="text-zinc-400 text-sm font-semibold">No conversations yet</p>
      <p class="text-zinc-600 text-xs mt-1">Use the actions above to start chatting</p>
    </div>
  </section>
</template>
