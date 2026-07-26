<script setup>
import { ref, computed, onMounted, nextTick } from "vue";
import QRCode from "qrcode";
import {
  Heart,
  Copy,
  Check,
  ExternalLink,
  Server,
  Layers,
  Code,
  Wallet,
} from "@lucide/vue";
import {
  getFundingAddress,
  getMonthlyStats,
  getCachedMonthlyStatsSync,
  GOAL_SAT,
} from "@/lib/funding";
import { copyToClipboard } from "@/lib/clipboard";

const GITHUB_SPONSORS_URL = "https://github.com/sponsors/besoeasy";

const receivedSat = ref(0);
const goalSat = ref(GOAL_SAT);
const fundingAddress = ref("");
const copiedAddress = ref(false);

const qrCanvas = ref(null);

const fundedPct = computed(() => {
  if (!goalSat.value) return 0;
  return Math.min(100, Math.max(0, (receivedSat.value / goalSat.value) * 100));
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

  try {
    const stats = await getMonthlyStats();
    receivedSat.value = stats.receivedSat;
    goalSat.value = stats.goalSat || GOAL_SAT;
  } catch {}
});
</script>

<template>
  <div class="min-h-screen bg-(--app-bg) text-(--app-text)">
    <main class="mx-auto w-full max-w-[80rem] px-4 py-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-5">
        <!-- Header -->
        <section
          class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-3xl p-5 sm:p-6 space-y-4"
        >
          <div class="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <div
              class="relative shrink-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500"
            >
              <Heart class="h-7 w-7" :stroke-width="2.2" fill="currentColor" />
            </div>

            <div class="min-w-0 flex-1 space-y-1">
              <h1 class="text-xl font-bold tracking-tight sm:text-2xl">
                Support GUPT Development
              </h1>
              <p class="text-xs text-zinc-400 leading-relaxed">
                100% open-source & community-funded. Help keep messaging free, fast, and serverless.
              </p>
            </div>
          </div>

          <!-- Goal Meter -->
          <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-3.5 space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold">
              <span class="text-zinc-400">Monthly Goal</span>
              <span class="font-mono text-zinc-300 tabular-nums">
                {{ receivedSat.toLocaleString() }} / {{ goalSat.toLocaleString() }} sats ({{ fundedPct.toFixed(0) }}%)
              </span>
            </div>

            <div class="h-2 w-full overflow-hidden rounded-full bg-(--app-surface) border border-(--app-border)">
              <div
                class="h-full rounded-full bg-rose-500 transition-all duration-500"
                :style="{ width: `${Math.max(3, fundedPct)}%` }"
              />
            </div>
          </div>
        </section>

        <!-- Option 1: GitHub Sponsors -->
        <section class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-2xl p-4 sm:p-5 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-white border border-zinc-700">
                <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
              </div>
              <div>
                <h2 class="text-sm font-semibold">GitHub Sponsors</h2>
                <p class="text-xs text-zinc-400">Monthly recurring sponsorship</p>
              </div>
            </div>

            <span class="inline-block rounded-full bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 text-[10px] font-bold text-rose-400">
              Recommended
            </span>
          </div>

          <a
            :href="GITHUB_SPONSORS_URL"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2.5 text-xs font-bold border border-zinc-700 transition-all active:scale-[0.98]"
          >
            <span>Sponsor on GitHub</span>
            <ExternalLink class="h-3.5 w-3.5 opacity-70" :stroke-width="2" />
          </a>
        </section>

        <!-- Option 2: Bitcoin Donation -->
        <section class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-2xl p-4 sm:p-5 space-y-4">
          <div class="flex items-center gap-2.5">
            <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-sm">
              ₿
            </div>
            <div>
              <h2 class="text-sm font-semibold">Bitcoin Donation</h2>
              <p class="text-xs text-zinc-400">Direct on-chain sats transfer</p>
            </div>
          </div>

          <div
            v-if="fundingAddress"
            class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4 flex flex-col sm:flex-row items-center gap-5"
          >
            <div class="shrink-0 p-2.5 bg-white rounded-xl border border-zinc-300 shadow-sm">
              <canvas ref="qrCanvas" class="block rounded" />
            </div>

            <div class="flex-1 w-full space-y-3">
              <p class="font-mono text-xs text-(--app-text) break-all bg-(--app-surface) p-2.5 rounded-xl border border-(--app-border) select-all">
                {{ fundingAddress }}
              </p>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  class="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-3.5 py-2 text-xs font-bold transition-all active:scale-[0.98]"
                  @click="copyBtcAddress"
                >
                  <Check v-if="copiedAddress" class="h-3.5 w-3.5 text-emerald-400" :stroke-width="2" />
                  <Copy v-else class="h-3.5 w-3.5" :stroke-width="2" />
                  <span>{{ copiedAddress ? "Copied!" : "Copy Address" }}</span>
                </button>

                <a
                  :href="`bitcoin:${fundingAddress}`"
                  class="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 px-3.5 py-2 text-xs font-bold transition-all active:scale-[0.98]"
                >
                  <Wallet class="h-3.5 w-3.5" :stroke-width="2" />
                  <span>Open Wallet</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        <!-- Where Your Sats Go -->
        <section class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-2xl p-4 sm:p-5 space-y-3">
          <h2 class="text-xs font-bold uppercase tracking-wider text-zinc-400">Where Your Sats Go</h2>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) p-3 space-y-1.5">
              <div class="flex items-center gap-2 text-rose-400 font-semibold text-xs">
                <Server class="h-4 w-4" :stroke-width="2" />
                <span>Anonymous Hosting</span>
              </div>
              <p class="text-[11px] text-zinc-400 leading-snug">Originless, serverless hosting and anonymous edge delivery.</p>
            </div>

            <div class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) p-3 space-y-1.5">
              <div class="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                <Layers class="h-4 w-4" :stroke-width="2" />
                <span>Relays</span>
              </div>
              <p class="text-[11px] text-zinc-400 leading-snug">Decentralized zero-knowledge storage and event transport.</p>
            </div>

            <div class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) p-3 space-y-1.5">
              <div class="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                <Code class="h-4 w-4" :stroke-width="2" />
                <span>Development</span>
              </div>
              <p class="text-[11px] text-zinc-400 leading-snug">Open-source core E2EE engineering and protocol maintenance.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>


