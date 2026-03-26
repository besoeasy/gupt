<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Camera,
  KeyRound,
  LoaderCircle,
  Radio,
  User,
  ChevronDown,
  Check,
  Copy,
  Eye,
  EyeOff,
} from "lucide-vue-next";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { pubkeyName, npubFromPubkey } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";
import { api } from "@/lib/api";

const identity = useIdentityStore();
const router = useRouter();

const message = ref("");
const error = ref("");

const activeAccordion = ref("profile");

function toggleAccordion(panel) {
  activeAccordion.value = activeAccordion.value === panel ? "" : panel;
}

// ── profile + status editing ──────────────────────────────────
const editingName = ref("");
const editingAbout = ref("");
const editingPicture = ref("");
const editingWebsite = ref("");
const editingStatus = ref("");
const profileBusy = ref(false);
const uploadBusy = ref(false);
const pictureFileInput = ref(null);
const canSaveProfile = computed(() => editingName.value.trim().length > 0 && !profileBusy.value);

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
    message.value = "Profile published.";
    setTimeout(() => (message.value = ""), 3000);
  } catch (e) {
    error.value = e.message || "Failed to publish profile.";
  } finally {
    profileBusy.value = false;
  }
}

function seedEditingFields() {
  editingName.value = identity.profileName;
  editingAbout.value = identity.profileAbout;
  editingPicture.value = identity.profilePicture;
  editingWebsite.value = identity.profileWebsite;
  editingStatus.value = identity.profileStatus;
}

// ── keys logic ─────────────────────────────────────────────────
const npub = computed(() => npubFromPubkey(identity.pubkeyHex) || "");

const npubCopied = ref(false);
async function copyNpub() {
  if (!npub.value) return;
  await navigator.clipboard.writeText(npub.value);
  npubCopied.value = true;
  setTimeout(() => (npubCopied.value = false), 2000);
}

