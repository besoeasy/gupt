<script setup>
import { computed, ref } from "vue";
import {
  X,
  ShieldCheck,
  Radio,
  Server,
  Activity,
  Copy,
  Check,
  ExternalLink,
  Users,
  Database,
  RefreshCw,
  Timer,
} from "@/icons";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { shortId } from "@/lib/crypto";
import { copyToClipboard } from "@/lib/clipboard";
import { formatTimeAgo } from "@/lib/lastSeen";
import {
  CHAT_TIMER_DEFAULT_SEC,
  chatTimerLabel,
} from "@/lib/chatTimer";
import ChatTimerPresetGrid from "@/components/chatv2/ChatTimerPresetGrid.vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  isGroup: { type: Boolean, default: false },
  title: { type: String, default: "" },
  peerPubkey: { type: String, default: "" },
  peerAvatar: { type: String, default: "" },
  groupAvatar: { type: String, default: "" },
  group: { type: Object, default: () => ({}) },
  displayName: { type: Function, required: true },
  lastSeenLabel: { type: String, default: "" },
  lastActivitySec: { type: Number, default: null },
  peerBio: { type: String, default: "" },
  peerWebsite: { type: String, default: "" },
  relayEventCount: { type: Number, default: null },
  relayLatencyMs: { type: Number, default: null },
  relayNodeId: { type: String, default: "" },
  syncParity: { type: String, default: "synced" },
  syncParityLabel: { type: String, default: "" },
  loadingEnrichment: { type: Boolean, default: false },
  memberSeenAt: { type: Map, default: () => new Map() },
  selfPubkey: { type: String, default: "" },
  timerSec: { type: Number, default: CHAT_TIMER_DEFAULT_SEC },
});

const emit = defineEmits(["close", "refresh", "update:timer"]);

const copiedKey = ref(false);

async function handleCopyKey(key) {
  if (!key) return;
  await copyToClipboard(key);
  copiedKey.value = true;
  setTimeout(() => {
    copiedKey.value = false;
  }, 2000);
}

function memberActivity(pk) {
  if (pk === props.selfPubkey) return "You";
  const ts = props.memberSeenAt.get(pk);
  if (!ts) return "Offline";
  return `Seen ${formatTimeAgo(Math.floor(ts / 1000))}`;
}
</script>

