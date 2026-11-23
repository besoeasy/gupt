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
const connectText = computed(() => formatTrafficRate(props.relay.connectRate));

/** Sample counts and averages stay in the tooltip, not on the card face. */
function sampleTitle(ok, total, avgMs, what) {
  const count = Number(total) || 0;
  if (!count) return `No ${what} attempts yet`;
  const avg = Number(avgMs) > 0 ? ` · avg ${Math.round(avgMs)} ms` : "";
  return `${Number(ok) || 0}/${count} ${what}${avg}`;
}

const publishTitle = computed(() =>
  sampleTitle(
    props.relay.stats?.publishOk,
    props.relay.stats?.publishTotal,
    props.relay.stats?.avgPublishMs,
    "sends",
  ),
);
const queryTitle = computed(() =>
  sampleTitle(
    props.relay.stats?.queryOk,
    props.relay.stats?.queryTotal,
    props.relay.stats?.avgQueryMs,
    "reads",
  ),
);
const connectTitle = computed(() =>
  sampleTitle(
    props.relay.stats?.connectOk,
    props.relay.stats?.connectTotal,
    props.relay.stats?.avgConnectMs,
    "probes",
  ),
);

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
        <dt>send</dt>
        <dd :title="publishTitle">{{ publishText }}</dd>
      </div>
      <div class="relay-card__stat">
        <dt>read</dt>
        <dd :title="queryTitle">{{ queryText }}</dd>
      </div>
      <div class="relay-card__stat">
        <dt>conn</dt>
        <dd :title="connectTitle">{{ connectText }}</dd>
      </div>
      <div class="relay-card__stat">
        <dt>latency</dt>
        <dd>{{ latencyText }}</dd>
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
  --relay-card-accent: var(--app-muted);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background-color: var(--app-surface);
  min-width: 0;
  overflow: hidden;
  animation: ledger-rise 460ms var(--app-ease-emphasized) backwards;
  animation-delay: calc(var(--relay-card-index, 0) * var(--app-stagger));
  transition:
    transform var(--app-dur-base) var(--app-ease-swift),
    border-color var(--app-dur-base) var(--app-ease-standard),
    background-color var(--app-dur-base) var(--app-ease-standard),
    box-shadow var(--app-dur-base) var(--app-ease-standard);
}

/* The tone draws itself across the top edge as the card arrives. */

.relay-card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background-color: var(--relay-card-accent);
  transform-origin: left;
  animation: ledger-draw 620ms var(--app-ease-emphasized) backwards;
  animation-delay: calc(var(--relay-card-index, 0) * var(--app-stagger) + 120ms);
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
  border-color: color-mix(in oklab, var(--app-danger) 32%, var(--app-border));
}

.relay-card__head {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  min-width: 0;
}

.relay-card__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex-shrink: 0;
  background-color: var(--relay-card-accent);
  color: var(--relay-card-accent);
  animation: ledger-dot-pulse 3s var(--app-ease-standard) infinite;
}

.relay-card__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--app-muted-2);
}

.relay-card__name {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--app-text);
}

/* Ledger status is text plus a dot, never a tinted pill. */

.relay-card__tier {
  flex-shrink: 0;
  padding: 0;
  border-radius: 0;
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.relay-card__score {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
}

.relay-card__score-line {
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin: 0;
}

.relay-card__score-value {
  font-family: var(--font-mono);
  font-size: 24px;
  line-height: 1;
  font-weight: 500;
  letter-spacing: -0.03em;
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
  font-size: 9.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.relay-card__track {
  display: block;
  height: 2px;
  border-radius: 999px;
  background-color: var(--app-border);
  overflow: hidden;
}

.relay-card__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background-color: var(--relay-card-accent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--relay-card-accent) 55%, transparent);
  transform-origin: left;
  animation: ledger-draw 700ms var(--app-ease-emphasized) 160ms backwards;
  transition: width var(--app-dur-slow) var(--app-ease-standard);
}

.relay-card__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--app-space-2) var(--app-space-4);
  margin: 0;
  padding-top: var(--app-space-3);
  border-top: 1px solid var(--app-border);
}

.relay-card__stat {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--app-space-2);
  min-width: 0;
}

.relay-card__stat dt {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.relay-card__stat dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.relay-card__mode {
  align-self: flex-start;
  margin: 0;
  padding: 0;
  border-radius: 0;
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-warning);
}

.relay-card__error {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--app-danger);
}

.relay-card__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  align-self: flex-start;
  min-height: var(--app-touch-h);
  margin-top: auto;
  padding: 0 var(--app-space-3);
  border: 1px solid transparent;
  border-radius: var(--app-radius-sm);
  background-color: transparent;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

.relay-card__remove svg {
  width: 13px;
  height: 13px;
}

@media (hover: hover) {
  .relay-card:hover {
    transform: translateY(-2px);
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-raised);
    box-shadow: var(--app-lift);
  }

  .relay-card--failing:hover {
    border-color: color-mix(in oklab, var(--app-danger) 46%, var(--app-border));
  }

  .relay-card__remove:hover {
    color: var(--app-danger);
    border-color: color-mix(in oklab, var(--app-danger) 26%, transparent);
    background-color: color-mix(in oklab, var(--app-danger) 8%, transparent);
  }
}

.relay-card__remove:active {
  scale: 0.98;
}

.relay-card__remove:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .relay-card,
  .relay-card::before,
  .relay-card__dot,
  .relay-card__fill {
    animation: none;
    transition: none;
  }
}

</style>
