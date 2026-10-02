<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  KeyRound,
  Trash2,
  Loader2,
  Check,
  X,
  Pencil,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Tag,
  ShieldCheck,
  ExternalLink,
  RefreshCw,
  Clock,
  Sparkles,
  User,
  Mail,
} from "@lucide/vue";
import PageBackHeader from "@/components/PageBackHeader.vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import { useIdentityStore } from "@/stores/identity";
import { copyToClipboard } from "@/lib/clipboard";
import {
  getPasswordsCached,
  fetchPasswords,
  savePassword,
  deletePassword,
  passwordHostname,
  normalizePasswordTags,
  parsePasswordTagsInput,
  generateTotpCode,
  totpSecondsRemaining,
} from "@/lib/passwords";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();

const passwordId = computed(() => route.params.id || "");
const isNew = computed(() => !passwordId.value || route.path === "/passwords/new");

const isLoading = ref(!isNew.value);
const isSaving = ref(false);
const isDeleting = ref(false);
const error = ref("");
const showDeleteConfirm = ref(false);

const passwordItem = ref(null);
const isEditing = ref(isNew.value);

const showPassword = ref(false);
const showTotpSecret = ref(false);
const showGenerator = ref(false);

const genLength = ref(16);
const genIncludeUpper = ref(true);
const genIncludeLower = ref(true);
const genIncludeNumbers = ref(true);
const genIncludeSymbols = ref(true);

const form = ref({
  title: "",
  username: "",
  email: "",
  password: "",
  uris: [""],
  totp: "",
  notes: "",
  tags: [],
});
const tagDraft = ref("");
const uriDraft = ref("");

const copiedField = ref(null);
let copyTimer = null;

const totpCode = ref("");
const totpRemain = ref(30);
let totpInterval = null;

const primaryHostname = computed(() => {
  const uri = form.value.uris.find((u) => u && u.trim());
  return uri ? passwordHostname(uri) : "";
});

function generatePassword() {
  const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowers = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "!@#$%^&*()-_=+[]{}|;:,.<>?";

  let chars = "";
  if (genIncludeUpper.value) chars += uppers;
  if (genIncludeLower.value) chars += lowers;
  if (genIncludeNumbers.value) chars += numbers;
  if (genIncludeSymbols.value) chars += symbols;
  if (!chars) chars = lowers + numbers;

  const array = new Uint32Array(genLength.value);
  crypto.getRandomValues(array);
  let res = "";
  for (let i = 0; i < genLength.value; i++) {
    res += chars[array[i] % chars.length];
  }
  form.value.password = res;
  showPassword.value = true;
}

function startTotpTimer(secret) {
  stopTotpTimer();
  if (!secret?.trim()) return;
  const tick = async () => {
    try {
      totpCode.value = await generateTotpCode(secret);
      totpRemain.value = totpSecondsRemaining();
    } catch {
      totpCode.value = "";
    }
  };
  void tick();
  totpInterval = setInterval(tick, 1000);
}

function stopTotpTimer() {
  if (totpInterval) {
    clearInterval(totpInterval);
    totpInterval = null;
  }
  totpCode.value = "";
  totpRemain.value = 30;
}

watch(
  () => form.value.totp,
  (secret) => {
    startTotpTimer(secret);
  },
);

onUnmounted(() => {
  stopTotpTimer();
  if (copyTimer) clearTimeout(copyTimer);
});

function addTagFromDraft() {
  const parsed = parsePasswordTagsInput(tagDraft.value);
  if (!parsed.length) return;
  form.value.tags = normalizePasswordTags([...form.value.tags, ...parsed]);
  tagDraft.value = "";
}

function removeTag(tag) {
  form.value.tags = form.value.tags.filter((t) => t !== tag);
}

function addUriFromDraft() {
  const u = uriDraft.value.trim();
  if (!u) return;
  form.value.uris.push(u);
  uriDraft.value = "";
}

function removeUri(idx) {
  form.value.uris.splice(idx, 1);
}

async function copyValue(val, fieldName) {
  if (!val) return;
  await copyToClipboard(val);
  copiedField.value = fieldName;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copiedField.value = null;
  }, 1800);
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getNjumpUrl(eventId) {
  if (!eventId) return "";
  return `https://njump.me/e/${eventId}`;
}

