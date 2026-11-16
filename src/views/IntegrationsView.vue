<script setup>
import { computed, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { Bell, Bot, Bookmark, Check, ChevronRight, Container, Copy } from "@lucide/vue";

import PageHeader from "@/components/PageHeader.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { readConfiguredRelays } from "@/config/servers";
import { useIdentityStore } from "@/stores/identity";

// Every integration gets its own page; this index is the list that links to
// them. Add new ones here and give them a route + view under /integrations/*.
const integrations = [
  {
    id: "gupt-mark",
    name: "gupt-mark",
    tagline: "Browser bookmarklet",
    description:
      "Save the page you're on straight from your browser's bookmarks bar. Works signed out too — queued links are encrypted on your next visit.",
    to: "/integrations/gupt-mark",
    icon: Bookmark,
    accent: "#f59e0b",
    cta: "Drag it",
  },
  {
    id: "ntfy",
    name: "Ntfy",
    tagline: "Offline notifications",
    description:
      "Free, open-source push pings. When a contact taps PING while you're away, ntfy wakes you up — no message content ever leaves the encrypted chat.",
    to: "/notifications",
    icon: Bell,
    accent: "#38bdf8",
    cta: "Set up",
  },
  {
    id: "backup",
    name: "Local backup node",
    tagline: "Self-hosting",
    description:
      "Run a Rabta node in Docker or Podman with one copied command — an off-device copy of your account.",
    to: "/integrations/backup",
    icon: Container,
    accent: "#34d399",
    cta: "Get command",
  },
];

const SKILL_RAW_URL =
  "https://raw.githubusercontent.com/besoeasy/gupt/main/gupt-for-ai-agents/SKILL.md";
const identity = useIdentityStore();
const relays = computed(() => readConfiguredRelays().map((r) => r.replace(/\/+$/, "")));

const agentInstruction = computed(() => {
  const relay = relays.value.length ? relays.value.join(",") : "https://rabta.gupt.app";
  const key = identity.pubkeyHex || "<YOUR_GUPT_PUBKEY>";

  return [
    `Read gupt-for-ai-agents/SKILL.md (${SKILL_RAW_URL}) to build on gupt.`,
    `GUPT_RELAY="${relay}" GUPT_ADMIN_KEY="${key}"`,
  ].join("\n");
});

const skillCopied = ref(false);
let copiedTimer = null;

function copyAgentInstruction() {
  skillCopied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (skillCopied.value = false), 2000);
  void copyToClipboard(agentInstruction.value).catch(() => {
    skillCopied.value = false;
  });
}

onUnmounted(() => clearTimeout(copiedTimer));
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <PageHeader eyebrow="Integrations" title="Connect gupt to other tools">
          <p class="text-sm leading-6 text-(--app-muted)">
            Everything gupt can talk to. Gupt has no central server, so integrations are things you
            run or subscribe to yourself — nothing here sees your message contents.
          </p>
        </PageHeader>

        <section class="space-y-3">
          <h2
            class="app-list-item text-xs font-semibold uppercase tracking-wider text-(--app-muted)"
            style="--app-item-delay: 50ms"
          >
            All integrations
          </h2>
          <div class="grid gap-3">
            <RouterLink
              v-for="(integration, index) in integrations"
              :key="integration.id"
              :to="integration.to"
              :style="{
                '--accent': integration.accent,
                '--app-item-delay': `${80 + index * 40}ms`,
              }"
              class="app-list-item group relative flex items-start gap-4 overflow-hidden rounded-2xl border border-(--app-border) bg-(--app-surface) p-4 sm:p-5 shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-300 ease-[var(--app-ease-swift)] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:bg-(--app-surface-hover) hover:shadow-[0_16px_44px_-16px_color-mix(in_srgb,var(--accent)_55%,transparent)] active:translate-y-0 active:scale-[0.995]"
            >
              <!-- Accent bloom on hover -->
              <span
                aria-hidden="true"
                class="pointer-events-none absolute -left-10 -top-10 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 ease-[var(--app-ease-swift)] group-hover:opacity-30"
                :style="{ background: 'var(--accent)' }"
              />

              <div
                class="relative flex size-11 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)] transition-all duration-300 ease-[var(--app-ease-swift)] group-hover:scale-105 group-hover:border-[color-mix(in_srgb,var(--accent)_55%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
              >
                <component
                  :is="integration.icon"
                  class="size-5"
                  :stroke-width="1.8"
                  aria-hidden="true"
                />
              </div>

              <div class="relative min-w-0 flex-1 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-sm font-semibold tracking-tight text-(--app-text)">
                    {{ integration.name }}
                  </h3>
                  <span
                    class="rounded-full border border-(--app-border) bg-(--app-surface-raised) px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-(--app-muted)"
                  >
                    {{ integration.tagline }}
                  </span>
                </div>
                <p class="text-xs text-(--app-muted) leading-relaxed">
                  {{ integration.description }}
                </p>
              </div>

              <span
                class="relative inline-flex shrink-0 items-center gap-0.5 self-center text-xs font-medium text-[var(--accent)] transition-transform group-hover:translate-x-0.5"
              >
                {{ integration.cta }}
                <ChevronRight class="size-3.5" :stroke-width="2" aria-hidden="true" />
              </span>
            </RouterLink>
          </div>
        </section>

        <section class="space-y-3">
          <h2
            class="app-list-item text-xs font-semibold uppercase tracking-wider text-(--app-muted)"
            style="--app-item-delay: 200ms"
          >
            AI Agent Integration
          </h2>

          <div
            class="app-list-item group relative overflow-hidden rounded-2xl border border-(--app-border) bg-(--app-surface) p-4 sm:p-5 shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-300 ease-[var(--app-ease-swift)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:bg-(--app-surface-hover) hover:shadow-[0_16px_44px_-16px_color-mix(in_srgb,var(--accent)_55%,transparent)] space-y-3"
            style="--accent: #c084fc; --app-item-delay: 240ms"
          >
            <!-- Accent bloom on hover -->
            <span
              aria-hidden="true"
              class="pointer-events-none absolute -left-10 -top-10 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 ease-[var(--app-ease-swift)] group-hover:opacity-30"
              style="background: var(--accent)"
            />

            <div class="relative flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div
                  class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)] transition-all duration-300 ease-[var(--app-ease-swift)] group-hover:scale-105 group-hover:border-[color-mix(in_srgb,var(--accent)_55%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
                >
                  <Bot class="size-5" :stroke-width="1.8" aria-hidden="true" />
                </div>
                <div class="min-w-0">
                  <h2 class="text-sm font-semibold tracking-tight text-(--app-text)">
                    Make your own integration — teach your AI agent
                  </h2>
                  <p class="text-xs text-(--app-muted)">
                    Two-way bots, sealed file attachments, custom tools, or task notifications.
                  </p>
                </div>
              </div>

              <button
                type="button"
                class="inline-flex h-9 min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 text-xs font-medium text-(--app-text-soft) shadow-xs transition-all hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) active:scale-95 shrink-0"
                @click="copyAgentInstruction"
              >
                <Check v-if="skillCopied" class="size-3.5 text-(--app-success)" />
                <Copy v-else class="size-3.5" />
                {{ skillCopied ? "Copied" : "Copy command" }}
              </button>
            </div>

            <pre
              class="relative overflow-x-auto rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-3 font-mono text-[11px] leading-relaxed text-(--app-text-soft) select-all"
            ><code>{{ agentInstruction }}</code></pre>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
