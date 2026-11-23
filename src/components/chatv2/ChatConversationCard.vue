<script setup>
import { Pin, ShieldCheck, Users } from "@/icons";
import RoboAvatar from "@/components/RoboAvatar.vue";

const props = defineProps({
  conv: { type: Object, required: true },
  active: { type: Boolean, default: false },
});

const emit = defineEmits(["select", "toggle-pin"]);
</script>

<template>
  <article
    @click="emit('select', conv)"
    class="chat-card app-list-item"
    :class="{ 'is-active': active, 'is-unread': conv.unreadCount > 0 }"
  >
    <!-- Avatar with overlay indicators & hover pin button -->
    <div class="chat-card__avatar-wrap">
      <div class="chat-card__avatar">
        <RoboAvatar
          v-if="!conv.isGroup && conv.peerPubkey"
          :pubkey="conv.peerPubkey"
          :src="conv.avatarSrc"
          size="md"
          rounded="xl"
        />
        <RoboAvatar
          v-else
          :src="conv.avatarSrc"
          :group-id="conv.isGroup ? conv.avatarKey || conv.id : ''"
          :pubkey="conv.isGroup ? '' : conv.avatarKey || conv.id"
          size="md"
          rounded="xl"
        />
      </div>

      <!-- Pinned badge indicator (visible when pinned and not hovering) -->
      <span v-if="conv.pinned" class="chat-card__marker chat-card__marker--pin" title="Pinned chat">
        <Pin class="chat-card__marker-icon chat-card__marker-icon--pin" :stroke-width="2" />
      </span>

      <!-- Group overlay badge -->
      <span
        v-if="conv.isGroup"
        class="chat-card__marker chat-card__marker--group"
        title="Group chat"
      >
        <Users class="chat-card__marker-icon" :stroke-width="2" />
      </span>

      <!-- Pin action button overlay on avatar on hover -->
      <button
        type="button"
        class="chat-card__pin-action"
        :title="conv.pinned ? 'Unpin chat' : 'Pin chat'"
        @click.stop="emit('toggle-pin', conv.id)"
      >
        <Pin
          class="chat-card__pin-action-icon"
          :class="conv.pinned ? 'is-filled' : ''"
          :stroke-width="2.2"
        />
      </button>
    </div>

    <!-- 2-Line Conversation Details -->
    <div class="chat-card__body">
      <!-- Line 1: Name, Trust Badge & Time -->
      <div class="chat-card__top">
        <div class="chat-card__name-row">
          <h2 class="chat-card__name">{{ conv.displayName }}</h2>
          <ShieldCheck
            v-if="!conv.isGroup && conv.isTrusted"
            class="chat-card__trusted"
            title="Trusted Contact"
          />
        </div>

        <span v-if="conv.ageLabel" class="chat-card__age">{{ conv.ageLabel }}</span>
      </div>

      <!-- Line 2: Message Preview & Unread Badge -->
      <div class="chat-card__bottom">
        <p class="chat-card__preview">
          <span v-if="conv.lastMessageMine" class="chat-card__you">You: </span>
          {{ conv.secondaryLabel || "No messages yet" }}
        </p>

        <!-- Unread Badge -->
        <span v-if="conv.unreadCount > 0" class="chat-card__badge app-badge-pop">
          {{ conv.unreadCount > 99 ? "99+" : conv.unreadCount }}
        </span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.chat-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  min-height: 60px;
  padding: 8px 10px;
  cursor: pointer;
  user-select: none;
  transition: background-color var(--app-dur-fast) var(--app-ease-standard);
}

.chat-card + .chat-card {
  border-top: 1px solid var(--app-border);
}

/* Unread: an ink edge, the same mark the navbar uses for location. */

.chat-card.is-unread::before {
  content: "";
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 2px;
  border-radius: 1px;
  background: var(--app-primary);
  transform-origin: top;
  animation: ledger-draw 320ms var(--app-ease-emphasized) both;
}

.chat-card.is-active {
  background-color: var(--app-surface-soft);
}

.chat-card.is-active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background-color: var(--app-border);
}

.chat-card__avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.chat-card__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface);
}

.chat-card__marker {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 1px solid var(--app-border-strong);
  background: var(--app-surface-raised);
  color: var(--app-muted);
  transition: opacity var(--app-dur-fast) var(--app-ease-standard);
}

.chat-card__marker--pin {
  top: -4px;
  right: -4px;
  border-radius: 999px;
  color: var(--app-text);
}

.chat-card__marker--group {
  right: -4px;
  bottom: -4px;
  border-radius: 6px;
}

.chat-card:hover .chat-card__marker {
  opacity: 0;
}

.chat-card__marker-icon {
  width: 10px;
  height: 10px;
}

.chat-card__marker-icon--pin {
  fill: currentColor;
}

.chat-card__pin-action {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: var(--app-radius-sm);
  background: var(--app-bg);
  color: var(--app-text-soft);
  opacity: 0;
  pointer-events: none;
  cursor: pointer;
  transition:
    opacity 150ms var(--app-ease-standard),
    color 150ms var(--app-ease-standard);
}

.chat-card:hover .chat-card__pin-action,
.chat-card:focus-within .chat-card__pin-action {
  opacity: 1;
  pointer-events: auto;
}

.chat-card__pin-action:hover {
  color: var(--app-text);
}

.chat-card__pin-action-icon {
  width: 16px;
  height: 16px;
  transition: transform 150ms var(--app-ease-swift);
}

.chat-card__pin-action:hover .chat-card__pin-action-icon {
  transform: scale(1.1);
}

.chat-card__pin-action-icon.is-filled {
  color: var(--app-text);
  fill: currentColor;
}

.chat-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.chat-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chat-card__name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.chat-card__name {
  margin: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text-soft);
  transition: color 150ms var(--app-ease-standard);
}

.chat-card.is-unread .chat-card__name {
  color: var(--app-text);
}

.chat-card:hover .chat-card__name {
  color: var(--app-text);
}

.chat-card__trusted {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--app-success);
}

.chat-card__age {
  flex-shrink: 0;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--app-muted-2);
  transition: color 150ms var(--app-ease-standard);
}

.chat-card.is-unread .chat-card__age {
  color: var(--app-text-soft);
}

.chat-card__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.chat-card__preview {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.625;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-muted);
  transition: color 150ms var(--app-ease-standard);
}

.chat-card.is-unread .chat-card__preview {
  font-weight: 500;
  color: var(--app-text-soft);
}

.chat-card:hover .chat-card__preview {
  color: var(--app-text-soft);
}

.chat-card__you {
  font-weight: 400;
  color: var(--app-muted-2);
}

.chat-card__badge {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background-color: var(--app-text);
  color: var(--app-bg);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 9.5px;
  font-weight: 500;
}

/* No hover, no hiding the pin: a small always-present chip on the avatar. */

@media (hover: none) {
  .chat-card__pin-action {
    inset: auto 0 0 auto;
    width: 20px;
    height: 20px;
    border: 1px solid var(--app-border);
    opacity: 1;
    pointer-events: auto;
  }

  .chat-card__pin-action-icon {
    width: 11px;
    height: 11px;
  }

  .chat-card__marker--group {
    display: none;
  }
}

@media (hover: hover) {
  .chat-card:hover {
    background-color: var(--app-surface-soft);
  }

  .chat-card:hover .chat-card__name,
  .chat-card:hover .chat-card__preview {
    color: var(--app-text);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-card,
  .chat-card__name,
  .chat-card__preview,
  .chat-card__age {
    transition: none;
  }

  .chat-card.is-unread::before {
    animation: none;
  }
}
</style>
