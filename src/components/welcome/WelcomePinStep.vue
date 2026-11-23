<script setup>
import { computed, onMounted, ref } from "vue";
import PinStrengthMeter from "@/components/PinStrengthMeter.vue";
import { PIN_MIN_CHARS, secretPinEntropyBits } from "@/lib/crypto";

const props = defineProps({
  pin: { type: String, default: "" },
});

const emit = defineEmits(["update:pin", "next"]);

const input = ref(null);

// Arriving here is a deliberate click on Continue, so opening the keyboard is
// expected — unlike autofocusing the first screen on load.
onMounted(() => {
  input.value?.focus();
});

const pinModel = computed({
  get: () => props.pin,
  set: (value) => emit("update:pin", value),
});

const pinBits = computed(() => secretPinEntropyBits(props.pin));
const pinReady = computed(() => props.pin.trim().length >= PIN_MIN_CHARS);
</script>

<template>
  <div class="pin-step">
    <label class="pin-step__label" for="welcome-pin">
      PIN
      <span class="pin-step__hint">— {{ PIN_MIN_CHARS }}+ letters or digits</span>
    </label>

    <input
      id="welcome-pin"
      ref="input"
      v-model="pinModel"
      type="text"
      inputmode="text"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      placeholder="e.g. olive4Seven"
      class="pin-step__input"
      @keydown.enter.prevent="$emit('next')"
    />

    <PinStrengthMeter :bits="pinBits" />

    <p class="pin-step__note" :class="{ 'pin-step__note--ready': pinReady }">
      {{ pinReady
        ? "Mixed with your secret before the key is derived. Never uploaded."
        : `At least ${PIN_MIN_CHARS} characters — this PIN is part of your key, so there is no recovery if you forget it.` }}
    </p>
  </div>
</template>

<style scoped>
/* Ledger pass: a single monospace field with a strength ruler. */

.pin-step {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pin-step__label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

.pin-step__hint {
  font-weight: 400;
  letter-spacing: 0.02em;
  text-transform: none;
  color: var(--app-muted-2);
}

.pin-step__input {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-family: var(--font-mono);
  font-size: 12.5px;
  letter-spacing: 0.02em;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.pin-step__input::placeholder {
  color: var(--app-muted-2);
}

.pin-step__input:focus {
  outline: none;
  border-color: var(--app-border-strong);
  background: var(--app-surface);
  box-shadow: var(--app-focus-ring);
}

.pin-step__note {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--app-muted-2);
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.pin-step__note--ready {
  color: var(--app-muted);
}

@media (prefers-reduced-motion: reduce) {
  .pin-step__input,
  .pin-step__note {
    transition: none;
  }
}
</style>
