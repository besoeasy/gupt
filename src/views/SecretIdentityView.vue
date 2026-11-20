<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  CloudOff,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PinStrengthMeter from "@/components/PinStrengthMeter.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import VaultTtlSlider from "@/components/VaultTtlSlider.vue";
import { useIdentityStore } from "@/stores/identity";
import { isSupported, VAULT_TTL_MS } from "@/lib/keyVault";
import { resumeTarget } from "@/router";
import {
  PIN_MIN_CHARS,
  isWeakSecret,
  secretEntropyBits,
  secretPinEntropyBits,
} from "@/lib/crypto";

const identity = useIdentityStore();
const route = useRoute();
const router = useRouter();

const paste = ref("");
const pin = ref("");
const ttlMs = ref(VAULT_TTL_MS);
const canRememberDevice = isSupported();
const message = ref("");
const error = ref("");
const busy = ref(false);

const secretBits = computed(() => secretEntropyBits(paste.value));
const isSecretWeak = computed(() => isWeakSecret(paste.value));
const pinValid = computed(() => pin.value.trim().length >= PIN_MIN_CHARS);
const pinBits = computed(() => secretPinEntropyBits(pin.value));
const canCreate = computed(() => !busy.value && paste.value.trim().length > 0 && pinValid.value);

const howItWorks = [
  {
    icon: ShieldCheck,
    text: "Secret and PIN are hashed once with Argon2id — that digest is your identity.",
  },
  {
    icon: RefreshCw,
    text: "The same pair derives the same account on every device. Nothing to store, sync or export.",
  },
  {
    icon: CloudOff,
    text: "Neither value is ever uploaded. Forget either one and the account is gone — that is the point.",
  },
];

