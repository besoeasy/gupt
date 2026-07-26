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
  RefreshCw,
  ShieldCheck,
  Server,
  PhoneCall,
  Layers,
  Zap,
  Wallet,
  CheckCircle2,
} from "@lucide/vue";
import UiTabBar from "@/components/UiTabBar.vue";
import {
  getFundingAddress,
  getMonthlyStats,
  getCachedMonthlyStatsSync,
  GOAL_SAT,
} from "@/lib/funding";
import { copyToClipboard } from "@/lib/clipboard";

const TABS = [
  { id: "methods", label: "Donation Options", icon: Heart },
  { id: "progress", label: "Goal Progress", icon: TrendingUp },
  { id: "impact", label: "Where Sats Go", icon: Layers },
];

const GITHUB_SPONSORS_URL = "https://github.com/sponsors/besoeasy";

const MILESTONES = [
  { pct: 25, sat: 625000, label: "Relay Node Storage", icon: Server },
  { pct: 50, sat: 1250000, label: "STUN/TURN WebRTC Calling", icon: PhoneCall },
  { pct: 75, sat: 1875000, label: "Security Audits & E2EE Engine", icon: ShieldCheck },
  { pct: 100, sat: 2500000, label: "Full Month Operational Target", icon: CheckCircle2 },
];

const activeTab = ref("methods");
const receivedSat = ref(0);
const goalSat = ref(GOAL_SAT);
const fundingAddress = ref("");
const copiedAddress = ref(false);
const isSyncing = ref(false);

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
      width: 170,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {}
}

async function refreshStats() {
  isSyncing.value = true;
  try {
    const stats = await getMonthlyStats({ force: true });
    receivedSat.value = stats.receivedSat;
    goalSat.value = stats.goalSat || GOAL_SAT;
  } catch {
  } finally {
    setTimeout(() => (isSyncing.value = false), 400);
  }
}

watch([fundingAddress, activeTab], async () => {
  if (fundingAddress.value && activeTab.value === "methods") {
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
    if (addr) {
      fundingAddress.value = addr;
      nextTick(renderQr);
    }
  });

  refreshStats();
});
</script>

