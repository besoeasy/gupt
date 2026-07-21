<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import QRCode from "qrcode";
import { Check, Copy, Heart, RefreshCw, Repeat2, Zap } from "@lucide/vue";
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

const progressPct = computed(() => {
  if (!goalSat.value) return 0;
  return Math.min(100, (receivedSat.value / goalSat.value) * 100);
});

const currentMonthLabel = computed(() =>
  new Date().toLocaleString("default", { month: "long", year: "numeric" }),
);

const GITHUB_SPONSORS_URL = "https://github.com/sponsors/besoeasy";

const sponsorTiers = [
  { label: "$3/mo", desc: "Friend" },
  { label: "$6/mo", desc: "Supporter" },
  { label: "$10/mo", desc: "Champion" },
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
  } catch {}
}

async function renderQr() {
  if (!fundingAddress.value || !qrCanvas.value) return;

  const size = Math.min(qrContainer.value?.clientWidth ?? 140, 180);
  await QRCode.toCanvas(qrCanvas.value, `bitcoin:${fundingAddress.value}`, {
    width: size,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
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
  <main class="min-h-dvh overflow-y-auto bg-(--app-bg) text-(--app-text) lg:h-full">
    <div class="mx-auto w-full max-w-[80rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div class="mx-auto max-w-xl space-y-6">
        <!-- Hero header -->
        <header class="space-y-3 text-center">
          <p
            class="bg-[color-mix(in_srgb,var(--app-primary)_12%,transparent)] border border-[color-mix(in_srgb,var(--app-primary)_24%,transparent)] text-(--app-primary) inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]"
          >
            Community funded · {{ currentMonthLabel }}
          </p>
          <h1 class="text-3xl font-extrabold tracking-tight sm:text-4xl text-zinc-100">
            Running originless for 10,000+ users isn't easy.
          </h1>
          <p class="text-sm leading-relaxed text-zinc-400">
            Gupt is serverless and anonymous: we store no logs, run no central databases, and have
            no investors. Every message, file, and call routes directly over peer-to-peer
            connections and decentralized relays. Maintaining this level of speed and security for
            thousands of users requires solid bandwidth and encrypted storage. We rely entirely on
            community support to cover relay bills and server costs.
          </p>
        </header>

        <!-- Monthly progress bar -->
        <section class="rounded-2xl p-5 border border-(--app-border) bg-(--app-surface-soft)">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-end gap-2">
              <span class="text-2xl font-bold tracking-tight text-zinc-200 tabular-nums">
                {{ statsLoading ? "—" : receivedSatLabel }}
              </span>
              <span class="mb-0.5 text-xs text-zinc-500"
                >sats raised this month / {{ goalSatLabel }} sat goal</span
              >
            </div>
            <div class="flex items-center gap-3">
              <span class="text-sm font-semibold tabular-nums text-(--app-primary)">
                {{ statsLoading ? "—" : `${animatedPct}%` }}
              </span>
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-zinc-400 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-zinc-200 cursor-pointer"
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
            <div class="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                class="h-full rounded-full bg-(--app-primary)"
                :style="{ width: `${animatedPct}%` }"
              />
            </div>
            <div class="flex justify-between text-[11px] text-zinc-500">
              <span>{{ statsLoading ? "Loading…" : `${receivedBtcLabel} BTC raised` }}</span>
              <span>{{ animatedPct }}% funded</span>
            </div>
          </div>
        </section>

        <!-- Payment Options -->
        <div class="space-y-4">
          <!-- GitHub Sponsors -->
          <section
            class="rounded-2xl p-5 border border-(--app-border) bg-(--app-surface-soft) flex flex-col justify-between"
          >
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#c084fc]/10 border border-[#c084fc]/20 text-[#c084fc]"
                >
                  <Repeat2 class="h-3 w-3" aria-hidden="true" />
                  Monthly
                </span>
              </div>
              <h2 class="text-base font-bold tracking-tight text-zinc-200">GitHub Sponsors</h2>
              <p class="text-xs leading-relaxed text-zinc-500">
                Support the project month-to-month. Card, bank, or PayPal accepted. No crypto
                required.
              </p>

              <!-- Tier pills -->
              <div class="grid grid-cols-3 gap-2 pt-2">
                <a
                  v-for="tier in sponsorTiers"
                  :key="tier.label"
                  :href="GITHUB_SPONSORS_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex flex-col items-center justify-center rounded-xl border border-(--app-border) bg-zinc-900/40 p-2.5 text-center transition-all hover:bg-zinc-800/40"
                >
                  <span class="text-[11px] font-bold text-zinc-300">{{ tier.label }}</span>
                  <span class="text-[9px] text-zinc-500 mt-0.5">{{ tier.desc }}</span>
                </a>
              </div>
            </div>

            <div class="pt-6">
              <a
                :href="GITHUB_SPONSORS_URL"
                target="_blank"
                rel="noopener noreferrer"
                class="flex w-full items-center justify-center gap-2 rounded-xl bg-[#a855f7] px-4 py-3 text-xs font-bold text-white transition-all hover:bg-[#b56df8] cursor-pointer"
              >
                <Heart class="h-3.5 w-3.5" :stroke-width="2.5" aria-hidden="true" />
                Become a Sponsor
              </a>
            </div>
          </section>

          <!-- Bitcoin -->
          <section
            class="rounded-2xl p-5 border border-(--app-border) bg-(--app-surface-soft) flex flex-col justify-between"
          >
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#fbbf24]/10 border border-[#fbbf24]/20 text-[#fbbf24]"
                >
                  <Zap class="h-3 w-3" aria-hidden="true" />
                  One-time
                </span>
              </div>
              <h2 class="text-base font-bold tracking-tight text-zinc-200">Bitcoin</h2>
              <p class="text-xs leading-relaxed text-zinc-500">
                Send any amount of sats — completely private, no registration or account needed.
              </p>

              <!-- QR & Address Info -->
              <template v-if="fundingAddress">
                <div class="pt-2 flex justify-center">
                  <a
                    ref="qrContainer"
                    :href="`bitcoin:${fundingAddress}`"
                    class="block rounded-lg border border-(--app-border) bg-white p-2 hover:opacity-95"
                  >
                    <canvas ref="qrCanvas" class="block mx-auto rounded" />
                  </a>
                </div>
                <div class="space-y-1">
                  <p class="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider">
                    Address
                  </p>
                  <code
                    class="block break-all rounded-lg border border-(--app-border) bg-zinc-900/60 p-2 font-mono text-[9px] text-zinc-400 select-all leading-normal"
                  >
                    {{ fundingAddress }}
                  </code>
                </div>
              </template>
              <template v-else>
                <div class="py-8 text-center space-y-2">
                  <div
                    class="h-5 w-5 mx-auto rounded-full border-2 border-transparent border-t-[#fbbf24] animate-spin"
                  />
                  <p class="text-xs text-zinc-500">Resolving address…</p>
                </div>
              </template>
            </div>

            <div v-if="fundingAddress" class="pt-6">
              <button
                type="button"
                class="flex w-full items-center justify-center gap-2 rounded-xl border border-(--app-border) bg-zinc-900/60 hover:bg-zinc-800/60 px-4 py-3 text-xs font-bold text-zinc-300 transition-all cursor-pointer"
                :class="copied ? '!border-emerald-600/30 !bg-emerald-600/10 !text-emerald-400' : ''"
                @click="copyAddress"
              >
                <Check v-if="copied" class="h-3.5 w-3.5" :stroke-width="2.5" />
                <Copy class="h-3.5 w-3.5" :stroke-width="2" />
                {{ copied ? "Copied!" : "Copy Address" }}
              </button>
            </div>
          </section>
        </div>

        <!-- Footer Notice -->
        <footer class="text-center pt-2">
          <p class="text-xs leading-relaxed text-zinc-500">
            Donating does not unlock premium features. Gupt has no paywalls or trackers. Your
            support simply keeps our secure, serverless messaging platform accessible to everyone.
          </p>
        </footer>
      </div>
    </div>
  </main>
</template>
