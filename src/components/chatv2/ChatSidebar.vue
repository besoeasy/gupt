<script setup>
import { computed, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  SquarePen,
  UserPlus,
  MessageSquare,
  Mail,
  Search,
  X,
  Plus,
  Pin,
  Users,
  MessageCircle,
} from "@lucide/vue";

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
  <div class="h-full w-full min-w-0 overflow-y-auto bg-(--app-bg) text-(--app-text) pb-16">
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <!-- Header Section -->
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-(--app-border) pb-6"
      >
        <div>
          <div class="flex items-center gap-2.5 flex-wrap">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-2xl bg-(--app-primary)/10 text-(--app-primary)"
            >
              <MessageSquare class="h-4.5 w-4.5" />
            </div>
            <h1 class="text-2xl font-bold tracking-tight text-(--app-text)">Messages</h1>
            <span
              v-if="conversations.length"
              class="rounded-full bg-(--app-surface-soft) px-2.5 py-0.5 text-xs font-bold tabular-nums text-(--app-muted)"
            >
              {{ conversations.length }}
            </span>
            <span
              v-if="unreadTotal"
              class="rounded-full bg-(--app-primary)/15 px-2.5 py-0.5 text-xs font-bold tabular-nums text-(--app-primary)"
            >
              {{ unreadTotal }} unread
            </span>
          </div>
          <p class="mt-1 text-sm text-(--app-muted)">
            End-to-end encrypted direct messages and private group chats.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <!-- Share Invite Button -->
          <button
            type="button"
            class="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-(--app-border) bg-(--app-surface) px-3.5 text-xs font-semibold text-(--app-text-soft) shadow-sm transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text) cursor-pointer"
            title="Share Invite Link"
            @click="router.push('/invite/new')"
          >
            <UserPlus class="h-4 w-4" />
            <span>Share Invite</span>
          </button>

          <!-- Start New Chat Button -->
          <button
            type="button"
            class="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-(--app-primary) px-4 text-xs font-bold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-95 cursor-pointer"
            title="Start New Chat"
            @click="router.push('/chat/new')"
          >
            <SquarePen class="h-4 w-4" />
            <span>New Chat</span>
          </button>
        </div>
      </div>

      <!-- Search & Filters Bar -->
      <div class="space-y-3">
        <!-- Search Panel -->
        <ChatSearchPanel @active-change="searchActive = $event" />

        <!-- Filter Chips (Visible when not actively searching text) -->
        <div
          v-if="!searchActive"
          class="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          <button
            type="button"
            class="rounded-xl px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
            :class="
              activeFilter === 'all'
                ? 'bg-(--app-primary) text-white shadow-xs'
                : 'bg-(--app-surface) text-(--app-muted) border border-(--app-border) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
            "
            @click="activeFilter = 'all'"
          >
            All ({{ conversations.length }})
          </button>

          <button
            v-if="unreadTotal"
            type="button"
            class="rounded-xl px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
            :class="
              activeFilter === 'unread'
                ? 'bg-(--app-primary) text-white shadow-xs'
                : 'bg-(--app-surface) text-(--app-muted) border border-(--app-border) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
            "
            @click="activeFilter = 'unread'"
          >
            Unread
            <span class="ml-1 opacity-80">({{ unreadTotal }})</span>
          </button>

          <button
            v-if="countPinned"
            type="button"
            class="rounded-xl px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
            :class="
              activeFilter === 'pinned'
                ? 'bg-(--app-primary) text-white shadow-xs'
                : 'bg-(--app-surface) text-(--app-muted) border border-(--app-border) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
            "
            @click="activeFilter = 'pinned'"
          >
            Pinned
            <span class="ml-1 opacity-80">({{ countPinned }})</span>
          </button>

          <button
            v-if="countDm"
            type="button"
            class="rounded-xl px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
            :class="
              activeFilter === 'dm'
                ? 'bg-(--app-primary) text-white shadow-xs'
                : 'bg-(--app-surface) text-(--app-muted) border border-(--app-border) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
            "
            @click="activeFilter = 'dm'"
          >
            Direct Messages
            <span class="ml-1 opacity-80">({{ countDm }})</span>
          </button>

          <button
            v-if="countGroups"
            type="button"
            class="rounded-xl px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
            :class="
              activeFilter === 'groups'
                ? 'bg-(--app-primary) text-white shadow-xs'
                : 'bg-(--app-surface) text-(--app-muted) border border-(--app-border) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
            "
            @click="activeFilter = 'groups'"
          >
            Groups
            <span class="ml-1 opacity-80">({{ countGroups }})</span>
          </button>
        </div>
      </div>

      <!-- Shimmer Skeleton Loading State -->
      <div v-if="inboxLoading" class="space-y-3">
        <div
          v-for="n in 4"
          :key="n"
          class="flex items-center gap-4 rounded-2xl border border-(--app-border) bg-(--app-surface) p-4"
        >
          <div class="h-12 w-12 shrink-0 rounded-2xl bg-(--app-surface-soft) animate-pulse" />
          <div class="min-w-0 flex-1 space-y-2">
            <div class="flex items-center justify-between">
              <div class="h-4 w-36 rounded-md bg-(--app-surface-soft) animate-pulse" />
              <div class="h-3 w-12 rounded-md bg-(--app-surface-soft)/60 animate-pulse" />
            </div>
            <div class="h-3 w-64 rounded-md bg-(--app-surface-soft)/60 animate-pulse" />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!searchActive && !conversations.length"
        class="flex flex-col items-center justify-center rounded-3xl border border-(--app-border) bg-(--app-surface) px-6 py-16 text-center shadow-xs"
      >
        <div
          class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--app-surface-soft) text-(--app-muted)"
        >
          <MessageCircle class="h-7 w-7" />
        </div>
        <h2 class="text-lg font-bold tracking-tight text-(--app-text)">No conversations yet</h2>
        <p class="mt-1 max-w-sm text-sm text-(--app-muted) leading-relaxed">
          Start an end-to-end encrypted chat with a friend’s public key, or share an invite link.
        </p>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-2xl bg-(--app-primary) px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-(--app-primary-strong) active:scale-95 cursor-pointer"
            @click="router.push('/chat/new')"
          >
            <SquarePen class="h-4 w-4" />
            <span>Start a chat</span>
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-2.5 text-sm font-semibold text-(--app-text-soft) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors cursor-pointer"
            @click="router.push('/invite/new')"
          >
            <UserPlus class="h-4 w-4" />
            <span>Share invite link</span>
          </button>
        </div>
      </div>

      <!-- Filter No Results -->
      <div
        v-else-if="!searchActive && !filteredConversations.length"
        class="flex flex-col items-center justify-center rounded-3xl border border-(--app-border) bg-(--app-surface) px-6 py-12 text-center shadow-xs"
      >
        <MessageSquare class="h-8 w-8 text-(--app-muted) mb-3" />
        <h2 class="text-base font-bold text-(--app-text)">No matching conversations</h2>
        <p class="mt-1 text-sm text-(--app-muted)">
          No conversations found in the "{{ activeFilter }}" filter.
        </p>
        <button
          type="button"
          class="mt-4 text-xs font-semibold text-(--app-primary) hover:underline cursor-pointer"
          @click="activeFilter = 'all'"
        >
          View all conversations
        </button>
      </div>

      <!-- Conversation List (Cards) -->
      <div v-else-if="!searchActive" class="space-y-3">
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
