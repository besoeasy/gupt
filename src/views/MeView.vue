<script setup>
import { computed, onMounted, ref } from "vue";
import { Check, Copy, KeyRound, LogOut, Radio, ShieldCheck, X } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { pubkeyName } from "@/lib/crypto";
import { publicAppBaseUrl } from "@/lib/runtime";
import { logoutAndWipeAll } from "@/lib/appReset";
import { useIdentityStore } from "@/stores/identity";

const identity = useIdentityStore();

const message = ref("");
const error = ref("");

const editingName = ref("");
const editingAbout = ref("");
const editingPicture = ref("");
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
  editingPicture.value = identity.profilePicture;
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
      picture: editingPicture.value,
      website: editingWebsite.value,
    });
    if (editingStatus.value !== identity.profileStatus) {
      await identity.saveStatus(editingStatus.value);
    }
    message.value = "Profile saved & published to relays.";
  } catch (e) {
    error.value = e.message || "Failed to save profile.";
  } finally {
    profileBusy.value = false;
  }
}

onMounted(() => {
  identity.init().then(() => {
    seedEditingFields();
    identity.loadProfile().then(seedEditingFields);
  });
});
</script>

<template>
  <div class="min-h-screen bg-(--app-bg) text-(--app-text)">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-5">
        <!-- Redesigned Identity Hero Card -->
        <section class="relative overflow-hidden rounded-3xl transition-all">
          <!-- Atmospheric Cover Banner -->
          <div class="relative h-24 sm:h-28 w-full overflow-hidden">
            <!-- Ambient glow spots -->
            <div class="absolute -right-8 -top-8 h-36 w-36 rounded-full blur-2xl pointer-events-none" />
            <div class="absolute left-1/4 -bottom-10 h-28 w-28 rounded-full blur-xl pointer-events-none" />
          </div>

          <!-- Card Body Content -->
          <div class="space-y-6">
            <div class="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 -mt-12 sm:-mt-14">
              <!-- Floating Overlapping Avatar -->
              <div class="relative shrink-0 self-center sm:self-auto">
                <div class="overflow-hidden rounded-3xl">
                  <RoboAvatar
                    :pubkey="identity.pubkeyHex"
                    :src="editingPicture"
                    size="hero"
                    rounded="3xl"
                    alt="Your avatar"
                  />
                </div>
              </div>

              <!-- Identity Details -->
              <div class="min-w-0 flex-1 space-y-1.5 text-center sm:text-left pt-2 sm:pt-0">
                <div class="flex items-center justify-center sm:justify-start gap-2">
                  <h1
                    class="text-2xl sm:text-3xl font-extrabold tracking-tight text-(--app-text) truncate"
                  >
                    {{ displayLabel }}
                  </h1>
                  <ShieldCheck
                    class="h-5 w-5 text-emerald-400 shrink-0"
                    title="Cryptographically Secured"
                  />
                </div>

                <p v-if="editingStatus" class="text-sm text-(--app-text-soft) leading-relaxed">
                  {{ editingStatus }}
                </p>
                <p v-else class="text-xs sm:text-sm text-(--app-muted) leading-relaxed">
                  Decentralized identity derived via Argon2id. Private keys never leave this
                  browser.
                </p>
              </div>
            </div>

            <!-- Public Key Row -->
            <div class="pt-4 space-y-2.5">
              <div
                class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-(--app-muted)"
              >
                <div class="flex items-center gap-1.5">
                  <KeyRound class="h-3.5 w-3.5 text-(--app-primary)" />
                  <span>Public Key</span>
                </div>
                <div class="flex items-center gap-1 shrink-0 normal-case tracking-normal">
                  <button
                    type="button"
                    class="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold transition-all cursor-pointer text-(--app-text)"
                    :class="pubkeyCopied ? 'text-emerald-500' : 'hover:text-(--app-primary)'"
                    :title="pubkeyCopied ? 'Copied to clipboard!' : 'Copy public key'"
                    @click="copyPubkey"
                  >
                    <Check v-if="pubkeyCopied" class="h-3.5 w-3.5" :stroke-width="2.5" />
                    <Copy v-else class="h-3.5 w-3.5" :stroke-width="2" />
                    <span>{{ pubkeyCopied ? "Copied" : "Copy Key" }}</span>
                  </button>
                  <button
                    v-if="profileLink"
                    type="button"
                    class="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold transition-all cursor-pointer text-(--app-text)"
                    :class="profileLinkCopied ? 'text-emerald-500' : 'hover:text-(--app-primary)'"
                    :title="profileLinkCopied ? 'Copied to clipboard!' : 'Copy profile link'"
                    @click="copyProfileLink"
                  >
                    <Check v-if="profileLinkCopied" class="h-3.5 w-3.5" :stroke-width="2.5" />
                    <Copy v-else class="h-3.5 w-3.5" :stroke-width="2" />
                    <span>{{ profileLinkCopied ? "Copied" : "Copy Link" }}</span>
                  </button>
                </div>
              </div>

              <div
                v-if="identity.pubkeyHex"
                class="rounded-2xl p-2.5 sm:p-3 transition-colors"
              >
                <span
                  class="block min-w-0 select-all font-mono text-xs text-(--app-text-soft) truncate tracking-tight"
                  :title="identity.pubkeyHex"
                >
                  {{ identity.pubkeyHex }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- Profile -->
        <section
          v-if="identity.pubkeyHex"
          class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-2xl p-4 sm:p-5 space-y-4"
        >
          <div class="space-y-1">
            <h2 class="text-sm font-semibold">Public profile</h2>
            <p class="text-xs text-(--app-muted) leading-relaxed">
              Published to relays and visible to anyone you chat with.
            </p>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs text-(--app-text)">
              Display name <span class="text-red-500">*</span>
            </label>
            <input
              v-model="editingName"
              type="text"
              placeholder="e.g. Alice"
              maxlength="100"
              autocomplete="off"
              class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
              @keydown.enter="canSaveProfile && saveProfile()"
            />
          </div>

          <div class="space-y-1.5">
            <label class="text-xs text-(--app-text)">Bio</label>
            <textarea
              v-model="editingAbout"
              rows="3"
              maxlength="500"
              placeholder="Tell people a bit about yourself…"
              autocomplete="off"
              class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] resize-none"
            />
            <p class="text-[11px] text-(--app-muted) text-right">{{ editingAbout.length }}/500</p>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-zinc-300">Profile picture URL</label>
              <button
                v-if="editingPicture"
                type="button"
                @click="editingPicture = ''"
                class="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                Reset to default
              </button>
            </div>

            <div class="flex items-center gap-3">
              <!-- Live Avatar Preview -->
              <div
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-xs"
                title="Live Avatar Preview"
              >
                <RoboAvatar
                  :pubkey="identity.pubkeyHex"
                  :src="editingPicture"
                  size="md"
                  rounded="xl"
                />
              </div>

              <!-- Input -->
              <div class="relative flex-1 min-w-0">
                <input
                  v-model="editingPicture"
                  type="url"
                  placeholder="https://... (direct image URL)"
                  maxlength="2000"
                  autocomplete="off"
                  class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600/40"
                />
                <button
                  v-if="editingPicture"
                  type="button"
                  @click="editingPicture = ''"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5 rounded cursor-pointer"
                  title="Clear URL"
                >
                  <X class="h-3.5 w-3.5" :stroke-width="1.8" />
                </button>
              </div>
            </div>

            <p class="text-[11px] font-mono text-zinc-500 leading-normal">
              Public HTTPS link for Kind-0 Nostr metadata. Loaded with no-referrer to protect
              privacy. Never uploaded to Originless. Leave empty for default robot avatar.
            </p>
          </div>

          <div class="h-px bg-(--app-border)" />

          <div class="space-y-1.5">
            <label class="flex items-center gap-1.5 text-xs text-(--app-text)">
              <Radio class="w-3 h-3" :stroke-width="2" aria-hidden="true" />
              Status
            </label>
            <input
              v-model="editingStatus"
              type="text"
              placeholder="e.g. Building something cool…"
              maxlength="150"
              autocomplete="off"
              class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
              @keydown.enter="canSaveProfile && saveProfile()"
            />
            <p class="text-[11px] text-(--app-muted) text-right">{{ editingStatus.length }}/150</p>
          </div>

          <PrimaryButton @click="saveProfile" :disabled="!canSaveProfile" :loading="profileBusy">
            {{ profileBusy ? "Publishing…" : "Publish profile" }}
          </PrimaryButton>
        </section>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />

        <!-- Log out -->
        <section class="pt-4 space-y-2.5">
          <div
            class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-(--app-muted)"
          >
            <div class="flex items-center gap-1.5">
              <LogOut class="h-3.5 w-3.5 text-red-400" />
              <span>Log out</span>
            </div>
            <div class="flex items-center gap-1 shrink-0 normal-case tracking-normal">
              <button
                type="button"
                :disabled="logoutBusy"
                class="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold transition-all cursor-pointer text-red-400 hover:text-red-300 disabled:opacity-50"
                @click="showLogoutConfirm = true"
              >
                <LogOut class="h-3.5 w-3.5" />
                <span>{{ logoutBusy ? "Logging out…" : "Log out" }}</span>
              </button>
            </div>
          </div>
          <p class="text-xs text-(--app-muted) leading-relaxed">
            Wipes this device completely: destroys the local cache, all localStorage, and your
            private key. You can only get back in with your memory anchors or a pasted secret.
          </p>
        </section>
      </div>
    </main>

    <AppConfirmDialog
      :open="showLogoutConfirm"
      title="Log out?"
      message="This destroys the local cache, all localStorage, and your private key on this device. You can only get back in with your memory anchors or a pasted secret."
      confirm-label="Log out"
      @confirm="handleLogout"
      @cancel="showLogoutConfirm = false"
    />
  </div>
</template>
