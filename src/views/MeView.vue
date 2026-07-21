<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Camera,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Radio,
  Shield,
  UserRound,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import UiTabBar from "@/components/UiTabBar.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { npubFromPubkey, pubkeyName, shortId } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";
import { api } from "@/lib/api";

const TABS = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "identity", label: "Identity", icon: KeyRound },
  { id: "restore", label: "Switch account", icon: Shield },
];

const identity = useIdentityStore();
const route = useRoute();
const router = useRouter();

const message = ref("");
const error = ref("");
const activeTab = ref("profile");

const editingName = ref("");
const editingAbout = ref("");
const editingPicture = ref("");
const editingWebsite = ref("");
const editingStatus = ref("");
const profileBusy = ref(false);
const uploadBusy = ref(false);
const pictureFileInput = ref(null);
const canSaveProfile = computed(() => editingName.value.trim().length > 0 && !profileBusy.value);

const npub = computed(() => npubFromPubkey(identity.pubkeyHex) || "");
const displayLabel = computed(
  () => editingName.value.trim() || identity.profileName || pubkeyName(identity.pubkeyHex),
);

const npubCopied = ref(false);
const pubkeyCopied = ref(false);
const privkeyCopied = ref(false);
const showPrivkey = ref(false);

const rawKey = ref("");
const restoreBusy = ref(false);
const passphrase = ref("");
const pin = ref("");
const deriveBusy = ref(false);

const canRestoreKey = computed(() => rawKey.value.trim().length > 0 && !restoreBusy.value);
const passphraseOk = computed(() => passphrase.value.length >= 8);
const canDerive = computed(
  () => passphraseOk.value && pin.value.trim().length > 0 && !deriveBusy.value,
);

function flashCopied(state) {
  state.value = true;
  setTimeout(() => (state.value = false), 2000);
}

async function copyNpub() {
  if (!npub.value) return;
  await copyToClipboard(npub.value);
  flashCopied(npubCopied);
}

async function copyPubkey() {
  if (!identity.pubkeyHex) return;
  await copyToClipboard(identity.pubkeyHex);
  flashCopied(pubkeyCopied);
}

async function copyPrivkey() {
  if (!identity.privkeyHex) return;
  await copyToClipboard(identity.privkeyHex);
  flashCopied(privkeyCopied);
}

function seedEditingFields() {
  editingName.value = identity.profileName;
  editingAbout.value = identity.profileAbout;
  editingPicture.value = identity.profilePicture;
  editingWebsite.value = identity.profileWebsite;
  editingStatus.value = identity.profileStatus;
}

function setTab(tabId) {
  if (activeTab.value === tabId) return;
  activeTab.value = tabId;
  const query = tabId === "profile" ? {} : { tab: tabId };
  router.replace({ path: "/me", query });
}

watch(
  () => route.query.tab,
  (tab) => {
    const next = TABS.some((item) => item.id === tab) ? tab : "profile";
    activeTab.value = next;
  },
  { immediate: true },
);

async function handlePictureUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    error.value = "Please select an image file.";
    return;
  }
  uploadBusy.value = true;
  error.value = "";
  try {
    const { cid, url } = await api.uploadFile(file);
    editingPicture.value = cid ? `https://ipfs.io/ipfs/${cid}` : url || "";
  } catch (e) {
    error.value = e.message || "Upload failed.";
  } finally {
    uploadBusy.value = false;
    if (pictureFileInput.value) pictureFileInput.value.value = "";
  }
}

async function saveProfile() {
  message.value = "";
  error.value = "";
  profileBusy.value = true;
  try {
    await identity.saveProfile({
      name: editingName.value,
      about: editingAbout.value,
      picture: editingPicture.value,
      website: editingWebsite.value,
      status: editingStatus.value,
    });
    message.value = "Profile published to the network.";
    setTimeout(() => (message.value = ""), 3000);
  } catch (e) {
    error.value = e.message || "Failed to publish profile.";
  } finally {
    profileBusy.value = false;
  }
}

async function loadFromKey() {
  error.value = "";
  message.value = "";
  restoreBusy.value = true;
  try {
    await identity.restorePrivateKey(rawKey.value.trim());
    rawKey.value = "";
    message.value = "Account restored. Redirecting…";
    setTimeout(() => router.replace("/"), 350);
  } catch (e) {
    error.value = e.message || "Failed to restore account.";
  } finally {
    restoreBusy.value = false;
  }
}

