<script setup>
import { computed, nextTick, onMounted, ref } from "vue";
import QRCode from "qrcode";
import { Check, Copy, GitBranch, Radio, ShieldOff } from "lucide-vue-next";
import { copyToClipboard } from "@/lib/clipboard";
import { getMonthlyStats } from "@/lib/funding";

const BTC_ADDRESS = "bc1q7kaqey6665a2sfg004xjykjyuwwscmmkqz6rx6";
const SAT_NUMBER_FORMAT = new Intl.NumberFormat("en-US");
const BTC_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 8,
});
const PERCENT_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const qrCanvas = ref(null);
const copied = ref(false);
const statsLoading = ref(true);
const receivedSat = ref(0);
const goalSat = ref(2_500_000);

const receivedSatLabel = computed(() => SAT_NUMBER_FORMAT.format(receivedSat.value));
const goalSatLabel = computed(() => SAT_NUMBER_FORMAT.format(goalSat.value));
const receivedBtcLabel = computed(() => BTC_NUMBER_FORMAT.format(receivedSat.value / 100_000_000));
const progressPct = computed(() => {
  if (!goalSat.value) return 0;
  return Math.min(100, Math.round((receivedSat.value / goalSat.value) * 100));
});
const progressPctLabel = computed(() => PERCENT_FORMAT.format(progressPct.value));
const progressStyle = computed(() => ({ width: `${progressPct.value}%` }));

const currentMonthLabel = computed(() =>
  new Date().toLocaleString("default", { month: "long", year: "numeric" }),
);

const fundingItems = [
  {
    icon: Radio,
    label: "Relay capacity",
    value: "Fast sync",
    detail: "Keeps private Nostr relay capacity online for message delivery and catch-up sync.",
  },
  {
    icon: ShieldOff,
    label: "Private storage",
    value: "No tracking",
    detail: "Pays for originless media storage without ad analytics or identity-linked usage logs.",
  },
  {
    icon: GitBranch,
    label: "Development",
    value: "Open source",
    detail: "Funds maintenance, bug fixes, packaging, and protocol work for the app.",
  },
];

async function copyAddress() {
  try {
    await copyToClipboard(BTC_ADDRESS);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // Keep the address visible for manual copy if clipboard access is denied.
  }
}

onMounted(async () => {
  await nextTick();

  const [stats] = await Promise.all([
    getMonthlyStats(),
    QRCode.toCanvas(qrCanvas.value, `bitcoin:${BTC_ADDRESS}`, {
      width: 220,
      margin: 1,
      color: { dark: "#f7f8fb", light: "#00000000" },
    }),
  ]);

  receivedSat.value = stats.receivedSat;
  goalSat.value = stats.goalSat;
  statsLoading.value = false;
});
</script>