<template>
  <div class="min-h-screen bg-(--app-bg) text-(--app-text)">
    <main class="mx-auto w-full max-w-[80rem] px-4 py-6 lg:px-8">
      <div class="mx-auto max-w-3xl space-y-6">
        <!-- Header Banner -->
        <section
          class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-3xl p-6 sm:p-7 space-y-5"
        >
          <div class="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
            <div
              class="relative shrink-0 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500"
            >
              <Heart class="h-8 w-8" :stroke-width="2.2" fill="currentColor" />
            </div>

            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex items-center justify-center sm:justify-start gap-2">
                <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-400">
                  Open-Source & Serverless
                </span>
                <span class="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  100% Community Funded
                </span>
              </div>
              <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
                Support GUPT Development
              </h1>
              <p class="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                GUPT is built with privacy-first end-to-end encryption. Your sats fund relay infrastructure, WebRTC TURN servers, and open-source maintenance.
              </p>
            </div>
          </div>

          <!-- Goal Summary Card inside Header -->
          <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4 space-y-3">
            <div class="flex items-center justify-between text-xs font-semibold">
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-rose-500" />
                <span>Monthly Community Goal</span>
              </div>
              <span class="font-mono text-zinc-300 tabular-nums">
                {{ receivedSat.toLocaleString() }} / {{ goalSat.toLocaleString() }} sats ({{ fundedPct.toFixed(0) }}%)
              </span>
            </div>

            <div class="h-2.5 w-full overflow-hidden rounded-full bg-(--app-surface) border border-(--app-border)">
              <div
                class="h-full rounded-full bg-rose-500 transition-all duration-500"
                :style="{ width: `${Math.max(3, fundedPct)}%` }"
              />
            </div>
          </div>
        </section>

        <!-- Navigation Tabs -->
        <UiTabBar
          v-model="activeTab"
          :tabs="TABS"
          variant="surface"
        />

        <!-- Tab 1: Donation Methods -->
        <div v-if="activeTab === 'methods'" class="space-y-6">
          <!-- Option 1: GitHub Sponsors -->
          <section class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-2xl p-5 space-y-4">
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

              <span class="rounded-full bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-rose-400">
                Recommended
              </span>
            </div>

            <p class="text-xs text-zinc-400 leading-relaxed">
              Support ongoing open-source maintenance, relay node operations, and security updates with recurring monthly sponsorship on GitHub.
            </p>

            <a
              :href="GITHUB_SPONSORS_URL"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white px-5 py-3 text-xs font-bold border border-zinc-700 transition-all active:scale-[0.98]"
            >
              <span>Sponsor on GitHub</span>
              <ExternalLink class="h-3.5 w-3.5 opacity-70" :stroke-width="2" />
            </a>
          </section>

          <!-- Option 2: Bitcoin / Satoshi Payment Box -->
          <section class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-2xl p-5 space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-sm">
                  ₿
                </div>
                <div>
                  <h2 class="text-sm font-semibold">Bitcoin Donation</h2>
                  <p class="text-xs text-zinc-400">Direct on-chain sats transfer</p>
                </div>
              </div>
            </div>

            <p class="text-xs text-zinc-400 leading-relaxed">
              Send sats directly to our open Bitcoin address without any third-party intermediaries.
            </p>

            <!-- QR Code Canvas & Action Buttons -->
            <div
              v-if="fundingAddress"
              class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-5 flex flex-col sm:flex-row items-center gap-6"
            >
              <div class="shrink-0 p-3 bg-white rounded-2xl border border-zinc-300 shadow-sm">
                <canvas ref="qrCanvas" class="block rounded-lg" />
              </div>

              <div class="flex-1 w-full space-y-3">
                <div class="space-y-1">
                  <label class="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Bitcoin Address
                  </label>
                  <p class="font-mono text-xs text-(--app-text) break-all bg-(--app-surface) p-2.5 rounded-xl border border-(--app-border) select-all">
                    {{ fundingAddress }}
                  </p>
                </div>

                <!-- Action Button Row -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    class="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-4 py-2.5 text-xs font-bold transition-all active:scale-[0.98]"
                    @click="copyBtcAddress"
                  >
                    <Check v-if="copiedAddress" class="h-4 w-4 text-emerald-400" :stroke-width="2" />
                    <Copy v-else class="h-4 w-4" :stroke-width="2" />
                    <span>{{ copiedAddress ? "Address Copied!" : "Copy Address" }}</span>
                  </button>

                  <a
                    :href="`bitcoin:${fundingAddress}`"
                    class="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 px-4 py-2.5 text-xs font-bold transition-all active:scale-[0.98]"
                  >
                    <Wallet class="h-4 w-4" :stroke-width="2" />
                    <span>Open in Wallet</span>
                    <ExternalLink class="h-3.5 w-3.5 opacity-70" :stroke-width="2" />
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- Tab 2: Monthly Goal Progress -->
        <div v-if="activeTab === 'progress'" class="space-y-6">
          <section class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-2xl p-5 sm:p-6 space-y-6">
            <div class="flex items-center justify-between">
              <div class="space-y-1">
                <h2 class="text-base font-bold">Monthly Funding Milestones</h2>
                <p class="text-xs text-zinc-400">Track how community sats unlock critical messenger infrastructure</p>
              </div>

              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-(--app-surface) transition-all"
                :disabled="isSyncing"
                @click="refreshStats"
              >
                <RefreshCw :class="['h-3.5 w-3.5', isSyncing ? 'animate-spin text-rose-400' : '']" :stroke-width="2" />
                <span>Sync Status</span>
              </button>
            </div>

            <!-- Goal Meter -->
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs font-mono font-bold">
                <span class="text-rose-400">{{ fundedPct.toFixed(1) }}% Funded</span>
                <span class="text-zinc-300 tabular-nums">
                  {{ receivedSat.toLocaleString() }} / {{ goalSat.toLocaleString() }} sats
                </span>
              </div>

              <div class="h-3.5 w-full overflow-hidden rounded-full bg-(--app-surface-soft) border border-(--app-border)">
                <div
                  class="h-full rounded-full bg-rose-500 transition-all duration-500"
                  :style="{ width: `${Math.max(2, fundedPct)}%` }"
                />
              </div>
            </div>

            <!-- Milestones Cards Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div
                v-for="ms in MILESTONES"
                :key="ms.pct"
                :class="[
                  'rounded-xl border p-4 space-y-2 transition-all',
                  fundedPct >= ms.pct
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-(--app-border) bg-(--app-surface-soft)'
                ]"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <component
                      :is="ms.icon"
                      :class="[
                        'h-4 w-4',
                        fundedPct >= ms.pct ? 'text-emerald-400' : 'text-zinc-500'
                      ]"
                      :stroke-width="2"
                    />
                    <span class="text-xs font-bold">{{ ms.label }}</span>
                  </div>

                  <span
                    :class="[
                      'text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border',
                      fundedPct >= ms.pct
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                    ]"
                  >
                    {{ ms.pct }}%
                  </span>
                </div>

                <p class="text-[11px] text-zinc-400 font-mono">
                  Target: {{ ms.sat.toLocaleString() }} sats
                </p>
              </div>
            </div>
          </section>
        </div>

        <!-- Tab 3: Impact & Transparency Breakdown -->
        <div v-if="activeTab === 'impact'" class="space-y-6">
          <section class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-2xl p-5 sm:p-6 space-y-6">
            <div class="space-y-1">
              <h2 class="text-base font-bold">Where Your Sats Go</h2>
              <p class="text-xs text-zinc-400">100% of community contributions directly sustain the GUPT ecosystem</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <!-- Item 1: Anonymous Hosting (Originless) -->
              <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4 space-y-3">
                <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <Server class="h-5 w-5" :stroke-width="2" />
                </div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-rose-400">Anonymous Hosting</h3>
                <p class="text-xs text-zinc-400 leading-relaxed">
                  Powers originless, serverless hosting and anonymous edge delivery without central origin servers.
                </p>
              </div>

              <!-- Item 2: Relays -->
              <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4 space-y-3">
                <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Layers class="h-5 w-5" :stroke-width="2" />
                </div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-amber-400">Relays</h3>
                <p class="text-xs text-zinc-400 leading-relaxed">
                  Sustains decentralized relay infrastructure used strictly as zero-knowledge storage and event transport.
                </p>
              </div>

              <!-- Item 3: Development -->
              <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4 space-y-3">
                <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Code class="h-5 w-5" :stroke-width="2" />
                </div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-emerald-400">Development</h3>
                <p class="text-xs text-zinc-400 leading-relaxed">
                  Funds ongoing open-source core development, end-to-end encryption R&D, security updates, and protocol maintenance.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>

