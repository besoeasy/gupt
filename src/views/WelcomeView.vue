<script setup>
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { Brain, ChevronRight, Fingerprint, KeyRound } from "@lucide/vue";
import { useIdentityStore } from "@/stores/identity";

const route = useRoute();
const identity = useIdentityStore();

// init() is memoised, so this is free when App.vue already booted it.
onMounted(() => {
  void identity.init();
});

// Set when the guard bounced an account-less visit to a real page.
const bouncedFrom = computed(() => String(route.query.next || ""));

// The page doubles as the account switcher, so it stays reachable with an
// account loaded. Redirecting away would strand anyone who wants a second
// identity behind a destructive logout.
const heading = computed(() => {
  if (bouncedFrom.value) return "No account in this browser";
  return identity.isReady ? "Switch account" : "Create or restore an account";
});

const subheading = computed(() => {
  if (bouncedFrom.value) {
    return "Gupt signs every message with a key stored in this browser. Restore one to continue — nothing is sent under a throwaway identity.";
  }
  if (identity.isReady) {
    return "Pick a different secret to move this browser to another identity. Everything cached for the current one is cleared.";
  }
  return "Your identity is a secret you already know. Pick whichever one you can reproduce on any device.";
});

const currentName = computed(
  () => identity.profileName || identity.fingerprint || "Unnamed account",
);

/**
 * The three ways to get an account. Each carries its own accent so the options
 * are told apart at a glance instead of reading as three identical slabs, and
 * so the hover glow tells you which one you are about to open. The hue is bound
 * to a custom property, which every colour on the card then derives from.
 */
const methods = [
  {
    to: "/welcome/memory",
    icon: Brain,
    label: "Memory anchors",
    badge: "Recommended",
    description:
      "Derive the same key from a passphrase, PIN, dates, and other memories. Works on any device — nothing to store or lose.",
    accent: "#a78bfa",
  },
  {
    to: "/welcome/secret",
    icon: KeyRound,
    label: "Paste a secret",
    badge: "Advanced",
    description:
      "Any text at all — a passphrase, a PIN, a sentence. One Argon2id pass and it becomes your identity on every device.",
    accent: "#fbbf24",
  },
  {
    to: "/welcome/file",
    icon: Fingerprint,
    label: "Use a secret file",
    badge: "Advanced",
    description:
      "A photo or keepsake only you have. Its hash becomes your identity — the file is never uploaded.",
    accent: "#34d399",
  },
];
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
        <h1 class="mt-10 text-4xl font-semibold tracking-tighter text-(--app-text) sm:text-5xl">
          {{ heading }}
        </h1>
        <p class="mt-5 max-w-md text-base leading-relaxed text-(--app-muted)">
          {{ subheading }}
        </p>
      </div>

      <div v-if="identity.isReady" class="mt-14">
        <div
          class="flex items-center gap-4 rounded-xl border border-(--app-border) bg-(--app-surface) p-5"
        >
          <div class="min-w-0 flex-1">
            <p class="text-[11px] font-medium uppercase tracking-wider text-(--app-muted)">
              Current account
            </p>
            <p class="mt-1 truncate text-sm font-medium text-(--app-text)">{{ currentName }}</p>
            <p class="mt-0.5 truncate font-mono text-[11px] text-(--app-muted)">
              {{ identity.pubkeyHex }}
            </p>
          </div>
          <RouterLink
            to="/me"
            class="shrink-0 rounded-lg border border-(--app-border) px-3 py-2 text-xs font-medium text-(--app-text-soft) transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover)"
          >
            Manage
          </RouterLink>
        </div>
      </div>

      <div class="mt-14 space-y-4 sm:mt-16">
        <RouterLink
          v-for="method in methods"
          :key="method.to"
          :to="method.to"
          :style="{ '--accent': method.accent }"
          class="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-(--app-border) bg-(--app-surface) p-5 transition-[transform,box-shadow,border-color,background-color] duration-300 ease-[var(--app-ease-swift)] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:bg-(--app-surface-hover) hover:shadow-[0_16px_44px_-16px_color-mix(in_srgb,var(--accent)_55%,transparent)] active:translate-y-0 active:scale-[0.995] focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:gap-5 sm:p-6"
        >
          <!-- Accent bloom: the card takes on a colour of its own on hover. -->
          <span
            aria-hidden="true"
            class="pointer-events-none absolute -left-9 -top-9 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 ease-[var(--app-ease-swift)] group-hover:opacity-40"
            :style="{ background: 'var(--accent)' }"
          />

          <div
            class="relative flex size-13 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] transition-all duration-300 ease-[var(--app-ease-swift)] group-hover:scale-105 group-hover:border-[color-mix(in_srgb,var(--accent)_55%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
          >
            <component
              :is="method.icon"
              class="size-6 text-[var(--accent)] transition-transform duration-300 ease-[var(--app-ease-swift)] group-hover:scale-110"
              :stroke-width="1.7"
              aria-hidden="true"
            />
          </div>

          <div class="relative min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-medium text-(--app-text)">{{ method.label }}</h2>
              <span
                class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                :class="
                  method.badge === 'Recommended'
                    ? 'bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]'
                    : 'bg-(--app-surface-raised) text-(--app-muted)'
                "
              >
                {{ method.badge }}
              </span>
            </div>
            <p
              class="text-sm leading-relaxed text-(--app-muted) transition-colors duration-300 group-hover:text-(--app-text-soft)"
            >
              {{ method.description }}
            </p>
          </div>

          <ChevronRight
            aria-hidden="true"
            class="relative mt-1 size-5 shrink-0 -translate-x-1.5 text-[var(--accent)] opacity-0 transition-all duration-300 ease-[var(--app-ease-swift)] group-hover:translate-x-0 group-hover:opacity-70"
          />
        </RouterLink>
      </div>
    </main>
  </div>
</template>
