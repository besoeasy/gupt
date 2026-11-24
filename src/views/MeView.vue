<script setup>
import { computed, onMounted, ref } from "vue";
import { Check, Copy, KeyRound, ShieldCheck, ShieldOff } from "@/icons";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";

import RoboAvatar from "@/components/RoboAvatar.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { pubkeyName } from "@/lib/crypto";
import { publicAppBaseUrl } from "@/lib/runtime";
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
const showForgetConfirm = ref(false);
const forgetBusy = ref(false);

const profileLink = computed(() =>
  identity.pubkeyHex ? `${publicAppBaseUrl()}/#/profile/${identity.pubkeyHex}` : "",
);

function flashCopied(state) {
  state.value = true;
  setTimeout(() => (state.value = false), 2000);
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
  <div class="me-view">
    <div class="me-view__inner">
      <!-- Loading State -->
      <div v-if="pageLoading" class="me-view__loading" role="status">
        <span class="me-view__loading-label">Loading your profile…</span>

        <!-- Header -->
        <div
          class="me-view__skeleton-header"
          aria-hidden="true"
        >
          <div class="me-view__skeleton-identity">
            <AppSkeleton class="me-view__skeleton-avatar" />
            <div class="me-view__skeleton-lines">
              <AppSkeleton class="me-view__skeleton-name" />
              <AppSkeleton class="me-view__skeleton-sub" />
            </div>
          </div>
          <div class="me-view__skeleton-actions">
            <AppSkeleton class="me-view__skeleton-button" />
            <AppSkeleton class="me-view__skeleton-button--short" />
          </div>
        </div>

        <!-- Public key -->
        <div
          class="me-view__skeleton-key-card"
          aria-hidden="true"
        >
          <AppSkeleton class="me-view__skeleton-icon" />
          <div class="me-view__skeleton-key-lines">
            <AppSkeleton class="me-view__skeleton-key-label" />
            <AppSkeleton class="me-view__skeleton-key-line" />
          </div>
          <AppSkeleton class="me-view__skeleton-key-value" />
        </div>

        <!-- Profile form -->
        <div
          class="me-view__skeleton-profile-card"
          aria-hidden="true"
        >
          <div class="me-view__skeleton-profile-head">
            <AppSkeleton class="me-view__skeleton-heading" />
            <AppSkeleton class="me-view__skeleton-heading--short" />
          </div>
          <div v-for="n in 2" :key="n" class="me-view__skeleton-field">
            <AppSkeleton class="me-view__skeleton-label" />
            <AppSkeleton class="me-view__skeleton-input" />
          </div>
          <div class="me-view__skeleton-field-row">
            <AppSkeleton class="me-view__skeleton-label--wide" />
            <AppSkeleton class="me-view__skeleton-textarea" />
          </div>
          <AppSkeleton class="me-view__skeleton-submit" />
        </div>

        <!-- Danger zone -->
        <div
          class="me-view__skeleton-danger"
          aria-hidden="true"
        >
          <div class="me-view__skeleton-danger-row">
            <div class="me-view__skeleton-danger-text">
              <AppSkeleton class="me-view__skeleton-icon--danger" />
              <div class="me-view__skeleton-danger-lines">
                <AppSkeleton class="me-view__skeleton-danger-title" />
                <AppSkeleton class="me-view__skeleton-danger-line" />
              </div>
            </div>
            <AppSkeleton class="me-view__skeleton-danger-button" />
          </div>
        </div>
      </div>

      <!-- Header Section -->
      <div
        v-if="!pageLoading"
        class="me-view__header"
      >
        <div class="me-view__identity">
          <div
            class="me-view__avatar"
          >
            <RoboAvatar :pubkey="identity.pubkeyHex" size="md" rounded="xl" alt="Your avatar" />
          </div>
          <div class="me-view__identity-text">
            <p class="me-view__eyebrow">Identity</p>
            <div class="me-view__name-row">
              <h1 class="me-view__title">
                {{ displayLabel }}
              </h1>
              <ShieldCheck
                class="me-view__shield-check-cryptographically-secured"
                title="Cryptographically Secured"
              />
            </div>
            <p class="me-view__identity-sub">
              <span v-if="editingStatus">{{ editingStatus }}</span>
              <span v-else>Decentralized identity · private keys never leave this browser</span>
            </p>
          </div>
        </div>

        <div class="me-view__header-actions">
          <button
            type="button"
            class="me-view__copy-button"
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
            class="me-view__link-button"
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
        class="me-view__key-card"
      >
        <div
          class="me-view__key-icon"
        >
          <KeyRound class="me-view__key-round" />
        </div>
        <div class="me-view__key-body">
          <div class="me-view__key-head">
            <p class="me-view__key-label">Public Key</p>
          </div>
          <p
            class="me-view__key-value"
            :title="identity.pubkeyHex"
          >
            {{ identity.pubkeyHex }}
          </p>
        </div>
        <span
          class="me-view__key-status-dot"
          :class="identity.isReady ? 'me-view__key-status-dot--success' : 'me-view__key-status-dot--warning'"
          aria-hidden="true"
        />
      </div>

      <!-- Public Profile Card -->
      <div
        v-if="!pageLoading && identity.pubkeyHex"
        class="me-view__profile-card"
      >
        <div class="me-view__profile-head">
          <p class="me-view__card-eyebrow">Relay record</p>
          <h2 class="me-view__subtitle-public-profile">Public profile</h2>
          <p class="me-view__profile-lede">
            Published to relays and visible to anyone you chat with.
          </p>
        </div>

        <div class="me-view__field-name">
          <label class="me-view__label-display-name">
            Display name <span class="me-view__required">*</span>
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

        <div class="me-view__field-bio">
          <label class="me-view__label-bio">Bio</label>
          <textarea
            v-model="editingAbout"
            rows="3"
            maxlength="500"
            placeholder="Tell people a bit about yourself…"
            autocomplete="off"
            class="me-view__field-tell-people"
          />
          <p class="me-view__bio-count">
            {{ editingAbout.length }}/500
          </p>
        </div>

        <div class="me-view__divider" />

        <div class="me-view__field-status">
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
          <p class="me-view__status-count">
            {{ editingStatus.length }}/150
          </p>
        </div>

        <button
          type="button"
          :disabled="!canSaveProfile"
          @click="saveProfile"
          class="me-view__publish"
        >
          <span>{{ profileBusy ? "Publishing…" : "Publish profile" }}</span>
        </button>
      </div>

      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />

      <!-- Danger Zone -->
      <div
        v-if="!pageLoading && identity.remembersDevice"
        class="me-view__danger-card"
      >
        <div
          class="me-view__danger-row"
        >
          <div class="me-view__danger-text">
            <div
              class="me-view__danger-icon"
            >
              <ShieldOff class="me-view__shield-off" />
            </div>
            <div class="me-view__danger-copy">
              <p class="me-view__danger-title">
                Forget this device
              </p>
              <p class="me-view__danger-lede">
                Deletes the remembered key from this browser only. Your account stays on the
                relays, and the next load needs your secret and PIN.
              </p>
            </div>
          </div>
          <button
            type="button"
            :disabled="forgetBusy"
            class="me-view__forget"
            @click="showForgetConfirm = true"
          >
            <ShieldOff class="me-view__shield-off-2" />
            <span>{{ forgetBusy ? "Forgetting…" : "Forget" }}</span>
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
  </div>
</template>

<style scoped>
@media (hover: hover) {
  .me-view__forget:hover {
    border-color: var(--app-muted-2);
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .me-view__copy-button:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .me-view__link-button:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .me-view__publish:hover {
    background-color: var(--app-text);
  }
}
@media (min-width: 40rem) {
  .me-view__skeleton-icon {
    height: 2.75rem;
    width: 2.75rem;
  }
  .me-view__key-icon {
    height: 2.75rem;
    width: 2.75rem;
  }
  .me-view__skeleton-header {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .me-view__header {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .me-view__skeleton-key-card {
    padding: 0.875rem;
  }
  .me-view__key-card {
    padding: 0.875rem;
  }
  .me-view__skeleton-profile-card {
    padding: 1.25rem;
  }
  .me-view__profile-card {
    padding: 1.25rem;
  }
  .me-view__skeleton-danger {
    padding-inline: 1.25rem;
  }
  .me-view__danger-card {
    padding-inline: 1.25rem;
  }
  .me-view__inner {
    padding-inline: 1.5rem;
  }
  .me-view__danger-title {
    font-size: 0.8125rem;
    line-height: 1.5;
  }
}
@media (min-width: 64rem) {
  .me-view__inner {
    padding-inline: 2rem;
  }
}
.me-view__loading-label {
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
.me-view__inner {
  margin-inline: auto;
  width: 100%;
  padding-inline: 1rem;
  max-width: 760px;
  padding-block: var(--app-space-7) var(--app-space-8);
}
.me-view__identity-sub {
  text-overflow: ellipsis;
  overflow: hidden;
  margin-top: 3px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  line-height: 1.5;
  color: var(--app-muted-2);
  white-space: normal;
}
.me-view__danger-lede {
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--app-muted);
}
.me-view__key-value {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  -webkit-user-select: all;
  user-select: all;
  margin-top: 3px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.5;
  letter-spacing: 0;
  color: var(--app-muted);
}
.me-view__field-text {
  display: block;
  width: 100%;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-tint);
  padding-inline: 0.875rem;
  padding-block: 0.625rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--app-text);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.me-view__field-tell-people {
  display: block;
  width: 100%;
  resize: none;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-tint);
  padding-inline: 0.875rem;
  padding-block: 0.625rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--app-text);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  min-height: 84px;
}
.me-view__field-text-2 {
  display: block;
  width: 100%;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-tint);
  padding-inline: 0.875rem;
  padding-block: 0.625rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--app-text);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.me-view__skeleton-header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  border-bottom-style: solid;
  border-bottom-width: 1px;
  border-color: var(--app-border-quiet);
  padding-bottom: 1.25rem;
}
.me-view__skeleton-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}
.me-view__skeleton-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.me-view__skeleton-key-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  background-color: var(--app-surface-inset);
  padding: 0.75rem;
}
.me-view__skeleton-danger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.me-view__skeleton-danger-text {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}
.me-view__header {
  display: flex;
  flex-direction: column;
  border-bottom-style: solid;
  border-bottom-width: 1px;
  border-color: var(--app-border-quiet);
  gap: var(--app-space-4);
  padding-bottom: var(--app-space-6);
  border-bottom: 1px solid var(--app-border);
  animation: ledger-rise 480ms var(--app-ease-emphasized) both;
}
.me-view__identity {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  min-width: 0;
}
.me-view__avatar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface);
  width: 44px;
  height: 44px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
}
.me-view__name-row {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  min-width: 0;
}
.me-view__header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.me-view__key-card {
  display: flex;
  align-items: center;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-quiet);
  background-color: var(--app-surface-inset);
  gap: var(--app-space-3);
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
}
.me-view__key-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface);
  width: 34px;
  height: 34px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  color: var(--app-muted-2);
}
.me-view__key-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.me-view__danger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
}
.me-view__danger-text {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}
.me-view__danger-icon {
  display: flex;
  height: 2.25rem;
  width: 2.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-strong);
  background-color: var(--app-surface);
  color: var(--app-danger);
}
.me-view__copy-button {
  display: inline-flex;
  height: 2rem;
  cursor: pointer;
  align-items: center;
  gap: 0.375rem;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-tint);
  padding-inline: 0.75rem;
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--app-text-soft);
  box-shadow: 0 1px 2px color-mix(in oklab, var(--app-text) 8%, transparent);
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.me-view__link-button {
  display: inline-flex;
  height: 2rem;
  cursor: pointer;
  align-items: center;
  gap: 0.375rem;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-tint);
  padding-inline: 0.75rem;
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--app-text-soft);
  box-shadow: 0 1px 2px color-mix(in oklab, var(--app-text) 8%, transparent);
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.me-view__publish {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding-inline: 0.75rem;
  line-height: 1.5;
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  width: 100%;
  height: 40px;
  border: 1px solid var(--app-text);
  border-radius: var(--app-radius-sm);
  background: var(--app-text);
  box-shadow: none;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-bg);
}
.me-view__forget {
  display: inline-flex;
  flex-shrink: 0;
  cursor: pointer;
  align-items: center;
  gap: 0.375rem;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border-strong);
  background-color: var(--app-surface);
  line-height: 1.5;
  font-weight: 500;
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  height: 30px;
  padding-inline: 10px;
  border: 1px solid color-mix(in oklab, var(--app-danger) 40%, var(--app-border));
  border-radius: var(--app-radius-sm);
  background: transparent;
  box-shadow: none;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-danger);
}
.me-view__skeleton-key-value {
  height: 0.5rem;
  width: 0.5rem;
  flex-shrink: 0;
  border-radius: 9999px;
}
.me-view__key-status-dot {
  flex-shrink: 0;
  border-radius: 9999px;
  width: 6px;
  height: 6px;
}
.me-view__skeleton-sub {
  height: 0.75rem;
  width: 14rem;
  max-width: 100%;
}
.me-view__skeleton-key-label {
  height: 0.75rem;
  width: 6rem;
}
.me-view__skeleton-key-line {
  height: 0.75rem;
  width: 75%;
  max-width: 100%;
}
.me-view__skeleton-heading--short {
  height: 0.75rem;
  width: 18rem;
  max-width: 100%;
}
.me-view__skeleton-label {
  height: 0.75rem;
  width: 6rem;
}
.me-view__skeleton-label--wide {
  height: 0.75rem;
  width: 6rem;
}
.me-view__skeleton-danger-title {
  height: 0.75rem;
  width: 4rem;
}
.me-view__skeleton-danger-line {
  height: 0.75rem;
  width: 16rem;
  max-width: 100%;
}
.me-view__check {
  height: 0.875rem;
  width: 0.875rem;
  color: var(--app-success);
}
.me-view__copy {
  height: 0.875rem;
  width: 0.875rem;
}
.me-view__check-2 {
  height: 0.875rem;
  width: 0.875rem;
  color: var(--app-success);
}
.me-view__copy-2 {
  height: 0.875rem;
  width: 0.875rem;
}
.me-view__shield-off-2 {
  height: 0.875rem;
  width: 0.875rem;
}
.me-view__skeleton-heading {
  height: 1rem;
  width: 8rem;
}
.me-view__shield-check-cryptographically-secured {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
  color: var(--app-success);
}
.me-view__key-round {
  width: 14px;
  height: 14px;
}
.me-view__shield-off {
  width: 15px;
  height: 15px;
}
.me-view__skeleton-name {
  height: 1.25rem;
  width: 10rem;
  max-width: 100%;
}
.me-view__skeleton-button {
  height: 2rem;
  width: 6rem;
  border-radius: var(--app-radius-lg);
}
.me-view__skeleton-button--short {
  height: 2rem;
  width: 6rem;
  border-radius: var(--app-radius-lg);
}
.me-view__skeleton-submit {
  height: 2rem;
  width: 100%;
  border-radius: var(--app-radius-lg);
}
.me-view__skeleton-danger-button {
  height: 2rem;
  width: 5rem;
  flex-shrink: 0;
  border-radius: var(--app-radius-lg);
}
.me-view__skeleton-icon--danger {
  height: 2.25rem;
  width: 2.25rem;
  flex-shrink: 0;
  border-radius: 18px;
}
.me-view__skeleton-icon {
  height: 2.5rem;
  width: 2.5rem;
  flex-shrink: 0;
  border-radius: 18px;
}
.me-view__skeleton-input {
  height: 2.5rem;
  width: 100%;
  border-radius: 18px;
}
.me-view__skeleton-avatar {
  height: 2.75rem;
  width: 2.75rem;
  flex-shrink: 0;
  border-radius: 18px;
}
.me-view__skeleton-textarea {
  height: 5rem;
  width: 100%;
  border-radius: 18px;
}
.me-view {
  height: 100%;
  width: 100%;
  min-width: 0;
  overflow-y: auto;
  background-color: var(--app-bg);
  padding-bottom: 4rem;
  background: var(--app-bg);
  color: var(--app-text);
}
.me-view__divider {
  height: 1px;
  background-color: var(--app-surface-raised-tint);
}
.me-view__skeleton-lines {
  min-width: 0;
}
.me-view__skeleton-key-lines {
  min-width: 0;
  flex: 1;
}
.me-view__skeleton-danger-lines {
  min-width: 0;
}
.me-view__identity-text {
  min-width: 0;
}
.me-view__key-body {
  flex: 1;
  min-width: 0;
}
.me-view__danger-copy {
  min-width: 0;
}
:where(.me-view__profile-head>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.25rem;
}
:where(.me-view__field-name>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.375rem;
}
:where(.me-view__field-bio>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.375rem;
}
:where(.me-view__field-status>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.375rem;
}
:where(.me-view__skeleton-lines>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.5rem;
}
:where(.me-view__skeleton-key-lines>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.5rem;
}
:where(.me-view__skeleton-profile-head>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.5rem;
}
:where(.me-view__skeleton-field>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.5rem;
}
:where(.me-view__skeleton-field-row>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.5rem;
}
:where(.me-view__skeleton-danger-lines>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.5rem;
}
:where(.me-view__skeleton-profile-card>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 1rem;
}
:where(.me-view__profile-card>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 1rem;
}
:where(.me-view__inner>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 1.25rem;
}
:where(.me-view__loading>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 1.25rem;
}
.me-view__title {
  text-overflow: ellipsis;
  overflow: hidden;
  font-size: var(--app-text-display);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: var(--app-tracking-display);
  color: var(--app-text);
  white-space: normal;
  overflow-wrap: anywhere;
}
.me-view__skeleton-profile-card {
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-inset-strong);
  padding: 1rem;
  box-shadow: 0 1px 2px color-mix(in oklab, var(--app-text) 8%, transparent);
}
.me-view__skeleton-danger {
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-inset-strong);
  padding-inline: 1rem;
  padding-block: 0.875rem;
  box-shadow: 0 1px 2px color-mix(in oklab, var(--app-text) 8%, transparent);
}
.me-view__profile-card {
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-inset-strong);
  gap: var(--app-space-4);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  box-shadow: none;
}
.me-view__danger-card {
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-inset-strong);
  padding-inline: 1rem;
  padding-block: 0.875rem;
  padding: 14px;
  border: 1px solid var(--app-border);
  border-left: 2px solid var(--app-danger);
  border-radius: var(--app-radius-md);
  background: color-mix(in oklab, var(--app-danger) 5%, var(--app-surface));
  box-shadow: none;
}
.me-view__key-status-dot--warning {
  background-color: var(--app-warning);
}
.me-view__key-status-dot--success {
  background-color: var(--app-success);
}
.me-view__bio-count {
  text-align: right;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-muted);
  font-variant-numeric: tabular-nums;
}
.me-view__status-count {
  text-align: right;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-muted);
  font-variant-numeric: tabular-nums;
}
.me-view__subtitle-public-profile {
  line-height: 1.5;
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}
.me-view__key-label {
  line-height: 1.5;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}
