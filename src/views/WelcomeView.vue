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
  <div class="h-full w-full min-w-0 overflow-y-auto bg-(--app-bg) text-(--app-text) pb-16">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto w-full max-w-2xl space-y-8">
        <div class="flex flex-col items-center gap-6 pt-6 pb-2 text-center sm:pt-10">
          <div class="relative">
            <div
              class="pointer-events-none absolute -inset-6 rounded-[44px] bg-gradient-to-br from-yellow-400/25 via-rose-400/15 to-transparent blur-2xl"
              aria-hidden="true"
            />
            <svg
              viewBox="0 0 512 512"
              class="relative h-28 w-28 rounded-[26px] ring-1 ring-white/10 sm:h-32 sm:w-32 sm:rounded-[30px]"
              role="img"
              aria-label="Gupt"
            >
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
          </div>

          <div class="space-y-2">
            <h1 class="text-2xl font-semibold tracking-tight text-(--app-text) sm:text-3xl">
              {{ heading }}
            </h1>
            <p class="mx-auto max-w-md text-sm leading-relaxed text-(--app-muted)">
              {{ subheading }}
            </p>
          </div>
        </div>

        <div class="space-y-3">
          <RouterLink
            to="/welcome/memory"
            class="group flex items-center gap-4 rounded-[20px] border border-(--app-border) bg-(--app-surface) p-5 shadow-xs transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) sm:gap-5 sm:p-6"
          >
            <div
              class="flex aspect-square w-[27%] shrink-0 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-raised) text-(--app-text-soft) sm:w-[30%]"
            >
              <Brain class="h-[30%] w-[30%]" :stroke-width="1.6" />
            </div>
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base font-semibold tracking-tight text-(--app-text)">
                  Memory anchors
                </h2>
                <span
                  class="rounded-full bg-(--app-success-soft) px-2 py-0.5 text-[11px] font-medium text-(--app-success)"
                >
                  Recommended
                </span>
              </div>
              <p class="text-xs leading-relaxed text-(--app-muted)">
                Derive the same key from a passphrase, PIN, dates, and other memories. Works on any
                device — nothing to store or lose.
              </p>
              <p
                class="text-[11px] font-medium text-(--app-text-soft) transition-transform group-hover:translate-x-0.5"
              >
                Continue with memory &rarr;
              </p>
            </div>
          </RouterLink>

          <RouterLink
            to="/welcome/secret"
            class="group flex items-center gap-4 rounded-[20px] border border-(--app-border) bg-(--app-surface) p-5 shadow-xs transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) sm:gap-5 sm:p-6"
          >
            <div
              class="flex aspect-square w-[27%] shrink-0 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-raised) text-(--app-text-soft) sm:w-[30%]"
            >
              <KeyRound class="h-[30%] w-[30%]" :stroke-width="1.6" />
            </div>
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base font-semibold tracking-tight text-(--app-text)">
                  Paste a secret
                </h2>
                <span
                  class="rounded-full bg-(--app-surface-raised) px-2 py-0.5 text-[11px] font-medium text-(--app-muted)"
                >
                  Advanced
                </span>
              </div>
              <p class="text-xs leading-relaxed text-(--app-muted)">
                Any text at all — a passphrase, a PIN, a sentence. One Argon2id pass and it becomes
                your identity on every device.
              </p>
              <p
                class="text-[11px] font-medium text-(--app-text-soft) transition-transform group-hover:translate-x-0.5"
              >
                Use a passphrase &rarr;
              </p>
            </div>
          </RouterLink>

          <RouterLink
            to="/welcome/file"
            class="group flex items-center gap-4 rounded-[20px] border border-(--app-border) bg-(--app-surface) p-5 shadow-xs transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) sm:gap-5 sm:p-6"
          >
            <div
              class="flex aspect-square w-[27%] shrink-0 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-raised) text-(--app-text-soft) sm:w-[30%]"
            >
              <Fingerprint class="h-[30%] w-[30%]" :stroke-width="1.6" />
            </div>
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base font-semibold tracking-tight text-(--app-text)">
                  Use a secret file
                </h2>
                <span
                  class="rounded-full bg-(--app-surface-raised) px-2 py-0.5 text-[11px] font-medium text-(--app-muted)"
                >
                  Advanced
                </span>
              </div>
              <p class="text-xs leading-relaxed text-(--app-muted)">
                A photo or keepsake only you have. Its hash becomes your identity — the file is
                never uploaded.
              </p>
              <p
                class="text-[11px] font-medium text-(--app-text-soft) transition-transform group-hover:translate-x-0.5"
              >
                Use a file &rarr;
              </p>
            </div>
          </RouterLink>
        </div>
      </div>
    </main>
  </div>
</template>