async function loadAccount() {
  error.value = "";
  message.value = "";
  deriveBusy.value = true;
  try {
    await identity.deriveIdentity(passphrase.value, pin.value);
    passphrase.value = "";
    pin.value = "";
    message.value = "Account loaded. Redirecting…";
    setTimeout(() => router.replace("/"), 350);
  } catch (e) {
    error.value = e.message || "Failed to derive account.";
  } finally {
    deriveBusy.value = false;
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
    <main class="mx-auto w-full max-w-[80rem] px-4 py-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-5">
        <!-- Header -->
        <section
          class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-3xl p-5 sm:p-6"
        >
          <div class="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <div
              class="relative shrink-0 cursor-pointer group/avatar"
              :title="uploadBusy ? 'Uploading…' : 'Change profile photo'"
              @click="pictureFileInput?.click()"
            >
              <div class="transition-transform duration-300 group-hover/avatar:scale-[1.03]">
                <RoboAvatar
                  :pubkey="identity.pubkeyHex"
                  :src="editingPicture"
                  size="hero"
                  alt="Your avatar"
                  :hoverable="true"
                />
              </div>
              <div
                class="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 opacity-0 transition-opacity duration-200 group-hover/avatar:opacity-100 pointer-events-none"
              >
                <Camera
                  v-if="!uploadBusy"
                  class="h-7 w-7 drop-shadow"
                  :stroke-width="1.8"
                  aria-hidden="true"
                />
                <LoaderCircle
                  v-else
                  class="h-7 w-7 animate-spin"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </div>
            </div>

            <input
              ref="pictureFileInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="handlePictureUpload"
            />

            <div class="min-w-0 flex-1 space-y-2">
              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-success)">
                Your account
              </p>
              <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{{ displayLabel }}</h1>
              <p v-if="editingStatus" class="text-sm text-zinc-400 leading-relaxed">
                {{ editingStatus }}
              </p>
              <p v-else class="text-sm text-zinc-500 leading-relaxed">
                Manage how you appear and control your cryptographic identity.
              </p>
              <div
                v-if="identity.pubkeyHex"
                class="inline-flex items-center gap-2 rounded-full bg-(--app-surface-soft) px-3 py-1 text-[11px] font-mono text-zinc-400"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                {{ shortId(identity.pubkeyHex) }}
              </div>
            </div>
          </div>
        </section>

        <UiTabBar
          :model-value="activeTab"
          :tabs="TABS"
          variant="surface"
          @update:model-value="setTab"
        />

        <!-- Profile -->
        <section
          v-if="activeTab === 'profile' && identity.pubkeyHex"
          class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 sm:p-5 space-y-4"
        >
          <div class="space-y-1">
            <h2 class="text-sm font-semibold">Public profile</h2>
            <p class="text-xs text-zinc-500 leading-relaxed">
              Published to relays and visible to anyone you chat with.
            </p>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs text-zinc-300">
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
            <label class="text-xs text-zinc-300">Bio</label>
            <textarea
              v-model="editingAbout"
              rows="3"
              maxlength="500"
              placeholder="Tell people a bit about yourself…"
              autocomplete="off"
              class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] resize-none"
            />
            <p class="text-[11px] text-zinc-500 text-right">{{ editingAbout.length }}/500</p>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs text-zinc-300">Website</label>
            <input
              v-model="editingWebsite"
              type="url"
              placeholder="https://your-site.example"
              maxlength="200"
              autocomplete="off"
              class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
            />
          </div>

          <div class="space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <label class="text-xs text-zinc-300">Profile picture URL</label>
              <button
                type="button"
                :disabled="uploadBusy"
                class="inline-flex items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) gap-1.5 text-xs px-3 py-1 disabled:opacity-50 shrink-0"
                @click="pictureFileInput?.click()"
              >
                <LoaderCircle
                  v-if="uploadBusy"
                  class="w-3.5 h-3.5 animate-spin"
                  :stroke-width="2"
                />
                <Camera v-else class="w-3.5 h-3.5" :stroke-width="1.8" />
                {{ uploadBusy ? "Uploading…" : "Upload" }}
              </button>
            </div>
            <input
              v-model="editingPicture"
              type="url"
              placeholder="https://ipfs.io/ipfs/Qm… or any image URL"
              maxlength="2000"
              autocomplete="off"
              class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
            />
          </div>

          <div class="h-px bg-white/8" />

          <div class="space-y-1.5">
            <label class="flex items-center gap-1.5 text-xs text-zinc-300">
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
            <p class="text-[11px] text-zinc-500 text-right">{{ editingStatus.length }}/150</p>
          </div>

          <PrimaryButton @click="saveProfile" :disabled="!canSaveProfile" :loading="profileBusy">
            {{ profileBusy ? "Publishing…" : "Publish profile" }}
          </PrimaryButton>
        </section>

        <!-- Identity & keys -->
        <section v-else-if="activeTab === 'identity'" class="space-y-4">
          <div
            v-if="identity.pubkeyHex"
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-semibold text-zinc-300">Public key</p>
                <p class="mt-0.5 text-[11px] text-zinc-500">
                  Share for direct encrypted chats in Gupt.
                </p>
              </div>
              <button
                type="button"
                class="inline-flex items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) gap-1 text-xs px-3 py-1 shrink-0"
                :class="pubkeyCopied ? 'text-emerald-400' : 'text-zinc-400'"
                @click="copyPubkey"
              >
                <Copy
                  v-if="!pubkeyCopied"
                  class="w-3.5 h-3.5"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <Check v-else class="w-3.5 h-3.5" :stroke-width="2.5" aria-hidden="true" />
                {{ pubkeyCopied ? "Copied" : "Copy" }}
              </button>
            </div>
            <p
              class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2.5 text-xs font-mono text-zinc-300 break-all leading-relaxed select-all"
            >
              {{ identity.pubkeyHex }}
            </p>
          </div>

          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3 border-amber-500/15"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-semibold text-amber-200">Private key</p>
                <p class="mt-0.5 text-[11px] text-zinc-500">
                  Backup only. Never share this with anyone.
                </p>
              </div>
              <button
                type="button"
                class="inline-flex items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) gap-1.5 text-xs px-3 py-1 shrink-0"
                @click="showPrivkey = !showPrivkey"
              >
                <Eye
                  v-if="!showPrivkey"
                  class="w-3.5 h-3.5"
                  :stroke-width="1.8"
                  aria-hidden="true"
                />
                <EyeOff v-else class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />
                {{ showPrivkey ? "Hide" : "Reveal" }}
              </button>
            </div>

            <div
              v-if="showPrivkey"
              class="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2.5"
            >
              <p class="text-[11px] font-mono text-amber-200 break-all leading-relaxed select-all">
                {{ identity.privkeyHex }}
              </p>
            </div>
            <p v-else class="text-[11px] text-zinc-500">
              Hidden by default. Reveal only when backing up.
            </p>

            <button
              type="button"
              class="inline-flex w-full items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) gap-1.5 px-4 py-3 text-xs font-semibold"
              :class="
                privkeyCopied
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-zinc-300 hover:bg-white/7'
              "
              @click="copyPrivkey"
            >
              <KeyRound
                v-if="!privkeyCopied"
                class="w-3.5 h-3.5"
                :stroke-width="2"
                aria-hidden="true"
              />
              <Check v-else class="w-3.5 h-3.5" :stroke-width="2.5" aria-hidden="true" />
              {{ privkeyCopied ? "Copied!" : "Copy private key" }}
            </button>
          </div>
        </section>

        <!-- Switch account -->
        <section v-else-if="activeTab === 'restore'" class="space-y-4">
          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-2"
          >
            <h2 class="text-sm font-semibold">Switch account</h2>
            <p class="text-xs text-zinc-500 leading-relaxed">
              Restoring replaces the current identity on this device. Cached chats and groups for
              the previous account will be cleared.
            </p>
          </div>

          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3"
          >
            <p class="text-xs font-semibold text-zinc-300">Paste private key or backup JSON</p>
            <textarea
              v-model="rawKey"
              rows="4"
              placeholder="64-character hex private key or backup JSON…"
              autocomplete="off"
              spellcheck="false"
              class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] font-mono resize-none"
            />
            <PrimaryButton @click="loadFromKey" :disabled="!canRestoreKey" :loading="restoreBusy">
              {{ restoreBusy ? "Restoring…" : "Restore from key" }}
            </PrimaryButton>
          </div>

          <div class="flex items-center gap-3">
            <span class="h-px flex-1 bg-white/8" />
            <span class="text-xs text-zinc-500">or derive</span>
            <span class="h-px flex-1 bg-white/8" />
          </div>

          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3"
          >
            <p class="text-xs font-semibold text-zinc-300">Passphrase + PIN</p>
            <p class="text-[11px] text-zinc-500">
              The same passphrase and PIN always unlock the same account (Argon2id).
            </p>

            <div class="space-y-1.5">
              <input
                v-model="passphrase"
                type="password"
                placeholder="Passphrase (min 8 characters)"
                autocomplete="new-password"
                class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
              />
              <p v-if="passphrase.length > 0 && !passphraseOk" class="text-xs text-red-400 px-1">
                At least 8 characters required ({{ passphrase.length }}/8)
              </p>
            </div>

            <input
              v-model="pin"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="PIN (numeric, e.g. 2847)"
              autocomplete="off"
              class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] font-mono tracking-widest"
              @keydown.enter="canDerive && loadAccount()"
            />

            <PrimaryButton @click="loadAccount" :disabled="!canDerive" :loading="deriveBusy">
              {{ deriveBusy ? "Loading…" : "Load account" }}
            </PrimaryButton>
          </div>
        </section>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />
      </div>
    </main>
  </div>
</template>
