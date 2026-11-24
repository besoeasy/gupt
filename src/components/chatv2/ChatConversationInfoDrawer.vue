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
  UserRound,
  UserPlus,
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
  isContact: { type: Boolean, default: false },
  contactSaving: { type: Boolean, default: false },
  contactSaved: { type: Boolean, default: false },
});

const emit = defineEmits(["close", "refresh", "update:timer", "add-contact", "view-profile"]);

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
    enter-active-class="drawer-enter-active"
    enter-from-class="drawer-enter-from"
    enter-to-class="drawer-enter-to"
    leave-active-class="drawer-leave-active"
    leave-from-class="drawer-leave-from"
    leave-to-class="drawer-leave-to"
  >
    <aside v-if="open" class="drawer">
      <header class="drawer__head">
        <div class="drawer__headline">
          <Activity class="drawer__head-icon" :stroke-width="1.8" aria-hidden="true" />
          <h3 class="drawer__head-title">
            {{ isGroup ? "Group details" : "Contact details" }}
          </h3>
        </div>
        <div class="drawer__tools">
          <button
            type="button"
            class="drawer__tool"
            title="Refresh live relay data"
            aria-label="Refresh live relay data"
            :disabled="loadingEnrichment"
            @click="emit('refresh')"
          >
            <RefreshCw
              class="drawer__tool-icon"
              :class="{ 'drawer__tool-icon--spin': loadingEnrichment }"
              :stroke-width="1.9"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            class="drawer__tool"
            title="Close details"
            aria-label="Close details"
            @click="emit('close')"
          >
            <X class="drawer__tool-icon" :stroke-width="1.9" aria-hidden="true" />
          </button>
        </div>
      </header>

      <!-- Identity sheet -->
      <section class="drawer__identity">
        <RoboAvatar :src="isGroup ? groupAvatar : peerAvatar" size="lg" :alt="title" />

        <h4 class="drawer__name">{{ title || "Conversation" }}</h4>
        <p v-if="!isGroup && peerPubkey" class="drawer__key">{{ shortId(peerPubkey) }}</p>

        <p v-if="peerBio" class="drawer__bio">{{ peerBio }}</p>

        <a
          v-if="peerWebsite"
          :href="peerWebsite.startsWith('http') ? peerWebsite : 'https://' + peerWebsite"
          target="_blank"
          rel="noopener noreferrer"
          class="drawer__site"
        >
          <span class="drawer__site-url">{{ peerWebsite }}</span>
          <ExternalLink class="drawer__site-icon" :stroke-width="1.9" aria-hidden="true" />
        </a>

        <button
          v-if="!isGroup && peerPubkey"
          type="button"
          class="drawer__copy"
          @click="handleCopyKey(peerPubkey)"
        >
          <Check
            v-if="copiedKey"
            class="drawer__copy-icon drawer__copy-icon--done"
            :stroke-width="2.2"
            aria-hidden="true"
          />
          <Copy v-else class="drawer__copy-icon" :stroke-width="1.9" aria-hidden="true" />
          <span>{{ copiedKey ? "Public key copied" : "Copy Ed25519 pubkey" }}</span>
        </button>

        <div v-if="!isGroup && peerPubkey" class="drawer__actions">
          <button
            type="button"
            class="drawer__action"
            title="Open full profile"
            aria-label="Open full profile"
            @click="emit('view-profile')"
          >
            <UserRound class="drawer__action-icon" :stroke-width="1.9" aria-hidden="true" />
            <span>View profile</span>
          </button>

          <button
            v-if="!isContact || contactSaved"
            type="button"
            class="drawer__action"
            :class="{ 'drawer__action--done': contactSaved }"
            :disabled="contactSaving || contactSaved"
            :title="contactSaved ? 'Added to contacts' : 'Add to contacts'"
            :aria-label="contactSaved ? 'Added to contacts' : 'Add to contacts'"
            :aria-busy="contactSaving"
            @click="emit('add-contact')"
          >
            <Check
              v-if="contactSaved"
              class="drawer__action-icon"
              :stroke-width="2"
              aria-hidden="true"
            />
            <UserPlus
              v-else
              class="drawer__action-icon"
              :class="{ 'drawer__action-icon--pulse': contactSaving }"
              :stroke-width="1.9"
              aria-hidden="true"
            />
            <span>{{ contactSaved ? "Added" : "Add contact" }}</span>
          </button>
        </div>
      </section>

      <!-- Message timer (DMs only) -->
      <section v-if="!isGroup" class="drawer__section">
        <h4 class="drawer__label">Message timer</h4>

        <p class="drawer__note">
          <Timer class="drawer__note-icon" :stroke-width="1.8" aria-hidden="true" />
          <span>
            New messages disappear after
            <span class="drawer__note-value">{{ chatTimerLabel(timerSec, { long: true }) }}</span
            >. Both sides share the latest change.
          </span>
        </p>

        <ChatTimerPresetGrid
          :model-value="timerSec"
          :columns="3"
          @select="emit('update:timer', $event)"
        />

        <p class="drawer__fineprint">
          Applies to messages sent from now on. Relays delete them at expiry and this device
          removes its copy too.
        </p>
      </section>

      <!-- Live Relay Telemetry -->
      <section class="drawer__section">
        <h4 class="drawer__label">Live Relay Telemetry</h4>

        <div class="drawer__facts">
          <div class="drawer__fact">
            <span class="drawer__fact-label">
              <Radio class="drawer__fact-icon" :stroke-width="1.8" aria-hidden="true" />
              Activity
            </span>
            <span class="drawer__fact-value">{{ lastSeenLabel || "Checking…" }}</span>
          </div>

          <div class="drawer__fact">
            <span class="drawer__fact-label">
              <Database class="drawer__fact-icon" :stroke-width="1.8" aria-hidden="true" />
              Relay Events
            </span>
            <span class="drawer__fact-value">
              {{ relayEventCount !== null ? `${relayEventCount} events` : "Querying…" }}
            </span>
          </div>

          <div class="drawer__fact">
            <span class="drawer__fact-label">
              <ShieldCheck class="drawer__fact-icon" :stroke-width="1.8" aria-hidden="true" />
              Sync State
            </span>
            <span
              class="drawer__fact-value"
              :class="syncParity === 'synced' ? 'drawer__fact-value--ok' : 'drawer__fact-value--warn'"
            >
              {{ syncParityLabel }}
            </span>
          </div>

          <div v-if="relayLatencyMs" class="drawer__fact">
            <span class="drawer__fact-label">
              <Server class="drawer__fact-icon" :stroke-width="1.8" aria-hidden="true" />
              Relay latency
            </span>
            <span class="drawer__fact-value drawer__fact-value--num">{{ relayLatencyMs }} ms</span>
          </div>
        </div>
      </section>

      <!-- Group members -->
      <section v-if="isGroup" class="drawer__section">
        <h4 class="drawer__label">Members ({{ group?.members?.length || 0 }})</h4>

        <div class="drawer__members">
          <div v-for="pubkey in group?.members || []" :key="pubkey" class="drawer__member">
            <RoboAvatar :pubkey="pubkey" size="sm" rounded="md" />
            <div class="drawer__member-body">
              <p class="drawer__member-name">{{ displayName(pubkey) }}</p>
              <p class="drawer__member-meta">{{ memberActivity(pubkey) }}</p>
            </div>
            <span v-if="pubkey === selfPubkey" class="drawer__member-you">You</span>
          </div>
        </div>
      </section>
    </aside>
  </Transition>
