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
  <main
    class="integrations-view__main"
  >
    <div class="integrations-view__block">
      <div class="integrations-view__block-2">
        <PageHeader eyebrow="Integrations" title="Connect gupt to other tools">
          <p class="integrations-view__text">
            Everything gupt can talk to. Gupt has no central server, so integrations are things you
            run or subscribe to yourself — nothing here sees your message contents.
          </p>
        </PageHeader>

        <section class="integrations-view__section">
          <h2
            class="app-list-item integrations-view__subtitle-all-integrations"
            style="--app-item-delay: 50ms"
          >
            All integrations
          </h2>
          <div class="integrations-view__block-3">
            <RouterLink
              v-for="(integration, index) in integrations"
              :key="integration.id"
              :to="integration.to"
              :style="{
                '--accent': integration.accent,
                '--app-item-delay': `${80 + index * 40}ms`,
              }"
              class="app-list-item integrations-view__router-link"
            >
              <!-- Accent bloom on hover -->
              <span
                aria-hidden="true"
                class="integrations-view__text-2"
                :style="{ background: 'var(--accent)' }"
              />

              <div
                class="integrations-view__block-4"
              >
                <component
                  :is="integration.icon"
                  class="integrations-view__component"
                  :stroke-width="1.8"
                  aria-hidden="true"
                />
              </div>

              <div class="integrations-view__block-5">
                <div class="integrations-view__block-6">
                  <h3 class="integrations-view__heading">
                    {{ integration.name }}
                  </h3>
                  <span
                    class="integrations-view__text-3"
                  >
                    {{ integration.tagline }}
                  </span>
                </div>
                <p class="integrations-view__text-4">
                  {{ integration.description }}
                </p>
              </div>

              <span
                class="integrations-view__text-5"
              >
                {{ integration.cta }}
                <ChevronRight class="integrations-view__chevron-right" :stroke-width="2" aria-hidden="true" />
              </span>
            </RouterLink>
          </div>
        </section>

        <section class="integrations-view__section-2">
          <h2
            class="app-list-item integrations-view__subtitle-for-ai"
            style="--app-item-delay: 200ms"
          >
            For AI agents
          </h2>

          <div class="integrations-view__block-7">
            <!-- 1. Bot template -->
            <a
              :href="BOT_TEMPLATE_URL"
              target="_blank"
              rel="noopener noreferrer"
              class="app-list-item integrations-view__link"
              style="--accent: #c084fc; --app-item-delay: 240ms"
            >
              <span
                aria-hidden="true"
                class="integrations-view__text-6"
                style="background: var(--accent)"
              />

              <div class="integrations-view__block-8">
                <div
                  class="integrations-view__block-9"
                >
                  <Bot class="integrations-view__bot" :stroke-width="1.8" aria-hidden="true" />
                </div>
                <div class="integrations-view__block-10">
                  <div class="integrations-view__block-11">
                    <h3 class="integrations-view__heading-build-your">
                      Build your own bot
                    </h3>
                    <span
                      class="integrations-view__text-template"
                    >
                      Template
                    </span>
                  </div>
                  <p class="integrations-view__text-7">Two-way bots in a Docker app</p>
                </div>
              </div>

              <p class="integrations-view__text-8">
                Start from working bots — media downloads, prices, music, torrents — that already
                speak the gupt wire format. Fork it, point your agent at it, and it fills in your
                own commands. Better than starting from a blank page.
              </p>

              <span
                class="integrations-view__text-9"
              >
                github.com/t3nklabs/gupt-bots
                <ExternalLink
                  class="integrations-view__external-link"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </span>
            </a>

            <!-- 2. DM notifier prompt -->
            <div
              class="app-list-item integrations-view__block-12"
              style="--accent: #38bdf8; --app-item-delay: 280ms"
            >
              <span
                aria-hidden="true"
                class="integrations-view__text-10"
                style="background: var(--accent)"
              />

              <div class="integrations-view__block-13">
                <div class="integrations-view__block-14">
                  <div
                    class="integrations-view__block-15"
                  >
                    <Bell class="integrations-view__bell" :stroke-width="1.8" aria-hidden="true" />
                  </div>
                  <div class="integrations-view__block-16">
                    <div class="integrations-view__block-17">
                      <h3 class="integrations-view__heading-2">
                        Get notifications in your DMs
                      </h3>
                      <span
                        class="integrations-view__text-ai-agents"
                      >
                        AI agents
                      </span>
                    </div>
                    <p class="integrations-view__text-your-key">Your key, prefilled</p>
                  </div>
                </div>

                <button
                  type="button"
                  class="integrations-view__button"
                  @click="copyAgentInstruction"
                >
                  <Check v-if="promptCopied" class="integrations-view__check" />
                  <Copy v-else class="integrations-view__copy" />
                  {{ promptCopied ? "Copied" : "Copy prompt" }}
                </button>
              </div>

              <p class="integrations-view__text-11">
                Hand your agent this prompt. It reads the gupt source, then builds a notifier that
                sends you an encrypted DM — task finished, build failed, server down, anything.
                Your public key is already filled in.
              </p>

              <pre
                class="integrations-view__code-block"
              ><code>{{ agentInstruction }}</code></pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {












@media (hover:hover) {
.integrations-view__text-5:is(:where(.integrations-view__router-link):hover *) {
  --translate-x: calc(var(--spacing) * .5);
  translate: calc(var(--spacing) * .5) var(--translate-y,0);
}
}

@media (hover:hover) {
.integrations-view__external-link:is(:where(.integrations-view__link):hover *) {
  --translate-x: calc(var(--spacing) * .5);
  translate: calc(var(--spacing) * .5) var(--translate-y,0);
}
}

@media (hover:hover) {
.integrations-view__external-link:is(:where(.integrations-view__link):hover *) {
  --translate-y: calc(var(--spacing) * -.5);
  translate: var(--translate-x,0) calc(var(--spacing) * -.5);
}
}

@media (hover:hover) {
.integrations-view__block-4:is(:where(.integrations-view__router-link):hover *) {
  --scale-x: 105%;
  --scale-y: 105%;
  --scale-z: 105%;
  scale: 105% 105%;
}
}

@media (hover:hover) {
.integrations-view__block-9:is(:where(.integrations-view__link):hover *) {
  --scale-x: 105%;
  --scale-y: 105%;
  --scale-z: 105%;
  scale: 105% 105%;
}
}

@media (hover:hover) {
.integrations-view__block-4:is(:where(.integrations-view__router-link):hover *) {
  border-color: var(--accent);
}
}

@media (hover:hover) {
.integrations-view__block-9:is(:where(.integrations-view__link):hover *) {
  border-color: var(--accent);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.integrations-view__block-4:is(:where(.integrations-view__router-link):hover *) {
  border-color: color-mix(in srgb,var(--accent) 55%,transparent);
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.integrations-view__block-9:is(:where(.integrations-view__link):hover *) {
  border-color: color-mix(in srgb,var(--accent) 55%,transparent);
}
}
}

@media (hover:hover) {
.integrations-view__block-4:is(:where(.integrations-view__router-link):hover *) {
  background-color: var(--accent);
}
}

@media (hover:hover) {
.integrations-view__block-9:is(:where(.integrations-view__link):hover *) {
  background-color: var(--accent);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.integrations-view__block-4:is(:where(.integrations-view__router-link):hover *) {
  background-color: color-mix(in srgb,var(--accent) 20%,transparent);
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.integrations-view__block-9:is(:where(.integrations-view__link):hover *) {
  background-color: color-mix(in srgb,var(--accent) 20%,transparent);
}
}
}

@media (hover:hover) {
.integrations-view__text-2:is(:where(.integrations-view__router-link):hover *) {
  opacity: .3;
}
}

@media (hover:hover) {
.integrations-view__text-6:is(:where(.integrations-view__link):hover *) {
  opacity: .3;
}
}

@media (hover:hover) {
.integrations-view__text-10:is(:where(.integrations-view__block-12):hover *) {
  opacity: .3;
}
}

@media (hover:hover) {
.integrations-view__router-link:hover {
  --translate-y: calc(var(--spacing) * -.5);
  translate: var(--translate-x,0) calc(var(--spacing) * -.5);
}
}

@media (hover:hover) {
.integrations-view__link:hover {
  --translate-y: calc(var(--spacing) * -.5);
  translate: var(--translate-x,0) calc(var(--spacing) * -.5);
}
}

@media (hover:hover) {
.integrations-view__button:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.integrations-view__router-link:hover {
  border-color: var(--accent);
}
}

@media (hover:hover) {
.integrations-view__link:hover {
  border-color: var(--accent);
}
}

@media (hover:hover) {
.integrations-view__block-12:hover {
  border-color: var(--accent);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.integrations-view__router-link:hover {
  border-color: color-mix(in srgb,var(--accent) 45%,transparent);
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.integrations-view__link:hover {
  border-color: color-mix(in srgb,var(--accent) 45%,transparent);
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.integrations-view__block-12:hover {
  border-color: color-mix(in srgb,var(--accent) 45%,transparent);
}
}
}

@media (hover:hover) {
.integrations-view__router-link:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.integrations-view__link:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.integrations-view__block-12:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.integrations-view__button:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.integrations-view__button:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.integrations-view__router-link:hover {
  --shadow: 0 16px 44px -16px var(--shadow-color,var(--accent));
}
}

@media (hover:hover) {
.integrations-view__link:hover {
  --shadow: 0 16px 44px -16px var(--shadow-color,var(--accent));
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.integrations-view__router-link:hover {
  --shadow: 0 16px 44px -16px var(--shadow-color,color-mix(in srgb,var(--accent) 55%,transparent));
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.integrations-view__link:hover {
  --shadow: 0 16px 44px -16px var(--shadow-color,color-mix(in srgb,var(--accent) 55%,transparent));
}
}
}

@media (hover:hover) {
.integrations-view__router-link:hover {
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), var(--shadow,0 0 #0000);
}
}

@media (hover:hover) {
.integrations-view__link:hover {
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), var(--shadow,0 0 #0000);
}
}

@media (min-width:40rem) {
.integrations-view__router-link {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.integrations-view__link {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.integrations-view__block-12 {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.integrations-view__block {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.integrations-view__main {
  height: 100%;
}
}

@media (min-width:64rem) {
.integrations-view__block-7 {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
}

@media (min-width:64rem) {
.integrations-view__block-7 {
  align-items: flex-start;
}
}

@media (min-width:64rem) {
.integrations-view__block {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.integrations-view__text-2 {
  pointer-events: none;
}
.integrations-view__text-6 {
  pointer-events: none;
}
.integrations-view__text-10 {
  pointer-events: none;
}
.integrations-view__text-2 {
  position: absolute;
}
.integrations-view__text-6 {
  position: absolute;
}
.integrations-view__text-10 {
  position: absolute;
}
.integrations-view__router-link {
  position: relative;
}
.integrations-view__block-4 {
  position: relative;
}
.integrations-view__block-5 {
  position: relative;
}
.integrations-view__text-5 {
  position: relative;
}
.integrations-view__link {
  position: relative;
}
.integrations-view__block-8 {
  position: relative;
}
.integrations-view__text-8 {
  position: relative;
}
.integrations-view__text-9 {
  position: relative;
}
.integrations-view__block-12 {
  position: relative;
}
.integrations-view__block-13 {
  position: relative;
}
.integrations-view__text-11 {
  position: relative;
}
.integrations-view__code-block {
  position: relative;
}
.integrations-view__text-2 {
  top: calc(var(--spacing) * -10);
}
.integrations-view__text-6 {
  top: calc(var(--spacing) * -10);
}
.integrations-view__text-10 {
  top: calc(var(--spacing) * -10);
}
.integrations-view__text-2 {
  left: calc(var(--spacing) * -10);
}
.integrations-view__text-6 {
  left: calc(var(--spacing) * -10);
}
.integrations-view__text-10 {
  left: calc(var(--spacing) * -10);
}
.integrations-view__block {
  margin-inline: auto;
}
.integrations-view__text-9 {
  margin-top: auto;
}
.integrations-view__router-link {
  display: flex;
}
.integrations-view__block-4 {
  display: flex;
}
.integrations-view__block-6 {
  display: flex;
}
.integrations-view__link {
  display: flex;
}
.integrations-view__block-8 {
  display: flex;
}
.integrations-view__block-9 {
  display: flex;
}
.integrations-view__block-11 {
  display: flex;
}
.integrations-view__block-12 {
  display: flex;
}
.integrations-view__block-13 {
  display: flex;
}
.integrations-view__block-14 {
  display: flex;
}
.integrations-view__block-15 {
  display: flex;
}
.integrations-view__block-17 {
  display: flex;
}
.integrations-view__block-3 {
  display: grid;
}
.integrations-view__block-7 {
  display: grid;
}
.integrations-view__text-5 {
  display: inline-flex;
}
.integrations-view__text-9 {
  display: inline-flex;
}
.integrations-view__button {
  display: inline-flex;
}
.integrations-view__chevron-right {
  width: calc(var(--spacing) * 3.5);
  height: calc(var(--spacing) * 3.5);
}
.integrations-view__external-link {
  width: calc(var(--spacing) * 3.5);
  height: calc(var(--spacing) * 3.5);
}
.integrations-view__check {
  width: calc(var(--spacing) * 3.5);
  height: calc(var(--spacing) * 3.5);
}
.integrations-view__copy {
  width: calc(var(--spacing) * 3.5);
  height: calc(var(--spacing) * 3.5);
}
.integrations-view__component {
  width: calc(var(--spacing) * 5);
  height: calc(var(--spacing) * 5);
}
.integrations-view__bot {
  width: calc(var(--spacing) * 5);
  height: calc(var(--spacing) * 5);
}
.integrations-view__bell {
  width: calc(var(--spacing) * 5);
  height: calc(var(--spacing) * 5);
}
.integrations-view__block-4 {
  width: calc(var(--spacing) * 11);
  height: calc(var(--spacing) * 11);
}
.integrations-view__block-9 {
  width: calc(var(--spacing) * 11);
  height: calc(var(--spacing) * 11);
}
.integrations-view__block-15 {
  width: calc(var(--spacing) * 11);
  height: calc(var(--spacing) * 11);
}
.integrations-view__text-2 {
  width: calc(var(--spacing) * 32);
  height: calc(var(--spacing) * 32);
}
.integrations-view__text-6 {
  width: calc(var(--spacing) * 32);
  height: calc(var(--spacing) * 32);
}
.integrations-view__text-10 {
  width: calc(var(--spacing) * 32);
  height: calc(var(--spacing) * 32);
}
.integrations-view__button {
  height: calc(var(--spacing) * 9);
}
.integrations-view__link {
  height: 100%;
}
.integrations-view__block-12 {
  height: 100%;
}
.integrations-view__button {
  min-height: 44px;
}
.integrations-view__main {
  min-height: 100dvh;
}
.integrations-view__block {
  width: 100%;
}
.integrations-view__block {
  max-width: var(--container-6xl);
}
.integrations-view__block-5 {
  min-width: 0;
}
.integrations-view__block-10 {
  min-width: 0;
}
.integrations-view__block-14 {
  min-width: 0;
}
.integrations-view__block-16 {
  min-width: 0;
}
.integrations-view__block-5 {
  flex: 1;
}
.integrations-view__block-10 {
  flex: 1;
}
.integrations-view__block-14 {
  flex: 1;
}
.integrations-view__block-4 {
  flex-shrink: 0;
}
.integrations-view__text-5 {
  flex-shrink: 0;
}
.integrations-view__block-9 {
  flex-shrink: 0;
}
.integrations-view__block-15 {
  flex-shrink: 0;
}
.integrations-view__button {
  flex-shrink: 0;
}
.integrations-view__button {
  cursor: pointer;
}
.integrations-view__link {
  flex-direction: column;
}
.integrations-view__block-12 {
  flex-direction: column;
}
.integrations-view__block-6 {
  flex-wrap: wrap;
}
.integrations-view__block-11 {
  flex-wrap: wrap;
}
.integrations-view__block-13 {
  flex-wrap: wrap;
}
.integrations-view__block-17 {
  flex-wrap: wrap;
}
.integrations-view__block-4 {
  align-items: center;
}
.integrations-view__block-6 {
  align-items: center;
}
.integrations-view__text-5 {
  align-items: center;
}
.integrations-view__block-8 {
  align-items: center;
}
.integrations-view__block-9 {
  align-items: center;
}
.integrations-view__block-11 {
  align-items: center;
}
.integrations-view__text-9 {
  align-items: center;
}
.integrations-view__block-13 {
  align-items: center;
}
.integrations-view__block-14 {
  align-items: center;
}
.integrations-view__block-15 {
  align-items: center;
}
.integrations-view__block-17 {
  align-items: center;
}
.integrations-view__button {
  align-items: center;
}
.integrations-view__router-link {
  align-items: flex-start;
}
.integrations-view__block-13 {
  justify-content: space-between;
}
.integrations-view__block-4 {
  justify-content: center;
}
.integrations-view__block-9 {
  justify-content: center;
}
.integrations-view__block-15 {
  justify-content: center;
}
.integrations-view__text-5 {
  gap: calc(var(--spacing) * .5);
}
.integrations-view__text-9 {
  gap: calc(var(--spacing) * 1.5);
}
.integrations-view__button {
  gap: calc(var(--spacing) * 1.5);
}
.integrations-view__block-6 {
  gap: calc(var(--spacing) * 2);
}
.integrations-view__block-11 {
  gap: calc(var(--spacing) * 2);
}
.integrations-view__block-17 {
  gap: calc(var(--spacing) * 2);
}
.integrations-view__block-3 {
  gap: calc(var(--spacing) * 3);
}
.integrations-view__block-7 {
  gap: calc(var(--spacing) * 3);
}
.integrations-view__link {
  gap: calc(var(--spacing) * 3);
}
.integrations-view__block-8 {
  gap: calc(var(--spacing) * 3);
}
.integrations-view__block-12 {
  gap: calc(var(--spacing) * 3);
}
.integrations-view__block-13 {
  gap: calc(var(--spacing) * 3);
}
.integrations-view__block-14 {
  gap: calc(var(--spacing) * 3);
}
.integrations-view__router-link {
  gap: calc(var(--spacing) * 4);
}
:where(.integrations-view__block-5>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.integrations-view__section>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.integrations-view__section-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.integrations-view__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 8) * 0);
  margin-block-end: calc(calc(var(--spacing) * 8) * calc(1 - 0));
}
:where(.integrations-view__block-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 8) * 0);
  margin-block-end: calc(calc(var(--spacing) * 8) * calc(1 - 0));
}
.integrations-view__text-5 {
  align-self: center;
}
.integrations-view__text-9 {
  align-self: flex-start;
}
.integrations-view__router-link {
  overflow: hidden;
}
.integrations-view__link {
  overflow: hidden;
}
.integrations-view__block-12 {
  overflow: hidden;
}
.integrations-view__code-block {
  overflow-x: auto;
}
.integrations-view__main {
  overflow-x: hidden;
}
.integrations-view__main {
  overflow-y: auto;
}
.integrations-view__router-link {
  border-radius: var(--radius-2xl);
}
.integrations-view__link {
  border-radius: var(--radius-2xl);
}
.integrations-view__block-12 {
  border-radius: var(--radius-2xl);
}
.integrations-view__text-2 {
  border-radius: 3.40282e38px;
}
.integrations-view__text-3 {
  border-radius: 3.40282e38px;
}
.integrations-view__text-6 {
  border-radius: 3.40282e38px;
}
.integrations-view__text-template {
  border-radius: 3.40282e38px;
}
.integrations-view__text-10 {
  border-radius: 3.40282e38px;
}
.integrations-view__text-ai-agents {
  border-radius: 3.40282e38px;
}
.integrations-view__block-4 {
  border-radius: var(--radius-xl);
}
.integrations-view__block-9 {
  border-radius: var(--radius-xl);
}
.integrations-view__block-15 {
  border-radius: var(--radius-xl);
}
.integrations-view__button {
  border-radius: var(--radius-xl);
}
.integrations-view__code-block {
  border-radius: var(--radius-xl);
}
.integrations-view__router-link {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.integrations-view__block-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.integrations-view__text-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.integrations-view__link {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.integrations-view__block-9 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.integrations-view__text-template {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.integrations-view__block-12 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.integrations-view__block-15 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.integrations-view__text-ai-agents {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.integrations-view__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.integrations-view__code-block {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.integrations-view__router-link {
  border-color: var(--app-border);
}
.integrations-view__text-3 {
  border-color: var(--app-border);
}
.integrations-view__link {
  border-color: var(--app-border);
}
.integrations-view__text-template {
  border-color: var(--app-border);
}
.integrations-view__block-12 {
  border-color: var(--app-border);
}
.integrations-view__text-ai-agents {
  border-color: var(--app-border);
}
.integrations-view__button {
  border-color: var(--app-border);
}
.integrations-view__code-block {
  border-color: var(--app-border);
}
.integrations-view__block-4 {
  border-color: var(--accent);
}
.integrations-view__block-9 {
  border-color: var(--accent);
}
.integrations-view__block-15 {
  border-color: var(--accent);
}
.integrations-view__main {
  background-color: var(--app-bg);
}
.integrations-view__router-link {
  background-color: var(--app-surface);
}
.integrations-view__link {
  background-color: var(--app-surface);
}
.integrations-view__block-12 {
  background-color: var(--app-surface);
}
.integrations-view__text-3 {
  background-color: var(--app-surface-raised);
}
.integrations-view__text-template {
  background-color: var(--app-surface-raised);
}
.integrations-view__text-ai-agents {
  background-color: var(--app-surface-raised);
}
.integrations-view__button {
  background-color: var(--app-surface-soft);
}
.integrations-view__code-block {
  background-color: var(--app-surface-soft);
}
.integrations-view__block-4 {
  background-color: var(--accent);
}
.integrations-view__block-9 {
  background-color: var(--accent);
}
.integrations-view__block-15 {
  background-color: var(--accent);
}
.integrations-view__router-link {
  padding: calc(var(--spacing) * 4);
}
.integrations-view__link {
  padding: calc(var(--spacing) * 4);
}
.integrations-view__block-12 {
  padding: calc(var(--spacing) * 4);
}
.integrations-view__text-3 {
  padding-inline: calc(var(--spacing) * 2);
}
.integrations-view__text-template {
  padding-inline: calc(var(--spacing) * 2);
}
.integrations-view__text-ai-agents {
  padding-inline: calc(var(--spacing) * 2);
}
.integrations-view__button {
  padding-inline: calc(var(--spacing) * 3.5);
}
.integrations-view__code-block {
  padding-inline: calc(var(--spacing) * 3.5);
}
.integrations-view__block {
  padding-inline: calc(var(--spacing) * 4);
}
.integrations-view__text-3 {
  padding-block: calc(var(--spacing) * .5);
}
.integrations-view__text-template {
  padding-block: calc(var(--spacing) * .5);
}
.integrations-view__text-ai-agents {
  padding-block: calc(var(--spacing) * .5);
}
.integrations-view__code-block {
  padding-block: calc(var(--spacing) * 3);
}
.integrations-view__block {
  padding-block: calc(var(--spacing) * 6);
}
.integrations-view__text-3 {
  font-family: var(--font-mono);
}
.integrations-view__text-template {
  font-family: var(--font-mono);
}
.integrations-view__text-ai-agents {
  font-family: var(--font-mono);
}
.integrations-view__code-block {
  font-family: var(--font-mono);
}
.integrations-view__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.integrations-view__heading {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.integrations-view__heading-build-your {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.integrations-view__heading-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.integrations-view__subtitle-all-integrations {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.integrations-view__text-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.integrations-view__text-5 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.integrations-view__subtitle-for-ai {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.integrations-view__text-7 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.integrations-view__text-8 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.integrations-view__text-9 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.integrations-view__text-your-key {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.integrations-view__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.integrations-view__text-11 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.integrations-view__text-3 {
  font-size: 9px;
}
.integrations-view__text-template {
  font-size: 9px;
}
.integrations-view__text-ai-agents {
  font-size: 9px;
}
.integrations-view__code-block {
  font-size: 11px;
}
.integrations-view__text {
  --leading: calc(var(--spacing) * 6);
  line-height: calc(var(--spacing) * 6);
}
.integrations-view__text-4 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.integrations-view__text-8 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.integrations-view__text-11 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.integrations-view__code-block {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.integrations-view__text-5 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.integrations-view__text-9 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.integrations-view__button {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.integrations-view__subtitle-all-integrations {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.integrations-view__heading {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.integrations-view__subtitle-for-ai {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.integrations-view__heading-build-your {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.integrations-view__heading-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.integrations-view__heading {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.integrations-view__heading-build-your {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.integrations-view__heading-2 {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.integrations-view__subtitle-all-integrations {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.integrations-view__text-3 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.integrations-view__subtitle-for-ai {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.integrations-view__text-template {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.integrations-view__text-ai-agents {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.integrations-view__code-block {
  overflow-wrap: break-word;
}
.integrations-view__code-block {
  white-space: pre-wrap;
}
.integrations-view__text {
  color: var(--app-muted);
}
.integrations-view__subtitle-all-integrations {
  color: var(--app-muted);
}
.integrations-view__text-3 {
  color: var(--app-muted);
}
.integrations-view__text-4 {
  color: var(--app-muted);
}
.integrations-view__subtitle-for-ai {
  color: var(--app-muted);
}
.integrations-view__text-template {
  color: var(--app-muted);
}
.integrations-view__text-7 {
  color: var(--app-muted);
}
.integrations-view__text-8 {
  color: var(--app-muted);
}
.integrations-view__text-ai-agents {
  color: var(--app-muted);
}
.integrations-view__text-your-key {
  color: var(--app-muted);
}
.integrations-view__text-11 {
  color: var(--app-muted);
}
.integrations-view__check {
  color: var(--app-success);
}
.integrations-view__main {
  color: var(--app-text);
}
.integrations-view__heading {
  color: var(--app-text);
}
.integrations-view__heading-build-your {
  color: var(--app-text);
}
.integrations-view__heading-2 {
  color: var(--app-text);
}
.integrations-view__button {
  color: var(--app-text-soft);
}
.integrations-view__code-block {
  color: var(--app-text-soft);
}
.integrations-view__block-4 {
  color: var(--accent);
}
.integrations-view__text-5 {
  color: var(--accent);
}
.integrations-view__block-9 {
  color: var(--accent);
}
.integrations-view__text-9 {
  color: var(--accent);
}
.integrations-view__block-15 {
  color: var(--accent);
}
.integrations-view__subtitle-all-integrations {
  text-transform: uppercase;
}
.integrations-view__text-3 {
  text-transform: uppercase;
}
.integrations-view__subtitle-for-ai {
  text-transform: uppercase;
}
.integrations-view__text-template {
  text-transform: uppercase;
}
.integrations-view__text-ai-agents {
  text-transform: uppercase;
}
.integrations-view__text-2 {
  opacity: 0;
}
.integrations-view__text-6 {
  opacity: 0;
}
.integrations-view__text-10 {
  opacity: 0;
}
.integrations-view__router-link {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.integrations-view__link {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.integrations-view__block-12 {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.integrations-view__button {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.integrations-view__text-2 {
  --blur: blur(var(--blur-2xl));
  filter: blur(var(--blur-2xl)) var(--brightness,) var(--contrast,) var(--grayscale,) var(--hue-rotate,) var(--invert,) var(--saturate,) var(--sepia,) var(--drop-shadow,);
}
.integrations-view__text-6 {
  --blur: blur(var(--blur-2xl));
  filter: blur(var(--blur-2xl)) var(--brightness,) var(--contrast,) var(--grayscale,) var(--hue-rotate,) var(--invert,) var(--saturate,) var(--sepia,) var(--drop-shadow,);
}
.integrations-view__text-10 {
  --blur: blur(var(--blur-2xl));
  filter: blur(var(--blur-2xl)) var(--brightness,) var(--contrast,) var(--grayscale,) var(--hue-rotate,) var(--invert,) var(--saturate,) var(--sepia,) var(--drop-shadow,);
}
.integrations-view__block-12 {
  transition-property: border-color,background-color;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.integrations-view__router-link {
  transition-property: transform,box-shadow,border-color,background-color;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.integrations-view__link {
  transition-property: transform,box-shadow,border-color,background-color;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.integrations-view__block-4 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.integrations-view__block-9 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.integrations-view__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.integrations-view__text-2 {
  transition-property: opacity;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.integrations-view__text-6 {
  transition-property: opacity;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.integrations-view__text-10 {
  transition-property: opacity;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.integrations-view__text-5 {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.integrations-view__external-link {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.integrations-view__router-link {
  --duration: .3s;
  transition-duration: .3s;
}
.integrations-view__block-4 {
  --duration: .3s;
  transition-duration: .3s;
}
.integrations-view__link {
  --duration: .3s;
  transition-duration: .3s;
}
.integrations-view__block-9 {
  --duration: .3s;
  transition-duration: .3s;
}
.integrations-view__external-link {
  --duration: .3s;
  transition-duration: .3s;
}
.integrations-view__block-12 {
  --duration: .3s;
  transition-duration: .3s;
}
.integrations-view__text-2 {
  --duration: .5s;
  transition-duration: .5s;
}
.integrations-view__text-6 {
  --duration: .5s;
  transition-duration: .5s;
}
.integrations-view__text-10 {
  --duration: .5s;
  transition-duration: .5s;
}
.integrations-view__router-link {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.integrations-view__text-2 {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.integrations-view__block-4 {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.integrations-view__link {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.integrations-view__text-6 {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.integrations-view__block-9 {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.integrations-view__external-link {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.integrations-view__block-12 {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.integrations-view__text-10 {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.integrations-view__code-block {
  -webkit-user-select: all;
  user-select: all;
}
.integrations-view__router-link:active {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.integrations-view__link:active {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.integrations-view__button:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.integrations-view__router-link:active {
  scale: .995;
}
.integrations-view__link:active {
  scale: .995;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.integrations-view__block-4 {
  border-color: color-mix(in srgb,var(--accent) 28%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.integrations-view__block-9 {
  border-color: color-mix(in srgb,var(--accent) 28%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.integrations-view__block-15 {
  border-color: color-mix(in srgb,var(--accent) 28%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.integrations-view__block-4 {
  background-color: color-mix(in srgb,var(--accent) 12%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.integrations-view__block-9 {
  background-color: color-mix(in srgb,var(--accent) 12%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.integrations-view__block-15 {
  background-color: color-mix(in srgb,var(--accent) 12%,transparent);
}
}
}
</style>
