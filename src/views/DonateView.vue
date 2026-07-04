<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import QRCode from "qrcode";
import {
  Bitcoin,
  Check,
  Copy,
  ExternalLink,
  GitBranch,
  Heart,
  Radio,
  RefreshCw,
  Repeat2,
  ShieldOff,
  Sparkles,
  Star,
  Zap,
} from "lucide-vue-next";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { getFundingAddress, GOAL_SAT, getMonthlyStats } from "@/lib/funding";
import { useTheme } from "@/lib/theme";

const SAT_FORMAT = new Intl.NumberFormat("en-US");
const BTC_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 8,
});

const { isDark } = useTheme();

const qrCanvas = ref(null);
const qrContainer = ref(null);
let qrResizeObserver = null;
const copied = ref(false);
const statsLoading = ref(true);
const statsRefreshing = ref(false);
const receivedSat = ref(0);
const goalSat = ref(GOAL_SAT);
const fundingAddress = ref("");
const animatedPct = ref(0);

const receivedSatLabel = computed(() => SAT_FORMAT.format(receivedSat.value));
const goalSatLabel = computed(() => SAT_FORMAT.format(goalSat.value));
const receivedBtcLabel = computed(() => BTC_FORMAT.format(receivedSat.value / 100_000_000));
const goalBtcLabel = computed(() => BTC_FORMAT.format(goalSat.value / 100_000_000));
const remainingSat = computed(() => Math.max(0, goalSat.value - receivedSat.value));
const remainingSatLabel = computed(() => SAT_FORMAT.format(remainingSat.value));

const progressPct = computed(() => {
  if (!goalSat.value) return 0;
  return Math.min(100, (receivedSat.value / goalSat.value) * 100);
});

const currentMonthLabel = computed(() =>
  new Date().toLocaleString("default", { month: "long", year: "numeric" }),
);

const mempoolUrl = computed(() =>
  fundingAddress.value ? `https://mempool.space/address/${fundingAddress.value}` : null,
);

const GITHUB_SPONSORS_URL = "https://github.com/sponsors/besoeasy";

const sponsorTiers = [
  { label: "$3 / mo", desc: "Friend", icon: Heart, color: "#ec4899", delay: "0ms" },
  { label: "$6 / mo", desc: "Supporter", icon: Star, color: "#a855f7", delay: "180ms" },
  { label: "$10 / mo", desc: "Champion", icon: Zap, color: "#f59e0b", delay: "360ms" },
];

const fundingItems = [
  {
    icon: Radio,
    title: "Relay uptime",
    detail: "Private Nostr relay capacity for fast sync and reliable message delivery.",
  },
  {
    icon: ShieldOff,
    title: "Private storage",
    detail: "Originless media hosting without ads, trackers, or identity-linked logs.",
  },
  {
    icon: GitBranch,
    title: "Open development",
    detail: "Bug fixes, packaging, protocol work, and releases for everyone.",
  },
];

