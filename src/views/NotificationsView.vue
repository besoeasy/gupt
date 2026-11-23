<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Bell, Check, Copy, ExternalLink, Globe, Smartphone } from "@/icons";

import PageHeader from "@/components/PageHeader.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { dismissNtfyOnboarding, NTFY_LINKS } from "@/lib/ntfyOnboarding";
import { useIdentityStore } from "@/stores/identity";

const router = useRouter();
const identity = useIdentityStore();
const pubKeyCopied = ref(false);

const platforms = [
  {
    id: "ios",
    name: "iPhone & iPad",
    store: "App Store",
    href: NTFY_LINKS.ios,
    icon: Smartphone,
  },
  {
    id: "android",
    name: "Android",
    store: "Google Play",
    href: NTFY_LINKS.android,
    icon: Smartphone,
  },
  {
    id: "web",
    name: "Web browser",
    store: "ntfy.sh",
    href: NTFY_LINKS.website,
    icon: Globe,
  },
];

onMounted(() => {
  void identity.init();
});

async function copyPubKey() {
  if (!identity.pubkeyHex) return;
  await copyToClipboard(identity.pubkeyHex);
  pubKeyCopied.value = true;
  setTimeout(() => {
    pubKeyCopied.value = false;
  }, 2000);
}

function continueToApp() {
  dismissNtfyOnboarding();
  if (router.currentRoute.value.path === "/notifications") {
    void router.push("/");
  }
}
</script>

<template>
  <main class="notifications-view">
    <div class="notifications-view__main">
      <PageHeader eyebrow="Offline notifications" title="Get pinged when you're away">
        <p class="notifications-view__lede">
          Gupt has no central server and can't use normal push alerts on encrypted chats. Use the
          free, open-source
          <a
            :href="NTFY_LINKS.website"
            target="_blank"
            rel="noopener noreferrer"
            class="notifications-view__link-ntfy"
          >
            ntfy
          </a>
          app to receive anonymous wake-up pings when someone taps PING in your chat.
        </p>
      </PageHeader>

      <section class="notify-sheet">
        <article class="notify-step">
          <div class="notify-step__head">
            <span class="notify-step__index" aria-hidden="true">01</span>
            <div class="notify-step__text">
              <h2 class="notify-step__title">
                <Smartphone class="notify-step__icon" :stroke-width="1.9" aria-hidden="true" />
                Install ntfy
              </h2>
              <p class="notify-step__body">
                Download the free ntfy app on your phone, or use the web client in a browser tab.
              </p>
            </div>
          </div>

          <div class="notify-platforms">
            <a
              v-for="platform in platforms"
              :key="platform.id"
              :href="platform.href"
              target="_blank"
              rel="noopener noreferrer"
              class="notify-platform"
            >
              <component
                :is="platform.icon"
                class="notify-platform__icon"
                :stroke-width="1.9"
                aria-hidden="true"
              />
              <span class="notify-platform__name">{{ platform.name }}</span>
              <span class="notify-platform__store">
                {{ platform.store }}
                <ExternalLink class="notify-platform__external" :stroke-width="2" aria-hidden="true" />
              </span>
            </a>
          </div>
        </article>

        <article class="notify-step">
          <div class="notify-step__head">
            <span class="notify-step__index" aria-hidden="true">02</span>
            <div class="notify-step__text">
              <h2 class="notify-step__title">
                <Bell class="notify-step__icon" :stroke-width="1.9" aria-hidden="true" />
                Subscribe to your topic
              </h2>
              <p class="notify-step__body">
                Open ntfy, tap <span class="notify-step__inline">Subscribe to topic</span>, and paste
                your public key exactly as shown below. Your topic name is your GUPT identity — no
                email or phone number required.
              </p>
            </div>
          </div>

          <div class="notify-topic">
            <p class="notify-topic__label">Your ntfy topic</p>
            <p class="notify-topic__key">
              <template v-if="identity.pubkeyHex">{{ identity.pubkeyHex }}</template>
              <AppSkeleton v-else as="span" class="notify-topic__skeleton" />
            </p>
            <button
              v-if="identity.pubkeyHex"
              type="button"
              class="notify-topic__copy"
              :class="{ 'notify-topic__copy--done': pubKeyCopied }"
              @click="copyPubKey"
            >
              <Check v-if="pubKeyCopied" class="notify-topic__copy-icon" :stroke-width="2.4" aria-hidden="true" />
              <Copy v-else class="notify-topic__copy-icon" :stroke-width="1.9" aria-hidden="true" />
              {{ pubKeyCopied ? "Copied" : "Copy topic key" }}
            </button>
          </div>
        </article>

        <article class="notify-step">
          <div class="notify-step__head">
            <span class="notify-step__index" aria-hidden="true">03</span>
            <div class="notify-step__text">
              <h2 class="notify-step__title">How PING works</h2>
              <p class="notify-step__body">
                When a contact taps <span class="notify-step__inline">PING</span> while you're
                offline, ntfy delivers a short message like
                <span class="notify-step__quote">"Hey its swift-fox-042 — come online on gupt.app"</span>.
                No message content leaves the encrypted chat — it's just a nudge to open Gupt.
              </p>
            </div>
          </div>
        </article>

        <footer class="notify-actions">
          <PrimaryButton @click="continueToApp">
            <Check class="notify-actions__icon" :stroke-width="2" aria-hidden="true" />
            Done
          </PrimaryButton>
          <button type="button" class="notify-actions__skip" @click="continueToApp">
            Skip for now
          </button>
        </footer>
      </section>
    </div>
  </main>
