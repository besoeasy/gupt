<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { Bell, Check, Phone, Video, ShieldCheck, Users, Info, Timer, Lock, UserPlus } from "@/icons";
import { avatarUrl, groupAvatarUrl } from "@/lib/avatar";
import ChatCallUnlockSheet from "@/components/chatv2/ChatCallUnlockSheet.vue";

const props = defineProps({
  isGroup: { type: Boolean, default: false },
  title: { type: String, default: "" },
  peerPubkey: { type: String, default: "" },
  peerAvatar: { type: String, default: "" },
  groupAvatar: { type: String, default: "" },
  groupId: { type: String, default: "" },
  lastSeenLabel: { type: String, default: "" },
  lastSeenLoading: { type: Boolean, default: false },
  sentCount: { type: Number, default: 0 },
  isTrusted: { type: Boolean, default: false },
  memberCount: { type: Number, default: 0 },
  drawerOpen: { type: Boolean, default: false },
  canStartCall: { type: Boolean, default: false },
  timerLabel: { type: String, default: "" },
  canPing: { type: Boolean, default: false },
  pingLabel: { type: String, default: "" },
  pingSent: { type: Boolean, default: false },
  pingCooldown: { type: Boolean, default: false },
  pingSending: { type: Boolean, default: false },
  isContact: { type: Boolean, default: false },
  contactSaving: { type: Boolean, default: false },
  contactSaved: { type: Boolean, default: false },
});

const emit = defineEmits([
  "back",
  "start-audio-call",
  "start-video-call",
  "ping",
  "toggle-drawer",
  "add-contact",
]);

const router = useRouter();

const displayTitle = computed(() => props.title || (props.isGroup ? "Group" : "Conversation"));
const avatarSrc = computed(() => {
  if (props.isGroup) return props.groupAvatar || groupAvatarUrl(props.groupId || "group");
  return props.peerAvatar || avatarUrl(props.peerPubkey || "");
});
const statusText = computed(() => {
  if (props.isGroup) {
    return `${props.memberCount} member${props.memberCount === 1 ? "" : "s"}`;
  }
  if (props.lastSeenLoading) return "checking…";
  return props.lastSeenLabel || "Encrypted message";
});
// The dot is a mood, not a presence service: green only for clearly recent
// activity, muted otherwise.
const peerIsFresh = computed(() => {
  const label = String(props.lastSeenLabel || "");
  if (!label || label === "No recent activity") return false;
  if (label === "just now") return true;
  const minutes = /^(\d+) min ago$/.exec(label);
  return Boolean(minutes && Number(minutes[1]) <= 10);
});
const trustSent = computed(() => Math.min(Math.max(props.sentCount, 0), 7));
const trustRemaining = computed(() => Math.max(7 - trustSent.value, 0));
const unlockOpen = ref(false);

function openUnlockSheet() {
  unlockOpen.value = true;
}

/** While locked, a call button explains the rule instead of dialling. */
function startCall(kind) {
  if (!props.isTrusted) {
    openUnlockSheet();
    return;
  }
  if (!props.canStartCall) return;
  emit(kind === "video" ? "start-video-call" : "start-audio-call");
}

function openIdentity() {
  if (!props.isGroup && props.peerPubkey) {
    router.push(`/profile/${props.peerPubkey}`);
    return;
  }
  emit("toggle-drawer");
}
</script>

