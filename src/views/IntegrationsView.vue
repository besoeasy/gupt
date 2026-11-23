<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
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
} from "@/icons";

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
    accent: "var(--app-warning)",
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
    accent: "var(--app-primary)",
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
    accent: "var(--app-success)",
    cta: "Get command",
  },
];

// The bot template lives in its own repo, so agents can start from working
// code instead of a spec. The source repo is what the notification prompt
// points at — no gist in the middle.
const BOT_TEMPLATE_URL = "https://github.com/t3nklabs/gupt-bots";
const GUPT_SOURCE_URL = "https://github.com/besoeasy/gupt";
const identity = useIdentityStore();
const relays = computed(() => readConfiguredRelays().map((r) => r.replace(/\/+$/, "")));

const agentInstruction = computed(() => {
  const relay = relays.value.length ? relays.value.join(",") : "https://rabta.gupt.app";
  const key = identity.pubkeyHex
    ? `ed25519:${identity.pubkeyHex}`
    : "ed25519:<YOUR_GUPT_PUBKEY>";

  return [
    `Read ${GUPT_SOURCE_URL} — the source contains the Rabta wire format, event envelope and message encryption.`,
    `Then design and build a small notifier I can call from any script: notify "deploy finished".`,
    `It should send that text to me as an encrypted gupt DM.`,
    `GUPT_RELAY="${relay}"`,
    `GUPT_PUBKEY="${key}"`,
  ].join("\n");
});

const promptCopied = ref(false);
let copiedTimer = null;

function copyAgentInstruction() {
  promptCopied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (promptCopied.value = false), 2000);
  void copyToClipboard(agentInstruction.value).catch(() => {
    promptCopied.value = false;
  });
}

onUnmounted(() => clearTimeout(copiedTimer));
onMounted(() => {
  // Fills the prefilled pubkey in the agent prompt.
  void identity.init();
});
</script>

<template>
  <main class="integrations-view">
    <div class="integrations-view__main">
      <PageHeader eyebrow="Integrations" title="Connect gupt to other tools">
        <p class="integrations-view__lede">
          Everything gupt can talk to. Gupt has no central server, so integrations are things you
          run or subscribe to yourself — nothing here sees your message contents.
        </p>
      </PageHeader>

      <section class="integrations-section">
        <h2 class="integrations-section__label">All integrations</h2>
        <div class="integrations-list">
          <RouterLink
            v-for="(integration, index) in integrations"
            :key="integration.id"
            :to="integration.to"
            :style="{
              '--accent': integration.accent,
              '--app-item-delay': `${80 + index * 40}ms`,
            }"
            class="integration-row"
          >
            <span class="integration-row__mark" aria-hidden="true">
              <component
                :is="integration.icon"
                class="integration-row__mark-icon"
                :stroke-width="1.8"
              />
            </span>

            <div class="integration-row__body">
              <div class="integration-row__titleline">
                <h3 class="integration-row__name">{{ integration.name }}</h3>
                <span class="integration-row__tagline">{{ integration.tagline }}</span>
              </div>
              <p class="integration-row__description">{{ integration.description }}</p>
            </div>

            <span class="integration-row__cta">
              {{ integration.cta }}
              <ChevronRight class="integration-row__chevron" :stroke-width="2" aria-hidden="true" />
            </span>
          </RouterLink>
        </div>
      </section>

      <section class="integrations-section">
        <h2 class="integrations-section__label">For AI agents</h2>
        <div class="integrations-list">
          <!-- 1. Bot template -->
          <a
            :href="BOT_TEMPLATE_URL"
            target="_blank"
            rel="noopener noreferrer"
            class="integration-row integration-row--stack"
            style="--accent: var(--app-primary); --app-item-delay: 240ms"
          >
            <div class="integration-row__head">
              <span class="integration-row__mark" aria-hidden="true">
                <Bot class="integration-row__mark-icon" :stroke-width="1.8" />
              </span>
              <div class="integration-row__body">
                <div class="integration-row__titleline">
                  <h3 class="integration-row__name">Build your own bot</h3>
                  <span class="integration-row__badge">Template</span>
                </div>
                <p class="integration-row__tagline integration-row__tagline--plain">
                  Two-way bots in a Docker app
                </p>
              </div>
            </div>

            <p class="integration-row__description integration-row__description--inset">
              Start from working bots — media downloads, prices, music, torrents — that already
              speak the gupt wire format. Fork it, point your agent at it, and it fills in your own
              commands. Better than starting from a blank page.
            </p>

            <span class="integration-row__source">
              github.com/t3nklabs/gupt-bots
              <ExternalLink class="integration-row__source-icon" :stroke-width="2" aria-hidden="true" />
            </span>
          </a>

          <!-- 2. DM notifier prompt -->
          <div
            class="integration-row integration-row--stack"
            style="--accent: var(--app-warning); --app-item-delay: 280ms"
          >
            <div class="integration-row__head">
              <span class="integration-row__mark" aria-hidden="true">
                <Bell class="integration-row__mark-icon" :stroke-width="1.8" />
              </span>
              <div class="integration-row__body">
                <div class="integration-row__titleline">
                  <h3 class="integration-row__name">Get notifications in your DMs</h3>
                  <span class="integration-row__badge">AI agents</span>
                </div>
                <p class="integration-row__tagline integration-row__tagline--plain">
                  Your key, prefilled
                </p>
              </div>
              <button type="button" class="integration-row__copy" @click="copyAgentInstruction">
                <Check v-if="promptCopied" class="integration-row__copy-icon" :stroke-width="2.4" aria-hidden="true" />
                <Copy v-else class="integration-row__copy-icon" :stroke-width="1.8" aria-hidden="true" />
                <span>{{ promptCopied ? "Copied" : "Copy prompt" }}</span>
              </button>
            </div>

            <p class="integration-row__description integration-row__description--inset">
              Hand your agent this prompt. It reads the gupt source, then builds a notifier that
              sends you an encrypted DM — task finished, build failed, server down, anything. Your
              public key is already filled in.
            </p>

            <pre class="integration-code"><code>{{ agentInstruction }}</code></pre>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
