<script setup>
import { computed, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { SquarePen, MessageCircle, UserPlus } from "@lucide/vue";

import ChatSearchPanel from "@/components/chat/ChatSearchPanel.vue";
import ChatConversationCard from "@/components/chatv2/ChatConversationCard.vue";
import { useConversations } from "@/composables/useConversations";

const props = defineProps({
  activeConversationId: { type: String, default: "" },
});

const emit = defineEmits(["select-conversation"]);

const router = useRouter();

const { initPromise, conversations, unreadTotal, inboxLoading, refreshGroups, togglePin } =
  useConversations();

const searchActive = ref(false);

onMounted(async () => {
  await initPromise;
  void refreshGroups();
});

const pinnedConversations = computed(() => (conversations.value || []).filter((c) => c.pinned));
const regularConversations = computed(() => (conversations.value || []).filter((c) => !c.pinned));

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
    <div class="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6 space-y-4">
      <!-- Header Section -->
      <div class="flex items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-95 cursor-pointer"
            title="Start New Chat"
            @click="router.push('/chat/new')"
          >
            <SquarePen class="h-3.5 w-3.5" :stroke-width="2.2" />
            <span>New Chat</span>
          </button>

          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95 cursor-pointer"
            title="Invite someone"
            @click="router.push('/inin')"
          >
            <UserPlus class="h-3.5 w-3.5" :stroke-width="2" />
            <span>Invite</span>
          </button>
        </div>

        <p
          v-if="conversations.length"
          class="hidden sm:flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500 whitespace-nowrap"
        >
          <span>{{ conversations.length }} chats</span>
          <span class="text-zinc-600">·</span>
          <span :class="unreadTotal ? 'text-emerald-400' : ''">{{ unreadTotal }} unread</span>
        </p>
      </div>

      <!-- Search -->
      <ChatSearchPanel @active-change="searchActive = $event" />

      <!-- Loading -->
      <div
        v-if="inboxLoading"
        class="divide-y divide-zinc-800/60 border-y border-zinc-800/60"
        role="status"
      >
        <span class="sr-only">Loading conversations…</span>
        <div v-for="n in 7" :key="n" class="flex items-center gap-3 px-2 py-2.5" aria-hidden="true">
          <div class="skeleton-shimmer h-10 w-10 shrink-0 rounded-xl" />
          <div class="flex-1 min-w-0 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="skeleton-shimmer h-3 w-28 sm:w-36" />
              <div class="skeleton-shimmer h-2.5 w-8 shrink-0" />
            </div>
            <div class="skeleton-shimmer h-2.5 w-48 sm:w-64 max-w-full" />
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
          Start an end-to-end encrypted chat with a friend’s public key or domain.
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
            class="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95 cursor-pointer"
            title="Invite someone"
            @click="router.push('/inin')"
          >
            <UserPlus class="h-3.5 w-3.5" :stroke-width="2" />
            <span>Invite</span>
          </button>
        </div>
      </div>

      <!-- Conversation Streams -->
      <div v-else-if="!searchActive" class="pt-0.5">
        <!-- Pinned -->
        <template v-if="pinnedConversations.length">
          <div class="flex items-center gap-3 px-1 pt-1 pb-1.5">
            <p class="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Pinned</p>
            <span class="h-px flex-1 bg-zinc-800/60" />
            <span class="font-mono text-[10px] tabular-nums text-zinc-600">{{
              pinnedConversations.length
            }}</span>
          </div>

          <TransitionGroup
            tag="div"
            class="divide-y divide-zinc-800/60 border-y border-zinc-800/60"
            move-class="app-reorder-move"
          >
            <ChatConversationCard
              v-for="(conv, index) in pinnedConversations"
              :key="conv.id"
              class="app-list-item"
              :style="{ '--app-item-delay': `${Math.min(index, 8) * 28}ms` }"
              :conv="conv"
              :active="isCardActive(conv)"
              @select="handleSelect(conv)"
              @toggle-pin="togglePin"
            />
          </TransitionGroup>
        </template>

        <!-- All -->
        <template v-if="regularConversations.length">
          <div
            class="flex items-center gap-3 px-1 pb-1.5"
            :class="pinnedConversations.length ? 'pt-4' : 'pt-1'"
          >
            <p class="font-mono text-[10px] uppercase tracking-wider text-zinc-500">All</p>
            <span class="h-px flex-1 bg-zinc-800/60" />
            <span class="font-mono text-[10px] tabular-nums text-zinc-600">{{
              regularConversations.length
            }}</span>
          </div>

          <TransitionGroup
            tag="div"
            class="divide-y divide-zinc-800/60 border-y border-zinc-800/60"
            move-class="app-reorder-move"
          >
            <ChatConversationCard
              v-for="(conv, index) in regularConversations"
              :key="conv.id"
              class="app-list-item"
              :style="{ '--app-item-delay': `${Math.min(index, 8) * 28}ms` }"
              :conv="conv"
              :active="isCardActive(conv)"
              @select="handleSelect(conv)"
              @toggle-pin="togglePin"
            />
          </TransitionGroup>
        </template>
      </div>
    </div>
  </div>
</template>