<template>
  <header class="chat-head">
    <button
      type="button"
      class="chat-head__identity"
      :title="isGroup ? 'Group details' : 'View profile'"
      @click="openIdentity"
    >
      <span class="chat-head__avatar">
        <img
          :src="avatarSrc"
          :alt="displayTitle"
          width="40"
          height="40"
          class="chat-head__image"
          loading="lazy"
          referrerpolicy="no-referrer"
        />
        <span
          v-if="!isGroup"
          class="chat-head__presence"
          :class="{ 'chat-head__presence--live': peerIsFresh }"
          aria-hidden="true"
        />
        <span v-else class="chat-head__members">{{ memberCount }}</span>
      </span>

      <span class="chat-head__text">
        <span class="chat-head__title-row">
          <span class="chat-head__title">{{ displayTitle }}</span>
          <ShieldCheck
            v-if="!isGroup && isTrusted"
            class="chat-head__shield"
            :stroke-width="1.8"
            title="Trusted contact"
            aria-label="Trusted contact"
          />
        </span>

        <span class="chat-head__status">
          <span
            v-if="!isGroup"
            class="chat-head__dot"
            :class="{
              'chat-head__dot--live': peerIsFresh && !lastSeenLoading,
              'chat-head__dot--pulse': lastSeenLoading,
            }"
            aria-hidden="true"
          />
          <span class="chat-head__status-label">{{ statusText }}</span>

          <span
            v-if="timerLabel && !isGroup"
            class="chat-head__chip"
            :title="`Messages disappear after ${timerLabel}`"
          >
            <Timer class="chat-head__chip-icon" :stroke-width="1.8" aria-hidden="true" />
            {{ timerLabel }}
          </span>

          <span
            v-if="!isGroup && !isTrusted"
            class="chat-head__chip chat-head__chip--warn"
            :title="`Calls unlock after 7 messages — ${trustSent} of 7 sent`"
          >
            <Lock class="chat-head__chip-icon" :stroke-width="1.8" aria-hidden="true" />
            {{ trustSent }}/7
          </span>
        </span>
      </span>
    </button>

    <div class="chat-head__actions">
      <button
        v-if="!isGroup && peerPubkey && (!isContact || contactSaved)"
        type="button"
        class="chat-head__action chat-head__action--labelled"
        :class="{ 'chat-head__action--done': contactSaved }"
        :disabled="contactSaving || contactSaved"
        :title="contactSaved ? 'Added to contacts' : 'Add to contacts'"
        :aria-label="contactSaved ? 'Added to contacts' : 'Add to contacts'"
        :aria-busy="contactSaving"
        @click="emit('add-contact')"
      >
        <Check
          v-if="contactSaved"
          class="chat-head__icon"
          :stroke-width="2"
          aria-hidden="true"
        />
        <UserPlus
          v-else
          class="chat-head__icon"
          :class="{ 'chat-head__icon--pulse': contactSaving }"
          :stroke-width="1.8"
          aria-hidden="true"
        />
        <span class="chat-head__action-label">{{ contactSaved ? "Added" : "Add" }}</span>
      </button>

      <button
        v-if="canPing"
        type="button"
        class="chat-head__action chat-head__action--labelled"
        :class="{ 'chat-head__action--done': pingSent }"
        :disabled="pingCooldown || pingSending"
        :title="pingLabel || 'Ping · wake them via ntfy'"
        :aria-label="pingLabel || 'Ping · wake them via ntfy'"
        :aria-busy="pingSending"
        @click="emit('ping')"
      >
        <Check
          v-if="pingSent"
          class="chat-head__icon"
          :stroke-width="2"
          aria-hidden="true"
        />
        <Bell
          v-else
          class="chat-head__icon"
          :class="{ 'chat-head__icon--pulse': pingSending }"
          :stroke-width="1.8"
          aria-hidden="true"
        />
        <span class="chat-head__action-label">{{ pingSent ? "Pinged" : "Ping" }}</span>
      </button>

      <template v-if="!isGroup">
        <button
          type="button"
          class="chat-head__action"
          :disabled="isTrusted && !canStartCall"
          :aria-disabled="!isTrusted || !canStartCall"
          :title="
            isTrusted
              ? 'Start audio call'
              : `Calls locked — ${trustRemaining} more message${trustRemaining === 1 ? '' : 's'} to unlock`
          "
          :aria-label="
            isTrusted ? 'Start audio call' : `Audio call locked, ${trustSent} of 7 messages sent`
          "
          @click="startCall('audio')"
        >
          <Phone class="chat-head__icon" :stroke-width="1.8" aria-hidden="true" />
          <Lock
            v-if="!isTrusted"
            class="chat-head__lock"
            :stroke-width="2.2"
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          class="chat-head__action"
          :disabled="isTrusted && !canStartCall"
          :aria-disabled="!isTrusted || !canStartCall"
          :title="
            isTrusted
              ? 'Start video call'
              : `Calls locked — ${trustRemaining} more message${trustRemaining === 1 ? '' : 's'} to unlock`
          "
          :aria-label="
            isTrusted ? 'Start video call' : `Video call locked, ${trustSent} of 7 messages sent`
          "
          @click="startCall('video')"
        >
          <Video class="chat-head__icon" :stroke-width="1.8" aria-hidden="true" />
          <Lock
            v-if="!isTrusted"
            class="chat-head__lock"
            :stroke-width="2.2"
            aria-hidden="true"
          />
        </button>
      </template>

      <button
        type="button"
        class="chat-head__action"
        :class="{ 'chat-head__action--on': drawerOpen }"
        :title="isGroup ? 'Group details' : 'Contact & relay details'"
        :aria-label="isGroup ? 'Group details' : 'Contact & relay details'"
        :aria-pressed="drawerOpen"
        @click="emit('toggle-drawer')"
      >
        <Users v-if="isGroup" class="chat-head__icon" :stroke-width="1.8" aria-hidden="true" />
        <Info v-else class="chat-head__icon" :stroke-width="1.8" aria-hidden="true" />
      </button>
    </div>

    <ChatCallUnlockSheet
      :open="unlockOpen"
      :sent-count="trustSent"
      :title="displayTitle"
      @close="unlockOpen = false"
    />
  </header>
