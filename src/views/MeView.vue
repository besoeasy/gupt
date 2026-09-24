<script setup>
import { computed, onMounted, ref } from "vue";
import { Check, Copy, KeyRound, LogOut, ShieldCheck, X } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
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
  <div class="h-full w-full min-w-0 overflow-y-auto bg-black text-zinc-100 pb-16">
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-5">
      <!-- Header Section -->
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-5"
      >
        <div class="flex items-center gap-3 min-w-0">
          <div
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden"
          >
            <RoboAvatar
              :pubkey="identity.pubkeyHex"
              :src="editingPicture"
              size="md"
              rounded="xl"
              alt="Your avatar"
            />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 min-w-0">
              <h1 class="truncate text-xl font-semibold tracking-tight text-white">
                {{ displayLabel }}
              </h1>
              <ShieldCheck
                class="h-4 w-4 text-emerald-400 shrink-0"
                title="Cryptographically Secured"
              />
            </div>
            <p class="mt-0.5 truncate text-xs text-zinc-500 leading-relaxed">
              <span v-if="editingStatus">{{ editingStatus }}</span>
              <span v-else>Decentralized identity · private keys never leave this browser</span>
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white cursor-pointer"
            :title="pubkeyCopied ? 'Copied to clipboard!' : 'Copy public key'"
            @click="copyPubkey"
          >
            <Check v-if="pubkeyCopied" class="h-3.5 w-3.5 text-emerald-400" :stroke-width="2.5" />
            <Copy v-else class="h-3.5 w-3.5" :stroke-width="2" />
            <span>{{ pubkeyCopied ? "Copied" : "Copy Key" }}</span>
          </button>
          <button
            v-if="profileLink"
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white cursor-pointer"
            :title="profileLinkCopied ? 'Copied to clipboard!' : 'Copy profile link'"
            @click="copyProfileLink"
          >
            <Check
              v-if="profileLinkCopied"
              class="h-3.5 w-3.5 text-emerald-400"
              :stroke-width="2.5"
            />
            <Copy v-else class="h-3.5 w-3.5" :stroke-width="2" />
            <span>{{ profileLinkCopied ? "Copied" : "Copy Link" }}</span>
          </button>
        </div>
      </div>

      <!-- Public Key Card -->
      <div
        v-if="identity.pubkeyHex"
        class="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 sm:p-3.5"
      >
        <div
          class="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400"
        >
          <KeyRound class="h-4 w-4" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-semibold tracking-tight text-zinc-200">Public Key</p>
            <span class="shrink-0 font-mono text-[10px] tabular-nums text-zinc-500"
              >secp256k1</span
            >
          </div>
          <p
            class="mt-1 truncate font-mono text-xs text-zinc-400 tracking-tight select-all"
            :title="identity.pubkeyHex"
          >
            {{ identity.pubkeyHex }}
          </p>
        </div>
        <span
          class="h-2 w-2 shrink-0 rounded-full"
          :class="identity.mode === 'ephemeral' ? 'bg-amber-400' : 'bg-emerald-400'"
          aria-hidden="true"
        />
      </div>

      <!-- Public Profile Card -->
      <div
        v-if="identity.pubkeyHex"
        class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5 space-y-4 shadow-xs"
      >
        <div class="space-y-1">
          <h2 class="text-sm font-semibold tracking-tight text-white">Public profile</h2>
          <p class="text-xs text-zinc-500 leading-relaxed">
            Published to relays and visible to anyone you chat with.
          </p>
        </div>

        <div class="space-y-1.5">
          <label class="text-xs font-medium text-zinc-300">
            Display name <span class="text-red-400">*</span>
          </label>
          <input
            v-model="editingName"
            type="text"
            placeholder="e.g. Alice"
            maxlength="100"
            autocomplete="off"
            class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600/40"
            @keydown.enter="canSaveProfile && saveProfile()"
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-xs font-medium text-zinc-300">Bio</label>
          <textarea
            v-model="editingAbout"
            rows="3"
            maxlength="500"
            placeholder="Tell people a bit about yourself…"
            autocomplete="off"
            class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600/40 resize-none"
          />
          <p class="text-[11px] font-mono text-zinc-500 tabular-nums text-right">
            {{ editingAbout.length }}/500
          </p>
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

        <div class="h-px bg-zinc-800/80" />

        <div class="space-y-1.5">
          <label class="text-xs font-medium text-zinc-300">Status</label>
          <input
            v-model="editingStatus"
            type="text"
            placeholder="e.g. Building something cool…"
            maxlength="150"
            autocomplete="off"
            class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600/40"
            @keydown.enter="canSaveProfile && saveProfile()"
          />
          <p class="text-[11px] font-mono text-zinc-500 tabular-nums text-right">
            {{ editingStatus.length }}/150
          </p>
        </div>

        <button
          type="button"
          :disabled="!canSaveProfile"
          @click="saveProfile"
          class="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span>{{ profileBusy ? "Publishing…" : "Publish profile" }}</span>
        </button>
      </div>

      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />

      <!-- Danger Zone -->
      <div class="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3.5 sm:px-5 shadow-xs">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-900/60 bg-red-950/40 text-red-300"
            >
              <LogOut class="h-4 w-4" />
            </div>
            <div class="min-w-0">
              <p class="text-xs sm:text-sm font-semibold tracking-tight text-zinc-200">Log out</p>
              <p class="mt-0.5 text-xs text-zinc-500 leading-relaxed">
                Wipes local cache, localStorage, and your private key. Recovery needs memory
                anchors or a pasted secret.
              </p>
            </div>
          </div>
          <button
            type="button"
            :disabled="logoutBusy"
            class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-red-900/60 bg-red-950/40 px-3 text-xs font-medium text-red-300 shadow-xs transition-all hover:border-red-800 hover:bg-red-900/40 hover:text-red-200 disabled:opacity-50 cursor-pointer"
            @click="showLogoutConfirm = true"
          >
            <LogOut class="h-3.5 w-3.5" />
            <span>{{ logoutBusy ? "Logging out…" : "Log out" }}</span>
          </button>
        </div>
      </div>
    </div>

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