function animateProgress(target) {
  const start = animatedPct.value;
  const delta = target - start;
  if (!delta) return;
  const startTime = performance.now();
  const duration = 700;

  function frame(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - (1 - t) ** 3;
    animatedPct.value = Math.round(start + delta * eased);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

async function loadStats({ force = false, refreshing = false } = {}) {
  if (refreshing) statsRefreshing.value = true;
  else statsLoading.value = true;

  try {
    const stats = await getMonthlyStats({ force });
    receivedSat.value = stats.receivedSat;
    goalSat.value = stats.goalSat;
    animateProgress(progressPct.value);
  } finally {
    statsLoading.value = false;
    statsRefreshing.value = false;
  }
}

async function copyAddress() {
  try {
    await copyToClipboard(fundingAddress.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // Address remains visible for manual copy.
  }
}

async function renderQr() {
  if (!fundingAddress.value || !qrCanvas.value) return;
  // Fill the container up to 400 px for crisp rendering at every screen size.
  const size = Math.min(qrContainer.value?.clientWidth ?? 240, 400);
  await QRCode.toCanvas(qrCanvas.value, `bitcoin:${fundingAddress.value}`, {
    width: size,
    margin: 1,
    color: isDark.value
      ? { dark: "#f7f8fb", light: "#00000000" }
      : { dark: "#0b1220", light: "#ffffff" },
  });
}

watch(isDark, () => {
  void renderQr();
});

onMounted(async () => {
  await nextTick();
  fundingAddress.value = await getFundingAddress();
  await nextTick();
  const tasks = [loadStats()];
  if (fundingAddress.value) tasks.push(renderQr());
  await Promise.all(tasks);

  // Re-render QR at the correct pixel size whenever the container resizes.
  if (qrContainer.value) {
    qrResizeObserver = new ResizeObserver(() => {
      if (fundingAddress.value) void renderQr();
    });
    qrResizeObserver.observe(qrContainer.value);
  }
});

onUnmounted(() => {
  qrResizeObserver?.disconnect();
});
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--app-surface)_62%,transparent),var(--app-bg))] text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-[80rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div class="mx-auto max-w-xl space-y-6">
        <!-- Hero header -->
        <header class="space-y-3 text-center">
          <p
            class="donate-eyebrow inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]"
          >
            Community funded · {{ currentMonthLabel }}
          </p>
          <h1 class="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Keep gupt free
            <span class="donate-gradient-text">&nbsp;for everyone</span>
          </h1>
          <p class="text-sm leading-relaxed text-(--app-muted)">
            No subscriptions, no ads, no investors. Your support covers relay infrastructure,
            private storage, and the ongoing work of shipping improvements.
          </p>
        </header>

        <!-- Monthly progress bar -->
        <section class="donate-progress-card donate-panel rounded-2xl p-5">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-end gap-2">
              <span class="text-2xl font-bold tabular-nums">
                {{ statsLoading ? "—" : receivedSatLabel }}
              </span>
              <span class="mb-0.5 text-xs text-zinc-500">sats raised this month</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-sm font-semibold tabular-nums text-(--app-primary)">
                {{ statsLoading ? "—" : `${animatedPct}%` }}
              </span>
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                :disabled="statsLoading || statsRefreshing"
                title="Refresh"
                aria-label="Refresh donations"
                @click="loadStats({ force: true, refreshing: true })"
              >
                <RefreshCw
                  class="h-3.5 w-3.5"
                  :class="statsRefreshing ? 'animate-spin' : ''"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          <div class="mt-4 space-y-1.5">
            <div class="donate-track h-2 overflow-hidden rounded-full">
              <div
                class="donate-fill h-full rounded-full transition-all duration-700 ease-out"
                :style="{ width: `${animatedPct}%` }"
              />
            </div>
            <div class="flex justify-between text-[11px] text-zinc-500">
              <span>{{
                statsLoading
                  ? "Loading…"
                  : `${receivedBtcLabel} BTC · ${remainingSatLabel} sats to goal`
              }}</span>
              <span>Goal: {{ goalSatLabel }} sats</span>
            </div>
          </div>
        </section>

        <!-- GitHub Sponsors -->
        <section class="donate-panel donate-github-card rounded-2xl p-6">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <span
                class="donate-badge-github inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
              >
                <Repeat2 class="h-3 w-3" aria-hidden="true" />
                Recurring
              </span>
              <h2 class="mt-2 text-xl font-bold tracking-tight">GitHub Sponsors</h2>
              <p class="mt-1 text-sm leading-relaxed text-(--app-muted)">
                Back the project monthly. Cancel any time — card, bank, or PayPal accepted. No
                crypto required.
              </p>
            </div>
            <div
              class="donate-github-icon shrink-0 flex h-11 w-11 items-center justify-center rounded-2xl"
            >
              <Sparkles class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
            </div>
          </div>

          <!-- Tier pills -->
          <div class="mt-5 grid grid-cols-3 gap-3">
            <a
              v-for="tier in sponsorTiers"
              :key="tier.label"
              :href="GITHUB_SPONSORS_URL"
              target="_blank"
              rel="noopener noreferrer"
              class="donate-tier-pill group relative flex flex-col items-center gap-2 rounded-2xl p-4 text-center"
              :style="{ '--tier-color': tier.color, animationDelay: tier.delay }"
            >
              <!-- pulsing glow ring -->
              <span class="donate-tier-ring absolute inset-0 rounded-2xl" />
              <!-- icon wrapper with float + pop -->
              <span
                class="donate-tier-icon-wrap relative flex h-9 w-9 items-center justify-center rounded-xl"
                :style="{
                  background: `color-mix(in srgb, ${tier.color} 18%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${tier.color} 35%, transparent)`,
                }"
              >
                <component
                  :is="tier.icon"
                  class="donate-tier-icon h-4 w-4"
                  :style="{ color: tier.color }"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </span>
              <span
                class="text-sm font-extrabold tabular-nums tracking-tight"
                :style="{ color: tier.color }"
                >{{ tier.label }}</span
              >
              <span class="text-[10px] font-medium text-zinc-500">{{ tier.desc }}</span>
            </a>
          </div>

          <div class="mt-5 space-y-2">
            <a
              :href="GITHUB_SPONSORS_URL"
              target="_blank"
              rel="noopener noreferrer"
              class="donate-github-btn flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold transition-all"
            >
              <Heart class="donate-btn-heart h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
              Become a Sponsor
            </a>
            <a
              :href="GITHUB_SPONSORS_URL"
              target="_blank"
              rel="noopener noreferrer"
              class="flex w-full items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-300"
            >
              github.com/sponsors/besoeasy
              <ExternalLink class="h-3 w-3" :stroke-width="2" aria-hidden="true" />
            </a>
          </div>
        </section>

        <!-- Bitcoin -->
        <section class="donate-panel donate-btc-card rounded-2xl p-6">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <span
                class="donate-badge-btc inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
              >
                <Zap class="h-3 w-3" aria-hidden="true" />
                One-time
              </span>
              <h2 class="mt-2 text-xl font-bold tracking-tight">Bitcoin</h2>
              <p class="mt-1 text-sm leading-relaxed text-(--app-muted)">
                Send any amount of sats — completely private, no account needed.
              </p>
            </div>
            <div
              class="donate-btc-icon shrink-0 flex h-11 w-11 items-center justify-center rounded-2xl"
            >
              <Bitcoin class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
            </div>
          </div>

          <template v-if="fundingAddress">
            <!-- QR code -->
            <a
              ref="qrContainer"
              :href="`bitcoin:${fundingAddress}`"
              :title="`Open in Bitcoin wallet: ${fundingAddress}`"
              class="donate-qr-link mt-6 block rounded-xl border border-(--app-border) bg-(--app-surface-soft) p-4"
            >
              <canvas ref="qrCanvas" class="block mx-auto rounded-lg" />
            </a>
            <p class="mt-2 text-center text-[11px] text-zinc-500">
              Scan or tap to open your wallet
            </p>

            <!-- Address -->
            <div class="mt-5 space-y-2">
              <p class="text-xs font-semibold text-zinc-500">Bitcoin address</p>
              <code
                class="donate-address block break-all rounded-xl border border-(--app-border) bg-(--app-surface-soft) p-3 font-mono text-[11px] leading-5 text-(--app-text-soft) select-all"
                >{{ fundingAddress }}</code
              >
            </div>

            <div class="mt-4 space-y-2">
              <PrimaryButton
                class="w-full"
                :class="copied ? '!bg-emerald-600/20 !text-emerald-400' : ''"
                @click="copyAddress"
              >
                <Check v-if="copied" class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
                <Copy v-else class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                {{ copied ? "Address copied!" : "Copy address" }}
              </PrimaryButton>

              <a
                v-if="mempoolUrl"
                :href="mempoolUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="flex w-full items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-300"
              >
                Verify on mempool.space
                <ExternalLink class="h-3 w-3" :stroke-width="2" aria-hidden="true" />
              </a>
            </div>
          </template>

          <template v-else>
            <div class="mt-6 flex flex-col items-center gap-2 py-10 text-center">
              <div
                class="donate-resolving-spinner h-6 w-6 rounded-full border-2 border-transparent"
              />
              <p class="text-sm text-zinc-500">Resolving address…</p>
              <p class="text-[11px] text-zinc-600">Looking up btc.besoeasy.com TXT record</p>
            </div>
          </template>
        </section>

        <!-- What your support funds -->
        <section class="space-y-3">
          <h2 class="px-1 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
            What your support funds
          </h2>
          <div class="space-y-3">
            <article
              v-for="item in fundingItems"
              :key="item.title"
              class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 flex items-start gap-4"
            >
              <div
                class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft)"
              >
                <component :is="item.icon" class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <h3 class="text-sm font-semibold">{{ item.title }}</h3>
                <p class="mt-1 text-xs leading-5 text-zinc-500">{{ item.detail }}</p>
              </div>
            </article>
          </div>
          <p class="donate-footer px-1 text-xs leading-relaxed text-zinc-500">
            Donations do not unlock features. Gupt stays the same for everyone — your support just
            keeps the infrastructure running.
          </p>
        </section>
      </div>
    </div>
  </main>
</template>
