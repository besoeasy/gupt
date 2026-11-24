<script setup>
import { computed, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { SquarePen, MessageCircle, UserPlus } from "@/icons";

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
  <div class="chat-sidebar">
    <div class="chat-sidebar__content">
      <!-- Header Section -->
      <div class="chat-sidebar__header">
        <div class="chat-sidebar__actions">
          <button
            type="button"
            class="chat-sidebar__compose-button"
            title="Start New Chat"
            @click="router.push('/chat/new')"
          >
            <SquarePen class="chat-sidebar__compose-icon" :stroke-width="2.2" />
            <span>New Chat</span>
          </button>

          <button
            type="button"
            class="chat-sidebar__invite-button"
            title="Invites & Connect"
            @click="router.push('/inin')"
          >
            <UserPlus class="chat-sidebar__invite-icon" :stroke-width="2" />
            <span>Invite</span>
          </button>
        </div>

        <p
          v-if="conversations.length"
          class="chat-sidebar__stats"
        >
          <span>{{ conversations.length }} chats</span>
          <span class="chat-sidebar__stats-sep">·</span>
          <span :class="unreadTotal ? 'chat-sidebar__stats-count--unread' : ''">{{ unreadTotal }} unread</span>
        </p>
      </div>

      <!-- Search -->
      <ChatSearchPanel @active-change="searchActive = $event" />

      <!-- Loading -->
      <div
        v-if="inboxLoading"
        class="chat-sidebar__loading"
        role="status"
      >
        <span class="chat-sidebar__visually-hidden">Loading conversations…</span>
        <div v-for="n in 7" :key="n" class="chat-sidebar__skeleton-row" aria-hidden="true">
          <div class="skeleton-shimmer chat-sidebar__skeleton-avatar" />
          <div class="chat-sidebar__skeleton-body">
            <div class="chat-sidebar__skeleton-head">
              <div class="skeleton-shimmer chat-sidebar__skeleton-title" />
              <div class="skeleton-shimmer chat-sidebar__skeleton-time" />
            </div>
            <div class="skeleton-shimmer chat-sidebar__skeleton-line" />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!searchActive && !conversations.length"
        class="chat-sidebar__empty"
      >
        <div
          class="chat-sidebar__empty-icon"
        >
          <MessageCircle class="chat-sidebar__empty-glyph" />
        </div>
        <h2 class="chat-sidebar__empty-title">No conversations yet</h2>
        <p class="chat-sidebar__empty-lede">
          Start an end-to-end encrypted chat with a friend’s public key or domain.
        </p>
        <div class="chat-sidebar__empty-actions">
          <button
            type="button"
            class="chat-sidebar__empty-compose"
            @click="router.push('/chat/new')"
          >
            <SquarePen class="chat-sidebar__empty-compose-icon" />
            <span>Start a chat</span>
          </button>

          <button
            type="button"
            class="chat-sidebar__empty-invite"
            title="Invites & Connect"
            @click="router.push('/inin')"
          >
            <UserPlus class="chat-sidebar__empty-invite-icon" :stroke-width="2" />
            <span>Invite</span>
          </button>
        </div>
      </div>

      <!-- Conversation Streams -->
      <div v-else-if="!searchActive" class="chat-sidebar__streams">
        <!-- Pinned -->
        <template v-if="pinnedConversations.length">
          <div class="chat-sidebar__pinned-head">
            <p class="chat-sidebar__pinned-label">Pinned</p>
            <span class="chat-sidebar__pinned-rule" />
            <span class="chat-sidebar__pinned-count">{{
              pinnedConversations.length
            }}</span>
          </div>

          <TransitionGroup
            tag="div"
            class="chat-sidebar__pinned-list"
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
            class="chat-sidebar__all-head"
            :class="pinnedConversations.length ? 'chat-sidebar__all-head--with-pins' : 'chat-sidebar__all-head--plain'"
          >
            <p class="chat-sidebar__all-label">All</p>
            <span class="chat-sidebar__all-rule" />
            <span class="chat-sidebar__all-count">{{
              regularConversations.length
            }}</span>
          </div>

          <TransitionGroup
            tag="div"
            class="chat-sidebar__all-list"
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

<style scoped>
.chat-sidebar {
  width: 100%;
  height: 100%;
  min-width: 0;
  padding-bottom: 4rem;
  overflow-y: auto;
  background: var(--app-bg);
  color: var(--app-text);
}

.chat-sidebar__content {
  width: 100%;
  max-width: 72rem;
  margin-inline: auto;
  padding: 1.5rem 1rem;
}

.chat-sidebar__content > :not(:last-child) {
  margin-bottom: 1.25rem;
}

.chat-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.chat-sidebar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.chat-sidebar__compose-button,
.chat-sidebar__empty-compose {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  border-radius: var(--app-radius-lg);
  background: var(--app-text);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.5;
  color: var(--app-bg);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.chat-sidebar__compose-button {
  height: 32px;
  padding-inline: 0.75rem;
  border-radius: var(--app-radius-sm);
  font-size: 10px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
}

.chat-sidebar__empty-compose {
  padding: 0.375rem 0.875rem;
  box-shadow: 0 1px 2px 0 #0000000d;
}

.chat-sidebar__invite-button,
.chat-sidebar__empty-invite {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  border: 1px solid var(--app-surface-raised);
  border-radius: var(--app-radius-lg);
  background: var(--app-surface-tint);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.5;
  color: var(--app-text-soft);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.chat-sidebar__invite-button {
  height: 2rem;
  padding-inline: 0.75rem;
  box-shadow: 0 1px 2px 0 #0000000d;
}

.chat-sidebar__empty-invite {
  padding: 0.375rem 0.875rem;
}

.chat-sidebar__compose-icon,
.chat-sidebar__invite-icon,
.chat-sidebar__empty-compose-icon,
.chat-sidebar__empty-invite-icon {
  width: 0.875rem;
  height: 0.875rem;
}

.chat-sidebar__stats {
  display: none;
  align-items: center;
  gap: 0.375rem;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--app-muted-2);
}

.chat-sidebar__stats-sep {
  color: var(--app-muted-2);
}

.chat-sidebar__stats-count--unread {
  color: var(--app-success);
}

.chat-sidebar__visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.chat-sidebar__loading {
  border-block: 1px solid var(--app-border-faint);
}

.chat-sidebar__loading > :not(:last-child) {
  border-bottom: 1px solid var(--app-border-faint);
}

.chat-sidebar__skeleton-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.5rem;
}

.chat-sidebar__skeleton-avatar {
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  border-radius: 18px;
}

.chat-sidebar__skeleton-body {
  flex: 1;
  min-width: 0;
}

.chat-sidebar__skeleton-body > :not(:last-child) {
  margin-bottom: 0.5rem;
}

.chat-sidebar__skeleton-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.chat-sidebar__skeleton-title {
  width: 7rem;
  height: 0.75rem;
}

.chat-sidebar__skeleton-time {
  width: 2rem;
  height: 0.625rem;
  flex-shrink: 0;
}

.chat-sidebar__skeleton-line {
  width: 12rem;
  max-width: 100%;
  height: 0.625rem;
}

.chat-sidebar__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3.5rem 1.5rem;
  border: 1px solid var(--app-surface-raised);
  border-radius: 18px;
  background: var(--app-surface-inset-strong);
  text-align: center;
  box-shadow: 0 1px 2px 0 #0000000d;
}

