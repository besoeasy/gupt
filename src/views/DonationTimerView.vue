<script setup>
import { ref, computed, onMounted, watch, nextTick } from "vue";
import QrCode from "@/components/QrCode.vue";
import { Heart, Copy, Check, ExternalLink, Wallet } from "@/icons";
import {
  getFundingAddress,
  getMonthlyStats,
  getCachedMonthlyStatsSync,
  getBtcUsdPrice,
  GOAL_SAT,
} from "@/lib/funding";
import { copyToClipboard } from "@/lib/clipboard";

const GITHUB_SPONSORS_URL = "https://github.com/sponsors/besoeasy";

const receivedSat = ref(0);
const goalSat = ref(GOAL_SAT);
const fundingAddress = ref("");
const copiedAddress = ref(false);
const usdRate = ref(0);

const displayReceivedSat = ref(0);
const displayPct = ref(0);
const animatedPct = ref(0);

const fundedPct = computed(() => {
  if (!goalSat.value) return 0;
  return Math.min(100, Math.max(0, (receivedSat.value / goalSat.value) * 100));
});

const hasUsd = computed(() => usdRate.value > 0);

function formatUsd(sat) {
  const usd = (sat / 1e8) * usdRate.value;
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function animateGoal(targetSat, targetPct) {
  const duration = 1200;
  const startTime = performance.now();
  const startSat = displayReceivedSat.value;
  const startPct = displayPct.value;

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const ease = 1 - (1 - progress) * (1 - progress);

    displayReceivedSat.value = Math.round(startSat + (targetSat - startSat) * ease);
    displayPct.value = startPct + (targetPct - startPct) * ease;

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

watch(receivedSat, (newVal) => {
  const targetPct = fundedPct.value;
  animateGoal(newVal, targetPct);
  nextTick(() => {
    animatedPct.value = targetPct;
  });
});

async function copyBtcAddress() {
  if (!fundingAddress.value) return;
  try {
    await copyToClipboard(fundingAddress.value);
    copiedAddress.value = true;
    setTimeout(() => (copiedAddress.value = false), 2000);
  } catch {}
}

onMounted(async () => {
  const cached = getCachedMonthlyStatsSync();
  if (cached) {
    receivedSat.value = cached.receivedSat;
    goalSat.value = cached.goalSat || GOAL_SAT;
  }

  getFundingAddress().then((addr) => {
    if (addr) fundingAddress.value = addr;
  });

  getBtcUsdPrice().then((usd) => {
    if (usd > 0) usdRate.value = usd;
  });

  try {
    const stats = await getMonthlyStats();
    receivedSat.value = stats.receivedSat;
    goalSat.value = stats.goalSat || GOAL_SAT;
  } catch {}
});
</script>

<template>
  <main class="donate">
    <div class="donate__inner">
      <header class="donate__hero">
        <p class="donate__eyebrow">
          <span class="donate__mark" aria-hidden="true">
            <Heart class="donate__mark-icon" :stroke-width="2" fill="currentColor" />
          </span>
          <span>Community funded</span>
          <span class="donate__eyebrow-dot" aria-hidden="true">·</span>
          <span>100% open source</span>
        </p>
        <h1 class="donate__title">Support GUPT development</h1>
        <p class="donate__lede">
          Keep messaging free, fast and serverless. The project runs on the people who use it — no
          ads, no data business, no investors to answer to.
        </p>
      </header>

      <section class="donate-goal" aria-labelledby="donate-goal-label">
        <div class="donate-goal__head">
          <h2 id="donate-goal-label" class="donate-goal__label">Monthly goal</h2>
          <span class="donate-goal__pct">{{ displayPct.toFixed(0) }}% reached</span>
        </div>

        <p class="donate-goal__amount">
          <span class="donate-goal__now">
            {{ hasUsd ? formatUsd(displayReceivedSat) : displayReceivedSat.toLocaleString() }}
          </span>
          <span class="donate-goal__target">
            <template v-if="hasUsd">/ {{ formatUsd(goalSat) }}</template>
            <template v-else>/ {{ goalSat.toLocaleString() }} sats</template>
          </span>
        </p>

        <div
          class="donate-goal__track"
          role="progressbar"
          aria-label="Monthly funding goal"
          :aria-valuenow="Math.round(fundedPct)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="donate-goal__fill" :style="{ width: `${Math.max(3, animatedPct)}%` }" />
        </div>

        <p class="donate-goal__foot">
          Funding address and totals are read from public records. Every sat goes to development.
        </p>
      </section>

      <div class="donate-options">
        <section class="donate-card">
          <header class="donate-card__head">
            <span class="donate-card__mark donate-card__mark--ink" aria-hidden="true">
              <svg class="donate-card__glyph" viewBox="0 0 24 24" fill="currentColor">
                <path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            </span>
            <div class="donate-card__body">
              <div class="donate-card__titleline">
                <h2 class="donate-card__title">GitHub Sponsors</h2>
                <span class="donate-card__badge">Recommended</span>
              </div>
              <p class="donate-card__description">Monthly recurring sponsorship</p>
            </div>
          </header>

          <div class="donate-card__foot">
            <a
              :href="GITHUB_SPONSORS_URL"
              target="_blank"
              rel="noopener noreferrer"
              class="donate-btn donate-btn--ink"
            >
              <span>Sponsor on GitHub</span>
              <ExternalLink class="donate-btn__icon" :stroke-width="1.9" aria-hidden="true" />
            </a>
          </div>
        </section>

        <section class="donate-card">
          <header class="donate-card__head">
            <span class="donate-card__mark donate-card__mark--amber" aria-hidden="true">₿</span>
            <div class="donate-card__body">
              <div class="donate-card__titleline">
                <h2 class="donate-card__title">Bitcoin donation</h2>
                <span class="donate-card__badge donate-card__badge--quiet">On-chain</span>
              </div>
              <p class="donate-card__description">Direct sats transfer, no middleman</p>
            </div>
          </header>

          <div v-if="fundingAddress" class="donate-btc">
            <div class="donate-btc__qr">
              <QrCode
                :text="`bitcoin:${fundingAddress}`"
                :size="160"
                :margin="1"
                label="Bitcoin donation address QR code"
              />
            </div>

            <div class="donate-btc__body">
              <span class="donate-btc__label">Address</span>
              <p class="donate-btc__address">{{ fundingAddress }}</p>

              <div class="donate-btc__actions">
                <button type="button" class="donate-btn" @click="copyBtcAddress">
                  <Check v-if="copiedAddress" class="donate-btn__icon donate-btn__icon--success" :stroke-width="2" aria-hidden="true" />
                  <Copy v-else class="donate-btn__icon" :stroke-width="1.9" aria-hidden="true" />
                  <span>{{ copiedAddress ? "Copied" : "Copy address" }}</span>
                </button>

                <a :href="`bitcoin:${fundingAddress}`" class="donate-btn donate-btn--amber">
                  <Wallet class="donate-btn__icon" :stroke-width="1.9" aria-hidden="true" />
                  <span>Open wallet</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
/* Ledger pass: one funding record, a goal meter and two ways to give. */

.donate {
  min-height: 100dvh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.donate__inner {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  width: 100%;
  max-width: 720px;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.donate__hero {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
  padding-bottom: var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}

.donate__eyebrow {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.donate__mark {
  display: inline-flex;
  color: var(--app-accent-heart);
}

.donate__mark-icon {
  width: 11px;
  height: 11px;
}

.donate__eyebrow-dot {
  color: var(--app-border-strong);
}

.donate__title {
  margin: 0;
  font-size: var(--app-text-display);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: var(--app-tracking-display);
  color: var(--app-text);
}

.donate__lede {
  max-width: 60ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.65;
  color: var(--app-muted);
}

/* ---- Goal meter ---- */

.donate-goal {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  animation: ledger-rise 460ms var(--app-ease-emphasized) 40ms both;
}

.donate-goal__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--app-space-2);
}

.donate-goal__label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.donate-goal__pct {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-accent-heart);
  font-variant-numeric: tabular-nums;
}

.donate-goal__amount {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.donate-goal__now {
  font-size: clamp(1.6rem, 7vw, 2.1rem);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--app-text);
}

.donate-goal__target {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
}

.donate-goal__track {
  height: 6px;
  border-radius: 3px;
  background: var(--app-surface-inset-strong);
  overflow: hidden;
}

.donate-goal__fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(
    90deg,
    color-mix(in oklab, var(--app-accent-heart) 72%, var(--app-text)),
    var(--app-accent-heart)
  );
  transition: width 240ms var(--app-ease-emphasized);
}

.donate-goal__foot {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--app-muted-2);
}

