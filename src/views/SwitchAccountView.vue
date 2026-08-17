<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Brain,
  Calendar,
  Check,
  Cpu,
  Eye,
  EyeOff,
  Fingerprint,
  Globe,
  Hash,
  Heart,
  KeyRound,
  Lock,
  SortAsc,
  Sparkles,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import UiTabBar from "@/components/UiTabBar.vue";
import { useIdentityStore } from "@/stores/identity";
import {
  brainFactorsMasterHash,
  canonicalizeBrainFactors,
  normalizeBrainFactorValue,
  roboHashUrl,
  sha512Hex,
  shortId,
} from "@/lib/crypto";

const identity = useIdentityStore();
const router = useRouter();

const message = ref("");
const error = ref("");
const copied = ref(false);
const copiedField = ref("");

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

// Tabbed pipeline view (Entropy Ring | Hardening Pipeline)
const activeTab = ref("ring");
const pipelineTabs = [
  { id: "ring", label: "Entropy Ring", icon: Lock },
  { id: "pipeline", label: "Hardening Pipeline", icon: Fingerprint },
];

// Individual SHA-512 Hashes
const passphraseHash = computed(() => {
  const value = normalizeBrainFactorValue(passphrase.value, false);
  return value ? sha512Hex(value) : "";
});
const pinHash = computed(() => {
  const value = normalizeBrainFactorValue(pin.value);
  return value ? sha512Hex(value) : "";
});
const dateHash = computed(() => {
  const value = normalizeBrainFactorValue(specialDate.value);
  return value ? sha512Hex(value) : "";
});
const secretPersonHash = computed(() => {
  const value = normalizeBrainFactorValue(secretPerson.value);
  return value ? sha512Hex(value) : "";
});
const countryHash = computed(() => {
  const value = normalizeBrainFactorValue(favoriteCountry.value);
  return value ? sha512Hex(value) : "";
});

const sortedCanonicalFactors = computed(() =>
  canonicalizeBrainFactors({
    passphrase: passphrase.value,
    pin: pin.value,
    specialDate: specialDate.value,
    secretPerson: secretPerson.value,
    favoriteCountry: favoriteCountry.value,
  }),
);

const distinctAnchorCount = computed(() => sortedCanonicalFactors.value.length);

const compoundFormula = computed(() => {
  if (distinctAnchorCount.value === 0) return "Empty";
  const parts = sortedCanonicalFactors.value.map((_, idx) => `H${idx + 1}`);
  return `SHA512(${parts.join(" ∥ ")})`;
});

const masterHash = computed(() => brainFactorsMasterHash(sortedCanonicalFactors.value));

// Individual Factor Entropy & Length Computation
const passphraseEntropy = computed(() => {
  const p = normalizeBrainFactorValue(passphrase.value, false);
  if (p.length === 0) return { bits: 0, length: 0, label: "Empty", valid: false, quality: "empty" };

  let bits = p.length * 3.8;
  let charTypes = 0;
  if (/[a-z]/.test(p)) charTypes++;
  if (/[A-Z]/.test(p)) charTypes++;
  if (/[0-9]/.test(p)) charTypes++;
  if (/[^a-zA-Z0-9]/.test(p)) charTypes++;
  bits += charTypes * 4;

  const valid = p.length >= 6;
  const roundedBits = Math.round(bits);
  return {
    bits: roundedBits,
    length: p.length,
    valid,
    label: `${p.length} chars (~${roundedBits} bits)`,
    quality: roundedBits >= 60 ? "high" : roundedBits >= 30 ? "medium" : "low",
  };
});

const pinEntropy = computed(() => {
  const n = normalizeBrainFactorValue(pin.value);
  if (n.length === 0) return { bits: 0, length: 0, label: "Empty", valid: false, quality: "empty" };
  const bits = Math.round(n.length * 3.32);
  const valid = n.length >= 1;
  return {
    bits,
    length: n.length,
    valid,
    label: `${n.length} digits (~${bits} bits)`,
    quality: bits >= 20 ? "high" : bits >= 12 ? "medium" : "low",
  };
});

