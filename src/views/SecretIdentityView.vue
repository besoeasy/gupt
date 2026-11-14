<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ChevronLeft, CloudOff, KeyRound, RefreshCcw, ShieldCheck } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { useIdentityStore } from "@/stores/identity";
import { resumeTarget } from "@/router";
import { PIN_MIN_CHARS, secretPinEntropyBits } from "@/lib/crypto";

const identity = useIdentityStore();
const route = useRoute();
const router = useRouter();

const paste = ref("");
const pin = ref("");
const message = ref("");
const error = ref("");
const busy = ref(false);

const pinValid = computed(() => pin.value.trim().length >= PIN_MIN_CHARS);
const pinBits = computed(() => secretPinEntropyBits(pin.value));
const canCreate = computed(() => !busy.value && paste.value.trim().length > 0 && pinValid.value);

// Alphabet-aware entropy estimate from crypto.js, bucketed for a meter.
const pinStrength = computed(() => {
  if (!pin.value.trim()) return null;
  const bits = pinBits.value;
  if (bits < 35) return { label: "Weak", tone: 1 };
  if (bits < 60) return { label: "Fair", tone: 2 };
  if (bits < 90) return { label: "Strong", tone: 3 };
  return { label: "Excellent", tone: 4 };
});

const howItWorks = [
  {
    icon: ShieldCheck,
    text: "Secret and PIN are hashed once with Argon2id — that digest is your identity.",
  },
  {
    icon: RefreshCcw,
    text: "The same pair derives the same account on every device. Nothing to store, sync or export.",
  },
  {
    icon: CloudOff,
    text: "Neither value is ever uploaded. Forget either one and the account is gone — that is the point.",
  },
];

async function create() {
  if (!canCreate.value) return;
  error.value = "";
  message.value = "";
  busy.value = true;
  try {
    await identity.createFromSecret(paste.value, pin.value);
    paste.value = "";
    pin.value = "";
    message.value = "Identity created. Redirecting…";
    setTimeout(() => router.replace(resumeTarget(route.query)), 350);
  } catch (e) {
    error.value = e.message || "Failed to create identity.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <!-- Accent matches the "Paste a secret" card on /welcome, so the page you
       land on keeps the hue of the option you picked. -->
  <div
    class="relative min-h-full w-full overflow-y-auto bg-(--app-bg) text-(--app-text) [--accent:#fbbf24]"
  >
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_srgb,var(--app-text)_9%,transparent),transparent)]"
      aria-hidden="true"
    />

    <main class="relative mx-auto w-full max-w-2xl px-4 pt-8 pb-24 sm:pt-12">
      <RouterLink
        to="/welcome"
        class="app-list-item inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 -ml-2 text-xs font-medium text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
      >
        <ChevronLeft class="size-3.5" aria-hidden="true" />
        All sign-in methods
      </RouterLink>

      <header class="app-list-item mt-8 flex flex-col items-center text-center [--app-item-delay:40ms]">
        <div
          class="flex size-14 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
        >
          <KeyRound class="size-7 text-[var(--accent)]" :stroke-width="1.7" aria-hidden="true" />
        </div>
        <h1 class="mt-5 text-3xl font-semibold tracking-tighter sm:text-4xl">Paste a secret</h1>
        <p class="mt-3 max-w-md text-sm leading-relaxed text-(--app-muted)">
          Any text you can remember on any device — a passphrase, a sentence, a seed phrase.
        </p>
      </header>

      <p
        v-if="identity.isReady"
        class="app-list-item mt-6 rounded-xl border border-(--app-border) bg-(--app-surface) px-4 py-3 text-xs leading-relaxed text-(--app-muted) [--app-item-delay:70ms]"
      >
        This browser already holds
        <span class="font-medium text-(--app-text-soft)">
          {{ identity.profileName || identity.fingerprint || "an account" }} </span
        >. A different secret moves it to a new identity and clears that account's cached data.
      </p>

      <section
        class="app-list-item mt-6 rounded-2xl border border-(--app-border) bg-(--app-surface) p-5 shadow-sm [--app-item-delay:100ms] sm:p-7"
      >
        <!-- Secret -->
        <div class="space-y-2">
          <label for="secret-paste" class="block text-xs font-semibold text-(--app-text)">
            Secret
          </label>
          <textarea
            id="secret-paste"
            v-model="paste"
            rows="6"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            placeholder="e.g. the passphrase you use everywhere…"
            class="block w-full resize-y rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] font-mono text-[0.85rem] leading-[1.5] text-(--app-text) transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--accent)_60%,transparent)] focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
          />
          <div class="flex items-center justify-between text-[11px] text-(--app-muted-2)">
            <span>Typed exactly as-is — spacing and case matter.</span>
            <span v-if="paste.length" class="font-mono text-(--app-muted)">{{
              paste.length
            }}</span>
          </div>
        </div>

        <!-- How it works -->
        <ul class="mt-5 space-y-3 border-t border-(--app-border) pt-5">
          <li
            v-for="(point, index) in howItWorks"
            :key="index"
            class="flex items-start gap-3 text-sm leading-relaxed text-(--app-muted)"
          >
            <span
              class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
            >
              <component
                :is="point.icon"
                class="size-3.5 text-[var(--accent)]"
                :stroke-width="1.8"
                aria-hidden="true"
              />
            </span>
            {{ point.text }}
          </li>
        </ul>

        <!-- PIN -->
        <div class="mt-5 space-y-2 border-t border-(--app-border) pt-5">
          <label for="secret-pin" class="block text-xs font-semibold text-(--app-text)">
            PIN
            <span class="font-normal text-(--app-muted)">— {{ PIN_MIN_CHARS }}+ letters or digits</span>
          </label>
          <input
            id="secret-pin"
            v-model="pin"
            type="text"
            inputmode="text"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            placeholder="e.g. olive4Seven"
            class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.75rem] font-mono text-[0.85rem] text-(--app-text) transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--accent)_60%,transparent)] focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
          />
          <div v-if="pinStrength" class="flex items-center gap-3">
            <div class="flex flex-1 gap-1" aria-hidden="true">
              <span
                v-for="i in 4"
                :key="i"
                class="h-1 flex-1 rounded-full transition-colors duration-300"
                :class="
                  i <= pinStrength.tone
                    ? 'bg-[var(--accent)]'
                    : 'bg-(--app-surface-hover)'
                "
              />
            </div>
            <span class="shrink-0 text-[11px] font-medium text-(--app-muted)">
              {{ pinStrength.label }} · ≈{{ pinBits }} bits
            </span>
          </div>
        </div>

        <PrimaryButton class="mt-6" @click="create" :disabled="!canCreate" :loading="busy">
          {{ busy ? "Deriving Argon2id key in memory…" : "Create identity" }}
        </PrimaryButton>
      </section>

      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />
    </main>
  </div>
</template>
