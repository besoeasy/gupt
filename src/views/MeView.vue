<script setup>
import { computed, onMounted, ref } from "vue";
import { Check, Copy, KeyRound, LogOut, ShieldCheck, ShieldOff } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";

import RoboAvatar from "@/components/RoboAvatar.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { pubkeyName } from "@/lib/crypto";
import { publicAppBaseUrl } from "@/lib/runtime";
import { logoutAndWipeAll } from "@/lib/appReset";
import { useIdentityStore } from "@/stores/identity";

const identity = useIdentityStore();

const message = ref("");
const error = ref("");
const pageLoading = ref(true);

const editingName = ref("");
const editingAbout = ref("");
const editingWebsite = ref("");
const editingStatus = ref("");
const profileBusy = ref(false);
const canSaveProfile = computed(() => editingName.value.trim().length > 0 && !profileBusy.value);

const displayLabel = computed(
  () => editingName.value.trim() || identity.profileName || pubkeyName(identity.pubkeyHex),
);

const pubkeyCopied = ref(false);
const profileLinkCopied = ref(false);
const showLogoutConfirm = ref(false);
const logoutBusy = ref(false);
const showForgetConfirm = ref(false);
const forgetBusy = ref(false);

const profileLink = computed(() =>
  identity.pubkeyHex ? `${publicAppBaseUrl()}/#/profile/${identity.pubkeyHex}` : "",
);

function flashCopied(state) {
  state.value = true;
  setTimeout(() => (state.value = false), 2000);
}

async function handleLogout() {
  showLogoutConfirm.value = false;
  logoutBusy.value = true;
  error.value = "";
  try {
    await logoutAndWipeAll();
    window.location.reload();
  } catch (e) {
    error.value = e.message || "Failed to log out.";
    logoutBusy.value = false;
  }
}

async function handleForgetDevice() {
  showForgetConfirm.value = false;
  forgetBusy.value = true;
  error.value = "";
  message.value = "";
  try {
    await identity.forgetDevice();
    message.value = "This device no longer remembers your account. You stay signed in here.";
  } catch (e) {
    error.value = e.message || "Could not forget this device.";
  } finally {
    forgetBusy.value = false;
  }
}

async function copyPubkey() {
  if (!identity.pubkeyHex) return;
  await copyToClipboard(identity.pubkeyHex);
  flashCopied(pubkeyCopied);
}

async function copyProfileLink() {
  if (!profileLink.value) return;
  await copyToClipboard(profileLink.value);
  flashCopied(profileLinkCopied);
}

function seedEditingFields() {
  editingName.value = identity.profileName;
  editingAbout.value = identity.profileAbout;
  editingWebsite.value = identity.profileWebsite;
  editingStatus.value = identity.profileStatus;
}

async function saveProfile() {
  error.value = "";
  message.value = "";
  profileBusy.value = true;
  try {
    await identity.saveProfile({
      name: editingName.value,
      about: editingAbout.value,
      website: editingWebsite.value,
    });
    if (editingStatus.value !== identity.profileStatus) {
      await identity.saveStatus(editingStatus.value);
    }
    message.value = "Profile saved locally; relays sync in the background.";
  } catch (e) {
    error.value = e.message || "Failed to save profile.";
  } finally {
    profileBusy.value = false;
  }
}

onMounted(() => {
  identity
    .init()
    .then(() => {
      seedEditingFields();
      pageLoading.value = false;
      identity.loadProfile().then(seedEditingFields);
    })
    .catch(() => {
      pageLoading.value = false;
    });
});
</script>

