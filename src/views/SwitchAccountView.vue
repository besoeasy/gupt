<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Brain,
  Cpu,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { useIdentityStore } from "@/stores/identity";

const identity = useIdentityStore();
const router = useRouter();

const message = ref("");
const error = ref("");

const passphrase = ref("");
const pin = ref("");
const showPassphrase = ref(false);
const deriveBusy = ref(false);
const suggestionGenerated = ref(false);

const passphraseOk = computed(() => passphrase.value.length >= 8);
const canDerive = computed(
  () => passphraseOk.value && pin.value.trim().length > 0 && !deriveBusy.value,
);

const passphraseStrength = computed(() => {
  const val = passphrase.value;
  if (!val) return { score: 0, label: "", colorClass: "", barClass: "", pct: 0 };

  let score = 0;
  if (val.length >= 8) score += 25;
  if (val.length >= 12) score += 20;
  if (val.length >= 16) score += 15;
  if (/[a-z]/.test(val)) score += 10;
  if (/[A-Z]/.test(val)) score += 10;
  if (/[0-9]/.test(val)) score += 10;
  if (/[^a-zA-Z0-9]/.test(val)) score += 10;

  const totalPct = Math.min(100, score);

  if (val.length < 8) {
    return {
      score,
      pct: Math.max(12, totalPct * 0.4),
      label: `Too short (${val.length}/8)`,
      colorClass: "text-rose-400 font-semibold",
      barClass: "bg-rose-500",
    };
  }
  if (totalPct < 50) {
    return {
      score,
      pct: totalPct,
      label: "Weak",
      colorClass: "text-amber-400 font-semibold",
      barClass: "bg-amber-500",
    };
  }
  if (totalPct < 75) {
    return {
      score,
      pct: totalPct,
      label: "Good",
      colorClass: "text-emerald-400 font-semibold",
      barClass: "bg-emerald-500",
    };
  }
  return {
    score,
    pct: totalPct,
    label: "Strong",
    colorClass: "text-emerald-400 font-bold",
    barClass: "bg-emerald-400",
  };
});

const ADJECTIVES = [
  "cosmic",
  "emerald",
  "golden",
  "silent",
  "radiant",
  "stellar",
  "ancient",
  "crystal",
  "atomic",
  "azure",
  "blazing",
  "brave",
  "celestial",
  "crimson",
  "curious",
  "dynamic",
  "electric",
  "eternal",
  "fearless",
  "harmonic",
  "infinite",
  "lunar",
  "mystic",
  "noble",
  "oceanic",
  "optimal",
  "phantom",
  "quantum",
  "rustic",
  "sacred",
  "solar",
  "velvet",
  "vivid",
];

const NOUNS = [
  "falcon",
  "galaxy",
  "harbor",
  "horizon",
  "island",
  "journey",
  "kernel",
  "lantern",
  "matrix",
  "nebula",
  "oasis",
  "orbit",
  "phoenix",
  "portal",
  "pulse",
  "quartz",
  "resonance",
  "river",
  "shadow",
  "shield",
  "signal",
  "spark",
  "summit",
  "temple",
  "thunder",
  "vault",
  "vector",
  "vessel",
  "vision",
  "voyage",
  "whisper",
  "zenith",
];

function generateBrainPhraseSuggestion() {
  const getRandom = (arr) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return arr[buf[0] % arr.length];
  };

  const bufPin = new Uint32Array(1);
  crypto.getRandomValues(bufPin);
  const randomPin = String((bufPin[0] % 9000) + 1000);

  passphrase.value = `${getRandom(ADJECTIVES)}-${getRandom(NOUNS)}-${getRandom(ADJECTIVES)}-${getRandom(NOUNS)}`;
  pin.value = randomPin;
  showPassphrase.value = true;
  suggestionGenerated.value = true;
}

