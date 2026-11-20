<script setup>
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import {
  ChevronRight,
  CloudOff,
  FingerprintPattern,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  UserRound,
} from "@lucide/vue";
import { useIdentityStore } from "@/stores/identity";
import { isSupported as canRememberDevice } from "@/lib/keyVault";

const route = useRoute();
const identity = useIdentityStore();

// No crypto.subtle outside a secure context, so plain HTTP keeps the key in
// memory and asks for the secret every load. Say so instead of silently
// behaving differently.
const remembersDevice = canRememberDevice();

// init() is memoised, so this is free when App.vue already booted it.
onMounted(() => {
  void identity.init();
});

// Set when the guard bounced an account-less visit to a real page.
const bouncedFrom = computed(() => String(route.query.next || ""));

// The page doubles as the account switcher, so it stays reachable with an
// account loaded. Redirecting away would strand anyone who wants a second
// identity behind a destructive logout.
const heading = computed(() => {
  if (bouncedFrom.value) return "No account in this browser";
  return identity.isReady ? "Switch account" : "Create or restore an account";
});

const subheading = computed(() => {
  if (bouncedFrom.value) {
    return "Gupt signs every message with a key stored in this browser. Restore one to continue — nothing is sent under a throwaway identity.";
  }
  if (identity.isReady) {
    return "Pick a different secret to move this browser to another identity. Everything cached for the current one is cleared.";
  }
  return "Your identity is a secret you already know. Pick whichever one you can reproduce on any device.";
});

const currentName = computed(
  () => identity.profileName || identity.fingerprint || "Unnamed account",
);

/**
 * The ways to get an account. Each carries its own accent so the options
 * are told apart at a glance instead of reading as identical slabs, and
 * so the hover glow tells you which one you are about to open. The hue is bound
 * to a custom property, which every colour on the card then derives from.
 */
const methods = [
  {
    to: "/welcome/secret",
    icon: KeyRound,
    label: "Paste a secret",
    badge: "Recommended",
    description:
      "Any text at all — a passphrase, a sentence. One Argon2id pass with your PIN hardens it into your identity on every device.",
    accent: "#fbbf24",
  },
  {
    to: "/welcome/file",
    icon: FingerprintPattern,
    label: "Use a secret file",
    badge: "Two-factor",
    description:
      "A photo or keepsake only you have, plus a PIN. A copied file alone opens nothing — the file is never uploaded.",
    accent: "#34d399",
  },
];

// The promises both methods keep, restated so the chooser carries the
// same trust strip the sub-pages spell out as checklists.
const promises = [
  { icon: UserRound, text: "No email or phone number" },
  { icon: CloudOff, text: "Your secret is never uploaded" },
  { icon: RefreshCw, text: "Same secret, same account, any device" },
];
</script>

