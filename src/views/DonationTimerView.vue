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
  <div class="min-h-screen bg-black text-zinc-100 pb-16">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-5">
        <!-- Header -->
        <section class="border border-zinc-800/80 bg-zinc-950/40 rounded-xl p-5 sm:p-6 space-y-5">
          <div class="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <div
              class="relative shrink-0 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500/25 to-amber-500/10 border border-rose-500/30 text-rose-400"
            >
              <Heart class="h-7 w-7" :stroke-width="2.2" fill="currentColor" />
            </div>

            <div class="min-w-0 flex-1 space-y-1">
              <h1 class="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Support GUPT Development
              </h1>
              <p class="text-xs text-zinc-500 leading-relaxed">
                100% open-source & community-funded. Help keep messaging free, fast, and serverless.
              </p>
            </div>
          </div>

          <!-- Animated Prominent Goal Meter -->
          <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-medium uppercase tracking-wider text-rose-400">
                Monthly Goal
              </span>
              <span
                class="rounded-full bg-rose-500/10 border border-rose-500/20 px-3 py-1 font-mono text-[11px] font-medium tabular-nums text-rose-400"
              >
                {{ displayPct.toFixed(0) }}% Reached
              </span>
            </div>

            <!-- Big Font Display for Goal -->
            <div class="flex items-baseline justify-between flex-wrap gap-2">
              <div class="donate-goal-amount flex items-baseline gap-2.5 font-mono">
                <span class="text-5xl sm:text-6xl font-bold text-white tabular-nums tracking-tight">
                  {{ hasUsd ? formatUsd(displayReceivedSat) : displayReceivedSat.toLocaleString() }}
                </span>
                <span class="text-base sm:text-lg font-medium text-zinc-500">
                  <template v-if="hasUsd">/ {{ formatUsd(goalSat) }}</template>
                  <template v-else>/ {{ goalSat.toLocaleString() }} sats</template>
                </span>
              </div>
            </div>

            <!-- Animated Progress Bar -->
            <div
              class="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800 border border-zinc-800"
            >
              <div
                class="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-400 transition-all duration-1000 ease-out"
                :style="{ width: `${Math.max(3, animatedPct)}%` }"
              />
            </div>
          </div>
        </section>

        <!-- Option 1: GitHub Sponsors -->
        <section class="border border-zinc-800/80 bg-zinc-950/40 rounded-xl p-4 sm:p-5 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div
                class="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-zinc-200 border border-zinc-800"
              >
                <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
              </div>
              <div>
                <h2 class="text-sm font-semibold tracking-tight text-zinc-100">GitHub Sponsors</h2>
                <p class="text-xs text-zinc-500">Monthly recurring sponsorship</p>
              </div>
            </div>

            <span
              class="inline-block rounded-full bg-gradient-to-r from-rose-500/15 to-amber-500/10 border border-rose-500/25 px-2.5 py-0.5 text-[10px] font-medium text-rose-400"
            >
              Recommended
            </span>
          </div>

          <a
            :href="GITHUB_SPONSORS_URL"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white text-black px-4 text-xs font-semibold transition-all hover:bg-zinc-200 active:scale-[0.98]"
          >
            <span>Sponsor on GitHub</span>
            <ExternalLink class="h-3.5 w-3.5 opacity-70" :stroke-width="2" />
          </a>
        </section>

        <!-- Option 2: Bitcoin Donation -->
        <section class="border border-zinc-800/80 bg-zinc-950/40 rounded-xl p-4 sm:p-5 space-y-4">
          <div class="flex items-center gap-2.5">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/25 text-amber-400 font-bold text-sm"
            >
              ₿
            </div>
            <div>
              <h2 class="text-sm font-semibold tracking-tight text-zinc-100">Bitcoin Donation</h2>
              <p class="text-xs text-zinc-500">Direct on-chain sats transfer</p>
            </div>
          </div>

          <div
            v-if="fundingAddress"
            class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 flex flex-col sm:flex-row items-center gap-5"
          >
            <div class="shrink-0 p-2.5 bg-white rounded-lg border border-zinc-300 shadow-sm">
              <canvas ref="qrCanvas" class="block rounded" />
            </div>

            <div class="flex-1 w-full space-y-3">
              <p
                class="font-mono text-xs text-zinc-200 break-all bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800 select-all"
              >
                {{ fundingAddress }}
              </p>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-3.5 text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer"
                  @click="copyBtcAddress"
                >
                  <Check
                    v-if="copiedAddress"
                    class="h-3.5 w-3.5 text-emerald-400"
                    :stroke-width="2"
                  />
                  <Copy v-else class="h-3.5 w-3.5" :stroke-width="2" />
                  <span>{{ copiedAddress ? "Copied!" : "Copy Address" }}</span>
                </button>

                <a
                  :href="`bitcoin:${fundingAddress}`"
                  class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 px-3.5 text-xs font-semibold transition-all active:scale-[0.98]"
                >
                  <Wallet class="h-3.5 w-3.5" :stroke-width="2" />
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
