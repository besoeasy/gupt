<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  AlertTriangle,
  Camera,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Radio,
  Shield,
  ShieldCheck,
  UserRound,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import UiTabBar from "@/components/UiTabBar.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { pubkeyName } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";
import { api } from "@/lib/api";

const TABS = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "restore", label: "Switch account", icon: Shield },
];

const identity = useIdentityStore();
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
  });
});
</script>

<template>
  <div class="min-h-screen bg-(--app-bg) text-(--app-text)">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-5">
        <!-- Redesigned Identity Hero Card -->
        <section
          class="relative overflow-hidden rounded-3xl border border-(--app-border) bg-(--app-surface) shadow-xs transition-all"
        >
          <!-- Atmospheric Cover Banner -->
          <div
            class="relative h-24 sm:h-28 w-full overflow-hidden border-b border-(--app-border)/40 bg-linear-to-r from-(--app-primary)/25 via-(--app-primary)/10 to-emerald-500/15"
          >
            <!-- Ambient glow spots -->
            <div
              class="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-(--app-primary)/20 blur-2xl pointer-events-none"
            />
            <div
              class="absolute left-1/4 -bottom-10 h-28 w-28 rounded-full bg-emerald-500/15 blur-xl pointer-events-none"
            />
          </div>

          <!-- Card Body Content -->
          <div class="px-5 pb-6 pt-0 sm:px-7 sm:pb-7 space-y-6">
            <div class="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 -mt-12 sm:-mt-14">
              <!-- Floating Overlapping Avatar -->
              <div class="relative shrink-0 self-center sm:self-auto">
                <div
                  class="overflow-hidden rounded-3xl border-4 border-(--app-surface) bg-(--app-surface-soft) shadow-xl"
                >
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
                <div class="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider"
                    :class="
                      identity.mode === 'ephemeral'
                        ? 'border border-amber-500/30 bg-amber-500/15 text-amber-400'
                        : 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                    "
                  >
                    <span
                      class="h-1.5 w-1.5 rounded-full"
                      :class="
                        identity.mode === 'ephemeral'
                          ? 'bg-amber-400'
                          : 'bg-emerald-400 animate-pulse'
                      "
                    />
                    {{
                      identity.mode === "ephemeral"
                        ? "Temporary Guest Session"
                        : "Secured secp256k1 Identity"
                    }}
                  </span>
                </div>

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

            <input
              ref="pictureFileInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="handlePictureUpload"
            />

            <!-- Public Key Row -->
            <div class="pt-4 border-t border-(--app-border) space-y-2.5">
              <div
                class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-(--app-muted)"
              >
                <div class="flex items-center gap-1.5">
                  <KeyRound class="h-3.5 w-3.5 text-(--app-primary)" />
                  <span>Public Key</span>
                </div>
                <span class="text-[11px] font-mono text-(--app-muted) lowercase">secp256k1</span>
              </div>

              <div
                v-if="identity.pubkeyHex"
                class="flex items-center justify-between gap-3 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-2.5 sm:p-3 transition-colors hover:border-(--app-border-strong)"
              >
                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                  <span
                    class="h-2 w-2 shrink-0 rounded-full"
                    :class="identity.mode === 'ephemeral' ? 'bg-amber-400' : 'bg-emerald-400'"
                    aria-hidden="true"
                  />
                  <span
                    class="min-w-0 select-all font-mono text-xs text-(--app-text-soft) truncate tracking-tight"
                    :title="identity.pubkeyHex"
                  >
                    {{ identity.pubkeyHex }}
                  </span>
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all cursor-pointer"
                    :class="
                      pubkeyCopied
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : 'bg-(--app-surface) border border-(--app-border) text-(--app-text) hover:bg-(--app-surface-hover) hover:border-(--app-border-strong)'
                    "
                    :title="pubkeyCopied ? 'Copied to clipboard!' : 'Copy public key'"
                    @click="copyPubkey"
                  >
                    <Check v-if="pubkeyCopied" class="h-3.5 w-3.5" :stroke-width="2.5" />
                    <Copy v-else class="h-3.5 w-3.5" :stroke-width="2" />
                    <span>{{ pubkeyCopied ? "Copied" : "Copy Key" }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Ephemeral Session Warning Banner -->
        <div
          v-if="identity.mode === 'ephemeral'"
          class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2 text-xs"
        >
          <div class="flex items-center gap-2 font-semibold text-amber-500 text-sm">
            <AlertTriangle class="h-4 w-4 shrink-0" />
            <span>Temporary Ephemeral Identity</span>
          </div>
          <p class="text-(--app-muted) leading-relaxed">
            You are using an un-saved temporary guest key stored only in this browser tab. If you
            close this tab or clear browser data, this identity and its message history cannot be
            recovered.
          </p>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 font-semibold text-amber-500 hover:underline pt-0.5"
            @click="setTab('restore')"
          >
            Set up permanent Password + PIN account &rarr;
          </button>
        </div>

        <UiTabBar
          :model-value="activeTab"
          :tabs="TABS"
          variant="surface"
          @update:model-value="setTab"
        />

        <!-- Profile -->
        <section
          v-if="activeTab === 'profile' && identity.pubkeyHex"
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

          <div class="space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <label class="text-xs text-(--app-text)">Profile picture URL</label>
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

        <!-- Switch account via Passphrase + PIN -->
        <section v-else-if="activeTab === 'restore'" class="space-y-4">
          <div
            class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-2xl p-4 space-y-2"
          >
            <h2 class="text-sm font-semibold">Switch account</h2>
            <p class="text-xs text-(--app-muted) leading-relaxed">
              Enter your Passphrase + PIN to load or switch to an account. Cached data belonging to
              the previous session will be cleared.
            </p>
          </div>

          <div
            class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-2xl p-4 space-y-3"
          >
            <p class="text-xs font-semibold text-(--app-text)">Passphrase + PIN</p>
            <p class="text-[11px] text-(--app-muted)">
              The same passphrase and PIN combination always deterministically unlocks the exact
              same account (Argon2id).
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
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-(--app-muted) hover:text-(--app-text) p-1.5 rounded-lg transition-colors"
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
                  <span class="text-(--app-muted) text-[11px] font-medium">Key strength</span>
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
