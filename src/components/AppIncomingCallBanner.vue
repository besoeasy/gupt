<script setup>
import { computed } from "vue";
import { PhoneCall, PhoneOff } from "@/icons";
import { useCallStore } from "@/stores/calls";
import { useProfileStore } from "@/stores/profiles";
import RoboAvatar from "@/components/RoboAvatar.vue";

const callStore = useCallStore();
const { displayName, profilePicture } = useProfileStore();

defineProps({
  belowNav: { type: Boolean, default: true },
});

const callerPubkey = computed(() => callStore.activePeerPubkey);
const isVideo = computed(() => callStore.incomingCall?.media?.video);

async function answer() {
  try {
    await callStore.acceptIncomingCall();
  } catch {}
}

function decline() {
  callStore.declineIncomingCall();
}
</script>

<template>
  <div
    class="call-banner"
    :class="belowNav ? 'call-banner--below-nav' : 'call-banner--top'"
    role="status"
    aria-live="polite"
  >
    <div class="call-banner__inner">
      <span class="call-banner__pulse" aria-hidden="true" />

      <RoboAvatar :pubkey="callerPubkey" :src="profilePicture(callerPubkey)" size="sm" />

      <div class="call-banner__body">
        <p class="call-banner__name">{{ displayName(callerPubkey) }}</p>
        <p class="call-banner__meta">
          {{ isVideo ? "Incoming video call" : "Incoming audio call" }}
        </p>
      </div>

      <div class="call-banner__actions">
        <button type="button" class="call-banner__btn call-banner__btn--answer" @click="answer">
          <PhoneCall class="call-banner__icon" :stroke-width="2" aria-hidden="true" />
          <span>Answer</span>
        </button>
        <button type="button" class="call-banner__btn" @click="decline">
          <PhoneOff class="call-banner__icon" :stroke-width="1.9" aria-hidden="true" />
          <span>Decline</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ledger pass: a sticky hairline strip that only reports the call. */

.call-banner {
  position: sticky;
  z-index: 40;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
  animation: call-banner-drop 320ms var(--app-ease-emphasized) both;
}

.call-banner--below-nav {
  top: 56px;
}

.call-banner--top {
  top: 0;
}

@keyframes call-banner-drop {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.call-banner__inner {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  width: 100%;
  max-width: 72rem;
  margin-inline: auto;
  padding: 10px var(--app-space-4);
}

.call-banner__pulse {
  flex-shrink: 0;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--app-success);
  animation: ledger-dot-pulse 1.8s var(--app-ease-standard) infinite;
}

.call-banner__body {
  flex: 1;
  min-width: 0;
}

.call-banner__name {
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.call-banner__meta {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.call-banner__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
}

.call-banner__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding-inline: 11px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.call-banner__btn:active {
  transform: translateY(1px);
}

.call-banner__btn--answer {
  border-color: var(--app-success);
  background: var(--app-success);
  color: var(--color-white);
}

.call-banner__icon {
  width: 12px;
  height: 12px;
}

.call-banner__btn:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
}

@media (min-width: 40rem) {
  .call-banner__inner {
    padding-inline: var(--app-space-6);
  }
}

@media (min-width: 64rem) {
  .call-banner__inner {
    padding-inline: var(--app-space-8);
  }
}

@media (max-width: 26rem) {
  .call-banner__meta {
    display: none;
  }

  .call-banner__btn {
    padding-inline: 8px;
  }

  .call-banner__btn span {
    display: none;
  }

  .call-banner__icon {
    width: 14px;
    height: 14px;
  }
}

@media (hover: hover) {
  .call-banner__btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .call-banner__btn--answer:hover {
    border-color: var(--app-success);
    background: color-mix(in oklab, var(--app-success) 86%, black);
    color: var(--color-white);
  }
}

@media (pointer: coarse) {
  .call-banner__btn {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .call-banner,
  .call-banner__pulse {
    animation: none;
  }

  .call-banner__btn {
    transition: none;
  }
}
</style>