<template>
  <main class="donate-view chat-shell min-h-dvh lg:h-full text-white overflow-y-auto">
    <div
      class="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:min-h-full lg:py-10"
    >
      <div class="donate-entrance mb-6 space-y-2">
        <p
          class="donate-section-label text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-success)"
        >
          Funding
        </p>
        <div class="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-white sm:text-3xl">Support gupt</h1>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              No ads, no subscriptions. Donations keep relay, storage, and release work moving.
            </p>
          </div>
          <p class="text-xs font-semibold text-zinc-500">{{ currentMonthLabel }}</p>
        </div>
      </div>

      <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div class="donate-entrance donate-hover-panel ui-panel rounded-2xl p-5 sm:p-6">
          <div class="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div class="space-y-1">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Raised this month
              </p>
              <div class="flex items-end gap-2">
                <span class="text-4xl font-bold tracking-tight text-white tabular-nums sm:text-5xl">
                  {{ statsLoading ? "--" : receivedSatLabel }}
                </span>
                <span class="pb-1.5 text-sm font-medium text-zinc-500">sats</span>
              </div>
              <p class="text-xs text-zinc-500">
                {{
                  statsLoading ? "Checking latest donations..." : receivedBtcLabel + " BTC received"
                }}
              </p>
            </div>

            <div
              class="rounded-2xl border border-(--app-border) px-4 py-3 text-right transition-transform duration-200 hover:-translate-y-0.5 hover:bg-white/5"
            >
              <p class="donate-pct text-2xl font-bold tabular-nums text-(--app-primary)">
                {{ statsLoading ? "--" : progressPctLabel }}%
              </p>
              <p class="donate-pct-goal mt-0.5 text-[11px] text-zinc-500">
                of {{ goalSatLabel }} sats
              </p>
            </div>
          </div>

          <div class="mt-6 space-y-2">
            <div class="donate-progress-track h-3 overflow-hidden rounded-full bg-white/8">
              <div
                class="donate-progress-fill h-full rounded-full bg-(--app-primary) transition-all duration-700 ease-out"
                :style="progressStyle"
              />
            </div>
            <div class="flex items-center justify-between text-[11px] text-zinc-500">
              <span>0 sats</span>
              <span>{{ goalSatLabel }} sats monthly goal</span>
            </div>
          </div>

          <div class="mt-6 grid gap-4 border-t border-(--app-border) pt-5 sm:grid-cols-3">
            <div
              v-for="item in fundingItems"
              :key="item.label"
              class="donate-funding-item min-w-0 p-3"
            >
              <div class="flex items-center gap-2">
                <span class="ui-icon-button flex h-8 w-8 rounded-xl">
                  <component
                    :is="item.icon"
                    class="h-4 w-4"
                    :stroke-width="1.8"
                    aria-hidden="true"
                  />
                </span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-white">{{ item.label }}</p>
                  <p class="text-[11px] font-medium text-(--app-primary)">{{ item.value }}</p>
                </div>
              </div>
              <p class="mt-3 text-xs leading-5 text-zinc-500">{{ item.detail }}</p>
            </div>
          </div>
        </div>

        <aside
          class="donate-entrance donate-hover-panel ui-panel rounded-2xl p-5 sm:p-6 [animation-delay:80ms]"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Bitcoin</p>
              <h2 class="mt-1 text-lg font-semibold text-white">Send directly</h2>
            </div>
            <a
              :href="`bitcoin:${BTC_ADDRESS}`"
              class="ui-icon-button-primary flex h-10 w-10 shrink-0 rounded-2xl transition-transform duration-200 hover:-translate-y-0.5 hover:scale-105 active:scale-95"
              :title="`Open in Bitcoin wallet: ${BTC_ADDRESS}`"
              aria-label="Open in Bitcoin wallet"
            >
              <Radio class="h-4.5 w-4.5" :stroke-width="2" aria-hidden="true" />
            </a>
          </div>

          <a
            :href="`bitcoin:${BTC_ADDRESS}`"
            :title="`Open in Bitcoin wallet: ${BTC_ADDRESS}`"
            class="donate-qr-link mt-5 flex justify-center rounded-2xl border border-(--app-border) bg-black/20 p-4"
          >
            <canvas ref="qrCanvas" class="h-55 w-55 rounded-xl" width="220" height="220" />
          </a>

          <div class="mt-5 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-semibold text-zinc-500">Bitcoin address</p>
              <button
                @click="copyAddress"
                class="ui-icon-button flex h-8 w-8 rounded-xl transition-transform duration-200 hover:-translate-y-0.5 hover:scale-105 active:scale-95"
                :aria-label="copied ? 'Copied address' : 'Copy address'"
                :title="copied ? 'Copied address' : 'Copy address'"
              >
                <Check v-if="copied" class="h-4 w-4 text-(--app-success)" :stroke-width="2.2" />
                <Copy v-else class="h-4 w-4" :stroke-width="2" />
              </button>
            </div>
            <code
              class="donate-address block break-all rounded-2xl border border-(--app-border) bg-white/5 p-3 font-mono text-xs leading-5 text-zinc-300"
            >
              {{ BTC_ADDRESS }}
            </code>
          </div>

          <p class="donate-footer mt-4 text-xs leading-5 text-zinc-500">
            No minimum. Donations do not unlock paid features; gupt stays free for everyone.
          </p>
        </aside>
      </section>
    </div>
  </main>
</template>