/* Ledger pass: integrations are a directory of ruled entries. */

.integrations-view {
  min-height: 100vh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.integrations-view__main {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  width: 100%;
  max-width: 760px;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.integrations-view__lede {
  max-width: 60ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.65;
  color: var(--app-muted);
}

.integrations-section {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.integrations-section__label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.integrations-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-rise 480ms var(--app-ease-emphasized) both;
}

.integration-row {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  padding: 14px;
  color: var(--app-text);
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--app-dur-fast) var(--app-ease-standard);
}

.integration-row + .integration-row {
  border-top: 1px solid var(--app-border);
}

.integration-row--stack {
  flex-direction: column;
  gap: var(--app-space-3);
}

.integration-row__head {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  width: 100%;
}

.integration-row__mark {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--app-radius-sm);
  background: color-mix(in oklab, var(--accent) 12%, var(--app-surface));
  color: var(--accent);
}

.integration-row__mark-icon {
  width: 14px;
  height: 14px;
}

.integration-row__body {
  flex: 1;
  min-width: 0;
}

.integration-row__titleline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}

.integration-row__name {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.005em;
  color: var(--app-text);
}

.integration-row__tagline {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.integration-row__tagline--plain {
  display: block;
  margin: 2px 0 0;
  text-transform: none;
  letter-spacing: 0.02em;
  font-size: 9.5px;
}

.integration-row__badge {
  padding: 1px 5px;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted);
}

.integration-row__description {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--app-muted);
}

.integration-row__description--inset {
  margin: 0;
  padding-left: 42px;
}

.integration-row__cta {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  padding-top: 1px;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.integration-row__chevron {
  width: 11px;
  height: 11px;
  transition: transform var(--app-dur-fast) var(--app-ease-standard);
}

.integration-row__source {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding-left: 42px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
}

.integration-row__source-icon {
  width: 10px;
  height: 10px;
}

.integration-row__copy {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding-inline: 9px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.integration-row__copy-icon {
  width: 11px;
  height: 11px;
}

.integration-code {
  width: 100%;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.65;
  color: var(--app-text-soft);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.integration-code code {
  font: inherit;
}

@media (min-width: 40rem) {
  .integrations-view__main {
    padding-inline: var(--app-space-6);
  }

  .integration-row {
    padding: 16px;
  }
}

@media (max-width: 30rem) {
  .integration-row__cta {
    align-self: center;
  }

  .integration-row__cta span {
    display: none;
  }

  .integration-row__description--inset,
  .integration-row__source {
    padding-left: 0;
  }

  .integration-row__copy span {
    display: none;
  }

  .integration-row__copy {
    width: 28px;
    padding-inline: 0;
  }
}

@media (hover: hover) {
  .integration-row:hover {
    background: var(--app-surface-soft);
  }

  .integration-row:hover .integration-row__chevron {
    transform: translateX(2px);
  }

  .integration-row:hover .integration-row__name {
    color: var(--app-primary);
  }

  .integration-row__copy:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .integration-row__copy {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .integrations-view,
  .integrations-list {
    animation: none;
  }

  .integration-row,
  .integration-row__chevron,
  .integration-row__copy {
    transition: none;
  }
}
</style>