.me-view__profile-lede {
  margin-top: 3px;
  font-size: var(--app-text-meta);
  line-height: 1.55;
  color: var(--app-muted);
}
.me-view__label-display-name {
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--app-text-soft);
}
.me-view__label-bio {
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--app-text-soft);
}
.me-view__label-status {
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--app-text-soft);
}
.me-view__danger-title {
  line-height: 1.5;
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--app-text);
}
.me-view__required {
  color: var(--app-danger);
}
.me-view__field-text::placeholder {
  color: var(--app-muted-2);
}
.me-view__field-tell-people::placeholder {
  color: var(--app-muted-2);
}
.me-view__field-text-2::placeholder {
  color: var(--app-muted-2);
}
.me-view__field-text:focus {
  border-color: var(--app-muted-2);
  box-shadow: 0 0 0 1px currentcolor;
  outline-style: none;
}
.me-view__field-tell-people:focus {
  border-color: var(--app-muted-2);
  box-shadow: 0 0 0 1px currentcolor;
  outline-style: none;
}
.me-view__field-text-2:focus {
  border-color: var(--app-muted-2);
  box-shadow: 0 0 0 1px currentcolor;
  outline-style: none;
}
.me-view__publish:active {
  scale: 95% 95%;
}
.me-view__publish:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.me-view__forget:disabled {
  opacity: .5;
}
[data-theme="light"] .me-view__danger-icon {
  color: var(--app-text-soft);
}
[data-theme="light"] .me-view__forget {
  color: var(--app-text-soft);
}
[data-theme="light"] .me-view__key-icon {
  color: var(--app-muted);
}
[data-theme="light"] .me-view__identity-sub {
  color: var(--app-muted);
}
.me-view__eyebrow {
  margin: 0 0 4px;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}
