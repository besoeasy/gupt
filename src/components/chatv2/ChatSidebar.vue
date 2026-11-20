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
  <div class="chat-sidebar__block">
    <div class="chat-sidebar__block-2">
      <!-- Header Section -->
      <div class="chat-sidebar__block-3">
        <div class="chat-sidebar__block-4">
          <button
            type="button"
            class="chat-sidebar__button-start-new"
            title="Start New Chat"
            @click="router.push('/chat/new')"
          >
            <SquarePen class="chat-sidebar__square-pen" :stroke-width="2.2" />
            <span>New Chat</span>
          </button>

          <button
            type="button"
            class="chat-sidebar__button-invites-connect"
            title="Invites & Connect"
            @click="router.push('/inin')"
          >
            <UserPlus class="chat-sidebar__user-plus" :stroke-width="2" />
            <span>Invite</span>
          </button>
        </div>

        <p
          v-if="conversations.length"
          class="chat-sidebar__text"
        >
          <span>{{ conversations.length }} chats</span>
          <span class="chat-sidebar__text-2">·</span>
          <span :class="unreadTotal ? 'chat-sidebar__text-unread--success' : ''">{{ unreadTotal }} unread</span>
        </p>
      </div>

      <!-- Search -->
      <ChatSearchPanel @active-change="searchActive = $event" />

      <!-- Loading -->
      <div
        v-if="inboxLoading"
        class="chat-sidebar__status"
        role="status"
      >
        <span class="chat-sidebar__text-3">Loading conversations…</span>
        <div v-for="n in 7" :key="n" class="chat-sidebar__block-5" aria-hidden="true">
          <div class="skeleton-shimmer chat-sidebar__block-6" />
          <div class="chat-sidebar__block-7">
            <div class="chat-sidebar__block-8">
              <div class="skeleton-shimmer chat-sidebar__block-9" />
              <div class="skeleton-shimmer chat-sidebar__block-10" />
            </div>
            <div class="skeleton-shimmer chat-sidebar__block-11" />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!searchActive && !conversations.length"
        class="chat-sidebar__block-12"
      >
        <div
          class="chat-sidebar__block-13"
        >
          <MessageCircle class="chat-sidebar__message-circle" />
        </div>
        <h2 class="chat-sidebar__subtitle-no-conversations">No conversations yet</h2>
        <p class="chat-sidebar__text-4">
          Start an end-to-end encrypted chat with a friend’s public key or domain.
        </p>
        <div class="chat-sidebar__block-14">
          <button
            type="button"
            class="chat-sidebar__button"
            @click="router.push('/chat/new')"
          >
            <SquarePen class="chat-sidebar__square-pen-2" />
            <span>Start a chat</span>
          </button>

          <button
            type="button"
            class="chat-sidebar__button-invites-connect-2"
            title="Invites & Connect"
            @click="router.push('/inin')"
          >
            <UserPlus class="chat-sidebar__user-plus-2" :stroke-width="2" />
            <span>Invite</span>
          </button>
        </div>
      </div>

      <!-- Conversation Streams -->
      <div v-else-if="!searchActive" class="chat-sidebar__block-15">
        <!-- Pinned -->
        <template v-if="pinnedConversations.length">
          <div class="chat-sidebar__block-16">
            <p class="chat-sidebar__text-pinned">Pinned</p>
            <span class="chat-sidebar__text-5" />
            <span class="chat-sidebar__text-6">{{
              pinnedConversations.length
            }}</span>
          </div>

          <TransitionGroup
            tag="div"
            class="chat-sidebar__transition-group"
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
            class="chat-sidebar__block-17"
            :class="pinnedConversations.length ? 'chat-sidebar__block--variant-1' : 'chat-sidebar__block--variant-2'"
          >
            <p class="chat-sidebar__text-all">All</p>
            <span class="chat-sidebar__text-7" />
            <span class="chat-sidebar__text-8">{{
              regularConversations.length
            }}</span>
          </div>

          <TransitionGroup
            tag="div"
            class="chat-sidebar__transition-group-2"
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
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
:where(.chat-sidebar__status>:not(:last-child)) {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
:where(.chat-sidebar__transition-group>:not(:last-child)) {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
:where(.chat-sidebar__transition-group-2>:not(:last-child)) {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-sidebar__status {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-sidebar__transition-group {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-sidebar__transition-group-2 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-sidebar__text-5 {
  background-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-sidebar__text-7 {
  background-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-sidebar__button-invites-connect {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-sidebar__button-invites-connect-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-sidebar__block-12 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 60%,transparent);
}
}

@media (hover:hover) {
.chat-sidebar__button-invites-connect:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-sidebar__button-invites-connect-2:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-sidebar__button-start-new:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.chat-sidebar__button:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.chat-sidebar__button-invites-connect:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-sidebar__button-invites-connect-2:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-sidebar__button-invites-connect:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-sidebar__button-invites-connect-2:hover {
  color: var(--color-white);
}
}

@media (min-width:40rem) {
.chat-sidebar__text {
  display: flex;
}
}

@media (min-width:40rem) {
.chat-sidebar__block-9 {
  width: calc(var(--spacing) * 36);
}
}

@media (min-width:40rem) {
.chat-sidebar__block-11 {
  width: calc(var(--spacing) * 64);
}
}

@media (min-width:40rem) {
.chat-sidebar__block-2 {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.chat-sidebar__block-2 {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.chat-sidebar__text-3 {
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  position: absolute;
  overflow: hidden;
}
.chat-sidebar__block-2 {
  margin-inline: auto;
}
.chat-sidebar__text-4 {
  margin-top: var(--spacing);
}
.chat-sidebar__block-14 {
  margin-top: calc(var(--spacing) * 5);
}
.chat-sidebar__block-13 {
  margin-bottom: calc(var(--spacing) * 3.5);
}
.chat-sidebar__block-3 {
  display: flex;
}
.chat-sidebar__block-4 {
  display: flex;
}
.chat-sidebar__block-5 {
  display: flex;
}
.chat-sidebar__block-8 {
  display: flex;
}
.chat-sidebar__block-12 {
  display: flex;
}
.chat-sidebar__block-13 {
  display: flex;
}
.chat-sidebar__block-14 {
  display: flex;
}
.chat-sidebar__block-16 {
  display: flex;
}
.chat-sidebar__block-17 {
  display: flex;
}
.chat-sidebar__text {
  display: none;
}
.chat-sidebar__button-start-new {
  display: inline-flex;
}
.chat-sidebar__button-invites-connect {
  display: inline-flex;
}
.chat-sidebar__button {
  display: inline-flex;
}
.chat-sidebar__button-invites-connect-2 {
  display: inline-flex;
}
.chat-sidebar__block-10 {
  height: calc(var(--spacing) * 2.5);
}
.chat-sidebar__block-11 {
  height: calc(var(--spacing) * 2.5);
}
.chat-sidebar__block-9 {
  height: calc(var(--spacing) * 3);
}
.chat-sidebar__square-pen {
  height: calc(var(--spacing) * 3.5);
}
.chat-sidebar__user-plus {
  height: calc(var(--spacing) * 3.5);
}
.chat-sidebar__square-pen-2 {
  height: calc(var(--spacing) * 3.5);
}
.chat-sidebar__user-plus-2 {
  height: calc(var(--spacing) * 3.5);
}
.chat-sidebar__message-circle {
  height: calc(var(--spacing) * 5);
}
.chat-sidebar__button-start-new {
  height: calc(var(--spacing) * 8);
}
.chat-sidebar__button-invites-connect {
  height: calc(var(--spacing) * 8);
}
.chat-sidebar__block-6 {
  height: calc(var(--spacing) * 10);
}
.chat-sidebar__block-13 {
  height: calc(var(--spacing) * 11);
}
.chat-sidebar__block {
  height: 100%;
}
.chat-sidebar__text-5 {
  height: 1px;
}
.chat-sidebar__text-7 {
  height: 1px;
}
.chat-sidebar__square-pen {
  width: calc(var(--spacing) * 3.5);
}
.chat-sidebar__user-plus {
  width: calc(var(--spacing) * 3.5);
}
.chat-sidebar__square-pen-2 {
  width: calc(var(--spacing) * 3.5);
}
.chat-sidebar__user-plus-2 {
  width: calc(var(--spacing) * 3.5);
}
.chat-sidebar__message-circle {
  width: calc(var(--spacing) * 5);
}
.chat-sidebar__block-10 {
  width: calc(var(--spacing) * 8);
}
.chat-sidebar__block-6 {
  width: calc(var(--spacing) * 10);
}
.chat-sidebar__block-13 {
  width: calc(var(--spacing) * 11);
}
.chat-sidebar__block-9 {
  width: calc(var(--spacing) * 28);
}
.chat-sidebar__block-11 {
  width: calc(var(--spacing) * 48);
}
.chat-sidebar__block {
  width: 100%;
}
.chat-sidebar__block-2 {
  width: 100%;
}
.chat-sidebar__block-2 {
  max-width: var(--container-6xl);
}
.chat-sidebar__block-11 {
  max-width: 100%;
}
.chat-sidebar__text-4 {
  max-width: var(--container-sm);
}
.chat-sidebar__block {
  min-width: 0;
}
.chat-sidebar__block-7 {
  min-width: 0;
}
.chat-sidebar__block-7 {
  flex: 1;
}
.chat-sidebar__text-5 {
  flex: 1;
}
.chat-sidebar__text-7 {
  flex: 1;
}
.chat-sidebar__block-6 {
  flex-shrink: 0;
}
.chat-sidebar__block-10 {
  flex-shrink: 0;
}
.chat-sidebar__button-start-new {
  cursor: pointer;
}
.chat-sidebar__button-invites-connect {
  cursor: pointer;
}
.chat-sidebar__button {
  cursor: pointer;
}
.chat-sidebar__button-invites-connect-2 {
  cursor: pointer;
}
.chat-sidebar__block-12 {
  flex-direction: column;
}
.chat-sidebar__block-4 {
  flex-wrap: wrap;
}
.chat-sidebar__block-14 {
  flex-wrap: wrap;
}
.chat-sidebar__block-3 {
  align-items: center;
}
.chat-sidebar__block-4 {
  align-items: center;
}
.chat-sidebar__button-start-new {
  align-items: center;
}
.chat-sidebar__button-invites-connect {
  align-items: center;
}
.chat-sidebar__text {
  align-items: center;
}
.chat-sidebar__block-5 {
  align-items: center;
}
.chat-sidebar__block-8 {
  align-items: center;
}
.chat-sidebar__block-12 {
  align-items: center;
}
.chat-sidebar__block-13 {
  align-items: center;
}
.chat-sidebar__block-14 {
  align-items: center;
}
.chat-sidebar__button {
  align-items: center;
}
.chat-sidebar__button-invites-connect-2 {
  align-items: center;
}
.chat-sidebar__block-16 {
  align-items: center;
}
.chat-sidebar__block-17 {
  align-items: center;
}
.chat-sidebar__block-3 {
  justify-content: space-between;
}
.chat-sidebar__block-8 {
  justify-content: space-between;
}
.chat-sidebar__block-12 {
  justify-content: center;
}
.chat-sidebar__block-13 {
  justify-content: center;
}
.chat-sidebar__block-14 {
  justify-content: center;
}
.chat-sidebar__button-start-new {
  gap: calc(var(--spacing) * 1.5);
}
.chat-sidebar__button-invites-connect {
  gap: calc(var(--spacing) * 1.5);
}
.chat-sidebar__text {
  gap: calc(var(--spacing) * 1.5);
}
.chat-sidebar__button {
  gap: calc(var(--spacing) * 1.5);
}
.chat-sidebar__button-invites-connect-2 {
  gap: calc(var(--spacing) * 1.5);
}
.chat-sidebar__block-4 {
  gap: calc(var(--spacing) * 2);
}
.chat-sidebar__block-8 {
  gap: calc(var(--spacing) * 2);
}
.chat-sidebar__block-14 {
  gap: calc(var(--spacing) * 2.5);
}
.chat-sidebar__block-3 {
  gap: calc(var(--spacing) * 3);
}
.chat-sidebar__block-5 {
  gap: calc(var(--spacing) * 3);
}
.chat-sidebar__block-16 {
  gap: calc(var(--spacing) * 3);
}
.chat-sidebar__block-17 {
  gap: calc(var(--spacing) * 3);
}
:where(.chat-sidebar__block-7>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.chat-sidebar__block-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.chat-sidebar__status>:not(:last-child)) {
  --divide-y-reverse: 0;
  border-bottom-style: var(--border-style,solid);
  border-top-style: var(--border-style,solid);
  border-top-width: calc(1px * 0);
  border-bottom-width: calc(1px * calc(1 - 0));
}
:where(.chat-sidebar__transition-group>:not(:last-child)) {
  --divide-y-reverse: 0;
  border-bottom-style: var(--border-style,solid);
  border-top-style: var(--border-style,solid);
  border-top-width: calc(1px * 0);
  border-bottom-width: calc(1px * calc(1 - 0));
}
:where(.chat-sidebar__transition-group-2>:not(:last-child)) {
  --divide-y-reverse: 0;
  border-bottom-style: var(--border-style,solid);
  border-top-style: var(--border-style,solid);
  border-top-width: calc(1px * 0);
  border-bottom-width: calc(1px * calc(1 - 0));
}
:where(.chat-sidebar__status>:not(:last-child)) {
  border-color: var(--ui-zinc-800);
}
:where(.chat-sidebar__transition-group>:not(:last-child)) {
  border-color: var(--ui-zinc-800);
}
:where(.chat-sidebar__transition-group-2>:not(:last-child)) {
  border-color: var(--ui-zinc-800);
}
.chat-sidebar__block {
  overflow-y: auto;
}
.chat-sidebar__button-start-new {
  border-radius: var(--radius-lg);
}
.chat-sidebar__button-invites-connect {
  border-radius: var(--radius-lg);
}
.chat-sidebar__block-13 {
  border-radius: var(--radius-lg);
}
.chat-sidebar__button {
  border-radius: var(--radius-lg);
}
.chat-sidebar__button-invites-connect-2 {
  border-radius: var(--radius-lg);
}
.chat-sidebar__block-6 {
  border-radius: var(--radius-xl);
}
.chat-sidebar__block-12 {
  border-radius: var(--radius-xl);
}
.chat-sidebar__button-invites-connect {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-sidebar__block-12 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-sidebar__block-13 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-sidebar__button-invites-connect-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-sidebar__status {
  border-block-style: var(--border-style,solid);
  border-block-width: 1px;
}
.chat-sidebar__transition-group {
  border-block-style: var(--border-style,solid);
  border-block-width: 1px;
}
.chat-sidebar__transition-group-2 {
  border-block-style: var(--border-style,solid);
  border-block-width: 1px;
}
.chat-sidebar__button-invites-connect {
  border-color: var(--ui-zinc-800);
}
.chat-sidebar__block-12 {
  border-color: var(--ui-zinc-800);
}
.chat-sidebar__block-13 {
  border-color: var(--ui-zinc-800);
}
.chat-sidebar__button-invites-connect-2 {
  border-color: var(--ui-zinc-800);
}
.chat-sidebar__status {
  border-color: var(--ui-zinc-800);
}
.chat-sidebar__transition-group {
  border-color: var(--ui-zinc-800);
}
.chat-sidebar__transition-group-2 {
  border-color: var(--ui-zinc-800);
}
.chat-sidebar__block {
  background-color: var(--ui-black);
}
.chat-sidebar__button-start-new {
  background-color: var(--color-white);
}
.chat-sidebar__button {
  background-color: var(--color-white);
}
.chat-sidebar__text-5 {
  background-color: var(--ui-zinc-800);
}
.chat-sidebar__text-7 {
  background-color: var(--ui-zinc-800);
}
.chat-sidebar__block-13 {
  background-color: var(--ui-zinc-900);
}
.chat-sidebar__button-invites-connect {
  background-color: var(--ui-zinc-900);
}
.chat-sidebar__button-invites-connect-2 {
  background-color: var(--ui-zinc-900);
}
.chat-sidebar__block-12 {
  background-color: var(--ui-zinc-950);
}
.chat-sidebar__block-16 {
  padding-inline: var(--spacing);
}
.chat-sidebar__block-17 {
  padding-inline: var(--spacing);
}
.chat-sidebar__block-5 {
  padding-inline: calc(var(--spacing) * 2);
}
.chat-sidebar__button-start-new {
  padding-inline: calc(var(--spacing) * 3);
}
.chat-sidebar__button-invites-connect {
  padding-inline: calc(var(--spacing) * 3);
}
.chat-sidebar__button {
  padding-inline: calc(var(--spacing) * 3.5);
}
.chat-sidebar__button-invites-connect-2 {
  padding-inline: calc(var(--spacing) * 3.5);
}
.chat-sidebar__block-2 {
  padding-inline: calc(var(--spacing) * 4);
}
.chat-sidebar__block-12 {
  padding-inline: calc(var(--spacing) * 6);
}
.chat-sidebar__button {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-sidebar__button-invites-connect-2 {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-sidebar__block-5 {
  padding-block: calc(var(--spacing) * 2.5);
}
.chat-sidebar__block-2 {
  padding-block: calc(var(--spacing) * 6);
}
.chat-sidebar__block-12 {
  padding-block: calc(var(--spacing) * 14);
}
.chat-sidebar__block-15 {
  padding-top: calc(var(--spacing) * .5);
}
.chat-sidebar__block-16 {
  padding-top: var(--spacing);
}
.chat-sidebar__block--variant-2 {
  padding-top: var(--spacing);
}
.chat-sidebar__block--variant-1 {
  padding-top: calc(var(--spacing) * 4);
}
.chat-sidebar__block-16 {
  padding-bottom: calc(var(--spacing) * 1.5);
}
.chat-sidebar__block-17 {
  padding-bottom: calc(var(--spacing) * 1.5);
}
.chat-sidebar__block {
  padding-bottom: calc(var(--spacing) * 16);
}
.chat-sidebar__block-12 {
  text-align: center;
}
.chat-sidebar__text {
  font-family: var(--font-mono);
}
.chat-sidebar__text-pinned {
  font-family: var(--font-mono);
}
.chat-sidebar__text-6 {
  font-family: var(--font-mono);
}
.chat-sidebar__text-all {
  font-family: var(--font-mono);
}
.chat-sidebar__text-8 {
  font-family: var(--font-mono);
}
.chat-sidebar__subtitle-no-conversations {
  font-size: var(--text-base);
  line-height: var(--leading,var(--text-base--line-height));
}
.chat-sidebar__button-start-new {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-sidebar__button-invites-connect {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-sidebar__text-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-sidebar__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-sidebar__button-invites-connect-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-sidebar__text {
  font-size: 10px;
}
.chat-sidebar__text-pinned {
  font-size: 10px;
}
.chat-sidebar__text-6 {
  font-size: 10px;
}
.chat-sidebar__text-all {
  font-size: 10px;
}
.chat-sidebar__text-8 {
  font-size: 10px;
}
.chat-sidebar__text-4 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.chat-sidebar__button-invites-connect {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-sidebar__button-invites-connect-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-sidebar__button-start-new {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.chat-sidebar__subtitle-no-conversations {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.chat-sidebar__button {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.chat-sidebar__subtitle-no-conversations {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.chat-sidebar__text {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-sidebar__text-pinned {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-sidebar__text-all {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-sidebar__text {
  white-space: nowrap;
}
.chat-sidebar__button-start-new {
  color: var(--ui-black);
}
.chat-sidebar__button {
  color: var(--ui-black);
}
.chat-sidebar__text-unread--success {
  color: var(--color-emerald-400);
}
.chat-sidebar__subtitle-no-conversations {
  color: var(--color-white);
}
.chat-sidebar__block {
  color: var(--ui-zinc-100);
}
.chat-sidebar__button-invites-connect {
  color: var(--ui-zinc-300);
}
.chat-sidebar__button-invites-connect-2 {
  color: var(--ui-zinc-300);
}
.chat-sidebar__block-13 {
  color: var(--ui-zinc-400);
}
.chat-sidebar__text {
  color: var(--ui-zinc-500);
}
.chat-sidebar__text-4 {
  color: var(--ui-zinc-500);
}
.chat-sidebar__text-pinned {
  color: var(--ui-zinc-500);
}
.chat-sidebar__text-all {
  color: var(--ui-zinc-500);
}
.chat-sidebar__text-2 {
  color: var(--ui-zinc-600);
}
.chat-sidebar__text-6 {
  color: var(--ui-zinc-600);
}
.chat-sidebar__text-8 {
  color: var(--ui-zinc-600);
}
.chat-sidebar__text {
  text-transform: uppercase;
}
.chat-sidebar__text-pinned {
  text-transform: uppercase;
}
.chat-sidebar__text-all {
  text-transform: uppercase;
}
.chat-sidebar__text-6 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.chat-sidebar__text-8 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.chat-sidebar__button-start-new {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.chat-sidebar__button-invites-connect {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.chat-sidebar__block-12 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.chat-sidebar__button {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.chat-sidebar__button-start-new {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-sidebar__button-invites-connect {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-sidebar__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-sidebar__button-invites-connect-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-sidebar__button-start-new:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.chat-sidebar__button-invites-connect:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.chat-sidebar__button:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.chat-sidebar__button-invites-connect-2:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
[data-theme="light"] .chat-sidebar__text-unread--success {
  color: var(--app-success);
}
[data-theme="light"] .chat-sidebar__button-invites-connect {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-sidebar__button-invites-connect-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-sidebar__block-13 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-sidebar__text {
  color: var(--app-muted);
}
[data-theme="light"] .chat-sidebar__text-4 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-sidebar__text-pinned {
  color: var(--app-muted);
}
[data-theme="light"] .chat-sidebar__text-all {
  color: var(--app-muted);
}
[data-theme="light"] .chat-sidebar__text-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-sidebar__text-6 {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-sidebar__text-8 {
  color: var(--app-text-soft);
}
}
}
</style>
