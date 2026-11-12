<script setup>
import { RouterLink } from "vue-router";
import { Bell, ChevronRight, Container, Terminal } from "@lucide/vue";

import PageBackHeader from "@/components/PageBackHeader.vue";

// Every integration gets its own page; this index is the list that links to
// them. Add new ones here and give them a route + view under /integrations/*.
const integrations = [
  {
    id: "notify",
    name: "NotifyGupt",
    tagline: "Developer logging",
    description:
      "One drop-in function for any web app: encrypts log lines to your gupt public key and lands them in your inbox over a Rabta relay. A random per-browser device key signs every log.",
    to: "/integrations/notify",
    icon: Terminal,
    cta: "Start logging",
  },
  {
    id: "ntfy",
    name: "Ntfy",
    tagline: "Offline notifications",
    description:
      "Free, open-source push pings. When a contact taps PING while you're away, ntfy wakes you up — no message content ever leaves the encrypted chat.",
    to: "/notifications",
    icon: Bell,
    cta: "Set up",
  },
  {
    id: "backup",
    name: "Local backup node",
    tagline: "Self-hosting",
    description:
      "Run a Rabta node in Docker or Podman with one copied command — an off-device copy of your account, or a sync point across devices.",
    to: "/integrations/backup",
    icon: Container,
    cta: "Get command",
  },
];
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <PageBackHeader
          back-to="/settings"
          back-label="Settings"
          eyebrow="Integrations"
          title="Connect gupt to other tools"
        >
          <p class="text-sm leading-6 text-(--app-muted)">
            Everything gupt can talk to. Gupt has no central server, so integrations are things you
            run or subscribe to yourself — nothing here sees your message contents.
          </p>
        </PageBackHeader>

        <section class="space-y-3">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            All integrations
          </h2>
          <div class="grid gap-3">
            <RouterLink
              v-for="integration in integrations"
              :key="integration.id"
              :to="integration.to"
              class="group flex items-start gap-3 rounded-2xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] p-4 sm:p-5 transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover)"
            >
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-primary)"
              >
                <component
                  :is="integration.icon"
                  class="h-5 w-5"
                  :stroke-width="1.9"
                  aria-hidden="true"
                />
              </div>
              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-sm font-semibold tracking-tight text-zinc-200">
                    {{ integration.name }}
                  </h3>
                  <span
                    class="rounded-full border border-(--app-border) px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-zinc-500"
                  >
                    {{ integration.tagline }}
                  </span>
                </div>
                <p class="text-xs text-(--app-muted) leading-relaxed">
                  {{ integration.description }}
                </p>
              </div>
              <span
                class="inline-flex shrink-0 items-center gap-0.5 self-center text-xs font-medium text-(--app-primary)"
              >
                {{ integration.cta }}
                <ChevronRight
                  class="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </span>
            </RouterLink>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
