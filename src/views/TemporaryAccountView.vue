<script setup>
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { CloudOff, Dices, Lock, Sparkles, TriangleAlert } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { useIdentityStore } from "@/stores/identity";
import { resumeTarget } from "@/router";

const identity = useIdentityStore();
const route = useRoute();
const router = useRouter();

const message = ref("");
const error = ref("");
const busy = ref(false);

const howItWorks = [
  {
    icon: Dices,
    text: "A fresh cryptographic Ed25519 keypair is randomly generated in memory on demand.",
  },
  {
    icon: Lock,
    text: "Saved strictly to this browser tab's sessionStorage. Never written to permanent disk or storage.",
  },
  {
    icon: CloudOff,
    text: "Completely destroyed on tab close or logout. Because keys are random and never stored, they cannot be recovered.",
  },
];

async function create() {
  if (busy.value) return;
  error.value = "";
  message.value = "";
  busy.value = true;
  try {
    await identity.createTemporaryAccount();
    message.value = "Temporary account created. Redirecting…";
    setTimeout(() => router.replace(resumeTarget(route.query)), 350);
  } catch (e) {
    error.value = e.message || "Failed to create temporary account.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <!-- Accent matches the "Temporary account" card on /welcome. -->
  <div
    class="relative min-h-full w-full overflow-y-auto bg-(--app-bg) text-(--app-text) [--accent:#38bdf8]"
  >
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_srgb,var(--app-text)_9%,transparent),transparent)]"
      aria-hidden="true"
    />

    <main class="relative mx-auto w-full max-w-2xl px-4 pt-10 pb-24 sm:pt-14">
      <header class="app-list-item flex flex-col items-center text-center [--app-item-delay:40ms]">
        <div
          class="flex size-14 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
        >
          <Sparkles class="size-7 text-[var(--accent)]" :stroke-width="1.7" aria-hidden="true" />
        </div>
        <h1 class="mt-5 text-3xl font-semibold tracking-tighter sm:text-4xl">Temporary account</h1>
        <p class="mt-3 max-w-md text-sm leading-relaxed text-(--app-muted)">
          A disposable identity generated instantly in your browser — zero setup, zero traces left behind.
        </p>
      </header>

      <p
        v-if="identity.isReady"
        class="app-list-item mt-6 rounded-xl border border-(--app-border) bg-(--app-surface) px-4 py-3 text-xs leading-relaxed text-(--app-muted) [--app-item-delay:70ms]"
      >
        This browser already holds
        <span class="font-medium text-(--app-text-soft)">
          {{ identity.profileName || identity.fingerprint || "an account" }} </span
        >. Generating a temporary account moves it to a new identity and clears that account's cached data.
      </p>

      <section
        class="app-list-item mt-6 rounded-2xl border border-(--app-border) bg-(--app-surface) p-5 shadow-sm [--app-item-delay:100ms] sm:p-7"
      >
        <h2 class="text-xs font-semibold uppercase tracking-wider text-(--app-muted)">
          How temporary accounts work
        </h2>

        <!-- How it works -->
        <ul class="mt-4 space-y-3.5">
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

        <!-- Warning Strip -->
        <div
          class="mt-6 flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] p-4 text-xs leading-relaxed text-(--app-text-soft)"
        >
          <TriangleAlert class="mt-0.5 size-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <p>
            <strong class="font-semibold text-(--app-text)">Disposable session:</strong>
            When you close this browser tab or log out, this account is permanently deleted. You will not be able to recover its messages, contacts, or keys.
          </p>
        </div>

        <PrimaryButton class="mt-6" @click="create" :loading="busy">
          {{ busy ? "Generating random keypair in memory…" : "Create temporary account" }}
        </PrimaryButton>
      </section>

      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />
    </main>
  </div>
</template>
