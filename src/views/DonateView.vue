<script setup>
import { ref, computed, onMounted } from "vue";
import QRCode from "qrcode";
import { Zap, HardDrive, Code2, Copy, Check, Radio, ShieldOff, GitBranch } from "lucide-vue-next";
import { getMonthlyStats, GOAL_SAT } from "@/lib/funding";

const BTC_ADDRESS = "bc1q7kaqey6665a2sfg004xjykjyuwwscmmkqz6rx6";

const qrCanvas = ref(null);
const copied = ref(false);
const statsLoading = ref(true);
const receivedSat = ref(0);
const animatedPct = ref(0);
const show = ref(false);

const pct = computed(() => Math.min(100, (receivedSat.value / GOAL_SAT) * 100));

const currentMonthLabel = computed(() =>
  new Date().toLocaleString("default", { month: "long", year: "numeric" }),
);

const features = [
  {
    icon: Radio,
    label: "Premium relay",
    badge: "20 ms",
    color: "text-sky-400",
    bg: "bg-sky-400/10",
    detail: "Messages route through a private, high-performance Nostr relay. Conversations feel instant, even across continents.",
    stat: "< 20 ms",
    statLabel: "avg latency",
  },
  {
    icon: ShieldOff,
    label: "Originless storage",
    badge: "anonymous",
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    detail: "Media is stored on servers with no origin header and no identity link. No IP logging, no usage tracking, no subpoena inbox.",
    stat: "0",
    statLabel: "identity traces",
  },
  {
    icon: GitBranch,
    label: "Active development",
    badge: "open source",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    detail: "New features, bug fixes, and protocol improvements ship regularly. Your donation directly funds developer time.",
    stat: "∞",
    statLabel: "improvements",
  },
];

async function copyAddress() {
  try {
    await navigator.clipboard.writeText(BTC_ADDRESS);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // ignore
  }
}

onMounted(async () => {
  requestAnimationFrame(() => { show.value = true; });

  const [stats] = await Promise.all([
    getMonthlyStats(),
    QRCode.toCanvas(qrCanvas.value, `bitcoin:${BTC_ADDRESS}`, {
      width: 200,
      margin: 1,
      color: { dark: "#fbbf24", light: "#00000000" },
    }),
  ]);

  receivedSat.value = stats.receivedSat;
  statsLoading.value = false;

  setTimeout(() => { animatedPct.value = pct.value; }, 400);
});
</script>