.me-view__copy-button, .me-view__link-button {
  height: 30px;
  padding-inline: 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  box-shadow: none;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}
.me-view__card-eyebrow {
  margin: 0 0 4px;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}
.me-view__label-display-name, .me-view__label-bio, .me-view__label-status {
  display: block;
  margin-bottom: 6px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}
.me-view__field-text, .me-view__field-tell-people, .me-view__field-text-2 {
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface-soft);
  box-shadow: none;
  font-size: var(--app-text-body);
  line-height: 1.5;
  color: var(--app-text);
}
.me-view__field-text::placeholder, .me-view__field-tell-people::placeholder, .me-view__field-text-2::placeholder {
  color: var(--app-muted-2);
}
.me-view__field-text:focus, .me-view__field-tell-people:focus, .me-view__field-text-2:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}
.me-view__bio-count, .me-view__status-count {
  margin: 5px 0 0;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
  text-align: right;
}
@media (min-width: 40rem) {
  .me-view__header {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: var(--app-space-5);
  }
  .me-view__header-actions {
    flex-shrink: 0;
  }
}
@media (max-width: 30rem) {
  .me-view__title {
    font-size: 26px;
  }
  .me-view__danger-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
@media (hover: hover) {
  .me-view__copy-button:hover, .me-view__link-button:hover {
    border-color: var(--app-border-strong);
    background: var(--app-surface-soft);
    color: var(--app-text);
  }
  .me-view__publish:hover {
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }
  .me-view__forget:hover {
    border-color: var(--app-danger);
    background: color-mix(in oklab, var(--app-danger) 10%, transparent);
    color: var(--app-danger);
  }
}
@media (pointer: coarse) {
  .me-view__copy-button, .me-view__link-button, .me-view__publish, .me-view__forget {
    min-height: var(--app-touch-h);
  }
}
@media (prefers-reduced-motion: reduce) {
  .me-view__header {
    animation: none;
  }
}
</style>
