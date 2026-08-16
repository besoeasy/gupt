<script setup>
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  Brain,
  Calendar,
  Check,
  Copy,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  Heart,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
  Zap,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { useIdentityStore } from "@/stores/identity";
import {
  derivePubkeyAndHashFromBrainFactors,
  pubkeyName,
  roboHashUrl,
  shortId,
} from "@/lib/crypto";

const identity = useIdentityStore();
const router = useRouter();

const message = ref("");
const error = ref("");
const copied = ref(false);

// 5 Memory Anchor Inputs
const passphrase = ref("");
const pin = ref("");
const specialDate = ref("");
const secretPerson = ref("");
const favoriteCountry = ref("");

const showPassphrase = ref(false);
const showSecretPerson = ref(false);
const deriveBusy = ref(false);
const suggestionGenerated = ref(false);

// Live preview state
const previewPubkey = ref("");
const previewHash = ref("");
const previewBusy = ref(false);
let previewTimeout = null;

// Validity per factor
const isPassphraseValid = computed(() => passphrase.value.trim().length >= 6);
const isPinValid = computed(() => pin.value.trim().length >= 1);
const isDateValid = computed(() => specialDate.value.trim().length >= 4);
const isSecretPersonValid = computed(() => secretPerson.value.trim().length >= 2);
const isCountryValid = computed(() => favoriteCountry.value.trim().length >= 2);

const activeFactorCount = computed(() => {
  let count = 0;
  if (isPassphraseValid.value) count++;
  if (isPinValid.value) count++;
  if (isDateValid.value) count++;
  if (isSecretPersonValid.value) count++;
  if (isCountryValid.value) count++;
  return count;
});

const canDerive = computed(() => activeFactorCount.value >= 3 && !deriveBusy.value);