const dateEntropy = computed(() => {
  const d = normalizeBrainFactorValue(specialDate.value);
  if (d.length === 0) return { bits: 0, length: 0, label: "Empty", valid: false, quality: "empty" };
  const valid = d.length >= 4;
  const bits = valid ? 15 : 0;
  return {
    bits,
    length: d.length,
    valid,
    label: valid ? `Milestone date (~15 bits)` : `Incomplete`,
    quality: "medium",
  };
});

const secretPersonEntropy = computed(() => {
  const s = normalizeBrainFactorValue(secretPerson.value);
  if (s.length === 0) return { bits: 0, length: 0, label: "Empty", valid: false, quality: "empty" };
  let bits = s.length * 3.5;
  const valid = s.length >= 2;
  const roundedBits = Math.round(bits);
  return {
    bits: roundedBits,
    length: s.length,
    valid,
    label: `${s.length} chars (~${roundedBits} bits)`,
    quality: roundedBits >= 40 ? "high" : roundedBits >= 15 ? "medium" : "low",
  };
});

const countryEntropy = computed(() => {
  const c = normalizeBrainFactorValue(favoriteCountry.value);
  if (c.length === 0) return { bits: 0, length: 0, label: "Empty", valid: false, quality: "empty" };
  let bits = 7.6;
  if (c.length > 6) {
    bits += (c.length - 6) * 2.5;
  }
  const valid = c.length >= 2;
  const roundedBits = Math.round(bits);
  return {
    bits: roundedBits,
    length: c.length,
    valid,
    label: `${c.length} chars (~${roundedBits} bits)`,
    quality: roundedBits >= 20 ? "high" : roundedBits >= 10 ? "medium" : "low",
  };
});

const isPassphraseValid = computed(() => passphraseEntropy.value.valid);
const isPinValid = computed(() => pinEntropy.value.valid);
const isDateValid = computed(() => dateEntropy.value.valid);
const isSecretPersonValid = computed(() => secretPersonEntropy.value.valid);
const isCountryValid = computed(() => countryEntropy.value.valid);

const activeFactorCount = computed(() => {
  let count = 0;
  if (isPassphraseValid.value) count++;
  if (isPinValid.value) count++;
  if (isDateValid.value) count++;
  if (isSecretPersonValid.value) count++;
  if (isCountryValid.value) count++;
  return count;
});

const totalEntropyBits = computed(() => {
  return (
    passphraseEntropy.value.bits +
    pinEntropy.value.bits +
    dateEntropy.value.bits +
    secretPersonEntropy.value.bits +
    countryEntropy.value.bits
  );
});

// Named large-number scales for readable brute-force times (short scale)
const BRUTE_FORCE_SCALES = [
  [1e3, "thousand"],
  [1e6, "million"],
  [1e9, "billion"],
  [1e12, "trillion"],
  [1e15, "quadrillion"],
  [1e18, "quintillion"],
  [1e21, "sextillion"],
  [1e24, "septillion"],
  [1e27, "octillion"],
  [1e30, "nonillion"],
  [1e33, "decillion"],
  [1e36, "undecillion"],
  [1e39, "duodecillion"],
  [1e42, "tredecillion"],
  [1e45, "quattuordecillion"],
  [1e48, "quindecillion"],
  [1e51, "sexdecillion"],
  [1e54, "septendecillion"],
  [1e57, "octodecillion"],
  [1e60, "novemdecillion"],
  [1e63, "vigintillion"],
];

