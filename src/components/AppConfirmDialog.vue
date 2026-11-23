<script setup>
import { Trash2, X } from "@/icons";

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: "Delete?" },
  message: { type: String, default: "This cannot be undone." },
  confirmLabel: { type: String, default: "Delete" },
});

const emit = defineEmits(["confirm", "cancel"]);
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="app-modal-enter-active"
      enter-from-class="app-modal-enter-from"
      leave-active-class="app-modal-leave-active"
      leave-to-class="app-modal-leave-to"
    >
      <div v-if="open" class="confirm">
        <div class="confirm__backdrop" @click="emit('cancel')" />

        <div
          class="app-modal-panel confirm__panel"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <header class="confirm__head">
            <div class="confirm__body">
              <h2 class="confirm__title">{{ title }}</h2>
              <p class="confirm__message">{{ message }}</p>
            </div>
            <button type="button" class="confirm__close" title="Cancel" @click="emit('cancel')">
              <X class="confirm__close-icon" :stroke-width="2" aria-hidden="true" />
            </button>
          </header>

          <footer class="confirm__actions">
            <button type="button" class="confirm__btn" @click="emit('cancel')">Cancel</button>
            <button type="button" class="confirm__btn confirm__btn--danger" @click="emit('confirm')">
              <Trash2 class="confirm__btn-icon" :stroke-width="1.9" aria-hidden="true" />
              {{ confirmLabel }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Ledger pass: a bottom sheet on phones, a hairline panel above. */

.confirm {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
}

.confirm__backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in oklab, #000 58%, transparent);
  backdrop-filter: blur(2px);
}

.confirm__panel {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 25rem;
  border: 1px solid var(--app-border);
  border-bottom: 0;
  border-radius: var(--app-radius-lg) var(--app-radius-lg) 0 0;
  background: var(--app-surface);
  box-shadow: 0 -24px 60px -30px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

.confirm__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--app-space-3);
  padding: var(--app-space-5) var(--app-space-5) var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
}

.confirm__body {
  min-width: 0;
}

.confirm__title {
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

.confirm__message {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--app-muted);
}

.confirm__close {
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

.confirm__close-icon {
  width: 13px;
  height: 13px;
}

.confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: var(--app-space-4) var(--app-space-5);
}

.confirm__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  padding-inline: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
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

.confirm__btn:active {
  transform: translateY(1px);
}

.confirm__btn-icon {
  width: 12px;
  height: 12px;
}

.confirm__btn--danger {
  border-color: color-mix(in oklab, var(--app-danger) 34%, var(--app-border));
  background: var(--app-danger-soft);
  color: var(--app-danger);
}

@media (min-width: 40rem) {
  .confirm {
    align-items: center;
    padding: var(--app-space-4);
  }

  .confirm__panel {
    border: 1px solid var(--app-border-strong);
    border-radius: var(--app-radius-lg);
    box-shadow: 0 24px 64px -30px rgba(0, 0, 0, 0.7);
  }
}

@media (hover: hover) {
  .confirm__close:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }

  .confirm__btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .confirm__btn--danger:hover {
    border-color: var(--app-danger);
    background: color-mix(in oklab, var(--app-danger) 16%, var(--app-surface));
    color: var(--app-danger);
  }
}

@media (pointer: coarse) {
  .confirm__close,
  .confirm__btn {
    min-height: var(--app-touch-h);
  }

  .confirm__close {
    min-width: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .confirm__close,
  .confirm__btn {
    transition: none;
  }
}
</style>