async function create() {
  if (!canCreate.value) return;
  error.value = "";
  message.value = "";
  busy.value = true;
  try {
    await identity.createFromSecret(paste.value, pin.value, { ttlMs: ttlMs.value });
    paste.value = "";
    pin.value = "";
    message.value = "Identity created. Redirecting…";
    setTimeout(() => router.replace(resumeTarget(route.query)), 350);
  } catch (e) {
    error.value = e.message || "Failed to create identity.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <!-- Accent matches the "Paste a secret" card on /welcome, so the page you
       land on keeps the hue of the option you picked. -->
  <div
    class="secret-identity-view__block"
  >
    <div
      class="secret-identity-view__block-2"
      aria-hidden="true"
    />

    <main class="secret-identity-view__main">
      <header class="app-list-item secret-identity-view__header">
        <div
          class="secret-identity-view__block-3"
        >
          <KeyRound class="secret-identity-view__key-round" :stroke-width="1.7" aria-hidden="true" />
        </div>
        <h1 class="secret-identity-view__title-paste-a">Paste a secret</h1>
        <p class="secret-identity-view__text">
          Any text you can remember on any device — a passphrase, a sentence, a seed phrase.
        </p>
      </header>

      <p
        v-if="identity.isReady"
        class="app-list-item secret-identity-view__text-2"
      >
        This browser already holds
        <span class="secret-identity-view__text-3">
          {{ identity.profileName || identity.fingerprint || "an account" }} </span
        >. A different secret moves it to a new identity and clears that account's cached data.
      </p>

      <section
        class="app-list-item secret-identity-view__section"
      >
        <!-- Secret -->
        <div class="secret-identity-view__block-4">
          <label for="secret-paste" class="secret-identity-view__label-secret">
            Secret
          </label>
          <textarea
            id="secret-paste"
            v-model="paste"
            rows="6"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            placeholder="e.g. the passphrase you use everywhere…"
            class="secret-identity-view__field-e-g"
            :class="
              isSecretWeak
                ? 'secret-identity-view__field-e-g--variant-1'
                : 'secret-identity-view__field-e-g--variant-2'
            "
          />
          <div class="secret-identity-view__block-5">
            <span>Typed exactly as-is — spacing and case matter.</span>
            <span v-if="paste.length" class="secret-identity-view__text-4">{{
              paste.length
            }}</span>
          </div>

          <PinStrengthMeter :bits="secretBits" />

          <Transition
            enter-active-class="secret-identity-view__enter-active-class"
            enter-from-class="secret-identity-view__enter-from-class"
            enter-to-class="secret-identity-view__enter-to-class"
            leave-active-class="secret-identity-view__leave-active-class"
            leave-from-class="secret-identity-view__leave-from-class"
            leave-to-class="secret-identity-view__leave-to-class"
          >
            <div
              v-if="isSecretWeak"
              class="secret-identity-view__status"
              role="status"
            >
              <TriangleAlert
                class="secret-identity-view__triangle-alert"
                aria-hidden="true"
              />
              <div>
                <span class="secret-identity-view__text-weak-secret">Weak secret:</span>
                This secret is easy to guess. Consider using a longer passphrase, multiple random
                words, or a full sentence to protect your account.
              </div>
            </div>
          </Transition>
        </div>

        <!-- How it works -->
        <ul class="secret-identity-view__list">
          <li
            v-for="(point, index) in howItWorks"
            :key="index"
            class="secret-identity-view__item"
          >
            <span
              class="secret-identity-view__text-5"
            >
              <component
                :is="point.icon"
                class="secret-identity-view__component"
                :stroke-width="1.8"
                aria-hidden="true"
              />
            </span>
            {{ point.text }}
          </li>
        </ul>

        <!-- PIN -->
        <div class="secret-identity-view__block-6">
          <label for="secret-pin" class="secret-identity-view__label-pin">
            PIN
            <span class="secret-identity-view__text-6">— {{ PIN_MIN_CHARS }}+ letters or digits</span>
          </label>
          <input
            id="secret-pin"
            v-model="pin"
            type="text"
            inputmode="text"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            placeholder="e.g. olive4Seven"
            class="secret-identity-view__field-text"
          />
          <PinStrengthMeter :bits="pinBits" />
        </div>

        <!-- How long this device remembers the key. Hidden on plain HTTP,
             where nothing can be remembered in the first place. -->
        <div v-if="canRememberDevice" class="secret-identity-view__ttl">
          <VaultTtlSlider v-model="ttlMs" />
        </div>

        <PrimaryButton class="secret-identity-view__primary-button" @click="create" :disabled="!canCreate" :loading="busy">
          {{ busy ? "Deriving Argon2id key in memory…" : "Create identity" }}
        </PrimaryButton>
      </section>

      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />
    </main>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {
























@media (min-width:40rem) {
.secret-identity-view__section {
  padding: calc(var(--spacing) * 7);
}
}

@media (min-width:40rem) {
.secret-identity-view__main {
  padding-top: calc(var(--spacing) * 14);
}
}

@media (min-width:40rem) {
.secret-identity-view__title-paste-a {
  font-size: var(--text-4xl);
  line-height: var(--leading,var(--text-4xl--line-height));
}
}

@layer gupt-components {
.secret-identity-view__block-2 {
  pointer-events: none;
}
.secret-identity-view__block-2 {
  position: absolute;
}
.secret-identity-view__block {
  position: relative;
}
.secret-identity-view__main {
  position: relative;
}
.secret-identity-view__block-2 {
  inset-inline: 0;
}
.secret-identity-view__block-2 {
  top: 0;
}
.secret-identity-view__main {
  margin-inline: auto;
}
.secret-identity-view__triangle-alert {
  margin-top: calc(var(--spacing) * .5);
}
.secret-identity-view__text-5 {
  margin-top: calc(var(--spacing) * .5);
}
.secret-identity-view__text {
  margin-top: calc(var(--spacing) * 3);
}
.secret-identity-view__title-paste-a {
  margin-top: calc(var(--spacing) * 5);
}
.secret-identity-view__list {
  margin-top: calc(var(--spacing) * 5);
}
.secret-identity-view__block-6 {
  margin-top: calc(var(--spacing) * 5);
}
.secret-identity-view__text-2 {
  margin-top: calc(var(--spacing) * 6);
}
.secret-identity-view__section {
  margin-top: calc(var(--spacing) * 6);
}
.secret-identity-view__primary-button {
  margin-top: calc(var(--spacing) * 6);
}
.secret-identity-view__label-secret {
  display: block;
}
.secret-identity-view__field-e-g {
  display: block;
}
.secret-identity-view__label-pin {
  display: block;
}
.secret-identity-view__field-text {
  display: block;
}
.secret-identity-view__header {
  display: flex;
}
.secret-identity-view__block-3 {
  display: flex;
}
.secret-identity-view__block-5 {
  display: flex;
}
.secret-identity-view__status {
  display: flex;
}
.secret-identity-view__item {
  display: flex;
}
.secret-identity-view__text-5 {
  display: flex;
}
.secret-identity-view__component {
  width: calc(var(--spacing) * 3.5);
  height: calc(var(--spacing) * 3.5);
}
.secret-identity-view__triangle-alert {
  width: calc(var(--spacing) * 4);
  height: calc(var(--spacing) * 4);
}
.secret-identity-view__key-round {
  width: calc(var(--spacing) * 7);
  height: calc(var(--spacing) * 7);
}
.secret-identity-view__text-5 {
  width: calc(var(--spacing) * 7);
  height: calc(var(--spacing) * 7);
}
.secret-identity-view__block-3 {
  width: calc(var(--spacing) * 14);
  height: calc(var(--spacing) * 14);
}
.secret-identity-view__block-2 {
  height: 560px;
}
.secret-identity-view__block {
  min-height: 100%;
}
.secret-identity-view__block {
  width: 100%;
}
.secret-identity-view__main {
  width: 100%;
}
.secret-identity-view__field-e-g {
  width: 100%;
}
.secret-identity-view__field-text {
  width: 100%;
}
.secret-identity-view__main {
  max-width: var(--container-2xl);
}
.secret-identity-view__text {
  max-width: var(--container-md);
}
.secret-identity-view__triangle-alert {
  flex-shrink: 0;
}
.secret-identity-view__text-5 {
  flex-shrink: 0;
}
.secret-identity-view__leave-to-class {
  --translate-y: calc(var(--spacing) * -1);
  translate: var(--translate-x,0) calc(var(--spacing) * -1);
}
.secret-identity-view__enter-from-class {
  --translate-y: calc(var(--spacing) * -1.5);
  translate: var(--translate-x,0) calc(var(--spacing) * -1.5);
}
.secret-identity-view__enter-to-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.secret-identity-view__leave-from-class {
  --translate-y: 0;
  translate: var(--translate-x,0) 0;
}
.secret-identity-view__enter-to-class {
  --scale-x: 100%;
  --scale-y: 100%;
  --scale-z: 100%;
  scale: 100% 100%;
}
.secret-identity-view__leave-from-class {
  --scale-x: 100%;
  --scale-y: 100%;
  --scale-z: 100%;
  scale: 100% 100%;
}
.secret-identity-view__enter-from-class {
  scale: .98;
}
.secret-identity-view__leave-to-class {
  scale: .98;
}
.secret-identity-view__field-e-g {
  resize: vertical;
}
.secret-identity-view__header {
  flex-direction: column;
}
.secret-identity-view__header {
  align-items: center;
}
.secret-identity-view__block-3 {
  align-items: center;
}
.secret-identity-view__block-5 {
  align-items: center;
}
.secret-identity-view__text-5 {
  align-items: center;
}
.secret-identity-view__status {
  align-items: flex-start;
}
.secret-identity-view__item {
  align-items: flex-start;
}
.secret-identity-view__block-5 {
  justify-content: space-between;
}
.secret-identity-view__block-3 {
  justify-content: center;
}
.secret-identity-view__text-5 {
  justify-content: center;
}
.secret-identity-view__status {
  gap: calc(var(--spacing) * 2.5);
}
.secret-identity-view__item {
  gap: calc(var(--spacing) * 3);
}
:where(.secret-identity-view__block-4>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.secret-identity-view__block-6>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.secret-identity-view__list>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
.secret-identity-view__block {
  overflow-y: auto;
}
.secret-identity-view__block-3 {
  border-radius: var(--radius-2xl);
}
.secret-identity-view__section {
  border-radius: var(--radius-2xl);
}
.secret-identity-view__field-e-g {
  border-radius: 14px;
}
.secret-identity-view__field-text {
  border-radius: 14px;
}
.secret-identity-view__text-5 {
  border-radius: var(--radius-lg);
}
.secret-identity-view__text-2 {
  border-radius: var(--radius-xl);
}
.secret-identity-view__status {
  border-radius: var(--radius-xl);
}
.secret-identity-view__block-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-identity-view__text-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-identity-view__section {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-identity-view__field-e-g {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-identity-view__status {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-identity-view__text-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-identity-view__field-text {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-identity-view__list {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.secret-identity-view__block-6 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.secret-identity-view__text-2 {
  border-color: var(--app-border);
}
.secret-identity-view__section {
  border-color: var(--app-border);
}
.secret-identity-view__field-e-g--variant-2 {
  border-color: var(--app-border);
}
.secret-identity-view__list {
  border-color: var(--app-border);
}
.secret-identity-view__block-6 {
  border-color: var(--app-border);
}
.secret-identity-view__field-text {
  border-color: var(--app-border);
}
.secret-identity-view__text-5 {
  border-color: var(--accent);
}
.secret-identity-view__block-3 {
  border-color: var(--accent);
}
.secret-identity-view__status {
  border-color: var(--accent);
}
.secret-identity-view__field-e-g--variant-1 {
  border-color: var(--accent);
}
.secret-identity-view__block {
  background-color: var(--app-bg);
}
.secret-identity-view__text-2 {
  background-color: var(--app-surface);
}
.secret-identity-view__section {
  background-color: var(--app-surface);
}
.secret-identity-view__field-e-g {
  background-color: var(--app-surface-soft);
}
.secret-identity-view__field-text {
  background-color: var(--app-surface-soft);
}
.secret-identity-view__text-5 {
  background-color: var(--accent);
}
.secret-identity-view__status {
  background-color: var(--accent);
}
.secret-identity-view__block-3 {
  background-color: var(--accent);
}
.secret-identity-view__block-2 {
  background-image: radial-gradient(60% 50% at 50% 0%,var(--app-text),transparent);
}
.secret-identity-view__section {
  padding: calc(var(--spacing) * 5);
}
.secret-identity-view__status {
  padding-inline: calc(var(--spacing) * 3.5);
}
.secret-identity-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.secret-identity-view__text-2 {
  padding-inline: calc(var(--spacing) * 4);
}
.secret-identity-view__field-e-g {
  padding-inline: 1.125rem;
}
.secret-identity-view__field-text {
  padding-inline: 1.125rem;
}
.secret-identity-view__status {
  padding-block: calc(var(--spacing) * 2.5);
}
.secret-identity-view__text-2 {
  padding-block: calc(var(--spacing) * 3);
}
.secret-identity-view__field-text {
  padding-block: .75rem;
}
.secret-identity-view__field-e-g {
  padding-block: .875rem;
}
.secret-identity-view__list {
  padding-top: calc(var(--spacing) * 5);
}
.secret-identity-view__block-6 {
  padding-top: calc(var(--spacing) * 5);
}
.secret-identity-view__main {
  padding-top: calc(var(--spacing) * 10);
}
.secret-identity-view__main {
  padding-bottom: calc(var(--spacing) * 24);
}
.secret-identity-view__header {
  text-align: center;
}
.secret-identity-view__field-e-g {
  font-family: var(--font-mono);
}
.secret-identity-view__text-4 {
  font-family: var(--font-mono);
}
.secret-identity-view__field-text {
  font-family: var(--font-mono);
}
.secret-identity-view__title-paste-a {
  font-size: var(--text-3xl);
  line-height: var(--leading,var(--text-3xl--line-height));
}
.secret-identity-view__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.secret-identity-view__item {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.secret-identity-view__text-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.secret-identity-view__label-secret {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.secret-identity-view__status {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.secret-identity-view__label-pin {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.secret-identity-view__field-e-g {
  font-size: .85rem;
}
.secret-identity-view__field-text {
  font-size: .85rem;
}
.secret-identity-view__block-5 {
  font-size: 11px;
}
.secret-identity-view__field-e-g {
  --leading: 1.5;
  line-height: 1.5;
}
.secret-identity-view__text {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.secret-identity-view__text-2 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.secret-identity-view__status {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.secret-identity-view__item {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.secret-identity-view__text-3 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.secret-identity-view__text-6 {
  --font-weight: var(--font-weight-normal);
  font-weight: var(--font-weight-normal);
}
.secret-identity-view__title-paste-a {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.secret-identity-view__label-secret {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.secret-identity-view__text-weak-secret {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.secret-identity-view__label-pin {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.secret-identity-view__title-paste-a {
  --tracking: var(--tracking-tighter);
  letter-spacing: var(--tracking-tighter);
}
.secret-identity-view__text {
  color: var(--app-muted);
}
.secret-identity-view__text-2 {
  color: var(--app-muted);
}
.secret-identity-view__text-4 {
  color: var(--app-muted);
}
.secret-identity-view__item {
  color: var(--app-muted);
}
.secret-identity-view__text-6 {
  color: var(--app-muted);
}
.secret-identity-view__block-5 {
  color: var(--app-muted-2);
}
.secret-identity-view__block {
  color: var(--app-text);
}
.secret-identity-view__label-secret {
  color: var(--app-text);
}
.secret-identity-view__field-e-g {
  color: var(--app-text);
}
.secret-identity-view__status {
  color: var(--app-text);
}
.secret-identity-view__label-pin {
  color: var(--app-text);
}
.secret-identity-view__field-text {
  color: var(--app-text);
}
.secret-identity-view__text-3 {
  color: var(--app-text-soft);
}
.secret-identity-view__key-round {
  color: var(--accent);
}
.secret-identity-view__triangle-alert {
  color: var(--accent);
}
.secret-identity-view__text-weak-secret {
  color: var(--accent);
}
.secret-identity-view__component {
  color: var(--accent);
}
.secret-identity-view__enter-from-class {
  opacity: 0;
}
.secret-identity-view__leave-to-class {
  opacity: 0;
}
.secret-identity-view__enter-to-class {
  opacity: 1;
}
.secret-identity-view__leave-from-class {
  opacity: 1;
}
.secret-identity-view__section {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.secret-identity-view__field-e-g {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.secret-identity-view__enter-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.secret-identity-view__leave-active-class {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.secret-identity-view__field-text {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.secret-identity-view__field-e-g {
  --duration: .2s;
  transition-duration: .2s;
}
.secret-identity-view__leave-active-class {
  --duration: .2s;
  transition-duration: .2s;
}
.secret-identity-view__field-text {
  --duration: .2s;
  transition-duration: .2s;
}
.secret-identity-view__enter-active-class {
  --duration: .3s;
  transition-duration: .3s;
}
.secret-identity-view__leave-active-class {
  --ease: var(--ease-in);
  transition-timing-function: var(--ease-in);
}
.secret-identity-view__enter-active-class {
  --ease: var(--ease-out);
  transition-timing-function: var(--ease-out);
}
.secret-identity-view__block {
  --accent: #fbbf24;
}
.secret-identity-view__header {
  --app-item-delay: 40ms;
}
.secret-identity-view__text-2 {
  --app-item-delay: 70ms;
}
.secret-identity-view__section {
  --app-item-delay: .1s;
}
.secret-identity-view__field-e-g::placeholder {
  color: var(--app-muted-2);
}
.secret-identity-view__field-text::placeholder {
  color: var(--app-muted-2);
}
.secret-identity-view__field-e-g--variant-2:focus {
  border-color: var(--accent);
}
.secret-identity-view__field-text:focus {
  border-color: var(--accent);
}
.secret-identity-view__field-e-g--variant-1:focus {
  border-color: var(--accent);
}
.secret-identity-view__field-e-g:focus {
  background-color: var(--app-surface-hover);
}
.secret-identity-view__field-text:focus {
  background-color: var(--app-surface-hover);
}
.secret-identity-view__field-e-g:focus {
  --outline-style: none;
  outline-style: none;
}
.secret-identity-view__field-text:focus {
  --outline-style: none;
  outline-style: none;
}
.secret-identity-view__field-e-g:focus-visible {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.secret-identity-view__field-text:focus-visible {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.secret-identity-view__field-e-g:focus-visible {
  --ring-color: var(--accent);
}
.secret-identity-view__field-text:focus-visible {
  --ring-color: var(--accent);
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.secret-identity-view__text-5 {
  border-color: color-mix(in srgb,var(--accent) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-identity-view__block-3 {
  border-color: color-mix(in srgb,var(--accent) 28%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-identity-view__status {
  border-color: color-mix(in srgb,var(--accent) 35%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-identity-view__field-e-g--variant-1 {
  border-color: color-mix(in srgb,var(--accent) 55%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-identity-view__text-5 {
  background-color: color-mix(in srgb,var(--accent) 8%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-identity-view__status {
  background-color: color-mix(in srgb,var(--accent) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-identity-view__block-3 {
  background-color: color-mix(in srgb,var(--accent) 12%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-identity-view__block-2 {
  background-image: radial-gradient(60% 50% at 50% 0%,color-mix(in srgb,var(--app-text) 9%,transparent),transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-identity-view__field-e-g--variant-2:focus {
  border-color: color-mix(in srgb,var(--accent) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-identity-view__field-text:focus {
  border-color: color-mix(in srgb,var(--accent) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-identity-view__field-e-g:focus-visible {
  --ring-color: color-mix(in srgb,var(--accent) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-identity-view__field-text:focus-visible {
  --ring-color: color-mix(in srgb,var(--accent) 30%,transparent);
}
}
}

.secret-identity-view__ttl {
  margin-top: calc(var(--spacing) * 5);
  padding-top: calc(var(--spacing) * 5);
  border-top: 1px solid var(--app-border);
}
</style>