<template>
  <div class="donate-view min-h-screen bg-black text-white">
    <div class="app-page-shell mx-auto px-4 py-12 lg:px-8">
    <div class="max-w-2xl mx-auto space-y-14">
    <!-- Header -->
    <div
      class="space-y-3 transition-all duration-500 ease-out"
      :class="show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
    >
      <h1 class="text-2xl font-semibold text-white tracking-tight">Support gupt</h1>
      <p class="text-sm text-zinc-400 leading-relaxed max-w-lg">
        No ads, no VC money, no subscriptions. gupt runs on Bitcoin donations from
        people who find it useful. Every satoshi keeps the infrastructure alive and
        the code moving.
      </p>
    </div>

    <!-- Monthly goal -->
    <div
      class="space-y-3 transition-all duration-500 ease-out delay-100"
      :class="show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
    >
      <div class="flex items-baseline justify-between">
        <span class="text-xs font-semibold uppercase tracking-wider text-zinc-500">{{ currentMonthLabel }}</span>
        <span
          class="donate-pct text-sm font-semibold tabular-nums transition-colors duration-300"
          :class="statsLoading ? 'text-zinc-600' : pct >= 100 ? 'text-emerald-400' : 'text-amber-300'"
        >
          {{ statsLoading ? "—" : pct.toFixed(0) + "%" }}
        </span>
      </div>
      <div class="donate-progress-track h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-1000 ease-out"
          :class="pct >= 100 ? 'bg-emerald-400' : 'bg-amber-400'"
          :style="`width:${animatedPct}%`"
        />
      </div>
      <p class="text-xs text-zinc-500">
        <template v-if="statsLoading">Loading…</template>
        <template v-else-if="pct >= 100">Goal reached this month — thank you!</template>
        <template v-else>{{ (100 - pct).toFixed(0) }}% to go to cover this month's costs.</template>
      </p>
    </div>

    <!-- Feature cards -->
    <div class="grid grid-cols-1 gap-4">
      <div
        v-for="(f, i) in features"
        :key="f.label"
        class="donate-card group flex gap-4 p-4 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/60 transition-all duration-300 ease-out"
        :class="show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
        :style="`transition-delay:${200 + i * 100}ms`"
      >
        <!-- Icon -->
        <div
          class="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110"
          :class="f.bg"
        >
          <component :is="f.icon" class="w-4 h-4" :class="f.color" :stroke-width="1.75" />
        </div>

        <!-- Text -->
        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-white">{{ f.label }}</span>
            <span
              class="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              :class="[f.bg, f.color]"
            >{{ f.badge }}</span>
          </div>
          <p class="text-xs text-zinc-400 leading-relaxed">{{ f.detail }}</p>
        </div>

        <!-- Stat -->
        <div class="shrink-0 text-right hidden sm:block">
          <div class="text-lg font-bold tabular-nums" :class="f.color">{{ f.stat }}</div>
          <div class="text-[10px] text-zinc-600 mt-0.5">{{ f.statLabel }}</div>
        </div>
      </div>
    </div>

    <!-- QR + address -->
    <div
      class="flex flex-col items-center gap-6 transition-all duration-500 ease-out"
      :class="show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
      style="transition-delay:500ms"
    >
      <p class="donate-section-label text-xs font-semibold uppercase tracking-wider text-zinc-500 self-start">Send Bitcoin</p>

      <a
        :href="`bitcoin:${BTC_ADDRESS}`"
        :title="`Open in Bitcoin wallet: ${BTC_ADDRESS}`"
        class="group relative"
      >
        <div class="absolute inset-0 rounded-2xl bg-amber-400/15 blur-2xl scale-75 group-hover:scale-100 transition-all duration-700" />
        <canvas ref="qrCanvas" class="relative rounded-2xl" width="200" height="200" />
      </a>

      <div class="w-full space-y-1.5">
        <p class="text-xs text-zinc-500">Bitcoin address</p>
        <div class="flex items-center gap-2">
          <code class="donate-address flex-1 min-w-0 text-xs text-zinc-300 break-all leading-relaxed font-mono">{{ BTC_ADDRESS }}</code>
          <button
            @click="copyAddress"
            class="shrink-0 p-1.5 rounded text-zinc-500 hover:text-white transition-colors"
            :aria-label="copied ? 'Copied' : 'Copy address'"
          >
            <Transition
              enter-active-class="transition-all duration-150 ease-out"
              enter-from-class="opacity-0 scale-50"
              enter-to-class="opacity-100 scale-100"
              leave-active-class="transition-all duration-100 ease-in"
              leave-from-class="opacity-100 scale-100"
              leave-to-class="opacity-0 scale-50"
              mode="out-in"
            >
              <Check v-if="copied" key="check" class="w-4 h-4 text-emerald-400" :stroke-width="2" />
              <Copy v-else key="copy" class="w-4 h-4" :stroke-width="2" />
            </Transition>
          </button>
        </div>
      </div>
    </div>

    <!-- Footer note -->
    <p
      class="donate-footer text-xs text-zinc-600 leading-relaxed transition-all duration-500 ease-out"
      :class="show ? 'opacity-100' : 'opacity-0'"
      style="transition-delay:700ms"
    >
      No minimum. Donations are non-refundable and do not grant special access —
      gupt stays free and open for everyone.
    </p>

    </div>
    </div>
  </div>
</template>
