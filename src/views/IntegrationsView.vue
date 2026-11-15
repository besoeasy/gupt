<script setup>
import { computed, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import {
  Bell,
  Bot,
  Bookmark,
  Check,
  ChevronRight,
  Container,
  Copy,
  ExternalLink,
  MessageSquare,
  Paperclip,
  Sparkles,
} from "@lucide/vue";

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

const capabilities = [
  {
    icon: MessageSquare,
    title: "Two-Way Bots",
    desc: "Receive DMs from relays, decrypt with ECDH, and reply with AI models or custom scripts.",
  },
  {
    icon: Sparkles,
    title: "Interactive UI Buttons",
    desc: "Send interactive {{button ...}} links, markdown, and structured cards directly into chats.",
  },
  {
    icon: Paperclip,
    title: "Encrypted Files & Blobs",
    desc: "Split & seal attachments into RABTA1 containers uploaded to content-addressed relays.",
  },
  {
    icon: Bell,
    title: "Push Pings & Alerts",
    desc: "Send fire-and-forget encrypted alerts from CI/CD, cron jobs, or local background daemons.",
  },
];

const docsLinks = [
  {
    title: "Programmatic Chat API",
    tag: "REST & Websocket",
    desc: "Endpoints, dual-key Ed25519/X25519 crypto, relay events and blob uploads.",
    url: "https://github.com/besoeasy/gupt/blob/main/docs/programmatic-chat.md",
  },
  {
    title: "Two-Way Bots & Beacons",
    tag: "Bot Architecture",
    desc: "Listening loops, decrypting inbound DMs, replying, and /bots discovery beacons.",
    url: "https://github.com/besoeasy/gupt/blob/main/docs/bots.md",
  },
  {
    title: "Agent Skill Specification",
    tag: "SKILL.md",
    desc: "Self-contained protocol brief for Claude, Antigravity, Cursor, and Copilot.",
    url: "https://github.com/besoeasy/gupt/blob/main/docs/SKILL.md",
  },
  {
    title: "Interactive Message Format",
    tag: "Templates & Buttons",
    desc: "Grammar for buttons, markdown formatting, auto-detect rules, and secure links.",
    url: "https://github.com/besoeasy/gupt/blob/main/docs/message-format.md",
  },
];

const selectedMode = ref("full"); // "full" | "notify"

const SKILL_RAW_URL =
  "https://raw.githubusercontent.com/besoeasy/gupt/main/docs/SKILL.md";
const identity = useIdentityStore();
const relays = computed(() => readConfiguredRelays().map((r) => r.replace(/\/+$/, "")));

const fullAgentInstruction = computed(() => {
  const values = [];
  if (relays.value.length) values.push(`GUPT_RELAY=${relays.value.join(",")}`);
  if (identity.pubkeyHex) values.push(`GUPT_ADMIN_KEY=${identity.pubkeyHex}`);

  const envConfig = values.length
    ? values.map((v) => `   ${v}`).join("\n")
    : "   GUPT_RELAY=<relay url(s)>\n   GUPT_ADMIN_KEY=<admin public key>";

  return [
    "You are integrating with Gupt — an open, serverless, end-to-end encrypted messaging and",
    "decentralized data protocol. You can build two-way conversational bots, autonomous tools,",
    "file transfer pipelines, or task notifications directly on open Rabta relays.",
    "",
    "1. Read the core protocol & API documentation:",
    "   - Programmatic Chat & Relay API: https://raw.githubusercontent.com/besoeasy/gupt/main/docs/programmatic-chat.md",
    "   - Agent Skill Brief: https://raw.githubusercontent.com/besoeasy/gupt/main/docs/SKILL.md",
    "   - Two-Way Bots & Directory Beacons: https://raw.githubusercontent.com/besoeasy/gupt/main/docs/bots.md",
    "   - Interactive Message Format: https://raw.githubusercontent.com/besoeasy/gupt/main/docs/message-format.md",
    "",
    "2. Configure your environment in .env (never commit secrets or private keys):",
    envConfig,
    "",
    "3. Capabilities you can implement:",
    "   - Two-Way Interactive Bot: Poll or stream GET /api/v1/events?collection=gupt/chat/dm, decrypt incoming",
    "     DMs using X25519 ECDH, process with your logic, and reply using POST /api/v1/events.",
    "   - Directory Listing: Publish a gupt/profiles (Kind 0) name and gupt/bot/beacon event to be listed in /bots.",
    "   - Interactive Chat UI: Use {{button \"Label\" https://...}} and Markdown templates for rich interactions.",
    "   - Sealed File Blobs: Encrypt files into RABTA1 containers with HKDF and upload via PUT /api/v1/blobs.",
    "   - Offline Pings: Use docs/gupt-notify.mjs for quick status alerts and notifications.",
    "",
    "4. Verify your connection:",
    `   - Check relay health: GET ${relays.value[0] || "https://rabta.gupt.app"}/api/v1/health`,
    "   - Send a test handshake DM to GUPT_ADMIN_KEY and report delivery status.",
  ].join("\n");
});

const notifyAgentInstruction = computed(() => {
  const values = [];
  if (relays.value.length) values.push(`GUPT_RELAY=${relays.value.join(",")}`);
  if (identity.pubkeyHex) values.push(`GUPT_ADMIN_KEY=${identity.pubkeyHex}`);

  const step3 = values.length
    ? ["3. Store these values in .env — never commit them:", ...values.map((v) => `   ${v}`)]
    : [
        "3. Store these values in .env — never commit them (ask me for them",
        "   if you don't have them): GUPT_RELAY, GUPT_ADMIN_KEY.",
      ];

  return [
    "Set up gupt-notify — secure push to my gupt inbox:",
    "",
    `1. Fetch and read: ${SKILL_RAW_URL}`,
    "   (If you can't fetch URLs, stop and ask me to paste it.)",
    "2. Persist it across sessions: save it in your skills directory as",
    '   "gupt-notify" (e.g. .claude/skills/gupt-notify/SKILL.md or',
    "   .opencode/skill/gupt-notify/SKILL.md), or append it to AGENTS.md.",
    ...step3,
    '4. Verify: send exactly one test message "[<project>] setup test" and',
    "   report whether it delivered.",
    '5. From now on, message me one "[<project>] <what happened>" line when a',
    "   task finishes, a long job completes, or a blocking error appears —",
    "   full trigger policy is in the skill. No secrets, fire-and-forget.",
    "6. In my other projects, reuse the installed skill and the same values",
    "   instead of setting up again.",
  ].join("\n");
});

const agentInstruction = computed(() =>
  selectedMode.value === "full" ? fullAgentInstruction.value : notifyAgentInstruction.value,
);

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
          class="relative overflow-hidden rounded-2xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] p-4 sm:p-6 space-y-6"
        >
          <div
            class="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(70%_80%_at_50%_0%,color-mix(in_srgb,var(--app-primary)_14%,transparent),transparent)]"
          />
          <div class="relative flex items-start gap-3">
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-[linear-gradient(135deg,color-mix(in_srgb,var(--app-primary)_20%,transparent),transparent)] text-(--app-primary)"
            >
              <Bot class="h-6 w-6" :stroke-width="1.9" aria-hidden="true" />
            </div>
            <div class="min-w-0 space-y-1">
              <h2 class="text-base font-semibold tracking-tight text-zinc-100">
                Make your own integration — teach your AI agent
              </h2>
              <p class="text-xs text-(--app-muted) leading-relaxed">
                Gupt has no central API server, accounts, or gatekept tokens. Any AI agent, script,
                or daemon can generate cryptographic keys and talk directly to open Rabta relays.
                Use the full protocol to build <strong>two-way bots</strong>, <strong>interactive tools</strong>,
                <strong>sealed file pipelines</strong>, or <strong>notification streams</strong>.
              </p>
            </div>
          </div>

          <!-- Protocol Capabilities Grid -->
          <div class="relative grid gap-2.5 sm:grid-cols-2">
            <div
              v-for="cap in capabilities"
              :key="cap.title"
              class="flex items-start gap-3 rounded-xl border border-(--app-border)/70 bg-black/40 p-3 transition-colors hover:border-(--app-border-strong)"
            >
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-(--app-border) bg-(--app-surface-soft) text-(--app-primary)"
              >
                <component :is="cap.icon" class="h-4 w-4" :stroke-width="1.9" />
              </div>
              <div class="min-w-0 space-y-0.5">
                <h3 class="text-xs font-semibold text-zinc-200">{{ cap.title }}</h3>
                <p class="text-[11px] leading-relaxed text-(--app-muted)">{{ cap.desc }}</p>
              </div>
            </div>
          </div>

          <!-- Documentation Links -->
          <div class="relative space-y-2">
            <h3 class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Protocol Documentation & Guides
            </h3>
            <div class="grid gap-2 sm:grid-cols-2">
              <a
                v-for="doc in docsLinks"
                :key="doc.title"
                :href="doc.url"
                target="_blank"
                rel="noopener noreferrer"
                class="group flex items-start justify-between gap-2 rounded-xl border border-(--app-border)/70 bg-zinc-900/40 p-3 transition-all hover:border-zinc-700 hover:bg-zinc-900/80 active:scale-[0.99]"
              >
                <div class="min-w-0 space-y-0.5">
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs font-medium text-zinc-200 group-hover:text-white">{{ doc.title }}</span>
                    <span class="rounded px-1.5 py-0.2 text-[9px] font-mono text-zinc-500 border border-zinc-800">{{ doc.tag }}</span>
                  </div>
                  <p class="text-[11px] text-(--app-muted) leading-tight">{{ doc.desc }}</p>
                </div>
                <ExternalLink class="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-colors group-hover:text-zinc-300" />
              </a>
            </div>
          </div>

          <!-- Prompt Generator -->
          <div class="relative space-y-3 pt-2 border-t border-(--app-border)/60">
            <div class="flex flex-wrap items-center justify-between gap-2.5">
              <div class="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900/80 p-1">
                <button
                  type="button"
                  class="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all active:scale-95"
                  :class="selectedMode === 'full' ? 'bg-zinc-800 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'"
                  @click="selectedMode = 'full'"
                >
                  <Bot class="h-3.5 w-3.5" />
                  <span>Full Agent / Bot (Build Anything)</span>
                </button>
                <button
                  type="button"
                  class="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all active:scale-95"
                  :class="selectedMode === 'notify' ? 'bg-zinc-800 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'"
                  @click="selectedMode = 'notify'"
                >
                  <Bell class="h-3.5 w-3.5" />
                  <span>Notifications & Alerts</span>
                </button>
              </div>

              <button
                type="button"
                class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-200 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95"
                @click="copyAgentInstruction"
              >
                <Check v-if="skillCopied" class="h-3.5 w-3.5 text-emerald-400" />
                <Copy v-else class="h-3.5 w-3.5" />
                {{ skillCopied ? "Copied instruction!" : "Copy prompt for agent" }}
              </button>
            </div>

            <pre
              class="max-h-72 overflow-x-auto overflow-y-auto rounded-xl border border-(--app-border)/80 bg-black/70 p-3.5 font-mono text-[11px] leading-relaxed text-zinc-300 select-all [scrollbar-width:thin]"
            ><code>{{ agentInstruction }}</code></pre>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