/* ---- Options ---- */

.donate-options {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--app-space-4);
}

.donate-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-rise 460ms var(--app-ease-emphasized) 90ms both;
}

.donate-card + .donate-card {
  animation-delay: 140ms;
}

.donate-card__head {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  padding: 14px;
}

.donate-card__mark {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--app-radius-sm);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
}

.donate-card__mark--ink {
  background: var(--app-text);
  color: var(--app-bg);
}

.donate-card__mark--amber {
  background: color-mix(in oklab, var(--app-warning) 16%, var(--app-surface));
  color: var(--app-warning);
}

.donate-card__glyph {
  width: 16px;
  height: 16px;
}

.donate-card__body {
  min-width: 0;
}

.donate-card__titleline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 8px;
}

.donate-card__title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text);
}

.donate-card__badge {
  padding: 1px 5px;
  border: 1px solid color-mix(in oklab, var(--app-accent-heart) 34%, var(--app-border));
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-accent-heart);
}

.donate-card__badge--quiet {
  border-color: var(--app-border);
  color: var(--app-muted-2);
}

.donate-card__description {
  margin: 3px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--app-muted);
}

.donate-card__foot {
  display: flex;
  padding: 0 14px 14px;
}

.donate-card__foot .donate-btn {
  width: 100%;
}

