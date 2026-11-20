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
  <main
    class="notifications-view__main"
  >
    <div class="notifications-view__block">
      <div class="notifications-view__block-2">
        <PageHeader eyebrow="Offline notifications" title="Get pinged when you're away">
          <p class="notifications-view__text">
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

        <section class="notifications-view__section">
          <div
            class="notifications-view__block-3"
          >
            <div class="notifications-view__block-4">
              <p class="notifications-view__text-1-install">
                <Smartphone class="notifications-view__smartphone" :stroke-width="2" aria-hidden="true" />
                1. Install ntfy
              </p>
              <p class="notifications-view__text-2">
                Download the free ntfy app on your phone, or use the web client in a browser tab.
              </p>
            </div>

            <div class="notifications-view__block-5">
              <a
                v-for="platform in platforms"
                :key="platform.id"
                :href="platform.href"
                target="_blank"
                rel="noopener noreferrer"
                class="notifications-view__link"
              >
                <component
                  :is="platform.icon"
                  class="notifications-view__component"
                  :stroke-width="1.9"
                  aria-hidden="true"
                />
                <span class="notifications-view__text-3">{{ platform.name }}</span>
                <span class="notifications-view__text-4">
                  {{ platform.store }}
                  <ExternalLink class="notifications-view__external-link" :stroke-width="2" aria-hidden="true" />
                </span>
              </a>
            </div>
          </div>

          <div
            class="notifications-view__block-6"
          >
            <div class="notifications-view__block-7">
              <p class="notifications-view__text-5">
                <Bell class="notifications-view__bell" :stroke-width="2" aria-hidden="true" />
                2. Subscribe to your topic
              </p>
              <p class="notifications-view__text-6">
                Open ntfy, tap <span class="notifications-view__text-subscribe-to">Subscribe to topic</span>, and paste your
                public key exactly as shown below. Your topic name is your GUPT identity — no email
                or phone number required.
              </p>
            </div>

            <div class="notifications-view__block-8">
              <p class="notifications-view__text-your-ntfy">
                Your ntfy topic
              </p>
              <p
                class="notifications-view__text-7"
              >
                <template v-if="identity.pubkeyHex">{{ identity.pubkeyHex }}</template>
                <AppSkeleton v-else as="span" class="notifications-view__app-skeleton" />
              </p>
              <button
                v-if="identity.pubkeyHex"
                type="button"
                class="notifications-view__button"
                :class="pubKeyCopied ? 'notifications-view__button--success' : 'notifications-view__button--muted'"
                @click="copyPubKey"
              >
                <Copy
                  v-if="!pubKeyCopied"
                  class="notifications-view__copy"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <Check v-else class="notifications-view__check" :stroke-width="2.5" aria-hidden="true" />
                {{ pubKeyCopied ? "Copied" : "Copy topic key" }}
              </button>
            </div>
          </div>

          <div
            class="notifications-view__block-9"
          >
            <p class="notifications-view__text-how-ping">How PING works</p>
            <p class="notifications-view__text-8">
              When a contact taps <span class="notifications-view__text-ping">PING</span> while you're offline, ntfy
              delivers a short message like
              <span class="notifications-view__text-9">"Hey its swift-fox-042 — come online on gupt.app"</span>. No
              message content leaves the encrypted chat — it's just a nudge to open Gupt.
            </p>
          </div>

          <div class="notifications-view__block-10">
            <PrimaryButton @click="continueToApp">
              <Check class="notifications-view__check-2" :stroke-width="2" aria-hidden="true" />
              Done
            </PrimaryButton>
            <button
              type="button"
              class="notifications-view__button-skip-for"
              @click="continueToApp"
            >
              Skip for now
            </button>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {






@media (hover:hover) {
.notifications-view__link:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.notifications-view__button:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.notifications-view__link:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.notifications-view__button:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.notifications-view__button:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.notifications-view__button-skip-for:hover {
  color: var(--ui-zinc-300);
}
}

@media (hover:hover) {
.notifications-view__link-ntfy:hover {
  text-decoration-line: underline;
}
}

@media (min-width:40rem) {
.notifications-view__block-5 {
  grid-template-columns: repeat(3,minmax(0,1fr));
}
}

@media (min-width:40rem) {
.notifications-view__block-3 {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.notifications-view__block-6 {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.notifications-view__block-9 {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.notifications-view__block {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.notifications-view__main {
  height: 100%;
}
}

@media (min-width:64rem) {
.notifications-view__block {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.notifications-view__block {
  margin-inline: auto;
}
.notifications-view__app-skeleton {
  display: block;
}
.notifications-view__link {
  display: flex;
}
.notifications-view__block-5 {
  display: grid;
}
.notifications-view__text-1-install {
  display: inline-flex;
}
.notifications-view__text-4 {
  display: inline-flex;
}
.notifications-view__text-5 {
  display: inline-flex;
}
.notifications-view__button {
  display: inline-flex;
}
.notifications-view__external-link {
  height: calc(var(--spacing) * 3);
}
.notifications-view__app-skeleton {
  height: calc(var(--spacing) * 3.5);
}
.notifications-view__copy {
  height: calc(var(--spacing) * 3.5);
}
.notifications-view__check {
  height: calc(var(--spacing) * 3.5);
}
.notifications-view__smartphone {
  height: calc(var(--spacing) * 4);
}
.notifications-view__bell {
  height: calc(var(--spacing) * 4);
}
.notifications-view__check-2 {
  height: calc(var(--spacing) * 4);
}
.notifications-view__component {
  height: calc(var(--spacing) * 5);
}
.notifications-view__main {
  min-height: 100dvh;
}
.notifications-view__external-link {
  width: calc(var(--spacing) * 3);
}
.notifications-view__copy {
  width: calc(var(--spacing) * 3.5);
}
.notifications-view__check {
  width: calc(var(--spacing) * 3.5);
}
.notifications-view__smartphone {
  width: calc(var(--spacing) * 4);
}
.notifications-view__bell {
  width: calc(var(--spacing) * 4);
}
.notifications-view__check-2 {
  width: calc(var(--spacing) * 4);
}
.notifications-view__component {
  width: calc(var(--spacing) * 5);
}
.notifications-view__app-skeleton {
  width: calc(var(--spacing) * 64);
}
.notifications-view__block {
  width: 100%;
}
.notifications-view__button-skip-for {
  width: 100%;
}
.notifications-view__block {
  max-width: var(--container-6xl);
}
.notifications-view__app-skeleton {
  max-width: 100%;
}
.notifications-view__link {
  flex-direction: column;
}
.notifications-view__text-1-install {
  align-items: center;
}
.notifications-view__link {
  align-items: center;
}
.notifications-view__text-4 {
  align-items: center;
}
.notifications-view__text-5 {
  align-items: center;
}
.notifications-view__button {
  align-items: center;
}
.notifications-view__text-4 {
  gap: var(--spacing);
}
.notifications-view__button {
  gap: var(--spacing);
}
.notifications-view__text-1-install {
  gap: calc(var(--spacing) * 1.5);
}
.notifications-view__text-5 {
  gap: calc(var(--spacing) * 1.5);
}
.notifications-view__link {
  gap: calc(var(--spacing) * 2);
}
.notifications-view__block-5 {
  gap: calc(var(--spacing) * 3);
}
:where(.notifications-view__block-4>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.notifications-view__block-7>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.notifications-view__block-8>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.notifications-view__block-9>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.notifications-view__block-10>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.notifications-view__section>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.notifications-view__block-3>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.notifications-view__block-6>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.notifications-view__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 8) * 0);
  margin-block-end: calc(calc(var(--spacing) * 8) * calc(1 - 0));
}
:where(.notifications-view__block-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 8) * 0);
  margin-block-end: calc(calc(var(--spacing) * 8) * calc(1 - 0));
}
.notifications-view__main {
  overflow-x: hidden;
}
.notifications-view__main {
  overflow-y: auto;
}
.notifications-view__block-3 {
  border-radius: var(--radius-2xl);
}
.notifications-view__link {
  border-radius: var(--radius-2xl);
}
.notifications-view__block-6 {
  border-radius: var(--radius-2xl);
}
.notifications-view__block-9 {
  border-radius: var(--radius-2xl);
}
.notifications-view__button {
  border-radius: 3.40282e38px;
}
.notifications-view__text-7 {
  border-radius: var(--radius-xl);
}
.notifications-view__block-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notifications-view__link {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notifications-view__block-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notifications-view__text-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notifications-view__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notifications-view__block-9 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.notifications-view__block-3 {
  border-color: var(--app-border);
}
.notifications-view__link {
  border-color: var(--app-border);
}
.notifications-view__block-6 {
  border-color: var(--app-border);
}
.notifications-view__text-7 {
  border-color: var(--app-border);
}
.notifications-view__button {
  border-color: var(--app-border);
}
.notifications-view__block-9 {
  border-color: var(--app-border);
}
.notifications-view__main {
  background-color: var(--app-bg);
}
.notifications-view__link {
  background-color: var(--app-surface-soft);
}
.notifications-view__text-7 {
  background-color: var(--app-surface-soft);
}
.notifications-view__button {
  background-color: var(--app-surface-soft);
}
.notifications-view__block-3 {
  background-color: var(--app-surface);
}
.notifications-view__block-6 {
  background-color: var(--app-surface);
}
.notifications-view__block-9 {
  background-color: var(--app-surface);
}
.notifications-view__block-3 {
  padding: calc(var(--spacing) * 4);
}
.notifications-view__link {
  padding: calc(var(--spacing) * 4);
}
.notifications-view__block-6 {
  padding: calc(var(--spacing) * 4);
}
.notifications-view__block-9 {
  padding: calc(var(--spacing) * 4);
}
.notifications-view__text-7 {
  padding-inline: calc(var(--spacing) * 3);
}
.notifications-view__button {
  padding-inline: calc(var(--spacing) * 3);
}
.notifications-view__block {
  padding-inline: calc(var(--spacing) * 4);
}
.notifications-view__button {
  padding-block: var(--spacing);
}
.notifications-view__text-7 {
  padding-block: calc(var(--spacing) * 2.5);
}
.notifications-view__block {
  padding-block: calc(var(--spacing) * 6);
}
.notifications-view__block-10 {
  padding-top: calc(var(--spacing) * 2);
}
.notifications-view__link {
  text-align: center;
}
.notifications-view__button-skip-for {
  text-align: center;
}
.notifications-view__text-7 {
  font-family: var(--font-mono);
}
.notifications-view__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.notifications-view__text-1-install {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.notifications-view__text-3 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.notifications-view__text-5 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.notifications-view__text-how-ping {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.notifications-view__button-skip-for {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.notifications-view__text-7 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.notifications-view__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.notifications-view__text-2 {
  font-size: 11px;
}
.notifications-view__text-4 {
  font-size: 11px;
}
.notifications-view__text-6 {
  font-size: 11px;
}
.notifications-view__text-your-ntfy {
  font-size: 11px;
}
.notifications-view__text-8 {
  font-size: 11px;
}
.notifications-view__text {
  --leading: calc(var(--spacing) * 6);
  line-height: calc(var(--spacing) * 6);
}
.notifications-view__text-2 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.notifications-view__text-6 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.notifications-view__text-7 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.notifications-view__text-8 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.notifications-view__text-1-install {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.notifications-view__text-3 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.notifications-view__text-5 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.notifications-view__text-your-ntfy {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.notifications-view__text-how-ping {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.notifications-view__text-your-ntfy {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.notifications-view__text-7 {
  word-break: break-all;
}
.notifications-view__text {
  color: var(--app-muted);
}
.notifications-view__text-2 {
  color: var(--app-muted);
}
.notifications-view__text-4 {
  color: var(--app-muted);
}
.notifications-view__text-6 {
  color: var(--app-muted);
}
.notifications-view__text-8 {
  color: var(--app-muted);
}
.notifications-view__button-skip-for {
  color: var(--app-muted);
}
.notifications-view__link-ntfy {
  color: var(--app-primary);
}
.notifications-view__component {
  color: var(--app-primary);
}
.notifications-view__main {
  color: var(--app-text);
}
.notifications-view__button {
  color: var(--app-text-soft);
}
.notifications-view__button--success {
  color: var(--color-emerald-400);
}
.notifications-view__text-3 {
  color: var(--ui-zinc-200);
}
.notifications-view__text-1-install {
  color: var(--ui-zinc-300);
}
.notifications-view__text-5 {
  color: var(--ui-zinc-300);
}
.notifications-view__text-7 {
  color: var(--ui-zinc-300);
}
.notifications-view__text-how-ping {
  color: var(--ui-zinc-300);
}
.notifications-view__text-subscribe-to {
  color: var(--ui-zinc-400);
}
.notifications-view__button--muted {
  color: var(--ui-zinc-400);
}
.notifications-view__text-ping {
  color: var(--ui-zinc-400);
}
.notifications-view__text-your-ntfy {
  color: var(--ui-zinc-500);
}
.notifications-view__text-your-ntfy {
  text-transform: uppercase;
}
.notifications-view__text-9 {
  font-style: italic;
}
.notifications-view__external-link {
  opacity: .6;
}
.notifications-view__block-3 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.notifications-view__block-6 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.notifications-view__block-9 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.notifications-view__link {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.notifications-view__button {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.notifications-view__button-skip-for {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.notifications-view__text-7 {
  -webkit-user-select: all;
  user-select: all;
}
[data-theme="light"] .notifications-view__button--success {
  color: var(--app-success);
}
[data-theme="light"] .notifications-view__text-1-install {
  color: var(--app-text-soft);
}
[data-theme="light"] .notifications-view__text-5 {
  color: var(--app-text-soft);
}
[data-theme="light"] .notifications-view__text-7 {
  color: var(--app-text-soft);
}
[data-theme="light"] .notifications-view__text-how-ping {
  color: var(--app-text-soft);
}
[data-theme="light"] .notifications-view__text-subscribe-to {
  color: var(--app-muted);
}
[data-theme="light"] .notifications-view__button--muted {
  color: var(--app-muted);
}
[data-theme="light"] .notifications-view__text-ping {
  color: var(--app-muted);
}
[data-theme="light"] .notifications-view__text-your-ntfy {
  color: var(--app-muted);
}
[data-theme="light"] .notifications-view__button-skip-for:hover {
  color: var(--app-text) !important;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.notifications-view__block-3 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.notifications-view__block-6 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.notifications-view__block-9 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}
}
</style>
