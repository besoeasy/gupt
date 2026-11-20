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
.session-step {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.session-step__lead {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--app-muted);
}

.session-step__fact {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.5;
  color: var(--app-muted);
}

.session-step__dot {
  width: 5px;
  height: 5px;
  margin-top: 0.42rem;
  flex-shrink: 0;
  border-radius: 999px;
  background-color: var(--app-primary);
}
</style>