.chat-sidebar__empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  margin-bottom: 0.875rem;
  border: 1px solid var(--app-surface-raised);
  border-radius: var(--app-radius-lg);
  background: var(--app-surface);
  color: var(--app-text-soft);
}

.chat-sidebar__empty-glyph {
  width: 1.25rem;
  height: 1.25rem;
}

.chat-sidebar__empty-title {
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.55;
  letter-spacing: -0.025em;
  color: var(--app-text);
}

.chat-sidebar__empty-lede {
  max-width: 24rem;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  line-height: 1.625;
  color: var(--app-muted);
}

.chat-sidebar__empty-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  margin-top: 1.25rem;
}

.chat-sidebar__streams {
  padding-top: 0.125rem;
}

.chat-sidebar__pinned-head,
.chat-sidebar__all-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-inline: 0.25rem;
  padding-bottom: 0.375rem;
}

.chat-sidebar__pinned-head {
  padding-top: 0.25rem;
}

.chat-sidebar__all-head--with-pins {
  padding-top: 1rem;
}

.chat-sidebar__all-head--plain {
  padding-top: 0.25rem;
}

.chat-sidebar__pinned-label,
.chat-sidebar__all-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.chat-sidebar__pinned-rule,
.chat-sidebar__all-rule {
  height: 1px;
  flex: 1;
  background: var(--app-border);
}

.chat-sidebar__pinned-count,
.chat-sidebar__all-count {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
  color: var(--app-muted-2);
}

.chat-sidebar__pinned-list,
.chat-sidebar__all-list {
  border-block: 1px solid var(--app-border-faint);
}

.chat-sidebar__pinned-list > :not(:last-child),
.chat-sidebar__all-list > :not(:last-child) {
  border-bottom: 1px solid var(--app-border-faint);
}

.chat-sidebar__compose-button:active,
.chat-sidebar__invite-button:active,
.chat-sidebar__empty-compose:active,
.chat-sidebar__empty-invite:active {
  scale: 0.95;
}

.chat-sidebar__compose-button:focus-visible,
.chat-sidebar__invite-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 2px;
}

@media (min-width: 40rem) {
  .chat-sidebar__content {
    padding-inline: 1.5rem;
  }

  .chat-sidebar__stats {
    display: flex;
  }

  .chat-sidebar__skeleton-title {
    width: 9rem;
  }

  .chat-sidebar__skeleton-line {
    width: 16rem;
  }
}

@media (min-width: 64rem) {
  .chat-sidebar__content {
    padding-inline: 2rem;
  }
}

@media (hover: hover) {
  .chat-sidebar__invite-button:hover,
  .chat-sidebar__empty-invite:hover {
    border-color: var(--app-border-strong);
    background: var(--app-surface-soft);
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .chat-sidebar__compose-button,
  .chat-sidebar__invite-button {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-sidebar__compose-button,
  .chat-sidebar__empty-compose,
  .chat-sidebar__invite-button,
  .chat-sidebar__empty-invite {
    transition: none;
  }
}

[data-theme="light"] .chat-sidebar__stats,
[data-theme="light"] .chat-sidebar__pinned-label,
[data-theme="light"] .chat-sidebar__all-label,
[data-theme="light"] .chat-sidebar__pinned-count,
[data-theme="light"] .chat-sidebar__all-count,
[data-theme="light"] .chat-sidebar__empty-icon {
  color: var(--app-muted);
}

[data-theme="light"] .chat-sidebar__stats-sep {
  color: var(--app-text-soft);
}
</style>