</template>

<style scoped>
@layer base, gupt-components;

/* Ledger conversation bar: identity on the left, square actions on the right,
   one hairline underneath to meet the thread. */

.chat-head {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
  padding: var(--app-space-2) var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
  background-color: var(--app-bg);
}

.chat-head__identity {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  min-width: 0;
  flex: 1;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  color: inherit;
  cursor: pointer;
}

.chat-head__identity:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 2px;
  border-radius: var(--app-radius-sm);
}

.chat-head__avatar {
  position: relative;
  display: block;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: var(--app-radius-sm);
  overflow: visible;
}

.chat-head__image {
  width: 40px;
  height: 40px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  object-fit: cover;
  background-color: var(--app-surface-inset);
}

.chat-head__presence {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 10px;
  height: 10px;
  border: 2px solid var(--app-bg);
  border-radius: 999px;
  background-color: var(--app-muted-2);
}

.chat-head__presence--live {
  background-color: var(--app-success);
}

.chat-head__members {
  position: absolute;
  right: -5px;
  bottom: -5px;
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border: 2px solid var(--app-bg);
  border-radius: 999px;
  background-color: var(--app-surface-inset);
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 500;
  color: var(--app-text);
}

.chat-head__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.chat-head__title-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.chat-head__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--app-text);
}

.chat-head__shield {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--app-success);
}

.chat-head__status {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  min-width: 0;
}

.chat-head__dot {
  width: 5px;
  height: 5px;
  flex-shrink: 0;
  border-radius: 999px;
  background-color: var(--app-muted-2);
}

.chat-head__dot--live {
  background-color: var(--app-success);
  color: var(--app-success);
  animation: ledger-dot-pulse 2.8s var(--app-ease-standard) infinite;
}

.chat-head__dot--pulse {
  background-color: var(--app-muted);
  animation: ledger-dot-pulse 1.4s var(--app-ease-standard) infinite;
}

.chat-head__status-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
}

.chat-head__chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 1px 5px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted);
  white-space: nowrap;
}

.chat-head__chip--warn {
  border-color: color-mix(in oklab, var(--app-warning) 30%, transparent);
  color: var(--app-warning);
}

.chat-head__chip-icon {
  width: 9px;
  height: 9px;
}

.chat-head__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.chat-head__action {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-swift);
}

.chat-head__action--labelled {
  width: auto;
  padding: 0 var(--app-space-2);
}

.chat-head__action-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.chat-head__action:disabled {
  opacity: 0.4;
  cursor: default;
}

.chat-head__action--done {
  border-color: color-mix(in oklab, var(--app-success) 30%, transparent);
  color: var(--app-success);
}

.chat-head__action--on {
  border-color: var(--app-text);
  background-color: var(--app-text);
  color: var(--app-bg);
}

.chat-head__action:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 2px;
}

.chat-head__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.chat-head__icon--pulse {
  animation: ledger-dot-pulse 1.2s var(--app-ease-standard) infinite;
}

.chat-head__lock {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 8px;
  height: 8px;
  color: var(--app-warning);
}

@media (hover: hover) {
  .chat-head__identity:hover .chat-head__title {
    color: var(--app-primary);
  }

  .chat-head__action:not(:disabled, .chat-head__action--on):hover {
    border-color: var(--app-border);
    background-color: var(--app-surface-soft);
    color: var(--app-text);
  }
}

.chat-head__action:not(:disabled):active {
  transform: scale(0.94);
}

@media (pointer: coarse) {
  .chat-head__action {
    width: var(--app-touch-h);
    height: var(--app-touch-h);
  }

  .chat-head__action--labelled {
    width: auto;
    padding: 0 var(--app-space-3);
  }
}

@media (max-width: 30rem) {
  .chat-head {
    padding-inline: var(--app-space-3);
  }

  .chat-head__action-label {
    display: none;
  }

  .chat-head__action--labelled {
    width: 36px;
    padding: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-head__dot,
  .chat-head__icon {
    animation: none;
  }

  .chat-head__action {
    transition: none;
  }

  .chat-head__action:active {
    transform: none;
  }
}
</style>
