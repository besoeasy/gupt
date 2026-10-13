<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { Brain, KeyRound } from "@lucide/vue";

const route = useRoute();

// Set when the guard bounced an account-less visit to a real page.
const bouncedFrom = computed(() => String(route.query.next || ""));

const heading = computed(() =>
  bouncedFrom.value ? "No account in this browser" : "Create or restore an account",
);

const subheading = computed(() =>
  bouncedFrom.value
    ? "Gupt signs every message with a key stored in this browser. Restore one to continue — nothing is sent under a throwaway identity."
    : "Memory anchors are the recommended way to create or restore an identity. Paste a key only if you already have one.",
);
</script>

<template>
  <div class="h-full w-full min-w-0 overflow-y-auto bg-black text-zinc-100 pb-16">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto w-full max-w-2xl space-y-5">
        <div class="space-y-1">
          <h1 class="text-xl font-semibold tracking-tight text-white">{{ heading }}</h1>
          <p class="text-xs text-zinc-500 leading-relaxed">{{ subheading }}</p>
        </div>

        <div class="space-y-3">
          <RouterLink
            to="/welcome/memory"
            class="flex items-start gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4 shadow-xs transition-colors hover:border-zinc-700 hover:bg-zinc-900/60 sm:gap-4 sm:p-5"
          >
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400"
            >
              <Brain class="h-5 w-5" :stroke-width="2" />
            </div>
            <div class="min-w-0 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-sm font-semibold tracking-tight text-zinc-200">Memory anchors</h2>
                <span class="text-[11px] font-medium text-emerald-400">Recommended</span>
              </div>
              <p class="text-xs text-zinc-500 leading-relaxed">
                Derive the same key from passwords, PIN, dates, and other memories. Works on any
                device — nothing to store or lose.
              </p>
              <p class="text-[11px] font-medium text-zinc-300">Continue with memory &rarr;</p>
            </div>
          </RouterLink>

          <RouterLink
            to="/welcome/key"
            class="flex items-start gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4 shadow-xs transition-colors hover:border-zinc-700 hover:bg-zinc-900/60 sm:gap-4 sm:p-5"
          >
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400"
            >
              <KeyRound class="h-5 w-5" :stroke-width="2" />
            </div>
            <div class="min-w-0 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-sm font-semibold tracking-tight text-zinc-200">Paste a secret</h2>
                <span class="text-[11px] font-medium text-zinc-600">Advanced</span>
              </div>
              <p class="text-xs text-zinc-500 leading-relaxed">
                Hex private key or backup JSON restores as-is. Anything else is hashed once with
                Argon2id.
              </p>
              <p class="text-[11px] font-medium text-zinc-300">Use a pasted key &rarr;</p>
            </div>
          </RouterLink>
        </div>
      </div>
    </main>
  </div>
</template>
