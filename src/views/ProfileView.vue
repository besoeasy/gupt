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
  <div class="profile-view">
    <main class="profile-view__main">
      <!-- Loading -->
      <div v-if="loading" class="profile-view__status" role="status">
        <p class="profile-view__status-label">Loading profile…</p>
        <div class="profile-skeleton" aria-hidden="true">
          <AppSkeleton class="profile-skeleton__avatar" />
          <div class="profile-skeleton__lines">
            <AppSkeleton class="profile-skeleton__line" />
            <AppSkeleton class="profile-skeleton__line profile-skeleton__line--short" />
          </div>
        </div>
        <div class="profile-skeleton__sheet" aria-hidden="true">
          <AppSkeleton class="profile-skeleton__line" />
          <AppSkeleton class="profile-skeleton__line profile-skeleton__line--short" />
          <AppSkeleton class="profile-skeleton__line" />
        </div>
      </div>

      <template v-else>
        <!-- Hero -->
        <header class="profile-view__hero">
          <RoboAvatar :pubkey="pubkey" size="hero" rounded="3xl" alt="Profile avatar" />
          <div class="profile-view__identity">
            <p class="profile-view__eyebrow">
              {{ isOwnProfile ? "Your profile" : "Public profile" }}
            </p>
            <h1 class="profile-view__title">{{ displayedName }}</h1>
            <div class="profile-view__meta">
              <span v-if="isOwnProfile" class="profile-view__you">This is you</span>
              <span v-else-if="lastSeenLoading" class="profile-view__seen">
                <span class="profile-view__pulse" aria-hidden="true" />
                Checking activity…
              </span>
              <span v-else class="profile-view__seen" :class="{ 'profile-view__seen--live': lastSeenLabel === 'just now' }">
                <span class="profile-view__dot" aria-hidden="true" />
                {{ lastSeenLabel === "just now" ? "Online now" : lastSeenLabel }}
              </span>
            </div>
          </div>
        </header>

        <!-- Details -->
        <section class="profile-card">
          <div v-if="profile?.about" class="profile-row">
            <p class="profile-row__label">About</p>
            <p class="profile-row__value">{{ profile.about }}</p>
          </div>
          <div v-if="profile?.status" class="profile-row">
            <p class="profile-row__label">Status</p>
            <p class="profile-row__value">{{ profile.status }}</p>
          </div>
          <div v-if="safeWebsite" class="profile-row">
            <p class="profile-row__label">Website</p>
            <a
              :href="safeWebsite"
              target="_blank"
              rel="noopener noreferrer"
              class="profile-row__link"
            >
              <span>{{ websiteLabel }}</span>
              <ExternalLink class="profile-row__link-icon" :stroke-width="2" aria-hidden="true" />
            </a>
          </div>
          <div class="profile-row">
            <p class="profile-row__label">Public key</p>
            <div class="profile-row__keyline">
              <p class="profile-row__key">{{ pubkey }}</p>
              <button
                type="button"
                class="profile-row__copy"
                :class="{ 'profile-row__copy--done': copied }"
                :aria-label="copied ? 'Public key copied' : 'Copy public key'"
                @click="copyPubkey"
              >
                <Check v-if="copied" class="profile-row__copy-icon" :stroke-width="2.4" aria-hidden="true" />
                <Copy v-else class="profile-row__copy-icon" :stroke-width="1.8" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        <!-- Actions -->
        <div class="profile-view__actions">
          <PrimaryButton v-if="!isOwnProfile" @click="openDm" :disabled="openingDm" :loading="openingDm">
            <MessageCircle class="profile-view__action-icon" :stroke-width="2" />
            {{ openingDm ? "Opening…" : "Send message" }}
          </PrimaryButton>
          <button v-else type="button" class="profile-view__edit" @click="router.push('/me')">
            Edit profile
          </button>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
/* Ledger pass: a public profile is an identity sheet, not a card stack. */

.profile-view {
  min-height: 100vh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.profile-view__main {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  width: 100%;
  max-width: 640px;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.profile-view__status-label {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.profile-skeleton {
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
  padding-bottom: var(--app-space-6);
  border-bottom: 1px solid var(--app-border);
}

.profile-skeleton__avatar {
  width: 64px;
  height: 64px;
  border-radius: var(--app-radius-md);
}

.profile-skeleton__lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
}

.profile-skeleton__line {
  display: block;
  height: 12px;
  border-radius: 3px;
}

.profile-skeleton__line--short {
  width: 46%;
}

.profile-skeleton__sheet {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: var(--app-space-5);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
}

.profile-view__hero {
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
  padding-bottom: var(--app-space-6);
  border-bottom: 1px solid var(--app-border);
  animation: ledger-rise 480ms var(--app-ease-emphasized) both;
}

.profile-view__identity {
  min-width: 0;
}

.profile-view__eyebrow {
  margin: 0 0 4px;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.profile-view__title {
  margin: 0;
  font-size: var(--app-text-display);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: var(--app-tracking-display);
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.profile-view__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.profile-view__you {
  padding: 2px 7px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted);
}

.profile-view__seen {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.profile-view__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--app-border-strong);
}

.profile-view__seen--live {
  color: var(--app-success);
}

.profile-view__seen--live .profile-view__dot {
  background: var(--app-success);
  box-shadow: var(--app-glow-amber);
  animation: ledger-dot-pulse 2.4s var(--app-ease-standard) infinite;
}

.profile-view__pulse {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--app-warning);
  animation: ledger-dot-pulse 1.6s var(--app-ease-standard) infinite;
}

.profile-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-rise 480ms var(--app-ease-emphasized) 60ms both;
}

.profile-row {
  padding: 14px 16px;
}

.profile-row + .profile-row {
  border-top: 1px solid var(--app-border);
}

.profile-row__label {
  margin: 0 0 5px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.profile-row__value {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--app-text);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.profile-row__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--app-primary);
  text-decoration: none;
}

.profile-row__link-icon {
  width: 12px;
  height: 12px;
}

.profile-row__keyline {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
}

.profile-row__key {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.65;
  letter-spacing: 0.01em;
  color: var(--app-muted);
  overflow-wrap: anywhere;
  user-select: all;
}

.profile-row__copy {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-top: -4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.profile-row__copy--done {
  color: var(--app-success);
}

.profile-row__copy-icon {
  width: 13px;
  height: 13px;
}

.profile-view__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-3);
  animation: ledger-fade 420ms var(--app-ease-standard) 120ms both;
}

.profile-view__action-icon {
  width: 14px;
  height: 14px;
}

.profile-view__edit {
  height: 32px;
  padding-inline: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

@media (min-width: 40rem) {
  .profile-view__main {
    padding-inline: var(--app-space-6);
  }
}

@media (max-width: 26rem) {
  .profile-view__title {
    font-size: 26px;
  }
}

@media (hover: hover) {
  .profile-row__link:hover {
    color: var(--app-text);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .profile-row__copy:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }

  .profile-view__edit:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .profile-row__copy,
  .profile-view__edit {
    min-height: var(--app-touch-h);
  }

  .profile-row__copy {
    width: var(--app-touch-h);
    height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .profile-view,
  .profile-view__hero,
  .profile-card,
  .profile-view__actions,
  .profile-view__seen--live .profile-view__dot,
  .profile-view__pulse {
    animation: none;
  }

  .profile-row__copy,
  .profile-view__edit {
    transition: none;
  }
}
</style>