async function loadPassword() {
  if (isNew.value) {
    isEditing.value = true;
    return;
  }
  isLoading.value = true;
  error.value = "";
  try {
    const cached = await getPasswordsCached(identity.privkeyHex, identity.pubkeyHex);
    let item = (cached?.items || []).find((p) => p.id === passwordId.value);

    if (!item) {
      const live = await fetchPasswords(identity.privkeyHex, identity.pubkeyHex);
      item = live.find((p) => p.id === passwordId.value);
    }

    if (!item) {
      error.value = "Password not found or has been deleted.";
      return;
    }

    passwordItem.value = item;
    form.value = {
      title: item.title || "",
      username: item.username || "",
      email: item.email || "",
      password: item.password || "",
      uris: item.uris?.length ? [...item.uris] : [""],
      totp: item.totp || "",
      notes: item.notes || "",
      tags: [...(item.tags || [])],
    };
    if (item.totp) {
      startTotpTimer(item.totp);
    }
  } catch (err) {
    error.value = err?.message || "Failed to load password.";
  } finally {
    isLoading.value = false;
  }
}

async function handleSave() {
  if (isSaving.value) return;
  if (tagDraft.value.trim()) addTagFromDraft();
  if (uriDraft.value.trim()) addUriFromDraft();
  if (!form.value.password.trim()) {
    error.value = "Password is required.";
    return;
  }

  isSaving.value = true;
  error.value = "";
  try {
    await savePassword(
      identity.privkeyHex,
      identity.pubkeyHex,
      {
        title: form.value.title,
        username: form.value.username,
        email: form.value.email,
        password: form.value.password,
        uris: form.value.uris.filter((u) => u && u.trim()),
        totp: form.value.totp,
        notes: form.value.notes,
        tags: form.value.tags,
      },
      { id: isNew.value ? null : passwordId.value },
    );
    router.push("/passwords");
  } catch (err) {
    error.value = err?.message || "Failed to save password entry.";
  } finally {
    isSaving.value = false;
  }
}

async function confirmDelete() {
  if (!passwordItem.value) return;
  isDeleting.value = true;
  error.value = "";
  try {
    await deletePassword(identity.privkeyHex, identity.pubkeyHex, passwordItem.value);
    showDeleteConfirm.value = false;
    router.push("/passwords");
  } catch (err) {
    error.value = err?.message || "Failed to delete password entry.";
  } finally {
    isDeleting.value = false;
  }
}

onMounted(() => {
  loadPassword();
});
</script>