async function loadAccount() {
  error.value = "";
  message.value = "";
  deriveBusy.value = true;
  try {
    await identity.deriveIdentity(passphrase.value, pin.value);
    passphrase.value = "";
    pin.value = "";
    message.value = "Account derived & loaded. Redirecting…";
    setTimeout(() => router.replace("/"), 350);
  } catch (e) {
    error.value = e.message || "Failed to derive account.";
  } finally {
    deriveBusy.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-(--app-bg) text-(--app-text) pb-12">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-6">
        <!-- Page Header -->
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.15)]"
            >
              <Brain class="h-6 w-6" :stroke-width="1.8" />
            </div>
            <div>
              <h1 class="text-2xl font-extrabold tracking-tight text-(--app-text)">
                Brain-Derived Identity
              </h1>
              <p class="text-xs text-(--app-muted)">
                Deterministic cryptographic key derivation via Argon2id
              </p>
            </div>
          </div>

          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400 transition-all hover:bg-emerald-500/20 active:scale-95 cursor-pointer shrink-0"
            @click="generateBrainPhraseSuggestion"
            title="Generate a memorable phrase & PIN idea"
          >
            <Sparkles class="h-3.5 w-3.5" :stroke-width="2" />
            <span class="hidden sm:inline">Suggest Phrase</span>
            <span class="sm:hidden">Suggest</span>
          </button>
        </div>

        <!-- The "Mind As Vault" Creative Feature Hero -->
        <section
          class="relative overflow-hidden rounded-3xl border border-emerald-500/25 bg-[color-mix(in_srgb,var(--app-surface)_85%,transparent)] p-5 sm:p-7 shadow-[0_16px_48px_rgba(0,0,0,0.2)] space-y-5"
        >
          <!-- Ambient Matrix Glow -->
          <div
            class="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-emerald-500/15 blur-3xl"
            aria-hidden="true"
          />
          <div
            class="pointer-events-none absolute -left-12 -bottom-12 h-36 w-36 rounded-full bg-(--app-primary)/10 blur-2xl"
            aria-hidden="true"
          />

          <!-- Philosophy Highlight -->
          <div class="relative space-y-2">
            <div class="flex items-center gap-2">
              <span
                class="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Zero Disk Storage &middot; Zero Cloud Leakage
              </span>
            </div>

            <h2 class="text-lg sm:text-xl font-bold tracking-tight text-(--app-text)">
              Your mind is your private key vault
            </h2>

            <p class="text-xs sm:text-sm text-(--app-text-soft) leading-relaxed">
              In traditional apps, you're forced to store seed phrases on paper, save private keys
              to disk, or trust centralized cloud vaults.
              <strong class="font-semibold text-emerald-400">Gupt eliminates all of that.</strong>
            </p>

            <p class="text-xs sm:text-sm text-(--app-muted) leading-relaxed">
              We generate a full 256-bit
              <code class="text-xs font-mono text-(--app-text)">secp256k1</code> private key
              dynamically on the fly from your <strong>Passphrase + PIN</strong>. Because it is
              calculated mathematically directly from your memory, you
              <span class="text-(--app-text) font-semibold"
                >never have to save, write down, or backup your private key anywhere.</span
              >
            </p>
          </div>

          <!-- 3-Step Visual Derivation Pipeline -->
          <div class="relative grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <!-- Step 1 -->
            <div
              class="flex flex-col gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-3.5 transition-all hover:border-emerald-500/30"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Step 1
                </span>
                <Brain class="h-4 w-4 text-emerald-400" :stroke-width="2" />
              </div>
              <div>
                <p class="text-xs font-bold text-(--app-text)">In Your Brain</p>
                <p class="text-[11px] text-(--app-muted) mt-0.5 leading-snug">
                  Memorable secret passphrase and numeric PIN known only to you.
                </p>
              </div>
            </div>

            <!-- Step 2 -->
            <div
              class="flex flex-col gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-3.5 transition-all hover:border-emerald-500/30"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Step 2
                </span>
                <Cpu class="h-4 w-4 text-emerald-400" :stroke-width="2" />
              </div>
              <div>
                <p class="text-xs font-bold text-(--app-text)">Argon2id KDF</p>
                <p class="text-[11px] text-(--app-muted) mt-0.5 leading-snug">
                  64 MiB memory-hard derivation in RAM; ASIC/GPU brute-force immune.
                </p>
              </div>
            </div>

            <!-- Step 3 -->
            <div
              class="flex flex-col gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-3.5 transition-all hover:border-emerald-500/30"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Step 3
                </span>
                <KeyRound class="h-4 w-4 text-emerald-400" :stroke-width="2" />
              </div>
              <div>
                <p class="text-xs font-bold text-(--app-text)">secp256k1 Key</p>
                <p class="text-[11px] text-(--app-muted) mt-0.5 leading-snug">
                  Deterministic private key derived in memory; zero disk footprint.
                </p>
              </div>
            </div>
          </div>

          <!-- Feature Bullets -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
            <div class="flex items-center gap-2 text-(--app-text-soft)">
              <ShieldCheck class="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Recoverable on any device anywhere</span>
            </div>
            <div class="flex items-center gap-2 text-(--app-text-soft)">
              <HardDrive class="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Nothing saved to disk or cloud servers</span>
            </div>
          </div>
        </section>

        <!-- Suggestion Callout Banner (when user clicked suggest) -->
        <div
          v-if="suggestionGenerated"
          class="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2 text-xs"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 font-semibold text-emerald-400 text-sm">
              <Sparkles class="h-4 w-4 shrink-0" />
              <span>Generated Memorable Brain Combo</span>
            </div>
            <button
              type="button"
              class="text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer"
              @click="generateBrainPhraseSuggestion"
            >
              Reroll &rarr;
            </button>
          </div>
          <p class="text-(--app-text-soft) leading-relaxed">
            Memorize this passphrase and PIN! You don't need to write it down or save files. As long
            as you remember this exact combo, you can instantly unlock your account on any machine.
          </p>
        </div>

        <!-- Session Status Notice -->
        <div
          v-if="identity.mode === 'ephemeral'"
          class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2 text-xs"
        >
          <div class="flex items-center gap-2 font-semibold text-amber-500 text-sm">
            <ShieldAlert class="h-4 w-4 shrink-0" />
            <span>Temporary Ephemeral Guest Session Active</span>
          </div>
          <p class="text-(--app-muted) leading-relaxed">
            You are currently using a temporary guest key. Deriving your account with your
            Passphrase + PIN will replace this guest session with your permanent memory-derived
            identity.
          </p>
        </div>

        <div
          v-else
          class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4 space-y-1.5 text-xs"
        >
          <div class="flex items-center gap-2 font-semibold text-(--app-text)">
            <Lock class="h-4 w-4 text-emerald-400 shrink-0" />
            <span>Account Switch Notice</span>
          </div>
          <p class="text-(--app-muted) leading-relaxed">
            Entering a different Passphrase + PIN will switch to that account and clear cached
            events belonging to the previous identity for privacy.
          </p>
        </div>

        <!-- Derivation Form Card -->
        <section
          class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-2xl p-4 sm:p-6 space-y-4"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="space-y-1">
              <h2 class="text-sm font-semibold text-(--app-text)">Enter Passphrase & PIN</h2>
              <p class="text-xs text-(--app-muted) leading-relaxed">
                The exact same combination always yields the exact same cryptographic keypair.
              </p>
            </div>
            <button
              type="button"
              class="text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer shrink-0"
              @click="generateBrainPhraseSuggestion"
            >
              Suggest idea
            </button>
          </div>

          <div class="space-y-3">
            <div class="space-y-1.5">
              <label class="text-xs text-(--app-text)">
                Passphrase <span class="text-red-500">*</span>
              </label>
              <div class="relative">
                <input
                  v-model="passphrase"
                  :type="showPassphrase ? 'text' : 'password'"
                  placeholder="e.g. cosmic-falcon-crystal-ember (min 8 chars)"
                  autocomplete="new-password"
                  class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] pr-12 text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
                />
                <button
                  type="button"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-(--app-muted) hover:text-(--app-text) p-1.5 rounded-lg transition-colors cursor-pointer"
                  @click="showPassphrase = !showPassphrase"
                  :title="showPassphrase ? 'Hide passphrase' : 'Reveal passphrase'"
                >
                  <EyeOff v-if="showPassphrase" class="w-4 h-4" :stroke-width="1.8" />
                  <Eye v-else class="w-4 h-4" :stroke-width="1.8" />
                </button>
              </div>

              <!-- Passphrase Key Strength Meter -->
              <div v-if="passphrase.length > 0" class="space-y-1.5 px-0.5 pt-0.5">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-(--app-muted) text-[11px] font-medium">Entropy strength</span>
                  <span class="text-[11px] tabular-nums" :class="passphraseStrength.colorClass">
                    {{ passphraseStrength.label }}
                  </span>
                </div>
                <div
                  class="h-1.5 w-full overflow-hidden rounded-full bg-(--app-surface) border border-(--app-border)"
                >
                  <div
                    class="h-full rounded-full transition-all duration-300 ease-out"
                    :class="passphraseStrength.barClass"
                    :style="{ width: `${passphraseStrength.pct}%` }"
                  />
                </div>
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="text-xs text-(--app-text)">
                Numeric PIN <span class="text-red-500">*</span>
              </label>
              <input
                v-model="pin"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                placeholder="e.g. 7392 (numbers only, 1-99999)"
                autocomplete="off"
                class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] font-mono tracking-widest"
                @keydown.enter="canDerive && loadAccount()"
              />
            </div>

            <div class="pt-2 space-y-2">
              <PrimaryButton @click="loadAccount" :disabled="!canDerive" :loading="deriveBusy">
                <Brain v-if="!deriveBusy" class="h-4 w-4 mr-1.5" :stroke-width="2" />
                {{ deriveBusy ? "Deriving Argon2id key in memory…" : "Derive & Load Account" }}
              </PrimaryButton>
              <p class="text-[11px] text-center text-(--app-muted)">
                Memory computation executes locally in WebCrypto RAM. No data is sent over the wire.
              </p>
            </div>
          </div>
        </section>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />
      </div>
    </main>
  </div>
</template>
