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
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) pb-16 lg:h-full"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-6">
        <PageBackHeader
          back-to="/passwords"
          back-label="Passwords"
          :eyebrow="isNew ? 'New Credential' : 'Encrypted Password'"
          :title="isNew ? 'Add Password' : form.title || primaryHostname || 'Password Entry'"
        >
          <p class="text-sm leading-6 text-(--app-muted)">
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
          <Loader2 class="h-8 w-8 animate-spin text-(--app-primary)" />
          <p class="mt-3 text-sm text-(--app-muted)">Fetching encrypted password…</p>
        </div>

        <template v-else>
          <!-- View / Read Mode (when not in edit mode) -->
          <article
            v-if="!isEditing && passwordItem"
            class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-6 sm:p-8 shadow-sm space-y-6"
          >
            <!-- Top Controls -->
            <div
              class="flex flex-wrap items-center justify-between gap-3 border-b border-(--app-border) pb-4"
            >
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-(--app-primary) px-3.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-(--app-primary-strong) active:scale-95 cursor-pointer"
                  @click="isEditing = true"
                >
                  <Pencil class="h-3.5 w-3.5" />
                  <span>Edit Entry</span>
                </button>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/5 px-3 text-xs font-semibold text-red-400 hover:bg-red-500/15 transition-colors cursor-pointer"
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
              class="flex items-center justify-between rounded-2xl border border-(--app-primary)/30 bg-(--app-primary)/10 p-4 sm:p-5"
            >
              <div class="space-y-1">
                <p class="text-xs font-bold uppercase tracking-wider text-(--app-primary)">
                  2FA Verification Code
                </p>
                <div class="flex items-center gap-3">
                  <p class="font-mono text-3xl font-extrabold tracking-widest text-(--app-text)">
                    {{ totpCode.slice(0, 3) }} {{ totpCode.slice(3) }}
                  </p>
                  <span
                    class="rounded-full bg-(--app-primary)/20 px-2 py-0.5 text-xs font-bold font-mono text-(--app-primary)"
                  >
                    {{ totpRemain }}s
                  </span>
                </div>
              </div>

              <button
                type="button"
                class="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-(--app-primary) px-4 text-xs font-bold text-white shadow-sm hover:bg-(--app-primary-strong) transition-colors cursor-pointer"
                @click="copyValue(totpCode, 'totpCode')"
              >
                <Check v-if="copiedField === 'totpCode'" class="h-4 w-4 text-white" />
                <Copy v-else class="h-4 w-4" />
                <span>{{ copiedField === "totpCode" ? "Copied" : "Copy Code" }}</span>
              </button>
            </div>

            <!-- Credentials List -->
            <div class="space-y-4">
              <!-- Username -->
              <div
                v-if="form.username"
                class="flex items-center justify-between rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4"
              >
                <div class="min-w-0 flex-1 space-y-0.5">
                  <p class="text-xs font-semibold text-(--app-muted)">Username</p>
                  <p class="font-medium text-sm text-(--app-text) truncate">{{ form.username }}</p>
                </div>
                <button
                  type="button"
                  class="inline-flex h-8 items-center gap-1 rounded-xl border border-(--app-border) bg-(--app-surface) px-3 text-xs font-semibold text-(--app-text-soft) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors cursor-pointer"
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
                class="flex items-center justify-between rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4"
              >
                <div class="min-w-0 flex-1 space-y-0.5">
                  <p class="text-xs font-semibold text-(--app-muted)">Email</p>
                  <p class="font-medium text-sm text-(--app-text) truncate">{{ form.email }}</p>
                </div>
                <button
                  type="button"
                  class="inline-flex h-8 items-center gap-1 rounded-xl border border-(--app-border) bg-(--app-surface) px-3 text-xs font-semibold text-(--app-text-soft) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors cursor-pointer"
                  @click="copyValue(form.email, 'email')"
                >
                  <Check v-if="copiedField === 'email'" class="h-3.5 w-3.5 text-emerald-400" />
                  <Copy v-else class="h-3.5 w-3.5" />
                  <span>{{ copiedField === "email" ? "Copied" : "Copy" }}</span>
                </button>
              </div>

              <!-- Password -->
              <div
                class="flex items-center justify-between rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4"
              >
                <div class="min-w-0 flex-1 space-y-0.5">
                  <p class="text-xs font-semibold text-(--app-muted)">Password</p>
                  <p class="font-mono text-sm font-semibold text-(--app-text) truncate">
                    {{ showPassword ? form.password : "••••••••••••••••" }}
                  </p>
                </div>
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    class="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface) text-(--app-muted) hover:text-(--app-text) transition-colors cursor-pointer"
                    :title="showPassword ? 'Hide password' : 'Show password'"
                    @click="showPassword = !showPassword"
                  >
                    <EyeOff v-if="showPassword" class="h-4 w-4" />
                    <Eye v-else class="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1 rounded-xl border border-(--app-border) bg-(--app-surface) px-3 text-xs font-semibold text-(--app-text-soft) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors cursor-pointer"
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
                class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4 space-y-2"
              >
                <p class="text-xs font-semibold text-(--app-muted)">Websites</p>
                <div
                  v-for="(uri, idx) in form.uris.filter((u) => u && u.trim())"
                  :key="idx"
                  class="flex items-center justify-between gap-2"
                >
                  <span class="font-mono text-xs text-(--app-text) truncate">{{ uri }}</span>
                  <a
                    :href="uri"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-xs font-semibold text-(--app-primary) hover:underline"
                  >
                    <ExternalLink class="h-3.5 w-3.5" />
                    <span>Open</span>
                  </a>
                </div>
              </div>

              <!-- Notes -->
              <div
                v-if="form.notes"
                class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4 space-y-1.5"
              >
                <p class="text-xs font-semibold text-(--app-muted)">Secure Notes</p>
                <p class="text-sm text-(--app-text) whitespace-pre-wrap leading-relaxed">
                  {{ form.notes }}
                </p>
              </div>

              <!-- Tags -->
              <div v-if="form.tags.length" class="flex flex-wrap gap-1.5 pt-2">
                <span
                  v-for="tag in form.tags"
                  :key="tag"
                  class="rounded-md border border-(--app-border) bg-(--app-surface-soft) px-2.5 py-1 text-xs font-semibold text-(--app-text-soft)"
                >
                  #{{ tag }}
                </span>
              </div>
            </div>
          </article>

          <!-- Edit / Create Form Card -->
          <form
            v-else
            class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-5 sm:p-7 shadow-sm space-y-5"
            @submit.prevent="handleSave"
          >
            <!-- Title -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-(--app-text)">
                Title
              </label>
              <input
                v-model="form.title"
                type="text"
                placeholder="e.g. GitHub, Google, Work VPN"
                class="block w-full rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors font-semibold"
              />
            </div>

            <!-- Username & Email Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="block text-xs font-bold uppercase tracking-wider text-(--app-text)">
                  Username
                </label>
                <div class="relative">
                  <User
                    class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-(--app-muted)"
                  />
                  <input
                    v-model="form.username"
                    type="text"
                    placeholder="username"
                    class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) pl-10 pr-4 py-2.5 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-bold uppercase tracking-wider text-(--app-text)">
                  Email
                </label>
                <div class="relative">
                  <Mail
                    class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-(--app-muted)"
                  />
                  <input
                    v-model="form.email"
                    type="email"
                    placeholder="user@example.com"
                    class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) pl-10 pr-4 py-2.5 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            <!-- Password Field with Generator Toggle -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="block text-xs font-bold uppercase tracking-wider text-(--app-text)">
                  Password <span class="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 text-xs font-semibold text-(--app-primary) hover:underline cursor-pointer"
                  @click="showGenerator = !showGenerator"
                >
                  <Sparkles class="h-3.5 w-3.5" />
                  <span>{{ showGenerator ? "Hide generator" : "Generate strong password" }}</span>
                </button>
              </div>

              <div class="relative flex items-center">
                <KeyRound
                  class="pointer-events-none absolute left-3.5 h-4 w-4 text-(--app-muted)"
                />
                <input
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  required
                  placeholder="Master password or phrase"
                  class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) pl-10 pr-10 py-2.5 font-mono text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  class="absolute right-3 text-(--app-muted) hover:text-(--app-text) cursor-pointer"
                  @click="showPassword = !showPassword"
                >
                  <EyeOff v-if="showPassword" class="h-4 w-4" />
                  <Eye v-else class="h-4 w-4" />
                </button>
              </div>

              <!-- Password Generator Panel -->
              <div
                v-if="showGenerator"
                class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4 space-y-3"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold text-(--app-text)"
                    >Password Length: {{ genLength }}</span
                  >
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-xl bg-(--app-primary)/10 px-2.5 py-1 text-xs font-bold text-(--app-primary) hover:bg-(--app-primary)/20 transition-colors cursor-pointer"
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
                  class="w-full accent-(--app-primary) cursor-pointer"
                  @input="generatePassword"
                />

                <div class="flex flex-wrap gap-3 text-xs">
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      v-model="genIncludeUpper"
                      type="checkbox"
                      class="rounded accent-(--app-primary)"
                      @change="generatePassword"
                    />
                    <span>A-Z</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      v-model="genIncludeLower"
                      type="checkbox"
                      class="rounded accent-(--app-primary)"
                      @change="generatePassword"
                    />
                    <span>a-z</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      v-model="genIncludeNumbers"
                      type="checkbox"
                      class="rounded accent-(--app-primary)"
                      @change="generatePassword"
                    />
                    <span>0-9</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      v-model="genIncludeSymbols"
                      type="checkbox"
                      class="rounded accent-(--app-primary)"
                      @change="generatePassword"
                    />
                    <span>Symbols (!@#$)</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- TOTP Secret Input -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-(--app-text)">
                TOTP Authenticator Key
                <span class="text-xs font-normal lowercase text-(--app-muted)">(2FA Base32)</span>
              </label>
              <div class="relative flex items-center">
                <Clock class="pointer-events-none absolute left-3.5 h-4 w-4 text-(--app-muted)" />
                <input
                  v-model="form.totp"
                  :type="showTotpSecret ? 'text' : 'password'"
                  placeholder="JBSWY3DPEHPK3PXP"
                  class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) pl-10 pr-10 py-2.5 font-mono text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors uppercase"
                />
                <button
                  type="button"
                  class="absolute right-3 text-(--app-muted) hover:text-(--app-text) cursor-pointer"
                  @click="showTotpSecret = !showTotpSecret"
                >
                  <EyeOff v-if="showTotpSecret" class="h-4 w-4" />
                  <Eye v-else class="h-4 w-4" />
                </button>
              </div>
            </div>

            <!-- Website URLs -->
            <div class="space-y-2">
              <label class="block text-xs font-bold uppercase tracking-wider text-(--app-text)">
                Website URLs
              </label>
              <div class="space-y-2">
                <div v-for="(uri, idx) in form.uris" :key="idx" class="flex items-center gap-2">
                  <div class="relative flex-1">
                    <Globe
                      class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-(--app-muted)"
                    />
                    <input
                      v-model="form.uris[idx]"
                      type="url"
                      placeholder="https://example.com/login"
                      class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) pl-10 pr-4 py-2.5 text-xs text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    v-if="form.uris.length > 1"
                    type="button"
                    class="rounded-xl border border-(--app-border) p-2.5 text-(--app-muted) hover:text-rose-400 transition-colors cursor-pointer"
                    @click="removeUri(idx)"
                  >
                    <X class="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  class="text-xs font-semibold text-(--app-primary) hover:underline cursor-pointer"
                  @click="form.uris.push('')"
                >
                  + Add another URL
                </button>
              </div>
            </div>

            <!-- Secure Notes -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-(--app-text)">
                Notes
              </label>
              <textarea
                v-model="form.notes"
                rows="4"
                placeholder="Recovery codes, pin codes, security questions…"
                class="block w-full rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-3.5 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors resize-y"
              />
            </div>

            <!-- Tags -->
            <div class="space-y-2">
              <label class="block text-xs font-bold uppercase tracking-wider text-(--app-text)">
                Tags
              </label>
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <Tag
                    class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-(--app-muted)"
                  />
                  <input
                    v-model="tagDraft"
                    type="text"
                    placeholder="Add tag (e.g. personal, banking, work) and press Enter…"
                    class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) pl-10 pr-4 py-2 text-xs text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors"
                    @keydown.enter.prevent="addTagFromDraft"
                    @keydown.comma.prevent="addTagFromDraft"
                  />
                </div>
                <button
                  type="button"
                  :disabled="!tagDraft.trim()"
                  class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2 text-xs font-semibold text-(--app-text) hover:bg-(--app-surface-hover) disabled:opacity-40 transition-colors cursor-pointer"
                  @click="addTagFromDraft"
                >
                  Add
                </button>
              </div>

              <div v-if="form.tags.length" class="flex flex-wrap gap-2 pt-1">
                <span
                  v-for="tag in form.tags"
                  :key="tag"
                  class="inline-flex items-center gap-1.5 rounded-full border border-(--app-border) bg-(--app-surface-soft) px-3 py-1 text-xs font-semibold text-(--app-text)"
                >
                  <span>#{{ tag }}</span>
                  <button
                    type="button"
                    class="text-(--app-muted) hover:text-rose-400 transition-colors cursor-pointer"
                    @click="removeTag(tag)"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            </div>

            <!-- Form Actions -->
            <div
              class="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 border-t border-(--app-border) pt-5"
            >
              <div class="flex items-center gap-2 w-full sm:w-auto">
                <button
                  v-if="!isNew"
                  type="button"
                  class="inline-flex h-10 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  @click="showDeleteConfirm = true"
                >
                  <Trash2 class="h-4 w-4" />
                  <span>Delete</span>
                </button>
              </div>

              <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  class="inline-flex h-10 flex-1 sm:flex-initial items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 text-xs font-semibold text-(--app-text-soft) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors cursor-pointer"
                  @click="isNew ? router.push('/passwords') : (isEditing = false)"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  :disabled="isSaving"
                  class="inline-flex h-10 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl bg-(--app-primary) px-6 text-xs font-bold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) disabled:opacity-50 cursor-pointer active:scale-95"
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
            class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-5 sm:p-6 space-y-4"
          >
            <div
              class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-(--app-muted)"
            >
              <ShieldCheck class="h-4 w-4 text-emerald-400" />
              <span>Encrypted Storage Details</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div
                class="space-y-1 rounded-2xl bg-(--app-surface-soft) p-3.5 border border-(--app-border)/60"
              >
                <p class="text-(--app-muted)">Created</p>
                <p class="font-medium text-(--app-text)">
                  {{ formatDate(passwordItem.createdAt) }}
                </p>
              </div>

              <div
                class="space-y-1 rounded-2xl bg-(--app-surface-soft) p-3.5 border border-(--app-border)/60"
              >
                <p class="text-(--app-muted)">Last Updated</p>
                <p class="font-medium text-(--app-text)">
                  {{ formatDate(passwordItem.updatedAt) }}
                </p>
              </div>

              <div
                v-if="passwordItem.eventId"
                class="sm:col-span-2 space-y-1.5 rounded-2xl bg-(--app-surface-soft) p-3.5 border border-(--app-border)/60"
              >
                <div class="flex items-center justify-between">
                  <p class="text-(--app-muted)">Event ID</p>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-[11px] font-semibold text-(--app-primary) hover:underline cursor-pointer"
                      @click="copyValue(passwordItem.eventId, 'eventId')"
                    >
                      <Check v-if="copiedField === 'eventId'" class="h-3 w-3 text-emerald-400" />
                      <Copy v-else class="h-3 w-3" />
                      <span>{{ copiedField === "eventId" ? "Copied" : "Copy ID" }}</span>
                    </button>
                    <span class="text-(--app-muted)">·</span>
                    <a
                      :href="getNjumpUrl(passwordItem.eventId)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 text-[11px] font-semibold text-(--app-muted) hover:text-(--app-text)"
                    >
                      <ExternalLink class="h-3 w-3" />
                      <span>njump</span>
                    </a>
                  </div>
                </div>
                <p class="font-mono text-[11px] text-(--app-muted) break-all">
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
