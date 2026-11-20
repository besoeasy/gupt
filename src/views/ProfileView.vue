<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Check, Copy, ExternalLink, MessageCircle } from "@/icons";

import AppSkeleton from "@/components/AppSkeleton.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";

import RoboAvatar from "@/components/RoboAvatar.vue";
import { useProfileStore } from "@/stores/profiles";
import { useLastSeen } from "@/composables/useLastSeen";
import { useOpenConversation } from "@/composables/useOpenConversation";
import { copyToClipboard } from "@/lib/clipboard";
import { rememberPendingRoute } from "@/lib/entryPoint";
import { shortId } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const profileStore = useProfileStore();
const { openDmWith } = useOpenConversation();

const pubkey = computed(() => String(route.params.pubkey || "").trim());
const profile = ref(null);
const loading = ref(true);
const copied = ref(false);
const openingDm = ref(false);

onMounted(async () => {
  await identity.init();
  loading.value = true;
  profile.value = await profileStore.fetchProfileDetails(pubkey.value);
  loading.value = false;
});

const displayedName = computed(() => profile.value?.name || shortId(pubkey.value));
const isOwnProfile = computed(
  () => pubkey.value && identity.pubkeyHex && pubkey.value === identity.pubkeyHex,
);
const { lastSeenLabel, loading: lastSeenLoading } = useLastSeen(pubkey);

const safeWebsite = computed(() => {
  const url = profile.value?.website;
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.href;
  } catch {
    return null;
  }
});

const websiteLabel = computed(() => {
  if (!safeWebsite.value) return "";
  try {
    return new URL(safeWebsite.value).hostname;
  } catch {
    return safeWebsite.value;
  }
});

