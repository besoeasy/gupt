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
  <div class="chat-view">
    <main class="chat-view__main">
      <!-- Conversation List View (/chat) -->
      <div v-if="!hasActiveConversation" class="chat-view__pane">
        <ChatSidebar
          :active-conversation-id="activeConversationId"
          @select-conversation="selectConversation"
        />
      </div>

      <!-- Active Chat Conversation View (/chat/:conversationId) -->
      <div v-else class="chat-view__pane">
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

<style scoped>
/* Ledger pass: the chat shell is a full-height column with no chrome of its own. */

.chat-view {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  background: var(--app-bg);
  color: var(--app-text);
  overflow: hidden;
}

.chat-view__main {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  max-width: 72rem;
  margin-inline: auto;
  overflow: hidden;
}

.chat-view__pane {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
