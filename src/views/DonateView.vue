<script setup>
import { ref, computed, onMounted } from "vue";
import QRCode from "qrcode";
import { Zap, HardDrive, Code2, Copy, Check } from "lucide-vue-next";
import { getMonthlyStats, GOAL_SAT } from "@/lib/funding";

const BTC_ADDRESS = "bc1q7kaqey6665a2sfg004xjykjyuwwscmmkqz6rx6";

const qrCanvas = ref(null);

const copied = ref(false);
const statsLoading = ref(true);
const receivedSat = ref(0);

const goalBtc = GOAL_SAT / 1e8;
const receivedBtc = computed(() => receivedSat.value / 1e8);
const pct = computed(() => Math.min(100, (receivedSat.value / GOAL_SAT) * 100));

const currentMonthLabel = computed(() => {
  return new Date().toLocaleString("default", { month: "long", year: "numeric" });
});

function formatBtc(sat) {
  return (sat / 1e8).toFixed(4);
}

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
  const stats = await getMonthlyStats();
  receivedSat.value = stats.receivedSat;
  statsLoading.value = false;

  if (qrCanvas.value) {
    await QRCode.toCanvas(qrCanvas.value, `bitcoin:${BTC_ADDRESS}`, {
      width: 220,
      margin: 2,
      color: { dark: "#ffffff", light: "#00000000" },
    });
  }
});
</script>

<template>
  <div class="max-w-lg mx-auto px-4 py-10 space-y-10">

    <!-- Header -->
    <div class="space-y-2">
      <h1 class="text-xl font-semibold text-white">Support gupt</h1>
      <p class="text-sm text-zinc-400 leading-relaxed">
        gupt has no ads, no VC funding, and no subscription fees. It runs on
        Bitcoin donations from people who find it useful. Every satoshi goes
        directly toward keeping the infrastructure alive and improving the app.
      </p>
    </div>

    <!-- Monthly goal progress -->
    <div class="space-y-2.5">
      <div class="flex items-baseline justify-between">
        <span class="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {{ currentMonthLabel }} goal
        </span>
        <span class="text-xs text-zinc-400 tabular-nums">
          <template v-if="statsLoading">—</template>
          <template v-else>
            <span :class="pct >= 100 ? 'text-emerald-400' : 'text-amber-300'">
              {{ pct.toFixed(0) }}%
            </span>
          </template>
        </span>
      </div>

      <!-- Track -->
      <div class="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-700 ease-out"
          :class="pct >= 100 ? 'bg-emerald-500' : 'bg-amber-400'"
          :style="statsLoading ? 'width:0%' : `width:${pct}%`"
        />
      </div>

      <p v-if="!statsLoading && pct >= 100" class="text-xs text-emerald-400">
        Goal reached this month — thank you!
      </p>
      <p v-else-if="!statsLoading" class="text-xs text-zinc-500">
        {{ (100 - pct).toFixed(0) }}% remaining to cover this month's infrastructure costs.
      </p>
    </div>

    <!-- What your donation funds -->
    <div class="space-y-4">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        What your donation funds
      </h2>
      <ul class="space-y-5">
        <li class="flex gap-3">
          <Zap class="w-4 h-4 text-amber-400 shrink-0 mt-0.5" :stroke-width="2" />
          <div>
            <p class="text-sm font-medium text-white">Premium relay — 20 ms latency</p>
            <p class="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              Messages are routed through a private, high-performance Nostr relay.
              Low latency means your conversations feel instant, even across continents.
            </p>
          </div>
        </li>
        <li class="flex gap-3">
          <HardDrive class="w-4 h-4 text-amber-400 shrink-0 mt-0.5" :stroke-width="2" />
          <div>
            <p class="text-sm font-medium text-white">Originless storage — anonymous media</p>
            <p class="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              Media you send is stored on servers that carry no origin header and are
              not linked to your identity. No IP logging, no usage tracking, no corporate
              cloud provider with a subpoena inbox.
            </p>
          </div>
        </li>
        <li class="flex gap-3">
          <Code2 class="w-4 h-4 text-amber-400 shrink-0 mt-0.5" :stroke-width="2" />
          <div>
            <p class="text-sm font-medium text-white">Active development</p>
            <p class="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              New features, bug fixes, and protocol improvements ship regularly.
              Your donation buys developer time to keep gupt ahead of the curve.
            </p>
          </div>
        </li>
      </ul>
    </div>

    <!-- QR + address -->
    <div class="space-y-4">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Send Bitcoin
      </h2>
      <div class="flex flex-col items-center gap-5">
        <a :href="`bitcoin:${BTC_ADDRESS}`" :title="`Open in Bitcoin wallet: ${BTC_ADDRESS}`">
          <canvas ref="qrCanvas" class="rounded" width="220" height="220" />
        </a>

        <div class="w-full space-y-1.5">
          <p class="text-xs text-zinc-500">Bitcoin address</p>
          <div class="flex items-center gap-2">
            <code
              class="flex-1 min-w-0 text-xs text-zinc-200 break-all leading-relaxed"
            >{{ BTC_ADDRESS }}</code>
            <button
              @click="copyAddress"
              class="shrink-0 p-1.5 rounded text-zinc-400 hover:text-white transition-colors"
              :aria-label="copied ? 'Copied' : 'Copy address'"
            >
              <Check v-if="copied" class="w-4 h-4 text-emerald-400" :stroke-width="2" />
              <Copy v-else class="w-4 h-4" :stroke-width="2" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Thank you note -->
    <p class="text-xs text-zinc-500 leading-relaxed">
      There is no minimum. Any amount is appreciated. Donations are non-refundable
      and do not grant any special access or privileges — gupt stays free and open
      for everyone.
    </p>

  </div>
</template>
