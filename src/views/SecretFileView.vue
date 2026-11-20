<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  FingerprintPattern,
  FolderOpen,
  Lock,
  RefreshCw,
  ShieldCheck,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PinStrengthMeter from "@/components/PinStrengthMeter.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import VaultTtlSlider from "@/components/VaultTtlSlider.vue";
import { useIdentityStore } from "@/stores/identity";
import { isSupported, VAULT_TTL_MS } from "@/lib/keyVault";
import { resumeTarget } from "@/router";
import {
  hashSecretFile,
  MAX_SECRET_FILE_BYTES,
  PIN_MIN_CHARS,
  secretPinEntropyBits,
} from "@/lib/crypto";

const identity = useIdentityStore();
const route = useRoute();
const router = useRouter();

const fileInput = ref(null);
const pickedName = ref("");
const pickedSize = ref(0);
const fileHash = ref("");
const pin = ref("");
const ttlMs = ref(VAULT_TTL_MS);
const canRememberDevice = isSupported();
const busy = ref(false);
const message = ref("");
const error = ref("");

const pinValid = computed(() => pin.value.trim().length >= PIN_MIN_CHARS);
const pinBits = computed(() => secretPinEntropyBits(pin.value));
const canCreate = computed(() => Boolean(fileHash.value) && pinValid.value && !busy.value);

const sizeLabel = computed(() => {
  const bytes = pickedSize.value;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
});

const howItWorks = [
  {
    icon: ShieldCheck,
    text: "The file's SHA-256 and your PIN are hashed once with Argon2id — that digest is your identity.",
  },
  {
    icon: RefreshCw,
    text: "The same file and PIN derive the same account on every device. Nothing to store, sync or export.",
  },
  {
    icon: Lock,
    text: "The file is read locally and never uploaded — only its hash is used. A copied file alone opens nothing.",
  },
];

function clearPicked() {
  pickedName.value = "";
  pickedSize.value = 0;
  fileHash.value = "";
  if (fileInput.value) fileInput.value.value = "";
}

function resetFeedback() {
  message.value = "";
  error.value = "";
}

async function onFileChange(event) {
  resetFeedback();
  const file = event.target.files?.[0];
  if (!file) {
    clearPicked();
    return;
  }

  pickedName.value = file.name;
  pickedSize.value = file.size;
  fileHash.value = "";

  try {
    fileHash.value = await hashSecretFile(file);
  } catch (e) {
    clearPicked();
    error.value = e.message || "Could not read that file.";
  }
}