<template>
  <Transition
    enter-active-class="chat-conversation-info-drawer__enter-active-class"
    enter-from-class="chat-conversation-info-drawer__enter-from-class"
    enter-to-class="chat-conversation-info-drawer__enter-to-class"
    leave-active-class="chat-conversation-info-drawer__leave-active-class"
    leave-from-class="chat-conversation-info-drawer__leave-from-class"
    leave-to-class="chat-conversation-info-drawer__leave-to-class"
  >
    <aside
      v-if="open"
      class="chat-conversation-info-drawer__aside"
    >
      <!-- Header with Close button -->
      <div class="chat-conversation-info-drawer__block">
        <div class="chat-conversation-info-drawer__block-2">
          <Activity class="chat-conversation-info-drawer__activity" />
          <h3 class="chat-conversation-info-drawer__heading">
            {{ isGroup ? "Group Details" : "Contact Details" }}
          </h3>
        </div>
        <div class="chat-conversation-info-drawer__block-3">
          <button
            type="button"
            @click="emit('refresh')"
            :disabled="loadingEnrichment"
            class="chat-conversation-info-drawer__button-refresh-live"
            title="Refresh live relay data"
            aria-label="Refresh live relay data"
          >
            <RefreshCw class="chat-conversation-info-drawer__refresh-cw" :class="{ 'chat-conversation-info-drawer__refresh-cw--spin': loadingEnrichment }" />
          </button>
          <button
            type="button"
            @click="emit('close')"
            class="chat-conversation-info-drawer__button-close-details"
            title="Close details"
            aria-label="Close details"
          >
            <X class="chat-conversation-info-drawer__x" />
          </button>
        </div>
      </div>

      <!-- Identity Profile Card -->
      <div
        class="chat-conversation-info-drawer__block-4"
      >
        <div class="chat-conversation-info-drawer__block-5">
          <RoboAvatar :src="isGroup ? groupAvatar : peerAvatar" size="lg" :alt="title" />
        </div>
        <div class="chat-conversation-info-drawer__block-6">
          <h4 class="chat-conversation-info-drawer__heading-2">{{ title || "Conversation" }}</h4>
          <p v-if="!isGroup && peerPubkey" class="chat-conversation-info-drawer__text">
            {{ shortId(peerPubkey) }}
          </p>
        </div>

        <p v-if="peerBio" class="chat-conversation-info-drawer__text-2">
          {{ peerBio }}
        </p>

        <a
          v-if="peerWebsite"
          :href="peerWebsite.startsWith('http') ? peerWebsite : 'https://' + peerWebsite"
          target="_blank"
          rel="noopener noreferrer"
          class="chat-conversation-info-drawer__link"
        >
          <span>{{ peerWebsite }}</span>
          <ExternalLink class="chat-conversation-info-drawer__external-link" />
        </a>

        <!-- Public Key Copy button -->
        <button
          v-if="!isGroup && peerPubkey"
          type="button"
          @click="handleCopyKey(peerPubkey)"
          class="chat-conversation-info-drawer__button"
        >
          <Copy v-if="!copiedKey" class="chat-conversation-info-drawer__copy" />
          <Check v-else class="chat-conversation-info-drawer__check" />
          <span>{{ copiedKey ? "Public key copied!" : "Copy Ed25519 Pubkey" }}</span>
        </button>
      </div>

      <!-- Message Timer (DMs only) -->
      <div v-if="!isGroup" class="chat-conversation-info-drawer__block-7">
        <h4 class="chat-conversation-info-drawer__heading-message-timer">
          Message Timer
        </h4>
        <div class="chat-conversation-info-drawer__block-8">
          <p class="chat-conversation-info-drawer__text-3">
            <Timer class="chat-conversation-info-drawer__timer" :stroke-width="1.8" />
            <span>
              New messages in this chat disappear after
              <span class="chat-conversation-info-drawer__text-4">{{ chatTimerLabel(timerSec, { long: true }) }}</span>.
              Both sides share the latest change.
            </span>
          </p>
          <ChatTimerPresetGrid
            :model-value="timerSec"
            :columns="3"
            @select="emit('update:timer', $event)"
          />
          <p class="chat-conversation-info-drawer__text-5">
            Applies to messages sent from now on. Relays delete them at expiry and
            this device removes its copy too.
          </p>
        </div>
      </div>

      <!-- Live Rabta Relay Telemetry Card -->
      <div class="chat-conversation-info-drawer__block-9">
        <h4 class="chat-conversation-info-drawer__heading-live-relay">
          Live Relay Telemetry
        </h4>
        <div class="chat-conversation-info-drawer__block-10">
          <!-- Live Activity / Status -->
          <div class="chat-conversation-info-drawer__block-11">
            <span class="chat-conversation-info-drawer__text-activity">
              <Radio class="chat-conversation-info-drawer__radio" />
              Activity
            </span>
            <span class="chat-conversation-info-drawer__text-6">
              {{ lastSeenLabel || "Checking…" }}
            </span>
          </div>

          <!-- Live Relay Events Count -->
          <div class="chat-conversation-info-drawer__block-12">
            <span class="chat-conversation-info-drawer__text-relay-events">
              <Database class="chat-conversation-info-drawer__database" />
              Relay Events
            </span>
            <span class="chat-conversation-info-drawer__text-7">
              {{ relayEventCount !== null ? `${relayEventCount} events` : "Querying…" }}
            </span>
          </div>

          <!-- Sync Parity -->
          <div class="chat-conversation-info-drawer__block-13">
            <span class="chat-conversation-info-drawer__text-sync-state">
              <ShieldCheck class="chat-conversation-info-drawer__shield-check" />
              Sync State
            </span>
            <span
              class="chat-conversation-info-drawer__text-8"
              :class="
                syncParity === 'synced'
                  ? 'chat-conversation-info-drawer__text--success'
                  : 'chat-conversation-info-drawer__text--warning'
              "
            >
              {{ syncParityLabel }}
            </span>
          </div>

          <!-- Node Latency & Gateway -->
          <div v-if="relayLatencyMs" class="chat-conversation-info-drawer__block-14">
            <span class="chat-conversation-info-drawer__text-relay-latency">
              <Server class="chat-conversation-info-drawer__server" />
              Relay Latency
            </span>
            <span class="chat-conversation-info-drawer__text-ms">{{ relayLatencyMs }} ms</span>
          </div>
        </div>
      </div>

      <!-- Group Members (for Groups) -->
      <div v-if="isGroup" class="chat-conversation-info-drawer__block-15">
        <div class="chat-conversation-info-drawer__block-16">
          <h4 class="chat-conversation-info-drawer__heading-3">
            Members ({{ group?.members?.length || 0 }})
          </h4>
        </div>

        <div class="chat-conversation-info-drawer__block-17">
          <div
            v-for="pubkey in group?.members || []"
            :key="pubkey"
            class="chat-conversation-info-drawer__block-18"
          >
            <RoboAvatar :src="pubkey" size="sm" rounded="md" class="chat-conversation-info-drawer__robo-avatar" />
            <div class="chat-conversation-info-drawer__block-19">
              <p class="chat-conversation-info-drawer__text-9">
                {{ displayName(pubkey) }}
              </p>
              <p class="chat-conversation-info-drawer__text-10">
                {{ memberActivity(pubkey) }}
              </p>
            </div>
            <span
              v-if="pubkey === selfPubkey"
              class="chat-conversation-info-drawer__text-you"
            >
              You
            </span>
          </div>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.chat-conversation-info-drawer__button:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.chat-conversation-info-drawer__block-18:hover {
  border-color: var(--app-border-quiet);
}
}

