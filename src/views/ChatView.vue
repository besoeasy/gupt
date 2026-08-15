<script setup>
import { computed } from "vue";
import { useChatView } from "@/composables/useChatView";
import ChatSidebar from "@/components/chatv2/ChatSidebar.vue";
import ChatConversation from "@/components/chatv2/ChatConversation.vue";
import ChatEmptyState from "@/components/chatv2/ChatEmptyState.vue";

const {
  isDesktop,
  activeConversationId,
  activeType,
  activeRawId,
  selectConversation,
  closeConversation,
} = useChatView();

const hasActiveConversation = computed(() => Boolean(activeType.value && activeRawId.value));
</script>

<template>
  <div class="relative h-full w-full min-w-0 overflow-hidden bg-(--app-bg) text-(--app-text)">
    <!-- Desktop Layout (>= 1024px): Side-by-side persistent panels in max-w-6xl container -->
    <div
      v-if="isDesktop"
      class="mx-auto flex h-full w-full max-w-6xl min-w-0 overflow-hidden border-x border-(--app-border)"
    >
      <!-- Left Panel: Sidebar (inbox list) -->
      <aside class="h-full min-h-0 w-[320px] shrink-0 xl:w-[360px]">
        <ChatSidebar
          :active-conversation-id="activeConversationId"
          @select-conversation="selectConversation"
        />
      </aside>

      <!-- Right Panel: Active Chat or Empty State -->
      <main class="h-full min-h-0 min-w-0 flex-1 border-l border-(--app-border)">
        <ChatConversation
          v-if="hasActiveConversation"
          :key="activeConversationId"
          :conversation-type="activeType"
          :conversation-id="activeRawId"
          @back="closeConversation"
        />
        <ChatEmptyState v-else />
      </main>
    </div>

    <!-- Mobile Layout (< 1024px): Single active panel view -->
    <div v-else class="relative h-full w-full min-w-0 overflow-hidden">
      <!-- Sidebar Panel (Default / Inbox) -->
      <div v-if="!hasActiveConversation" class="h-full w-full">
        <ChatSidebar
          :active-conversation-id="activeConversationId"
          @select-conversation="selectConversation"
        />
      </div>

      <!-- Active Chat Panel (Full screen on mobile) -->
      <div v-else class="h-full w-full">
        <ChatConversation
          :key="activeConversationId"
          :conversation-type="activeType"
          :conversation-id="activeRawId"
          @back="closeConversation"
        />
      </div>
    </div>
  </div>
</template>