<template>
  <div class="me-view__block">
    <div class="me-view__block-2">
      <!-- Loading State -->
      <div v-if="pageLoading" class="me-view__status" role="status">
        <span class="me-view__text">Loading your profile…</span>

        <!-- Header -->
        <div
          class="me-view__block-3"
          aria-hidden="true"
        >
          <div class="me-view__block-4">
            <AppSkeleton class="me-view__app-skeleton" />
            <div class="me-view__block-5">
              <AppSkeleton class="me-view__app-skeleton-2" />
              <AppSkeleton class="me-view__app-skeleton-3" />
            </div>
          </div>
          <div class="me-view__block-6">
            <AppSkeleton class="me-view__app-skeleton-4" />
            <AppSkeleton class="me-view__app-skeleton-5" />
          </div>
        </div>

        <!-- Public key -->
        <div
          class="me-view__block-7"
          aria-hidden="true"
        >
          <AppSkeleton class="me-view__app-skeleton-6" />
          <div class="me-view__block-8">
            <AppSkeleton class="me-view__app-skeleton-7" />
            <AppSkeleton class="me-view__app-skeleton-8" />
          </div>
          <AppSkeleton class="me-view__app-skeleton-9" />
        </div>

        <!-- Profile form -->
        <div
          class="me-view__block-9"
          aria-hidden="true"
        >
          <div class="me-view__block-10">
            <AppSkeleton class="me-view__app-skeleton-10" />
            <AppSkeleton class="me-view__app-skeleton-11" />
          </div>
          <div v-for="n in 2" :key="n" class="me-view__block-11">
            <AppSkeleton class="me-view__app-skeleton-12" />
            <AppSkeleton class="me-view__app-skeleton-13" />
          </div>
          <div class="me-view__block-12">
            <AppSkeleton class="me-view__app-skeleton-14" />
            <AppSkeleton class="me-view__app-skeleton-15" />
          </div>
          <AppSkeleton class="me-view__app-skeleton-16" />
        </div>

        <!-- Danger zone -->
        <div
          class="me-view__block-13"
          aria-hidden="true"
        >
          <div class="me-view__block-14">
            <div class="me-view__block-15">
              <AppSkeleton class="me-view__app-skeleton-17" />
              <div class="me-view__block-16">
                <AppSkeleton class="me-view__app-skeleton-18" />
                <AppSkeleton class="me-view__app-skeleton-19" />
              </div>
            </div>
            <AppSkeleton class="me-view__app-skeleton-20" />
          </div>
        </div>
      </div>

      <!-- Header Section -->
      <div
        v-if="!pageLoading"
        class="me-view__block-17"
      >
        <div class="me-view__block-18">
          <div
            class="me-view__block-19"
          >
            <RoboAvatar :pubkey="identity.pubkeyHex" size="md" rounded="xl" alt="Your avatar" />
          </div>
          <div class="me-view__block-20">
            <div class="me-view__block-21">
              <h1 class="me-view__title">
                {{ displayLabel }}
              </h1>
              <ShieldCheck
                class="me-view__shield-check-cryptographically-secured"
                title="Cryptographically Secured"
              />
            </div>
            <p class="me-view__text-2">
              <span v-if="editingStatus">{{ editingStatus }}</span>
              <span v-else>Decentralized identity · private keys never leave this browser</span>
            </p>
          </div>
        </div>

        <div class="me-view__block-22">
          <button
            type="button"
            class="me-view__button"
            :title="pubkeyCopied ? 'Copied to clipboard!' : 'Copy public key'"
            @click="copyPubkey"
          >
            <Check v-if="pubkeyCopied" class="me-view__check" :stroke-width="2.5" />
            <Copy v-else class="me-view__copy" :stroke-width="2" />
            <span>{{ pubkeyCopied ? "Copied" : "Copy Key" }}</span>
          </button>
          <button
            v-if="profileLink"
            type="button"
            class="me-view__button-2"
            :title="profileLinkCopied ? 'Copied to clipboard!' : 'Copy profile link'"
            @click="copyProfileLink"
          >
            <Check
              v-if="profileLinkCopied"
              class="me-view__check-2"
              :stroke-width="2.5"
            />
            <Copy v-else class="me-view__copy-2" :stroke-width="2" />
            <span>{{ profileLinkCopied ? "Copied" : "Copy Link" }}</span>
          </button>
        </div>
      </div>

      <!-- Public Key Card -->
      <div
        v-if="!pageLoading && identity.pubkeyHex"
        class="me-view__block-23"
      >
        <div
          class="me-view__block-24"
        >
          <KeyRound class="me-view__key-round" />
        </div>
        <div class="me-view__block-25">
          <div class="me-view__block-26">
            <p class="me-view__text-public-key">Public Key</p>
          </div>
          <p
            class="me-view__text-3"
            :title="identity.pubkeyHex"
          >
            {{ identity.pubkeyHex }}
          </p>
        </div>
        <span
          class="me-view__text-4"
          :class="identity.isReady ? 'me-view__text--success' : 'me-view__text--warning'"
          aria-hidden="true"
        />
      </div>

      <!-- Public Profile Card -->
      <div
        v-if="!pageLoading && identity.pubkeyHex"
        class="me-view__block-27"
      >
        <div class="me-view__block-28">
          <h2 class="me-view__subtitle-public-profile">Public profile</h2>
          <p class="me-view__text-5">
            Published to relays and visible to anyone you chat with.
          </p>
        </div>

        <div class="me-view__block-29">
          <label class="me-view__label-display-name">
            Display name <span class="me-view__text-6">*</span>
          </label>
          <input
            v-model="editingName"
            type="text"
            placeholder="e.g. Alice"
            maxlength="100"
            autocomplete="off"
            class="me-view__field-text"
            @keydown.enter="canSaveProfile && saveProfile()"
          />
        </div>

        <div class="me-view__block-30">
          <label class="me-view__label-bio">Bio</label>
          <textarea
            v-model="editingAbout"
            rows="3"
            maxlength="500"
            placeholder="Tell people a bit about yourself…"
            autocomplete="off"
            class="me-view__field-tell-people"
          />
          <p class="me-view__text-7">
            {{ editingAbout.length }}/500
          </p>
        </div>

        <div class="me-view__block-31" />

        <div class="me-view__block-32">
          <label class="me-view__label-status">Status</label>
          <input
            v-model="editingStatus"
            type="text"
            placeholder="e.g. Building something cool…"
            maxlength="150"
            autocomplete="off"
            class="me-view__field-text-2"
            @keydown.enter="canSaveProfile && saveProfile()"
          />
          <p class="me-view__text-8">
            {{ editingStatus.length }}/150
          </p>
        </div>

        <button
          type="button"
          :disabled="!canSaveProfile"
          @click="saveProfile"
          class="me-view__button-3"
        >
          <span>{{ profileBusy ? "Publishing…" : "Publish profile" }}</span>
        </button>
      </div>

      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />

      <!-- Danger Zone -->
      <div
        v-if="!pageLoading"
        class="me-view__block-33"
      >
        <div
          v-if="identity.remembersDevice"
          class="me-view__block-34"
        >
          <div class="me-view__block-35">
            <div
              class="me-view__block-36"
            >
              <ShieldOff class="me-view__shield-off" />
            </div>
            <div class="me-view__block-37">
              <p class="me-view__text-forget-this">
                Forget this device
              </p>
              <p class="me-view__text-9">
                Deletes the remembered key from this browser only. Your account stays on the
                relays, and the next load needs your secret and PIN.
              </p>
            </div>
          </div>
          <button
            type="button"
            :disabled="forgetBusy"
            class="me-view__button-4"
            @click="showForgetConfirm = true"
          >
            <ShieldOff class="me-view__shield-off-2" />
            <span>{{ forgetBusy ? "Forgetting…" : "Forget" }}</span>
          </button>
        </div>

        <div
          v-if="identity.remembersDevice"
          class="me-view__block-38"
          aria-hidden="true"
        />

        <div class="me-view__block-39">
          <div class="me-view__block-40">
            <div
              class="me-view__block-41"
            >
              <LogOut class="me-view__log-out" />
            </div>
            <div class="me-view__block-42">
              <p class="me-view__text-log-out">Log out</p>
              <p class="me-view__text-10">
                Wipes local cache, localStorage, and your private key. Recovery needs a pasted
                secret or your secret file.
              </p>
            </div>
          </div>
          <button
            type="button"
            :disabled="logoutBusy"
            class="me-view__button-5"
            @click="showLogoutConfirm = true"
          >
            <LogOut class="me-view__log-out-2" />
            <span>{{ logoutBusy ? "Logging out…" : "Log out" }}</span>
          </button>
        </div>
      </div>
    </div>

    <AppConfirmDialog
      :open="showForgetConfirm"
      title="Forget this device?"
      message="This deletes the remembered key from this browser. Your account and messages stay on the relays, and you can restore it with your secret or secret file and PIN. You will stay signed in until this page is closed."
      confirm-label="Forget device"
      @confirm="handleForgetDevice"
      @cancel="showForgetConfirm = false"
    />

    <AppConfirmDialog
      :open="showLogoutConfirm"
      title="Log out?"
      message="This destroys the local cache, all localStorage, and your private key on this device. You can only get back in with a pasted secret or your secret file."
      confirm-label="Log out"
      @confirm="handleLogout"
      @cancel="showLogoutConfirm = false"
    />
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.me-view__block-41 {
  border-color: color-mix(in oklab,var(--color-red-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__button-5 {
  border-color: color-mix(in oklab,var(--color-red-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__block-3 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__block-7 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__block-17 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__block-23 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__block-41 {
  background-color: color-mix(in oklab,var(--color-red-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__button-5 {
  background-color: color-mix(in oklab,var(--color-red-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__block-31 {
  background-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__block-38 {
  background-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__button {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__button-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__field-text {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__field-tell-people {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__field-text-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__block-7 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__block-23 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__block-9 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__block-13 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__block-27 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__block-33 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 60%,transparent);
}
}

@media (hover:hover) {
.me-view__button-5:hover {
  border-color: var(--color-red-800);
}
}

@media (hover:hover) {
.me-view__button-4:hover {
  border-color: var(--ui-zinc-600);
}
}

@media (hover:hover) {
.me-view__button:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.me-view__button-2:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.me-view__button-5:hover {
  background-color: #82181a66;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.me-view__button-5:hover {
  background-color: color-mix(in oklab,var(--color-red-900) 40%,transparent);
}
}
}

@media (hover:hover) {
.me-view__button-3:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.me-view__button:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.me-view__button-2:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.me-view__button-4:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.me-view__button-5:hover {
  color: var(--color-red-200);
}
}

@media (hover:hover) {
.me-view__button:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.me-view__button-2:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.me-view__button-4:hover {
  color: var(--ui-zinc-100);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__field-text:focus {
  --ring-color: color-mix(in oklab, var(--ui-zinc-600) 40%, transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__field-tell-people:focus {
  --ring-color: color-mix(in oklab, var(--ui-zinc-600) 40%, transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.me-view__field-text-2:focus {
  --ring-color: color-mix(in oklab, var(--ui-zinc-600) 40%, transparent);
}
}

@media (min-width:40rem) {
.me-view__app-skeleton-6 {
  height: calc(var(--spacing) * 11);
}
}

@media (min-width:40rem) {
.me-view__block-24 {
  height: calc(var(--spacing) * 11);
}
}

@media (min-width:40rem) {
.me-view__app-skeleton-6 {
  width: calc(var(--spacing) * 11);
}
}

@media (min-width:40rem) {
.me-view__block-24 {
  width: calc(var(--spacing) * 11);
}
}

@media (min-width:40rem) {
.me-view__block-3 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.me-view__block-17 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.me-view__block-3 {
  align-items: center;
}
}

@media (min-width:40rem) {
.me-view__block-17 {
  align-items: center;
}
}

@media (min-width:40rem) {
.me-view__block-3 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.me-view__block-17 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.me-view__block-7 {
  padding: calc(var(--spacing) * 3.5);
}
}

@media (min-width:40rem) {
.me-view__block-23 {
  padding: calc(var(--spacing) * 3.5);
}
}

@media (min-width:40rem) {
.me-view__block-9 {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.me-view__block-27 {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.me-view__block-13 {
  padding-inline: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.me-view__block-33 {
  padding-inline: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.me-view__block-2 {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.me-view__text-forget-this {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
}

@media (min-width:40rem) {
.me-view__text-log-out {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
}

@media (min-width:64rem) {
.me-view__block-2 {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.me-view__text {
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  position: absolute;
  overflow: hidden;
}
.me-view__block-2 {
  margin-inline: auto;
}
.me-view__block-38 {
  margin-block: calc(var(--spacing) * 3.5);
}
.me-view__text-2 {
  margin-top: calc(var(--spacing) * .5);
}
.me-view__text-9 {
  margin-top: calc(var(--spacing) * .5);
}
.me-view__text-10 {
  margin-top: calc(var(--spacing) * .5);
}
.me-view__text-3 {
  margin-top: var(--spacing);
}
.me-view__field-text {
  display: block;
}
.me-view__field-tell-people {
  display: block;
}
.me-view__field-text-2 {
  display: block;
}
.me-view__block-3 {
  display: flex;
}
.me-view__block-4 {
  display: flex;
}
.me-view__block-6 {
  display: flex;
}
.me-view__block-7 {
  display: flex;
}
.me-view__block-14 {
  display: flex;
}
.me-view__block-15 {
  display: flex;
}
.me-view__block-17 {
  display: flex;
}
.me-view__block-18 {
  display: flex;
}
.me-view__block-19 {
  display: flex;
}
.me-view__block-21 {
  display: flex;
}
.me-view__block-22 {
  display: flex;
}
.me-view__block-23 {
  display: flex;
}
.me-view__block-24 {
  display: flex;
}
.me-view__block-26 {
  display: flex;
}
.me-view__block-34 {
  display: flex;
}
.me-view__block-35 {
  display: flex;
}
.me-view__block-36 {
  display: flex;
}
.me-view__block-39 {
  display: flex;
}
.me-view__block-40 {
  display: flex;
}
.me-view__block-41 {
  display: flex;
}
.me-view__button {
  display: inline-flex;
}
.me-view__button-2 {
  display: inline-flex;
}
.me-view__button-3 {
  display: inline-flex;
}
.me-view__button-4 {
  display: inline-flex;
}
.me-view__button-5 {
  display: inline-flex;
}
.me-view__app-skeleton-9 {
  height: calc(var(--spacing) * 2);
}
.me-view__text-4 {
  height: calc(var(--spacing) * 2);
}
.me-view__app-skeleton-3 {
  height: calc(var(--spacing) * 3);
}
.me-view__app-skeleton-7 {
  height: calc(var(--spacing) * 3);
}
.me-view__app-skeleton-8 {
  height: calc(var(--spacing) * 3);
}
.me-view__app-skeleton-11 {
  height: calc(var(--spacing) * 3);
}
.me-view__app-skeleton-12 {
  height: calc(var(--spacing) * 3);
}
.me-view__app-skeleton-14 {
  height: calc(var(--spacing) * 3);
}
.me-view__app-skeleton-18 {
  height: calc(var(--spacing) * 3);
}
.me-view__app-skeleton-19 {
  height: calc(var(--spacing) * 3);
}
.me-view__check {
  height: calc(var(--spacing) * 3.5);
}
.me-view__copy {
  height: calc(var(--spacing) * 3.5);
}
.me-view__check-2 {
  height: calc(var(--spacing) * 3.5);
}
.me-view__copy-2 {
  height: calc(var(--spacing) * 3.5);
}
.me-view__shield-off-2 {
  height: calc(var(--spacing) * 3.5);
}
.me-view__log-out-2 {
  height: calc(var(--spacing) * 3.5);
}
.me-view__app-skeleton-10 {
  height: calc(var(--spacing) * 4);
}
.me-view__shield-check-cryptographically-secured {
  height: calc(var(--spacing) * 4);
}
.me-view__key-round {
  height: calc(var(--spacing) * 4);
}
.me-view__shield-off {
  height: calc(var(--spacing) * 4);
}
.me-view__log-out {
  height: calc(var(--spacing) * 4);
}
.me-view__app-skeleton-2 {
  height: calc(var(--spacing) * 5);
}
.me-view__app-skeleton-4 {
  height: calc(var(--spacing) * 8);
}
.me-view__app-skeleton-5 {
  height: calc(var(--spacing) * 8);
}
.me-view__app-skeleton-16 {
  height: calc(var(--spacing) * 8);
}
.me-view__app-skeleton-20 {
  height: calc(var(--spacing) * 8);
}
.me-view__button {
  height: calc(var(--spacing) * 8);
}
.me-view__button-2 {
  height: calc(var(--spacing) * 8);
}
.me-view__button-3 {
  height: calc(var(--spacing) * 8);
}
.me-view__button-4 {
  height: calc(var(--spacing) * 8);
}
.me-view__button-5 {
  height: calc(var(--spacing) * 8);
}
.me-view__app-skeleton-17 {
  height: calc(var(--spacing) * 9);
}
.me-view__block-36 {
  height: calc(var(--spacing) * 9);
}
.me-view__block-41 {
  height: calc(var(--spacing) * 9);
}
.me-view__app-skeleton-6 {
  height: calc(var(--spacing) * 10);
}
.me-view__app-skeleton-13 {
  height: calc(var(--spacing) * 10);
}
.me-view__block-24 {
  height: calc(var(--spacing) * 10);
}
.me-view__app-skeleton {
  height: calc(var(--spacing) * 11);
}
.me-view__block-19 {
  height: calc(var(--spacing) * 11);
}
.me-view__app-skeleton-15 {
  height: calc(var(--spacing) * 20);
}
.me-view__block {
  height: 100%;
}
.me-view__block-31 {
  height: 1px;
}
.me-view__block-38 {
  height: 1px;
}
.me-view__app-skeleton-9 {
  width: calc(var(--spacing) * 2);
}
.me-view__text-4 {
  width: calc(var(--spacing) * 2);
}
.me-view__check {
  width: calc(var(--spacing) * 3.5);
}
.me-view__copy {
  width: calc(var(--spacing) * 3.5);
}
.me-view__check-2 {
  width: calc(var(--spacing) * 3.5);
}
.me-view__copy-2 {
  width: calc(var(--spacing) * 3.5);
}
.me-view__shield-off-2 {
  width: calc(var(--spacing) * 3.5);
}
.me-view__log-out-2 {
  width: calc(var(--spacing) * 3.5);
}
.me-view__app-skeleton-8 {
  width: 75%;
}
.me-view__shield-check-cryptographically-secured {
  width: calc(var(--spacing) * 4);
}
.me-view__key-round {
  width: calc(var(--spacing) * 4);
}
.me-view__shield-off {
  width: calc(var(--spacing) * 4);
}
.me-view__log-out {
  width: calc(var(--spacing) * 4);
}
.me-view__app-skeleton-17 {
  width: calc(var(--spacing) * 9);
}
.me-view__block-36 {
  width: calc(var(--spacing) * 9);
}
.me-view__block-41 {
  width: calc(var(--spacing) * 9);
}
.me-view__app-skeleton-6 {
  width: calc(var(--spacing) * 10);
}
.me-view__block-24 {
  width: calc(var(--spacing) * 10);
}
.me-view__app-skeleton {
  width: calc(var(--spacing) * 11);
}
.me-view__block-19 {
  width: calc(var(--spacing) * 11);
}
.me-view__app-skeleton-18 {
  width: calc(var(--spacing) * 16);
}
.me-view__app-skeleton-20 {
  width: calc(var(--spacing) * 20);
}
.me-view__app-skeleton-4 {
  width: calc(var(--spacing) * 24);
}
.me-view__app-skeleton-5 {
  width: calc(var(--spacing) * 24);
}
.me-view__app-skeleton-7 {
  width: calc(var(--spacing) * 24);
}
.me-view__app-skeleton-12 {
  width: calc(var(--spacing) * 24);
}
.me-view__app-skeleton-14 {
  width: calc(var(--spacing) * 24);
}
.me-view__app-skeleton-10 {
  width: calc(var(--spacing) * 32);
}
.me-view__app-skeleton-2 {
  width: calc(var(--spacing) * 40);
}
.me-view__app-skeleton-3 {
  width: calc(var(--spacing) * 56);
}
.me-view__app-skeleton-19 {
  width: calc(var(--spacing) * 64);
}
.me-view__app-skeleton-11 {
  width: calc(var(--spacing) * 72);
}
.me-view__block {
  width: 100%;
}
.me-view__block-2 {
  width: 100%;
}
.me-view__app-skeleton-13 {
  width: 100%;
}
.me-view__app-skeleton-15 {
  width: 100%;
}
.me-view__app-skeleton-16 {
  width: 100%;
}
.me-view__field-text {
  width: 100%;
}
.me-view__field-tell-people {
  width: 100%;
}
.me-view__field-text-2 {
  width: 100%;
}
.me-view__button-3 {
  width: 100%;
}
.me-view__block-38 {
  width: 100%;
}
.me-view__block-2 {
  max-width: var(--container-6xl);
}
.me-view__app-skeleton-2 {
  max-width: 100%;
}
.me-view__app-skeleton-3 {
  max-width: 100%;
}
.me-view__app-skeleton-8 {
  max-width: 100%;
}
.me-view__app-skeleton-11 {
  max-width: 100%;
}
.me-view__app-skeleton-19 {
  max-width: 100%;
}
.me-view__block {
  min-width: 0;
}
.me-view__block-4 {
  min-width: 0;
}
.me-view__block-5 {
  min-width: 0;
}
.me-view__block-8 {
  min-width: 0;
}
.me-view__block-15 {
  min-width: 0;
}
.me-view__block-16 {
  min-width: 0;
}
.me-view__block-18 {
  min-width: 0;
}
.me-view__block-20 {
  min-width: 0;
}
.me-view__block-21 {
  min-width: 0;
}
.me-view__block-25 {
  min-width: 0;
}
.me-view__block-35 {
  min-width: 0;
}
.me-view__block-37 {
  min-width: 0;
}
.me-view__block-40 {
  min-width: 0;
}
.me-view__block-42 {
  min-width: 0;
}
.me-view__block-8 {
  flex: 1;
}
.me-view__block-25 {
  flex: 1;
}
.me-view__app-skeleton {
  flex-shrink: 0;
}
.me-view__app-skeleton-6 {
  flex-shrink: 0;
}
.me-view__app-skeleton-9 {
  flex-shrink: 0;
}
.me-view__app-skeleton-17 {
  flex-shrink: 0;
}
.me-view__app-skeleton-20 {
  flex-shrink: 0;
}
.me-view__block-19 {
  flex-shrink: 0;
}
.me-view__shield-check-cryptographically-secured {
  flex-shrink: 0;
}
.me-view__block-24 {
  flex-shrink: 0;
}
.me-view__text-4 {
  flex-shrink: 0;
}
.me-view__block-36 {
  flex-shrink: 0;
}
.me-view__button-4 {
  flex-shrink: 0;
}
.me-view__block-41 {
  flex-shrink: 0;
}
.me-view__button-5 {
  flex-shrink: 0;
}
.me-view__button {
  cursor: pointer;
}
.me-view__button-2 {
  cursor: pointer;
}
.me-view__button-3 {
  cursor: pointer;
}
.me-view__button-4 {
  cursor: pointer;
}
.me-view__button-5 {
  cursor: pointer;
}
.me-view__field-tell-people {
  resize: none;
}
.me-view__block-3 {
  flex-direction: column;
}
.me-view__block-17 {
  flex-direction: column;
}
.me-view__block-6 {
  flex-wrap: wrap;
}
.me-view__block-22 {
  flex-wrap: wrap;
}
.me-view__block-4 {
  align-items: center;
}
.me-view__block-6 {
  align-items: center;
}
.me-view__block-7 {
  align-items: center;
}
.me-view__block-14 {
  align-items: center;
}
.me-view__block-15 {
  align-items: center;
}
.me-view__block-18 {
  align-items: center;
}
.me-view__block-19 {
  align-items: center;
}
.me-view__block-21 {
  align-items: center;
}
.me-view__block-22 {
  align-items: center;
}
.me-view__button {
  align-items: center;
}
.me-view__button-2 {
  align-items: center;
}
.me-view__block-23 {
  align-items: center;
}
.me-view__block-24 {
  align-items: center;
}
.me-view__block-26 {
  align-items: center;
}
.me-view__button-3 {
  align-items: center;
}
.me-view__block-34 {
  align-items: center;
}
.me-view__block-35 {
  align-items: center;
}
.me-view__block-36 {
  align-items: center;
}
.me-view__button-4 {
  align-items: center;
}
.me-view__block-39 {
  align-items: center;
}
.me-view__block-40 {
  align-items: center;
}
.me-view__block-41 {
  align-items: center;
}
.me-view__button-5 {
  align-items: center;
}
.me-view__block-14 {
  justify-content: space-between;
}
.me-view__block-26 {
  justify-content: space-between;
}
.me-view__block-34 {
  justify-content: space-between;
}
.me-view__block-39 {
  justify-content: space-between;
}
.me-view__block-19 {
  justify-content: center;
}
.me-view__block-24 {
  justify-content: center;
}
.me-view__button-3 {
  justify-content: center;
}
.me-view__block-36 {
  justify-content: center;
}
.me-view__block-41 {
  justify-content: center;
}
.me-view__block-21 {
  gap: calc(var(--spacing) * 1.5);
}
.me-view__button {
  gap: calc(var(--spacing) * 1.5);
}
.me-view__button-2 {
  gap: calc(var(--spacing) * 1.5);
}
.me-view__button-3 {
  gap: calc(var(--spacing) * 1.5);
}
.me-view__button-4 {
  gap: calc(var(--spacing) * 1.5);
}
.me-view__button-5 {
  gap: calc(var(--spacing) * 1.5);
}
.me-view__block-6 {
  gap: calc(var(--spacing) * 2);
}
.me-view__block-22 {
  gap: calc(var(--spacing) * 2);
}
.me-view__block-26 {
  gap: calc(var(--spacing) * 2);
}
.me-view__block-4 {
  gap: calc(var(--spacing) * 3);
}
.me-view__block-7 {
  gap: calc(var(--spacing) * 3);
}
.me-view__block-14 {
  gap: calc(var(--spacing) * 3);
}
.me-view__block-15 {
  gap: calc(var(--spacing) * 3);
}
.me-view__block-18 {
  gap: calc(var(--spacing) * 3);
}
.me-view__block-23 {
  gap: calc(var(--spacing) * 3);
}
.me-view__block-34 {
  gap: calc(var(--spacing) * 3);
}
.me-view__block-35 {
  gap: calc(var(--spacing) * 3);
}
.me-view__block-39 {
  gap: calc(var(--spacing) * 3);
}
.me-view__block-40 {
  gap: calc(var(--spacing) * 3);
}
.me-view__block-3 {
  gap: calc(var(--spacing) * 4);
}
.me-view__block-17 {
  gap: calc(var(--spacing) * 4);
}
:where(.me-view__block-28>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.me-view__block-29>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.me-view__block-30>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.me-view__block-32>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.me-view__block-5>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.me-view__block-8>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.me-view__block-10>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.me-view__block-11>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.me-view__block-12>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.me-view__block-16>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.me-view__block-9>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.me-view__block-27>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.me-view__block-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.me-view__status>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
.me-view__title {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.me-view__text-2 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.me-view__text-3 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.me-view__block-19 {
  overflow: hidden;
}
.me-view__block {
  overflow-y: auto;
}
.me-view__app-skeleton-9 {
  border-radius: 3.40282e38px;
}
.me-view__text-4 {
  border-radius: 3.40282e38px;
}
.me-view__app-skeleton-4 {
  border-radius: var(--radius-lg);
}
.me-view__app-skeleton-5 {
  border-radius: var(--radius-lg);
}
.me-view__app-skeleton-16 {
  border-radius: var(--radius-lg);
}
.me-view__app-skeleton-20 {
  border-radius: var(--radius-lg);
}
.me-view__button {
  border-radius: var(--radius-lg);
}
.me-view__button-2 {
  border-radius: var(--radius-lg);
}
.me-view__button-3 {
  border-radius: var(--radius-lg);
}
.me-view__button-4 {
  border-radius: var(--radius-lg);
}
.me-view__button-5 {
  border-radius: var(--radius-lg);
}
.me-view__app-skeleton {
  border-radius: var(--radius-xl);
}
.me-view__block-7 {
  border-radius: var(--radius-xl);
}
.me-view__app-skeleton-6 {
  border-radius: var(--radius-xl);
}
.me-view__block-9 {
  border-radius: var(--radius-xl);
}
.me-view__app-skeleton-13 {
  border-radius: var(--radius-xl);
}
.me-view__app-skeleton-15 {
  border-radius: var(--radius-xl);
}
.me-view__block-13 {
  border-radius: var(--radius-xl);
}
.me-view__app-skeleton-17 {
  border-radius: var(--radius-xl);
}
.me-view__block-19 {
  border-radius: var(--radius-xl);
}
.me-view__block-23 {
  border-radius: var(--radius-xl);
}
.me-view__block-24 {
  border-radius: var(--radius-xl);
}
.me-view__block-27 {
  border-radius: var(--radius-xl);
}
.me-view__field-text {
  border-radius: var(--radius-xl);
}
.me-view__field-tell-people {
  border-radius: var(--radius-xl);
}
.me-view__field-text-2 {
  border-radius: var(--radius-xl);
}
.me-view__block-33 {
  border-radius: var(--radius-xl);
}
.me-view__block-36 {
  border-radius: var(--radius-xl);
}
.me-view__block-41 {
  border-radius: var(--radius-xl);
}
.me-view__block-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__block-9 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__block-13 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__block-19 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__button-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__block-23 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__block-24 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__block-27 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__field-text {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__field-tell-people {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__field-text-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__block-33 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__block-36 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__button-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__block-41 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__button-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.me-view__block-3 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.me-view__block-17 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.me-view__block-41 {
  border-color: #82181a99;
}
.me-view__button-5 {
  border-color: #82181a99;
}
.me-view__block-36 {
  border-color: var(--ui-zinc-700);
}
.me-view__button-4 {
  border-color: var(--ui-zinc-700);
}
.me-view__block-9 {
  border-color: var(--ui-zinc-800);
}
.me-view__block-13 {
  border-color: var(--ui-zinc-800);
}
.me-view__block-19 {
  border-color: var(--ui-zinc-800);
}
.me-view__button {
  border-color: var(--ui-zinc-800);
}
.me-view__button-2 {
  border-color: var(--ui-zinc-800);
}
.me-view__block-24 {
  border-color: var(--ui-zinc-800);
}
.me-view__block-27 {
  border-color: var(--ui-zinc-800);
}
.me-view__field-text {
  border-color: var(--ui-zinc-800);
}
.me-view__field-tell-people {
  border-color: var(--ui-zinc-800);
}
.me-view__field-text-2 {
  border-color: var(--ui-zinc-800);
}
.me-view__block-33 {
  border-color: var(--ui-zinc-800);
}
.me-view__block-3 {
  border-color: var(--ui-zinc-800);
}
.me-view__block-7 {
  border-color: var(--ui-zinc-800);
}
.me-view__block-17 {
  border-color: var(--ui-zinc-800);
}
.me-view__block-23 {
  border-color: var(--ui-zinc-800);
}
.me-view__text--warning {
  background-color: var(--color-amber-400);
}
.me-view__block {
  background-color: var(--ui-black);
}
.me-view__text--success {
  background-color: var(--color-emerald-400);
}
.me-view__block-41 {
  background-color: #46080966;
}
.me-view__button-5 {
  background-color: #46080966;
}
.me-view__button-3 {
  background-color: var(--color-white);
}
.me-view__block-31 {
  background-color: var(--ui-zinc-800);
}
.me-view__block-38 {
  background-color: var(--ui-zinc-800);
}
.me-view__block-19 {
  background-color: var(--ui-zinc-900);
}
.me-view__block-24 {
  background-color: var(--ui-zinc-900);
}
.me-view__block-36 {
  background-color: var(--ui-zinc-900);
}
.me-view__button-4 {
  background-color: var(--ui-zinc-900);
}
.me-view__button {
  background-color: var(--ui-zinc-900);
}
.me-view__button-2 {
  background-color: var(--ui-zinc-900);
}
.me-view__field-text {
  background-color: var(--ui-zinc-900);
}
.me-view__field-tell-people {
  background-color: var(--ui-zinc-900);
}
.me-view__field-text-2 {
  background-color: var(--ui-zinc-900);
}
.me-view__block-7 {
  background-color: var(--ui-zinc-950);
}
.me-view__block-23 {
  background-color: var(--ui-zinc-950);
}
.me-view__block-9 {
  background-color: var(--ui-zinc-950);
}
.me-view__block-13 {
  background-color: var(--ui-zinc-950);
}
.me-view__block-27 {
  background-color: var(--ui-zinc-950);
}
.me-view__block-33 {
  background-color: var(--ui-zinc-950);
}
.me-view__block-7 {
  padding: calc(var(--spacing) * 3);
}
.me-view__block-23 {
  padding: calc(var(--spacing) * 3);
}
.me-view__block-9 {
  padding: calc(var(--spacing) * 4);
}
.me-view__block-27 {
  padding: calc(var(--spacing) * 4);
}
.me-view__button {
  padding-inline: calc(var(--spacing) * 3);
}
.me-view__button-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.me-view__button-3 {
  padding-inline: calc(var(--spacing) * 3);
}
.me-view__button-4 {
  padding-inline: calc(var(--spacing) * 3);
}
.me-view__button-5 {
  padding-inline: calc(var(--spacing) * 3);
}
.me-view__field-text {
  padding-inline: calc(var(--spacing) * 3.5);
}
.me-view__field-tell-people {
  padding-inline: calc(var(--spacing) * 3.5);
}
.me-view__field-text-2 {
  padding-inline: calc(var(--spacing) * 3.5);
}
.me-view__block-2 {
  padding-inline: calc(var(--spacing) * 4);
}
.me-view__block-13 {
  padding-inline: calc(var(--spacing) * 4);
}
.me-view__block-33 {
  padding-inline: calc(var(--spacing) * 4);
}
.me-view__field-text {
  padding-block: calc(var(--spacing) * 2.5);
}
.me-view__field-tell-people {
  padding-block: calc(var(--spacing) * 2.5);
}
.me-view__field-text-2 {
  padding-block: calc(var(--spacing) * 2.5);
}
.me-view__block-13 {
  padding-block: calc(var(--spacing) * 3.5);
}
.me-view__block-33 {
  padding-block: calc(var(--spacing) * 3.5);
}
.me-view__block-2 {
  padding-block: calc(var(--spacing) * 6);
}
.me-view__block-3 {
  padding-bottom: calc(var(--spacing) * 5);
}
.me-view__block-17 {
  padding-bottom: calc(var(--spacing) * 5);
}
.me-view__block {
  padding-bottom: calc(var(--spacing) * 16);
}
.me-view__text-7 {
  text-align: right;
}
.me-view__text-8 {
  text-align: right;
}
.me-view__text-3 {
  font-family: var(--font-mono);
}
.me-view__text-7 {
  font-family: var(--font-mono);
}
.me-view__text-8 {
  font-family: var(--font-mono);
}
.me-view__subtitle-public-profile {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.me-view__field-text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.me-view__field-tell-people {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.me-view__field-text-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.me-view__title {
  font-size: var(--text-xl);
  line-height: var(--leading,var(--text-xl--line-height));
}
.me-view__text-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__button-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__text-public-key {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__text-3 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__text-5 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__label-display-name {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__label-bio {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__label-status {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__button-3 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__text-forget-this {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__text-9 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__button-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__text-log-out {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__text-10 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__button-5 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.me-view__text-7 {
  font-size: 11px;
}
.me-view__text-8 {
  font-size: 11px;
}
.me-view__text-2 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.me-view__text-5 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.me-view__text-9 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.me-view__text-10 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.me-view__button {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.me-view__button-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.me-view__label-display-name {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.me-view__label-bio {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.me-view__label-status {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.me-view__button-4 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.me-view__button-5 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.me-view__title {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.me-view__text-public-key {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.me-view__subtitle-public-profile {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.me-view__button-3 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.me-view__text-forget-this {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.me-view__text-log-out {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.me-view__title {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.me-view__text-public-key {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.me-view__text-3 {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.me-view__subtitle-public-profile {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.me-view__text-forget-this {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.me-view__text-log-out {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.me-view__button-3 {
  color: var(--ui-black);
}
.me-view__shield-check-cryptographically-secured {
  color: var(--color-emerald-400);
}
.me-view__check {
  color: var(--color-emerald-400);
}
.me-view__check-2 {
  color: var(--color-emerald-400);
}
.me-view__block-41 {
  color: var(--color-red-300);
}
.me-view__button-5 {
  color: var(--color-red-300);
}
.me-view__text-6 {
  color: var(--color-red-400);
}
.me-view__title {
  color: var(--color-white);
}
.me-view__subtitle-public-profile {
  color: var(--color-white);
}
.me-view__block {
  color: var(--ui-zinc-100);
}
.me-view__field-text {
  color: var(--ui-zinc-100);
}
.me-view__field-tell-people {
  color: var(--ui-zinc-100);
}
.me-view__field-text-2 {
  color: var(--ui-zinc-100);
}
.me-view__text-public-key {
  color: var(--ui-zinc-200);
}
.me-view__text-forget-this {
  color: var(--ui-zinc-200);
}
.me-view__text-log-out {
  color: var(--ui-zinc-200);
}
.me-view__button {
  color: var(--ui-zinc-300);
}
.me-view__button-2 {
  color: var(--ui-zinc-300);
}
.me-view__label-display-name {
  color: var(--ui-zinc-300);
}
.me-view__label-bio {
  color: var(--ui-zinc-300);
}
.me-view__label-status {
  color: var(--ui-zinc-300);
}
.me-view__block-36 {
  color: var(--ui-zinc-300);
}
.me-view__button-4 {
  color: var(--ui-zinc-300);
}
.me-view__block-24 {
  color: var(--ui-zinc-400);
}
.me-view__text-3 {
  color: var(--ui-zinc-400);
}
.me-view__text-2 {
  color: var(--ui-zinc-500);
}
.me-view__text-5 {
  color: var(--ui-zinc-500);
}
.me-view__text-7 {
  color: var(--ui-zinc-500);
}
.me-view__text-8 {
  color: var(--ui-zinc-500);
}
.me-view__text-9 {
  color: var(--ui-zinc-500);
}
.me-view__text-10 {
  color: var(--ui-zinc-500);
}
.me-view__text-7 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.me-view__text-8 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.me-view__block-9 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.me-view__block-13 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.me-view__button {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.me-view__button-2 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.me-view__block-27 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.me-view__button-3 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.me-view__block-33 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.me-view__button-4 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.me-view__button-5 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.me-view__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.me-view__button-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.me-view__button-3 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.me-view__button-4 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.me-view__button-5 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.me-view__field-text {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.me-view__field-tell-people {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.me-view__field-text-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.me-view__text-3 {
  -webkit-user-select: all;
  user-select: all;
}
.me-view__field-text::placeholder {
  color: var(--ui-zinc-600);
}
.me-view__field-tell-people::placeholder {
  color: var(--ui-zinc-600);
}
.me-view__field-text-2::placeholder {
  color: var(--ui-zinc-600);
}
.me-view__field-text:focus {
  border-color: var(--ui-zinc-600);
}
.me-view__field-tell-people:focus {
  border-color: var(--ui-zinc-600);
}
.me-view__field-text-2:focus {
  border-color: var(--ui-zinc-600);
}
.me-view__field-text:focus {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(1px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(1px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.me-view__field-tell-people:focus {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(1px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(1px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.me-view__field-text-2:focus {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(1px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(1px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.me-view__field-text:focus {
  --ring-color: var(--ui-zinc-600);
}
.me-view__field-tell-people:focus {
  --ring-color: var(--ui-zinc-600);
}
.me-view__field-text-2:focus {
  --ring-color: var(--ui-zinc-600);
}
.me-view__field-text:focus {
  --outline-style: none;
  outline-style: none;
}
.me-view__field-tell-people:focus {
  --outline-style: none;
  outline-style: none;
}
.me-view__field-text-2:focus {
  --outline-style: none;
  outline-style: none;
}
.me-view__button-3:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.me-view__button-3:disabled {
  cursor: not-allowed;
}
.me-view__button-3:disabled {
  opacity: .5;
}
.me-view__button-4:disabled {
  opacity: .5;
}
.me-view__button-5:disabled {
  opacity: .5;
}
[data-theme="light"] .me-view__shield-check-cryptographically-secured {
  color: var(--app-success);
}
[data-theme="light"] .me-view__check {
  color: var(--app-success);
}
[data-theme="light"] .me-view__check-2 {
  color: var(--app-success);
}
[data-theme="light"] .me-view__block-41 {
  color: var(--app-danger);
}
[data-theme="light"] .me-view__button-5 {
  color: var(--app-danger);
}
[data-theme="light"] .me-view__text-6 {
  color: var(--app-danger);
}
[data-theme="light"] .me-view__button {
  color: var(--app-text-soft);
}
[data-theme="light"] .me-view__button-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .me-view__label-display-name {
  color: var(--app-text-soft);
}
[data-theme="light"] .me-view__label-bio {
  color: var(--app-text-soft);
}
[data-theme="light"] .me-view__label-status {
  color: var(--app-text-soft);
}
[data-theme="light"] .me-view__block-36 {
  color: var(--app-text-soft);
}
[data-theme="light"] .me-view__button-4 {
  color: var(--app-text-soft);
}
[data-theme="light"] .me-view__block-24 {
  color: var(--app-muted);
}
[data-theme="light"] .me-view__text-3 {
  color: var(--app-muted);
}
[data-theme="light"] .me-view__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .me-view__text-5 {
  color: var(--app-muted);
}
[data-theme="light"] .me-view__text-7 {
  color: var(--app-muted);
}
[data-theme="light"] .me-view__text-8 {
  color: var(--app-muted);
}
[data-theme="light"] .me-view__text-9 {
  color: var(--app-muted);
}
[data-theme="light"] .me-view__text-10 {
  color: var(--app-muted);
}
}
}
</style>