</template>

<style scoped>
/* Ledger pass: the details panel is a ruled column, not a card stack. */

.drawer {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 100%;
  overflow-y: auto;
  border-left: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text);
}

/* ---- Head ---- */

.drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
  padding: 12px var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
}

.drawer__headline {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.drawer__head-icon {
  width: 12px;
  height: 12px;
  color: var(--app-muted-2);
}

.drawer__head-title {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

.drawer__tools {
  display: flex;
  align-items: center;
  gap: 2px;
}

.drawer__tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.drawer__tool:disabled {
  opacity: 0.5;
  cursor: default;
}

.drawer__tool-icon {
  width: 13px;
  height: 13px;
}

.drawer__tool-icon--spin {
  animation: spin 1s linear infinite;
}

/* ---- Identity ---- */

.drawer__identity {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
}

.drawer__name {
  margin: 4px 0 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  line-height: 1.3;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.drawer__key {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
}

.drawer__bio {
  margin: 4px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--app-muted);
  overflow-wrap: anywhere;
}

.drawer__site {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  min-height: 24px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--app-primary);
  text-decoration: none;
}

.drawer__site-url {
  overflow-wrap: anywhere;
}

.drawer__site-icon {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
}

.drawer__copy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  margin-top: 4px;
  padding-inline: 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.drawer__copy-icon {
  width: 11px;
  height: 11px;
}

.drawer__copy-icon--done {
  color: var(--app-success);
}

.drawer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.drawer__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding-inline: 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.drawer__action:disabled {
  opacity: 0.45;
  cursor: default;
}

.drawer__action--done {
  border-color: color-mix(in oklab, var(--app-success) 30%, transparent);
  color: var(--app-success);
}

.drawer__action-icon {
  width: 11px;
  height: 11px;
}

.drawer__action-icon--pulse {
  animation: ledger-dot-pulse 1.2s var(--app-ease-standard) infinite;
}

/* ---- Sections ---- */

.drawer__section {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
}

.drawer__section:last-child {
  border-bottom: 0;
}

.drawer__label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.drawer__note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--app-muted);
}

