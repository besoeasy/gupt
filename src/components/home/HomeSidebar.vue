<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { SquarePen, UserPlus } from "@lucide/vue";
import ChatSearchPanel from "@/components/chat/ChatSearchPanel.vue";
import HomeInboxSection from "@/components/home/HomeInboxSection.vue";
import { useConversations } from "@/composables/useConversations";

const router = useRouter();
const activeTab = ref("all");

const {
  initPromise,
  activeId,
  searchActive,
  conversations,
  unreadTotal,
  inboxLoading,
  refreshGroups,
  togglePin,
  openRoom,
  openProfile,
} = useConversations();

onMounted(async () => {
  await initPromise;
  void refreshGroups();
});
</script>

<template>
  <div
    class="flex h-full w-full min-w-0 flex-col border-r border-(--app-border) bg-(--app-surface) text-(--app-text)"
  >
    <!-- Fixed header: title bar + search -->
    <div class="shrink-0 border-b border-(--app-border) px-4 pt-4 pb-3 space-y-3">
      <div class="flex items-end justify-between gap-3">
        <div>
          <h1 class="text-[22px] font-bold tracking-tight leading-none">Messages</h1>
          <p class="mt-1.5 text-[11px] text-(--app-muted)">
            {{ conversations.length }} conversation{{ conversations.length !== 1 ? "s" : ""
            }}<span v-if="unreadTotal" class="text-(--app-primary)">
              · {{ unreadTotal }} unread</span
            >
          </p>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="inline-flex shrink-0 items-center justify-center h-9 w-9 rounded-full border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-all"
            title="Invite"
            aria-label="Invite"
            @click="router.push('/new/share')"
          >
            <UserPlus class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="inline-flex shrink-0 items-center justify-center h-9 w-9 rounded-full bg-(--app-primary) text-[#06101a] hover:bg-(--app-primary-strong) hover:text-white hover:scale-105 transition-all"
            title="New chat"
            aria-label="New chat"
            @click="router.push('/new/start')"
          >
            <SquarePen class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <ChatSearchPanel @active-change="searchActive = $event" />
    </div>

    <!-- Scrollable chat list -->
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-3">
      <HomeInboxSection
        v-model:active-tab="activeTab"
        :active-id="activeId"
        :search-active="searchActive"
        :loading="inboxLoading"
        :conversations="conversations"
        :unread-total="unreadTotal"
        @open-room="openRoom"
        @open-profile="openProfile"
        @refresh-groups="refreshGroups"
        @toggle-pin="togglePin"
      />
    </div>
  </div>
</template>
