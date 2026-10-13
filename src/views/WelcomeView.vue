<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { Brain, Fingerprint, KeyRound } from "@lucide/vue";

const route = useRoute();

// Set when the guard bounced an account-less visit to a real page.
const bouncedFrom = computed(() => String(route.query.next || ""));

const heading = computed(() =>
  bouncedFrom.value ? "No account in this browser" : "Create or restore an account",
);

const subheading = computed(() =>
  bouncedFrom.value
    ? "Gupt signs every message with a key stored in this browser. Restore one to continue — nothing is sent under a throwaway identity."
    : "Your identity is a secret you already know. Pick whichever one you can reproduce on any device.",
);
</script>

<template>
  <div class="relative min-h-full w-full overflow-y-auto bg-(--app-bg) text-(--app-text)">
    <!-- Soft top glow, the way Vercel lifts its hero off the page. -->
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_srgb,var(--app-text)_9%,transparent),transparent)]"
      aria-hidden="true"
    />

    <main class="relative mx-auto w-full max-w-2xl px-4 pt-16 pb-24 sm:pt-24">
      <div class="flex flex-col items-center text-center">
        <svg viewBox="0 0 512 512" class="h-20 w-20 sm:h-24 sm:w-24" role="img" aria-label="Gupt">
          <defs>
            <linearGradient
              id="welcome-bg"
              x1="56"
              x2="456"
              y1="56"
              y2="456"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stop-color="#18181b" />
              <stop offset="1" stop-color="#27272a" />
            </linearGradient>
            <linearGradient
              id="welcome-accent"
              x1="128"
              x2="384"
              y1="128"
              y2="384"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stop-color="#facc15" />
              <stop offset="1" stop-color="#fb7185" />
            </linearGradient>
          </defs>
          <rect width="512" height="512" rx="116" fill="url(#welcome-bg)" />
          <path
            d="M256 102c-84.7 0-154 69.3-154 154s69.3 154 154 154c46.3 0 88.3-20.5 116.6-53v-64.8H263v-64h173.6v154.5C398.2 434.4 331.4 464 256 464c-114.9 0-208-93.1-208-208S141.1 48 256 48c58.7 0 111.8 24.3 149.5 63.4L361.2 154C334.7 122.1 297.4 102 256 102Z"
            fill="url(#welcome-accent)"
          />
          <circle cx="361" cy="151" r="26" fill="#fafafa" fill-opacity="0.92" />
        </svg>

        <h1 class="mt-10 text-4xl font-semibold tracking-tighter text-(--app-text) sm:text-5xl">
          {{ heading }}
        </h1>
        <p class="mt-5 max-w-md text-base leading-relaxed text-(--app-muted)">
          {{ subheading }}
        </p>
      </div>

      <div class="mt-16 space-y-3">
        <RouterLink
          to="/welcome/memory"
          class="group flex items-center gap-5 rounded-xl border border-(--app-border) bg-(--app-surface) p-5 transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) sm:gap-6 sm:p-6"
        >
          <div
            class="flex aspect-square w-[26%] shrink-0 items-center justify-center rounded-lg border border-(--app-border) bg-(--app-surface-raised) text-(--app-muted) transition-colors group-hover:text-(--app-text-soft) sm:w-[28%]"
          >
            <Brain class="h-[30%] w-[30%]" :stroke-width="1.6" />
          </div>
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-medium text-(--app-text)">Memory anchors</h2>
              <span
                class="rounded-full bg-(--app-success-soft) px-2 py-0.5 text-[11px] font-medium text-(--app-success)"
              >
                Recommended
              </span>
            </div>
            <p class="text-sm leading-relaxed text-(--app-muted)">
              Derive the same key from a passphrase, PIN, dates, and other memories. Works on any
              device — nothing to store or lose.
            </p>
          </div>
        </RouterLink>

        <RouterLink
          to="/welcome/secret"
          class="group flex items-center gap-5 rounded-xl border border-(--app-border) bg-(--app-surface) p-5 transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) sm:gap-6 sm:p-6"
        >
          <div
            class="flex aspect-square w-[26%] shrink-0 items-center justify-center rounded-lg border border-(--app-border) bg-(--app-surface-raised) text-(--app-muted) transition-colors group-hover:text-(--app-text-soft) sm:w-[28%]"
          >
            <KeyRound class="h-[30%] w-[30%]" :stroke-width="1.6" />
          </div>
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-medium text-(--app-text)">Paste a secret</h2>
              <span
                class="rounded-full bg-(--app-surface-raised) px-2 py-0.5 text-[11px] font-medium text-(--app-muted)"
              >
                Advanced
              </span>
            </div>
            <p class="text-sm leading-relaxed text-(--app-muted)">
              Any text at all — a passphrase, a PIN, a sentence. One Argon2id pass and it becomes
              your identity on every device.
            </p>
          </div>
        </RouterLink>

        <RouterLink
          to="/welcome/file"
          class="group flex items-center gap-5 rounded-xl border border-(--app-border) bg-(--app-surface) p-5 transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) sm:gap-6 sm:p-6"
        >
          <div
            class="flex aspect-square w-[26%] shrink-0 items-center justify-center rounded-lg border border-(--app-border) bg-(--app-surface-raised) text-(--app-muted) transition-colors group-hover:text-(--app-text-soft) sm:w-[28%]"
          >
            <Fingerprint class="h-[30%] w-[30%]" :stroke-width="1.6" />
          </div>
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-medium text-(--app-text)">Use a secret file</h2>
              <span
                class="rounded-full bg-(--app-surface-raised) px-2 py-0.5 text-[11px] font-medium text-(--app-muted)"
              >
                Advanced
              </span>
            </div>
            <p class="text-sm leading-relaxed text-(--app-muted)">
              A photo or keepsake only you have. Its hash becomes your identity — the file is never
              uploaded.
            </p>
          </div>
        </RouterLink>
      </div>
    </main>
  </div>
</template>
