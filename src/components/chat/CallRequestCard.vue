<script setup>
import { computed, onBeforeUnmount, ref } from "vue";
import { Phone, PhoneIncoming, PhoneOff, Video } from "@/icons";

const props = defineProps({
  message: { type: Object, required: true },
});

const emit = defineEmits(["accept", "decline"]);

const isVideo = computed(() => Boolean(props.message?.media?.video));
const isMine = computed(() => Boolean(props.message?.mine));

const requestAgeMs = computed(() => {
  const msgTs = props.message?.created_at || props.message?.ts || 0;
  return Date.now() - msgTs;
});

const timedOut = ref(requestAgeMs.value > 60_000);

let timer = null;
if (!timedOut.value) {
  const remaining = Math.max(0, 60_000 - requestAgeMs.value);
  timer = setTimeout(() => {
    timedOut.value = true;
  }, remaining);
}
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});

const showButtons = computed(() => !isMine.value && !timedOut.value);

function handleAccept() {
  emit("accept", props.message);
}

function handleDecline() {
  emit("decline", props.message);
}
</script>

<template>
  <div class="call-req">
    <div class="call-req__card">
      <div class="call-req__head">
        <Video v-if="isVideo" class="call-req__icon" :stroke-width="1.8" aria-hidden="true" />
        <Phone v-else class="call-req__icon" :stroke-width="1.8" aria-hidden="true" />
        <span class="call-req__label">{{ isVideo ? "Video" : "Voice" }} call request</span>
      </div>

      <!-- Incoming: Accept / Decline buttons (only within 60s) -->
      <div v-if="showButtons" class="call-req__actions">
        <button type="button" class="call-req__btn call-req__btn--accept" @click="handleAccept">
          <PhoneIncoming class="call-req__btn-icon" :stroke-width="1.8" aria-hidden="true" />
          <span>Accept</span>
        </button>
        <button type="button" class="call-req__btn call-req__btn--decline" @click="handleDecline">
          <PhoneOff class="call-req__btn-icon" :stroke-width="1.8" aria-hidden="true" />
          <span>Decline</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ledger pass: a call request is a small plate between chat rows. */

.call-req {
  display: flex;
  justify-content: center;
  padding: var(--app-space-2) var(--app-space-4);
}

.call-req__card {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  max-width: 280px;
  padding: var(--app-space-3) var(--app-space-4);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  text-align: center;
}

.call-req__head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

.call-req__icon {
  flex-shrink: 0;
  width: 13px;
  height: 13px;
}

.call-req__label {
  white-space: nowrap;
}

.call-req__actions {
  display: flex;
  gap: 6px;
}

.call-req__btn {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  padding-inline: 10px;
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

.call-req__btn:active {
  transform: translateY(1px);
}

.call-req__btn--accept {
  border-color: color-mix(in oklab, var(--app-success) 36%, var(--app-border));
  background: color-mix(in oklab, var(--app-success) 10%, transparent);
  color: var(--app-success);
}

.call-req__btn--decline {
  border-color: color-mix(in oklab, var(--app-danger) 32%, var(--app-border));
  background: var(--app-danger-soft);
  color: var(--app-danger);
}

.call-req__btn-icon {
  width: 11px;
  height: 11px;
}

.call-req__btn:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
}

@media (hover: hover) {
  .call-req__btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .call-req__btn--accept:hover {
    border-color: var(--app-success);
    background: color-mix(in oklab, var(--app-success) 18%, transparent);
    color: var(--app-success);
  }

  .call-req__btn--decline:hover {
    border-color: var(--app-danger);
    background: color-mix(in oklab, var(--app-danger) 18%, transparent);
    color: var(--app-danger);
  }
}

@media (pointer: coarse) {
  .call-req__btn {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .call-req__btn {
    transition: none;
  }
}
</style>
