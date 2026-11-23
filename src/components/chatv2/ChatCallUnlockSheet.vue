<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Lock, MessageSquare, Phone, X } from "@/icons";

const CALL_TARGET = 7;

const props = defineProps({
  open: { type: Boolean, default: false },
  sentCount: { type: Number, default: 0 },
  title: { type: String, default: "" },
});

const emit = defineEmits(["close"]);

const sent = computed(() => Math.min(Math.max(Number(props.sentCount) || 0, 0), CALL_TARGET));
const remaining = computed(() => Math.max(CALL_TARGET - sent.value, 0));
const panelRef = ref(null);

function onKeydown(event) {
  if (event.key === "Escape") emit("close");
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      window.addEventListener("keydown", onKeydown);
      await nextTick();
      // Focus the sheet itself, not a button, so the close control does not
      // render as a pre-selected action.
      panelRef.value?.focus();
    } else {
      window.removeEventListener("keydown", onKeydown);
    }
  },
);

onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="app-modal-enter-active"
      enter-from-class="app-modal-enter-from"
      leave-active-class="app-modal-leave-active"
      leave-to-class="app-modal-leave-to"
    >
      <div v-if="open" class="unlock">
        <div class="unlock__backdrop" @click="emit('close')" />

        <div
          ref="panelRef"
          tabindex="-1"
          class="app-modal-panel unlock__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="call-unlock-title"
        >
          <span class="unlock__grab" aria-hidden="true" />

          <header class="unlock__head">
            <span class="unlock__mark" aria-hidden="true">
              <Lock class="unlock__mark-icon" :stroke-width="1.9" />
            </span>

            <div class="unlock__body">
              <h2 id="call-unlock-title" class="unlock__title">Calls unlock at 7 messages</h2>
              <p class="unlock__lede">
                {{
                  sent === 0
                    ? "Audio and video stay locked until you have sent 7 messages here."
                    : remaining > 0
                      ? `${remaining} more message${remaining === 1 ? "" : "s"} and calls open up.`
                      : "Calls are unlocked — the buttons in the header are live."
                }}
              </p>
              <p v-if="title" class="unlock__with">with {{ title }}</p>
            </div>

            <button
              type="button"
              class="unlock__close"
              title="Close"
              aria-label="Close"
              @click="emit('close')"
            >
              <X class="unlock__close-icon" :stroke-width="1.9" aria-hidden="true" />
            </button>
          </header>

          <section class="unlock__meter">
            <div class="unlock__meter-head">
              <span class="unlock__meter-label">Messages you sent</span>
              <span class="unlock__meter-count">{{ sent }} / {{ CALL_TARGET }}</span>
            </div>

            <div
              class="unlock__segments"
              role="progressbar"
              :aria-valuenow="sent"
              aria-valuemin="0"
              :aria-valuemax="CALL_TARGET"
              :aria-valuetext="`${sent} of ${CALL_TARGET} messages sent`"
            >
              <span
                v-for="i in CALL_TARGET"
                :key="i"
                class="unlock__segment"
                :class="{ 'unlock__segment--on': i <= sent }"
              />
            </div>

            <p class="unlock__note">
              <MessageSquare class="unlock__note-icon" :stroke-width="1.9" aria-hidden="true" />
              {{
                remaining > 0
                  ? `${remaining} more to go — only messages you send are counted.`
                  : "Enough messages sent — calls are unlocked."
              }}
            </p>
          </section>

          <p class="unlock__fineprint">
            The lock is a local rule computed on this device to keep cold callers out. It is not
            uploaded and your contact never sees it.
          </p>

          <footer class="unlock__foot">
            <button type="button" class="unlock__btn" @click="emit('close')">
              <Phone
                v-if="remaining === 0"
                class="unlock__btn-icon"
                :stroke-width="1.9"
                aria-hidden="true"
              />
              <span>Got it</span>
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Ledger pass: a bottom sheet on phones, a hairline panel above. */

.unlock {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.unlock__backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in oklab, #000 58%, transparent);
  backdrop-filter: blur(2px);
}

.unlock__panel {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  width: 100%;
  max-width: 25rem;
  padding: var(--app-space-4) var(--app-space-5) var(--app-space-5);
  border: 1px solid var(--app-border);
  border-bottom: 0;
  border-radius: var(--app-radius-lg) var(--app-radius-lg) 0 0;
  background: var(--app-surface);
  box-shadow: 0 -24px 60px -30px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

.unlock__panel:focus {
  outline: none;
}

.unlock__grab {
  align-self: center;
  width: 34px;
  height: 3px;
  border-radius: 2px;
  background: var(--app-border-strong);
}

/* ---- Head ---- */

.unlock__head {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  padding-bottom: var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
}

.unlock__mark {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  color: var(--app-warning);
}

.unlock__mark-icon {
  width: 14px;
  height: 14px;
}

.unlock__body {
  flex: 1;
  min-width: 0;
}

.unlock__title {
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  line-height: 1.3;
  color: var(--app-text);
}

.unlock__lede {
  margin: 5px 0 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--app-muted);
}

.unlock__with {
  margin: 6px 0 0;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.unlock__close {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.unlock__close-icon {
  width: 13px;
  height: 13px;
}

/* ---- Meter ---- */

.unlock__meter {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
}

.unlock__meter-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.unlock__meter-label {
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.unlock__meter-count {
  font-family: var(--font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--app-text);
}

.unlock__segments {
  display: flex;
  gap: 3px;
}

.unlock__segment {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--app-surface-inset-strong);
  transition:
    background-color var(--app-dur-slow) var(--app-ease-standard),
    transform var(--app-dur-slow) var(--app-ease-standard);
}

.unlock__segment--on {
  background: var(--app-text);
}

.unlock__note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--app-muted);
}

.unlock__note-icon {
  flex-shrink: 0;
  width: 11px;
  height: 11px;
  color: var(--app-muted-2);
}

/* ---- Footer ---- */

.unlock__fineprint {
  margin: 0;
  padding-top: var(--app-space-3);
  border-top: 1px solid var(--app-border);
  font-size: 10px;
  line-height: 1.65;
  color: var(--app-muted-2);
}

.unlock__foot {
  display: flex;
  justify-content: flex-end;
}

.unlock__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding-inline: 14px;
  border: 1px solid var(--app-text);
  border-radius: var(--app-radius-sm);
  background: var(--app-text);
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-bg);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.unlock__btn:active {
  transform: translateY(1px);
}

.unlock__btn-icon {
  width: 12px;
  height: 12px;
}

.unlock__btn:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
}

@media (min-width: 40rem) {
  .unlock {
    align-items: center;
    padding: var(--app-space-4);
  }

  .unlock__panel {
    border: 1px solid var(--app-border-strong);
    border-radius: var(--app-radius-lg);
    box-shadow: 0 24px 64px -30px rgba(0, 0, 0, 0.7);
  }

  .unlock__grab {
    display: none;
  }
}

@media (hover: hover) {
  .unlock__close:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }

  .unlock__btn:hover {
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
  }
}

@media (pointer: coarse) {
  .unlock__close {
    min-width: var(--app-touch-h);
    min-height: var(--app-touch-h);
  }

  .unlock__btn {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .unlock__close,
  .unlock__btn,
  .unlock__segment {
    transition: none;
  }
}
</style>