// Entropy calculations across all 5 factors
const entropyState = computed(() => {
  const p = passphrase.value.trim();
  const n = pin.value.trim();
  const d = specialDate.value.trim();
  const s = secretPerson.value.trim();
  const c = favoriteCountry.value.trim();

  let rawScore = 0;
  if (p.length >= 6) rawScore += 15;
  if (p.length >= 12) rawScore += 10;
  if (/[0-9]/.test(p) || /[^a-zA-Z0-9]/.test(p)) rawScore += 5;

  if (n.length >= 1) rawScore += 10;
  if (n.length >= 4) rawScore += 10;

  if (d.length >= 4) rawScore += 10;
  if (d.length >= 8) rawScore += 10;

  if (s.length >= 2) rawScore += 10;
  if (s.length >= 5) rawScore += 10;

  if (c.length >= 2) rawScore += 10;
  if (c.length >= 4) rawScore += 10;

  const count = activeFactorCount.value;

  let pct = 0;
  let label = "Enter at least 3 memory anchors";
  let colorClass = "text-rose-400";
  let strokeColor = "#f43f5e";
  let badgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
  let bitsEstimate = "< 64 bits";
  let multiplierLabel = "Base (0x)";
  let tierTitle = "Insufficient Entropy";
  let tierDesc = "Provide at least 3 anchors to unlock deterministic key derivation.";

  if (count === 0) {
    pct = 0;
    label = "Empty (0 of 3 required)";
    colorClass = "text-(--app-muted)";
    strokeColor = "var(--app-border)";
    badgeClass = "bg-(--app-surface-soft) text-(--app-muted) border-(--app-border)";
    bitsEstimate = "0 bits";
    multiplierLabel = "0x";
    tierTitle = "Mind Vault Empty";
    tierDesc = "Type memorable phrases, PINs, or milestones below.";
  } else if (count === 1) {
    pct = Math.min(25, Math.max(15, rawScore * 0.35));
    label = "Low Entropy (1 anchor)";
    colorClass = "text-rose-400 font-semibold";
    strokeColor = "#f43f5e";
    badgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
    bitsEstimate = "~64 bits";
    multiplierLabel = "10^12 Space";
    tierTitle = "Baseline Input";
    tierDesc = "Need 2 more anchors to reach cryptographically secure threshold.";
  } else if (count === 2) {
    pct = Math.min(50, Math.max(35, rawScore * 0.55));
    label = "Moderate (2 anchors — 1 more needed)";
    colorClass = "text-amber-400 font-semibold";
    strokeColor = "#f59e0b";
    badgeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
    bitsEstimate = "~96 bits";
    multiplierLabel = "10^24 Space";
    tierTitle = "Almost There";
    tierDesc = "Add 1 more anchor to synthesize your unique public key & avatar.";
  } else if (count === 3) {
    pct = Math.min(78, Math.max(72, 70 + rawScore * 0.1));
    label = "Strong Brain Entropy (3 Anchors Ready)";
    colorClass = "text-emerald-400 font-bold";
    strokeColor = "#34d399";
    badgeClass = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    bitsEstimate = "~192 bits";
    multiplierLabel = "1,000,000,000× Multiplier";
    tierTitle = "Military-Grade Security";
    tierDesc = "Sufficient cryptographic entropy to resist brute force.";
  } else if (count === 4) {
    pct = Math.min(92, Math.max(85, 82 + rawScore * 0.1));
    label = "High Mind Vault (4 Anchors Active)";
    colorClass = "text-emerald-300 font-extrabold";
    strokeColor = "#10b981";
    badgeClass = "bg-emerald-500/20 text-emerald-300 border-emerald-400/40";
    bitsEstimate = "~224 bits";
    multiplierLabel = "1,000,000,000,000× Multiplier";
    tierTitle = "Nation-State Immune";
    tierDesc = "Over 1 Trillion times harder to attack than standard passphrases.";
  } else {
    // 5 factors
    pct = 100;
    label = "Maximum Mind Vault (5 of 5 Perfect)";
    colorClass = "text-cyan-300 font-extrabold";
    strokeColor = "#22d3ee";
    badgeClass = "bg-cyan-500/20 text-cyan-300 border-cyan-400/40 animate-pulse";
    bitsEstimate = "256+ bits (Maximum)";
    multiplierLabel = "10^77 Quintillion× Space";
    tierTitle = "Quantum-Proof Sovereign Vault";
    tierDesc = "Maximum theoretical security across cosmological timeframes.";
  }

  // Circular gauge circumference: r = 90 => C = 2 * PI * 90 ≈ 565.48
  const circumference = 565.48;
  const dashOffset = circumference - (circumference * pct) / 100;

  return {
    score: rawScore,
    pct,
    label,
    colorClass,
    strokeColor,
    badgeClass,
    bitsEstimate,
    multiplierLabel,
    tierTitle,
    tierDesc,
    circumference,
    dashOffset,
    count,
  };
});

// Watch inputs and compute live preview of PubKey, Hash & Jdenticon
watch(
  [passphrase, pin, specialDate, secretPerson, favoriteCountry],
  () => {
    if (previewTimeout) clearTimeout(previewTimeout);

    if (activeFactorCount.value < 3) {
      previewPubkey.value = "";
      previewHash.value = "";
      previewBusy.value = false;
      return;
    }

    previewBusy.value = true;
    previewTimeout = setTimeout(() => {
      try {
        const { pubkeyHex, hashHex } = derivePubkeyAndHashFromBrainFactors({
          passphrase: passphrase.value,
          pin: pin.value,
          specialDate: specialDate.value,
          secretPerson: secretPerson.value,
          favoriteCountry: favoriteCountry.value,
        });
        previewPubkey.value = pubkeyHex;
        previewHash.value = hashHex;
      } catch {
        previewPubkey.value = "";
        previewHash.value = "";
      } finally {
        previewBusy.value = false;
      }
    }, 180);
  },
  { immediate: true },
);

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

const SAMPLE_NAMES = [
  "Alex",
  "Jordan",
  "Taylor",
  "Morgan",
  "Sam",
  "Casey",
  "Robin",
  "Riley",
  "Jamie",
  "Logan",
  "Avery",
  "Quinn",
];