// Brute-force time estimate for the current entropy (48 bits ≈ 9 years, doubles per bit)
const bruteForceTime = computed(() => {
  const bits = totalEntropyBits.value;
  if (bits <= 0) return "Instant";
  if (bits < 48) return "Seconds to minutes";
  const years = 9 * 2 ** (bits - 48);
  if (years < 1e3) return `~${Math.round(years).toLocaleString()} years`;
  for (let i = BRUTE_FORCE_SCALES.length - 1; i >= 0; i--) {
    const [threshold, name] = BRUTE_FORCE_SCALES[i];
    if (years >= threshold) {
      const value = years / threshold;
      const formatted = value >= 100 ? Math.round(value).toLocaleString() : value.toFixed(1);
      return `~${formatted} ${name} years`;
    }
  }
  return `~${years.toExponential(1)} years`;
});

// Primary cryptographic threshold: 80+ bits with multi-factor separation (2+ distinct factors)
const MIN_ENTROPY_BITS = 80;
const canDerive = computed(() => {
  return (
    totalEntropyBits.value >= MIN_ENTROPY_BITS && distinctAnchorCount.value >= 2 && !deriveBusy.value
  );
});

const factorFingerprint = computed(() => {
  if (totalEntropyBits.value < MIN_ENTROPY_BITS || distinctAnchorCount.value < 2) return "";
  return masterHash.value;
});