async function copyPubkey() {
  await copyToClipboard(pubkey.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

async function openDm() {
  if (!pubkey.value || openingDm.value || isOwnProfile.value) return;
  // Viewing a profile is public, but opening a DM needs a key to encrypt with.
  if (!identity.isReady) {
    rememberPendingRoute(route.fullPath);
    router.push("/welcome");
    return;
  }
  openingDm.value = true;
  try {
    await openDmWith(identity, pubkey.value);
  } finally {
    openingDm.value = false;
  }
}
</script>

<template>
  <div class="profile-view__block">
    <main class="profile-view__main">
      <!-- Loading -->
      <div v-if="loading" class="profile-view__status" role="status">
        <span class="profile-view__text">Loading profile…</span>

        <!-- Hero -->
        <div class="profile-view__block-2">
          <AppSkeleton class="profile-view__app-skeleton" />
          <div class="profile-view__block-3">
            <AppSkeleton class="profile-view__app-skeleton-2" />
            <AppSkeleton class="profile-view__app-skeleton-3" />
          </div>
        </div>

        <!-- Details -->
        <div
          class="profile-view__block-4"
        >
          <div class="profile-view__block-5">
            <AppSkeleton class="profile-view__app-skeleton-4" />
            <AppSkeleton class="profile-view__app-skeleton-5" />
            <AppSkeleton class="profile-view__app-skeleton-6" />
          </div>
          <div class="profile-view__block-6">
            <AppSkeleton class="profile-view__app-skeleton-7" />
            <AppSkeleton class="profile-view__app-skeleton-8" />
          </div>
          <div class="profile-view__block-7">
            <div class="profile-view__block-8">
              <AppSkeleton class="profile-view__app-skeleton-9" />
              <AppSkeleton class="profile-view__app-skeleton-10" />
            </div>
            <AppSkeleton class="profile-view__app-skeleton-11" />
          </div>
        </div>

        <AppSkeleton class="profile-view__app-skeleton-12" />
      </div>

      <div v-else class="profile-view__block-9">
        <!-- Hero -->
        <div class="profile-view__block-10">
          <RoboAvatar :pubkey="pubkey" size="hero" rounded="3xl" alt="Profile avatar" />
          <div class="profile-view__block-11">
            <h1 class="profile-view__title">{{ displayedName }}</h1>
            <p v-if="isOwnProfile" class="profile-view__text-this-is">This is you</p>
          </div>
        </div>

        <!-- Details -->
        <div
          class="profile-view__block-12"
        >
          <div v-if="profile?.about" class="profile-view__block-13">
            <p class="profile-view__text-about">
              About
            </p>
            <p class="profile-view__text-2">
              {{ profile.about }}
            </p>
          </div>
          <div v-if="profile?.status" class="profile-view__block-14">
            <p class="profile-view__text-status">
              Status
            </p>
            <p class="profile-view__text-3">{{ profile.status }}</p>
          </div>
          <div v-if="safeWebsite" class="profile-view__block-15">
            <p class="profile-view__text-website">
              Website
            </p>
            <a
              :href="safeWebsite"
              target="_blank"
              rel="noopener noreferrer"
              class="profile-view__link"
            >
              <span class="profile-view__text-4">{{ websiteLabel }}</span>
              <ExternalLink class="profile-view__external-link" :stroke-width="2" />
            </a>
          </div>
          <div v-if="!isOwnProfile" class="profile-view__block-16">
            <p class="profile-view__text-last-seen">
              Last Seen
            </p>
            <p class="profile-view__text-5">
              <span v-if="lastSeenLoading" class="profile-view__text-6">
                <span class="profile-view__text-7" />
                <span class="profile-view__text-8">Checking activity…</span>
              </span>
              <span v-else class="profile-view__text-9">
                <span
                  class="profile-view__text-10"
                  :class="
                    lastSeenLabel === 'just now'
                      ? 'profile-view__text--success'
                      : 'profile-view__text--muted'
                  "
                />
                <span
                  :class="
                    lastSeenLabel === 'just now'
                      ? 'profile-view__text--success-2'
                      : 'profile-view__text--variant-2'
                  "
                >
                  {{ lastSeenLabel === "just now" ? "Online now" : lastSeenLabel }}
                </span>
              </span>
            </p>
          </div>
          <div class="profile-view__block-17">
            <div class="profile-view__block-18">
              <p class="profile-view__text-public-key">
                Public Key
              </p>
              <p class="profile-view__text-11">{{ pubkey }}</p>
            </div>
            <button
              @click="copyPubkey"
              class="profile-view__button"
              :class="copied ? 'profile-view__button--success' : 'profile-view__button--muted'"
            >
              <Check v-if="copied" class="profile-view__check" :stroke-width="2.5" />
              <Copy v-else class="profile-view__copy" :stroke-width="1.8" />
            </button>
          </div>
        </div>

        <!-- Actions -->
        <div v-if="!isOwnProfile">
          <PrimaryButton @click="openDm" :disabled="openingDm" :loading="openingDm">
            <MessageCircle class="profile-view__message-circle" :stroke-width="2" />
            {{ openingDm ? "Opening…" : "Send Message" }}
          </PrimaryButton>
        </div>
        <div v-if="isOwnProfile">
          <button
            @click="router.push('/me')"
            class="profile-view__button-edit-profile"
          >
            Edit Profile
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {








@media (hover:hover) {
.profile-view__button:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.profile-view__button-edit-profile:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.profile-view__button:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.profile-view__button-edit-profile:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.profile-view__button:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.profile-view__button-edit-profile:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.profile-view__link:hover {
  color: var(--color-sky-300);
}
}

@media (min-width:40rem) {
.profile-view__main {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.profile-view__main {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.profile-view__text {
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
.profile-view__main {
  margin-inline: auto;
}
.profile-view__text-about {
  margin-bottom: var(--spacing);
}
.profile-view__text-status {
  margin-bottom: var(--spacing);
}
.profile-view__text-website {
  margin-bottom: var(--spacing);
}
.profile-view__text-last-seen {
  margin-bottom: var(--spacing);
}
.profile-view__text-public-key {
  margin-bottom: var(--spacing);
}
.profile-view__block-2 {
  display: flex;
}
.profile-view__block-3 {
  display: flex;
}
.profile-view__block-7 {
  display: flex;
}
.profile-view__block-10 {
  display: flex;
}
.profile-view__link {
  display: flex;
}
.profile-view__text-5 {
  display: flex;
}
.profile-view__block-17 {
  display: flex;
}
.profile-view__text-7 {
  display: inline-block;
}
.profile-view__text-10 {
  display: inline-block;
}
.profile-view__text-6 {
  display: inline-flex;
}
.profile-view__text-9 {
  display: inline-flex;
}
.profile-view__button {
  display: inline-flex;
}
.profile-view__button-edit-profile {
  display: inline-flex;
}
.profile-view__text-7 {
  height: calc(var(--spacing) * 2);
}
.profile-view__text-10 {
  height: calc(var(--spacing) * 2);
}
.profile-view__app-skeleton-4 {
  height: calc(var(--spacing) * 2.5);
}
.profile-view__app-skeleton-7 {
  height: calc(var(--spacing) * 2.5);
}
.profile-view__app-skeleton-9 {
  height: calc(var(--spacing) * 2.5);
}
.profile-view__app-skeleton-3 {
  height: calc(var(--spacing) * 3);
}
.profile-view__app-skeleton-5 {
  height: calc(var(--spacing) * 3);
}
.profile-view__app-skeleton-6 {
  height: calc(var(--spacing) * 3);
}
.profile-view__app-skeleton-8 {
  height: calc(var(--spacing) * 3);
}
.profile-view__app-skeleton-10 {
  height: calc(var(--spacing) * 3);
}
.profile-view__external-link {
  height: calc(var(--spacing) * 3.5);
}
.profile-view__check {
  height: calc(var(--spacing) * 4);
}
.profile-view__copy {
  height: calc(var(--spacing) * 4);
}
.profile-view__message-circle {
  height: calc(var(--spacing) * 4);
}
.profile-view__app-skeleton-2 {
  height: calc(var(--spacing) * 6);
}
.profile-view__app-skeleton-11 {
  height: calc(var(--spacing) * 9);
}
.profile-view__button {
  height: calc(var(--spacing) * 9);
}
.profile-view__app-skeleton-12 {
  height: calc(var(--spacing) * 12);
}
.profile-view__app-skeleton {
  height: calc(var(--spacing) * 28);
}
.profile-view__block {
  min-height: 100vh;
}
.profile-view__text-7 {
  width: calc(var(--spacing) * 2);
}
.profile-view__text-10 {
  width: calc(var(--spacing) * 2);
}
.profile-view__external-link {
  width: calc(var(--spacing) * 3.5);
}
.profile-view__app-skeleton-8 {
  width: 60%;
}
.profile-view__check {
  width: calc(var(--spacing) * 4);
}
.profile-view__copy {
  width: calc(var(--spacing) * 4);
}
.profile-view__message-circle {
  width: calc(var(--spacing) * 4);
}
.profile-view__app-skeleton-6 {
  width: 80%;
}
.profile-view__app-skeleton-11 {
  width: calc(var(--spacing) * 9);
}
.profile-view__button {
  width: calc(var(--spacing) * 9);
}
.profile-view__app-skeleton-4 {
  width: calc(var(--spacing) * 14);
}
.profile-view__app-skeleton-7 {
  width: calc(var(--spacing) * 16);
}
.profile-view__app-skeleton-9 {
  width: calc(var(--spacing) * 20);
}
.profile-view__app-skeleton-3 {
  width: calc(var(--spacing) * 24);
}
.profile-view__app-skeleton {
  width: calc(var(--spacing) * 28);
}
.profile-view__app-skeleton-2 {
  width: calc(var(--spacing) * 40);
}
.profile-view__app-skeleton-10 {
  width: calc(var(--spacing) * 48);
}
.profile-view__main {
  width: 100%;
}
.profile-view__app-skeleton-5 {
  width: 100%;
}
.profile-view__app-skeleton-12 {
  width: 100%;
}
.profile-view__button-edit-profile {
  width: 100%;
}
.profile-view__main {
  max-width: var(--container-6xl);
}
.profile-view__app-skeleton-10 {
  max-width: 100%;
}
.profile-view__block-8 {
  min-width: 0;
}
.profile-view__block-18 {
  min-width: 0;
}
.profile-view__block-8 {
  flex: 1;
}
.profile-view__block-18 {
  flex: 1;
}
.profile-view__app-skeleton-11 {
  flex-shrink: 0;
}
.profile-view__external-link {
  flex-shrink: 0;
}
.profile-view__button {
  flex-shrink: 0;
}
.profile-view__text-7 {
  animation: var(--animate-pulse);
}
.profile-view__block-2 {
  flex-direction: column;
}
.profile-view__block-3 {
  flex-direction: column;
}
.profile-view__block-10 {
  flex-direction: column;
}
.profile-view__block-2 {
  align-items: center;
}
.profile-view__block-3 {
  align-items: center;
}
.profile-view__block-7 {
  align-items: center;
}
.profile-view__block-10 {
  align-items: center;
}
.profile-view__link {
  align-items: center;
}
.profile-view__text-5 {
  align-items: center;
}
.profile-view__text-6 {
  align-items: center;
}
.profile-view__text-9 {
  align-items: center;
}
.profile-view__block-17 {
  align-items: center;
}
.profile-view__button {
  align-items: center;
}
.profile-view__button-edit-profile {
  align-items: center;
}
.profile-view__button {
  justify-content: center;
}
.profile-view__button-edit-profile {
  justify-content: center;
}
.profile-view__link {
  gap: calc(var(--spacing) * 1.5);
}
.profile-view__text-6 {
  gap: calc(var(--spacing) * 1.5);
}
.profile-view__text-9 {
  gap: calc(var(--spacing) * 1.5);
}
.profile-view__block-3 {
  gap: calc(var(--spacing) * 2);
}
.profile-view__text-5 {
  gap: calc(var(--spacing) * 2);
}
.profile-view__button-edit-profile {
  gap: calc(var(--spacing) * 2);
}
.profile-view__block-7 {
  gap: calc(var(--spacing) * 3);
}
.profile-view__block-17 {
  gap: calc(var(--spacing) * 3);
}
.profile-view__block-2 {
  gap: calc(var(--spacing) * 4);
}
.profile-view__block-10 {
  gap: calc(var(--spacing) * 4);
}
:where(.profile-view__block-11>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.profile-view__block-5>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.profile-view__block-6>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.profile-view__block-8>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.profile-view__main>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.profile-view__status>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.profile-view__block-9>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.profile-view__block-4>:not(:last-child)) {
  --divide-y-reverse: 0;
  border-bottom-style: var(--border-style,solid);
  border-top-style: var(--border-style,solid);
  border-top-width: calc(1px * 0);
  border-bottom-width: calc(1px * calc(1 - 0));
}
:where(.profile-view__block-12>:not(:last-child)) {
  --divide-y-reverse: 0;
  border-bottom-style: var(--border-style,solid);
  border-top-style: var(--border-style,solid);
  border-top-width: calc(1px * 0);
  border-bottom-width: calc(1px * calc(1 - 0));
}
:where(.profile-view__block-4>:not(:last-child)) {
  border-color: #ffffff14;
}
:where(.profile-view__block-12>:not(:last-child)) {
  border-color: #ffffff14;
}
.profile-view__text-4 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.profile-view__text-11 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.profile-view__block-4 {
  overflow: hidden;
}
.profile-view__block-12 {
  overflow: hidden;
}
.profile-view__block-4 {
  border-radius: var(--radius-2xl);
}
.profile-view__app-skeleton-12 {
  border-radius: var(--radius-2xl);
}
.profile-view__block-12 {
  border-radius: var(--radius-2xl);
}
.profile-view__button-edit-profile {
  border-radius: var(--radius-2xl);
}
.profile-view__app-skeleton {
  border-radius: var(--radius-3xl);
}
.profile-view__app-skeleton-2 {
  border-radius: 3.40282e38px;
}
.profile-view__app-skeleton-3 {
  border-radius: 3.40282e38px;
}
.profile-view__text-7 {
  border-radius: 3.40282e38px;
}
.profile-view__text-10 {
  border-radius: 3.40282e38px;
}
.profile-view__app-skeleton-11 {
  border-radius: var(--radius-xl);
}
.profile-view__button {
  border-radius: var(--radius-xl);
}
.profile-view__block-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.profile-view__block-12 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.profile-view__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.profile-view__button-edit-profile {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.profile-view__block-4 {
  border-color: var(--app-border);
}
.profile-view__block-12 {
  border-color: var(--app-border);
}
.profile-view__button {
  border-color: var(--app-border);
}
.profile-view__button-edit-profile {
  border-color: var(--app-border);
}
.profile-view__button {
  background-color: var(--app-surface-soft);
}
.profile-view__button-edit-profile {
  background-color: var(--app-surface-soft);
}
.profile-view__block-4 {
  background-color: var(--app-surface);
}
.profile-view__block-12 {
  background-color: var(--app-surface);
}
.profile-view__text--success {
  background-color: var(--color-emerald-400);
}
.profile-view__text-7 {
  background-color: var(--ui-zinc-600);
}
.profile-view__text--muted {
  background-color: var(--ui-zinc-600);
}
.profile-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.profile-view__block-5 {
  padding-inline: calc(var(--spacing) * 4);
}
.profile-view__block-6 {
  padding-inline: calc(var(--spacing) * 4);
}
.profile-view__block-7 {
  padding-inline: calc(var(--spacing) * 4);
}
.profile-view__block-13 {
  padding-inline: calc(var(--spacing) * 4);
}
.profile-view__block-14 {
  padding-inline: calc(var(--spacing) * 4);
}
.profile-view__block-15 {
  padding-inline: calc(var(--spacing) * 4);
}
.profile-view__block-16 {
  padding-inline: calc(var(--spacing) * 4);
}
.profile-view__block-17 {
  padding-inline: calc(var(--spacing) * 4);
}
.profile-view__button-edit-profile {
  padding-inline: calc(var(--spacing) * 4);
}
.profile-view__button-edit-profile {
  padding-block: calc(var(--spacing) * 3);
}
.profile-view__block-5 {
  padding-block: calc(var(--spacing) * 4);
}
.profile-view__block-6 {
  padding-block: calc(var(--spacing) * 4);
}
.profile-view__block-7 {
  padding-block: calc(var(--spacing) * 4);
}
.profile-view__block-13 {
  padding-block: calc(var(--spacing) * 4);
}
.profile-view__block-14 {
  padding-block: calc(var(--spacing) * 4);
}
.profile-view__block-15 {
  padding-block: calc(var(--spacing) * 4);
}
.profile-view__block-16 {
  padding-block: calc(var(--spacing) * 4);
}
.profile-view__block-17 {
  padding-block: calc(var(--spacing) * 4);
}
.profile-view__main {
  padding-block: calc(var(--spacing) * 6);
}
.profile-view__block-2 {
  padding-top: calc(var(--spacing) * 4);
}
.profile-view__block-10 {
  padding-top: calc(var(--spacing) * 4);
}
.profile-view__block-2 {
  padding-bottom: calc(var(--spacing) * 2);
}
.profile-view__block-10 {
  padding-bottom: calc(var(--spacing) * 2);
}
.profile-view__block-11 {
  text-align: center;
}
.profile-view__text-11 {
  font-family: var(--font-mono);
}
.profile-view__text-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.profile-view__text-3 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.profile-view__link {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.profile-view__text-5 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.profile-view__button-edit-profile {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.profile-view__title {
  font-size: var(--text-xl);
  line-height: var(--leading,var(--text-xl--line-height));
}
.profile-view__text-this-is {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.profile-view__text-8 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.profile-view__text-11 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.profile-view__text-about {
  font-size: 11px;
}
.profile-view__text-status {
  font-size: 11px;
}
.profile-view__text-website {
  font-size: 11px;
}
.profile-view__text-last-seen {
  font-size: 11px;
}
.profile-view__text-public-key {
  font-size: 11px;
}
.profile-view__text-2 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.profile-view__text-3 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.profile-view__title {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.profile-view__text-about {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.profile-view__text-status {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.profile-view__text-website {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.profile-view__text-last-seen {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.profile-view__text--success-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.profile-view__text-public-key {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.profile-view__button-edit-profile {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.profile-view__title {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.profile-view__text-about {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.profile-view__text-status {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.profile-view__text-website {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.profile-view__text-last-seen {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.profile-view__text-public-key {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.profile-view__text-2 {
  white-space: pre-line;
}
.profile-view__button {
  color: var(--app-text-soft);
}
.profile-view__button-edit-profile {
  color: var(--app-text-soft);
}
.profile-view__text--success-2 {
  color: var(--color-emerald-400);
}
.profile-view__button--success {
  color: var(--color-emerald-400);
}
.profile-view__link {
  color: var(--color-sky-400);
}
.profile-view__text-2 {
  color: var(--ui-zinc-300);
}
.profile-view__text-3 {
  color: var(--ui-zinc-300);
}
.profile-view__text--variant-2 {
  color: var(--ui-zinc-300);
}
.profile-view__button--muted {
  color: var(--ui-zinc-400);
}
.profile-view__text-this-is {
  color: var(--ui-zinc-500);
}
.profile-view__text-about {
  color: var(--ui-zinc-500);
}
.profile-view__text-status {
  color: var(--ui-zinc-500);
}
.profile-view__text-website {
  color: var(--ui-zinc-500);
}
.profile-view__text-last-seen {
  color: var(--ui-zinc-500);
}
.profile-view__text-6 {
  color: var(--ui-zinc-500);
}
.profile-view__text-public-key {
  color: var(--ui-zinc-500);
}
.profile-view__text-11 {
  color: var(--ui-zinc-500);
}
.profile-view__text-about {
  text-transform: uppercase;
}
.profile-view__text-status {
  text-transform: uppercase;
}
.profile-view__text-website {
  text-transform: uppercase;
}
.profile-view__text-last-seen {
  text-transform: uppercase;
}
.profile-view__text-public-key {
  text-transform: uppercase;
}
.profile-view__text--success {
  --shadow: 0 0 6px var(--shadow-color,#34d399b3);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 0 6px var(--shadow-color,#34d399b3);
}
.profile-view__block-4 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.profile-view__block-12 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.profile-view__link {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
[data-theme="light"] .profile-view__text--success-2 {
  color: var(--app-success);
}
[data-theme="light"] .profile-view__button--success {
  color: var(--app-success);
}
[data-theme="light"] .profile-view__link {
  color: var(--app-info);
}
[data-theme="light"] .profile-view__text-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .profile-view__text-3 {
  color: var(--app-text-soft);
}
[data-theme="light"] .profile-view__text--variant-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .profile-view__button--muted {
  color: var(--app-muted);
}
[data-theme="light"] .profile-view__text-this-is {
  color: var(--app-muted);
}
[data-theme="light"] .profile-view__text-about {
  color: var(--app-muted);
}
[data-theme="light"] .profile-view__text-status {
  color: var(--app-muted);
}
[data-theme="light"] .profile-view__text-website {
  color: var(--app-muted);
}
[data-theme="light"] .profile-view__text-last-seen {
  color: var(--app-muted);
}
[data-theme="light"] .profile-view__text-6 {
  color: var(--app-muted);
}
[data-theme="light"] .profile-view__text-public-key {
  color: var(--app-muted);
}
[data-theme="light"] .profile-view__text-11 {
  color: var(--app-muted);
}
[data-theme="light"] .profile-view__link:hover {
  color: #075985 !important;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
:where(.profile-view__block-4>:not(:last-child)) {
  border-color: color-mix(in oklab,var(--color-white) 8%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
:where(.profile-view__block-12>:not(:last-child)) {
  border-color: color-mix(in oklab,var(--color-white) 8%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.profile-view__block-4 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.profile-view__block-12 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}
}
</style>
