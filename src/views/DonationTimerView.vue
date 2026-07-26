<script setup>
import { ref, computed, onMounted, watch, nextTick } from "vue";
import QRCode from "qrcode";
import {
  Heart,
  Sparkles,
  TrendingUp,
  Copy,
  Check,
  ExternalLink,
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
const copied = ref(false);
const showQr = ref(false);

const qrCanvas = ref(null);

const fundedPct = computed(() => {
  if (!goalSat.value) return 0;
  return Math.min(100, Math.max(0, (receivedSat.value / goalSat.value) * 100));
});

async function copyBtcAddress() {
  if (!fundingAddress.value) return;
  try {
    await copyToClipboard(fundingAddress.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
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

watch([fundingAddress, showQr], async () => {
  if (showQr.value) {
    await nextTick();
    renderQr();
  }
});

onMounted(async () => {
  const cached = getCachedMonthlyStatsSync();
  if (cached) {
    receivedSat.value = cached.receivedSat;
    goalSat.value = cached.goalSat || GOAL_SAT;
  }

  getFundingAddress().then((addr) => {
    if (addr) fundingAddress.value = addr;
  });

  try {
    const stats = await getMonthlyStats();
    receivedSat.value = stats.receivedSat;
    goalSat.value = stats.goalSat || GOAL_SAT;
  } catch {}
});
</script>

<template>
  <div
    class="min-h-screen bg-(--app-bg) text-(--app-text) flex flex-col items-center justify-center p-6 sm:p-10 md:p-12"
  >
    <!-- Rounded Outer Container -->
    <div
      class="w-full max-w-xl border border-(--app-border) bg-(--app-surface) shadow-2xl rounded-3xl p-8 sm:p-10 md:p-12 space-y-8 my-auto"
    >
      <!-- Top Header -->
      <div class="flex flex-col items-center text-center space-y-3">
        <div
          class="h-16 w-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500"
        >
          <Heart class="h-8 w-8" :stroke-width="2.2" fill="currentColor" />
        </div>
        <div class="space-y-1.5">
          <h1 class="text-2xl font-bold tracking-tight text-(--app-text)">
            Support GUPT Development
          </h1>
          <p class="text-xs sm:text-sm text-(--app-text-soft) max-w-md leading-relaxed mx-auto">
            GUPT is 100% open-source & community-funded. Help us keep infrastructure and relay nodes fast and free for everyone.
          </p>
        </div>
      </div>

      <!-- Community Funding Progress Box -->
      <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-5 space-y-4">
        <div class="flex items-center justify-between text-xs sm:text-sm">
          <span class="flex items-center gap-2 font-bold text-rose-400">
            <TrendingUp class="h-4 w-4 shrink-0" :stroke-width="2" />
            <span>Monthly Goal</span>
          </span>
          <span class="font-mono text-xs sm:text-sm font-bold text-(--app-text) tabular-nums">
            {{ receivedSat.toLocaleString() }} / {{ goalSat.toLocaleString() }} sats
          </span>
        </div>

        <div
          class="h-2.5 w-full overflow-hidden rounded-full bg-(--app-surface) border border-(--app-border)"
        >
          <div
            class="h-full rounded-full bg-rose-500 transition-all duration-500"
            :style="{ width: `${Math.max(4, fundedPct)}%` }"
          />
        </div>

        <div class="flex items-center gap-2 text-xs text-(--app-text-soft)">
          <Sparkles class="h-4 w-4 text-amber-400 shrink-0" :stroke-width="2" />
          <span>
            <strong class="text-rose-400 font-bold">{{ fundedPct.toFixed(0) }}% funded</strong> this month. Thank you to all community supporters!
          </span>
        </div>
      </div>

      <!-- Choice Section: GitHub Sponsors (UP) VS Bitcoin (DOWN) -->
      <div class="space-y-4">
        <h2 class="text-xs font-bold text-zinc-400 uppercase tracking-widest text-center">
          Select Donation Method
        </h2>

        <div class="space-y-4">
          <!-- Option 1: GitHub Sponsors (UP) -->
          <div
            class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-5 space-y-3"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 font-bold text-sm text-(--app-text)">
                <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
                <span>GitHub Sponsors</span>
              </div>
              <span class="text-[11px] font-semibold text-zinc-400">Monthly Recurring</span>
            </div>
            <p class="text-xs text-(--app-text-soft) leading-relaxed">
              Support development with a monthly subscription via GitHub Sponsors.
            </p>
            <a
              :href="GITHUB_SPONSORS_URL"
              target="_blank"
              rel="noopener noreferrer"
              class="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white px-5 py-3.5 text-xs sm:text-sm font-bold border border-zinc-700 transition-all active:scale-[0.98]"
            >
              <span>Sponsor on GitHub</span>
              <ExternalLink class="h-3.5 w-3.5 opacity-60 ml-auto" :stroke-width="2" />
            </a>
          </div>

          <!-- VS Separator (Middle) -->
          <div class="relative flex items-center justify-center py-1">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-(--app-border)" />
            </div>
            <div
              class="relative rounded-full bg-(--app-surface) px-4 py-1 border border-rose-500/30 text-rose-400 font-black text-xs uppercase tracking-widest"
            >
              OR
            </div>
          </div>

          <!-- Option 2: Bitcoin Donation (DOWN) -->
          <div
            class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-5 space-y-3"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 font-bold text-sm text-(--app-text)">
                <span class="text-amber-400 font-bold text-base">₿</span>
                <span>Bitcoin Donation</span>
              </div>
              <span class="text-[11px] font-semibold text-zinc-400">One-time Sats</span>
            </div>
            <p class="text-xs text-(--app-text-soft) leading-relaxed">
              Direct sats transfer to our open Bitcoin address.
            </p>
            <div class="space-y-2 pt-1">
              <button
                type="button"
                class="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-5 py-3.5 text-xs sm:text-sm font-bold transition-all active:scale-[0.98]"
                @click="copyBtcAddress"
              >
                <Check v-if="copied" class="h-4 w-4 text-emerald-400" :stroke-width="2" />
                <Copy v-else class="h-4 w-4" :stroke-width="2" />
                <span>{{ copied ? "Address Copied!" : "Copy BTC Address" }}</span>
              </button>

              <button
                v-if="fundingAddress"
                type="button"
                class="w-full text-center text-xs font-semibold text-(--app-text-soft) hover:text-(--app-text) py-1 transition-colors"
                @click="showQr = !showQr"
              >
                {{ showQr ? "Hide Bitcoin QR Code" : "Show Bitcoin QR Code" }}
              </button>
            </div>
          </div>
        </div>

        <!-- Bitcoin QR Code Canvas Box -->
        <div
          v-if="showQr && fundingAddress"
          class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-5 flex flex-col items-center space-y-3"
        >
          <div class="p-3 bg-white rounded-2xl shadow-sm border border-zinc-200">
            <canvas ref="qrCanvas" class="block rounded-xl" />
          </div>
          <p
            class="font-mono text-xs text-(--app-text) break-all text-center max-w-xs bg-(--app-surface) px-4 py-2 rounded-xl border border-(--app-border)"
          >
            {{ fundingAddress }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