</template>

<style scoped>
@layer base, gupt-components;

/* Ledger pass: setup steps read as numbered entries on one sheet. */

.notifications-view {
  min-height: 100vh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.notifications-view__main {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  width: 100%;
  max-width: 760px;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.notifications-view__lede {
  max-width: 60ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.65;
  color: var(--app-muted);
}

.notifications-view__link-ntfy {
  color: var(--app-text);
  text-decoration: underline;
  text-decoration-color: var(--app-border-strong);
  text-underline-offset: 2px;
}

.notify-sheet {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-rise 480ms var(--app-ease-emphasized) both;
}

.notify-step {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  padding: var(--app-space-5);
}

.notify-step + .notify-step {
  border-top: 1px solid var(--app-border);
}

.notify-step__head {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
}

.notify-step__index {
  padding-top: 1px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.notify-step__text {
  min-width: 0;
}

.notify-step__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

.notify-step__icon {
  width: 15px;
  height: 15px;
  color: var(--app-muted-2);
}

.notify-step__body {
  margin: 4px 0 0;
  font-size: var(--app-text-meta);
  line-height: 1.65;
  color: var(--app-muted);
}

.notify-step__inline {
  color: var(--app-text);
  font-weight: 500;
}

.notify-step__quote {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--app-text-soft);
}

.notify-platforms {
  display: grid;
  gap: 8px;
  padding-left: 22px;
}

.notify-platform {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 8px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  text-decoration: none;
  color: var(--app-text);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard);
}

.notify-platform__icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: var(--app-muted-2);
}

.notify-platform__name {
  font-size: 12.5px;
  font-weight: 500;
}

.notify-platform__store {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.notify-platform__external {
  width: 10px;
  height: 10px;
}

.notify-topic {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-left: 22px;
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
}

.notify-topic__label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.notify-topic__key {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.6;
  letter-spacing: 0.01em;
  color: var(--app-text);
  overflow-wrap: anywhere;
  user-select: all;
}

.notify-topic__skeleton {
  display: block;
  height: 14px;
  width: 60%;
}

.notify-topic__copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  align-self: flex-start;
  height: 30px;
  padding-inline: 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.notify-topic__copy--done {
  border-color: color-mix(in oklab, var(--app-success) 40%, var(--app-border));
  background: var(--app-success-soft);
  color: var(--app-success);
}

.notify-topic__copy-icon {
  width: 12px;
  height: 12px;
}

.notify-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--app-space-3);
  padding: var(--app-space-5);
  border-top: 1px solid var(--app-border);
  background: var(--app-surface-soft);
}

.notify-actions__icon {
  width: 13px;
  height: 13px;
}

.notify-actions__skip {
  min-height: 32px;
  padding-inline: 8px;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

@media (min-width: 40rem) {
  .notifications-view__main {
    padding-inline: var(--app-space-6);
  }

  .notify-step {
    padding: var(--app-space-6);
  }

  .notify-platforms {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .notify-platform {
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 6px;
    padding: 12px;
  }

  .notify-platform__store {
    width: 100%;
    margin-left: 0;
    padding-left: 26px;
  }
}

@media (max-width: 26rem) {
  .notify-topic {
    margin-left: 0;
    padding: 12px;
  }

  .notify-platforms {
    padding-left: 0;
  }
}

@media (hover: hover) {
  .notify-platform:hover {
    border-color: var(--app-border-strong);
    background: var(--app-surface-soft);
  }

  .notify-topic__copy:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .notify-actions__skip:hover {
    color: var(--app-text);
  }

  .notifications-view__link-ntfy:hover {
    color: var(--app-primary);
    text-decoration-color: currentColor;
  }
}

@media (pointer: coarse) {
  .notify-topic__copy,
  .notify-actions__skip {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .notifications-view,
  .notify-sheet {
    animation: none;
  }

  .notify-platform,
  .notify-topic__copy,
  .notify-actions__skip {
    transition: none;
  }
}
</style>
