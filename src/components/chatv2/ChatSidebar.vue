<script setup>
import { computed, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { SquarePen, UserPlus, MessageSquare, Search, MessageCircle } from "@lucide/vue";

import ChatSearchPanel from "@/components/chat/ChatSearchPanel.vue";
import ChatConversationCard from "@/components/chatv2/ChatConversationCard.vue";
import { useConversations } from "@/composables/useConversations";

const props = defineProps({
  activeConversationId: { type: String, default: "" },
});

const emit = defineEmits(["select-conversation"]);

const router = useRouter();
const activeFilter = ref("all");

const { initPromise, conversations, unreadTotal, inboxLoading, refreshGroups, togglePin } =
  useConversations();

const searchActive = ref(false);

onMounted(async () => {
  await initPromise;
  void refreshGroups();
});

const countPinned = computed(() => (conversations.value || []).filter((c) => c.pinned).length);
const countDm = computed(() => (conversations.value || []).filter((c) => !c.isGroup).length);
const countGroups = computed(() => (conversations.value || []).filter((c) => c.isGroup).length);

const filteredConversations = computed(() => {
  const all = conversations.value || [];
  if (activeFilter.value === "unread") {
    return all.filter((c) => c.unreadCount > 0);
  }
  if (activeFilter.value === "pinned") {
    return all.filter((c) => c.pinned);
  }
  if (activeFilter.value === "dm") {
    return all.filter((c) => !c.isGroup);
  }
  if (activeFilter.value === "groups") {
    return all.filter((c) => c.isGroup);
  }
  return all;
});

function isCardActive(conv) {
  if (!props.activeConversationId) return false;
  const targetFormatted = conv.isGroup ? `group:${conv.roomId}` : `dm:${conv.roomId}`;
  return (
    props.activeConversationId === targetFormatted || props.activeConversationId === conv.roomId
  );
}

function handleSelect(conv) {
  emit("select-conversation", conv);
}
</script>

<template>
  <div class="h-full w-full min-w-0 overflow-y-auto bg-black text-zinc-100 pb-16">
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-5">
      <!-- Header Section -->
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-5"
      >
        <div>
          <div class="flex items-center gap-2.5 flex-wrap">
            <h1 class="text-xl font-semibold tracking-tight text-white">Messages</h1>
            <span
              v-if="conversations.length"
              class="rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-400 tabular-nums"
            >
              {{ conversations.length }}
            </span>
            <span
              v-if="unreadTotal"
              class="rounded-md border border-emerald-800/50 bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-400 tabular-nums"
            >
              {{ unreadTotal }} unread
            </span>
          </div>
          <p class="mt-1 text-xs text-zinc-500">
            End-to-end encrypted direct messages and private group chats.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <!-- Start New Chat Button (Geist high-contrast primary) -->
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-95 cursor-pointer"
            title="Start New Chat"
            @click="router.push('/chat/new')"
          >
            <SquarePen class="h-3.5 w-3.5" :stroke-width="2.2" />
            <span>New Chat</span>
          </button>

          <!-- Share Invite Button -->
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white cursor-pointer"
            title="Share Invite Link"
            @click="router.push('/invite/new')"
          >
            <UserPlus class="h-3.5 w-3.5" :stroke-width="2" />
            <span>Share Invite</span>
          </button>
        </div>
      </div>

      <!-- Search & Filters Bar -->
      <div class="space-y-3">
        <!-- Search Panel -->
        <ChatSearchPanel @active-change="searchActive = $event" />

        <!-- Vercel-style Segmented Control Bar -->
        <div
          v-if="!searchActive"
          class="inline-flex p-0.5 rounded-lg border border-zinc-800/80 bg-zinc-950/60 overflow-x-auto max-w-full [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          <button
            type="button"
            class="rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-all cursor-pointer select-none"
            :class="
              activeFilter === 'all'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
            "
            @click="activeFilter = 'all'"
          >
            All
            <span class="font-mono text-[10px] text-zinc-500 tabular-nums ml-1"
              >({{ conversations.length }})</span
            >
          </button>

          <button
            v-if="unreadTotal"
            type="button"
            class="rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-all cursor-pointer select-none"
            :class="
              activeFilter === 'unread'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
            "
            @click="activeFilter = 'unread'"
          >
            Unread
            <span class="font-mono text-[10px] text-emerald-400 tabular-nums ml-1"
              >({{ unreadTotal }})</span
            >
          </button>

          <button
            v-if="countPinned"
            type="button"
            class="rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-all cursor-pointer select-none"
            :class="
              activeFilter === 'pinned'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
            "
            @click="activeFilter = 'pinned'"
          >
            Pinned
            <span class="font-mono text-[10px] text-zinc-500 tabular-nums ml-1"
              >({{ countPinned }})</span
            >
          </button>

          <button
            v-if="countDm"
            type="button"
            class="rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-all cursor-pointer select-none"
            :class="
              activeFilter === 'dm'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
            "
            @click="activeFilter = 'dm'"
          >
            Direct Messages
            <span class="font-mono text-[10px] text-zinc-500 tabular-nums ml-1"
              >({{ countDm }})</span
            >
          </button>

          <button
            v-if="countGroups"
            type="button"
            class="rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-all cursor-pointer select-none"
            :class="
              activeFilter === 'groups'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
            "
            @click="activeFilter = 'groups'"
          >
            Groups
            <span class="font-mono text-[10px] text-zinc-500 tabular-nums ml-1"
              >({{ countGroups }})</span
            >
          </button>
        </div>
      </div>

      <!-- Shimmer Skeleton Loading State -->
      <div v-if="inboxLoading" class="space-y-2">
        <div
          v-for="n in 6"
          :key="n"
          class="flex items-center gap-3 sm:gap-3.5 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 sm:p-3.5"
        >
          <div
            class="h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-xl bg-zinc-900 animate-pulse border border-zinc-800"
          />
          <div class="flex-1 min-w-0 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="h-3.5 w-28 sm:w-36 rounded bg-zinc-900 animate-pulse" />
              <div class="h-3 w-10 sm:w-12 rounded bg-zinc-900/60 animate-pulse shrink-0" />
            </div>
            <div class="h-3 w-48 sm:w-72 rounded bg-zinc-900/40 animate-pulse" />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!searchActive && !conversations.length"
        class="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/60 px-6 py-14 text-center shadow-xs"
      >
        <div
          class="mb-3.5 flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400"
        >
          <MessageCircle class="h-5 w-5" />
        </div>
        <h2 class="text-base font-semibold tracking-tight text-white">No conversations yet</h2>
        <p class="mt-1 max-w-sm text-xs text-zinc-500 leading-relaxed">
          Start an end-to-end encrypted chat with a friend’s public key, or share an invite link.
        </p>
        <div class="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-95 cursor-pointer"
            @click="router.push('/chat/new')"
          >
            <SquarePen class="h-3.5 w-3.5" />
            <span>Start a chat</span>
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white transition-all cursor-pointer"
            @click="router.push('/invite/new')"
          >
            <UserPlus class="h-3.5 w-3.5" />
            <span>Share invite link</span>
          </button>
        </div>
      </div>

      <!-- Filter No Results -->
      <div
        v-else-if="!searchActive && !filteredConversations.length"
        class="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/60 px-6 py-10 text-center shadow-xs"
      >
        <MessageSquare class="h-6 w-6 text-zinc-600 mb-2.5" />
        <h2 class="text-sm font-semibold text-white">No matching conversations</h2>
        <p class="mt-1 text-xs text-zinc-500">
          No conversations found in the "{{ activeFilter }}" filter.
        </p>
        <button
          type="button"
          class="mt-3 text-xs font-medium text-white hover:underline cursor-pointer"
          @click="activeFilter = 'all'"
        >
          View all conversations
        </button>
      </div>

      <!-- Conversation List (Cards) -->
      <div v-else-if="!searchActive" class="space-y-2">
        <ChatConversationCard
          v-for="conv in filteredConversations"
          :key="conv.id"
          :conv="conv"
          :active="isCardActive(conv)"
          @select="handleSelect(conv)"
          @toggle-pin="togglePin"
        />
      </div>
    </div>
  </div>
</template>