@media (hover:hover) {
.chat-conversation-info-drawer__button-refresh-live:hover {
  background-color: var(--app-surface-raised-tint-soft);
}
}

@media (hover:hover) {
.chat-conversation-info-drawer__button-close-details:hover {
  background-color: var(--app-surface-raised-tint-soft);
}
}

@media (hover:hover) {
.chat-conversation-info-drawer__block-18:hover {
  background-color: var(--app-surface-tint-soft);
}
}

@media (hover:hover) {
.chat-conversation-info-drawer__button-refresh-live:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-conversation-info-drawer__button-close-details:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-conversation-info-drawer__button:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.chat-conversation-info-drawer__link:hover {
  text-decoration-line: underline;
}
}

@media (min-width:40rem) {
.chat-conversation-info-drawer__aside {
  width: 320px;
}
}

@layer gupt-components {
.chat-conversation-info-drawer__aside {
  z-index: 20;
}
.chat-conversation-info-drawer__timer {
  margin-top: calc(var(--spacing) * .5);
}
.chat-conversation-info-drawer__aside {
  display: flex;
}
.chat-conversation-info-drawer__block {
  display: flex;
}
.chat-conversation-info-drawer__block-2 {
  display: flex;
}
.chat-conversation-info-drawer__block-3 {
  display: flex;
}
.chat-conversation-info-drawer__button-refresh-live {
  display: flex;
}
.chat-conversation-info-drawer__button-close-details {
  display: flex;
}
.chat-conversation-info-drawer__block-4 {
  display: flex;
}
.chat-conversation-info-drawer__button {
  display: flex;
}
.chat-conversation-info-drawer__text-3 {
  display: flex;
}
.chat-conversation-info-drawer__block-11 {
  display: flex;
}
.chat-conversation-info-drawer__text-activity {
  display: flex;
}
.chat-conversation-info-drawer__block-12 {
  display: flex;
}
.chat-conversation-info-drawer__text-relay-events {
  display: flex;
}
.chat-conversation-info-drawer__block-13 {
  display: flex;
}
.chat-conversation-info-drawer__text-sync-state {
  display: flex;
}
.chat-conversation-info-drawer__block-14 {
  display: flex;
}
.chat-conversation-info-drawer__text-relay-latency {
  display: flex;
}
.chat-conversation-info-drawer__block-16 {
  display: flex;
}
.chat-conversation-info-drawer__block-18 {
  display: flex;
}
.chat-conversation-info-drawer__link {
  display: inline-flex;
}
.chat-conversation-info-drawer__external-link {
  height: calc(var(--spacing) * 3);
}
.chat-conversation-info-drawer__copy {
  height: calc(var(--spacing) * 3.5);
}
.chat-conversation-info-drawer__check {
  height: calc(var(--spacing) * 3.5);
}
.chat-conversation-info-drawer__radio {
  height: calc(var(--spacing) * 3.5);
}
.chat-conversation-info-drawer__database {
  height: calc(var(--spacing) * 3.5);
}
.chat-conversation-info-drawer__shield-check {
  height: calc(var(--spacing) * 3.5);
}
.chat-conversation-info-drawer__server {
  height: calc(var(--spacing) * 3.5);
}
.chat-conversation-info-drawer__activity {
  height: calc(var(--spacing) * 4);
}
.chat-conversation-info-drawer__refresh-cw {
  height: calc(var(--spacing) * 4);
}
.chat-conversation-info-drawer__x {
  height: calc(var(--spacing) * 4);
}
.chat-conversation-info-drawer__timer {
  height: calc(var(--spacing) * 4);
}
.chat-conversation-info-drawer__button-refresh-live {
  min-height: 44px;
}
.chat-conversation-info-drawer__button-close-details {
  min-height: 44px;
}
.chat-conversation-info-drawer__link {
  min-height: 44px;
}
.chat-conversation-info-drawer__button {
  min-height: 44px;
}
.chat-conversation-info-drawer__external-link {
  width: calc(var(--spacing) * 3);
}
.chat-conversation-info-drawer__copy {
  width: calc(var(--spacing) * 3.5);
}
.chat-conversation-info-drawer__check {
  width: calc(var(--spacing) * 3.5);
}
.chat-conversation-info-drawer__radio {
  width: calc(var(--spacing) * 3.5);
}
.chat-conversation-info-drawer__database {
  width: calc(var(--spacing) * 3.5);
}
.chat-conversation-info-drawer__shield-check {
  width: calc(var(--spacing) * 3.5);
}
.chat-conversation-info-drawer__server {
  width: calc(var(--spacing) * 3.5);
}
.chat-conversation-info-drawer__activity {
  width: calc(var(--spacing) * 4);
}
.chat-conversation-info-drawer__refresh-cw {
  width: calc(var(--spacing) * 4);
}
.chat-conversation-info-drawer__x {
  width: calc(var(--spacing) * 4);
}
.chat-conversation-info-drawer__timer {
  width: calc(var(--spacing) * 4);
}
.chat-conversation-info-drawer__aside {
  width: 100%;
}
.chat-conversation-info-drawer__button {
  width: 100%;
}
.chat-conversation-info-drawer__block-6 {
  max-width: 100%;
}
.chat-conversation-info-drawer__text-2 {
  max-width: 100%;
}
.chat-conversation-info-drawer__block-6 {
  min-width: 0;
}
.chat-conversation-info-drawer__block-19 {
  min-width: 0;
}
.chat-conversation-info-drawer__button-refresh-live {
  min-width: 44px;
}
.chat-conversation-info-drawer__button-close-details {
  min-width: 44px;
}
.chat-conversation-info-drawer__block-19 {
  flex: 1;
}
.chat-conversation-info-drawer__aside {
  flex-shrink: 0;
}
.chat-conversation-info-drawer__timer {
  flex-shrink: 0;
}
.chat-conversation-info-drawer__radio {
  flex-shrink: 0;
}
.chat-conversation-info-drawer__database {
  flex-shrink: 0;
}
.chat-conversation-info-drawer__shield-check {
  flex-shrink: 0;
}
.chat-conversation-info-drawer__server {
  flex-shrink: 0;
}
.chat-conversation-info-drawer__robo-avatar {
  flex-shrink: 0;
}
.chat-conversation-info-drawer__enter-to-class {
  --translate-x: 0;
  translate: 0 var(--translate-y,0);
}
.chat-conversation-info-drawer__leave-from-class {
  --translate-x: 0;
  translate: 0 var(--translate-y,0);
}
.chat-conversation-info-drawer__enter-from-class {
  --translate-x: 100%;
  translate: 100% var(--translate-y,0);
}
.chat-conversation-info-drawer__leave-to-class {
  --translate-x: 100%;
  translate: 100% var(--translate-y,0);
}
.chat-conversation-info-drawer__refresh-cw--spin {
  animation: var(--animate-spin);
}
.chat-conversation-info-drawer__button-refresh-live {
  cursor: pointer;
}
.chat-conversation-info-drawer__button-close-details {
  cursor: pointer;
}
.chat-conversation-info-drawer__button {
  cursor: pointer;
}
.chat-conversation-info-drawer__aside {
  flex-direction: column;
}
.chat-conversation-info-drawer__block-4 {
  flex-direction: column;
}
.chat-conversation-info-drawer__block {
  align-items: center;
}
.chat-conversation-info-drawer__block-2 {
  align-items: center;
}
.chat-conversation-info-drawer__block-3 {
  align-items: center;
}
.chat-conversation-info-drawer__button-refresh-live {
  align-items: center;
}
.chat-conversation-info-drawer__button-close-details {
  align-items: center;
}
.chat-conversation-info-drawer__block-4 {
  align-items: center;
}
.chat-conversation-info-drawer__link {
  align-items: center;
}
.chat-conversation-info-drawer__button {
  align-items: center;
}
.chat-conversation-info-drawer__block-11 {
  align-items: center;
}
.chat-conversation-info-drawer__text-activity {
  align-items: center;
}
.chat-conversation-info-drawer__block-12 {
  align-items: center;
}
.chat-conversation-info-drawer__text-relay-events {
  align-items: center;
}
.chat-conversation-info-drawer__block-13 {
  align-items: center;
}
.chat-conversation-info-drawer__text-sync-state {
  align-items: center;
}
.chat-conversation-info-drawer__block-14 {
  align-items: center;
}
.chat-conversation-info-drawer__text-relay-latency {
  align-items: center;
}
.chat-conversation-info-drawer__block-16 {
  align-items: center;
}
.chat-conversation-info-drawer__block-18 {
  align-items: center;
}
.chat-conversation-info-drawer__text-3 {
  align-items: flex-start;
}
.chat-conversation-info-drawer__block {
  justify-content: space-between;
}
.chat-conversation-info-drawer__block-11 {
  justify-content: space-between;
}
.chat-conversation-info-drawer__block-12 {
  justify-content: space-between;
}
.chat-conversation-info-drawer__block-13 {
  justify-content: space-between;
}
.chat-conversation-info-drawer__block-14 {
  justify-content: space-between;
}
.chat-conversation-info-drawer__block-16 {
  justify-content: space-between;
}
.chat-conversation-info-drawer__button-refresh-live {
  justify-content: center;
}
.chat-conversation-info-drawer__button-close-details {
  justify-content: center;
}
.chat-conversation-info-drawer__button {
  justify-content: center;
}
.chat-conversation-info-drawer__block-3 {
  gap: var(--spacing);
}
.chat-conversation-info-drawer__link {
  gap: var(--spacing);
}
.chat-conversation-info-drawer__button {
  gap: calc(var(--spacing) * 1.5);
}
.chat-conversation-info-drawer__text-activity {
  gap: calc(var(--spacing) * 1.5);
}
.chat-conversation-info-drawer__text-relay-events {
  gap: calc(var(--spacing) * 1.5);
}
.chat-conversation-info-drawer__text-sync-state {
  gap: calc(var(--spacing) * 1.5);
}
.chat-conversation-info-drawer__text-relay-latency {
  gap: calc(var(--spacing) * 1.5);
}
.chat-conversation-info-drawer__block-2 {
  gap: calc(var(--spacing) * 2);
}
.chat-conversation-info-drawer__text-3 {
  gap: calc(var(--spacing) * 2);
}
.chat-conversation-info-drawer__block-18 {
  gap: calc(var(--spacing) * 2.5);
}
:where(.chat-conversation-info-drawer__block-17>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.chat-conversation-info-drawer__block-4>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.chat-conversation-info-drawer__block-7>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.chat-conversation-info-drawer__block-9>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.chat-conversation-info-drawer__block-15>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.chat-conversation-info-drawer__block-8>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2.5) * calc(1 - 0));
}
:where(.chat-conversation-info-drawer__block-10>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2.5) * calc(1 - 0));
}
:where(.chat-conversation-info-drawer__aside>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
.chat-conversation-info-drawer__heading-2 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-conversation-info-drawer__text {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-conversation-info-drawer__text-9 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-conversation-info-drawer__text-10 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-conversation-info-drawer__block-5 {
  overflow: hidden;
}
.chat-conversation-info-drawer__aside {
  overflow-y: auto;
}
.chat-conversation-info-drawer__text-you {
  border-radius: .25rem;
}
.chat-conversation-info-drawer__block-5 {
  border-radius: var(--radius-2xl);
}
.chat-conversation-info-drawer__text-8 {
  border-radius: 3.40282e38px;
}
.chat-conversation-info-drawer__button-refresh-live {
  border-radius: var(--radius-lg);
}
.chat-conversation-info-drawer__button-close-details {
  border-radius: var(--radius-lg);
}
.chat-conversation-info-drawer__button {
  border-radius: var(--radius-lg);
}
.chat-conversation-info-drawer__block-18 {
  border-radius: var(--radius-lg);
}
.chat-conversation-info-drawer__block-4 {
  border-radius: var(--radius-xl);
}
.chat-conversation-info-drawer__block-8 {
  border-radius: var(--radius-xl);
}
.chat-conversation-info-drawer__block-10 {
  border-radius: var(--radius-xl);
}
.chat-conversation-info-drawer__block-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-conversation-info-drawer__block-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-conversation-info-drawer__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-conversation-info-drawer__block-8 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-conversation-info-drawer__block-10 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-conversation-info-drawer__text--success {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-conversation-info-drawer__text--warning {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-conversation-info-drawer__block-18 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-conversation-info-drawer__block {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.chat-conversation-info-drawer__aside {
  border-left-style: var(--border-style,solid);
  border-left-width: 1px;
}
.chat-conversation-info-drawer__text--warning {
  border-color: #f99c004d;
}
.chat-conversation-info-drawer__text--success {
  border-color: #00bb7f4d;
}
.chat-conversation-info-drawer__block-18 {
  border-color: #0000;
}
.chat-conversation-info-drawer__block-5 {
  border-color: var(--ui-zinc-700);
}
.chat-conversation-info-drawer__button {
  border-color: var(--ui-zinc-800);
}
.chat-conversation-info-drawer__block {
  border-color: var(--app-border-faint);
}
.chat-conversation-info-drawer__block-4 {
  border-color: var(--app-border-faint);
}
.chat-conversation-info-drawer__aside {
  border-color: var(--app-border-quiet);
}
.chat-conversation-info-drawer__block-8 {
  border-color: var(--app-border-quiet);
}
.chat-conversation-info-drawer__block-10 {
  border-color: var(--app-border-quiet);
}
.chat-conversation-info-drawer__text--warning {
  background-color: #f99c0026;
}
.chat-conversation-info-drawer__text--success {
  background-color: #00bb7f26;
}
.chat-conversation-info-drawer__text-you {
  background-color: var(--ui-zinc-800);
}
.chat-conversation-info-drawer__block-4 {
  background-color: var(--app-surface-tint-soft);
}
.chat-conversation-info-drawer__block-8 {
  background-color: var(--ui-zinc-900);
}
.chat-conversation-info-drawer__block-10 {
  background-color: var(--ui-zinc-900);
}
.chat-conversation-info-drawer__button {
  background-color: var(--ui-zinc-900);
}
.chat-conversation-info-drawer__aside {
  background-color: var(--ui-zinc-950);
}
.chat-conversation-info-drawer__block-18 {
  padding: calc(var(--spacing) * 2);
}
.chat-conversation-info-drawer__block-4 {
  padding: calc(var(--spacing) * 3);
}
.chat-conversation-info-drawer__block-8 {
  padding: calc(var(--spacing) * 3);
}
.chat-conversation-info-drawer__block-10 {
  padding: calc(var(--spacing) * 3);
}
.chat-conversation-info-drawer__aside {
  padding: calc(var(--spacing) * 4);
}
.chat-conversation-info-drawer__heading-message-timer {
  padding-inline: var(--spacing);
}
.chat-conversation-info-drawer__heading-live-relay {
  padding-inline: var(--spacing);
}
.chat-conversation-info-drawer__block-16 {
  padding-inline: var(--spacing);
}
.chat-conversation-info-drawer__text-you {
  padding-inline: calc(var(--spacing) * 1.5);
}
.chat-conversation-info-drawer__text-8 {
  padding-inline: calc(var(--spacing) * 2);
}
.chat-conversation-info-drawer__button {
  padding-inline: calc(var(--spacing) * 3);
}
.chat-conversation-info-drawer__text-8 {
  padding-block: calc(var(--spacing) * .5);
}
.chat-conversation-info-drawer__text-you {
  padding-block: calc(var(--spacing) * .5);
}
.chat-conversation-info-drawer__button {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-conversation-info-drawer__block {
  padding-bottom: calc(var(--spacing) * 3);
}
.chat-conversation-info-drawer__block-4 {
  text-align: center;
}
.chat-conversation-info-drawer__heading {
  font-family: var(--font-mono);
}
.chat-conversation-info-drawer__text {
  font-family: var(--font-mono);
}
.chat-conversation-info-drawer__button {
  font-family: var(--font-mono);
}
.chat-conversation-info-drawer__heading-message-timer {
  font-family: var(--font-mono);
}
.chat-conversation-info-drawer__heading-live-relay {
  font-family: var(--font-mono);
}
.chat-conversation-info-drawer__text-6 {
  font-family: var(--font-mono);
}
.chat-conversation-info-drawer__text-7 {
  font-family: var(--font-mono);
}
.chat-conversation-info-drawer__text-8 {
  font-family: var(--font-mono);
}
.chat-conversation-info-drawer__text-ms {
  font-family: var(--font-mono);
}
.chat-conversation-info-drawer__heading-3 {
  font-family: var(--font-mono);
}
.chat-conversation-info-drawer__text-10 {
  font-family: var(--font-mono);
}
.chat-conversation-info-drawer__text-you {
  font-family: var(--font-mono);
}
.chat-conversation-info-drawer__heading-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.chat-conversation-info-drawer__heading {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-conversation-info-drawer__text-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-conversation-info-drawer__block-10 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-conversation-info-drawer__text-9 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-conversation-info-drawer__text-you {
  font-size: 9px;
}
.chat-conversation-info-drawer__text {
  font-size: 10px;
}
.chat-conversation-info-drawer__heading-message-timer {
  font-size: 10px;
}
.chat-conversation-info-drawer__text-5 {
  font-size: 10px;
}
.chat-conversation-info-drawer__heading-live-relay {
  font-size: 10px;
}
.chat-conversation-info-drawer__heading-3 {
  font-size: 10px;
}
.chat-conversation-info-drawer__text-10 {
  font-size: 10px;
}
.chat-conversation-info-drawer__link {
  font-size: 11px;
}
.chat-conversation-info-drawer__button {
  font-size: 11px;
}
.chat-conversation-info-drawer__text-3 {
  font-size: 11px;
}
.chat-conversation-info-drawer__text-8 {
  font-size: 11px;
}
.chat-conversation-info-drawer__text-2 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.chat-conversation-info-drawer__text-3 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.chat-conversation-info-drawer__text-5 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.chat-conversation-info-drawer__text-4 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-conversation-info-drawer__text-6 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-conversation-info-drawer__text-9 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-conversation-info-drawer__heading-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.chat-conversation-info-drawer__heading {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-conversation-info-drawer__heading-message-timer {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-conversation-info-drawer__heading-live-relay {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-conversation-info-drawer__heading-3 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.chat-conversation-info-drawer__text-2 {
  overflow-wrap: break-word;
}
.chat-conversation-info-drawer__text--warning {
  color: var(--color-amber-300);
}
.chat-conversation-info-drawer__text--success {
  color: var(--color-emerald-300);
}
.chat-conversation-info-drawer__activity {
  color: var(--color-emerald-400);
}
.chat-conversation-info-drawer__link {
  color: var(--color-emerald-400);
}
.chat-conversation-info-drawer__check {
  color: var(--color-emerald-400);
}
.chat-conversation-info-drawer__timer {
  color: var(--color-emerald-400);
}
.chat-conversation-info-drawer__radio {
  color: var(--color-emerald-400);
}
.chat-conversation-info-drawer__shield-check {
  color: var(--color-emerald-400);
}
.chat-conversation-info-drawer__server {
  color: var(--color-purple-400);
}
.chat-conversation-info-drawer__database {
  color: var(--color-sky-400);
}
.chat-conversation-info-drawer__heading-2 {
  color: var(--color-white);
}
.chat-conversation-info-drawer__text-4 {
  color: var(--ui-zinc-200);
}
.chat-conversation-info-drawer__text-6 {
  color: var(--ui-zinc-200);
}
.chat-conversation-info-drawer__text-7 {
  color: var(--ui-zinc-200);
}
.chat-conversation-info-drawer__text-9 {
  color: var(--ui-zinc-200);
}
.chat-conversation-info-drawer__heading {
  color: var(--ui-zinc-300);
}
.chat-conversation-info-drawer__text-2 {
  color: var(--ui-zinc-300);
}
.chat-conversation-info-drawer__button {
  color: var(--ui-zinc-300);
}
.chat-conversation-info-drawer__text-ms {
  color: var(--ui-zinc-300);
}
.chat-conversation-info-drawer__button-refresh-live {
  color: var(--ui-zinc-400);
}
.chat-conversation-info-drawer__button-close-details {
  color: var(--ui-zinc-400);
}
.chat-conversation-info-drawer__text {
  color: var(--ui-zinc-400);
}
.chat-conversation-info-drawer__copy {
  color: var(--ui-zinc-400);
}
.chat-conversation-info-drawer__heading-message-timer {
  color: var(--ui-zinc-400);
}
.chat-conversation-info-drawer__text-3 {
  color: var(--ui-zinc-400);
}
.chat-conversation-info-drawer__heading-live-relay {
  color: var(--ui-zinc-400);
}
.chat-conversation-info-drawer__text-activity {
  color: var(--ui-zinc-400);
}
.chat-conversation-info-drawer__text-relay-events {
  color: var(--ui-zinc-400);
}
.chat-conversation-info-drawer__text-sync-state {
  color: var(--ui-zinc-400);
}
.chat-conversation-info-drawer__text-relay-latency {
  color: var(--ui-zinc-400);
}
.chat-conversation-info-drawer__heading-3 {
  color: var(--ui-zinc-400);
}
.chat-conversation-info-drawer__text-you {
  color: var(--ui-zinc-400);
}
.chat-conversation-info-drawer__text-5 {
  color: var(--ui-zinc-500);
}
.chat-conversation-info-drawer__text-10 {
  color: var(--ui-zinc-500);
}
.chat-conversation-info-drawer__heading {
  text-transform: uppercase;
}
.chat-conversation-info-drawer__heading-message-timer {
  text-transform: uppercase;
}
.chat-conversation-info-drawer__heading-live-relay {
  text-transform: uppercase;
}
.chat-conversation-info-drawer__heading-3 {
  text-transform: uppercase;
}
.chat-conversation-info-drawer__text-you {
  text-transform: uppercase;
}
.chat-conversation-info-drawer__text-7 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.chat-conversation-info-drawer__text-ms {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.chat-conversation-info-drawer__enter-from-class {
  opacity: 0;
}
.chat-conversation-info-drawer__leave-to-class {
  opacity: 0;
}
.chat-conversation-info-drawer__enter-to-class {
  opacity: 1;
}
.chat-conversation-info-drawer__leave-from-class {
  opacity: 1;
}
.chat-conversation-info-drawer__aside {
  --shadow: 0 25px 50px -12px var(--shadow-color,#00000040);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 25px 50px -12px var(--shadow-color,#00000040);
}
.chat-conversation-info-drawer__block-5 {
  --shadow: 0 4px 6px -1px var(--shadow-color,#0000001a), 0 2px 4px -2px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 4px 6px -1px var(--shadow-color,#0000001a), 0 2px 4px -2px var(--shadow-color,#0000001a);
}
.chat-conversation-info-drawer__aside {
  --backdrop-blur: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
  backdrop-filter: blur(var(--blur-md)) var(--backdrop-brightness,) var(--backdrop-contrast,) var(--backdrop-grayscale,) var(--backdrop-hue-rotate,) var(--backdrop-invert,) var(--backdrop-opacity,) var(--backdrop-saturate,) var(--backdrop-sepia,);
}
.chat-conversation-info-drawer__enter-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-conversation-info-drawer__leave-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-conversation-info-drawer__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-conversation-info-drawer__button-refresh-live {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-conversation-info-drawer__button-close-details {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-conversation-info-drawer__block-18 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.chat-conversation-info-drawer__leave-active-class {
  --duration: .15s;
  transition-duration: .15s;
}
.chat-conversation-info-drawer__enter-active-class {
  --duration: .2s;
  transition-duration: .2s;
}
.chat-conversation-info-drawer__leave-active-class {
  --ease: var(--ease-in);
  transition-timing-function: var(--ease-in);
}
.chat-conversation-info-drawer__enter-active-class {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.chat-conversation-info-drawer__button {
  -webkit-user-select: none;
  user-select: none;
}
.chat-conversation-info-drawer__button-refresh-live:disabled {
  opacity: .5;
}
[data-theme="light"] .chat-conversation-info-drawer__text--warning {
  color: var(--app-warning-strong);
}
[data-theme="light"] .chat-conversation-info-drawer__text--success {
  color: var(--app-success);
}
[data-theme="light"] .chat-conversation-info-drawer__activity {
  color: var(--app-success);
}
[data-theme="light"] .chat-conversation-info-drawer__link {
  color: var(--app-success);
}
[data-theme="light"] .chat-conversation-info-drawer__check {
  color: var(--app-success);
}
[data-theme="light"] .chat-conversation-info-drawer__timer {
  color: var(--app-success);
}
[data-theme="light"] .chat-conversation-info-drawer__radio {
  color: var(--app-success);
}
[data-theme="light"] .chat-conversation-info-drawer__shield-check {
  color: var(--app-success);
}
[data-theme="light"] .chat-conversation-info-drawer__server {
  color: #6d28d9;
}
[data-theme="light"] .chat-conversation-info-drawer__database {
  color: var(--app-info);
}
[data-theme="light"] .chat-conversation-info-drawer__heading {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-conversation-info-drawer__text-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-conversation-info-drawer__button {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-conversation-info-drawer__text-ms {
  color: var(--app-text-soft);
}
[data-theme="light"] .chat-conversation-info-drawer__button-refresh-live {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation-info-drawer__button-close-details {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation-info-drawer__text {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation-info-drawer__copy {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation-info-drawer__heading-message-timer {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation-info-drawer__text-3 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation-info-drawer__heading-live-relay {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation-info-drawer__text-activity {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation-info-drawer__text-relay-events {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation-info-drawer__text-sync-state {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation-info-drawer__text-relay-latency {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation-info-drawer__heading-3 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation-info-drawer__text-you {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation-info-drawer__text-5 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-conversation-info-drawer__text-10 {
  color: var(--app-muted);
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.chat-conversation-info-drawer__text--warning {
  border-color: color-mix(in oklab,var(--color-amber-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-conversation-info-drawer__text--success {
  border-color: color-mix(in oklab,var(--color-emerald-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-conversation-info-drawer__block-5 {
  border-color: color-mix(in oklab,var(--ui-zinc-700) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-conversation-info-drawer__text--warning {
  background-color: color-mix(in oklab,var(--color-amber-500) 15%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-conversation-info-drawer__text--success {
  background-color: color-mix(in oklab,var(--color-emerald-500) 15%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-conversation-info-drawer__block-8 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 50%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-conversation-info-drawer__block-10 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 50%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-conversation-info-drawer__button {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-conversation-info-drawer__aside {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 95%,transparent);
}
}
}
</style>