<template>
  <div class="welcome-view__block">
    <!-- Soft top glow, the way Vercel lifts its hero off the page. -->
    <div
      class="welcome-view__block-2"
      aria-hidden="true"
    />

    <main class="welcome-view__main">
      <!-- Hero mirrors the sub-pages: accent badge, 3xl title, short lede. -->
      <header class="app-list-item welcome-view__header">
        <div
          class="welcome-view__block-3"
        >
          <!-- The gupt mark, tinted by the theme like every other icon here. -->
          <svg viewBox="0 0 32 32" class="welcome-view__icon" aria-hidden="true">
            <path
              fill="currentColor"
              d="M16 5.5c-5.8 0-10.5 4.7-10.5 10.5s4.7 10.5 10.5 10.5c3.1 0 5.9-1.3 7.9-3.4V18.7h-4.5v-4.3h9.1v9.7C26.1 27 21.3 29 16 29c-7.2 0-13-5.8-13-13S8.8 3 16 3c3.8 0 7.2 1.6 9.7 4.1l-2.9 2.8C21 7.5 18.6 5.5 16 5.5Z"
            />
            <circle cx="23" cy="9" r="1.8" fill="currentColor" opacity="0.55" />
          </svg>
        </div>
        <h1 class="welcome-view__title">
          {{ heading }}
        </h1>
        <p class="welcome-view__text">
          {{ subheading }}
        </p>
      </header>

      <div
        v-if="!remembersDevice"
        class="app-list-item welcome-view__block-4"
      >
        <ShieldAlert class="welcome-view__shield-alert" aria-hidden="true" />
        <p class="welcome-view__text-2">
          <strong class="welcome-view__strong">This connection is not encrypted (HTTP).</strong>
          Nothing is stored on this device, so each visit needs your secret and PIN. Serve gupt
          over HTTPS to stay signed in and to keep the page safe from tampering.
        </p>
      </div>

      <div v-if="identity.isReady" class="app-list-item welcome-view__block-5">
        <div
          class="welcome-view__block-6"
        >
          <div class="welcome-view__block-7">
            <p class="welcome-view__text-current-account">
              Current account
            </p>
            <p class="welcome-view__text-3">{{ currentName }}</p>
            <p class="welcome-view__text-4">
              {{ identity.pubkeyHex }}
            </p>
          </div>
          <RouterLink
            to="/me"
            class="welcome-view__router-link-manage"
          >
            Manage
          </RouterLink>
        </div>
      </div>

      <div class="welcome-view__block-8">
        <RouterLink
          v-for="(method, index) in methods"
          :key="method.to"
          :to="method.to"
          :style="{
            '--accent': method.accent,
            '--app-item-delay': `${100 + index * 45}ms`,
          }"
          class="app-list-item welcome-view__router-link"
        >
          <!-- Accent bloom: the card takes on a colour of its own on hover. -->
          <span
            aria-hidden="true"
            class="welcome-view__text-5"
            :style="{ background: 'var(--accent)' }"
          />

          <div
            class="welcome-view__block-9"
          >
            <component
              :is="method.icon"
              class="welcome-view__component"
              :stroke-width="1.7"
              aria-hidden="true"
            />
          </div>

          <div class="welcome-view__block-10">
            <div class="welcome-view__block-11">
              <h2 class="welcome-view__subtitle">{{ method.label }}</h2>
              <span
                class="welcome-view__text-6"
                :class="
                  method.badge !== 'Advanced'
                    ? 'welcome-view__text--variant-1'
                    : 'welcome-view__text--variant-2'
                "
              >
                {{ method.badge }}
              </span>
            </div>
            <p
              class="welcome-view__text-7"
            >
              {{ method.description }}
            </p>
          </div>

          <ChevronRight
            aria-hidden="true"
            class="welcome-view__chevron-right"
          />
        </RouterLink>
      </div>

      <!-- Trust strip: the sub-pages' checklists, condensed into pills. -->
      <ul class="welcome-view__list">
        <li
          v-for="(promise, index) in promises"
          :key="promise.text"
          class="app-list-item welcome-view__item"
          :style="{ '--app-item-delay': `${190 + index * 30}ms` }"
        >
          <component
            :is="promise.icon"
            class="welcome-view__component-2"
            :stroke-width="1.8"
            aria-hidden="true"
          />
          {{ promise.text }}
        </li>
      </ul>
    </main>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.welcome-view__block-9 {
  border-color: color-mix(in srgb,var(--accent) 28%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.welcome-view__block-3 {
  border-color: color-mix(in srgb,var(--app-primary) 28%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.welcome-view__block-4 {
  border-color: color-mix(in oklab,var(--color-amber-500) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.welcome-view__block-9 {
  background-color: color-mix(in srgb,var(--accent) 12%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.welcome-view__text--variant-1 {
  background-color: color-mix(in srgb,var(--accent) 16%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.welcome-view__block-3 {
  background-color: color-mix(in srgb,var(--app-primary) 12%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.welcome-view__block-4 {
  background-color: color-mix(in oklab,var(--color-amber-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.welcome-view__block-2 {
  background-image: radial-gradient(60% 50% at 50% 0%,color-mix(in srgb,var(--app-text) 9%,transparent),transparent);
}
}

@media (hover:hover) {
.welcome-view__chevron-right:is(:where(.welcome-view__router-link):hover *) {
  --translate-x: 0;
  translate: 0 var(--translate-y,0);
}
}

@media (hover:hover) {
.welcome-view__block-9:is(:where(.welcome-view__router-link):hover *) {
  --scale-x: 105%;
  --scale-y: 105%;
  --scale-z: 105%;
  scale: 105% 105%;
}
}

@media (hover:hover) {
.welcome-view__component:is(:where(.welcome-view__router-link):hover *) {
  --scale-x: 110%;
  --scale-y: 110%;
  --scale-z: 110%;
  scale: 110% 110%;
}
}

@media (hover:hover) {
.welcome-view__block-9:is(:where(.welcome-view__router-link):hover *) {
  border-color: var(--accent);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.welcome-view__block-9:is(:where(.welcome-view__router-link):hover *) {
  border-color: color-mix(in srgb,var(--accent) 55%,transparent);
}
}
}

@media (hover:hover) {
.welcome-view__block-9:is(:where(.welcome-view__router-link):hover *) {
  background-color: var(--accent);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.welcome-view__block-9:is(:where(.welcome-view__router-link):hover *) {
  background-color: color-mix(in srgb,var(--accent) 20%,transparent);
}
}
}

@media (hover:hover) {
.welcome-view__text-7:is(:where(.welcome-view__router-link):hover *) {
  color: var(--app-text-soft);
}
}

@media (hover:hover) {
.welcome-view__text-5:is(:where(.welcome-view__router-link):hover *) {
  opacity: .4;
}
}

@media (hover:hover) {
.welcome-view__chevron-right:is(:where(.welcome-view__router-link):hover *) {
  opacity: .7;
}
}

@media (hover:hover) {
.welcome-view__router-link:hover {
  --translate-y: calc(var(--spacing) * -.5);
  translate: var(--translate-x,0) calc(var(--spacing) * -.5);
}
}

@media (hover:hover) {
.welcome-view__router-link-manage:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.welcome-view__router-link:hover {
  border-color: var(--accent);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.welcome-view__router-link:hover {
  border-color: color-mix(in srgb,var(--accent) 45%,transparent);
}
}
}

@media (hover:hover) {
.welcome-view__router-link-manage:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.welcome-view__router-link:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.welcome-view__router-link:hover {
  --shadow: 0 16px 44px -16px var(--shadow-color,var(--accent));
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.welcome-view__router-link:hover {
  --shadow: 0 16px 44px -16px var(--shadow-color,color-mix(in srgb,var(--accent) 55%,transparent));
}
}
}

@media (hover:hover) {
.welcome-view__router-link:hover {
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), var(--shadow,0 0 #0000);
}
}

@media (min-width:40rem) {
.welcome-view__block-8 {
  margin-top: calc(var(--spacing) * 12);
}
}

@media (min-width:40rem) {
.welcome-view__router-link {
  gap: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.welcome-view__router-link {
  padding: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.welcome-view__main {
  padding-top: calc(var(--spacing) * 14);
}
}

@media (min-width:40rem) {
.welcome-view__title {
  font-size: var(--text-4xl);
  line-height: var(--leading,var(--text-4xl--line-height));
}
}

@layer gupt-components {
.welcome-view__block-2 {
  pointer-events: none;
}
.welcome-view__text-5 {
  pointer-events: none;
}
.welcome-view__block-2 {
  position: absolute;
}
.welcome-view__text-5 {
  position: absolute;
}
.welcome-view__block {
  position: relative;
}
.welcome-view__main {
  position: relative;
}
.welcome-view__router-link {
  position: relative;
}
.welcome-view__block-9 {
  position: relative;
}
.welcome-view__block-10 {
  position: relative;
}
.welcome-view__chevron-right {
  position: relative;
}
.welcome-view__block-2 {
  inset-inline: 0;
}
.welcome-view__text-5 {
  top: calc(var(--spacing) * -9);
}
.welcome-view__block-2 {
  top: 0;
}
.welcome-view__text-5 {
  left: calc(var(--spacing) * -9);
}
.welcome-view__main {
  margin-inline: auto;
}
.welcome-view__block-4 {
  margin-inline: auto;
}
.welcome-view__shield-alert {
  margin-top: calc(var(--spacing) * .5);
}
.welcome-view__text-4 {
  margin-top: calc(var(--spacing) * .5);
}
.welcome-view__text-3 {
  margin-top: var(--spacing);
}
.welcome-view__chevron-right {
  margin-top: var(--spacing);
}
.welcome-view__text {
  margin-top: calc(var(--spacing) * 3);
}
.welcome-view__title {
  margin-top: calc(var(--spacing) * 5);
}
.welcome-view__block-4 {
  margin-top: calc(var(--spacing) * 6);
}
.welcome-view__list {
  margin-top: calc(var(--spacing) * 8);
}
.welcome-view__block-5 {
  margin-top: calc(var(--spacing) * 10);
}
.welcome-view__block-8 {
  margin-top: calc(var(--spacing) * 10);
}
.welcome-view__header {
  display: flex;
}
.welcome-view__block-3 {
  display: flex;
}
.welcome-view__block-4 {
  display: flex;
}
.welcome-view__block-6 {
  display: flex;
}
.welcome-view__router-link {
  display: flex;
}
.welcome-view__block-9 {
  display: flex;
}
.welcome-view__block-11 {
  display: flex;
}
.welcome-view__list {
  display: flex;
}
.welcome-view__item {
  display: flex;
}
.welcome-view__component-2 {
  width: calc(var(--spacing) * 3.5);
  height: calc(var(--spacing) * 3.5);
}
.welcome-view__shield-alert {
  width: calc(var(--spacing) * 4);
  height: calc(var(--spacing) * 4);
}
.welcome-view__chevron-right {
  width: calc(var(--spacing) * 5);
  height: calc(var(--spacing) * 5);
}
.welcome-view__component {
  width: calc(var(--spacing) * 6);
  height: calc(var(--spacing) * 6);
}
.welcome-view__icon {
  width: calc(var(--spacing) * 7);
  height: calc(var(--spacing) * 7);
}
.welcome-view__block-9 {
  width: calc(var(--spacing) * 13);
  height: calc(var(--spacing) * 13);
}
.welcome-view__block-3 {
  width: calc(var(--spacing) * 14);
  height: calc(var(--spacing) * 14);
}
.welcome-view__text-5 {
  width: calc(var(--spacing) * 32);
  height: calc(var(--spacing) * 32);
}
.welcome-view__block-2 {
  height: 560px;
}
.welcome-view__block {
  min-height: 100%;
}
.welcome-view__block {
  width: 100%;
}
.welcome-view__main {
  width: 100%;
}
.welcome-view__main {
  max-width: var(--container-2xl);
}
.welcome-view__text {
  max-width: var(--container-md);
}
.welcome-view__block-4 {
  max-width: var(--container-md);
}
.welcome-view__block-7 {
  min-width: 0;
}
.welcome-view__block-10 {
  min-width: 0;
}
.welcome-view__block-7 {
  flex: 1;
}
.welcome-view__block-10 {
  flex: 1;
}
.welcome-view__shield-alert {
  flex-shrink: 0;
}
.welcome-view__router-link-manage {
  flex-shrink: 0;
}
.welcome-view__block-9 {
  flex-shrink: 0;
}
.welcome-view__chevron-right {
  flex-shrink: 0;
}
.welcome-view__chevron-right {
  --translate-x: calc(var(--spacing) * -1.5);
  translate: calc(var(--spacing) * -1.5) var(--translate-y,0);
}
.welcome-view__header {
  flex-direction: column;
}
.welcome-view__block-11 {
  flex-wrap: wrap;
}
.welcome-view__list {
  flex-wrap: wrap;
}
.welcome-view__header {
  align-items: center;
}
.welcome-view__block-3 {
  align-items: center;
}
.welcome-view__block-6 {
  align-items: center;
}
.welcome-view__router-link {
  align-items: center;
}
.welcome-view__block-9 {
  align-items: center;
}
.welcome-view__block-11 {
  align-items: center;
}
.welcome-view__list {
  align-items: center;
}
.welcome-view__item {
  align-items: center;
}
.welcome-view__block-4 {
  align-items: flex-start;
}
.welcome-view__block-3 {
  justify-content: center;
}
.welcome-view__block-9 {
  justify-content: center;
}
.welcome-view__list {
  justify-content: center;
}
.welcome-view__item {
  gap: calc(var(--spacing) * 1.5);
}
.welcome-view__block-11 {
  gap: calc(var(--spacing) * 2);
}
.welcome-view__list {
  gap: calc(var(--spacing) * 2);
}
.welcome-view__block-4 {
  gap: calc(var(--spacing) * 3);
}
.welcome-view__block-6 {
  gap: calc(var(--spacing) * 4);
}
.welcome-view__router-link {
  gap: calc(var(--spacing) * 4);
}
:where(.welcome-view__block-10>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.welcome-view__block-8>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
.welcome-view__text-3 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.welcome-view__text-4 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.welcome-view__router-link {
  overflow: hidden;
}
.welcome-view__block {
  overflow-y: auto;
}
.welcome-view__block-3 {
  border-radius: var(--radius-2xl);
}
.welcome-view__router-link {
  border-radius: var(--radius-2xl);
}
.welcome-view__text-5 {
  border-radius: 3.40282e38px;
}
.welcome-view__text-6 {
  border-radius: 3.40282e38px;
}
.welcome-view__item {
  border-radius: 3.40282e38px;
}
.welcome-view__router-link-manage {
  border-radius: var(--radius-lg);
}
.welcome-view__block-4 {
  border-radius: var(--radius-xl);
}
.welcome-view__block-6 {
  border-radius: var(--radius-xl);
}
.welcome-view__block-9 {
  border-radius: var(--radius-xl);
}
.welcome-view__block-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.welcome-view__block-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.welcome-view__block-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.welcome-view__router-link-manage {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.welcome-view__router-link {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.welcome-view__block-9 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.welcome-view__item {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.welcome-view__block-6 {
  border-color: var(--app-border);
}
.welcome-view__router-link-manage {
  border-color: var(--app-border);
}
.welcome-view__router-link {
  border-color: var(--app-border);
}
.welcome-view__item {
  border-color: var(--app-border);
}
.welcome-view__block-9 {
  border-color: var(--accent);
}
.welcome-view__block-3 {
  border-color: var(--app-primary);
}
.welcome-view__block-4 {
  border-color: #f99c004d;
}
.welcome-view__block {
  background-color: var(--app-bg);
}
.welcome-view__block-6 {
  background-color: var(--app-surface);
}
.welcome-view__router-link {
  background-color: var(--app-surface);
}
.welcome-view__text--variant-2 {
  background-color: var(--app-surface-raised);
}
.welcome-view__item {
  background-color: var(--app-surface-soft);
}
.welcome-view__block-9 {
  background-color: var(--accent);
}
.welcome-view__text--variant-1 {
  background-color: var(--accent);
}
.welcome-view__block-3 {
  background-color: var(--app-primary);
}
.welcome-view__block-4 {
  background-color: #f99c001a;
}
.welcome-view__block-2 {
  background-image: radial-gradient(60% 50% at 50% 0%,var(--app-text),transparent);
}
.welcome-view__router-link {
  padding: calc(var(--spacing) * 5);
}
.welcome-view__text-6 {
  padding-inline: calc(var(--spacing) * 2);
}
.welcome-view__router-link-manage {
  padding-inline: calc(var(--spacing) * 3);
}
.welcome-view__item {
  padding-inline: calc(var(--spacing) * 3);
}
.welcome-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.welcome-view__block-4 {
  padding-inline: calc(var(--spacing) * 4);
}
.welcome-view__block-6 {
  padding-inline: calc(var(--spacing) * 5);
}
.welcome-view__text-6 {
  padding-block: calc(var(--spacing) * .5);
}
.welcome-view__item {
  padding-block: calc(var(--spacing) * 1.5);
}
.welcome-view__router-link-manage {
  padding-block: calc(var(--spacing) * 2);
}
.welcome-view__block-4 {
  padding-block: calc(var(--spacing) * 3);
}
.welcome-view__block-6 {
  padding-block: calc(var(--spacing) * 4);
}
.welcome-view__main {
  padding-top: calc(var(--spacing) * 10);
}
.welcome-view__main {
  padding-bottom: calc(var(--spacing) * 24);
}
.welcome-view__header {
  text-align: center;
}
.welcome-view__block-4 {
  text-align: left;
}
.welcome-view__text-4 {
  font-family: var(--font-mono);
}
.welcome-view__title {
  font-size: var(--text-3xl);
  line-height: var(--leading,var(--text-3xl--line-height));
}
.welcome-view__subtitle {
  font-size: var(--text-base);
  line-height: var(--leading,var(--text-base--line-height));
}
.welcome-view__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.welcome-view__text-3 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.welcome-view__text-7 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.welcome-view__text-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.welcome-view__router-link-manage {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.welcome-view__item {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.welcome-view__text-current-account {
  font-size: 11px;
}
.welcome-view__text-4 {
  font-size: 11px;
}
.welcome-view__text-6 {
  font-size: 11px;
}
.welcome-view__text {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.welcome-view__text-2 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.welcome-view__text-7 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.welcome-view__text-current-account {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.welcome-view__text-3 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.welcome-view__router-link-manage {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.welcome-view__subtitle {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.welcome-view__text-6 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.welcome-view__title {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.welcome-view__strong {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.welcome-view__title {
  --tracking: var(--tracking-tighter);
  letter-spacing: var(--tracking-tighter);
}
.welcome-view__text-current-account {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.welcome-view__text {
  color: var(--app-muted);
}
.welcome-view__text-current-account {
  color: var(--app-muted);
}
.welcome-view__text-4 {
  color: var(--app-muted);
}
.welcome-view__text--variant-2 {
  color: var(--app-muted);
}
.welcome-view__text-7 {
  color: var(--app-muted);
}
.welcome-view__item {
  color: var(--app-muted);
}
.welcome-view__component-2 {
  color: var(--app-muted-2);
}
.welcome-view__icon {
  color: var(--app-primary);
}
.welcome-view__block {
  color: var(--app-text);
}
.welcome-view__title {
  color: var(--app-text);
}
.welcome-view__text-3 {
  color: var(--app-text);
}
.welcome-view__subtitle {
  color: var(--app-text);
}
.welcome-view__router-link-manage {
  color: var(--app-text-soft);
}
.welcome-view__component {
  color: var(--accent);
}
.welcome-view__text--variant-1 {
  color: var(--accent);
}
.welcome-view__chevron-right {
  color: var(--accent);
}
.welcome-view__text-2 {
  color: var(--color-amber-200);
}
.welcome-view__shield-alert {
  color: var(--color-amber-400);
}
.welcome-view__text-current-account {
  text-transform: uppercase;
}
.welcome-view__text-5 {
  opacity: 0;
}
.welcome-view__chevron-right {
  opacity: 0;
}
.welcome-view__block-6 {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.welcome-view__router-link {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.welcome-view__text-5 {
  --blur: blur(var(--blur-2xl));
  filter: blur(var(--blur-2xl)) var(--brightness,) var(--contrast,) var(--grayscale,) var(--hue-rotate,) var(--invert,) var(--saturate,) var(--sepia,) var(--drop-shadow,);
}
.welcome-view__router-link {
  transition-property: transform,box-shadow,border-color,background-color;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.welcome-view__block-9 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.welcome-view__chevron-right {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.welcome-view__router-link-manage {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.welcome-view__text-7 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.welcome-view__text-5 {
  transition-property: opacity;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.welcome-view__component {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.welcome-view__router-link {
  --duration: .3s;
  transition-duration: .3s;
}
.welcome-view__block-9 {
  --duration: .3s;
  transition-duration: .3s;
}
.welcome-view__component {
  --duration: .3s;
  transition-duration: .3s;
}
.welcome-view__text-7 {
  --duration: .3s;
  transition-duration: .3s;
}
.welcome-view__chevron-right {
  --duration: .3s;
  transition-duration: .3s;
}
.welcome-view__text-5 {
  --duration: .5s;
  transition-duration: .5s;
}
.welcome-view__router-link {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.welcome-view__text-5 {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.welcome-view__block-9 {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.welcome-view__component {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.welcome-view__chevron-right {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.welcome-view__block-4 {
  --app-item-delay: 60ms;
}
.welcome-view__block-5 {
  --app-item-delay: 70ms;
}
.welcome-view__router-link:focus-visible {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.welcome-view__router-link:focus-visible {
  --ring-color: var(--accent);
}
.welcome-view__router-link:active {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.welcome-view__router-link:active {
  scale: .995;
}
[data-theme="light"] .welcome-view__text-2 {
  color: var(--app-warning-strong);
}
[data-theme="light"] .welcome-view__shield-alert {
  color: var(--app-warning);
}
}
}
</style>
