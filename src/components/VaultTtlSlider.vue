<script setup>
import { computed } from "vue";
import { formatVaultTtl, VAULT_TTL_MS, VAULT_TTL_STOPS_MS } from "@/lib/keyVault";

const props = defineProps({
  modelValue: { type: Number, default: VAULT_TTL_MS },
});

const emit = defineEmits(["update:modelValue"]);

// One label per stop in VAULT_TTL_STOPS_MS, same order.
const SHORT_LABELS = ["5m", "15m", "30m", "1h", "3h", "6h", "12h", "24h", "30h", "2d", "3d"];

const index = computed(() => {
  let best = 0;
  for (let i = 1; i < VAULT_TTL_STOPS_MS.length; i += 1) {
    const distance = Math.abs(VAULT_TTL_STOPS_MS[i] - props.modelValue);
    if (distance < Math.abs(VAULT_TTL_STOPS_MS[best] - props.modelValue)) best = i;
  }
  return best;
});

const valueLabel = computed(() => formatVaultTtl(VAULT_TTL_STOPS_MS[index.value]));
const fillPercent = computed(() => {
  const last = VAULT_TTL_STOPS_MS.length - 1;
  return last > 0 ? (index.value / last) * 100 : 0;
});

function onInput(event) {
  const next = VAULT_TTL_STOPS_MS[Number(event.target.value)];
  if (next) emit("update:modelValue", next);
}
</script>

<template>
  <div class="vault-ttl">
    <div class="vault-ttl__head">
      <label class="vault-ttl__label" for="vault-ttl-range">Stay signed in on this device</label>
      <output class="vault-ttl__value" for="vault-ttl-range">{{ valueLabel }}</output>
    </div>

    <input
      id="vault-ttl-range"
      class="vault-ttl__range"
      type="range"
      min="0"
      :max="VAULT_TTL_STOPS_MS.length - 1"
      step="1"
      :value="index"
      :aria-valuetext="valueLabel"
      :style="{ '--fill': `${fillPercent}%` }"
      @input="onInput"
    />

    <div class="vault-ttl__ticks" aria-hidden="true">
      <span
        v-for="(label, i) in SHORT_LABELS"
        :key="label"
        class="vault-ttl__tick"
        :class="{ 'vault-ttl__tick--on': i === index }"
      >{{ label }}</span>
    </div>

    <p class="vault-ttl__hint">
      After this long without opening Gupt, this device forgets your key and asks for your secret
      and PIN again.
    </p>
  </div>
</template>

<style scoped>
.vault-ttl {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  color: var(--app-text);
}

.vault-ttl__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.vault-ttl__label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--app-text);
}

.vault-ttl__value {
  flex-shrink: 0;
  padding: 0.15rem 0.6rem;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background-color: var(--app-surface-soft);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--app-text);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.vault-ttl__range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 44px;
  margin: 0;
  background: transparent;
  cursor: pointer;
  touch-action: pan-y;
}

.vault-ttl__range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--app-primary) var(--fill, 0%),
    var(--app-border) var(--fill, 0%)
  );
}

.vault-ttl__range::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--app-primary) var(--fill, 0%),
    var(--app-border) var(--fill, 0%)
  );
}

.vault-ttl__range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  margin-top: -10px;
  border: 3px solid var(--app-surface);
  border-radius: 50%;
  background-color: var(--app-primary);
  box-shadow: 0 1px 4px var(--shadow-color, rgb(0 0 0 / 25%));
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.vault-ttl__range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border: 3px solid var(--app-surface);
  border-radius: 50%;
  background-color: var(--app-primary);
  box-shadow: 0 1px 4px var(--shadow-color, rgb(0 0 0 / 25%));
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.vault-ttl__range:active::-webkit-slider-thumb {
  transform: scale(1.12);
}

.vault-ttl__range:active::-moz-range-thumb {
  transform: scale(1.12);
}

.vault-ttl__range:focus-visible {
  outline: none;
}

.vault-ttl__range:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--app-primary) 35%, transparent);
}

.vault-ttl__range:focus-visible::-moz-range-thumb {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--app-primary) 35%, transparent);
}

.vault-ttl__ticks {
  display: flex;
  margin-top: -0.35rem;
}

.vault-ttl__tick {
  flex: 1 1 0;
  min-width: 0;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted-2);
  transition: color 0.15s ease;
}

.vault-ttl__tick--on {
  font-weight: 600;
  color: var(--app-primary);
}

.vault-ttl__hint {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--app-muted);
}

[data-theme="light"] .vault-ttl__value {
  background-color: var(--app-surface-hover);
}

[data-theme="light"] .vault-ttl__tick {
  color: var(--app-muted);
}

@media (prefers-reduced-motion: reduce) {
  .vault-ttl__value,
  .vault-ttl__range::-webkit-slider-thumb,
  .vault-ttl__range::-moz-range-thumb,
  .vault-ttl__tick {
    transition: none;
  }
}
</style>
