<script setup>
import { Brain, KeyRound } from "@lucide/vue";
</script>

<template>
  <div class="min-h-screen bg-(--app-bg) text-(--app-text) pb-16">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight text-(--app-text)">Switch account</h1>
          <p class="mt-1 text-sm text-(--app-muted)">
            Memory anchors are the recommended way to create or restore an identity. Paste a key
            only if you already have one.
          </p>
        </div>

        <div class="grid gap-4">
          <RouterLink
            to="/switch/kdf"
            class="group relative flex items-start gap-4 rounded-3xl border-2 border-emerald-500/50 bg-(--app-surface) p-5 sm:p-6 shadow-[0_0_24px_rgba(16,185,129,0.12)] transition-colors hover:border-emerald-400/70 hover:bg-(--app-surface-hover)"
          >
            <div
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
            >
              <Brain class="h-6 w-6" :stroke-width="1.8" />
            </div>
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base font-bold text-(--app-text)">Memory anchors</h2>
                <span
                  class="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400"
                >
                  Recommended
                </span>
              </div>
              <p class="text-sm text-(--app-muted) leading-relaxed">
                Derive the same key from passwords, PIN, dates, and other memories. Works on any
                device — nothing to store or lose.
              </p>
              <p class="pt-1 text-xs font-semibold text-emerald-400">Continue with memory &rarr;</p>
            </div>
          </RouterLink>

          <RouterLink
            to="/switch/key"
            class="group flex items-start gap-4 rounded-3xl border border-(--app-border) bg-(--app-surface) p-5 sm:p-6 shadow-sm transition-colors hover:bg-(--app-surface-hover)"
          >
            <div
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-muted)"
            >
              <KeyRound class="h-6 w-6" :stroke-width="1.8" />
            </div>
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base font-bold text-(--app-text)">Paste a secret</h2>
                <span
                  class="inline-flex items-center rounded-full border border-(--app-border) bg-(--app-surface-soft) px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-(--app-muted)"
                >
                  Advanced
                </span>
              </div>
              <p class="text-sm text-(--app-muted) leading-relaxed">
                Hex private key or backup JSON restores as-is. Anything else is hashed once with
                Argon2id.
              </p>
              <p class="pt-1 text-xs font-semibold text-(--app-text-soft)">Use a pasted key &rarr;</p>
            </div>
          </RouterLink>
        </div>
      </div>
    </main>
  </div>
</template>
