<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import QRCode from "qrcode";
import {
  Camera,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  LoaderCircle,
  QrCode,
  Radio,
  Shield,
  UserRound,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import UiTabBar from "@/components/UiTabBar.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { pubkeyName, shortId } from "@/lib/crypto";
import { publicAppBaseUrl } from "@/lib/runtime";
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

const displayLabel = computed(
  () => editingName.value.trim() || identity.profileName || pubkeyName(identity.pubkeyHex),
);

const pubkeyCopied = ref(false);
const profileLinkCopied = ref(false);
const qrCanvas = ref(null);

const profileLink = computed(() =>
  identity.pubkeyHex ? `${publicAppBaseUrl()}/#/profile/${identity.pubkeyHex}` : "",
);

const passphrase = ref("");
const pin = ref("");
const showPassphrase = ref(false);
const deriveBusy = ref(false);

const passphraseOk = computed(() => passphrase.value.length >= 8);
const canDerive = computed(
  () => passphraseOk.value && pin.value.trim().length > 0 && !deriveBusy.value,
);

const passphraseStrength = computed(() => {
  const val = passphrase.value;
  if (!val) return { score: 0, label: "", colorClass: "", barClass: "", pct: 0 };

  let score = 0;
  if (val.length >= 8) score += 25;
  if (val.length >= 12) score += 20;
  if (val.length >= 16) score += 15;
  if (/[a-z]/.test(val)) score += 10;
  if (/[A-Z]/.test(val)) score += 10;
  if (/[0-9]/.test(val)) score += 10;
  if (/[^a-zA-Z0-9]/.test(val)) score += 10;

  const totalPct = Math.min(100, score);

  if (val.length < 8) {
    return {
      score,
      pct: Math.max(12, totalPct * 0.4),
      label: `Too short (${val.length}/8)`,
      colorClass: "text-rose-400 font-semibold",
      barClass: "bg-rose-500",
    };
  }
  if (totalPct < 50) {
    return {
      score,
      pct: totalPct,
      label: "Weak",
      colorClass: "text-amber-400 font-semibold",
      barClass: "bg-amber-500",
    };
  }
  if (totalPct < 75) {
    return {
      score,
      pct: totalPct,
      label: "Good",
      colorClass: "text-emerald-400 font-semibold",
      barClass: "bg-emerald-500",
    };
  }
  return {
    score,
    pct: totalPct,
    label: "Strong",
    colorClass: "text-emerald-400 font-bold",
    barClass: "bg-emerald-400",
  };
});

function flashCopied(state) {
  state.value = true;
  setTimeout(() => (state.value = false), 2000);
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

async function renderQr() {
  await nextTick();
  if (!identity.pubkeyHex || !qrCanvas.value) return;
  try {
    await QRCode.toCanvas(qrCanvas.value, profileLink.value || identity.pubkeyHex, {
      width: 140,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch (err) {
    console.error("Failed to render QR code:", err);
  }
}

watch(activeTab, (tab) => {
  if (tab === "identity") {
    renderQr();
  }
});

function seedEditingFields() {
  editingName.value = identity.profileName;
  editingAbout.value = identity.profileAbout;
  editingPicture.value = identity.profilePicture;
  editingWebsite.value = identity.profileWebsite;
  editingStatus.value = identity.profileStatus;
}

function setTab(nextTab) {
  activeTab.value = nextTab;
}

async function handlePictureUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    error.value = "Please select an image file.";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    error.value = "Image must be smaller than 10MB.";
    return;
  }

  error.value = "";
  uploadBusy.value = true;
  try {
    const url = await api.uploadFile(file);
    editingPicture.value = url;
    await saveProfile();
    message.value = "Profile picture uploaded & published.";
  } catch (err) {
    error.value = err.message || "Failed to upload image.";
  } finally {
    uploadBusy.value = false;
    if (pictureFileInput.value) pictureFileInput.value.value = "";
  }
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
    if (activeTab.value === "identity") {
      renderQr();
    }
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
                Manage how you appear and control your account identity.
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

        <!-- Identity & Public Key -->
        <section v-else-if="activeTab === 'identity'" class="space-y-4">
          <!-- QR Code & Share Profile Link -->
          <div
            v-if="identity.pubkeyHex"
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-5"
          >
            <div class="shrink-0 p-2 bg-white rounded-xl shadow-sm">
              <canvas ref="qrCanvas" class="block w-[140px] h-[140px]" />
            </div>
            <div class="space-y-2 text-center sm:text-left flex-1 min-w-0">
              <div
                class="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-semibold text-zinc-300"
              >
                <QrCode class="w-4 h-4 text-emerald-400" :stroke-width="2" aria-hidden="true" />
                Scan or share profile link
              </div>
              <p class="text-xs text-zinc-400 leading-relaxed">
                Scan this QR code with any camera or device to open your profile directly and start an E2E encrypted chat.
              </p>
              <div class="pt-1">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-(--app-surface-hover) transition-colors"
                  :class="profileLinkCopied ? 'text-emerald-400 border-emerald-500/30' : ''"
                  @click="copyProfileLink"
                >
                  <Link2 class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />
                  <Check
                    v-if="profileLinkCopied"
                    class="w-3.5 h-3.5 text-emerald-400"
                    :stroke-width="2.5"
                  />
                  {{ profileLinkCopied ? "Link copied" : "Copy profile link" }}
                </button>
              </div>
            </div>
          </div>

          <!-- Public Key -->
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
        </section>

        <!-- Switch account via Passphrase + PIN -->
        <section v-else-if="activeTab === 'restore'" class="space-y-4">
          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-2"
          >
            <h2 class="text-sm font-semibold">Switch account</h2>
            <p class="text-xs text-zinc-500 leading-relaxed">
              Enter your Passphrase + PIN to load or switch to an account. Cached data belonging to the previous session will be cleared.
            </p>
          </div>

          <div
            class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 space-y-3"
          >
            <p class="text-xs font-semibold text-zinc-300">Passphrase + PIN</p>
            <p class="text-[11px] text-zinc-500">
              The same passphrase and PIN combination always deterministically unlocks the exact same account (Argon2id).
            </p>

            <div class="space-y-2">
              <div class="relative">
                <input
                  v-model="passphrase"
                  :type="showPassphrase ? 'text' : 'password'"
                  placeholder="Passphrase (min 8 characters)"
                  autocomplete="new-password"
                  class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] pr-12 text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
                />
                <button
                  type="button"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg transition-colors"
                  @click="showPassphrase = !showPassphrase"
                  :title="showPassphrase ? 'Hide passphrase' : 'Reveal passphrase'"
                >
                  <EyeOff v-if="showPassphrase" class="w-4 h-4" :stroke-width="1.8" />
                  <Eye v-else class="w-4 h-4" :stroke-width="1.8" />
                </button>
              </div>

              <!-- Passphrase Key Strength Meter -->
              <div v-if="passphrase.length > 0" class="space-y-1.5 px-0.5 pt-0.5">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-zinc-400 text-[11px] font-medium">Key strength</span>
                  <span class="text-[11px] tabular-nums" :class="passphraseStrength.colorClass">
                    {{ passphraseStrength.label }}
                  </span>
                </div>
                <div
                  class="h-1.5 w-full overflow-hidden rounded-full bg-(--app-surface) border border-(--app-border)"
                >
                  <div
                    class="h-full rounded-full transition-all duration-300 ease-out"
                    :class="passphraseStrength.barClass"
                    :style="{ width: `${passphraseStrength.pct}%` }"
                  />
                </div>
              </div>
            </div>

            <input
              v-model="pin"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="PIN (numeric, e.g. 2847)"
              autocomplete="off"
              class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] font-mono tracking-widest"
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
