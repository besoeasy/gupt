<script setup>
import { computed, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { SquarePen, UserPlus, MessageSquare, Shield, CheckCheck } from "@lucide/vue";

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
  <div
    class="flex h-full w-full min-w-0 flex-col border-r border-(--app-border) bg-(--app-surface) text-(--app-text)"
  >
    <!-- Header bar -->
    <div class="shrink-0 border-b border-(--app-border) px-4 pt-4 pb-3 space-y-3">
      <div class="flex items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold tracking-tight leading-none">Messages</h1>
          <p class="mt-1.5 text-[11px] text-(--app-muted)">
            {{ conversations.length }} conversation{{ conversations.length !== 1 ? "s" : "" }}
            <span v-if="unreadTotal" class="text-(--app-primary) font-semibold">
              · {{ unreadTotal }} unread
            </span>
          </p>
        </div>

        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="inline-flex shrink-0 items-center justify-center h-8.5 w-8.5 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-all active:scale-95"
            title="Share Invite Link"
            aria-label="Share Invite Link"
            @click="router.push('/new/share')"
          >
            <UserPlus class="h-4 w-4" :stroke-width="2" />
          </button>
          <button
            type="button"
            class="inline-flex shrink-0 items-center justify-center h-8.5 w-8.5 rounded-2xl bg-(--app-primary) text-zinc-950 hover:bg-(--app-primary-strong) transition-all active:scale-95"
            title="Start New Chat"
            aria-label="Start New Chat"
            @click="router.push('/new/start')"
          >
            <SquarePen class="h-4 w-4" :stroke-width="2.2" />
          </button>
        </div>
      </div>

      <!-- Search Bar -->
      <ChatSearchPanel @active-change="searchActive = $event" />

      <!-- Filter Tabs (hidden when searching) -->
      <div v-if="!searchActive" class="flex items-center gap-1 overflow-x-auto pt-1 no-scrollbar">
        <button
          v-for="tab in [
            { key: 'all', label: 'All' },
            { key: 'unread', label: 'Unread', count: unreadTotal },
            { key: 'pinned', label: 'Pinned' },
            { key: 'dm', label: 'DMs' },
            { key: 'groups', label: 'Groups' },
          ]"
          :key="tab.key"
          type="button"
          @click="activeFilter = tab.key"
          class="shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all select-none"
          :class="
            activeFilter === tab.key
              ? 'bg-(--app-primary) text-zinc-950 shadow-sm'
              : 'bg-(--app-surface-soft) text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
          "
        >
          {{ tab.label }}
          <span v-if="tab.count" class="ml-1 rounded-full bg-zinc-950/20 px-1.5 py-0.2 text-[10px]">
            {{ tab.count }}
          </span>
        </button>
      </div>
    </div>

    <!-- Conversation List -->
    <div v-if="!searchActive" class="flex min-h-0 flex-1 flex-col overflow-y-auto p-2 space-y-1">
      <!-- Loading State -->
      <div
        v-if="inboxLoading"
        class="flex flex-col items-center justify-center py-12 text-center text-xs text-(--app-muted)"
      >
        <div
          class="h-5 w-5 animate-spin rounded-full border-2 border-(--app-border) border-t-(--app-primary) mb-3"
        />
        Loading conversations…
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!filteredConversations.length"
        class="flex flex-col items-center justify-center py-12 px-4 text-center"
      >
        <MessageSquare class="h-8 w-8 text-(--app-muted) mb-2" :stroke-width="1.5" />
        <p class="text-xs font-semibold text-(--app-text)">No conversations found</p>
        <p class="text-[11px] text-(--app-muted) mt-1">
          {{
            activeFilter !== "all"
              ? "Try switching filter tabs"
              : "Start a chat with a public key or invite link"
          }}
        </p>
      </div>

      <!-- Conversation Cards -->
      <template v-else>
        <ChatConversationCard
          v-for="conv in filteredConversations"
          :key="conv.id"
          :conv="conv"
          :active="isCardActive(conv)"
          @select="handleSelect(conv)"
          @toggle-pin="togglePin"
        />
      </template>
    </div>
  </div>
</template>
