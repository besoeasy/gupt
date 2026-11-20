<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { Bell, Check, Phone, Video, ShieldCheck, Users, Info, Timer, Lock } from "@lucide/vue";
import { roboHashUrl } from "@/lib/crypto";
import ChatCallUnlockSheet from "@/components/chatv2/ChatCallUnlockSheet.vue";

const props = defineProps({
  isGroup: { type: Boolean, default: false },
  title: { type: String, default: "" },
  peerPubkey: { type: String, default: "" },
  peerAvatar: { type: String, default: "" },
  groupAvatar: { type: String, default: "" },
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
});

const emit = defineEmits(["back", "start-audio-call", "start-video-call", "ping", "toggle-drawer"]);

const router = useRouter();

// 44px touch targets, one idle look for every action in the bar.
const ACTION_BASE =
  "chat-conversation-header__variant-1";
const ACTION_IDLE =
  "chat-conversation-header__variant-2";

const displayTitle = computed(() => props.title || (props.isGroup ? "Group" : "Conversation"));
const avatarSrc = computed(() => {
  if (props.isGroup) return props.groupAvatar || roboHashUrl(props.peerPubkey || "group");
  return props.peerAvatar || roboHashUrl(props.peerPubkey || "");
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
  <div
    class="chat-conversation-header__block"
  >
    <!-- Identity: avatar, name, one calm status line -->
    <div class="chat-conversation-header__block-2">
      <button
        type="button"
        @click="openIdentity"
        class="chat-conversation-header__button"
        :title="isGroup ? 'Group details' : 'View profile'"
      >
        <span class="chat-conversation-header__text">
          <img
            :src="avatarSrc"
            :alt="displayTitle"
            width="40"
            height="40"
            class="chat-conversation-header__image"
            loading="lazy"
            referrerpolicy="no-referrer"
          />
          <span
            v-if="!isGroup"
            class="chat-conversation-header__text-2"
            :class="peerIsFresh ? 'chat-conversation-header__text--variant-1' : 'chat-conversation-header__text--variant-2'"
          />
          <span
            v-else
            class="chat-conversation-header__text-3"
          >
            {{ memberCount }}
          </span>
        </span>

        <span class="chat-conversation-header__text-4">
          <span class="chat-conversation-header__text-5">
            <span
              class="chat-conversation-header__text-6"
            >
              {{ displayTitle }}
            </span>
            <ShieldCheck
              v-if="!isGroup && isTrusted"
              class="chat-conversation-header__shield-check-trusted-contact"
              :stroke-width="2"
              title="Trusted contact"
              aria-label="Trusted contact"
            />
          </span>

          <span class="chat-conversation-header__text-7">
            <span
              v-if="isGroup"
              class="chat-conversation-header__text-8"
              aria-hidden="true"
            />
            <span
              v-else
              class="chat-conversation-header__text-9"
              :class="
                lastSeenLoading
                  ? 'chat-conversation-header__text--pulse'
                  : peerIsFresh
                    ? 'chat-conversation-header__text--variant-2-2'
                    : 'chat-conversation-header__text--variant-3'
              "
              aria-hidden="true"
            />
            <span class="chat-conversation-header__text-10">
              {{ statusText }}
            </span>

            <span
              v-if="timerLabel && !isGroup"
              class="chat-conversation-header__text-11"
              :title="`Messages disappear after ${timerLabel}`"
            >
              <Timer class="chat-conversation-header__timer" :stroke-width="2" aria-hidden="true" />
              {{ timerLabel }}
            </span>

            <span
              v-if="!isGroup && !isTrusted"
              class="chat-conversation-header__text-12"
              :title="`Calls unlock after 7 messages — ${trustSent} of 7 sent`"
            >
              <Lock class="chat-conversation-header__lock" :stroke-width="2.2" aria-hidden="true" />
              {{ trustSent }}/7
            </span>
          </span>
        </span>
      </button>
    </div>

    <!-- Actions: ping, calls, details -->
    <div class="chat-conversation-header__block-3">
      <!-- Wake the contact through ntfy when their app is closed. -->
      <button
        v-if="canPing"
        type="button"
        @click="emit('ping')"
        :disabled="pingCooldown || pingSending"
        class="chat-conversation-header__button-2"
        :class="[
          ACTION_BASE,
          pingSent
            ? 'chat-conversation-header__button--variant-1'
            : ACTION_IDLE,
        ]"
        :title="pingLabel || 'Ping · wake them via ntfy'"
        :aria-label="pingLabel || 'Ping · wake them via ntfy'"
        :aria-busy="pingSending"
      >
        <Check v-if="pingSent" class="chat-conversation-header__check" :stroke-width="2.2" aria-hidden="true" />
        <Bell
          v-else
          class="chat-conversation-header__bell"
          :class="pingSending ? 'chat-conversation-header__bell--pulse' : ''"
          :stroke-width="1.9"
          aria-hidden="true"
        />
        <span class="chat-conversation-header__text-13">
          {{ pingSent ? "Pinged" : "Ping" }}
        </span>
      </button>

      <template v-if="!isGroup">
        <!-- Calls stay visible before trust so the rule is discoverable: while
             locked, tapping explains the 7-message threshold. -->
        <button
          type="button"
          @click="startCall('audio')"
          :disabled="isTrusted && !canStartCall"
          :aria-disabled="!isTrusted || !canStartCall"
          :class="[
            ACTION_BASE,
            isTrusted
              ? ACTION_IDLE
              : 'chat-conversation-header__button--variant-1-2',
          ]"
          :title="
            isTrusted
              ? 'Start audio call'
              : `Calls locked — ${trustRemaining} more message${trustRemaining === 1 ? '' : 's'} to unlock`
          "
          :aria-label="
            isTrusted ? 'Start audio call' : `Audio call locked, ${trustSent} of 7 messages sent`
          "
        >
          <Phone class="chat-conversation-header__phone" :stroke-width="1.9" aria-hidden="true" />
          <Lock
            v-if="!isTrusted"
            class="chat-conversation-header__lock-2"
            :stroke-width="2.4"
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          @click="startCall('video')"
          :disabled="isTrusted && !canStartCall"
          :aria-disabled="!isTrusted || !canStartCall"
          :class="[
            ACTION_BASE,
            isTrusted
              ? ACTION_IDLE
              : 'chat-conversation-header__button--variant-1-3',
          ]"
          :title="
            isTrusted
              ? 'Start video call'
              : `Calls locked — ${trustRemaining} more message${trustRemaining === 1 ? '' : 's'} to unlock`
          "
          :aria-label="
            isTrusted ? 'Start video call' : `Video call locked, ${trustSent} of 7 messages sent`
          "
        >
          <Video class="chat-conversation-header__video" :stroke-width="1.9" aria-hidden="true" />
          <Lock
            v-if="!isTrusted"
            class="chat-conversation-header__lock-3"
            :stroke-width="2.4"
            aria-hidden="true"
          />
        </button>
      </template>

      <button
        type="button"
        @click="emit('toggle-drawer')"
        :class="[
          ACTION_BASE,
          drawerOpen
            ? 'chat-conversation-header__button--variant-1-4'
            : ACTION_IDLE,
        ]"
        :title="isGroup ? 'Group details' : 'Contact & relay details'"
        :aria-label="isGroup ? 'Group details' : 'Contact & relay details'"
        :aria-pressed="drawerOpen"
      >
        <Users v-if="isGroup" class="chat-conversation-header__users" :stroke-width="1.9" aria-hidden="true" />
        <Info v-else class="chat-conversation-header__info" :stroke-width="1.9" aria-hidden="true" />
      </button>
    </div>

    <ChatCallUnlockSheet
      :open="unlockOpen"
      :sent-count="trustSent"
      :title="displayTitle"
      @close="unlockOpen = false"
    />
  </div>
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.chat-conversation-header__button--variant-1-4 {
  border-color: color-mix(in srgb,var(--app-primary) 45%,var(--app-border));
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-conversation-header__button--variant-1 {
  border-color: color-mix(in srgb,var(--app-success) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-conversation-header__block {
  background-color: color-mix(in srgb,var(--app-bg) 82%,transparent);
}
}

@media (hover:hover) {
.chat-conversation-header__image:is(:where(.chat-conversation-header__button):hover *) {
  scale: 1.03;
}
}

@media (hover:hover) {
.chat-conversation-header__text-6:is(:where(.chat-conversation-header__button):hover *) {
  color: var(--app-primary);
}
}

@media (hover:hover) {
.chat-conversation-header__button--variant-1-2:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.chat-conversation-header__button--variant-1-3:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.chat-conversation-header__variant-2:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.chat-conversation-header__variant-2:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.chat-conversation-header__button:hover {
  background-color: var(--app-surface-soft);
}
}

@media (hover:hover) {
.chat-conversation-header__button--variant-1-2:hover {
  background-color: var(--app-surface-soft);
}
}

@media (hover:hover) {
.chat-conversation-header__button--variant-1-3:hover {
  background-color: var(--app-surface-soft);
}
}

@media (hover:hover) {
.chat-conversation-header__variant-2:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.chat-conversation-header__button--variant-1-2:hover {
  color: var(--app-text-soft);
}
}

@media (hover:hover) {
.chat-conversation-header__button--variant-1-3:hover {
  color: var(--app-text-soft);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-conversation-header__button:focus-visible {
  --ring-color: color-mix(in srgb,var(--app-primary) 55%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-conversation-header__variant-1:focus-visible {
  --ring-color: color-mix(in srgb,var(--app-primary) 55%,transparent);
}
}

@media (min-width:40rem) {
.chat-conversation-header__block {
  height: calc(var(--spacing) * 16);
}
}

@media (min-width:40rem) {
.chat-conversation-header__block-3 {
  gap: calc(var(--spacing) * 1.5);
}
}

@media (min-width:40rem) {
.chat-conversation-header__block {
  gap: calc(var(--spacing) * 3);
}
}

@media (min-width:40rem) {
.chat-conversation-header__button {
  gap: calc(var(--spacing) * 3);
}
}

@media (min-width:40rem) {
.chat-conversation-header__block {
  padding-inline: calc(var(--spacing) * 4);
}
}

@media (min-width:48rem) {
.chat-conversation-header__block {
  padding-inline: calc(var(--spacing) * 5);
}
}

@media (min-width:64rem) {
.chat-conversation-header__text-13 {
  display: inline;
}
}

@media (min-width:64rem) {
.chat-conversation-header__button-2 {
  width: auto;
}
}

@media (min-width:64rem) {
.chat-conversation-header__button-2 {
  padding-inline: calc(var(--spacing) * 3);
}
}

@layer gupt-components {
.chat-conversation-header__text-2 {
  position: absolute;
}
.chat-conversation-header__text-3 {
  position: absolute;
}
.chat-conversation-header__lock-2 {
  position: absolute;
}
.chat-conversation-header__lock-3 {
  position: absolute;
}
.chat-conversation-header__block {
  position: relative;
}
.chat-conversation-header__text {
  position: relative;
}
.chat-conversation-header__variant-1 {
  position: relative;
}
.chat-conversation-header__text-2 {
  right: calc(var(--spacing) * -.5);
}
.chat-conversation-header__text-3 {
  right: calc(var(--spacing) * -1);
}
.chat-conversation-header__lock-2 {
  right: var(--spacing);
}
.chat-conversation-header__lock-3 {
  right: var(--spacing);
}
.chat-conversation-header__text-2 {
  bottom: calc(var(--spacing) * -.5);
}
.chat-conversation-header__text-3 {
  bottom: calc(var(--spacing) * -1);
}
.chat-conversation-header__lock-2 {
  bottom: var(--spacing);
}
.chat-conversation-header__lock-3 {
  bottom: var(--spacing);
}
.chat-conversation-header__text-7 {
  margin-top: calc(var(--spacing) * .5);
}
.chat-conversation-header__block {
  display: flex;
}
.chat-conversation-header__block-2 {
  display: flex;
}
.chat-conversation-header__button {
  display: flex;
}
.chat-conversation-header__text-4 {
  display: flex;
}
.chat-conversation-header__text-5 {
  display: flex;
}
.chat-conversation-header__text-7 {
  display: flex;
}
.chat-conversation-header__block-3 {
  display: flex;
}
.chat-conversation-header__text-13 {
  display: none;
}
.chat-conversation-header__text-3 {
  display: inline-flex;
}
.chat-conversation-header__text-11 {
  display: inline-flex;
}
.chat-conversation-header__text-12 {
  display: inline-flex;
}
.chat-conversation-header__variant-1 {
  display: inline-flex;
}
.chat-conversation-header__text-8 {
  height: calc(var(--spacing) * 1.5);
}
.chat-conversation-header__text-9 {
  height: calc(var(--spacing) * 1.5);
}
.chat-conversation-header__timer {
  height: calc(var(--spacing) * 2.5);
}
.chat-conversation-header__lock {
  height: calc(var(--spacing) * 2.5);
}
.chat-conversation-header__lock-2 {
  height: calc(var(--spacing) * 2.5);
}
.chat-conversation-header__lock-3 {
  height: calc(var(--spacing) * 2.5);
}
.chat-conversation-header__text-2 {
  height: calc(var(--spacing) * 3);
}
.chat-conversation-header__shield-check-trusted-contact {
  height: calc(var(--spacing) * 3.5);
}
.chat-conversation-header__text-3 {
  height: calc(var(--spacing) * 4);
}
.chat-conversation-header__image {
  height: calc(var(--spacing) * 10);
}
.chat-conversation-header__variant-1 {
  height: calc(var(--spacing) * 11);
}
.chat-conversation-header__block {
  height: calc(var(--spacing) * 14);
}
.chat-conversation-header__check {
  height: 18px;
}
.chat-conversation-header__bell {
  height: 18px;
}
.chat-conversation-header__phone {
  height: 18px;
}
.chat-conversation-header__video {
  height: 18px;
}
.chat-conversation-header__users {
  height: 18px;
}
.chat-conversation-header__info {
  height: 18px;
}
.chat-conversation-header__text-8 {
  width: calc(var(--spacing) * 1.5);
}
.chat-conversation-header__text-9 {
  width: calc(var(--spacing) * 1.5);
}
.chat-conversation-header__timer {
  width: calc(var(--spacing) * 2.5);
}
.chat-conversation-header__lock {
  width: calc(var(--spacing) * 2.5);
}
.chat-conversation-header__lock-2 {
  width: calc(var(--spacing) * 2.5);
}
.chat-conversation-header__lock-3 {
  width: calc(var(--spacing) * 2.5);
}
.chat-conversation-header__text-2 {
  width: calc(var(--spacing) * 3);
}
.chat-conversation-header__shield-check-trusted-contact {
  width: calc(var(--spacing) * 3.5);
}
.chat-conversation-header__image {
  width: calc(var(--spacing) * 10);
}
.chat-conversation-header__variant-1 {
  width: calc(var(--spacing) * 11);
}
.chat-conversation-header__check {
  width: 18px;
}
.chat-conversation-header__bell {
  width: 18px;
}
.chat-conversation-header__phone {
  width: 18px;
}
.chat-conversation-header__video {
  width: 18px;
}
.chat-conversation-header__users {
  width: 18px;
}
.chat-conversation-header__info {
  width: 18px;
}
.chat-conversation-header__button {
  max-width: 100%;
}
.chat-conversation-header__block-2 {
  min-width: 0;
}
.chat-conversation-header__button {
  min-width: 0;
}
.chat-conversation-header__text-4 {
  min-width: 0;
}
.chat-conversation-header__text-5 {
  min-width: 0;
}
.chat-conversation-header__text-7 {
  min-width: 0;
}
.chat-conversation-header__text-3 {
  min-width: calc(var(--spacing) * 4);
}
.chat-conversation-header__block-2 {
  flex: 1;
}
.chat-conversation-header__text-4 {
  flex: 1;
}
.chat-conversation-header__block {
  flex-shrink: 0;
}
.chat-conversation-header__text {
  flex-shrink: 0;
}
.chat-conversation-header__image {
  flex-shrink: 0;
}
.chat-conversation-header__shield-check-trusted-contact {
  flex-shrink: 0;
}
.chat-conversation-header__text-8 {
  flex-shrink: 0;
}
.chat-conversation-header__text-9 {
  flex-shrink: 0;
}
.chat-conversation-header__text-11 {
  flex-shrink: 0;
}
.chat-conversation-header__text-12 {
  flex-shrink: 0;
}
.chat-conversation-header__block-3 {
  flex-shrink: 0;
}
.chat-conversation-header__variant-1 {
  flex-shrink: 0;
}
.chat-conversation-header__text--pulse {
  animation: var(--animate-pulse);
}
.chat-conversation-header__bell--pulse {
  animation: var(--animate-pulse);
}
.chat-conversation-header__text-4 {
  flex-direction: column;
}
.chat-conversation-header__block {
  align-items: center;
}
.chat-conversation-header__block-2 {
  align-items: center;
}
.chat-conversation-header__button {
  align-items: center;
}
.chat-conversation-header__text-3 {
  align-items: center;
}
.chat-conversation-header__text-5 {
  align-items: center;
}
.chat-conversation-header__text-7 {
  align-items: center;
}
.chat-conversation-header__text-11 {
  align-items: center;
}
.chat-conversation-header__text-12 {
  align-items: center;
}
.chat-conversation-header__block-3 {
  align-items: center;
}
.chat-conversation-header__variant-1 {
  align-items: center;
}
.chat-conversation-header__text-3 {
  justify-content: center;
}
.chat-conversation-header__variant-1 {
  justify-content: center;
}
.chat-conversation-header__text-11 {
  gap: var(--spacing);
}
.chat-conversation-header__text-12 {
  gap: var(--spacing);
}
.chat-conversation-header__block-3 {
  gap: var(--spacing);
}
.chat-conversation-header__text-5 {
  gap: calc(var(--spacing) * 1.5);
}
.chat-conversation-header__text-7 {
  gap: calc(var(--spacing) * 1.5);
}
.chat-conversation-header__button-2 {
  gap: calc(var(--spacing) * 1.5);
}
.chat-conversation-header__block {
  gap: calc(var(--spacing) * 2);
}
.chat-conversation-header__button {
  gap: calc(var(--spacing) * 2.5);
}
.chat-conversation-header__text-6 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-conversation-header__text-10 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-conversation-header__text-2 {
  border-radius: 3.40282e38px;
}
.chat-conversation-header__text-3 {
  border-radius: 3.40282e38px;
}
.chat-conversation-header__text-8 {
  border-radius: 3.40282e38px;
}
.chat-conversation-header__text-9 {
  border-radius: 3.40282e38px;
}
.chat-conversation-header__text-11 {
  border-radius: 3.40282e38px;
}
.chat-conversation-header__button {
  border-radius: var(--radius-xl);
}
.chat-conversation-header__image {
  border-radius: var(--radius-xl);
}
.chat-conversation-header__variant-1 {
  border-radius: var(--radius-xl);
}
.chat-conversation-header__image {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-conversation-header__text-11 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-conversation-header__variant-1 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-conversation-header__text-2 {
  border-style: var(--border-style,solid);
  border-width: 2px;
}
.chat-conversation-header__text-3 {
  border-style: var(--border-style,solid);
  border-width: 2px;
}
.chat-conversation-header__block {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.chat-conversation-header__button--variant-1-2 {
  --border-style: dashed;
  border-style: dashed;
}
.chat-conversation-header__button--variant-1-3 {
  --border-style: dashed;
  border-style: dashed;
}
.chat-conversation-header__text-2 {
  border-color: var(--app-bg);
}
.chat-conversation-header__text-3 {
  border-color: var(--app-bg);
}
.chat-conversation-header__block {
  border-color: var(--app-border);
}
.chat-conversation-header__image {
  border-color: var(--app-border);
}
.chat-conversation-header__text-11 {
  border-color: var(--app-border);
}
.chat-conversation-header__button--variant-1-2 {
  border-color: var(--app-border);
}
.chat-conversation-header__button--variant-1-3 {
  border-color: var(--app-border);
}
.chat-conversation-header__variant-2 {
  border-color: var(--app-border);
}
.chat-conversation-header__button--variant-1-4 {
  border-color: var(--app-primary);
}
.chat-conversation-header__button--variant-1 {
  border-color: var(--app-success);
}
.chat-conversation-header__text--pulse {
  background-color: var(--app-muted);
}
.chat-conversation-header__text--variant-2 {
  background-color: var(--app-muted-2);
}
.chat-conversation-header__text-8 {
  background-color: var(--app-muted-2);
}
.chat-conversation-header__text--variant-3 {
  background-color: var(--app-muted-2);
}
.chat-conversation-header__button--variant-1-4 {
  background-color: var(--app-primary-soft);
}
.chat-conversation-header__text--variant-1 {
  background-color: var(--app-success);
}
.chat-conversation-header__text--variant-2-2 {
  background-color: var(--app-success);
}
.chat-conversation-header__text-3 {
  background-color: var(--app-surface-raised);
}
.chat-conversation-header__text-11 {
  background-color: var(--app-surface-soft);
}
.chat-conversation-header__variant-2 {
  background-color: var(--app-surface-soft);
}
.chat-conversation-header__block {
  background-color: var(--app-bg);
}
.chat-conversation-header__button--variant-1 {
  background-color: var(--app-success-soft);
}
.chat-conversation-header__button--variant-1-2 {
  background-color: #0000;
}
.chat-conversation-header__button--variant-1-3 {
  background-color: #0000;
}
.chat-conversation-header__image {
  object-fit: cover;
}
.chat-conversation-header__button {
  padding-inline: var(--spacing);
}
.chat-conversation-header__text-3 {
  padding-inline: var(--spacing);
}
.chat-conversation-header__text-11 {
  padding-inline: calc(var(--spacing) * 1.5);
}
.chat-conversation-header__block {
  padding-inline: calc(var(--spacing) * 2.5);
}
.chat-conversation-header__button {
  padding-block: var(--spacing);
}
.chat-conversation-header__text-11 {
  padding-block: 1px;
}
.chat-conversation-header__button {
  text-align: left;
}
.chat-conversation-header__text-3 {
  font-family: var(--font-mono);
}
.chat-conversation-header__text-10 {
  font-family: var(--font-mono);
}
.chat-conversation-header__text-11 {
  font-family: var(--font-mono);
}
.chat-conversation-header__text-12 {
  font-family: var(--font-mono);
}
.chat-conversation-header__text-3 {
  font-size: 9px;
}
.chat-conversation-header__text-11 {
  font-size: 10px;
}
.chat-conversation-header__text-12 {
  font-size: 10px;
}
.chat-conversation-header__text-10 {
  font-size: 11px;
}
.chat-conversation-header__text-13 {
  font-size: 11px;
}
.chat-conversation-header__text-6 {
  font-size: 15px;
}
.chat-conversation-header__text-10 {
  --leading: calc(var(--spacing) * 4);
  line-height: calc(var(--spacing) * 4);
}
.chat-conversation-header__text-6 {
  --leading: calc(var(--spacing) * 5);
  line-height: calc(var(--spacing) * 5);
}
.chat-conversation-header__text-3 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.chat-conversation-header__text-6 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.chat-conversation-header__text-13 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.chat-conversation-header__text-6 {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.chat-conversation-header__text-10 {
  color: var(--app-muted);
}
.chat-conversation-header__text-11 {
  color: var(--app-muted);
}
.chat-conversation-header__button--variant-1-2 {
  color: var(--app-muted);
}
.chat-conversation-header__button--variant-1-3 {
  color: var(--app-muted);
}
.chat-conversation-header__text-12 {
  color: var(--app-muted-2);
}
.chat-conversation-header__lock-2 {
  color: var(--app-muted-2);
}
.chat-conversation-header__lock-3 {
  color: var(--app-muted-2);
}
.chat-conversation-header__button--variant-1-4 {
  color: var(--app-primary);
}
.chat-conversation-header__shield-check-trusted-contact {
  color: var(--app-success);
}
.chat-conversation-header__button--variant-1 {
  color: var(--app-success);
}
.chat-conversation-header__text-6 {
  color: var(--app-text);
}
.chat-conversation-header__text-3 {
  color: var(--app-text-soft);
}
.chat-conversation-header__variant-2 {
  color: var(--app-text-soft);
}
.chat-conversation-header__block {
  --backdrop-blur: blur(var(--blur-xl));
  -webkit-backdrop-filter: blur(var(--blur-xl)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
  backdrop-filter: blur(var(--blur-xl)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
}
.chat-conversation-header__variant-1 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-conversation-header__button {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-conversation-header__text-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-conversation-header__text-6 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-conversation-header__text-9 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-conversation-header__image {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-conversation-header__button {
  --duration: .2s;
  transition-duration: .2s;
}
.chat-conversation-header__image {
  --duration: .2s;
  transition-duration: .2s;
}
.chat-conversation-header__text-6 {
  --duration: .2s;
  transition-duration: .2s;
}
.chat-conversation-header__variant-1 {
  --duration: .2s;
  transition-duration: .2s;
}
.chat-conversation-header__text-2 {
  --duration: .3s;
  transition-duration: .3s;
}
.chat-conversation-header__text-9 {
  --duration: .3s;
  transition-duration: .3s;
}
.chat-conversation-header__variant-1 {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.chat-conversation-header__button:focus-visible {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.chat-conversation-header__variant-1:focus-visible {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.chat-conversation-header__button:focus-visible {
  --ring-color: var(--app-primary);
}
.chat-conversation-header__variant-1:focus-visible {
  --ring-color: var(--app-primary);
}
.chat-conversation-header__button:focus-visible {
  --outline-style: none;
  outline-style: none;
}
.chat-conversation-header__variant-1:focus-visible {
  --outline-style: none;
  outline-style: none;
}
.chat-conversation-header__variant-1:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.chat-conversation-header__button:active {
  scale: .99;
}
.chat-conversation-header__variant-1:disabled {
  cursor: not-allowed;
}
.chat-conversation-header__variant-1:disabled {
  opacity: .4;
}
.chat-conversation-header__variant-1:disabled:active {
  --scale-x: 100%;
  --scale-y: 100%;
  --scale-z: 100%;
  scale: 100% 100%;
}
}
}
</style>
