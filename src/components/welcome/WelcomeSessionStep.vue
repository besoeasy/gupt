<script setup>
import { computed } from "vue";
import VaultTtlSlider from "@/components/VaultTtlSlider.vue";

const props = defineProps({
  modelValue: { type: Number, required: true },
});

const emit = defineEmits(["update:modelValue"]);

const ttlModel = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});
</script>

<template>
  <div class="session-step">
    <p class="session-step__lead">
      Gupt keeps your key on this device so you do not retype your secret every time.
    </p>

    <VaultTtlSlider v-model="ttlModel" />

    <p class="session-step__fact">
      <span class="session-step__dot" aria-hidden="true" />
      Using the app resets the timer; closing the tab does not.
    </p>
  </div>
</template>

<style scoped>
/* Ledger pass: a short explanation above the device-trust slider. */

.session-step {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.session-step__lead {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--app-muted);
}

.session-step__fact {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  padding-top: var(--app-space-3);
  border-top: 1px solid var(--app-border);
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 1.6;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
}

.session-step__dot {
  flex-shrink: 0;
  width: 5px;
  height: 5px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--app-primary);
}
</style>