<template>
  <main class="min-h-dvh overflow-y-auto overflow-x-hidden bg-black text-zinc-100 pb-16 lg:h-full">
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-6">
        <PageBackHeader
          back-to="/passwords"
          back-label="Passwords"
          :eyebrow="isNew ? 'New Credential' : 'Encrypted Password'"
          :title="isNew ? 'Add Password' : form.title || primaryHostname || 'Password Entry'"
        >
          <p class="text-sm leading-6 text-zinc-500">
            {{
              isNew
                ? "Store logins, TOTP 2FA keys, and secure credentials encrypted with Argon2id."
                : "All secrets, passwords, and TOTP keys remain strictly inside encrypted ciphertext."
            }}
          </p>
        </PageBackHeader>

        <AppAlertBanner v-if="error" :message="error" />

        <!-- Loading State -->
        <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 text-center">
          <Loader2 class="h-8 w-8 animate-spin text-zinc-500" />
          <p class="mt-3 text-sm text-zinc-500">Fetching encrypted password…</p>
        </div>

        <template v-else>
          <!-- View / Read Mode (when not in edit mode) -->
          <article
            v-if="!isEditing && passwordItem"
            class="rounded-xl border border-zinc-800 bg-zinc-950/40 p-6 sm:p-8 shadow-sm space-y-6"
          >
            <!-- Top Controls -->
            <div
              class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4"
            >
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-95 cursor-pointer"
                  @click="isEditing = true"
                >
                  <Pencil class="h-3.5 w-3.5" />
                  <span>Edit Entry</span>
                </button>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-800 px-3 text-xs font-semibold text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-colors cursor-pointer"
                  @click="showDeleteConfirm = true"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>

            <!-- TOTP 2FA Banner if present -->
            <div
              v-if="totpCode"
              class="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 sm:p-5"
            >
              <div class="space-y-1">
                <p class="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  2FA Verification Code
                </p>
                <div class="flex items-center gap-3">
                  <p class="font-mono text-3xl font-bold tracking-widest text-white">
                    {{ totpCode.slice(0, 3) }} {{ totpCode.slice(3) }}
                  </p>
                  <span
                    class="rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-xs font-medium text-zinc-200"
                  >
                    {{ totpRemain }}s
                  </span>
                </div>
              </div>

              <button
                type="button"
                class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-4 text-xs font-semibold text-black shadow-xs hover:bg-zinc-200 transition-colors cursor-pointer"
                @click="copyValue(totpCode, 'totpCode')"
              >
                <Check v-if="copiedField === 'totpCode'" class="h-4 w-4" />
                <Copy v-else class="h-4 w-4" />
                <span>{{ copiedField === "totpCode" ? "Copied" : "Copy Code" }}</span>
              </button>
            </div>

            <!-- Credentials List -->
            <div class="space-y-4">
              <!-- Username -->
              <div
                v-if="form.username"
                class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
              >
                <div class="min-w-0 flex-1 space-y-0.5">
                  <p class="text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                    Username
                  </p>
                  <p class="font-medium text-sm text-zinc-100 truncate">{{ form.username }}</p>
                </div>
                <button
                  type="button"
                  class="inline-flex h-8 items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
                  @click="copyValue(form.username, 'username')"
                >
                  <Check v-if="copiedField === 'username'" class="h-3.5 w-3.5 text-emerald-400" />
                  <Copy v-else class="h-3.5 w-3.5" />
                  <span>{{ copiedField === "username" ? "Copied" : "Copy" }}</span>
                </button>
              </div>

              <!-- Email -->
              <div
                v-if="form.email"
                class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
              >
                <div class="min-w-0 flex-1 space-y-0.5">
                  <p class="text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                    Email
                  </p>
                  <p class="font-medium text-sm text-zinc-100 truncate">{{ form.email }}</p>
                </div>
                <button
                  type="button"
                  class="inline-flex h-8 items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
                  @click="copyValue(form.email, 'email')"
                >
                  <Check v-if="copiedField === 'email'" class="h-3.5 w-3.5 text-emerald-400" />
                  <Copy v-else class="h-3.5 w-3.5" />
                  <span>{{ copiedField === "email" ? "Copied" : "Copy" }}</span>
                </button>
              </div>

              <!-- Password -->
              <div
                class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
              >
                <div class="min-w-0 flex-1 space-y-0.5">
                  <p class="text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                    Password
                  </p>
                  <p class="font-mono text-sm font-semibold text-zinc-100 truncate">
                    {{ showPassword ? form.password : "••••••••••••••••" }}
                  </p>
                </div>
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    class="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:text-zinc-100 transition-colors cursor-pointer"
                    :title="showPassword ? 'Hide password' : 'Show password'"
                    @click="showPassword = !showPassword"
                  >
                    <EyeOff v-if="showPassword" class="h-4 w-4" />
                    <Eye v-else class="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
                    @click="copyValue(form.password, 'password')"
                  >
                    <Check v-if="copiedField === 'password'" class="h-3.5 w-3.5 text-emerald-400" />
                    <Copy v-else class="h-3.5 w-3.5" />
                    <span>{{ copiedField === "password" ? "Copied" : "Copy" }}</span>
                  </button>
                </div>
              </div>

              <!-- Websites / URLs -->
              <div
                v-if="form.uris.filter((u) => u && u.trim()).length"
                class="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2"
              >
                <p class="text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                  Websites
                </p>
                <div
                  v-for="(uri, idx) in form.uris.filter((u) => u && u.trim())"
                  :key="idx"
                  class="flex items-center justify-between gap-2"
                >
                  <span class="font-mono text-xs text-zinc-100 truncate">{{ uri }}</span>
                  <a
                    :href="uri"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-xs font-medium text-zinc-300 hover:text-white hover:underline"
                  >
                    <ExternalLink class="h-3.5 w-3.5" />
                    <span>Open</span>
                  </a>
                </div>
              </div>

              <!-- Notes -->
              <div
                v-if="form.notes"
                class="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-1.5"
              >
                <p class="text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                  Secure Notes
                </p>
                <p class="text-sm text-zinc-100 whitespace-pre-wrap leading-relaxed">
                  {{ form.notes }}
                </p>
              </div>

              <!-- Tags -->
              <div v-if="form.tags.length" class="flex flex-wrap gap-1.5 pt-2">
                <span
                  v-for="tag in form.tags"
                  :key="tag"
                  class="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-xs font-semibold text-zinc-300"
                >
                  #{{ tag }}
                </span>
              </div>
            </div>
          </article>

          <!-- Edit / Create Form Card -->
          <form
            v-else
            class="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5 sm:p-7 shadow-sm space-y-5"
            @submit.prevent="handleSave"
          >
            <!-- Title -->
            <div class="space-y-1.5">
              <label class="block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Title
              </label>
              <input
                v-model="form.title"
                type="text"
                placeholder="e.g. GitHub, Google, Work VPN"
                class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none transition-colors font-semibold"
              />
            </div>

            <!-- Username & Email Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  Username
                </label>
                <div class="relative">
                  <User
                    class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"
                  />
                  <input
                    v-model="form.username"
                    type="text"
                    placeholder="username"
                    class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div class="space-y-1.5">
                <label class="block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  Email
                </label>
                <div class="relative">
                  <Mail
                    class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"
                  />
                  <input
                    v-model="form.email"
                    type="email"
                    placeholder="user@example.com"
                    class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            <!-- Password Field with Generator Toggle -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  Password <span class="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-white hover:underline cursor-pointer"
                  @click="showGenerator = !showGenerator"
                >
                  <Sparkles class="h-3.5 w-3.5" />
                  <span>{{ showGenerator ? "Hide generator" : "Generate strong password" }}</span>
                </button>
              </div>

              <div class="relative flex items-center">
                <KeyRound class="pointer-events-none absolute left-3.5 h-4 w-4 text-zinc-500" />
                <input
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  required
                  placeholder="Master password or phrase"
                  class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 pl-10 pr-10 py-2.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  class="absolute right-3 text-zinc-500 hover:text-zinc-100 cursor-pointer"
                  @click="showPassword = !showPassword"
                >
                  <EyeOff v-if="showPassword" class="h-4 w-4" />
                  <Eye v-else class="h-4 w-4" />
                </button>
              </div>

              <!-- Password Generator Panel -->
              <div
                v-if="showGenerator"
                class="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold text-zinc-100"
                    >Password Length: {{ genLength }}</span
                  >
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
                    @click="generatePassword"
                  >
                    <RefreshCw class="h-3 w-3" />
                    <span>Regenerate</span>
                  </button>
                </div>

                <input
                  v-model.number="genLength"
                  type="range"
                  min="8"
                  max="64"
                  class="w-full accent-white cursor-pointer"
                  @input="generatePassword"
                />

                <div class="flex flex-wrap gap-3 text-xs">
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      v-model="genIncludeUpper"
                      type="checkbox"
                      class="rounded accent-white"
                      @change="generatePassword"
                    />
                    <span>A-Z</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      v-model="genIncludeLower"
                      type="checkbox"
                      class="rounded accent-white"
                      @change="generatePassword"
                    />
                    <span>a-z</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      v-model="genIncludeNumbers"
                      type="checkbox"
                      class="rounded accent-white"
                      @change="generatePassword"
                    />
                    <span>0-9</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      v-model="genIncludeSymbols"
                      type="checkbox"
                      class="rounded accent-white"
                      @change="generatePassword"
                    />
                    <span>Symbols (!@#$)</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- TOTP Secret Input -->
            <div class="space-y-1.5">
              <label class="block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                TOTP Authenticator Key
                <span class="text-xs font-normal lowercase text-zinc-500">(2FA Base32)</span>
              </label>
              <div class="relative flex items-center">
                <Clock class="pointer-events-none absolute left-3.5 h-4 w-4 text-zinc-500" />
                <input
                  v-model="form.totp"
                  :type="showTotpSecret ? 'text' : 'password'"
                  placeholder="JBSWY3DPEHPK3PXP"
                  class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 pl-10 pr-10 py-2.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none transition-colors uppercase"
                />
                <button
                  type="button"
                  class="absolute right-3 text-zinc-500 hover:text-zinc-100 cursor-pointer"
                  @click="showTotpSecret = !showTotpSecret"
                >
                  <EyeOff v-if="showTotpSecret" class="h-4 w-4" />
                  <Eye v-else class="h-4 w-4" />
                </button>
              </div>
            </div>

            <!-- Website URLs -->
            <div class="space-y-2">
              <label class="block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Website URLs
              </label>
              <div class="space-y-2">
                <div v-for="(uri, idx) in form.uris" :key="idx" class="flex items-center gap-2">
                  <div class="relative flex-1">
                    <Globe
                      class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"
                    />
                    <input
                      v-model="form.uris[idx]"
                      type="url"
                      placeholder="https://example.com/login"
                      class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 pl-10 pr-4 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    v-if="form.uris.length > 1"
                    type="button"
                    class="rounded-xl border border-zinc-800 p-2.5 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                    @click="removeUri(idx)"
                  >
                    <X class="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  class="text-xs font-medium text-zinc-400 hover:text-white hover:underline cursor-pointer"
                  @click="form.uris.push('')"
                >
                  + Add another URL
                </button>
              </div>
            </div>

            <!-- Secure Notes -->
            <div class="space-y-1.5">
              <label class="block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Notes
              </label>
              <textarea
                v-model="form.notes"
                rows="4"
                placeholder="Recovery codes, pin codes, security questions…"
                class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none transition-colors resize-y"
              />
            </div>

            <!-- Tags -->
            <div class="space-y-2">
              <label class="block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Tags
              </label>
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <Tag
                    class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"
                  />
                  <input
                    v-model="tagDraft"
                    type="text"
                    placeholder="Add tag (e.g. personal, banking, work) and press Enter…"
                    class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 pl-10 pr-4 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none transition-colors"
                    @keydown.enter.prevent="addTagFromDraft"
                    @keydown.comma.prevent="addTagFromDraft"
                  />
                </div>
                <button
                  type="button"
                  :disabled="!tagDraft.trim()"
                  class="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 transition-colors cursor-pointer"
                  @click="addTagFromDraft"
                >
                  Add
                </button>
              </div>

              <div v-if="form.tags.length" class="flex flex-wrap gap-2 pt-1">
                <span
                  v-for="tag in form.tags"
                  :key="tag"
                  class="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs font-semibold text-zinc-100"
                >
                  <span>#{{ tag }}</span>
                  <button
                    type="button"
                    class="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                    @click="removeTag(tag)"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            </div>

            <!-- Form Actions -->
            <div
              class="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 border-t border-zinc-800 pt-5"
            >
              <div class="flex items-center gap-2 w-full sm:w-auto">
                <button
                  v-if="!isNew"
                  type="button"
                  class="inline-flex h-9 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-zinc-800 px-4 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  @click="showDeleteConfirm = true"
                >
                  <Trash2 class="h-4 w-4" />
                  <span>Delete</span>
                </button>
              </div>

              <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  class="inline-flex h-9 flex-1 sm:flex-initial items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
                  @click="isNew ? router.push('/passwords') : (isEditing = false)"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  :disabled="isSaving"
                  class="inline-flex h-9 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-lg bg-white px-5 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  <Loader2 v-if="isSaving" class="h-4 w-4 animate-spin" />
                  <Check v-else class="h-4 w-4" />
                  <span>{{ isNew ? "Save Password" : "Save Changes" }}</span>
                </button>
              </div>
            </div>
          </form>

          <!-- Metadata Section -->
          <section
            v-if="!isNew && passwordItem"
            class="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5 sm:p-6 space-y-4"
          >
            <div
              class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500"
            >
              <ShieldCheck class="h-4 w-4 text-emerald-400" />
              <span>Encrypted Storage Details</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div class="space-y-1 rounded-xl bg-zinc-900/60 p-3.5 border border-zinc-800/60">
                <p class="text-zinc-500">Created</p>
                <p class="font-medium text-zinc-100">
                  {{ formatDate(passwordItem.createdAt) }}
                </p>
              </div>

              <div class="space-y-1 rounded-xl bg-zinc-900/60 p-3.5 border border-zinc-800/60">
                <p class="text-zinc-500">Last Updated</p>
                <p class="font-medium text-zinc-100">
                  {{ formatDate(passwordItem.updatedAt) }}
                </p>
              </div>

              <div
                v-if="passwordItem.eventId"
                class="sm:col-span-2 space-y-1.5 rounded-xl bg-zinc-900/60 p-3.5 border border-zinc-800/60"
              >
                <div class="flex items-center justify-between">
                  <p class="text-zinc-500">Event ID</p>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-white hover:underline cursor-pointer"
                      @click="copyValue(passwordItem.eventId, 'eventId')"
                    >
                      <Check v-if="copiedField === 'eventId'" class="h-3 w-3 text-emerald-400" />
                      <Copy v-else class="h-3 w-3" />
                      <span>{{ copiedField === "eventId" ? "Copied" : "Copy ID" }}</span>
                    </button>
                    <span class="text-zinc-500">·</span>
                    <a
                      :href="getNjumpUrl(passwordItem.eventId)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-zinc-100"
                    >
                      <ExternalLink class="h-3 w-3" />
                      <span>njump</span>
                    </a>
                  </div>
                </div>
                <p class="font-mono text-[11px] text-zinc-500 break-all">
                  {{ passwordItem.eventId }}
                </p>
              </div>
            </div>
          </section>
        </template>
      </div>
    </div>

    <!-- Confirm Delete Modal -->
    <AppConfirmDialog
      :open="showDeleteConfirm"
      title="Delete Password Entry?"
      message="This will publish an encrypted deletion tombstone to your relays. This action cannot be undone."
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />
  </main>
</template>
