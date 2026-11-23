<script setup>
import { computed } from "vue";
import { Server, Trash2 } from "@/icons";
import { tierBadgeClass, tierDotClass, formatTrafficRate } from "@/lib/relay";

const props = defineProps({
  relay: { type: Object, required: true },
  index: { type: Number, default: 0 },
});

defineEmits(["remove"]);

const tierText = computed(() => {
  const tier = props.relay.tier;
  if (tier === "offline") return "Offline";
  if (tier === "good") return "Good";
  if (tier === "degraded") return "Degraded";
  if (tier === "poor") return "Poor";
  return "New";
});

/** The write score is the ranking the sender actually uses: 0..10, neutral 5. */
const scoreText = computed(() => {
  const score = props.relay.score;
  return Number.isFinite(score) ? score.toFixed(1) : "—";
});

const scorePercent = computed(() => {
  const score = Number(props.relay.score);
  if (!Number.isFinite(score)) return "0%";
  return `${Math.max(0, Math.min(100, Math.round(score * 10)))}%`;
});

const scoreTone = computed(() => {
  const score = Number(props.relay.score);
  if (!Number.isFinite(score)) return "unknown";
  if (score >= 7) return "good";
  if (score >= 4) return "fair";
  return "poor";
});

const latencyText = computed(() =>
  Number(props.relay.latencyMs) > 0 ? `${Math.round(props.relay.latencyMs)} ms` : "—",
);

const publishText = computed(() => formatTrafficRate(props.relay.publishRate));
const queryText = computed(() => formatTrafficRate(props.relay.queryRate));

const modeText = computed(() => {
  if (props.relay.batteryMode === "read_only") return "read-only";
  if (props.relay.batteryMode === "sync_disabled") return "sync-off";
  return "";
});

const modeTitle = computed(() =>
  props.relay.batteryMode === "read_only"
    ? "Out of battery: reads work, writes are refused"
    : "Peer sync paused until its battery regenerates",
);

const failing = computed(
  () => props.relay.tier === "poor" || props.relay.tier === "offline",
);
</script>

<template>
  <article
    class="relay-card"
    :class="[`relay-card--${scoreTone}`, { 'relay-card--failing': failing }]"
    :style="{ '--relay-card-index': index }"
  >
    <header class="relay-card__head">
      <span
        class="relay-card__dot"
        :class="tierDotClass(relay.tier)"
        :title="`Relay health: ${tierText}`"
        aria-hidden="true"
      />
      <Server class="relay-card__icon" :stroke-width="1.8" aria-hidden="true" />
      <h3 class="relay-card__name" :title="relay.url">{{ relay.label }}</h3>
      <span class="relay-card__tier" :class="tierBadgeClass(relay.tier)">{{ tierText }}</span>
    </header>

    <div class="relay-card__score">
      <p class="relay-card__score-line">
        <span class="relay-card__score-value">{{ scoreText }}</span>
        <span class="relay-card__score-max">/ 10</span>
        <span class="relay-card__score-label">send score</span>
      </p>
      <span class="relay-card__track" aria-hidden="true">
        <span class="relay-card__fill" :style="{ width: scorePercent }" />
      </span>
    </div>

    <dl class="relay-card__stats">
      <div class="relay-card__stat">
        <dt>latency</dt>
        <dd>{{ latencyText }}</dd>
      </div>
      <div class="relay-card__stat">
        <dt>sends</dt>
        <dd>{{ publishText }}</dd>
      </div>
      <div class="relay-card__stat">
        <dt>reads</dt>
        <dd>{{ queryText }}</dd>
      </div>
    </dl>

    <p v-if="modeText" class="relay-card__mode" :title="modeTitle">{{ modeText }}</p>
    <p v-if="relay.lastError" class="relay-card__error" :title="relay.lastError">
      {{ relay.lastError }}
    </p>

    <button
      type="button"
      class="relay-card__remove"
      :aria-label="`Remove ${relay.label}`"
      @click="$emit('remove', relay.url)"
    >
      <Trash2 :stroke-width="1.8" aria-hidden="true" />
      Remove
    </button>
  </article>
</template>

<style scoped>
@layer base, gupt-components;

.relay-card {
  --relay-card-accent: var(--ui-zinc-500);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2.5);
  padding: calc(var(--spacing) * 3.5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background-color: var(--app-surface);
  min-width: 0;
  animation: relay-card-in var(--app-dur-base) var(--app-ease-out) both;
  animation-delay: calc(var(--relay-card-index, 0) * 45ms);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard);
}

.relay-card--good {
  --relay-card-accent: var(--app-success);
}

.relay-card--fair {
  --relay-card-accent: var(--app-warning);
}

.relay-card--poor {
  --relay-card-accent: var(--app-danger);
}

.relay-card--failing {
  border-color: color-mix(in oklab, var(--app-danger) 28%, var(--app-border));
}

.relay-card__head {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 1.5);
  min-width: 0;
}

.relay-card__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}

.relay-card__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--app-muted);
}

.relay-card__name {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text);
}

.relay-card__tier {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.relay-card__score {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.relay-card__score-line {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin: 0;
}

.relay-card__score-value {
  font-family: var(--font-mono);
  font-size: 22px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--relay-card-accent);
}

.relay-card__score-max {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-muted);
}

.relay-card__score-label {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--app-muted);
}

.relay-card__track {
  display: block;
  height: 4px;
  border-radius: 999px;
  background-color: var(--app-surface-inset);
  overflow: hidden;
}

.relay-card__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background-color: var(--relay-card-accent);
  transition: width var(--app-dur-slow) var(--app-ease-standard);
}

.relay-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
  margin: 0;
}

.relay-card__stat {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.relay-card__stat dt {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-muted);
}

.relay-card__stat dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--app-text-soft);
}

.relay-card__mode {
  align-self: flex-start;
  margin: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: var(--app-warning-soft);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-warning);
}

.relay-card__error {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-danger);
}

.relay-card__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  align-self: flex-start;
  min-height: 44px;
  margin-top: auto;
  padding: 0 calc(var(--spacing) * 2.5);
  border: 1px solid transparent;
  border-radius: var(--app-radius-sm);
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

.relay-card__remove svg {
  width: 14px;
  height: 14px;
}

@media (hover: hover) {
  .relay-card:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-raised);
  }

  .relay-card__remove:hover {
    color: var(--app-danger);
    border-color: color-mix(in oklab, var(--app-danger) 30%, transparent);
    background-color: var(--app-danger-soft);
  }
}

.relay-card__remove:active {
  scale: 0.98;
}

.relay-card__remove:focus-visible {
  outline: 2px solid var(--app-primary);
  outline-offset: 2px;
}

@keyframes relay-card-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .relay-card,
  .relay-card__fill {
    animation: none;
    transition: none;
  }
}

[data-theme="light"] .relay-card--failing {
  border-color: color-mix(in oklab, var(--app-danger) 34%, var(--app-border));
}
</style>