const copied = ref(false);
async function copyPubkey() {
  await navigator.clipboard.writeText(identity.pubkeyHex);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

const showPrivkey = ref(false);
const privkeyCopied = ref(false);
async function copyPrivkey() {
  await navigator.clipboard.writeText(identity.privkeyHex);
  privkeyCopied.value = true;
  setTimeout(() => (privkeyCopied.value = false), 2000);
}

const rawKey = ref("");
const restoreBusy = ref(false);
const canRestoreKey = computed(() => rawKey.value.trim().length > 0 && !restoreBusy.value);
async function loadFromKey() {
  error.value = "";
  message.value = "";
  restoreBusy.value = true;
  try {
    await identity.restorePrivateKey(rawKey.value.trim());
    rawKey.value = "";
    message.value = "Identity restored. Redirecting…";
    setTimeout(() => window.location.assign("/"), 350);
  } catch (e) {
    error.value = e.message || "Failed to restore identity.";
  } finally {
    restoreBusy.value = false;
  }
}

const passphrase = ref("");
const pin = ref("");
const busy = ref(false);
const passphraseOk = computed(() => passphrase.value.length >= 8);
const canSubmit = computed(() => passphraseOk.value && pin.value.trim().length > 0 && !busy.value);
async function loadAccount() {
  error.value = "";
  message.value = "";
  busy.value = true;
  try {
    await identity.deriveIdentity(passphrase.value, pin.value);
    passphrase.value = "";
    pin.value = "";
    message.value = "Identity loaded. Redirecting…";
    setTimeout(() => window.location.assign("/"), 350);
  } catch (e) {
    error.value = e.message || "Failed to derive identity.";
  } finally {
    busy.value = false;
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
  <div class="min-h-screen bg-black text-white flex flex-col">
    <main class="app-page-shell mx-auto px-4 py-8 space-y-6">
      <!-- Avatar -->
      <div class="flex flex-col items-center gap-3">
        <div
          class="relative group/avatar cursor-pointer"
          @click="pictureFileInput?.click()"
          :title="uploadBusy ? 'Uploading…' : 'Tap to change photo'"
        >
          <div class="story-ring transition-transform duration-300 group-hover/avatar:scale-105">
            <RoboAvatar
              :pubkey="identity.pubkeyHex"
              :src="editingPicture"
              size="hero"
              alt="Your avatar"
            />
          </div>
          <div
            class="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-200 pointer-events-none"
          >
            <Camera
              v-if="!uploadBusy"
              class="w-7 h-7 text-white drop-shadow"
              :stroke-width="1.8"
              aria-hidden="true"
            />
            <LoaderCircle
              v-else
              class="w-7 h-7 text-white animate-spin"
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
        <p class="text-base font-bold">
          {{ identity.profileName || pubkeyName(identity.pubkeyHex) }}
        </p>
      </div>

      <div class="space-y-4" v-if="identity.pubkeyHex">
        <!-- Profile Accordion -->
        <div class="app-card space-y-0 transition-colors duration-200">
          <button
            @click="toggleAccordion('profile')"
            class="w-full flex items-center justify-between outline-none"
          >
            <div class="flex items-center gap-2">
              <User class="w-4 h-4 text-zinc-500" :stroke-width="2" aria-hidden="true" />
              <span class="text-sm font-semibold tracking-wide uppercase text-zinc-200"
                >Profile Details</span
              >
            </div>
            <ChevronDown
              class="w-4 h-4 text-zinc-500 transition-transform duration-200"
              :class="{ 'rotate-180': activeAccordion === 'profile' }"
            />
          </button>

          <div
            v-show="activeAccordion === 'profile'"
            class="space-y-4 pt-4 mt-4 border-t border-white/10"
          >
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Display name -->
              <div class="space-y-1">
                <label class="text-xs text-zinc-500"
                  >Display name <span class="text-red-500">*</span></label
                >
                <input
                  v-model="editingName"
                  type="text"
                  placeholder="e.g. Alice"
                  maxlength="100"
                  autocomplete="off"
                  class="w-full bg-zinc-800 border border-white/8 rounded-xl px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:border-white/20 transition-all duration-150"
                  @keydown.enter="canSaveProfile && saveProfile()"
                />
              </div>

              <!-- Website -->
              <div class="space-y-1">
                <label class="text-xs text-zinc-500">Website</label>
                <input
                  v-model="editingWebsite"
                  type="url"
                  placeholder="https://your-site.example"
                  maxlength="200"
                  autocomplete="off"
                  class="w-full bg-zinc-800 border border-white/8 rounded-xl px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:border-white/20 transition-all duration-150"
                />
              </div>

              <!-- Picture URL -->
              <div class="space-y-1.5 sm:col-span-2">
                <div class="flex items-center justify-between gap-2">
                  <label class="text-xs text-zinc-500">Profile picture URL</label>
                  <button
                    @click="pictureFileInput?.click()"
                    :disabled="uploadBusy"
                    class="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-400 transition-all duration-150 disabled:opacity-50 shrink-0"
                  >
                    <LoaderCircle
                      v-if="uploadBusy"
                      class="w-3.5 h-3.5 animate-spin"
                      :stroke-width="2"
                    />
                    <Camera v-else class="w-3.5 h-3.5" :stroke-width="1.8" />
                    {{ uploadBusy ? "Uploading…" : "Upload image" }}
                  </button>
                </div>
                <input
                  v-model="editingPicture"
                  type="url"
                  placeholder="https://ipfs.io/ipfs/Qm… or any image URL"
                  maxlength="2000"
                  autocomplete="off"
                  class="w-full bg-zinc-800 border border-white/8 rounded-xl px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:border-white/20 transition-all duration-150"
                />
              </div>

              <!-- Bio -->
              <div class="space-y-1 sm:col-span-2">
                <label class="text-xs text-zinc-500">Bio</label>
                <textarea
                  v-model="editingAbout"
                  rows="3"
                  maxlength="500"
                  placeholder="Tell people a bit about yourself…"
                  autocomplete="off"
                  class="w-full bg-zinc-800 border border-white/8 rounded-xl px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:border-white/20 resize-none leading-relaxed transition-all duration-150"
                />
                <p class="text-[11px] text-zinc-600 text-right">{{ editingAbout.length }}/500</p>
              </div>

              <!-- Status -->
              <div class="space-y-1 sm:col-span-2">
                <label class="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Radio class="w-3 h-3" :stroke-width="2" aria-hidden="true" />
                  Status
                </label>
                <input
                  v-model="editingStatus"
                  type="text"
                  placeholder="e.g. Building something cool…"
                  maxlength="150"
                  autocomplete="off"
                  class="w-full bg-zinc-800 border border-white/8 rounded-xl px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:border-white/20 transition-all duration-150"
                  @keydown.enter="canSaveProfile && saveProfile()"
                />
                <p class="text-[11px] text-zinc-600 text-right">{{ editingStatus.length }}/150</p>
              </div>
            </div>

            <PrimaryButton @click="saveProfile" :disabled="!canSaveProfile" :loading="profileBusy">
              {{ profileBusy ? "Publishing…" : "Publish Profile" }}
            </PrimaryButton>
            <p class="text-[11px] text-zinc-600">
              Published to the network and readable by any compatible client.
            </p>
          </div>
        </div>

        <!-- Keys Accordion -->
        <div class="app-card space-y-0 transition-colors duration-200">
          <button
            @click="toggleAccordion('keys')"
            class="w-full flex items-center justify-between outline-none"
          >
            <div class="flex items-center gap-2">
              <KeyRound class="w-4 h-4 text-zinc-500" :stroke-width="2" aria-hidden="true" />
              <span class="text-sm font-semibold tracking-wide uppercase text-zinc-200"
                >Keys & Account</span
              >
            </div>
            <ChevronDown
              class="w-4 h-4 text-zinc-500 transition-transform duration-200"
              :class="{ 'rotate-180': activeAccordion === 'keys' }"
            />
          </button>

          <div
            v-show="activeAccordion === 'keys'"
            class="space-y-6 pt-4 mt-4 border-t border-white/10"
          >
            <!-- Nostr npub -->
            <div
              v-if="npub"
              class="bg-white/5 border border-white/10 rounded-2xl px-4 py-4 space-y-3"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <span class="text-xs font-semibold text-zinc-300 tracking-wide uppercase"
                    >Nostr npub</span
                  >
                  <p class="mt-1 text-[11px] text-zinc-500">
                    Use this to share your Nostr identity.
                  </p>
                </div>
                <button
                  @click="copyNpub"
                  class="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all duration-150"
                  :class="npubCopied ? 'text-emerald-300' : 'text-zinc-300'"
                >
                  <Copy
                    v-if="!npubCopied"
                    class="w-3.5 h-3.5"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  <Check v-else class="w-3.5 h-3.5" :stroke-width="2.5" aria-hidden="true" />
                  {{ npubCopied ? "Copied!" : "Copy npub" }}
                </button>
              </div>
              <p class="text-[12px] font-mono text-zinc-400 break-all leading-relaxed select-all">
                {{ npub }}
              </p>
            </div>

            <!-- Raw Public Key -->
            <div
              v-if="identity.pubkeyHex"
              class="bg-zinc-900 border border-white/8 rounded-2xl px-4 py-4 space-y-3"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-zinc-300 tracking-wide uppercase"
                  >Raw public key</span
                >
                <button
                  @click="copyPubkey"
                  class="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all duration-150"
                  :class="copied ? 'text-emerald-400' : 'text-zinc-400'"
                >
                  <Copy v-if="!copied" class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />
                  <Check v-else class="w-3.5 h-3.5" :stroke-width="2.5" aria-hidden="true" />
                  {{ copied ? "Copied!" : "Copy" }}
                </button>
              </div>
              <p class="text-[11px] font-mono text-zinc-500 break-all leading-relaxed">
                {{ identity.pubkeyHex }}
              </p>
              <p class="text-[11px] text-zinc-600">
                Hex form for advanced use, debugging, and low-level interoperability.
              </p>
            </div>

            <!-- Backup Private Key -->
            <div
              v-if="identity.privkeyHex"
              class="bg-zinc-900 border border-white/8 rounded-2xl px-4 py-4 space-y-3"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-zinc-300 tracking-wide uppercase"
                  >Private Key</span
                >
                <button
                  @click="showPrivkey = !showPrivkey"
                  class="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-400 transition-all duration-150"
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

              <div v-if="showPrivkey" class="space-y-2">
                <div class="px-3 py-2 bg-zinc-800 rounded-xl">
                  <p
                    class="text-[11px] font-mono text-amber-300 break-all leading-relaxed select-all"
                  >
                    {{ identity.privkeyHex }}
                  </p>
                </div>
                <p class="text-[11px] text-red-400/80">
                  Never share this with anyone. Anyone with this key controls your account.
                </p>
              </div>

              <button
                @click="copyPrivkey"
                class="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold active:scale-[0.98] transition-all duration-150"
                :class="
                  privkeyCopied
                    ? 'bg-emerald-900/50 text-emerald-300'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                "
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

            <!-- Restore Account -->
            <p class="text-xs font-semibold text-zinc-500 tracking-wide uppercase pt-4">
              Restore account
            </p>

            <!-- Option 1 -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div class="bg-zinc-900 border border-white/8 rounded-2xl px-4 py-4 space-y-3">
                <p class="text-xs font-semibold text-zinc-300">Paste private key or backup file</p>
                <textarea
                  v-model="rawKey"
                  rows="3"
                  placeholder="Paste your 64-character hex private key or backup JSON here…"
                  autocomplete="off"
                  spellcheck="false"
                  class="w-full bg-zinc-800 border border-white/8 rounded-xl px-3 py-2.5 text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-white/20 resize-none leading-relaxed transition-colors duration-150"
                />
                <PrimaryButton @click="loadFromKey" :disabled="!canRestoreKey" :loading="restoreBusy">
                  {{ restoreBusy ? "Restoring…" : "Restore from key" }}
                </PrimaryButton>
              </div>

              <!-- Option 2 -->
              <div class="bg-zinc-900 border border-white/8 rounded-2xl px-4 py-4 space-y-3">
                <p class="text-xs font-semibold text-zinc-300">Derive from passphrase + PIN</p>
                <p class="text-[11px] text-zinc-500">
                  Same passphrase + PIN always unlocks the same account.
                </p>

                <div class="space-y-1">
                  <input
                    v-model="passphrase"
                    type="password"
                    placeholder="Passphrase (min 8 characters)"
                    autocomplete="new-password"
                    class="w-full bg-zinc-800 border rounded-xl px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:border-white/20 transition-all duration-150"
                    :class="
                      passphrase.length > 0 && !passphraseOk ? 'border-red-800' : 'border-white/8'
                    "
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
                  class="w-full bg-zinc-800 border border-white/8 rounded-xl px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:border-white/20 font-mono tracking-widest transition-all duration-150"
                  @keydown.enter="canSubmit && loadAccount()"
                />

                <PrimaryButton @click="loadAccount" :disabled="!canSubmit" :loading="busy">
                  {{ busy ? "Loading…" : "Load Account" }}
                </PrimaryButton>

                <p class="text-[11px] text-zinc-600 leading-relaxed">
                  Key derivation uses Argon2id — the same passphrase + PIN always restores the same
                  account.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Notices -->
      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />
    </main>
  </div>
</template>
