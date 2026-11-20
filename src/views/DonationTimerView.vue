<script setup>
import { ref, computed, onMounted, watch, nextTick } from "vue";
import QRCode from "qrcode";
import { Heart, Copy, Check, ExternalLink, Wallet } from "@lucide/vue";
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

const qrCanvas = ref(null);

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

async function renderQr() {
  if (!fundingAddress.value || !qrCanvas.value) return;
  try {
    await QRCode.toCanvas(qrCanvas.value, `bitcoin:${fundingAddress.value}`, {
      width: 160,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {}
}

onMounted(async () => {
  const cached = getCachedMonthlyStatsSync();
  if (cached) {
    receivedSat.value = cached.receivedSat;
    goalSat.value = cached.goalSat || GOAL_SAT;
  }

  getFundingAddress().then((addr) => {
    if (addr) {
      fundingAddress.value = addr;
      nextTick(renderQr);
    }
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
  <div class="donation-timer-view__block">
    <main class="donation-timer-view__main">
      <div class="donation-timer-view__block-2">
        <!-- Header -->
        <section class="donation-timer-view__section">
          <div class="donation-timer-view__block-3">
            <div
              class="donation-timer-view__block-4"
            >
              <Heart class="donation-timer-view__heart" :stroke-width="2.2" fill="currentColor" />
            </div>

            <div class="donation-timer-view__block-5">
              <h1 class="donation-timer-view__title-support-gupt">
                Support GUPT Development
              </h1>
              <p class="donation-timer-view__text">
                100% open-source & community-funded. Help keep messaging free, fast, and serverless.
              </p>
            </div>
          </div>

          <!-- Animated Prominent Goal Meter -->
          <div class="donation-timer-view__block-6">
            <div class="donation-timer-view__block-7">
              <span class="donation-timer-view__text-monthly-goal">
                Monthly Goal
              </span>
              <span
                class="donation-timer-view__text-2"
              >
                {{ displayPct.toFixed(0) }}% Reached
              </span>
            </div>

            <!-- Big Font Display for Goal -->
            <div class="donation-timer-view__block-8">
              <div class="donate-goal-amount donation-timer-view__block-9">
                <span class="donation-timer-view__text-3">
                  {{ hasUsd ? formatUsd(displayReceivedSat) : displayReceivedSat.toLocaleString() }}
                </span>
                <span class="donation-timer-view__text-4">
                  <template v-if="hasUsd">/ {{ formatUsd(goalSat) }}</template>
                  <template v-else>/ {{ goalSat.toLocaleString() }} sats</template>
                </span>
              </div>
            </div>

            <!-- Animated Progress Bar -->
            <div
              class="donation-timer-view__block-10"
            >
              <div
                class="donation-timer-view__block-11"
                :style="{ width: `${Math.max(3, animatedPct)}%` }"
              />
            </div>
          </div>
        </section>

        <!-- Option 1: GitHub Sponsors -->
        <section class="donation-timer-view__section-2">
          <div class="donation-timer-view__block-12">
            <div class="donation-timer-view__block-13">
              <div
                class="donation-timer-view__block-14"
              >
                <svg class="donation-timer-view__icon" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
              </div>
              <div>
                <h2 class="donation-timer-view__subtitle-github-sponsors">GitHub Sponsors</h2>
                <p class="donation-timer-view__text-5">Monthly recurring sponsorship</p>
              </div>
            </div>

            <span
              class="donation-timer-view__text-recommended"
            >
              Recommended
            </span>
          </div>

          <a
            :href="GITHUB_SPONSORS_URL"
            target="_blank"
            rel="noopener noreferrer"
            class="donation-timer-view__link"
          >
            <span>Sponsor on GitHub</span>
            <ExternalLink class="donation-timer-view__external-link" :stroke-width="2" />
          </a>
        </section>

        <!-- Option 2: Bitcoin Donation -->
        <section class="donation-timer-view__section-3">
          <div class="donation-timer-view__block-15">
            <div
              class="donation-timer-view__block-16"
            >
              ₿
            </div>
            <div>
              <h2 class="donation-timer-view__subtitle-bitcoin-donation">Bitcoin Donation</h2>
              <p class="donation-timer-view__text-6">Direct on-chain sats transfer</p>
            </div>
          </div>

          <div
            v-if="fundingAddress"
            class="donation-timer-view__block-17"
          >
            <div class="donation-timer-view__block-18">
              <canvas ref="qrCanvas" class="donation-timer-view__canvas" />
            </div>

            <div class="donation-timer-view__block-19">
              <p
                class="donation-timer-view__text-7"
              >
                {{ fundingAddress }}
              </p>

              <div class="donation-timer-view__block-20">
                <button
                  type="button"
                  class="donation-timer-view__button"
                  @click="copyBtcAddress"
                >
                  <Check
                    v-if="copiedAddress"
                    class="donation-timer-view__check"
                    :stroke-width="2"
                  />
                  <Copy v-else class="donation-timer-view__copy" :stroke-width="2" />
                  <span>{{ copiedAddress ? "Copied!" : "Copy Address" }}</span>
                </button>

                <a
                  :href="`bitcoin:${fundingAddress}`"
                  class="donation-timer-view__link-2"
                >
                  <Wallet class="donation-timer-view__wallet" :stroke-width="2" />
                  <span>Open Wallet</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__link-2 {
  border-color: color-mix(in oklab,var(--color-amber-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__block-16 {
  border-color: color-mix(in oklab,var(--color-amber-500) 25%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__text-2 {
  border-color: color-mix(in oklab,var(--color-rose-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__text-recommended {
  border-color: color-mix(in oklab,var(--color-rose-500) 25%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__block-4 {
  border-color: color-mix(in oklab,var(--color-rose-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__button {
  border-color: color-mix(in oklab,var(--color-rose-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__section {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__block-6 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__section-2 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__section-3 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__block-17 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__link-2 {
  background-color: color-mix(in oklab,var(--color-amber-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__text-2 {
  background-color: color-mix(in oklab,var(--color-rose-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__button {
  background-color: color-mix(in oklab,var(--color-rose-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__block-6 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__block-17 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__text-7 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__section {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__section-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__section-3 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__block-16 {
  --gradient-from: color-mix(in oklab, var(--color-amber-500) 20%, transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__text-recommended {
  --gradient-from: color-mix(in oklab, var(--color-rose-500) 15%, transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__block-4 {
  --gradient-from: color-mix(in oklab, var(--color-rose-500) 25%, transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__block-16 {
  --gradient-to: color-mix(in oklab, var(--color-amber-500) 5%, transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__block-4 {
  --gradient-to: color-mix(in oklab, var(--color-amber-500) 10%, transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__text-recommended {
  --gradient-to: color-mix(in oklab, var(--color-amber-500) 10%, transparent);
}
}

@media (hover:hover) {
.donation-timer-view__link-2:hover {
  background-color: #f99c0033;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__link-2:hover {
  background-color: color-mix(in oklab,var(--color-amber-500) 20%,transparent);
}
}
}

@media (hover:hover) {
.donation-timer-view__button:hover {
  background-color: #ff235733;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.donation-timer-view__button:hover {
  background-color: color-mix(in oklab,var(--color-rose-500) 20%,transparent);
}
}
}

@media (hover:hover) {
.donation-timer-view__link:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (min-width:40rem) {
.donation-timer-view__block-20 {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
}

@media (min-width:40rem) {
.donation-timer-view__block-3 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.donation-timer-view__block-17 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.donation-timer-view__section-2 {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.donation-timer-view__section-3 {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.donation-timer-view__section {
  padding: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.donation-timer-view__main {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.donation-timer-view__block-3 {
  text-align: left;
}
}

@media (min-width:40rem) {
.donation-timer-view__title-support-gupt {
  font-size: var(--text-2xl);
  line-height: var(--leading,var(--text-2xl--line-height));
}
}

@media (min-width:40rem) {
.donation-timer-view__text-3 {
  font-size: var(--text-6xl);
  line-height: var(--leading,var(--text-6xl--line-height));
}
}

@media (min-width:40rem) {
.donation-timer-view__text-4 {
  font-size: var(--text-lg);
  line-height: var(--leading,var(--text-lg--line-height));
}
}

@media (min-width:64rem) {
.donation-timer-view__main {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.donation-timer-view__block-4 {
  position: relative;
}
.donation-timer-view__main {
  margin-inline: auto;
}
.donation-timer-view__canvas {
  display: block;
}
.donation-timer-view__block-3 {
  display: flex;
}
.donation-timer-view__block-4 {
  display: flex;
}
.donation-timer-view__block-7 {
  display: flex;
}
.donation-timer-view__block-8 {
  display: flex;
}
.donation-timer-view__block-9 {
  display: flex;
}
.donation-timer-view__block-12 {
  display: flex;
}
.donation-timer-view__block-13 {
  display: flex;
}
.donation-timer-view__block-14 {
  display: flex;
}
.donation-timer-view__block-15 {
  display: flex;
}
.donation-timer-view__block-16 {
  display: flex;
}
.donation-timer-view__block-17 {
  display: flex;
}
.donation-timer-view__block-20 {
  display: grid;
}
.donation-timer-view__text-recommended {
  display: inline-block;
}
.donation-timer-view__link {
  display: inline-flex;
}
.donation-timer-view__button {
  display: inline-flex;
}
.donation-timer-view__link-2 {
  display: inline-flex;
}
.donation-timer-view__block-10 {
  height: calc(var(--spacing) * 2.5);
}
.donation-timer-view__external-link {
  height: calc(var(--spacing) * 3.5);
}
.donation-timer-view__check {
  height: calc(var(--spacing) * 3.5);
}
.donation-timer-view__copy {
  height: calc(var(--spacing) * 3.5);
}
.donation-timer-view__wallet {
  height: calc(var(--spacing) * 3.5);
}
.donation-timer-view__icon {
  height: calc(var(--spacing) * 4);
}
.donation-timer-view__heart {
  height: calc(var(--spacing) * 7);
}
.donation-timer-view__block-14 {
  height: calc(var(--spacing) * 8);
}
.donation-timer-view__block-16 {
  height: calc(var(--spacing) * 8);
}
.donation-timer-view__button {
  height: calc(var(--spacing) * 9);
}
.donation-timer-view__link-2 {
  height: calc(var(--spacing) * 9);
}
.donation-timer-view__link {
  height: calc(var(--spacing) * 10);
}
.donation-timer-view__block-4 {
  height: calc(var(--spacing) * 14);
}
.donation-timer-view__block-11 {
  height: 100%;
}
.donation-timer-view__block {
  min-height: 100vh;
}
.donation-timer-view__external-link {
  width: calc(var(--spacing) * 3.5);
}
.donation-timer-view__check {
  width: calc(var(--spacing) * 3.5);
}
.donation-timer-view__copy {
  width: calc(var(--spacing) * 3.5);
}
.donation-timer-view__wallet {
  width: calc(var(--spacing) * 3.5);
}
.donation-timer-view__icon {
  width: calc(var(--spacing) * 4);
}
.donation-timer-view__heart {
  width: calc(var(--spacing) * 7);
}
.donation-timer-view__block-14 {
  width: calc(var(--spacing) * 8);
}
.donation-timer-view__block-16 {
  width: calc(var(--spacing) * 8);
}
.donation-timer-view__block-4 {
  width: calc(var(--spacing) * 14);
}
.donation-timer-view__main {
  width: 100%;
}
.donation-timer-view__block-10 {
  width: 100%;
}
.donation-timer-view__link {
  width: 100%;
}
.donation-timer-view__block-19 {
  width: 100%;
}
.donation-timer-view__main {
  max-width: var(--container-6xl);
}
.donation-timer-view__block-5 {
  min-width: 0;
}
.donation-timer-view__block-5 {
  flex: 1;
}
.donation-timer-view__block-19 {
  flex: 1;
}
.donation-timer-view__block-4 {
  flex-shrink: 0;
}
.donation-timer-view__icon {
  flex-shrink: 0;
}
.donation-timer-view__block-18 {
  flex-shrink: 0;
}
.donation-timer-view__button {
  cursor: pointer;
}
.donation-timer-view__block-20 {
  grid-template-columns: repeat(1,minmax(0,1fr));
}
.donation-timer-view__block-3 {
  flex-direction: column;
}
.donation-timer-view__block-17 {
  flex-direction: column;
}
.donation-timer-view__block-8 {
  flex-wrap: wrap;
}
.donation-timer-view__block-8 {
  align-items: baseline;
}
.donation-timer-view__block-9 {
  align-items: baseline;
}
.donation-timer-view__block-3 {
  align-items: center;
}
.donation-timer-view__block-4 {
  align-items: center;
}
.donation-timer-view__block-7 {
  align-items: center;
}
.donation-timer-view__block-12 {
  align-items: center;
}
.donation-timer-view__block-13 {
  align-items: center;
}
.donation-timer-view__block-14 {
  align-items: center;
}
.donation-timer-view__link {
  align-items: center;
}
.donation-timer-view__block-15 {
  align-items: center;
}
.donation-timer-view__block-16 {
  align-items: center;
}
.donation-timer-view__block-17 {
  align-items: center;
}
.donation-timer-view__button {
  align-items: center;
}
.donation-timer-view__link-2 {
  align-items: center;
}
.donation-timer-view__block-7 {
  justify-content: space-between;
}
.donation-timer-view__block-8 {
  justify-content: space-between;
}
.donation-timer-view__block-12 {
  justify-content: space-between;
}
.donation-timer-view__block-4 {
  justify-content: center;
}
.donation-timer-view__block-14 {
  justify-content: center;
}
.donation-timer-view__link {
  justify-content: center;
}
.donation-timer-view__block-16 {
  justify-content: center;
}
.donation-timer-view__button {
  justify-content: center;
}
.donation-timer-view__link-2 {
  justify-content: center;
}
.donation-timer-view__block-8 {
  gap: calc(var(--spacing) * 2);
}
.donation-timer-view__link {
  gap: calc(var(--spacing) * 2);
}
.donation-timer-view__block-20 {
  gap: calc(var(--spacing) * 2);
}
.donation-timer-view__button {
  gap: calc(var(--spacing) * 2);
}
.donation-timer-view__link-2 {
  gap: calc(var(--spacing) * 2);
}
.donation-timer-view__block-9 {
  gap: calc(var(--spacing) * 2.5);
}
.donation-timer-view__block-13 {
  gap: calc(var(--spacing) * 2.5);
}
.donation-timer-view__block-15 {
  gap: calc(var(--spacing) * 2.5);
}
.donation-timer-view__block-3 {
  gap: calc(var(--spacing) * 4);
}
.donation-timer-view__block-17 {
  gap: calc(var(--spacing) * 5);
}
:where(.donation-timer-view__block-5>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.donation-timer-view__section-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.donation-timer-view__block-19>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.donation-timer-view__block-6>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.donation-timer-view__section-3>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.donation-timer-view__main>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.donation-timer-view__block-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.donation-timer-view__section>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
.donation-timer-view__block-10 {
  overflow: hidden;
}
.donation-timer-view__canvas {
  border-radius: .25rem;
}
.donation-timer-view__text-2 {
  border-radius: 3.40282e38px;
}
.donation-timer-view__block-10 {
  border-radius: 3.40282e38px;
}
.donation-timer-view__block-11 {
  border-radius: 3.40282e38px;
}
.donation-timer-view__text-recommended {
  border-radius: 3.40282e38px;
}
.donation-timer-view__block-14 {
  border-radius: var(--radius-lg);
}
.donation-timer-view__link {
  border-radius: var(--radius-lg);
}
.donation-timer-view__block-16 {
  border-radius: var(--radius-lg);
}
.donation-timer-view__block-18 {
  border-radius: var(--radius-lg);
}
.donation-timer-view__text-7 {
  border-radius: var(--radius-lg);
}
.donation-timer-view__button {
  border-radius: var(--radius-lg);
}
.donation-timer-view__link-2 {
  border-radius: var(--radius-lg);
}
.donation-timer-view__section {
  border-radius: var(--radius-xl);
}
.donation-timer-view__block-4 {
  border-radius: var(--radius-xl);
}
.donation-timer-view__block-6 {
  border-radius: var(--radius-xl);
}
.donation-timer-view__section-2 {
  border-radius: var(--radius-xl);
}
.donation-timer-view__section-3 {
  border-radius: var(--radius-xl);
}
.donation-timer-view__block-17 {
  border-radius: var(--radius-xl);
}
.donation-timer-view__section {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__block-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__block-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__text-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__block-10 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__section-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__block-14 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__text-recommended {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__section-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__block-16 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__block-17 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__block-18 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__text-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__link-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.donation-timer-view__link-2 {
  border-color: #f99c0033;
}
.donation-timer-view__block-16 {
  border-color: #f99c0040;
}
.donation-timer-view__text-2 {
  border-color: #ff235733;
}
.donation-timer-view__text-recommended {
  border-color: #ff235740;
}
.donation-timer-view__block-4 {
  border-color: #ff23574d;
}
.donation-timer-view__button {
  border-color: #ff23574d;
}
.donation-timer-view__block-18 {
  border-color: var(--ui-zinc-300);
}
.donation-timer-view__block-10 {
  border-color: var(--ui-zinc-800);
}
.donation-timer-view__block-14 {
  border-color: var(--ui-zinc-800);
}
.donation-timer-view__text-7 {
  border-color: var(--ui-zinc-800);
}
.donation-timer-view__section {
  border-color: var(--ui-zinc-800);
}
.donation-timer-view__block-6 {
  border-color: var(--ui-zinc-800);
}
.donation-timer-view__section-2 {
  border-color: var(--ui-zinc-800);
}
.donation-timer-view__section-3 {
  border-color: var(--ui-zinc-800);
}
.donation-timer-view__block-17 {
  border-color: var(--ui-zinc-800);
}
.donation-timer-view__link-2 {
  background-color: #f99c001a;
}
.donation-timer-view__block {
  background-color: var(--ui-black);
}
.donation-timer-view__text-2 {
  background-color: #ff23571a;
}
.donation-timer-view__button {
  background-color: #ff23571a;
}
.donation-timer-view__link {
  background-color: var(--color-white);
}
.donation-timer-view__block-18 {
  background-color: var(--color-white);
}
.donation-timer-view__block-10 {
  background-color: var(--ui-zinc-800);
}
.donation-timer-view__block-14 {
  background-color: var(--ui-zinc-900);
}
.donation-timer-view__block-6 {
  background-color: var(--ui-zinc-900);
}
.donation-timer-view__block-17 {
  background-color: var(--ui-zinc-900);
}
.donation-timer-view__text-7 {
  background-color: var(--ui-zinc-900);
}
.donation-timer-view__section {
  background-color: var(--ui-zinc-950);
}
.donation-timer-view__section-2 {
  background-color: var(--ui-zinc-950);
}
.donation-timer-view__section-3 {
  background-color: var(--ui-zinc-950);
}
.donation-timer-view__block-4 {
  --gradient-position: to bottom right in oklab;
  background-image: linear-gradient(var(--gradient-stops,));
}
.donation-timer-view__block-16 {
  --gradient-position: to bottom right in oklab;
  background-image: linear-gradient(var(--gradient-stops,));
}
.donation-timer-view__block-11 {
  --gradient-position: to right in oklab;
  background-image: linear-gradient(var(--gradient-stops,));
}
.donation-timer-view__text-recommended {
  --gradient-position: to right in oklab;
  background-image: linear-gradient(var(--gradient-stops,));
}
.donation-timer-view__block-16 {
  --gradient-from: #f99c0033;
}
.donation-timer-view__block-16 {
  --gradient-stops: var(--gradient-via-stops,var(--gradient-position,), var(--gradient-from,#0000) var(--gradient-from-position,0%), var(--gradient-to,#0000) var(--gradient-to-position,100%));
}
.donation-timer-view__block-11 {
  --gradient-from: var(--color-rose-500);
  --gradient-stops: var(--gradient-via-stops,var(--gradient-position,), var(--color-rose-500) var(--gradient-from-position,0%), var(--gradient-to,#0000) var(--gradient-to-position,100%));
}
.donation-timer-view__text-recommended {
  --gradient-from: #ff235726;
}
.donation-timer-view__text-recommended {
  --gradient-stops: var(--gradient-via-stops,var(--gradient-position,), var(--gradient-from,#0000) var(--gradient-from-position,0%), var(--gradient-to,#0000) var(--gradient-to-position,100%));
}
.donation-timer-view__block-4 {
  --gradient-from: #ff235740;
}
.donation-timer-view__block-4 {
  --gradient-stops: var(--gradient-via-stops,var(--gradient-position,), var(--gradient-from,#0000) var(--gradient-from-position,0%), var(--gradient-to,#0000) var(--gradient-to-position,100%));
}
.donation-timer-view__block-11 {
  --gradient-to: var(--color-amber-400);
  --gradient-stops: var(--gradient-via-stops,var(--gradient-position,), var(--gradient-from,#0000) var(--gradient-from-position,0%), var(--color-amber-400) var(--gradient-to-position,100%));
}
.donation-timer-view__block-16 {
  --gradient-to: #f99c000d;
}
.donation-timer-view__block-4 {
  --gradient-to: #f99c001a;
}
.donation-timer-view__text-recommended {
  --gradient-to: #f99c001a;
}
.donation-timer-view__block-18 {
  padding: calc(var(--spacing) * 2.5);
}
.donation-timer-view__text-7 {
  padding: calc(var(--spacing) * 2.5);
}
.donation-timer-view__section-2 {
  padding: calc(var(--spacing) * 4);
}
.donation-timer-view__section-3 {
  padding: calc(var(--spacing) * 4);
}
.donation-timer-view__block-17 {
  padding: calc(var(--spacing) * 4);
}
.donation-timer-view__section {
  padding: calc(var(--spacing) * 5);
}
.donation-timer-view__block-6 {
  padding: calc(var(--spacing) * 5);
}
.donation-timer-view__text-recommended {
  padding-inline: calc(var(--spacing) * 2.5);
}
.donation-timer-view__text-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.donation-timer-view__button {
  padding-inline: calc(var(--spacing) * 3.5);
}
.donation-timer-view__link-2 {
  padding-inline: calc(var(--spacing) * 3.5);
}
.donation-timer-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.donation-timer-view__link {
  padding-inline: calc(var(--spacing) * 4);
}
.donation-timer-view__text-recommended {
  padding-block: calc(var(--spacing) * .5);
}
.donation-timer-view__text-2 {
  padding-block: var(--spacing);
}
.donation-timer-view__main {
  padding-block: calc(var(--spacing) * 6);
}
.donation-timer-view__block {
  padding-bottom: calc(var(--spacing) * 16);
}
.donation-timer-view__block-3 {
  text-align: center;
}
.donation-timer-view__text-2 {
  font-family: var(--font-mono);
}
.donation-timer-view__block-9 {
  font-family: var(--font-mono);
}
.donation-timer-view__text-7 {
  font-family: var(--font-mono);
}
.donation-timer-view__text-3 {
  font-size: var(--text-5xl);
  line-height: var(--leading,var(--text-5xl--line-height));
}
.donation-timer-view__text-4 {
  font-size: var(--text-base);
  line-height: var(--leading,var(--text-base--line-height));
}
.donation-timer-view__subtitle-github-sponsors {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.donation-timer-view__block-16 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.donation-timer-view__subtitle-bitcoin-donation {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.donation-timer-view__title-support-gupt {
  font-size: var(--text-xl);
  line-height: var(--leading,var(--text-xl--line-height));
}
.donation-timer-view__text {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.donation-timer-view__text-5 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.donation-timer-view__link {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.donation-timer-view__text-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.donation-timer-view__text-7 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.donation-timer-view__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.donation-timer-view__link-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.donation-timer-view__text-recommended {
  font-size: 10px;
}
.donation-timer-view__text-monthly-goal {
  font-size: 11px;
}
.donation-timer-view__text-2 {
  font-size: 11px;
}
.donation-timer-view__text {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.donation-timer-view__text-3 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.donation-timer-view__block-16 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.donation-timer-view__text-monthly-goal {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.donation-timer-view__text-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.donation-timer-view__text-4 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.donation-timer-view__text-recommended {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.donation-timer-view__title-support-gupt {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.donation-timer-view__subtitle-github-sponsors {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.donation-timer-view__link {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.donation-timer-view__subtitle-bitcoin-donation {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.donation-timer-view__button {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.donation-timer-view__link-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.donation-timer-view__title-support-gupt {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.donation-timer-view__text-3 {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.donation-timer-view__subtitle-github-sponsors {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.donation-timer-view__subtitle-bitcoin-donation {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.donation-timer-view__text-monthly-goal {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.donation-timer-view__text-7 {
  word-break: break-all;
}
.donation-timer-view__block-16 {
  color: var(--color-amber-400);
}
.donation-timer-view__link-2 {
  color: var(--color-amber-400);
}
.donation-timer-view__link {
  color: var(--ui-black);
}
.donation-timer-view__check {
  color: var(--color-emerald-400);
}
.donation-timer-view__block-4 {
  color: var(--color-rose-400);
}
.donation-timer-view__text-monthly-goal {
  color: var(--color-rose-400);
}
.donation-timer-view__text-2 {
  color: var(--color-rose-400);
}
.donation-timer-view__text-recommended {
  color: var(--color-rose-400);
}
.donation-timer-view__button {
  color: var(--color-rose-400);
}
.donation-timer-view__title-support-gupt {
  color: var(--color-white);
}
.donation-timer-view__text-3 {
  color: var(--color-white);
}
.donation-timer-view__block {
  color: var(--ui-zinc-100);
}
.donation-timer-view__subtitle-github-sponsors {
  color: var(--ui-zinc-100);
}
.donation-timer-view__subtitle-bitcoin-donation {
  color: var(--ui-zinc-100);
}
.donation-timer-view__block-14 {
  color: var(--ui-zinc-200);
}
.donation-timer-view__text-7 {
  color: var(--ui-zinc-200);
}
.donation-timer-view__text {
  color: var(--ui-zinc-500);
}
.donation-timer-view__text-4 {
  color: var(--ui-zinc-500);
}
.donation-timer-view__text-5 {
  color: var(--ui-zinc-500);
}
.donation-timer-view__text-6 {
  color: var(--ui-zinc-500);
}
.donation-timer-view__text-monthly-goal {
  text-transform: uppercase;
}
.donation-timer-view__text-2 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.donation-timer-view__text-3 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.donation-timer-view__external-link {
  opacity: .7;
}
.donation-timer-view__block-18 {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.donation-timer-view__block-11 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.donation-timer-view__link {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.donation-timer-view__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.donation-timer-view__link-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.donation-timer-view__block-11 {
  --duration: 1s;
  transition-duration: 1s;
}
.donation-timer-view__block-11 {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.donation-timer-view__text-7 {
  -webkit-user-select: all;
  user-select: all;
}
.donation-timer-view__link:active {
  scale: .98;
}
.donation-timer-view__button:active {
  scale: .98;
}
.donation-timer-view__link-2:active {
  scale: .98;
}
[data-theme="light"] .donation-timer-view__block-16 {
  color: var(--app-warning);
}
[data-theme="light"] .donation-timer-view__link-2 {
  color: var(--app-warning);
}
[data-theme="light"] .donation-timer-view__check {
  color: var(--app-success);
}
[data-theme="light"] .donation-timer-view__block-4 {
  color: var(--app-danger);
}
[data-theme="light"] .donation-timer-view__text-monthly-goal {
  color: var(--app-danger);
}
[data-theme="light"] .donation-timer-view__text-2 {
  color: var(--app-danger);
}
[data-theme="light"] .donation-timer-view__text-recommended {
  color: var(--app-danger);
}
[data-theme="light"] .donation-timer-view__button {
  color: var(--app-danger);
}
[data-theme="light"] .donation-timer-view__text {
  color: var(--app-muted);
}
[data-theme="light"] .donation-timer-view__text-4 {
  color: var(--app-muted);
}
[data-theme="light"] .donation-timer-view__text-5 {
  color: var(--app-muted);
}
[data-theme="light"] .donation-timer-view__text-6 {
  color: var(--app-muted);
}
}
}
</style>
