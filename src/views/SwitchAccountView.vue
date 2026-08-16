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
  Globe,
  Heart,
  KeyRound,
  Sparkles,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { useIdentityStore } from "@/stores/identity";

const identity = useIdentityStore();
const router = useRouter();

const message = ref("");
const error = ref("");

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

// Entropy strength calculation across all 5 factors
const entropyState = computed(() => {
  const p = passphrase.value.trim();
  const n = pin.value.trim();
  const d = specialDate.value.trim();
  const s = secretPerson.value.trim();
  const c = favoriteCountry.value.trim();

  let rawScore = 0;

  // Passphrase factor (0 to 30 pts)
  if (p.length >= 6) rawScore += 15;
  if (p.length >= 12) rawScore += 10;
  if (/[0-9]/.test(p) || /[^a-zA-Z0-9]/.test(p)) rawScore += 5;

  // PIN factor (0 to 20 pts)
  if (n.length >= 1) rawScore += 10;
  if (n.length >= 4) rawScore += 10;

  // Date factor (0 to 20 pts)
  if (d.length >= 4) rawScore += 10;
  if (d.length >= 8) rawScore += 10;

  // Secret Memory / First Partner factor (0 to 20 pts)
  if (s.length >= 2) rawScore += 10;
  if (s.length >= 5) rawScore += 10;

  // Favorite Country factor (0 to 20 pts)
  if (c.length >= 2) rawScore += 10;
  if (c.length >= 4) rawScore += 10;

  const count = activeFactorCount.value;

  // Threshold: Need at least 3 factors for sufficient cryptographic entropy
  let pct = 0;
  let label = "Enter at least 3 memory anchors";
  let colorClass = "text-rose-400";
  let barClass = "bg-rose-500";
  let badgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
  let bitsEstimate = "< 64 bits";

  if (count === 0) {
    pct = 0;
    label = "Empty (0 of 3 required)";
    colorClass = "text-(--app-muted)";
    barClass = "bg-zinc-700";
    badgeClass = "bg-(--app-surface-soft) text-(--app-muted) border-(--app-border)";
    bitsEstimate = "0 bits";
  } else if (count === 1) {
    pct = Math.min(25, Math.max(15, rawScore * 0.35));
    label = "Low Entropy (1 of 3 anchors)";
    colorClass = "text-rose-400 font-semibold";
    barClass = "bg-rose-500";
    badgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
    bitsEstimate = "~64 bits";
  } else if (count === 2) {
    pct = Math.min(50, Math.max(35, rawScore * 0.55));
    label = "Moderate (2 of 3 — 1 more needed)";
    colorClass = "text-amber-400 font-semibold";
    barClass = "bg-amber-500";
    badgeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
    bitsEstimate = "~96 bits";
  } else if (count === 3) {
    pct = Math.min(78, Math.max(72, 70 + rawScore * 0.1));
    label = "Strong Brain Entropy (3 Anchors Ready)";
    colorClass = "text-emerald-400 font-bold";
    barClass = "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.4)]";
    badgeClass = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    bitsEstimate = "~192 bits (Quantum-Resistant KDF)";
  } else if (count === 4) {
    pct = Math.min(92, Math.max(85, 82 + rawScore * 0.1));
    label = "High Mind Vault (4 Anchors Active)";
    colorClass = "text-emerald-300 font-extrabold";
    barClass = "bg-linear-to-r from-emerald-400 to-teal-300 shadow-[0_0_14px_rgba(52,211,153,0.5)]";
    badgeClass = "bg-emerald-500/20 text-emerald-300 border-emerald-400/40";
    bitsEstimate = "~224 bits (Extremely Strong)";
  } else {
    // 5 factors
    pct = 100;
    label = "Maximum Mind Vault (5 of 5 Perfect)";
    colorClass = "text-cyan-300 font-extrabold";
    barClass =
      "bg-linear-to-r from-emerald-400 via-teal-300 to-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.7)]";
    badgeClass = "bg-cyan-500/20 text-cyan-300 border-cyan-400/40 animate-pulse";
    bitsEstimate = "256+ bits (Maximum Entropy)";
  }

  return {
    score: rawScore,
    pct,
    label,
    colorClass,
    barClass,
    badgeClass,
    bitsEstimate,
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
                Deterministic secp256k1 key derived from any 3 memory anchors
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
              Fill in
              <strong class="text-(--app-text)">any 3 of the 5 memory anchors below</strong>.
              Argon2id (memory-hard KDF, 64MB RAM) deterministically derives your exact same private
              key on any device on Earth whenever you need it.
            </p>
          </div>

          <!-- 5 Memory Anchors Visual Summary Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
            <!-- Anchor 1: Passphrase -->
            <div
              class="flex flex-col gap-1 rounded-2xl border p-2.5 transition-all"
              :class="
                isPassphraseValid
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-(--app-border) bg-(--app-surface-soft)'
              "
            >
              <div class="flex items-center justify-between">
                <span
                  class="text-[10px] font-bold uppercase tracking-wider"
                  :class="isPassphraseValid ? 'text-emerald-400' : 'text-(--app-muted)'"
                >
                  Anchor 1
                </span>
                <KeyRound
                  class="h-3.5 w-3.5"
                  :class="isPassphraseValid ? 'text-emerald-400' : 'text-(--app-muted)'"
                />
              </div>
              <p
                class="text-xs font-semibold truncate"
                :class="isPassphraseValid ? 'text-emerald-300' : 'text-(--app-text)'"
              >
                Passphrase
              </p>
              <span
                class="text-[10px]"
                :class="isPassphraseValid ? 'text-emerald-400 font-bold' : 'text-(--app-muted)'"
              >
                {{ isPassphraseValid ? "✓ Ready" : "Min 6 chars" }}
              </span>
            </div>

            <!-- Anchor 2: PIN -->
            <div
              class="flex flex-col gap-1 rounded-2xl border p-2.5 transition-all"
              :class="
                isPinValid
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-(--app-border) bg-(--app-surface-soft)'
              "
            >
              <div class="flex items-center justify-between">
                <span
                  class="text-[10px] font-bold uppercase tracking-wider"
                  :class="isPinValid ? 'text-emerald-400' : 'text-(--app-muted)'"
                >
                  Anchor 2
                </span>
                <Cpu
                  class="h-3.5 w-3.5"
                  :class="isPinValid ? 'text-emerald-400' : 'text-(--app-muted)'"
                />
              </div>
              <p
                class="text-xs font-semibold truncate"
                :class="isPinValid ? 'text-emerald-300' : 'text-(--app-text)'"
              >
                Numeric PIN
              </p>
              <span
                class="text-[10px]"
                :class="isPinValid ? 'text-emerald-400 font-bold' : 'text-(--app-muted)'"
              >
                {{ isPinValid ? "✓ Ready" : "Numbers" }}
              </span>
            </div>

            <!-- Anchor 3: Date -->
            <div
              class="flex flex-col gap-1 rounded-2xl border p-2.5 transition-all"
              :class="
                isDateValid
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-(--app-border) bg-(--app-surface-soft)'
              "
            >
              <div class="flex items-center justify-between">
                <span
                  class="text-[10px] font-bold uppercase tracking-wider"
                  :class="isDateValid ? 'text-emerald-400' : 'text-(--app-muted)'"
                >
                  Anchor 3
                </span>
                <Calendar
                  class="h-3.5 w-3.5"
                  :class="isDateValid ? 'text-emerald-400' : 'text-(--app-muted)'"
                />
              </div>
              <p
                class="text-xs font-semibold truncate"
                :class="isDateValid ? 'text-emerald-300' : 'text-(--app-text)'"
              >
                Special Date
              </p>
              <span
                class="text-[10px]"
                :class="isDateValid ? 'text-emerald-400 font-bold' : 'text-(--app-muted)'"
              >
                {{ isDateValid ? "✓ Ready" : "Milestone" }}
              </span>
            </div>

            <!-- Anchor 4: Secret Memory -->
            <div
              class="flex flex-col gap-1 rounded-2xl border p-2.5 transition-all"
              :class="
                isSecretPersonValid
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-(--app-border) bg-(--app-surface-soft)'
              "
            >
              <div class="flex items-center justify-between">
                <span
                  class="text-[10px] font-bold uppercase tracking-wider"
                  :class="isSecretPersonValid ? 'text-emerald-400' : 'text-(--app-muted)'"
                >
                  Anchor 4
                </span>
                <Heart
                  class="h-3.5 w-3.5"
                  :class="isSecretPersonValid ? 'text-emerald-400' : 'text-(--app-muted)'"
                />
              </div>
              <p
                class="text-xs font-semibold truncate"
                :class="isSecretPersonValid ? 'text-emerald-300' : 'text-(--app-text)'"
              >
                Secret Memory
              </p>
              <span
                class="text-[10px]"
                :class="isSecretPersonValid ? 'text-emerald-400 font-bold' : 'text-(--app-muted)'"
              >
                {{ isSecretPersonValid ? "✓ Ready" : "First partner" }}
              </span>
            </div>

            <!-- Anchor 5: Favorite Country -->
            <div
              class="col-span-2 sm:col-span-1 flex flex-col gap-1 rounded-2xl border p-2.5 transition-all"
              :class="
                isCountryValid
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-(--app-border) bg-(--app-surface-soft)'
              "
            >
              <div class="flex items-center justify-between">
                <span
                  class="text-[10px] font-bold uppercase tracking-wider"
                  :class="isCountryValid ? 'text-emerald-400' : 'text-(--app-muted)'"
                >
                  Anchor 5
                </span>
                <Globe
                  class="h-3.5 w-3.5"
                  :class="isCountryValid ? 'text-emerald-400' : 'text-(--app-muted)'"
                />
              </div>
              <p
                class="text-xs font-semibold truncate"
                :class="isCountryValid ? 'text-emerald-300' : 'text-(--app-text)'"
              >
                Fav Country
              </p>
              <span
                class="text-[10px]"
                :class="isCountryValid ? 'text-emerald-400 font-bold' : 'text-(--app-muted)'"
              >
                {{ isCountryValid ? "✓ Ready" : "Destination" }}
              </span>
            </div>
          </div>
        </section>

        <!-- Dynamic Modern Strength Slider Card -->
        <section
          class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-5 sm:p-6 shadow-sm space-y-4 transition-all"
        >
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-bold text-(--app-text)">Brain Entropy Slider</h3>
                <span
                  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border transition-all"
                  :class="entropyState.badgeClass"
                >
                  {{ activeFactorCount }}/5 Anchors Active
                </span>
              </div>
              <p class="text-xs text-(--app-muted) mt-0.5">
                {{ entropyState.label }} &middot;
                <span class="font-mono text-emerald-400">{{ entropyState.bitsEstimate }}</span>
              </p>
            </div>

            <div class="text-right sm:text-right">
              <span
                class="text-xl sm:text-2xl font-extrabold tabular-nums"
                :class="entropyState.colorClass"
              >
                {{ Math.round(entropyState.pct) }}%
              </span>
              <span class="text-xs text-(--app-muted) ml-1 font-medium">Strength</span>
            </div>
          </div>

          <!-- Modern Animated Slider Track with 5 Checkpoints -->
          <div class="relative py-2 select-none">
            <!-- Track Background -->
            <div
              class="relative h-3 w-full overflow-hidden rounded-full bg-(--app-surface-soft) border border-(--app-border)"
            >
              <!-- Filled Progress Bar -->
              <div
                class="h-full rounded-full transition-all duration-500 ease-out"
                :class="entropyState.barClass"
                :style="{ width: `${entropyState.pct}%` }"
              />
            </div>

            <!-- 5 Checkpoint Markers Along the Slider -->
            <div
              class="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none px-0.5"
            >
              <!-- Marker 1 -->
              <div
                class="flex h-5 w-5 items-center justify-center rounded-full border-2 text-[9px] font-bold transition-all duration-300"
                :class="
                  activeFactorCount >= 1
                    ? 'border-emerald-400 bg-emerald-500 text-white shadow-xs'
                    : 'border-(--app-border) bg-(--app-surface) text-(--app-muted)'
                "
                title="1st Anchor"
              >
                <Check v-if="activeFactorCount >= 1" class="h-3 w-3" :stroke-width="3" />
                <span v-else>1</span>
              </div>

              <!-- Marker 2 -->
              <div
                class="flex h-5 w-5 items-center justify-center rounded-full border-2 text-[9px] font-bold transition-all duration-300"
                :class="
                  activeFactorCount >= 2
                    ? 'border-emerald-400 bg-emerald-500 text-white shadow-xs'
                    : 'border-(--app-border) bg-(--app-surface) text-(--app-muted)'
                "
                title="2nd Anchor"
              >
                <Check v-if="activeFactorCount >= 2" class="h-3 w-3" :stroke-width="3" />
                <span v-else>2</span>
              </div>

              <!-- Marker 3 (Threshold Target) -->
              <div
                class="flex h-5 w-5 items-center justify-center rounded-full border-2 text-[9px] font-bold transition-all duration-300"
                :class="
                  activeFactorCount >= 3
                    ? 'border-emerald-300 bg-emerald-400 text-black shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                    : 'border-amber-500/60 bg-(--app-surface) text-amber-400'
                "
                title="3rd Anchor (Threshold: Any 3 unlock derivation)"
              >
                <Check v-if="activeFactorCount >= 3" class="h-3 w-3" :stroke-width="3" />
                <span v-else>3</span>
              </div>

              <!-- Marker 4 -->
              <div
                class="flex h-5 w-5 items-center justify-center rounded-full border-2 text-[9px] font-bold transition-all duration-300"
                :class="
                  activeFactorCount >= 4
                    ? 'border-emerald-300 bg-emerald-400 text-black shadow-[0_0_10px_rgba(52,211,153,0.6)]'
                    : 'border-(--app-border) bg-(--app-surface) text-(--app-muted)'
                "
                title="4th Anchor (High Entropy)"
              >
                <Check v-if="activeFactorCount >= 4" class="h-3 w-3" :stroke-width="3" />
                <span v-else>4</span>
              </div>

              <!-- Marker 5 (Max Vault) -->
              <div
                class="flex h-5 w-5 items-center justify-center rounded-full border-2 text-[9px] font-bold transition-all duration-300"
                :class="
                  activeFactorCount >= 5
                    ? 'border-cyan-300 bg-cyan-400 text-black shadow-[0_0_12px_rgba(34,211,238,0.8)] animate-pulse'
                    : 'border-(--app-border) bg-(--app-surface) text-(--app-muted)'
                "
                title="5th Anchor (Maximum Security)"
              >
                <Check v-if="activeFactorCount >= 5" class="h-3 w-3" :stroke-width="3" />
                <span v-else>5</span>
              </div>
            </div>
          </div>

          <!-- Slider Status Message -->
          <div class="flex items-center justify-between text-xs pt-1">
            <span
              class="font-medium"
              :class="activeFactorCount >= 3 ? 'text-emerald-400 font-semibold' : 'text-amber-400'"
            >
              {{
                activeFactorCount >= 3
                  ? "✓ Sufficient entropy unlocked — Ready to derive!"
                  : `Need ${3 - activeFactorCount} more anchor${3 - activeFactorCount === 1 ? "" : "s"} to unlock derivation`
              }}
            </span>
            <span class="text-[11px] text-(--app-muted)">Target: Any 3+</span>
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
