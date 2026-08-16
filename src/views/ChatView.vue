<script setup>
import { computed } from "vue";
import { useChatView } from "@/composables/useChatView";
import ChatSidebar from "@/components/chatv2/ChatSidebar.vue";
import ChatConversation from "@/components/chatv2/ChatConversation.vue";

const { activeConversationId, activeType, activeRawId, selectConversation, closeConversation } =
  useChatView();

const hasActiveConversation = computed(() => Boolean(activeType.value && activeRawId.value));
</script>

<template>
  <div class="relative h-full w-full min-w-0 overflow-hidden bg-(--app-bg) text-(--app-text)">
    <main class="mx-auto flex h-full w-full max-w-6xl min-w-0 flex-col overflow-hidden">
      <!-- Conversation List View (/chat) -->
      <div v-if="!hasActiveConversation" class="h-full w-full">
        <ChatSidebar
          :active-conversation-id="activeConversationId"
          @select-conversation="selectConversation"
        />
      </div>

      <!-- Active Chat Conversation View (/chat/:conversationId) -->
      <div v-else class="h-full w-full">
        <ChatConversation
          :key="activeConversationId"
          :conversation-type="activeType"
          :conversation-id="activeRawId"
          @back="closeConversation"
        />
      </div>
    </main>
  </div>
</template>