.drawer__note-icon {
  flex-shrink: 0;
  width: 11px;
  height: 11px;
  margin-top: 3px;
  color: var(--app-muted-2);
}

.drawer__note-value {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--app-text);
}

.drawer__fineprint {
  margin: 0;
  font-size: 9.5px;
  line-height: 1.6;
  color: var(--app-muted-2);
}

/* ---- Facts ---- */

.drawer__facts {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  overflow: hidden;
}

.drawer__fact {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 10px;
  padding: 8px 10px;
}

.drawer__fact + .drawer__fact {
  border-top: 1px solid var(--app-border);
}

.drawer__fact-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.drawer__fact-icon {
  width: 10px;
  height: 10px;
}

.drawer__fact-value {
  font-size: 11px;
  color: var(--app-text-soft);
  text-align: right;
}

.drawer__fact-value--num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.drawer__fact-value--ok {
  color: var(--app-success);
}

.drawer__fact-value--warn {
  color: var(--app-warning);
}

/* ---- Members ---- */

.drawer__members {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  overflow: hidden;
}

.drawer__member {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
}

.drawer__member + .drawer__member {
  border-top: 1px solid var(--app-border);
}

.drawer__member-body {
  flex: 1;
  min-width: 0;
}

.drawer__member-name {
  margin: 0;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer__member-meta {
  margin: 1px 0 0;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer__member-you {
  flex-shrink: 0;
  padding: 1px 5px;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 7.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

/* ---- Movement ---- */

.drawer-enter-active {
  transition:
    opacity 200ms var(--app-ease-standard),
    transform 280ms var(--app-ease-emphasized);
}

.drawer-leave-active {
  transition:
    opacity 160ms var(--app-ease-standard),
    transform 180ms var(--app-ease-in);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
  transform: translateX(24px);
}

.drawer-enter-to,
.drawer-leave-from {
  opacity: 1;
  transform: translateX(0);
}

@media (min-width: 40rem) {
  .drawer {
    width: 320px;
    flex-shrink: 0;
  }
}

@media (hover: hover) {
  .drawer__tool:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }

  .drawer__copy:hover,
  .drawer__action:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .drawer__site:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
}

@media (pointer: coarse) {
  .drawer__tool,
  .drawer__copy,
  .drawer__action,
  .drawer__site {
    min-height: var(--app-touch-h);
  }

  .drawer__tool {
    min-width: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active,
  .drawer-leave-active {
    transition: none;
  }

  .drawer__tool,
  .drawer__copy {
    transition: none;
  }
}
</style>
