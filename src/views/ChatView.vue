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
  <div class="chat-view__block">
    <main class="chat-view__main">
      <!-- Conversation List View (/chat) -->
      <div v-if="!hasActiveConversation" class="chat-view__block-2">
        <ChatSidebar
          :active-conversation-id="activeConversationId"
          @select-conversation="selectConversation"
        />
      </div>

      <!-- Active Chat Conversation View (/chat/:conversationId) -->
      <div v-else class="chat-view__block-3">
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
@layer base, gupt-components;

@layer gupt-components {
.chat-view__block {
  position: relative;
}

.chat-view__main {
  margin-inline: auto;
}

.chat-view__main {
  display: flex;
}

.chat-view__block {
  height: 100%;
}

.chat-view__main {
  height: 100%;
}

.chat-view__block-2 {
  height: 100%;
}

.chat-view__block-3 {
  height: 100%;
}

.chat-view__block {
  width: 100%;
}

.chat-view__main {
  width: 100%;
}

.chat-view__block-2 {
  width: 100%;
}

.chat-view__block-3 {
  width: 100%;
}

.chat-view__main {
  max-width: var(--container-6xl);
}

.chat-view__block {
  min-width: 0;
}

.chat-view__main {
  min-width: 0;
}

.chat-view__main {
  flex-direction: column;
}

.chat-view__block {
  overflow: hidden;
}

.chat-view__main {
  overflow: hidden;
}

.chat-view__block {
  background-color: var(--app-bg);
}

.chat-view__block {
  color: var(--app-text);
}
}
</style>