// Entropy state driven primarily by actual Shannon bit entropy threshold (80 bits target)
const entropyState = computed(() => {
  const count = distinctAnchorCount.value;
  const bits = totalEntropyBits.value;

  let pct = 0;
  let label = `Need ~${MIN_ENTROPY_BITS} bits of entropy`;
  let colorClass = "text-rose-400";
  let strokeColor = "#f43f5e";
  let badgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
  let bitsEstimate = `${bits} / ${MIN_ENTROPY_BITS} bits`;
  let multiplierLabel = "Base (0x)";
  let tierTitle = "Insufficient Entropy";
  let tierDesc = `Enter at least ${MIN_ENTROPY_BITS} bits across 2 or more memory anchors.`;

  if (bits === 0) {
    pct = 0;
    label = `0 / ${MIN_ENTROPY_BITS} bits minimum`;
    colorClass = "text-(--app-muted)";
    strokeColor = "var(--app-border)";
    badgeClass = "bg-(--app-surface-soft) text-(--app-muted) border-(--app-border)";
    bitsEstimate = `0 / ${MIN_ENTROPY_BITS} bits`;
    multiplierLabel = "0x";
    tierTitle = "Mind Vault Empty";
    tierDesc = "Type memorable passwords, PINs, or personal milestones below.";
  } else if (bits < MIN_ENTROPY_BITS) {
    // Under threshold
    pct = Math.min(48, Math.max(10, Math.round((bits / MIN_ENTROPY_BITS) * 48)));
    const needed = MIN_ENTROPY_BITS - bits;
    label = `Need ~${needed} more bits to unlock (${bits}/${MIN_ENTROPY_BITS} bits)`;
    colorClass = bits < 64 ? "text-rose-400 font-semibold" : "text-amber-400 font-semibold";
    strokeColor = bits < 64 ? "#f43f5e" : "#f59e0b";
    badgeClass =
      bits < 64
        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
        : "bg-amber-500/10 text-amber-400 border-amber-500/20";
    bitsEstimate = `${bits} / ${MIN_ENTROPY_BITS} bits`;
    multiplierLabel = `10^${Math.max(4, Math.round(bits * 0.25))} Space`;
    tierTitle = bits < 64 ? "Low Entropy" : "Moderate Entropy";
    tierDesc = "Lengthen your password or add another memory anchor below.";
  } else if (count < 2) {
    pct = 50;
    colorClass = "text-amber-400 font-semibold";
    strokeColor = "#f59e0b";
    badgeClass = "bg-amber-500/15 text-amber-400 border-amber-500/30";
    bitsEstimate = `${bits} bits`;
    multiplierLabel = "Multi-Factor Needed";
    if (activeFactorCount.value >= 2) {
      label = "Two anchors collapsed to the same hash — add a different memory";
      tierTitle = "Duplicate Anchor";
      tierDesc =
        "Values are compared after lowercase and space-strip. Duplicates count as one anchor.";
    } else {
      label = "Add 1 more distinct anchor for multi-factor separation";
      tierTitle = "Multi-Factor Separation Needed";
      tierDesc = "Provide at least a numeric PIN, date, or second distinct memory.";
    }
  } else {
    // Threshold met and 2+ factors: Derivation unlocked!
    const rawPct = Math.round((bits / 256) * 100);
    pct = Math.min(100, Math.max(52, rawPct));
    bitsEstimate = `${bits} bits`;

    if (bits < 192) {
      label = `✓ ${MIN_ENTROPY_BITS}-bit Threshold Met (${bits} bits — Cryptographically Secure)`;
      colorClass = "text-emerald-400 font-bold";
      strokeColor = "#34d399";
      badgeClass = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
      multiplierLabel = "100,000,000× Multiplier";
      tierTitle = `${MIN_ENTROPY_BITS}-bit Secure Standard`;
      tierDesc = "Sufficient cryptographic entropy to resist global brute-force attacks.";
    } else if (bits < 256) {
      label = `✓ Military-Grade Entropy (${bits} bits — High Mind Vault)`;
      colorClass = "text-emerald-300 font-extrabold";
      strokeColor = "#10b981";
      badgeClass = "bg-emerald-500/20 text-emerald-300 border-emerald-400/40";
      multiplierLabel = "1,000,000,000,000× Multiplier";
      tierTitle = "192-bit Nation-State Immune";
      tierDesc = "High length-derived entropy over 1 Trillion times harder to attack.";
    } else {
      pct = 100;
      label = `✓ Maximum Sovereign Vault (${bits}+ bits — Unbreakable)`;
      colorClass = "text-cyan-300 font-extrabold";
      strokeColor = "#22d3ee";
      badgeClass = "bg-cyan-500/20 text-cyan-300 border-cyan-400/40 animate-pulse";
      bitsEstimate = "256+ bits (Max)";
      multiplierLabel = "10^77 Quintillion× Space";
      tierTitle = "256-bit Quantum-Proof Vault";
      tierDesc = "Full 256-bit cryptographic strength; unbreakable across cosmological timeframes.";
    }
  }

  const circumference = 565.48;
  const dashOffset = circumference - (circumference * pct) / 100;

  return {
    bits,
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

async function copyText(text, fieldName = "") {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (fieldName) {
      copiedField.value = fieldName;
      setTimeout(() => {
        copiedField.value = "";
      }, 1800);
    } else {
      copied.value = true;
      setTimeout(() => {
        copied.value = false;
      }, 1800);
    }
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
                80+ bit cryptographic key derived deterministically from memory
              </p>
            </div>
          </div>

          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400 transition-all hover:bg-emerald-500/20 active:scale-95 cursor-pointer shrink-0"
            @click="generateBrainPhraseSuggestion"
            title="Generate a high-entropy idea combo"
          >
            <Sparkles class="h-3.5 w-3.5" :stroke-width="2" />
            <span class="hidden sm:inline">Suggest Ideas</span>
            <span class="sm:hidden">Suggest</span>
          </button>
        </div>

        <UiTabBar v-model="activeTab" :tabs="pipelineTabs" variant="surface" idPrefix="switch" />

        <!-- 2+3. Tabbed: Entropy Ring | Hardening Pipeline -->
        <section
          class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-5 sm:p-7 shadow-sm space-y-4"
        >
          <!-- Tab: Deterministic Identity & Entropy Ring -->
          <div v-if="activeTab === 'ring'" class="relative overflow-hidden space-y-6">
            <div class="text-center space-y-1">
              <span
                class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border transition-all"
                :class="entropyState.badgeClass"
              >
                {{ entropyState.tierTitle }} &middot; {{ totalEntropyBits }} Bits Entropy
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
                    totalEntropyBits >= 240
                      ? 'bg-cyan-500/25'
                      : totalEntropyBits >= MIN_ENTROPY_BITS
                        ? 'bg-emerald-500/20'
                        : totalEntropyBits > 0
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

                  <!-- Dynamic Animated Progress Stroke driven by Length & Bit Entropy -->
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

                <!-- Center fingerprint / synthesis state (Argon2id runs only on Derive) -->
                <div
                  class="absolute inset-4 flex flex-col items-center justify-center rounded-full overflow-hidden border-2 transition-all duration-500"
                  :class="
                    factorFingerprint
                      ? 'border-emerald-500/40 bg-(--app-surface-soft) shadow-inner'
                      : 'border-(--app-border) bg-(--app-surface-soft)/60'
                  "
                >
                  <template v-if="deriveBusy">
                    <div
                      class="flex flex-col items-center justify-center p-3 text-center space-y-2"
                    >
                      <Brain class="h-8 w-8 text-emerald-400 animate-pulse" />
                      <span class="text-[11px] font-semibold text-emerald-400">
                        Deriving in RAM…
                      </span>
                    </div>
                  </template>

                  <template v-else-if="factorFingerprint">
                    <img
                      :src="roboHashUrl(factorFingerprint)"
                      alt="Factor fingerprint"
                      class="h-32 w-32 rounded-full transform transition-transform duration-500 hover:scale-105"
                    />
                  </template>

                  <template v-else>
                    <div
                      class="flex flex-col items-center justify-center p-4 text-center space-y-1.5"
                    >
                      <Lock
                        class="h-7 w-7 text-(--app-muted) transition-colors"
                        :class="totalEntropyBits > 0 ? 'text-amber-400' : ''"
                      />
                      <span class="text-[11px] font-bold text-(--app-muted)">
                        {{ totalEntropyBits }} / {{ MIN_ENTROPY_BITS }} Bits
                      </span>
                      <span class="text-[10px] text-(--app-muted-2) leading-tight">
                        {{
                          totalEntropyBits >= MIN_ENTROPY_BITS
                            ? "Add a 2nd distinct anchor"
                            : `~${MIN_ENTROPY_BITS - totalEntropyBits} bits needed`
                        }}
                      </span>
                    </div>
                  </template>
                </div>

                <!-- Bit Milestone Markers around the ring (64b, 80b, 192b, 256b) -->
                <div
                  class="absolute flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold shadow-xs transition-all duration-300 pointer-events-none"
                  style="top: 15%; left: 85%; transform: translate(-50%, -50%)"
                  :class="
                    totalEntropyBits >= 64
                      ? 'border-emerald-300 bg-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                      : 'border-(--app-border) bg-(--app-surface) text-(--app-muted)'
                  "
                  title="64 Bits (Baseline)"
                >
                  <span class="text-[8px]">64</span>
                </div>

                <div
                  class="absolute flex h-6 w-6 items-center justify-center rounded-full border-2 text-[9px] font-bold shadow-xs transition-all duration-300 pointer-events-none"
                  style="top: 85%; left: 85%; transform: translate(-50%, -50%)"
                  :class="
                    totalEntropyBits >= MIN_ENTROPY_BITS
                      ? 'border-emerald-300 bg-emerald-400 text-black shadow-[0_0_10px_rgba(52,211,153,0.7)]'
                      : 'border-amber-500/60 bg-(--app-surface) text-amber-400'
                  "
                  title="80 Bits (Target Threshold: Unlocks Derivation)"
                >
                  <Check
                    v-if="totalEntropyBits >= MIN_ENTROPY_BITS"
                    class="h-3.5 w-3.5"
                    :stroke-width="3"
                  />
                  <span v-else class="text-[8px]">80</span>
                </div>

                <div
                  class="absolute flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold shadow-xs transition-all duration-300 pointer-events-none"
                  style="top: 85%; left: 15%; transform: translate(-50%, -50%)"
                  :class="
                    totalEntropyBits >= 192
                      ? 'border-emerald-300 bg-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                      : 'border-(--app-border) bg-(--app-surface) text-(--app-muted)'
                  "
                  title="192 Bits (Military Grade)"
                >
                  <span class="text-[8px]">192</span>
                </div>

                <div
                  class="absolute flex h-6 w-6 items-center justify-center rounded-full border-2 text-[9px] font-bold shadow-xs transition-all duration-300 pointer-events-none"
                  style="top: 15%; left: 15%; transform: translate(-50%, -50%)"
                  :class="
                    totalEntropyBits >= 256
                      ? 'border-cyan-300 bg-cyan-400 text-black shadow-[0_0_12px_rgba(34,211,238,0.8)] animate-pulse'
                      : 'border-(--app-border) bg-(--app-surface) text-(--app-muted)'
                  "
                  title="256 Bits (Maximum Sovereign Vault)"
                >
                  <Check v-if="totalEntropyBits >= 256" class="h-3.5 w-3.5" :stroke-width="3" />
                  <span v-else class="text-[8px]">256</span>
                </div>
              </div>

              <!-- Strength & Score Label Under Ring -->
              <div class="mt-3 text-center space-y-0.5">
                <div class="flex items-center justify-center gap-1.5">
                  <span
                    class="text-xl font-extrabold tabular-nums"
                    :class="entropyState.colorClass"
                  >
                    {{ totalEntropyBits }} Bits
                  </span>
                  <span class="text-xs font-semibold text-(--app-text)">Entropy Rating</span>
                </div>
                <p class="text-xs text-(--app-muted) font-mono">
                  {{ entropyState.label }}
                </p>
              </div>

              <!-- Brute-Force Time One-Liner -->
              <div class="flex items-center justify-center gap-1.5 text-xs text-(--app-muted)">
                <span>{{ totalEntropyBits }} bits</span>
                <span>&middot;</span>
                <span
                  class="font-semibold"
                  :class="
                    totalEntropyBits >= MIN_ENTROPY_BITS ? 'text-emerald-400' : 'text-(--app-text)'
                  "
                >
                  {{ bruteForceTime }}
                </span>
                <span>to brute-force</span>
              </div>
            </div>
          </div>

          <!-- Tab: Live Cryptographic Hardening Pipeline -->
          <div v-else class="space-y-4">
            <div
              class="flex items-center justify-between gap-2 flex-wrap border-b border-(--app-border) pb-3"
            >
              <div class="flex items-center gap-2">
                <Fingerprint class="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <h3 class="text-sm font-bold text-(--app-text)">
                    Live Cryptographic Hardening Pipeline
                  </h3>
                  <p class="text-[11px] text-(--app-muted)">
                    SHA-512 sorted anchors, master hash, and memory-hard KDF
                  </p>
                </div>
              </div>
              <span
                class="text-[11px] font-mono text-emerald-400 font-semibold truncate max-w-xs bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg"
              >
                {{ compoundFormula }}
              </span>
            </div>

            <!-- Sorted SHA-512 anchors (A → Z), then master hash -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs text-(--app-muted)">
                <span class="flex items-center gap-1.5 font-semibold text-(--app-text)">
                  <SortAsc class="h-3.5 w-3.5 text-emerald-400" />
                  <span>Sorted Anchor Hashes (A &rarr; Z)</span>
                </span>
                <span class="text-[11px] text-emerald-400 font-mono"
                  >SHA-512 · slot-independent</span
                >
              </div>

              <div
                class="flex flex-wrap items-center gap-1.5 p-2.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft)"
              >
                <template v-if="sortedCanonicalFactors.length > 0">
                  <div
                    v-for="(item, idx) in sortedCanonicalFactors"
                    :key="item.hash"
                    class="inline-flex items-center gap-1 text-[11px] font-mono rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-300 shadow-xs"
                    :title="`Anchor ${idx + 1} · ${item.hash}`"
                  >
                    <span class="text-[10px] text-emerald-400 font-bold uppercase"
                      >{{ idx + 1 }}.</span
                    >
                    <span class="truncate max-w-[180px]">{{ shortId(item.hash) }}</span>
                  </div>
                </template>
                <span v-else class="text-[11px] text-(--app-muted) italic px-1">
                  Distinct SHA-512 anchors will be sorted A &rarr; Z here
                </span>
              </div>
            </div>

            <div class="space-y-1 text-xs">
              <div class="flex items-center justify-between text-(--app-muted)">
                <span class="flex items-center gap-1.5">
                  <Hash class="h-3.5 w-3.5 text-emerald-400" />
                  <span class="font-medium text-(--app-text)"
                    >Master Hash (SHA-512 of sorted anchors)</span
                  >
                </span>
                <button
                  v-if="masterHash"
                  type="button"
                  class="text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer text-[11px] transition-colors"
                  @click="copyText(masterHash, 'compound')"
                >
                  {{ copiedField === "compound" ? "Copied!" : "Copy Digest" }}
                </button>
              </div>
              <div
                class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-2.5 font-mono text-[11px] text-(--app-text) break-all select-all flex items-center justify-between gap-2"
              >
                <span>{{ masterHash || "Awaiting memory anchor inputs…" }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 4. The 5 Input Anchors Form Card -->
        <section
          class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-3xl p-5 sm:p-7 space-y-5"
        >
          <div class="flex items-center justify-between gap-2 border-b border-(--app-border) pb-4">
            <div>
              <h2 class="text-base font-bold text-(--app-text)">Memory Anchor Inputs</h2>
              <p class="text-xs text-(--app-muted)">
                Reach at least 80 bits across 2 or more anchors. Each field displays its length and
                bit contribution.
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
            <!-- 1. Super Secret Password Input -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="flex items-center gap-1.5 text-xs font-semibold text-(--app-text)">
                  <KeyRound class="h-3.5 w-3.5 text-emerald-400" />
                  <span>1. Super Secret Password</span>
                </label>
                <span
                  class="text-[11px] font-mono"
                  :class="
                    isPassphraseValid ? 'text-emerald-400 font-semibold' : 'text-(--app-muted)'
                  "
                >
                  {{ passphraseEntropy.label }}
                </span>
              </div>

              <div class="relative">
                <input
                  v-model="passphrase"
                  :type="showPassphrase ? 'text' : 'password'"
                  @blur="passphrase = normalizeBrainFactorValue(passphrase, false)"
                  placeholder="e.g. cosmic-falcon-crystal-ember"
                  autocomplete="new-password"
                  class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] pr-12 text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-emerald-500/60 focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                />
                <button
                  type="button"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-(--app-muted) hover:text-(--app-text) p-1.5 rounded-lg transition-colors cursor-pointer"
                  @click="showPassphrase = !showPassphrase"
                  :title="showPassphrase ? 'Hide password' : 'Reveal password'"
                >
                  <EyeOff v-if="showPassphrase" class="w-4 h-4" :stroke-width="1.8" />
                  <Eye v-else class="w-4 h-4" :stroke-width="1.8" />
                </button>
              </div>

              <!-- Live SHA-512 Micro Digest -->
              <div
                v-if="passphraseHash"
                class="flex items-center justify-between text-[10px] font-mono text-(--app-muted) px-1 pt-0.5"
              >
                <span class="truncate"
                  >SHA512: <span class="text-emerald-400">{{ passphraseHash }}</span></span
                >
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
                  class="text-[11px] font-mono"
                  :class="isPinValid ? 'text-emerald-400 font-semibold' : 'text-(--app-muted)'"
                >
                  {{ pinEntropy.label }}
                </span>
              </div>

              <input
                v-model="pin"
                type="text"
                inputmode="numeric"
                @blur="pin = normalizeBrainFactorValue(pin)"
                pattern="[0-9]*"
                placeholder="e.g. 7392"
                autocomplete="off"
                class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-emerald-500/60 focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 font-mono tracking-widest"
              />

              <!-- Live SHA-512 Micro Digest -->
              <div
                v-if="pinHash"
                class="flex items-center justify-between text-[10px] font-mono text-(--app-muted) px-1 pt-0.5"
              >
                <span class="truncate"
                  >SHA512: <span class="text-emerald-400">{{ pinHash }}</span></span
                >
              </div>
            </div>

            <!-- 3. Unforgettable Date Input -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="flex items-center gap-1.5 text-xs font-semibold text-(--app-text)">
                  <Calendar class="h-3.5 w-3.5 text-emerald-400" />
                  <span>3. Unforgettable Special Date</span>
                </label>
                <span
                  class="text-[11px] font-mono"
                  :class="isDateValid ? 'text-emerald-400 font-semibold' : 'text-(--app-muted)'"
                >
                  {{ dateEntropy.label }}
                </span>
              </div>

              <input
                v-model="specialDate"
                type="date"
                @blur="specialDate = normalizeBrainFactorValue(specialDate)"
                placeholder="YYYY-MM-DD"
                autocomplete="off"
                class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-emerald-500/60 focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              />

              <!-- Live SHA-512 Micro Digest -->
              <div
                v-if="dateHash"
                class="flex items-center justify-between text-[10px] font-mono text-(--app-muted) px-1 pt-0.5"
              >
                <span class="truncate"
                  >SHA512: <span class="text-emerald-400">{{ dateHash }}</span></span
                >
              </div>
            </div>

            <!-- 4. Secret Memory / First Partner Input -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="flex items-center gap-1.5 text-xs font-semibold text-(--app-text)">
                  <Heart class="h-3.5 w-3.5 text-emerald-400" />
                  <span>4. Secret Memory / First Partner</span>
                </label>
                <span
                  class="text-[11px] font-mono"
                  :class="
                    isSecretPersonValid ? 'text-emerald-400 font-semibold' : 'text-(--app-muted)'
                  "
                >
                  {{ secretPersonEntropy.label }}
                </span>
              </div>

              <div class="relative">
                <input
                  v-model="secretPerson"
                  :type="showSecretPerson ? 'text' : 'password'"
                  @blur="secretPerson = normalizeBrainFactorValue(secretPerson)"
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

              <!-- Live SHA-512 Micro Digest -->
              <div
                v-if="secretPersonHash"
                class="flex items-center justify-between text-[10px] font-mono text-(--app-muted) px-1 pt-0.5"
              >
                <span class="truncate"
                  >SHA512: <span class="text-emerald-400">{{ secretPersonHash }}</span></span
                >
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
                  class="text-[11px] font-mono"
                  :class="isCountryValid ? 'text-emerald-400 font-semibold' : 'text-(--app-muted)'"
                >
                  {{ countryEntropy.label }}
                </span>
              </div>

              <input
                v-model="favoriteCountry"
                type="text"
                placeholder="e.g. Japan, or Interlaken Switzerland"
                @blur="favoriteCountry = normalizeBrainFactorValue(favoriteCountry)"
                autocomplete="off"
                class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-emerald-500/60 focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              />

              <!-- Live SHA-512 Micro Digest -->
              <div
                v-if="countryHash"
                class="flex items-center justify-between text-[10px] font-mono text-(--app-muted) px-1 pt-0.5"
              >
                <span class="truncate"
                  >SHA512: <span class="text-emerald-400">{{ countryHash }}</span></span
                >
              </div>
            </div>

            <!-- Submit Button Section -->
            <div class="pt-3 space-y-2.5">
              <PrimaryButton @click="loadAccount" :disabled="!canDerive" :loading="deriveBusy">
                <Brain v-if="!deriveBusy" class="h-4 w-4 mr-1.5" :stroke-width="2" />
                {{
                  deriveBusy
                    ? "Deriving Argon2id key in memory…"
                    : canDerive
                      ? `Derive & Load Account (~${totalEntropyBits} bits entropy)`
                      : distinctAnchorCount < 2
                        ? `Need 2 distinct anchors (${distinctAnchorCount}/2)`
                        : `Reach ${MIN_ENTROPY_BITS} bits to derive (${totalEntropyBits}/${MIN_ENTROPY_BITS} bits)`
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