/* ---- Bitcoin block ---- */

.donate-btc {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  padding: 14px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface-soft);
}

.donate-btc__qr {
  display: flex;
  justify-content: center;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface);
}

.donate-btc__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.donate-btc__label {
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.donate-btc__address {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface);
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--app-text-soft);
  overflow-wrap: anywhere;
}

.donate-btc__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

/* ---- Buttons ---- */

.donate-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
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
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.donate-btn:active {
  transform: translateY(1px);
}

.donate-btn__icon {
  width: 12px;
  height: 12px;
}

.donate-btn__icon--success {
  color: var(--app-success);
}

.donate-btn--ink {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.donate-btn--amber {
  border-color: color-mix(in oklab, var(--app-warning) 36%, var(--app-border));
  color: var(--app-warning);
}

@media (min-width: 40rem) {
  .donate__inner {
    padding-inline: var(--app-space-6);
  }

  .donate__hero {
    padding-bottom: var(--app-space-5);
  }

  .donate-goal {
    padding: var(--app-space-6);
  }

  .donate-card__head,
  .donate-btc {
    padding: 16px;
  }

  .donate-card__foot {
    padding: 0 16px 16px;
  }
}

@media (min-width: 46rem) {
  .donate-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .donate-btc {
    flex-direction: row;
    align-items: flex-start;
  }

  .donate-btc__qr {
    flex-shrink: 0;
  }

  .donate-btc__body {
    flex: 1;
  }
}

@media (hover: hover) {
  .donate-btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .donate-btn--ink:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .donate-btn--amber:hover {
    border-color: var(--app-warning);
    background: var(--app-warning-soft);
    color: var(--app-warning);
  }
}

@media (pointer: coarse) {
  .donate-btn {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .donate,
  .donate__hero,
  .donate-goal,
  .donate-card {
    animation: none;
  }

  .donate-goal__fill,
  .donate-btn {
    transition: none;
  }
}
</style>