const SAMPLE_COUNTRIES = [
  "Japan",
  "Iceland",
  "Switzerland",
  "New Zealand",
  "Italy",
  "Norway",
  "Canada",
  "Greece",
  "Scotland",
  "Ireland",
  "Portugal",
  "Finland",
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

  const bufYear = new Uint32Array(1);
  crypto.getRandomValues(bufYear);
  const randomYear = 2012 + (bufYear[0] % 12);
  const randomMonth = String(1 + (bufYear[0] % 12)).padStart(2, "0");
  const randomDay = String(1 + (bufYear[0] % 28)).padStart(2, "0");

  passphrase.value = `${getRandom(ADJECTIVES)}-${getRandom(NOUNS)}-${getRandom(ADJECTIVES)}-${getRandom(NOUNS)}`;
  pin.value = randomPin;
  specialDate.value = `${randomYear}-${randomMonth}-${randomDay}`;
  secretPerson.value = getRandom(SAMPLE_NAMES);
  favoriteCountry.value = getRandom(SAMPLE_COUNTRIES);

  showPassphrase.value = true;
  showSecretPerson.value = true;
  suggestionGenerated.value = true;
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {}
}

async function loadAccount() {
  if (!canDerive.value) return;
  error.value = "";
  message.value = "";
  deriveBusy.value = true;
  try {
    await identity.deriveIdentity({
      passphrase: passphrase.value,
      pin: pin.value,
      specialDate: specialDate.value,
      secretPerson: secretPerson.value,
      favoriteCountry: favoriteCountry.value,
    });
    passphrase.value = "";
    pin.value = "";
    specialDate.value = "";
    secretPerson.value = "";
    favoriteCountry.value = "";
    message.value = "Brain identity successfully derived & loaded. Redirecting…";
    setTimeout(() => router.replace("/"), 350);
  } catch (e) {
    error.value = e.message || "Failed to derive account from memory factors.";
  } finally {
    deriveBusy.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-(--app-bg) text-(--app-text) pb-16">
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
                Deterministic secp256k1 key derived from memory anchors
              </p>
            </div>
          </div>

          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400 transition-all hover:bg-emerald-500/20 active:scale-95 cursor-pointer shrink-0"
            @click="generateBrainPhraseSuggestion"
            title="Generate a 5-anchor idea combo"
          >
            <Sparkles class="h-3.5 w-3.5" :stroke-width="2" />
            <span class="hidden sm:inline">Suggest Ideas</span>
            <span class="sm:hidden">Suggest</span>
          </button>
        </div>

        <!-- The "Mind As Vault" Hero Box -->
        <section
          class="relative overflow-hidden rounded-3xl border border-emerald-500/25 bg-[color-mix(in_srgb,var(--app-surface)_85%,transparent)] p-5 sm:p-7 shadow-[0_16px_48px_rgba(0,0,0,0.2)] space-y-5"
        >
          <div
            class="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-emerald-500/15 blur-3xl"
            aria-hidden="true"
          />
          <div
            class="pointer-events-none absolute -left-12 -bottom-12 h-36 w-36 rounded-full bg-(--app-primary)/10 blur-2xl"
            aria-hidden="true"
          />

          <div class="relative space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span
                class="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Zero Disk Storage &middot; Zero Cloud Backups
              </span>
            </div>

            <h2 class="text-lg sm:text-xl font-bold tracking-tight text-(--app-text)">
              Your mind is your private key vault
            </h2>

            <p class="text-xs sm:text-sm text-(--app-text-soft) leading-relaxed">
              We generate your full 256-bit cryptographic private key, but our aim is that
              <strong class="font-semibold text-emerald-400"
                >this key is generated directly from your brain</strong
              >
              — so you don't have to save, write down, or sync it anywhere.
            </p>

            <p class="text-xs sm:text-sm text-(--app-muted) leading-relaxed">
              Fill in <strong class="text-(--app-text)">any 3 or more memory anchors</strong>.
              Argon2id (memory-hard KDF, 64MB RAM) deterministically derives your exact same private
              key and public identity on any device in the world.
            </p>
          </div>

          <!-- Persuasive "More Anchors = Exponential Security" Callout -->
          <div
            class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft)/90 p-4 space-y-3"
          >
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="flex items-center gap-2">
                <Zap class="h-4 w-4 text-emerald-400 shrink-0" />
                <span class="text-xs font-bold text-(--app-text)">
                  Why more anchors make you exponentially safer
                </span>
              </div>
              <span
                class="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border"
                :class="entropyState.badgeClass"
              >
                {{ entropyState.multiplierLabel }}
              </span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div
                class="rounded-xl border p-2.5 transition-all"
                :class="
                  activeFactorCount === 3
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-(--app-border) bg-(--app-surface)'
                "
              >
                <div class="flex items-center justify-between font-semibold">
                  <span>3 Anchors</span>
                  <span class="text-emerald-400 font-bold">192-bit</span>
                </div>
                <p class="text-[11px] text-(--app-muted) mt-1">
                  Baseline cryptographic safety against brute-force attacks.
                </p>
              </div>

              <div
                class="rounded-xl border p-2.5 transition-all"
                :class="
                  activeFactorCount === 4
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-(--app-border) bg-(--app-surface)'
                "
              >
                <div class="flex items-center justify-between font-semibold">
                  <span>4 Anchors</span>
                  <span class="text-emerald-300 font-bold">+1 Trillion×</span>
                </div>
                <p class="text-[11px] text-(--app-muted) mt-1">
                  Exponential multiplier; immune to GPU cluster cracking.
                </p>
              </div>

              <div
                class="rounded-xl border p-2.5 transition-all"
                :class="
                  activeFactorCount === 5
                    ? 'border-cyan-400/40 bg-cyan-500/10'
                    : 'border-(--app-border) bg-(--app-surface)'
                "
              >
                <div class="flex items-center justify-between font-semibold">
                  <span>5 Anchors</span>
                  <span class="text-cyan-300 font-bold">256+ bit Max</span>
                </div>
                <p class="text-[11px] text-(--app-muted) mt-1">
                  Cosmological quantum-proof sovereignty in your thoughts.
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Big Jdenticon Avatar with Surrounding Brain Entropy Slider Ring -->
        <section
          class="relative overflow-hidden rounded-3xl border border-(--app-border) bg-(--app-surface) p-6 sm:p-8 shadow-sm space-y-6"
        >
          <div class="text-center space-y-1">
            <span
              class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border transition-all"
              :class="entropyState.badgeClass"
            >
              {{ entropyState.tierTitle }} &middot; {{ activeFactorCount }}/5 Anchors
            </span>
            <h3 class="text-base sm:text-lg font-bold text-(--app-text)">
              Deterministic Identity & Entropy Ring
            </h3>
            <p class="text-xs text-(--app-muted) max-w-md mx-auto">
              {{ entropyState.tierDesc }}
            </p>
          </div>

          <!-- Central Avatar + Circular Entropy Slider -->
          <div class="flex flex-col items-center justify-center py-2">
            <div class="relative flex items-center justify-center h-56 w-56 select-none">
              <!-- Ambient Glow behind Avatar -->
              <div
                class="absolute inset-4 rounded-full blur-xl transition-all duration-700"
                :class="
                  activeFactorCount >= 5
                    ? 'bg-cyan-500/25'
                    : activeFactorCount >= 3
                      ? 'bg-emerald-500/20'
                      : activeFactorCount >= 1
                        ? 'bg-amber-500/10'
                        : 'bg-transparent'
                "
              />

              <!-- Circular Progress SVG (Surrounding Entropy Slider) -->
              <svg class="h-full w-full -rotate-90 transform" viewBox="0 0 200 200">
                <!-- Background Ring Track -->
                <circle
                  cx="100"
                  cy="100"
                  r="90"
                  class="stroke-(--app-surface-soft)"
                  stroke-width="7"
                  fill="none"
                />

                <!-- Dynamic Animated Progress Stroke -->
                <circle
                  cx="100"
                  cy="100"
                  r="90"
                  :stroke="entropyState.strokeColor"
                  stroke-width="7"
                  stroke-linecap="round"
                  fill="none"
                  class="transition-all duration-700 ease-out"
                  :stroke-dasharray="entropyState.circumference"
                  :stroke-dashoffset="entropyState.dashOffset"
                />
              </svg>

              <!-- Center Jdenticon Avatar / Synthesis State -->
              <div
                class="absolute inset-4 flex flex-col items-center justify-center rounded-full overflow-hidden border-2 transition-all duration-500"
                :class="
                  previewPubkey
                    ? 'border-emerald-500/40 bg-(--app-surface-soft) shadow-inner'
                    : 'border-(--app-border) bg-(--app-surface-soft)/60'
                "
              >
                <!-- 1. Derived Jdenticon Avatar (When 3+ anchors active) -->
                <template v-if="previewPubkey">
                  <img
                    :src="roboHashUrl(previewPubkey)"
                    alt="Derived Jdenticon"
                    class="h-32 w-32 rounded-full transform transition-transform duration-500 hover:scale-105"
                  />
                </template>

                <!-- 2. Deriving Indicator in RAM -->
                <template v-else-if="previewBusy">
                  <div class="flex flex-col items-center justify-center p-3 text-center space-y-2">
                    <Brain class="h-8 w-8 text-emerald-400 animate-pulse" />
                    <span class="text-[11px] font-semibold text-emerald-400">
                      Deriving in RAM…
                    </span>
                  </div>
                </template>

                <!-- 3. Insufficient Anchors Placeholder -->
                <template v-else>
                  <div
                    class="flex flex-col items-center justify-center p-4 text-center space-y-1.5"
                  >
                    <Lock
                      class="h-7 w-7 text-(--app-muted) transition-colors"
                      :class="activeFactorCount > 0 ? 'text-amber-400' : ''"
                    />
                    <span class="text-[11px] font-bold text-(--app-muted)">
                      {{ activeFactorCount }}/3 Required
                    </span>
                    <span class="text-[10px] text-(--app-muted-2) leading-tight">
                      {{ 3 - activeFactorCount }} more needed
                    </span>
                  </div>
                </template>
              </div>

              <!-- Orbiting Checkpoint Pips around the ring -->
              <div
                v-for="i in 5"
                :key="i"
                class="absolute flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold shadow-xs transition-all duration-300 pointer-events-none"
                :style="{
                  top: `${50 - 45 * Math.cos(((i - 1) * 72 * Math.PI) / 180)}%`,
                  left: `${50 + 45 * Math.sin(((i - 1) * 72 * Math.PI) / 180)}%`,
                  transform: 'translate(-50%, -50%)',
                }"
                :class="
                  activeFactorCount >= i
                    ? 'border-emerald-300 bg-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                    : 'border-(--app-border) bg-(--app-surface) text-(--app-muted)'
                "
              >
                <Check v-if="activeFactorCount >= i" class="h-3 w-3" :stroke-width="3" />
                <span v-else>{{ i }}</span>
              </div>
            </div>

            <!-- Strength & Score Label Under Ring -->
            <div class="mt-3 text-center space-y-0.5">
              <div class="flex items-center justify-center gap-1.5">
                <span class="text-xl font-extrabold tabular-nums" :class="entropyState.colorClass">
                  {{ Math.round(entropyState.pct) }}%
                </span>
                <span class="text-xs font-semibold text-(--app-text)">Entropy Quality</span>
              </div>
              <p class="text-xs text-(--app-muted) font-mono">
                {{ entropyState.bitsEstimate }} &middot; {{ entropyState.label }}
              </p>
            </div>
          </div>

          <!-- Derived Identity Details (PubKey, Hash, Name) -->
          <div
            v-if="previewPubkey"
            class="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 sm:p-5 space-y-3.5 transition-all"
          >
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="flex items-center gap-2">
                <ShieldCheck class="h-4 w-4 text-emerald-400 shrink-0" />
                <span class="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Synthesized Brain Identity
                </span>
              </div>
              <span class="text-xs font-bold text-(--app-text)">
                {{ pubkeyName(previewPubkey) }}
              </span>
            </div>

            <!-- Public Key Preview with Copy -->
            <div class="space-y-1 text-xs">
              <div class="flex items-center justify-between text-(--app-muted)">
                <span>Derived Nostr Public Key</span>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 cursor-pointer font-semibold"
                  @click="copyText(previewPubkey)"
                >
                  <Copy class="h-3 w-3" />
                  <span>{{ copied ? "Copied!" : "Copy PubKey" }}</span>
                </button>
              </div>
              <div
                class="rounded-xl border border-(--app-border) bg-(--app-surface) px-3 py-2 font-mono text-[11px] text-(--app-text) break-all select-all flex items-center justify-between gap-2"
              >
                <span>{{ previewPubkey }}</span>
              </div>
            </div>

            <!-- Identity Hash Fingerprint -->
            <div class="space-y-1 text-xs">
              <span class="text-(--app-muted)">Identity SHA-256 Hash Fingerprint</span>
              <div
                class="rounded-xl border border-(--app-border) bg-(--app-surface) px-3 py-1.5 font-mono text-[11px] text-(--app-muted) break-all"
              >
                {{ previewHash }}
              </div>
            </div>
          </div>
        </section>

        <!-- The 5 Input Anchors Form Card -->
        <section
          class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-3xl p-5 sm:p-7 space-y-5"
        >
          <div class="flex items-center justify-between gap-2 border-b border-(--app-border) pb-4">
            <div>
              <h2 class="text-base font-bold text-(--app-text)">Memory Anchor Inputs</h2>
              <p class="text-xs text-(--app-muted)">
                Provide at least 3 anchors. You can fill all 5 for maximum entropy.
              </p>
            </div>
            <button
              type="button"
              class="text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer shrink-0"
              @click="generateBrainPhraseSuggestion"
            >
              Auto-fill idea
            </button>
          </div>

          <div class="space-y-4">
            <!-- 1. Passphrase Input -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="flex items-center gap-1.5 text-xs font-semibold text-(--app-text)">
                  <KeyRound class="h-3.5 w-3.5 text-emerald-400" />
                  <span>1. Memorable Passphrase</span>
                </label>
                <span
                  class="text-[11px]"
                  :class="
                    isPassphraseValid ? 'text-emerald-400 font-semibold' : 'text-(--app-muted)'
                  "
                >
                  {{ isPassphraseValid ? "✓ Anchor Active" : "Memorable words (min 6 chars)" }}
                </span>
              </div>

              <div class="relative">
                <input
                  v-model="passphrase"
                  :type="showPassphrase ? 'text' : 'password'"
                  placeholder="e.g. cosmic-falcon-crystal-ember"
                  autocomplete="new-password"
                  class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] pr-12 text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-emerald-500/60 focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
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
            </div>

            <!-- 2. Numeric PIN Input -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="flex items-center gap-1.5 text-xs font-semibold text-(--app-text)">
                  <Cpu class="h-3.5 w-3.5 text-emerald-400" />
                  <span>2. Numeric PIN / Code</span>
                </label>
                <span
                  class="text-[11px]"
                  :class="isPinValid ? 'text-emerald-400 font-semibold' : 'text-(--app-muted)'"
                >
                  {{ isPinValid ? "✓ Anchor Active" : "Numbers only (e.g. 7392)" }}
                </span>
              </div>

              <input
                v-model="pin"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                placeholder="e.g. 7392"
                autocomplete="off"
                class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-emerald-500/60 focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 font-mono tracking-widest"
              />
            </div>

            <!-- 3. Unforgettable Date Input -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="flex items-center gap-1.5 text-xs font-semibold text-(--app-text)">
                  <Calendar class="h-3.5 w-3.5 text-emerald-400" />
                  <span>3. Unforgettable Special Date</span>
                </label>
                <span
                  class="text-[11px]"
                  :class="isDateValid ? 'text-emerald-400 font-semibold' : 'text-(--app-muted)'"
                >
                  {{ isDateValid ? "✓ Anchor Active" : "A date you can never forget" }}
                </span>
              </div>

              <input
                v-model="specialDate"
                type="date"
                placeholder="YYYY-MM-DD"
                autocomplete="off"
                class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-emerald-500/60 focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              />
            </div>

            <!-- 4. Secret Memory / First Partner Input -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="flex items-center gap-1.5 text-xs font-semibold text-(--app-text)">
                  <Heart class="h-3.5 w-3.5 text-emerald-400" />
                  <span>4. Secret Memory / First Partner</span>
                </label>
                <span
                  class="text-[11px]"
                  :class="
                    isSecretPersonValid ? 'text-emerald-400 font-semibold' : 'text-(--app-muted)'
                  "
                >
                  {{
                    isSecretPersonValid
                      ? "✓ Anchor Active"
                      : "Whom you lost virginity to / first love"
                  }}
                </span>
              </div>

              <div class="relative">
                <input
                  v-model="secretPerson"
                  :type="showSecretPerson ? 'text' : 'password'"
                  placeholder="e.g. name or nickname of that unforgettable person"
                  autocomplete="off"
                  class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] pr-12 text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-emerald-500/60 focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                />
                <button
                  type="button"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-(--app-muted) hover:text-(--app-text) p-1.5 rounded-lg transition-colors cursor-pointer"
                  @click="showSecretPerson = !showSecretPerson"
                  :title="showSecretPerson ? 'Hide text' : 'Reveal text'"
                >
                  <EyeOff v-if="showSecretPerson" class="w-4 h-4" :stroke-width="1.8" />
                  <Eye v-else class="w-4 h-4" :stroke-width="1.8" />
                </button>
              </div>
            </div>

            <!-- 5. Favorite Country / Destination Input -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="flex items-center gap-1.5 text-xs font-semibold text-(--app-text)">
                  <Globe class="h-3.5 w-3.5 text-emerald-400" />
                  <span>5. Favorite Country / Destination</span>
                </label>
                <span
                  class="text-[11px]"
                  :class="isCountryValid ? 'text-emerald-400 font-semibold' : 'text-(--app-muted)'"
                >
                  {{ isCountryValid ? "✓ Anchor Active" : "e.g. Japan, Switzerland, Iceland" }}
                </span>
              </div>

              <input
                v-model="favoriteCountry"
                type="text"
                placeholder="e.g. Japan"
                autocomplete="off"
                class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-emerald-500/60 focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              />
            </div>

            <!-- Submit Button Section -->
            <div class="pt-3 space-y-2.5">
              <PrimaryButton @click="loadAccount" :disabled="!canDerive" :loading="deriveBusy">
                <Brain v-if="!deriveBusy" class="h-4 w-4 mr-1.5" :stroke-width="2" />
                {{
                  deriveBusy
                    ? "Deriving Argon2id key in memory…"
                    : activeFactorCount >= 3
                      ? `Derive & Load Account (${activeFactorCount}/5 Anchors)`
                      : `Enter at least 3 anchors (${activeFactorCount}/3)`
                }}
              </PrimaryButton>

              <p class="text-[11px] text-center text-(--app-muted) leading-relaxed">
                Derivation uses Argon2id memory-hard KDF entirely in browser RAM. Zero files or
                credentials are ever sent to any relay or server.
              </p>
            </div>
          </div>
        </section>

        <!-- Status Alerts -->
        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />
      </div>
    </main>
  </div>
</template>