async function create() {
  if (!canCreate.value) return;
  busy.value = true;
  resetFeedback();
  try {
    await identity.createFromSecret(fileHash.value, pin.value, { ttlMs: ttlMs.value });
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
  <!-- Emerald matches the "Use a secret file" card on /welcome. -->
  <div
    class="secret-file-view__block"
  >
    <div
      class="secret-file-view__block-2"
      aria-hidden="true"
    />

    <main class="secret-file-view__main">
      <header class="app-list-item secret-file-view__header">
        <div
          class="secret-file-view__block-3"
        >
          <FingerprintPattern class="secret-file-view__fingerprint-pattern" :stroke-width="1.7" aria-hidden="true" />
        </div>
        <h1 class="secret-file-view__title-use-a">Use a secret file</h1>
        <p class="secret-file-view__text">
          A photo or keepsake only you have, plus a PIN — two-factor sign-in.
        </p>
      </header>

      <p
        v-if="identity.isReady"
        class="app-list-item secret-file-view__text-2"
      >
        This browser already holds
        <span class="secret-file-view__text-3">
          {{ identity.profileName || identity.fingerprint || "an account" }} </span
        >. A different secret moves it to a new identity and clears that account's cached data.
      </p>

      <section
        class="app-list-item secret-file-view__section"
      >
        <!-- File picker -->
        <input ref="fileInput" type="file" class="secret-file-view__field-file" @change="onFileChange" />

        <div class="secret-file-view__block-4">
          <span class="secret-file-view__text-file">File</span>

          <button
            v-if="!pickedName"
            type="button"
            class="secret-file-view__button"
            @click="fileInput?.click()"
          >
            <span
              class="secret-file-view__text-4"
            >
              <FolderOpen
                class="secret-file-view__folder-open"
                :stroke-width="1.7"
                aria-hidden="true"
              />
            </span>
            <span class="secret-file-view__text-choose-a">Choose a file</span>
            <span class="secret-file-view__text-5">
              An old photo, a keepsake, anything — up to {{ Math.round(MAX_SECRET_FILE_BYTES / (1024 * 1024)) }} MB
            </span>
          </button>

          <div
            v-else
            class="secret-file-view__block-5"
          >
            <div class="secret-file-view__block-6">
              <span
                class="secret-file-view__text-6"
              >
                <FingerprintPattern class="secret-file-view__fingerprint-pattern-2" :stroke-width="1.8" aria-hidden="true" />
              </span>
              <div class="secret-file-view__block-7">
                <p class="secret-file-view__text-7">{{ pickedName }}</p>
                <p class="secret-file-view__text-8">
                  {{ sizeLabel }} · hashing…
                </p>
              </div>
              <button
                type="button"
                class="secret-file-view__button-clear"
                @click="clearPicked"
              >
                Clear
              </button>
            </div>
            <p
              v-if="fileHash"
              class="secret-file-view__text-9"
            >
              {{ fileHash }}
            </p>
          </div>

          <button
            v-if="pickedName"
            type="button"
            class="secret-file-view__button-choose-a"
            @click="fileInput?.click()"
          >
            Choose a different file
          </button>
        </div>

        <!-- How it works -->
        <ul class="secret-file-view__list">
          <li
            v-for="(point, index) in howItWorks"
            :key="index"
            class="secret-file-view__item"
          >
            <span
              class="secret-file-view__text-10"
            >
              <component
                :is="point.icon"
                class="secret-file-view__component"
                :stroke-width="1.8"
                aria-hidden="true"
              />
            </span>
            {{ point.text }}
          </li>
        </ul>

        <!-- PIN -->
        <div class="secret-file-view__block-8">
          <label for="file-pin" class="secret-file-view__label-pin">
            PIN
            <span class="secret-file-view__text-11">— {{ PIN_MIN_CHARS }}+ letters or digits</span>
          </label>
          <input
            id="file-pin"
            v-model="pin"
            type="text"
            inputmode="text"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            placeholder="e.g. prairie9Violet"
            class="secret-file-view__field-text"
          />
          <PinStrengthMeter :bits="pinBits" suffix=", on top of the file" />
        </div>

        <!-- How long this device remembers the key. Hidden on plain HTTP,
             where nothing can be remembered in the first place. -->
        <div v-if="canRememberDevice" class="secret-file-view__ttl">
          <VaultTtlSlider v-model="ttlMs" />
        </div>

        <!-- The one warning that actually matters for this method. -->
        <div
          class="secret-file-view__block-9"
        >
          <p class="secret-file-view__text-12">
            Pick a file that will <strong class="secret-file-view__strong-never-change">never change</strong>. If an
            editor re-saves it, a sync client rewrites it, or it gets re-compressed, the hash
            changes and you land on a new, empty account with no way back. Keep a private copy —
            that file is now your account.
          </p>
        </div>

        <PrimaryButton class="secret-file-view__primary-button" @click="create" :disabled="!canCreate" :loading="busy">
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
























@media (hover:hover) {
.secret-file-view__text-4:is(:where(.secret-file-view__button):hover *) {
  --scale-x: 105%;
  --scale-y: 105%;
  --scale-z: 105%;
  scale: 105% 105%;
}
}

@media (hover:hover) {
.secret-file-view__button:hover {
  border-color: var(--accent);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__button:hover {
  border-color: color-mix(in srgb,var(--accent) 45%,transparent);
}
}
}

@media (hover:hover) {
.secret-file-view__button:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.secret-file-view__button-clear:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.secret-file-view__button-clear:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.secret-file-view__button-choose-a:hover {
  color: var(--app-text);
}
}







@media (min-width:40rem) {
.secret-file-view__section {
  padding: calc(var(--spacing) * 7);
}
}

@media (min-width:40rem) {
.secret-file-view__main {
  padding-top: calc(var(--spacing) * 14);
}
}

@media (min-width:40rem) {
.secret-file-view__title-use-a {
  font-size: var(--text-4xl);
  line-height: var(--leading,var(--text-4xl--line-height));
}
}

@layer gupt-components {
.secret-file-view__block-2 {
  pointer-events: none;
}
.secret-file-view__block-2 {
  position: absolute;
}
.secret-file-view__block {
  position: relative;
}
.secret-file-view__main {
  position: relative;
}
.secret-file-view__block-2 {
  inset-inline: 0;
}
.secret-file-view__block-2 {
  top: 0;
}
.secret-file-view__main {
  margin-inline: auto;
}
.secret-file-view__text-10 {
  margin-top: calc(var(--spacing) * .5);
}
.secret-file-view__text-9 {
  margin-top: calc(var(--spacing) * 2);
}
.secret-file-view__text {
  margin-top: calc(var(--spacing) * 3);
}
.secret-file-view__title-use-a {
  margin-top: calc(var(--spacing) * 5);
}
.secret-file-view__list {
  margin-top: calc(var(--spacing) * 5);
}
.secret-file-view__block-8 {
  margin-top: calc(var(--spacing) * 5);
}
.secret-file-view__block-9 {
  margin-top: calc(var(--spacing) * 5);
}
.secret-file-view__text-2 {
  margin-top: calc(var(--spacing) * 6);
}
.secret-file-view__section {
  margin-top: calc(var(--spacing) * 6);
}
.secret-file-view__primary-button {
  margin-top: calc(var(--spacing) * 6);
}
.secret-file-view__text-file {
  display: block;
}
.secret-file-view__label-pin {
  display: block;
}
.secret-file-view__field-text {
  display: block;
}
.secret-file-view__header {
  display: flex;
}
.secret-file-view__block-3 {
  display: flex;
}
.secret-file-view__button {
  display: flex;
}
.secret-file-view__text-4 {
  display: flex;
}
.secret-file-view__block-6 {
  display: flex;
}
.secret-file-view__text-6 {
  display: flex;
}
.secret-file-view__item {
  display: flex;
}
.secret-file-view__text-10 {
  display: flex;
}
.secret-file-view__field-file {
  display: none;
}
.secret-file-view__component {
  width: calc(var(--spacing) * 3.5);
  height: calc(var(--spacing) * 3.5);
}
.secret-file-view__fingerprint-pattern-2 {
  width: calc(var(--spacing) * 4);
  height: calc(var(--spacing) * 4);
}
.secret-file-view__folder-open {
  width: calc(var(--spacing) * 5);
  height: calc(var(--spacing) * 5);
}
.secret-file-view__fingerprint-pattern {
  width: calc(var(--spacing) * 7);
  height: calc(var(--spacing) * 7);
}
.secret-file-view__text-10 {
  width: calc(var(--spacing) * 7);
  height: calc(var(--spacing) * 7);
}
.secret-file-view__text-6 {
  width: calc(var(--spacing) * 9);
  height: calc(var(--spacing) * 9);
}
.secret-file-view__text-4 {
  width: calc(var(--spacing) * 11);
  height: calc(var(--spacing) * 11);
}
.secret-file-view__block-3 {
  width: calc(var(--spacing) * 14);
  height: calc(var(--spacing) * 14);
}
.secret-file-view__block-2 {
  height: 560px;
}
.secret-file-view__block {
  min-height: 100%;
}
.secret-file-view__block {
  width: 100%;
}
.secret-file-view__main {
  width: 100%;
}
.secret-file-view__button {
  width: 100%;
}
.secret-file-view__field-text {
  width: 100%;
}
.secret-file-view__main {
  max-width: var(--container-2xl);
}
.secret-file-view__text {
  max-width: var(--container-md);
}
.secret-file-view__block-7 {
  min-width: 0;
}
.secret-file-view__block-7 {
  flex: 1;
}
.secret-file-view__text-6 {
  flex-shrink: 0;
}
.secret-file-view__button-clear {
  flex-shrink: 0;
}
.secret-file-view__text-10 {
  flex-shrink: 0;
}
.secret-file-view__button-clear {
  cursor: pointer;
}
.secret-file-view__button-choose-a {
  cursor: pointer;
}
.secret-file-view__header {
  flex-direction: column;
}
.secret-file-view__button {
  flex-direction: column;
}
.secret-file-view__header {
  align-items: center;
}
.secret-file-view__block-3 {
  align-items: center;
}
.secret-file-view__button {
  align-items: center;
}
.secret-file-view__text-4 {
  align-items: center;
}
.secret-file-view__block-6 {
  align-items: center;
}
.secret-file-view__text-6 {
  align-items: center;
}
.secret-file-view__text-10 {
  align-items: center;
}
.secret-file-view__item {
  align-items: flex-start;
}
.secret-file-view__block-3 {
  justify-content: center;
}
.secret-file-view__text-4 {
  justify-content: center;
}
.secret-file-view__text-6 {
  justify-content: center;
}
.secret-file-view__text-10 {
  justify-content: center;
}
.secret-file-view__button {
  gap: calc(var(--spacing) * 3);
}
.secret-file-view__block-6 {
  gap: calc(var(--spacing) * 3);
}
.secret-file-view__item {
  gap: calc(var(--spacing) * 3);
}
:where(.secret-file-view__block-4>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.secret-file-view__block-8>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.secret-file-view__list>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
.secret-file-view__text-7 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.secret-file-view__block {
  overflow-y: auto;
}
.secret-file-view__block-3 {
  border-radius: var(--radius-2xl);
}
.secret-file-view__section {
  border-radius: var(--radius-2xl);
}
.secret-file-view__button {
  border-radius: 14px;
}
.secret-file-view__block-5 {
  border-radius: 14px;
}
.secret-file-view__field-text {
  border-radius: 14px;
}
.secret-file-view__block-9 {
  border-radius: 14px;
}
.secret-file-view__text-6 {
  border-radius: var(--radius-lg);
}
.secret-file-view__button-clear {
  border-radius: var(--radius-lg);
}
.secret-file-view__text-10 {
  border-radius: var(--radius-lg);
}
.secret-file-view__text-2 {
  border-radius: var(--radius-xl);
}
.secret-file-view__text-4 {
  border-radius: var(--radius-xl);
}
.secret-file-view__block-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-file-view__text-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-file-view__section {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-file-view__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-file-view__text-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-file-view__block-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-file-view__text-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-file-view__text-10 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-file-view__field-text {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-file-view__block-9 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.secret-file-view__text-9 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.secret-file-view__list {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.secret-file-view__block-8 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.secret-file-view__button {
  --border-style: dashed;
  border-style: dashed;
}
.secret-file-view__text-2 {
  border-color: var(--app-border);
}
.secret-file-view__section {
  border-color: var(--app-border);
}
.secret-file-view__button {
  border-color: var(--app-border);
}
.secret-file-view__text-9 {
  border-color: var(--app-border);
}
.secret-file-view__list {
  border-color: var(--app-border);
}
.secret-file-view__block-8 {
  border-color: var(--app-border);
}
.secret-file-view__field-text {
  border-color: var(--app-border);
}
.secret-file-view__text-10 {
  border-color: var(--accent);
}
.secret-file-view__text-4 {
  border-color: var(--accent);
}
.secret-file-view__text-6 {
  border-color: var(--accent);
}
.secret-file-view__block-9 {
  border-color: var(--accent);
}
.secret-file-view__block-3 {
  border-color: var(--accent);
}
.secret-file-view__block-5 {
  border-color: var(--accent);
}
.secret-file-view__block {
  background-color: var(--app-bg);
}
.secret-file-view__text-2 {
  background-color: var(--app-surface);
}
.secret-file-view__section {
  background-color: var(--app-surface);
}
.secret-file-view__button {
  background-color: var(--app-surface-soft);
}
.secret-file-view__block-5 {
  background-color: var(--app-surface-soft);
}
.secret-file-view__field-text {
  background-color: var(--app-surface-soft);
}
.secret-file-view__block-9 {
  background-color: var(--accent);
}
.secret-file-view__text-10 {
  background-color: var(--accent);
}
.secret-file-view__text-4 {
  background-color: var(--accent);
}
.secret-file-view__text-6 {
  background-color: var(--accent);
}
.secret-file-view__block-3 {
  background-color: var(--accent);
}
.secret-file-view__block-2 {
  background-image: radial-gradient(60% 50% at 50% 0%,var(--app-text),transparent);
}
.secret-file-view__section {
  padding: calc(var(--spacing) * 5);
}
.secret-file-view__button-clear {
  padding-inline: calc(var(--spacing) * 2);
}
.secret-file-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.secret-file-view__text-2 {
  padding-inline: calc(var(--spacing) * 4);
}
.secret-file-view__block-5 {
  padding-inline: calc(var(--spacing) * 4);
}
.secret-file-view__block-9 {
  padding-inline: calc(var(--spacing) * 4);
}
.secret-file-view__button {
  padding-inline: calc(var(--spacing) * 6);
}
.secret-file-view__field-text {
  padding-inline: 1.125rem;
}
.secret-file-view__button-clear {
  padding-block: var(--spacing);
}
.secret-file-view__text-2 {
  padding-block: calc(var(--spacing) * 3);
}
.secret-file-view__block-5 {
  padding-block: calc(var(--spacing) * 3);
}
.secret-file-view__block-9 {
  padding-block: calc(var(--spacing) * 3);
}
.secret-file-view__button {
  padding-block: calc(var(--spacing) * 10);
}
.secret-file-view__field-text {
  padding-block: .75rem;
}
.secret-file-view__text-9 {
  padding-top: calc(var(--spacing) * 2);
}
.secret-file-view__list {
  padding-top: calc(var(--spacing) * 5);
}
.secret-file-view__block-8 {
  padding-top: calc(var(--spacing) * 5);
}
.secret-file-view__main {
  padding-top: calc(var(--spacing) * 10);
}
.secret-file-view__main {
  padding-bottom: calc(var(--spacing) * 24);
}
.secret-file-view__header {
  text-align: center;
}
.secret-file-view__text-7 {
  font-family: var(--font-mono);
}
.secret-file-view__text-9 {
  font-family: var(--font-mono);
}
.secret-file-view__field-text {
  font-family: var(--font-mono);
}
.secret-file-view__title-use-a {
  font-size: var(--text-3xl);
  line-height: var(--leading,var(--text-3xl--line-height));
}
.secret-file-view__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.secret-file-view__text-choose-a {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.secret-file-view__item {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.secret-file-view__text-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.secret-file-view__text-file {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.secret-file-view__text-5 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.secret-file-view__button-clear {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.secret-file-view__button-choose-a {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.secret-file-view__label-pin {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.secret-file-view__text-12 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.secret-file-view__text-7 {
  font-size: .8rem;
}
.secret-file-view__field-text {
  font-size: .85rem;
}
.secret-file-view__text-8 {
  font-size: 11px;
}
.secret-file-view__text-9 {
  font-size: 11px;
}
.secret-file-view__text {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.secret-file-view__text-2 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.secret-file-view__text-9 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.secret-file-view__item {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.secret-file-view__text-12 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.secret-file-view__text-3 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.secret-file-view__text-choose-a {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.secret-file-view__button-choose-a {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.secret-file-view__text-11 {
  --font-weight: var(--font-weight-normal);
  font-weight: var(--font-weight-normal);
}
.secret-file-view__title-use-a {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.secret-file-view__text-file {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.secret-file-view__label-pin {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.secret-file-view__title-use-a {
  --tracking: var(--tracking-tighter);
  letter-spacing: var(--tracking-tighter);
}
.secret-file-view__text-9 {
  word-break: break-all;
}
.secret-file-view__text {
  color: var(--app-muted);
}
.secret-file-view__text-2 {
  color: var(--app-muted);
}
.secret-file-view__text-8 {
  color: var(--app-muted);
}
.secret-file-view__button-clear {
  color: var(--app-muted);
}
.secret-file-view__button-choose-a {
  color: var(--app-muted);
}
.secret-file-view__item {
  color: var(--app-muted);
}
.secret-file-view__text-11 {
  color: var(--app-muted);
}
.secret-file-view__text-5 {
  color: var(--app-muted-2);
}
.secret-file-view__block {
  color: var(--app-text);
}
.secret-file-view__text-file {
  color: var(--app-text);
}
.secret-file-view__text-choose-a {
  color: var(--app-text);
}
.secret-file-view__text-7 {
  color: var(--app-text);
}
.secret-file-view__label-pin {
  color: var(--app-text);
}
.secret-file-view__field-text {
  color: var(--app-text);
}
.secret-file-view__strong-never-change {
  color: var(--app-text);
}
.secret-file-view__text-3 {
  color: var(--app-text-soft);
}
.secret-file-view__text-12 {
  color: var(--app-text-soft);
}
.secret-file-view__fingerprint-pattern {
  color: var(--accent);
}
.secret-file-view__folder-open {
  color: var(--accent);
}
.secret-file-view__fingerprint-pattern-2 {
  color: var(--accent);
}
.secret-file-view__text-9 {
  color: var(--accent);
}
.secret-file-view__component {
  color: var(--accent);
}
.secret-file-view__button-choose-a {
  text-decoration-line: underline;
}
.secret-file-view__button-choose-a {
  text-underline-offset: 2px;
}
.secret-file-view__section {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.secret-file-view__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.secret-file-view__field-text {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.secret-file-view__button-clear {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.secret-file-view__button-choose-a {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.secret-file-view__text-4 {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.secret-file-view__button {
  --duration: .2s;
  transition-duration: .2s;
}
.secret-file-view__field-text {
  --duration: .2s;
  transition-duration: .2s;
}
.secret-file-view__text-4 {
  --duration: .3s;
  transition-duration: .3s;
}
.secret-file-view__text-4 {
  --ease: var(--app-ease-swift);
  transition-timing-function: var(--app-ease-swift);
}
.secret-file-view__block {
  --accent: #34d399;
}
.secret-file-view__header {
  --app-item-delay: 40ms;
}
.secret-file-view__text-2 {
  --app-item-delay: 70ms;
}
.secret-file-view__section {
  --app-item-delay: .1s;
}
.secret-file-view__field-text::placeholder {
  color: var(--app-muted-2);
}
.secret-file-view__field-text:focus {
  border-color: var(--accent);
}
.secret-file-view__field-text:focus {
  background-color: var(--app-surface-hover);
}
.secret-file-view__field-text:focus {
  --outline-style: none;
  outline-style: none;
}
.secret-file-view__button:focus-visible {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.secret-file-view__field-text:focus-visible {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.secret-file-view__button:focus-visible {
  --ring-color: var(--accent);
}
.secret-file-view__field-text:focus-visible {
  --ring-color: var(--accent);
}
.secret-file-view__button:focus-visible {
  --outline-style: none;
  outline-style: none;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__text-10 {
  border-color: color-mix(in srgb,var(--accent) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__text-4 {
  border-color: color-mix(in srgb,var(--accent) 22%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__text-6 {
  border-color: color-mix(in srgb,var(--accent) 22%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__block-9 {
  border-color: color-mix(in srgb,var(--accent) 25%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__block-3 {
  border-color: color-mix(in srgb,var(--accent) 28%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__block-5 {
  border-color: color-mix(in srgb,var(--accent) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__block-9 {
  background-color: color-mix(in srgb,var(--accent) 6%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__text-10 {
  background-color: color-mix(in srgb,var(--accent) 8%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__text-4 {
  background-color: color-mix(in srgb,var(--accent) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__text-6 {
  background-color: color-mix(in srgb,var(--accent) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__block-3 {
  background-color: color-mix(in srgb,var(--accent) 12%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__block-2 {
  background-image: radial-gradient(60% 50% at 50% 0%,color-mix(in srgb,var(--app-text) 9%,transparent),transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__field-text:focus {
  border-color: color-mix(in srgb,var(--accent) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__button:focus-visible {
  --ring-color: color-mix(in srgb,var(--accent) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.secret-file-view__field-text:focus-visible {
  --ring-color: color-mix(in srgb,var(--accent) 30%,transparent);
}
}
}

.secret-file-view__ttl {
  margin-top: calc(var(--spacing) * 5);
  padding-top: calc(var(--spacing) * 5);
  border-top: 1px solid var(--app-border);
}
</style>
