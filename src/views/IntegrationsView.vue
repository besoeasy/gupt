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

        <section
          class="relative overflow-hidden rounded-2xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] p-4 sm:p-5 space-y-3"
        >
          <div
            class="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(70%_80%_at_50%_0%,color-mix(in_srgb,var(--app-primary)_14%,transparent),transparent)]"
          />
          <div class="relative flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-[linear-gradient(135deg,color-mix(in_srgb,var(--app-primary)_20%,transparent),transparent)] text-(--app-primary)"
              >
                <Bot class="h-5 w-5" :stroke-width="1.9" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <h2 class="text-sm font-semibold tracking-tight text-zinc-200">
                  Make your own integration — teach your AI agent
                </h2>
                <p class="text-xs text-(--app-muted)">
                  Two-way bots, sealed file attachments, custom tools, or task notifications.
                </p>
              </div>
            </div>

            <button
              type="button"
              class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95 shrink-0"
              @click="copyAgentInstruction"
            >
              <Check v-if="skillCopied" class="h-3.5 w-3.5 text-emerald-400" />
              <Copy v-else class="h-3.5 w-3.5" />
              {{ skillCopied ? "Copied" : "Copy command" }}
            </button>
          </div>

          <pre
            class="relative overflow-x-auto rounded-lg border border-(--app-border)/80 bg-black/60 px-3.5 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-300 select-all"
          ><code>{{ agentInstruction }}</code></pre>
        </section>
      </div>
    </div>
  </main>
</template>
