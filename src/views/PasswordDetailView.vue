<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  KeyRound,
  Trash2,
  LoaderCircle,
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
import PageHeader from "@/components/PageHeader.vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
import RelayEventLink from "@/components/RelayEventLink.vue";
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
let totpSecretTimer = null;

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
    clearTimeout(totpSecretTimer);
    totpSecretTimer = null;
    if (!secret?.trim()) {
      stopTotpTimer();
      return;
    }
    // Wait for a pause in typing before generating codes and starting a timer.
    totpSecretTimer = setTimeout(() => {
      totpSecretTimer = null;
      startTotpTimer(secret);
    }, 300);
  },
);

onUnmounted(() => {
  clearTimeout(totpSecretTimer);
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
  <main class="password-detail-view__main">
    <div class="password-detail-view__block">
      <div class="password-detail-view__block-2">
        <PageHeader
          :eyebrow="isNew ? 'New Credential' : 'Encrypted Password'"
          :title="isNew ? 'Add Password' : form.title || primaryHostname || 'Password Entry'"
        >
          <p class="password-detail-view__text">
            {{
              isNew
                ? "Store logins, TOTP 2FA keys, and secure credentials encrypted with Argon2id."
                : "All secrets, passwords, and TOTP keys remain strictly inside encrypted ciphertext."
            }}
          </p>
        </PageHeader>

        <AppAlertBanner v-if="error" :message="error" />

        <!-- Loading State -->
        <div
          v-if="isLoading"
          class="password-detail-view__status"
          role="status"
        >
          <span class="password-detail-view__text-2">Fetching encrypted password…</span>

          <!-- Top controls -->
          <div
            class="password-detail-view__block-3"
          >
            <AppSkeleton class="password-detail-view__app-skeleton" />
            <AppSkeleton class="password-detail-view__app-skeleton-2" />
          </div>

          <!-- 2FA banner -->
          <div
            class="password-detail-view__block-4"
          >
            <div class="password-detail-view__block-5">
              <AppSkeleton class="password-detail-view__app-skeleton-3" />
              <AppSkeleton class="password-detail-view__app-skeleton-4" />
            </div>
            <AppSkeleton class="password-detail-view__app-skeleton-5" />
          </div>

          <!-- Credentials -->
          <div class="password-detail-view__block-6">
            <div
              v-for="n in 3"
              :key="n"
              class="password-detail-view__block-7"
            >
              <div class="password-detail-view__block-8">
                <AppSkeleton class="password-detail-view__app-skeleton-6" />
                <AppSkeleton class="password-detail-view__app-skeleton-7" />
              </div>
              <AppSkeleton class="password-detail-view__app-skeleton-8" />
            </div>

            <div class="password-detail-view__block-9">
              <AppSkeleton class="password-detail-view__app-skeleton-9" />
              <AppSkeleton class="password-detail-view__app-skeleton-10" />
              <AppSkeleton class="password-detail-view__app-skeleton-11" />
            </div>

            <div class="password-detail-view__block-10">
              <AppSkeleton v-for="n in 2" :key="n" class="password-detail-view__app-skeleton-12" />
            </div>
          </div>
        </div>

        <template v-else>
          <!-- View / Read Mode (when not in edit mode) -->
          <article
            v-if="!isEditing && passwordItem"
            class="password-detail-view__article"
          >
            <!-- Top Controls -->
            <div
              class="password-detail-view__block-11"
            >
              <div class="password-detail-view__block-12">
                <button
                  type="button"
                  class="password-detail-view__button"
                  @click="isEditing = true"
                >
                  <Pencil class="password-detail-view__pencil" />
                  <span>Edit Entry</span>
                </button>
              </div>

              <div class="password-detail-view__block-13">
                <button
                  type="button"
                  class="password-detail-view__button-2"
                  @click="showDeleteConfirm = true"
                >
                  <Trash2 class="password-detail-view__trash2" />
                  <span>Delete</span>
                </button>
              </div>
            </div>

            <!-- TOTP 2FA Banner if present -->
            <div
              v-if="totpCode"
              class="password-detail-view__block-14"
            >
              <div class="password-detail-view__block-15">
                <p class="password-detail-view__text-2fa-verification">
                  2FA Verification Code
                </p>
                <div class="password-detail-view__block-16">
                  <p class="password-detail-view__text-3">
                    {{ totpCode.slice(0, 3) }} {{ totpCode.slice(3) }}
                  </p>
                  <span
                    class="password-detail-view__text-s"
                  >
                    {{ totpRemain }}s
                  </span>
                </div>
              </div>

              <button
                type="button"
                class="password-detail-view__button-3"
                @click="copyValue(totpCode, 'totpCode')"
              >
                <Check v-if="copiedField === 'totpCode'" class="password-detail-view__check" />
                <Copy v-else class="password-detail-view__copy" />
                <span>{{ copiedField === "totpCode" ? "Copied" : "Copy Code" }}</span>
              </button>
            </div>

            <!-- Credentials List -->
            <div class="password-detail-view__block-17">
              <!-- Username -->
              <div
                v-if="form.username"
                class="password-detail-view__block-18"
              >
                <div class="password-detail-view__block-19">
                  <p class="password-detail-view__text-username">
                    Username
                  </p>
                  <p class="password-detail-view__text-4">{{ form.username }}</p>
                </div>
                <button
                  type="button"
                  class="password-detail-view__button-4"
                  @click="copyValue(form.username, 'username')"
                >
                  <Check v-if="copiedField === 'username'" class="password-detail-view__check-2" />
                  <Copy v-else class="password-detail-view__copy-2" />
                  <span>{{ copiedField === "username" ? "Copied" : "Copy" }}</span>
                </button>
              </div>

              <!-- Email -->
              <div
                v-if="form.email"
                class="password-detail-view__block-20"
              >
                <div class="password-detail-view__block-21">
                  <p class="password-detail-view__text-email">
                    Email
                  </p>
                  <p class="password-detail-view__text-5">{{ form.email }}</p>
                </div>
                <button
                  type="button"
                  class="password-detail-view__button-5"
                  @click="copyValue(form.email, 'email')"
                >
                  <Check v-if="copiedField === 'email'" class="password-detail-view__check-3" />
                  <Copy v-else class="password-detail-view__copy-3" />
                  <span>{{ copiedField === "email" ? "Copied" : "Copy" }}</span>
                </button>
              </div>

              <!-- Password -->
              <div
                class="password-detail-view__block-22"
              >
                <div class="password-detail-view__block-23">
                  <p class="password-detail-view__text-password">
                    Password
                  </p>
                  <p class="password-detail-view__text-6">
                    {{ showPassword ? form.password : "••••••••••••••••" }}
                  </p>
                </div>
                <div class="password-detail-view__block-24">
                  <button
                    type="button"
                    class="password-detail-view__button-6"
                    :title="showPassword ? 'Hide password' : 'Show password'"
                    @click="showPassword = !showPassword"
                  >
                    <EyeOff v-if="showPassword" class="password-detail-view__eye-off" />
                    <Eye v-else class="password-detail-view__eye" />
                  </button>
                  <button
                    type="button"
                    class="password-detail-view__button-7"
                    @click="copyValue(form.password, 'password')"
                  >
                    <Check v-if="copiedField === 'password'" class="password-detail-view__check-4" />
                    <Copy v-else class="password-detail-view__copy-4" />
                    <span>{{ copiedField === "password" ? "Copied" : "Copy" }}</span>
                  </button>
                </div>
              </div>

              <!-- Websites / URLs -->
              <div
                v-if="form.uris.filter((u) => u && u.trim()).length"
                class="password-detail-view__block-25"
              >
                <p class="password-detail-view__text-websites">
                  Websites
                </p>
                <div
                  v-for="(uri, idx) in form.uris.filter((u) => u && u.trim())"
                  :key="idx"
                  class="password-detail-view__block-26"
                >
                  <span class="password-detail-view__text-7">{{ uri }}</span>
                  <a
                    :href="uri"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="password-detail-view__link"
                  >
                    <ExternalLink class="password-detail-view__external-link" />
                    <span>Open</span>
                  </a>
                </div>
              </div>

              <!-- Notes -->
              <div
                v-if="form.notes"
                class="password-detail-view__block-27"
              >
                <p class="password-detail-view__text-secure-notes">
                  Secure Notes
                </p>
                <p class="password-detail-view__text-8">
                  {{ form.notes }}
                </p>
              </div>

              <!-- Tags -->
              <div v-if="form.tags.length" class="password-detail-view__block-28">
                <span
                  v-for="tag in form.tags"
                  :key="tag"
                  class="password-detail-view__text-9"
                >
                  #{{ tag }}
                </span>
              </div>
            </div>
          </article>

          <!-- Edit / Create Form Card -->
          <form
            v-else
            class="password-detail-view__form"
            @submit.prevent="handleSave"
          >
            <!-- Title -->
            <div class="password-detail-view__block-29">
              <label class="password-detail-view__label-title">
                Title
              </label>
              <input
                v-model="form.title"
                type="text"
                placeholder="e.g. GitHub, Google, Work VPN"
                class="password-detail-view__field-text"
              />
            </div>

            <!-- Username & Email Grid -->
            <div class="password-detail-view__block-30">
              <div class="password-detail-view__block-31">
                <label class="password-detail-view__label-username">
                  Username
                </label>
                <div class="password-detail-view__block-32">
                  <User
                    class="password-detail-view__user"
                  />
                  <input
                    v-model="form.username"
                    type="text"
                    placeholder="username"
                    class="password-detail-view__field-text-2"
                  />
                </div>
              </div>

              <div class="password-detail-view__block-33">
                <label class="password-detail-view__label-email">
                  Email
                </label>
                <div class="password-detail-view__block-34">
                  <Mail
                    class="password-detail-view__mail"
                  />
                  <input
                    v-model="form.email"
                    type="email"
                    placeholder="user@example.com"
                    class="password-detail-view__field-email"
                  />
                </div>
              </div>
            </div>

            <!-- Password Field with Generator Toggle -->
            <div class="password-detail-view__block-35">
              <div class="password-detail-view__block-36">
                <label class="password-detail-view__label-password">
                  Password <span class="password-detail-view__text-10">*</span>
                </label>
                <button
                  type="button"
                  class="password-detail-view__button-8"
                  @click="showGenerator = !showGenerator"
                >
                  <Sparkles class="password-detail-view__sparkles" />
                  <span>{{ showGenerator ? "Hide generator" : "Generate strong password" }}</span>
                </button>
              </div>

              <div class="password-detail-view__block-37">
                <KeyRound class="password-detail-view__key-round" />
                <input
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  required
                  placeholder="Master password or phrase"
                  class="password-detail-view__field-master-password"
                />
                <button
                  type="button"
                  class="password-detail-view__button-9"
                  @click="showPassword = !showPassword"
                >
                  <EyeOff v-if="showPassword" class="password-detail-view__eye-off-2" />
                  <Eye v-else class="password-detail-view__eye-2" />
                </button>
              </div>

              <!-- Password Generator Panel -->
              <div
                v-if="showGenerator"
                class="password-detail-view__block-38"
              >
                <div class="password-detail-view__block-39">
                  <span class="password-detail-view__text-password-length"
                    >Password Length: {{ genLength }}</span
                  >
                  <button
                    type="button"
                    class="password-detail-view__button-10"
                    @click="generatePassword"
                  >
                    <RefreshCw class="password-detail-view__refresh-cw" />
                    <span>Regenerate</span>
                  </button>
                </div>

                <input
                  v-model.number="genLength"
                  type="range"
                  min="8"
                  max="64"
                  class="password-detail-view__field-range"
                  @input="generatePassword"
                />

                <div class="password-detail-view__block-40">
                  <label class="password-detail-view__label">
                    <input
                      v-model="genIncludeUpper"
                      type="checkbox"
                      class="password-detail-view__field-checkbox"
                      @change="generatePassword"
                    />
                    <span>A-Z</span>
                  </label>
                  <label class="password-detail-view__label-2">
                    <input
                      v-model="genIncludeLower"
                      type="checkbox"
                      class="password-detail-view__field-checkbox-2"
                      @change="generatePassword"
                    />
                    <span>a-z</span>
                  </label>
                  <label class="password-detail-view__label-3">
                    <input
                      v-model="genIncludeNumbers"
                      type="checkbox"
                      class="password-detail-view__field-checkbox-3"
                      @change="generatePassword"
                    />
                    <span>0-9</span>
                  </label>
                  <label class="password-detail-view__label-4">
                    <input
                      v-model="genIncludeSymbols"
                      type="checkbox"
                      class="password-detail-view__field-checkbox-4"
                      @change="generatePassword"
                    />
                    <span>Symbols (!@#$)</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- TOTP Secret Input -->
            <div class="password-detail-view__block-41">
              <label class="password-detail-view__label-totp-authenticator">
                TOTP Authenticator Key
                <span class="password-detail-view__text-11">(2FA Base32)</span>
              </label>
              <div class="password-detail-view__block-42">
                <Clock class="password-detail-view__clock" />
                <input
                  v-model="form.totp"
                  :type="showTotpSecret ? 'text' : 'password'"
                  placeholder="JBSWY3DPEHPK3PXP"
                  class="password-detail-view__field-jbswy3dpehpk3pxp"
                />
                <button
                  type="button"
                  class="password-detail-view__button-11"
                  @click="showTotpSecret = !showTotpSecret"
                >
                  <EyeOff v-if="showTotpSecret" class="password-detail-view__eye-off-3" />
                  <Eye v-else class="password-detail-view__eye-3" />
                </button>
              </div>
            </div>

            <!-- Website URLs -->
            <div class="password-detail-view__block-43">
              <label class="password-detail-view__label-website-urls">
                Website URLs
              </label>
              <div class="password-detail-view__block-44">
                <div v-for="(uri, idx) in form.uris" :key="idx" class="password-detail-view__block-45">
                  <div class="password-detail-view__block-46">
                    <Globe
                      class="password-detail-view__globe"
                    />
                    <input
                      v-model="form.uris[idx]"
                      type="url"
                      placeholder="https://example.com/login"
                      class="password-detail-view__field-url"
                    />
                  </div>
                  <button
                    v-if="form.uris.length > 1"
                    type="button"
                    class="password-detail-view__button-12"
                    @click="removeUri(idx)"
                  >
                    <X class="password-detail-view__x" />
                  </button>
                </div>
                <button
                  type="button"
                  class="password-detail-view__button-13"
                  @click="form.uris.push('')"
                >
                  + Add another URL
                </button>
              </div>
            </div>

            <!-- Secure Notes -->
            <div class="password-detail-view__block-47">
              <label class="password-detail-view__label-notes">
                Notes
              </label>
              <textarea
                v-model="form.notes"
                rows="4"
                placeholder="Recovery codes, pin codes, security questions…"
                class="password-detail-view__field-recovery-codes"
              />
            </div>

            <!-- Tags -->
            <div class="password-detail-view__block-48">
              <label class="password-detail-view__label-tags">
                Tags
              </label>
              <div class="password-detail-view__block-49">
                <div class="password-detail-view__block-50">
                  <Tag
                    class="password-detail-view__tag"
                  />
                  <input
                    v-model="tagDraft"
                    type="text"
                    placeholder="Add tag (e.g. personal, banking, work) and press Enter…"
                    class="password-detail-view__field-text-3"
                    @keydown.enter.prevent="addTagFromDraft"
                    @keydown.comma.prevent="addTagFromDraft"
                  />
                </div>
                <button
                  type="button"
                  :disabled="!tagDraft.trim()"
                  class="password-detail-view__button-add"
                  @click="addTagFromDraft"
                >
                  Add
                </button>
              </div>

              <div v-if="form.tags.length" class="password-detail-view__block-51">
                <span
                  v-for="tag in form.tags"
                  :key="tag"
                  class="password-detail-view__text-12"
                >
                  <span>#{{ tag }}</span>
                  <button
                    type="button"
                    class="password-detail-view__button-14"
                    @click="removeTag(tag)"
                  >
                    <X class="password-detail-view__x-2" />
                  </button>
                </span>
              </div>
            </div>

            <!-- Form Actions -->
            <div
              class="password-detail-view__block-52"
            >
              <div class="password-detail-view__block-53">
                <button
                  v-if="!isNew"
                  type="button"
                  class="password-detail-view__button-15"
                  @click="showDeleteConfirm = true"
                >
                  <Trash2 class="password-detail-view__trash2-2" />
                  <span>Delete</span>
                </button>
              </div>

              <div class="password-detail-view__block-54">
                <button
                  type="button"
                  class="password-detail-view__button-cancel"
                  @click="isNew ? router.push('/passwords') : (isEditing = false)"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  :disabled="isSaving"
                  class="password-detail-view__button-16"
                >
                  <LoaderCircle v-if="isSaving" class="password-detail-view__loader-circle" />
                  <Check v-else class="password-detail-view__check-5" />
                  <span>{{ isNew ? "Save Password" : "Save Changes" }}</span>
                </button>
              </div>
            </div>
          </form>

          <!-- Metadata Section -->
          <section
            v-if="!isNew && passwordItem"
            class="password-detail-view__section"
          >
            <div
              class="password-detail-view__block-55"
            >
              <ShieldCheck class="password-detail-view__shield-check" />
              <span>Encrypted Storage Details</span>
            </div>

            <div class="password-detail-view__block-56">
              <div class="password-detail-view__block-57">
                <p class="password-detail-view__text-created">Created</p>
                <p class="password-detail-view__text-13">
                  {{ formatDate(passwordItem.createdAt) }}
                </p>
              </div>

              <div class="password-detail-view__block-58">
                <p class="password-detail-view__text-last-updated">Last Updated</p>
                <p class="password-detail-view__text-14">
                  {{ formatDate(passwordItem.updatedAt) }}
                </p>
              </div>

              <div
                v-if="passwordItem.eventId"
                class="password-detail-view__block-59"
              >
                <div class="password-detail-view__block-60">
                  <p class="password-detail-view__text-event-id">Event ID</p>
                  <div class="password-detail-view__block-61">
                    <button
                      type="button"
                      class="password-detail-view__button-17"
                      @click="copyValue(passwordItem.eventId, 'eventId')"
                    >
                      <Check v-if="copiedField === 'eventId'" class="password-detail-view__check-6" />
                      <Copy v-else class="password-detail-view__copy-5" />
                      <span>{{ copiedField === "eventId" ? "Copied" : "Copy ID" }}</span>
                    </button>
                    <span class="password-detail-view__text-15">·</span>
                    <RelayEventLink :event-id="passwordItem.eventId" />
                  </div>
                </div>
                <p class="password-detail-view__text-16">
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

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {


































































@media (hover:hover) {
.password-detail-view__button-2:hover {
  border-color: #fb2c364d;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__button-2:hover {
  border-color: color-mix(in oklab,var(--color-red-500) 30%,transparent);
}
}
}

@media (hover:hover) {
.password-detail-view__button-2:hover {
  background-color: var(--app-danger-soft);
}
}

@media (hover:hover) {
.password-detail-view__button-15:hover {
  background-color: var(--app-danger-soft);
}
}

@media (hover:hover) {

}

@media (hover:hover) {

}

@media (hover:hover) {
.password-detail-view__button:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.password-detail-view__button-3:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.password-detail-view__button-16:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.password-detail-view__button-10:hover {
  background-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.password-detail-view__button-4:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.password-detail-view__button-5:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.password-detail-view__button-7:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.password-detail-view__button-add:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.password-detail-view__button-cancel:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.password-detail-view__button-12:hover {
  color: var(--color-rose-400);
}
}

@media (hover:hover) {
.password-detail-view__button-14:hover {
  color: var(--color-rose-400);
}
}

@media (hover:hover) {
.password-detail-view__link:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.password-detail-view__button-8:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.password-detail-view__button-13:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.password-detail-view__button-17:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.password-detail-view__button-4:hover {
  color: var(--ui-zinc-100);
}
}

@media (hover:hover) {
.password-detail-view__button-5:hover {
  color: var(--ui-zinc-100);
}
}

@media (hover:hover) {
.password-detail-view__button-6:hover {
  color: var(--ui-zinc-100);
}
}

@media (hover:hover) {
.password-detail-view__button-7:hover {
  color: var(--ui-zinc-100);
}
}

@media (hover:hover) {
.password-detail-view__button-9:hover {
  color: var(--ui-zinc-100);
}
}

@media (hover:hover) {
.password-detail-view__button-11:hover {
  color: var(--ui-zinc-100);
}
}

@media (hover:hover) {
.password-detail-view__button-cancel:hover {
  color: var(--ui-zinc-100);
}
}

@media (hover:hover) {
.password-detail-view__link:hover {
  text-decoration-line: underline;
}
}

@media (hover:hover) {
.password-detail-view__button-8:hover {
  text-decoration-line: underline;
}
}

@media (hover:hover) {
.password-detail-view__button-13:hover {
  text-decoration-line: underline;
}
}

@media (hover:hover) {
.password-detail-view__button-17:hover {
  text-decoration-line: underline;
}
}

@media (min-width:40rem) {
.password-detail-view__block-59 {
  grid-column: span 2/span 2;
}
}

@media (min-width:40rem) {
.password-detail-view__block-53 {
  width: auto;
}
}

@media (min-width:40rem) {
.password-detail-view__block-54 {
  width: auto;
}
}

@media (min-width:40rem) {
.password-detail-view__button-15 {
  flex: 0 auto;
}
}

@media (min-width:40rem) {
.password-detail-view__button-cancel {
  flex: 0 auto;
}
}

@media (min-width:40rem) {
.password-detail-view__button-16 {
  flex: 0 auto;
}
}

@media (min-width:40rem) {
.password-detail-view__block-30 {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
}

@media (min-width:40rem) {
.password-detail-view__block-56 {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
}

@media (min-width:40rem) {
.password-detail-view__block-52 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.password-detail-view__block-4 {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.password-detail-view__block-14 {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.password-detail-view__section {
  padding: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.password-detail-view__form {
  padding: calc(var(--spacing) * 7);
}
}

@media (min-width:40rem) {
.password-detail-view__status {
  padding: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.password-detail-view__article {
  padding: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.password-detail-view__block {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.password-detail-view__main {
  height: 100%;
}
}

@media (min-width:64rem) {
.password-detail-view__block {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.password-detail-view__user {
  pointer-events: none;
}
.password-detail-view__mail {
  pointer-events: none;
}
.password-detail-view__key-round {
  pointer-events: none;
}
.password-detail-view__clock {
  pointer-events: none;
}
.password-detail-view__globe {
  pointer-events: none;
}
.password-detail-view__tag {
  pointer-events: none;
}
.password-detail-view__text-2 {
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
.password-detail-view__user {
  position: absolute;
}
.password-detail-view__mail {
  position: absolute;
}
.password-detail-view__key-round {
  position: absolute;
}
.password-detail-view__button-9 {
  position: absolute;
}
.password-detail-view__clock {
  position: absolute;
}
.password-detail-view__button-11 {
  position: absolute;
}
.password-detail-view__globe {
  position: absolute;
}
.password-detail-view__tag {
  position: absolute;
}
.password-detail-view__block-32 {
  position: relative;
}
.password-detail-view__block-34 {
  position: relative;
}
.password-detail-view__block-37 {
  position: relative;
}
.password-detail-view__block-42 {
  position: relative;
}
.password-detail-view__block-46 {
  position: relative;
}
.password-detail-view__block-50 {
  position: relative;
}
.password-detail-view__user {
  top: 50%;
}
.password-detail-view__mail {
  top: 50%;
}
.password-detail-view__globe {
  top: 50%;
}
.password-detail-view__tag {
  top: 50%;
}
.password-detail-view__button-9 {
  right: calc(var(--spacing) * 3);
}
.password-detail-view__button-11 {
  right: calc(var(--spacing) * 3);
}
.password-detail-view__user {
  left: calc(var(--spacing) * 3.5);
}
.password-detail-view__mail {
  left: calc(var(--spacing) * 3.5);
}
.password-detail-view__key-round {
  left: calc(var(--spacing) * 3.5);
}
.password-detail-view__clock {
  left: calc(var(--spacing) * 3.5);
}
.password-detail-view__globe {
  left: calc(var(--spacing) * 3.5);
}
.password-detail-view__tag {
  left: calc(var(--spacing) * 3.5);
}
.password-detail-view__block {
  margin-inline: auto;
}
.password-detail-view__label-title {
  display: block;
}
.password-detail-view__field-text {
  display: block;
}
.password-detail-view__label-username {
  display: block;
}
.password-detail-view__field-text-2 {
  display: block;
}
.password-detail-view__label-email {
  display: block;
}
.password-detail-view__field-email {
  display: block;
}
.password-detail-view__label-password {
  display: block;
}
.password-detail-view__field-master-password {
  display: block;
}
.password-detail-view__label-totp-authenticator {
  display: block;
}
.password-detail-view__field-jbswy3dpehpk3pxp {
  display: block;
}
.password-detail-view__label-website-urls {
  display: block;
}
.password-detail-view__field-url {
  display: block;
}
.password-detail-view__label-notes {
  display: block;
}
.password-detail-view__field-recovery-codes {
  display: block;
}
.password-detail-view__label-tags {
  display: block;
}
.password-detail-view__field-text-3 {
  display: block;
}
.password-detail-view__block-3 {
  display: flex;
}
.password-detail-view__block-4 {
  display: flex;
}
.password-detail-view__block-7 {
  display: flex;
}
.password-detail-view__block-10 {
  display: flex;
}
.password-detail-view__block-11 {
  display: flex;
}
.password-detail-view__block-12 {
  display: flex;
}
.password-detail-view__block-13 {
  display: flex;
}
.password-detail-view__block-14 {
  display: flex;
}
.password-detail-view__block-16 {
  display: flex;
}
.password-detail-view__block-18 {
  display: flex;
}
.password-detail-view__block-20 {
  display: flex;
}
.password-detail-view__block-22 {
  display: flex;
}
.password-detail-view__block-24 {
  display: flex;
}
.password-detail-view__block-26 {
  display: flex;
}
.password-detail-view__block-28 {
  display: flex;
}
.password-detail-view__block-36 {
  display: flex;
}
.password-detail-view__block-37 {
  display: flex;
}
.password-detail-view__block-39 {
  display: flex;
}
.password-detail-view__block-40 {
  display: flex;
}
.password-detail-view__label {
  display: flex;
}
.password-detail-view__label-2 {
  display: flex;
}
.password-detail-view__label-3 {
  display: flex;
}
.password-detail-view__label-4 {
  display: flex;
}
.password-detail-view__block-42 {
  display: flex;
}
.password-detail-view__block-45 {
  display: flex;
}
.password-detail-view__block-49 {
  display: flex;
}
.password-detail-view__block-51 {
  display: flex;
}
.password-detail-view__block-52 {
  display: flex;
}
.password-detail-view__block-53 {
  display: flex;
}
.password-detail-view__block-54 {
  display: flex;
}
.password-detail-view__block-55 {
  display: flex;
}
.password-detail-view__block-60 {
  display: flex;
}
.password-detail-view__block-61 {
  display: flex;
}
.password-detail-view__block-30 {
  display: grid;
}
.password-detail-view__block-56 {
  display: grid;
}
.password-detail-view__button {
  display: inline-flex;
}
.password-detail-view__button-2 {
  display: inline-flex;
}
.password-detail-view__button-3 {
  display: inline-flex;
}
.password-detail-view__button-4 {
  display: inline-flex;
}
.password-detail-view__button-5 {
  display: inline-flex;
}
.password-detail-view__button-6 {
  display: inline-flex;
}
.password-detail-view__button-7 {
  display: inline-flex;
}
.password-detail-view__link {
  display: inline-flex;
}
.password-detail-view__button-8 {
  display: inline-flex;
}
.password-detail-view__button-10 {
  display: inline-flex;
}
.password-detail-view__text-12 {
  display: inline-flex;
}
.password-detail-view__button-15 {
  display: inline-flex;
}
.password-detail-view__button-cancel {
  display: inline-flex;
}
.password-detail-view__button-16 {
  display: inline-flex;
}
.password-detail-view__button-17 {
  display: inline-flex;
}
.password-detail-view__app-skeleton-3 {
  height: calc(var(--spacing) * 2.5);
}
.password-detail-view__app-skeleton-6 {
  height: calc(var(--spacing) * 2.5);
}
.password-detail-view__app-skeleton-9 {
  height: calc(var(--spacing) * 2.5);
}
.password-detail-view__app-skeleton-10 {
  height: calc(var(--spacing) * 3);
}
.password-detail-view__app-skeleton-11 {
  height: calc(var(--spacing) * 3);
}
.password-detail-view__refresh-cw {
  height: calc(var(--spacing) * 3);
}
.password-detail-view__check-6 {
  height: calc(var(--spacing) * 3);
}
.password-detail-view__copy-5 {
  height: calc(var(--spacing) * 3);
}
.password-detail-view__app-skeleton-7 {
  height: calc(var(--spacing) * 3.5);
}
.password-detail-view__pencil {
  height: calc(var(--spacing) * 3.5);
}
.password-detail-view__trash2 {
  height: calc(var(--spacing) * 3.5);
}
.password-detail-view__check-2 {
  height: calc(var(--spacing) * 3.5);
}
.password-detail-view__copy-2 {
  height: calc(var(--spacing) * 3.5);
}
.password-detail-view__check-3 {
  height: calc(var(--spacing) * 3.5);
}
.password-detail-view__copy-3 {
  height: calc(var(--spacing) * 3.5);
}
.password-detail-view__check-4 {
  height: calc(var(--spacing) * 3.5);
}
.password-detail-view__copy-4 {
  height: calc(var(--spacing) * 3.5);
}
.password-detail-view__external-link {
  height: calc(var(--spacing) * 3.5);
}
.password-detail-view__sparkles {
  height: calc(var(--spacing) * 3.5);
}
.password-detail-view__x-2 {
  height: calc(var(--spacing) * 3.5);
}
.password-detail-view__check {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__copy {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__eye-off {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__eye {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__user {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__mail {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__key-round {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__eye-off-2 {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__eye-2 {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__clock {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__eye-off-3 {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__eye-3 {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__globe {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__x {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__tag {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__trash2-2 {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__loader-circle {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__check-5 {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__shield-check {
  height: calc(var(--spacing) * 4);
}
.password-detail-view__app-skeleton-12 {
  height: calc(var(--spacing) * 6);
}
.password-detail-view__app-skeleton-4 {
  height: calc(var(--spacing) * 8);
}
.password-detail-view__app-skeleton-8 {
  height: calc(var(--spacing) * 8);
}
.password-detail-view__button-4 {
  height: calc(var(--spacing) * 8);
}
.password-detail-view__button-5 {
  height: calc(var(--spacing) * 8);
}
.password-detail-view__button-6 {
  height: calc(var(--spacing) * 8);
}
.password-detail-view__button-7 {
  height: calc(var(--spacing) * 8);
}
.password-detail-view__app-skeleton {
  height: calc(var(--spacing) * 9);
}
.password-detail-view__app-skeleton-2 {
  height: calc(var(--spacing) * 9);
}
.password-detail-view__app-skeleton-5 {
  height: calc(var(--spacing) * 9);
}
.password-detail-view__button {
  height: calc(var(--spacing) * 9);
}
.password-detail-view__button-2 {
  height: calc(var(--spacing) * 9);
}
.password-detail-view__button-3 {
  height: calc(var(--spacing) * 9);
}
.password-detail-view__button-15 {
  height: calc(var(--spacing) * 9);
}
.password-detail-view__button-cancel {
  height: calc(var(--spacing) * 9);
}
.password-detail-view__button-16 {
  height: calc(var(--spacing) * 9);
}
.password-detail-view__main {
  min-height: 100dvh;
}
.password-detail-view__refresh-cw {
  width: calc(var(--spacing) * 3);
}
.password-detail-view__check-6 {
  width: calc(var(--spacing) * 3);
}
.password-detail-view__copy-5 {
  width: calc(var(--spacing) * 3);
}
.password-detail-view__pencil {
  width: calc(var(--spacing) * 3.5);
}
.password-detail-view__trash2 {
  width: calc(var(--spacing) * 3.5);
}
.password-detail-view__check-2 {
  width: calc(var(--spacing) * 3.5);
}
.password-detail-view__copy-2 {
  width: calc(var(--spacing) * 3.5);
}
.password-detail-view__check-3 {
  width: calc(var(--spacing) * 3.5);
}
.password-detail-view__copy-3 {
  width: calc(var(--spacing) * 3.5);
}
.password-detail-view__check-4 {
  width: calc(var(--spacing) * 3.5);
}
.password-detail-view__copy-4 {
  width: calc(var(--spacing) * 3.5);
}
.password-detail-view__external-link {
  width: calc(var(--spacing) * 3.5);
}
.password-detail-view__sparkles {
  width: calc(var(--spacing) * 3.5);
}
.password-detail-view__x-2 {
  width: calc(var(--spacing) * 3.5);
}
.password-detail-view__check {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__copy {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__eye-off {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__eye {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__user {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__mail {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__key-round {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__eye-off-2 {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__eye-2 {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__clock {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__eye-off-3 {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__eye-3 {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__globe {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__x {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__tag {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__trash2-2 {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__loader-circle {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__check-5 {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__shield-check {
  width: calc(var(--spacing) * 4);
}
.password-detail-view__app-skeleton-11 {
  width: 80%;
}
.password-detail-view__button-6 {
  width: calc(var(--spacing) * 8);
}
.password-detail-view__app-skeleton-6 {
  width: calc(var(--spacing) * 16);
}
.password-detail-view__app-skeleton-8 {
  width: calc(var(--spacing) * 16);
}
.password-detail-view__app-skeleton-12 {
  width: calc(var(--spacing) * 16);
}
.password-detail-view__app-skeleton-2 {
  width: calc(var(--spacing) * 20);
}
.password-detail-view__app-skeleton {
  width: calc(var(--spacing) * 24);
}
.password-detail-view__app-skeleton-5 {
  width: calc(var(--spacing) * 24);
}
.password-detail-view__app-skeleton-9 {
  width: calc(var(--spacing) * 24);
}
.password-detail-view__app-skeleton-3 {
  width: calc(var(--spacing) * 28);
}
.password-detail-view__app-skeleton-4 {
  width: calc(var(--spacing) * 36);
}
.password-detail-view__app-skeleton-7 {
  width: calc(var(--spacing) * 40);
}
.password-detail-view__block {
  width: 100%;
}
.password-detail-view__app-skeleton-10 {
  width: 100%;
}
.password-detail-view__field-text {
  width: 100%;
}
.password-detail-view__field-text-2 {
  width: 100%;
}
.password-detail-view__field-email {
  width: 100%;
}
.password-detail-view__field-master-password {
  width: 100%;
}
.password-detail-view__field-range {
  width: 100%;
}
.password-detail-view__field-jbswy3dpehpk3pxp {
  width: 100%;
}
.password-detail-view__field-url {
  width: 100%;
}
.password-detail-view__field-recovery-codes {
  width: 100%;
}
.password-detail-view__field-text-3 {
  width: 100%;
}
.password-detail-view__block-53 {
  width: 100%;
}
.password-detail-view__block-54 {
  width: 100%;
}
.password-detail-view__block {
  max-width: var(--container-6xl);
}
.password-detail-view__app-skeleton-7 {
  max-width: 100%;
}
.password-detail-view__block-8 {
  min-width: 0;
}
.password-detail-view__block-19 {
  min-width: 0;
}
.password-detail-view__block-21 {
  min-width: 0;
}
.password-detail-view__block-23 {
  min-width: 0;
}
.password-detail-view__block-8 {
  flex: 1;
}
.password-detail-view__block-19 {
  flex: 1;
}
.password-detail-view__block-21 {
  flex: 1;
}
.password-detail-view__block-23 {
  flex: 1;
}
.password-detail-view__block-46 {
  flex: 1;
}
.password-detail-view__block-50 {
  flex: 1;
}
.password-detail-view__button-15 {
  flex: 1;
}
.password-detail-view__button-cancel {
  flex: 1;
}
.password-detail-view__button-16 {
  flex: 1;
}
.password-detail-view__app-skeleton-8 {
  flex-shrink: 0;
}
.password-detail-view__user {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.password-detail-view__mail {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.password-detail-view__globe {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.password-detail-view__tag {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.password-detail-view__loader-circle {
  animation: var(--animate-spin);
}
.password-detail-view__button {
  cursor: pointer;
}
.password-detail-view__button-2 {
  cursor: pointer;
}
.password-detail-view__button-3 {
  cursor: pointer;
}
.password-detail-view__button-4 {
  cursor: pointer;
}
.password-detail-view__button-5 {
  cursor: pointer;
}
.password-detail-view__button-6 {
  cursor: pointer;
}
.password-detail-view__button-7 {
  cursor: pointer;
}
.password-detail-view__button-8 {
  cursor: pointer;
}
.password-detail-view__button-9 {
  cursor: pointer;
}
.password-detail-view__button-10 {
  cursor: pointer;
}
.password-detail-view__field-range {
  cursor: pointer;
}
.password-detail-view__label {
  cursor: pointer;
}
.password-detail-view__label-2 {
  cursor: pointer;
}
.password-detail-view__label-3 {
  cursor: pointer;
}
.password-detail-view__label-4 {
  cursor: pointer;
}
.password-detail-view__button-11 {
  cursor: pointer;
}
.password-detail-view__button-12 {
  cursor: pointer;
}
.password-detail-view__button-13 {
  cursor: pointer;
}
.password-detail-view__button-add {
  cursor: pointer;
}
.password-detail-view__button-14 {
  cursor: pointer;
}
.password-detail-view__button-15 {
  cursor: pointer;
}
.password-detail-view__button-cancel {
  cursor: pointer;
}
.password-detail-view__button-16 {
  cursor: pointer;
}
.password-detail-view__button-17 {
  cursor: pointer;
}
.password-detail-view__field-recovery-codes {
  resize: vertical;
}
.password-detail-view__block-30 {
  grid-template-columns: repeat(1,minmax(0,1fr));
}
.password-detail-view__block-56 {
  grid-template-columns: repeat(1,minmax(0,1fr));
}
.password-detail-view__block-52 {
  flex-direction: column-reverse;
}
.password-detail-view__block-3 {
  flex-wrap: wrap;
}
.password-detail-view__block-10 {
  flex-wrap: wrap;
}
.password-detail-view__block-11 {
  flex-wrap: wrap;
}
.password-detail-view__block-28 {
  flex-wrap: wrap;
}
.password-detail-view__block-40 {
  flex-wrap: wrap;
}
.password-detail-view__block-51 {
  flex-wrap: wrap;
}
.password-detail-view__block-3 {
  align-items: center;
}
.password-detail-view__block-4 {
  align-items: center;
}
.password-detail-view__block-7 {
  align-items: center;
}
.password-detail-view__block-11 {
  align-items: center;
}
.password-detail-view__block-12 {
  align-items: center;
}
.password-detail-view__button {
  align-items: center;
}
.password-detail-view__block-13 {
  align-items: center;
}
.password-detail-view__button-2 {
  align-items: center;
}
.password-detail-view__block-14 {
  align-items: center;
}
.password-detail-view__block-16 {
  align-items: center;
}
.password-detail-view__button-3 {
  align-items: center;
}
.password-detail-view__block-18 {
  align-items: center;
}
.password-detail-view__button-4 {
  align-items: center;
}
.password-detail-view__block-20 {
  align-items: center;
}
.password-detail-view__button-5 {
  align-items: center;
}
.password-detail-view__block-22 {
  align-items: center;
}
.password-detail-view__block-24 {
  align-items: center;
}
.password-detail-view__button-6 {
  align-items: center;
}
.password-detail-view__button-7 {
  align-items: center;
}
.password-detail-view__block-26 {
  align-items: center;
}
.password-detail-view__link {
  align-items: center;
}
.password-detail-view__block-36 {
  align-items: center;
}
.password-detail-view__button-8 {
  align-items: center;
}
.password-detail-view__block-37 {
  align-items: center;
}
.password-detail-view__block-39 {
  align-items: center;
}
.password-detail-view__button-10 {
  align-items: center;
}
.password-detail-view__label {
  align-items: center;
}
.password-detail-view__label-2 {
  align-items: center;
}
.password-detail-view__label-3 {
  align-items: center;
}
.password-detail-view__label-4 {
  align-items: center;
}
.password-detail-view__block-42 {
  align-items: center;
}
.password-detail-view__block-45 {
  align-items: center;
}
.password-detail-view__text-12 {
  align-items: center;
}
.password-detail-view__block-52 {
  align-items: center;
}
.password-detail-view__block-53 {
  align-items: center;
}
.password-detail-view__button-15 {
  align-items: center;
}
.password-detail-view__block-54 {
  align-items: center;
}
.password-detail-view__button-cancel {
  align-items: center;
}
.password-detail-view__button-16 {
  align-items: center;
}
.password-detail-view__block-55 {
  align-items: center;
}
.password-detail-view__block-60 {
  align-items: center;
}
.password-detail-view__block-61 {
  align-items: center;
}
.password-detail-view__button-17 {
  align-items: center;
}
.password-detail-view__block-3 {
  justify-content: space-between;
}
.password-detail-view__block-4 {
  justify-content: space-between;
}
.password-detail-view__block-7 {
  justify-content: space-between;
}
.password-detail-view__block-11 {
  justify-content: space-between;
}
.password-detail-view__block-14 {
  justify-content: space-between;
}
.password-detail-view__block-18 {
  justify-content: space-between;
}
.password-detail-view__block-20 {
  justify-content: space-between;
}
.password-detail-view__block-22 {
  justify-content: space-between;
}
.password-detail-view__block-26 {
  justify-content: space-between;
}
.password-detail-view__block-36 {
  justify-content: space-between;
}
.password-detail-view__block-39 {
  justify-content: space-between;
}
.password-detail-view__block-52 {
  justify-content: space-between;
}
.password-detail-view__block-60 {
  justify-content: space-between;
}
.password-detail-view__button-6 {
  justify-content: center;
}
.password-detail-view__button-15 {
  justify-content: center;
}
.password-detail-view__button-cancel {
  justify-content: center;
}
.password-detail-view__button-16 {
  justify-content: center;
}
.password-detail-view__block-54 {
  justify-content: flex-end;
}
.password-detail-view__button-4 {
  gap: var(--spacing);
}
.password-detail-view__button-5 {
  gap: var(--spacing);
}
.password-detail-view__button-7 {
  gap: var(--spacing);
}
.password-detail-view__link {
  gap: var(--spacing);
}
.password-detail-view__button-8 {
  gap: var(--spacing);
}
.password-detail-view__button-10 {
  gap: var(--spacing);
}
.password-detail-view__button-17 {
  gap: var(--spacing);
}
.password-detail-view__block-10 {
  gap: calc(var(--spacing) * 1.5);
}
.password-detail-view__button {
  gap: calc(var(--spacing) * 1.5);
}
.password-detail-view__button-2 {
  gap: calc(var(--spacing) * 1.5);
}
.password-detail-view__button-3 {
  gap: calc(var(--spacing) * 1.5);
}
.password-detail-view__block-24 {
  gap: calc(var(--spacing) * 1.5);
}
.password-detail-view__block-28 {
  gap: calc(var(--spacing) * 1.5);
}
.password-detail-view__label {
  gap: calc(var(--spacing) * 1.5);
}
.password-detail-view__label-2 {
  gap: calc(var(--spacing) * 1.5);
}
.password-detail-view__label-3 {
  gap: calc(var(--spacing) * 1.5);
}
.password-detail-view__label-4 {
  gap: calc(var(--spacing) * 1.5);
}
.password-detail-view__text-12 {
  gap: calc(var(--spacing) * 1.5);
}
.password-detail-view__button-15 {
  gap: calc(var(--spacing) * 1.5);
}
.password-detail-view__block-12 {
  gap: calc(var(--spacing) * 2);
}
.password-detail-view__block-13 {
  gap: calc(var(--spacing) * 2);
}
.password-detail-view__block-26 {
  gap: calc(var(--spacing) * 2);
}
.password-detail-view__block-45 {
  gap: calc(var(--spacing) * 2);
}
.password-detail-view__block-49 {
  gap: calc(var(--spacing) * 2);
}
.password-detail-view__block-51 {
  gap: calc(var(--spacing) * 2);
}
.password-detail-view__block-53 {
  gap: calc(var(--spacing) * 2);
}
.password-detail-view__block-54 {
  gap: calc(var(--spacing) * 2);
}
.password-detail-view__button-16 {
  gap: calc(var(--spacing) * 2);
}
.password-detail-view__block-55 {
  gap: calc(var(--spacing) * 2);
}
.password-detail-view__block-61 {
  gap: calc(var(--spacing) * 2);
}
.password-detail-view__block-3 {
  gap: calc(var(--spacing) * 3);
}
.password-detail-view__block-11 {
  gap: calc(var(--spacing) * 3);
}
.password-detail-view__block-16 {
  gap: calc(var(--spacing) * 3);
}
.password-detail-view__block-40 {
  gap: calc(var(--spacing) * 3);
}
.password-detail-view__block-52 {
  gap: calc(var(--spacing) * 3);
}
.password-detail-view__block-30 {
  gap: calc(var(--spacing) * 4);
}
.password-detail-view__block-56 {
  gap: calc(var(--spacing) * 4);
}
:where(.password-detail-view__block-19>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * .5) * 0);
  margin-block-end: calc(calc(var(--spacing) * .5) * calc(1 - 0));
}
:where(.password-detail-view__block-21>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * .5) * 0);
  margin-block-end: calc(calc(var(--spacing) * .5) * calc(1 - 0));
}
:where(.password-detail-view__block-23>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * .5) * 0);
  margin-block-end: calc(calc(var(--spacing) * .5) * calc(1 - 0));
}
:where(.password-detail-view__block-15>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.password-detail-view__block-57>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.password-detail-view__block-58>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.password-detail-view__block-27>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.password-detail-view__block-29>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.password-detail-view__block-31>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.password-detail-view__block-33>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.password-detail-view__block-41>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.password-detail-view__block-47>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.password-detail-view__block-59>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.password-detail-view__block-5>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.password-detail-view__block-8>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.password-detail-view__block-9>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.password-detail-view__block-25>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.password-detail-view__block-35>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.password-detail-view__block-43>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.password-detail-view__block-44>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.password-detail-view__block-48>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.password-detail-view__block-38>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.password-detail-view__block-6>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.password-detail-view__block-17>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.password-detail-view__section>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.password-detail-view__form>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.password-detail-view__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
:where(.password-detail-view__block-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
:where(.password-detail-view__status>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
:where(.password-detail-view__article>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
.password-detail-view__text-4 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.password-detail-view__text-5 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.password-detail-view__text-6 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.password-detail-view__text-7 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.password-detail-view__main {
  overflow-x: hidden;
}
.password-detail-view__main {
  overflow-y: auto;
}
.password-detail-view__field-checkbox {
  border-radius: .25rem;
}
.password-detail-view__field-checkbox-2 {
  border-radius: .25rem;
}
.password-detail-view__field-checkbox-3 {
  border-radius: .25rem;
}
.password-detail-view__field-checkbox-4 {
  border-radius: .25rem;
}
.password-detail-view__text-s {
  border-radius: 3.40282e38px;
}
.password-detail-view__text-12 {
  border-radius: 3.40282e38px;
}
.password-detail-view__app-skeleton {
  border-radius: var(--radius-lg);
}
.password-detail-view__app-skeleton-5 {
  border-radius: var(--radius-lg);
}
.password-detail-view__button {
  border-radius: var(--radius-lg);
}
.password-detail-view__button-3 {
  border-radius: var(--radius-lg);
}
.password-detail-view__button-10 {
  border-radius: var(--radius-lg);
}
.password-detail-view__button-16 {
  border-radius: var(--radius-lg);
}
.password-detail-view__app-skeleton-12 {
  border-radius: var(--radius-md);
}
.password-detail-view__text-9 {
  border-radius: var(--radius-md);
}
.password-detail-view__status {
  border-radius: var(--radius-xl);
}
.password-detail-view__app-skeleton-2 {
  border-radius: var(--radius-xl);
}
.password-detail-view__block-4 {
  border-radius: var(--radius-xl);
}
.password-detail-view__block-7 {
  border-radius: var(--radius-xl);
}
.password-detail-view__app-skeleton-8 {
  border-radius: var(--radius-xl);
}
.password-detail-view__block-9 {
  border-radius: var(--radius-xl);
}
.password-detail-view__article {
  border-radius: var(--radius-xl);
}
.password-detail-view__button-2 {
  border-radius: var(--radius-xl);
}
.password-detail-view__block-14 {
  border-radius: var(--radius-xl);
}
.password-detail-view__block-18 {
  border-radius: var(--radius-xl);
}
.password-detail-view__button-4 {
  border-radius: var(--radius-xl);
}
.password-detail-view__block-20 {
  border-radius: var(--radius-xl);
}
.password-detail-view__button-5 {
  border-radius: var(--radius-xl);
}
.password-detail-view__block-22 {
  border-radius: var(--radius-xl);
}
.password-detail-view__button-6 {
  border-radius: var(--radius-xl);
}
.password-detail-view__button-7 {
  border-radius: var(--radius-xl);
}
.password-detail-view__block-25 {
  border-radius: var(--radius-xl);
}
.password-detail-view__block-27 {
  border-radius: var(--radius-xl);
}
.password-detail-view__form {
  border-radius: var(--radius-xl);
}
.password-detail-view__field-text {
  border-radius: var(--radius-xl);
}
.password-detail-view__field-text-2 {
  border-radius: var(--radius-xl);
}
.password-detail-view__field-email {
  border-radius: var(--radius-xl);
}
.password-detail-view__field-master-password {
  border-radius: var(--radius-xl);
}
.password-detail-view__block-38 {
  border-radius: var(--radius-xl);
}
.password-detail-view__field-jbswy3dpehpk3pxp {
  border-radius: var(--radius-xl);
}
.password-detail-view__field-url {
  border-radius: var(--radius-xl);
}
.password-detail-view__button-12 {
  border-radius: var(--radius-xl);
}
.password-detail-view__field-recovery-codes {
  border-radius: var(--radius-xl);
}
.password-detail-view__field-text-3 {
  border-radius: var(--radius-xl);
}
.password-detail-view__button-add {
  border-radius: var(--radius-xl);
}
.password-detail-view__button-15 {
  border-radius: var(--radius-xl);
}
.password-detail-view__button-cancel {
  border-radius: var(--radius-xl);
}
.password-detail-view__section {
  border-radius: var(--radius-xl);
}
.password-detail-view__block-57 {
  border-radius: var(--radius-xl);
}
.password-detail-view__block-58 {
  border-radius: var(--radius-xl);
}
.password-detail-view__block-59 {
  border-radius: var(--radius-xl);
}
.password-detail-view__status {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__block-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__block-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__block-9 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__article {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__button-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__block-14 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__block-18 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__button-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__block-20 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__button-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__block-22 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__button-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__button-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__block-25 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__block-27 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__text-9 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__form {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__field-text {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__field-text-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__field-email {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__field-master-password {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__block-38 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__field-jbswy3dpehpk3pxp {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__field-url {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__button-12 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__field-recovery-codes {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__field-text-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__button-add {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__text-12 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__button-15 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__button-cancel {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__section {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__block-57 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__block-58 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__block-59 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.password-detail-view__block-52 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.password-detail-view__block-3 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.password-detail-view__block-11 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.password-detail-view__block-14 {
  border-color: var(--ui-zinc-700);
}
.password-detail-view__status {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-3 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-4 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-7 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-9 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__article {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-11 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__button-2 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-18 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__button-4 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-20 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__button-5 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-22 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__button-6 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__button-7 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-25 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-27 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__text-9 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__form {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__field-text {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__field-text-2 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__field-email {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__field-master-password {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-38 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__field-jbswy3dpehpk3pxp {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__field-url {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__button-12 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__field-recovery-codes {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__field-text-3 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__button-add {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__text-12 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-52 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__button-15 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__button-cancel {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__section {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-57 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-58 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__block-59 {
  border-color: var(--ui-zinc-800);
}
.password-detail-view__main {
  background-color: var(--ui-black);
}
.password-detail-view__button {
  background-color: var(--color-white);
}
.password-detail-view__button-3 {
  background-color: var(--color-white);
}
.password-detail-view__button-16 {
  background-color: var(--color-white);
}
.password-detail-view__text-s {
  background-color: var(--ui-zinc-800);
}
.password-detail-view__button-10 {
  background-color: var(--ui-zinc-800);
}
.password-detail-view__block-14 {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__block-18 {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__block-20 {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__block-22 {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__block-25 {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__block-27 {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__text-9 {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__field-text {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__field-text-2 {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__field-email {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__field-master-password {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__block-38 {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__field-jbswy3dpehpk3pxp {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__field-url {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__field-recovery-codes {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__field-text-3 {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__button-add {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__text-12 {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__button-cancel {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__block-57 {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__block-58 {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__block-59 {
  background-color: var(--ui-zinc-900);
}
.password-detail-view__status {
  background-color: var(--ui-zinc-950);
}
.password-detail-view__article {
  background-color: var(--ui-zinc-950);
}
.password-detail-view__button-4 {
  background-color: var(--ui-zinc-950);
}
.password-detail-view__button-5 {
  background-color: var(--ui-zinc-950);
}
.password-detail-view__button-6 {
  background-color: var(--ui-zinc-950);
}
.password-detail-view__button-7 {
  background-color: var(--ui-zinc-950);
}
.password-detail-view__form {
  background-color: var(--ui-zinc-950);
}
.password-detail-view__section {
  background-color: var(--ui-zinc-950);
}
.password-detail-view__button-12 {
  padding: calc(var(--spacing) * 2.5);
}
.password-detail-view__field-recovery-codes {
  padding: calc(var(--spacing) * 3.5);
}
.password-detail-view__block-57 {
  padding: calc(var(--spacing) * 3.5);
}
.password-detail-view__block-58 {
  padding: calc(var(--spacing) * 3.5);
}
.password-detail-view__block-59 {
  padding: calc(var(--spacing) * 3.5);
}
.password-detail-view__block-4 {
  padding: calc(var(--spacing) * 4);
}
.password-detail-view__block-7 {
  padding: calc(var(--spacing) * 4);
}
.password-detail-view__block-9 {
  padding: calc(var(--spacing) * 4);
}
.password-detail-view__block-14 {
  padding: calc(var(--spacing) * 4);
}
.password-detail-view__block-18 {
  padding: calc(var(--spacing) * 4);
}
.password-detail-view__block-20 {
  padding: calc(var(--spacing) * 4);
}
.password-detail-view__block-22 {
  padding: calc(var(--spacing) * 4);
}
.password-detail-view__block-25 {
  padding: calc(var(--spacing) * 4);
}
.password-detail-view__block-27 {
  padding: calc(var(--spacing) * 4);
}
.password-detail-view__block-38 {
  padding: calc(var(--spacing) * 4);
}
.password-detail-view__form {
  padding: calc(var(--spacing) * 5);
}
.password-detail-view__section {
  padding: calc(var(--spacing) * 5);
}
.password-detail-view__status {
  padding: calc(var(--spacing) * 6);
}
.password-detail-view__article {
  padding: calc(var(--spacing) * 6);
}
.password-detail-view__text-s {
  padding-inline: calc(var(--spacing) * 2);
}
.password-detail-view__text-9 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.password-detail-view__button-10 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.password-detail-view__button {
  padding-inline: calc(var(--spacing) * 3);
}
.password-detail-view__button-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.password-detail-view__button-4 {
  padding-inline: calc(var(--spacing) * 3);
}
.password-detail-view__button-5 {
  padding-inline: calc(var(--spacing) * 3);
}
.password-detail-view__button-7 {
  padding-inline: calc(var(--spacing) * 3);
}
.password-detail-view__button-add {
  padding-inline: calc(var(--spacing) * 3);
}
.password-detail-view__text-12 {
  padding-inline: calc(var(--spacing) * 3);
}
.password-detail-view__block {
  padding-inline: calc(var(--spacing) * 4);
}
.password-detail-view__button-3 {
  padding-inline: calc(var(--spacing) * 4);
}
.password-detail-view__field-text {
  padding-inline: calc(var(--spacing) * 4);
}
.password-detail-view__button-15 {
  padding-inline: calc(var(--spacing) * 4);
}
.password-detail-view__button-cancel {
  padding-inline: calc(var(--spacing) * 4);
}
.password-detail-view__button-16 {
  padding-inline: calc(var(--spacing) * 5);
}
.password-detail-view__text-s {
  padding-block: calc(var(--spacing) * .5);
}
.password-detail-view__text-9 {
  padding-block: var(--spacing);
}
.password-detail-view__button-10 {
  padding-block: var(--spacing);
}
.password-detail-view__text-12 {
  padding-block: var(--spacing);
}
.password-detail-view__field-text-3 {
  padding-block: calc(var(--spacing) * 2);
}
.password-detail-view__button-add {
  padding-block: calc(var(--spacing) * 2);
}
.password-detail-view__field-text-2 {
  padding-block: calc(var(--spacing) * 2.5);
}
.password-detail-view__field-email {
  padding-block: calc(var(--spacing) * 2.5);
}
.password-detail-view__field-master-password {
  padding-block: calc(var(--spacing) * 2.5);
}
.password-detail-view__field-jbswy3dpehpk3pxp {
  padding-block: calc(var(--spacing) * 2.5);
}
.password-detail-view__field-url {
  padding-block: calc(var(--spacing) * 2.5);
}
.password-detail-view__field-text {
  padding-block: calc(var(--spacing) * 3);
}
.password-detail-view__block {
  padding-block: calc(var(--spacing) * 6);
}
.password-detail-view__block-51 {
  padding-top: var(--spacing);
}
.password-detail-view__block-10 {
  padding-top: calc(var(--spacing) * 2);
}
.password-detail-view__block-28 {
  padding-top: calc(var(--spacing) * 2);
}
.password-detail-view__block-52 {
  padding-top: calc(var(--spacing) * 5);
}
.password-detail-view__field-text-2 {
  padding-right: calc(var(--spacing) * 4);
}
.password-detail-view__field-email {
  padding-right: calc(var(--spacing) * 4);
}
.password-detail-view__field-url {
  padding-right: calc(var(--spacing) * 4);
}
.password-detail-view__field-text-3 {
  padding-right: calc(var(--spacing) * 4);
}
.password-detail-view__field-master-password {
  padding-right: calc(var(--spacing) * 10);
}
.password-detail-view__field-jbswy3dpehpk3pxp {
  padding-right: calc(var(--spacing) * 10);
}
.password-detail-view__block-3 {
  padding-bottom: calc(var(--spacing) * 4);
}
.password-detail-view__block-11 {
  padding-bottom: calc(var(--spacing) * 4);
}
.password-detail-view__main {
  padding-bottom: calc(var(--spacing) * 16);
}
.password-detail-view__field-text-2 {
  padding-left: calc(var(--spacing) * 10);
}
.password-detail-view__field-email {
  padding-left: calc(var(--spacing) * 10);
}
.password-detail-view__field-master-password {
  padding-left: calc(var(--spacing) * 10);
}
.password-detail-view__field-jbswy3dpehpk3pxp {
  padding-left: calc(var(--spacing) * 10);
}
.password-detail-view__field-url {
  padding-left: calc(var(--spacing) * 10);
}
.password-detail-view__field-text-3 {
  padding-left: calc(var(--spacing) * 10);
}
.password-detail-view__text-3 {
  font-family: var(--font-mono);
}
.password-detail-view__text-s {
  font-family: var(--font-mono);
}
.password-detail-view__text-6 {
  font-family: var(--font-mono);
}
.password-detail-view__text-7 {
  font-family: var(--font-mono);
}
.password-detail-view__field-master-password {
  font-family: var(--font-mono);
}
.password-detail-view__field-jbswy3dpehpk3pxp {
  font-family: var(--font-mono);
}
.password-detail-view__text-16 {
  font-family: var(--font-mono);
}
.password-detail-view__text-3 {
  font-size: var(--text-3xl);
  line-height: var(--leading,var(--text-3xl--line-height));
}
.password-detail-view__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.password-detail-view__text-4 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.password-detail-view__text-5 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.password-detail-view__text-6 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.password-detail-view__text-8 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.password-detail-view__field-text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.password-detail-view__field-text-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.password-detail-view__field-email {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.password-detail-view__field-master-password {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.password-detail-view__field-jbswy3dpehpk3pxp {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.password-detail-view__field-recovery-codes {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.password-detail-view__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__button-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__text-s {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__button-3 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__button-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__button-5 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__button-7 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__text-7 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__link {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__text-9 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__button-8 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__text-password-length {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__button-10 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__block-40 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__text-11 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__field-url {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__button-13 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__field-text-3 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__button-add {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__text-12 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__button-15 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__button-cancel {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__button-16 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__block-55 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__block-56 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.password-detail-view__text-2fa-verification {
  font-size: 11px;
}
.password-detail-view__text-username {
  font-size: 11px;
}
.password-detail-view__text-email {
  font-size: 11px;
}
.password-detail-view__text-password {
  font-size: 11px;
}
.password-detail-view__text-websites {
  font-size: 11px;
}
.password-detail-view__text-secure-notes {
  font-size: 11px;
}
.password-detail-view__label-title {
  font-size: 11px;
}
.password-detail-view__label-username {
  font-size: 11px;
}
.password-detail-view__label-email {
  font-size: 11px;
}
.password-detail-view__label-password {
  font-size: 11px;
}
.password-detail-view__label-totp-authenticator {
  font-size: 11px;
}
.password-detail-view__label-website-urls {
  font-size: 11px;
}
.password-detail-view__label-notes {
  font-size: 11px;
}
.password-detail-view__label-tags {
  font-size: 11px;
}
.password-detail-view__button-17 {
  font-size: 11px;
}
.password-detail-view__text-16 {
  font-size: 11px;
}
.password-detail-view__text {
  --leading: calc(var(--spacing) * 6);
  line-height: calc(var(--spacing) * 6);
}
.password-detail-view__text-8 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.password-detail-view__text-3 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.password-detail-view__text-password-length {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.password-detail-view__block-55 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.password-detail-view__text-2fa-verification {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__text-s {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__text-username {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__text-4 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__text-email {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__text-5 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__text-password {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__text-websites {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__link {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__text-secure-notes {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__label-title {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__label-username {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__label-email {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__label-password {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__button-8 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__button-10 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__label-totp-authenticator {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__label-website-urls {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__button-13 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__label-notes {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__label-tags {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__text-13 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__text-14 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__button-17 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.password-detail-view__text-11 {
  --font-weight: var(--font-weight-normal);
  font-weight: var(--font-weight-normal);
}
.password-detail-view__button {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.password-detail-view__button-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.password-detail-view__button-3 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.password-detail-view__button-4 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.password-detail-view__button-5 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.password-detail-view__text-6 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.password-detail-view__button-7 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.password-detail-view__text-9 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.password-detail-view__field-text {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.password-detail-view__button-add {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.password-detail-view__text-12 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.password-detail-view__button-15 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.password-detail-view__button-cancel {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.password-detail-view__button-16 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.password-detail-view__text-2fa-verification {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__text-username {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__text-email {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__text-password {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__text-websites {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__text-secure-notes {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__label-title {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__label-username {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__label-email {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__label-password {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__label-totp-authenticator {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__label-website-urls {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__label-notes {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__label-tags {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__block-55 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.password-detail-view__text-3 {
  --tracking: var(--tracking-widest);
  letter-spacing: var(--tracking-widest);
}
.password-detail-view__text-16 {
  word-break: break-all;
}
.password-detail-view__text-8 {
  white-space: pre-wrap;
}
.password-detail-view__button {
  color: var(--ui-black);
}
.password-detail-view__button-3 {
  color: var(--ui-black);
}
.password-detail-view__button-16 {
  color: var(--ui-black);
}
.password-detail-view__check-2 {
  color: var(--color-emerald-400);
}
.password-detail-view__check-3 {
  color: var(--color-emerald-400);
}
.password-detail-view__check-4 {
  color: var(--color-emerald-400);
}
.password-detail-view__shield-check {
  color: var(--color-emerald-400);
}
.password-detail-view__check-6 {
  color: var(--color-emerald-400);
}
.password-detail-view__button-2 {
  color: var(--color-red-400);
}
.password-detail-view__button-15 {
  color: var(--color-red-400);
}
.password-detail-view__text-10 {
  color: var(--color-rose-500);
}
.password-detail-view__text-3 {
  color: var(--color-white);
}
.password-detail-view__main {
  color: var(--ui-zinc-100);
}
.password-detail-view__text-4 {
  color: var(--ui-zinc-100);
}
.password-detail-view__text-5 {
  color: var(--ui-zinc-100);
}
.password-detail-view__text-6 {
  color: var(--ui-zinc-100);
}
.password-detail-view__text-7 {
  color: var(--ui-zinc-100);
}
.password-detail-view__text-8 {
  color: var(--ui-zinc-100);
}
.password-detail-view__field-text {
  color: var(--ui-zinc-100);
}
.password-detail-view__field-text-2 {
  color: var(--ui-zinc-100);
}
.password-detail-view__field-email {
  color: var(--ui-zinc-100);
}
.password-detail-view__field-master-password {
  color: var(--ui-zinc-100);
}
.password-detail-view__text-password-length {
  color: var(--ui-zinc-100);
}
.password-detail-view__field-jbswy3dpehpk3pxp {
  color: var(--ui-zinc-100);
}
.password-detail-view__field-url {
  color: var(--ui-zinc-100);
}
.password-detail-view__field-recovery-codes {
  color: var(--ui-zinc-100);
}
.password-detail-view__field-text-3 {
  color: var(--ui-zinc-100);
}
.password-detail-view__button-add {
  color: var(--ui-zinc-100);
}
.password-detail-view__text-12 {
  color: var(--ui-zinc-100);
}
.password-detail-view__text-13 {
  color: var(--ui-zinc-100);
}
.password-detail-view__text-14 {
  color: var(--ui-zinc-100);
}
.password-detail-view__text-s {
  color: var(--ui-zinc-200);
}
.password-detail-view__button-10 {
  color: var(--ui-zinc-200);
}
.password-detail-view__button-4 {
  color: var(--ui-zinc-300);
}
.password-detail-view__button-5 {
  color: var(--ui-zinc-300);
}
.password-detail-view__button-7 {
  color: var(--ui-zinc-300);
}
.password-detail-view__link {
  color: var(--ui-zinc-300);
}
.password-detail-view__text-9 {
  color: var(--ui-zinc-300);
}
.password-detail-view__button-cancel {
  color: var(--ui-zinc-300);
}
.password-detail-view__button-8 {
  color: var(--ui-zinc-400);
}
.password-detail-view__button-13 {
  color: var(--ui-zinc-400);
}
.password-detail-view__button-17 {
  color: var(--ui-zinc-400);
}
.password-detail-view__text {
  color: var(--ui-zinc-500);
}
.password-detail-view__text-2fa-verification {
  color: var(--ui-zinc-500);
}
.password-detail-view__button-6 {
  color: var(--ui-zinc-500);
}
.password-detail-view__label-title {
  color: var(--ui-zinc-500);
}
.password-detail-view__label-username {
  color: var(--ui-zinc-500);
}
.password-detail-view__user {
  color: var(--ui-zinc-500);
}
.password-detail-view__label-email {
  color: var(--ui-zinc-500);
}
.password-detail-view__mail {
  color: var(--ui-zinc-500);
}
.password-detail-view__label-password {
  color: var(--ui-zinc-500);
}
.password-detail-view__key-round {
  color: var(--ui-zinc-500);
}
.password-detail-view__button-9 {
  color: var(--ui-zinc-500);
}
.password-detail-view__label-totp-authenticator {
  color: var(--ui-zinc-500);
}
.password-detail-view__text-11 {
  color: var(--ui-zinc-500);
}
.password-detail-view__clock {
  color: var(--ui-zinc-500);
}
.password-detail-view__button-11 {
  color: var(--ui-zinc-500);
}
.password-detail-view__label-website-urls {
  color: var(--ui-zinc-500);
}
.password-detail-view__globe {
  color: var(--ui-zinc-500);
}
.password-detail-view__button-12 {
  color: var(--ui-zinc-500);
}
.password-detail-view__label-notes {
  color: var(--ui-zinc-500);
}
.password-detail-view__label-tags {
  color: var(--ui-zinc-500);
}
.password-detail-view__tag {
  color: var(--ui-zinc-500);
}
.password-detail-view__button-14 {
  color: var(--ui-zinc-500);
}
.password-detail-view__block-55 {
  color: var(--ui-zinc-500);
}
.password-detail-view__text-created {
  color: var(--ui-zinc-500);
}
.password-detail-view__text-last-updated {
  color: var(--ui-zinc-500);
}
.password-detail-view__text-event-id {
  color: var(--ui-zinc-500);
}
.password-detail-view__text-15 {
  color: var(--ui-zinc-500);
}
.password-detail-view__text-16 {
  color: var(--ui-zinc-500);
}
.password-detail-view__text-username {
  color: var(--ui-zinc-600);
}
.password-detail-view__text-email {
  color: var(--ui-zinc-600);
}
.password-detail-view__text-password {
  color: var(--ui-zinc-600);
}
.password-detail-view__text-websites {
  color: var(--ui-zinc-600);
}
.password-detail-view__text-secure-notes {
  color: var(--ui-zinc-600);
}
.password-detail-view__text-11 {
  text-transform: lowercase;
}
.password-detail-view__text-2fa-verification {
  text-transform: uppercase;
}
.password-detail-view__text-username {
  text-transform: uppercase;
}
.password-detail-view__text-email {
  text-transform: uppercase;
}
.password-detail-view__text-password {
  text-transform: uppercase;
}
.password-detail-view__text-websites {
  text-transform: uppercase;
}
.password-detail-view__text-secure-notes {
  text-transform: uppercase;
}
.password-detail-view__label-title {
  text-transform: uppercase;
}
.password-detail-view__label-username {
  text-transform: uppercase;
}
.password-detail-view__label-email {
  text-transform: uppercase;
}
.password-detail-view__label-password {
  text-transform: uppercase;
}
.password-detail-view__label-totp-authenticator {
  text-transform: uppercase;
}
.password-detail-view__field-jbswy3dpehpk3pxp {
  text-transform: uppercase;
}
.password-detail-view__label-website-urls {
  text-transform: uppercase;
}
.password-detail-view__label-notes {
  text-transform: uppercase;
}
.password-detail-view__label-tags {
  text-transform: uppercase;
}
.password-detail-view__block-55 {
  text-transform: uppercase;
}
.password-detail-view__field-range {
  accent-color: var(--color-white);
}
.password-detail-view__field-checkbox {
  accent-color: var(--color-white);
}
.password-detail-view__field-checkbox-2 {
  accent-color: var(--color-white);
}
.password-detail-view__field-checkbox-3 {
  accent-color: var(--color-white);
}
.password-detail-view__field-checkbox-4 {
  accent-color: var(--color-white);
}
.password-detail-view__status {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.password-detail-view__article {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.password-detail-view__form {
  --shadow: 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 3px 0 var(--shadow-color,#0000001a), 0 1px 2px -1px var(--shadow-color,#0000001a);
}
.password-detail-view__button {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.password-detail-view__button-3 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.password-detail-view__button-16 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.password-detail-view__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__button-16 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__button-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__button-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__button-4 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__button-5 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__button-6 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__button-7 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__field-text {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__field-text-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__field-email {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__field-master-password {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__button-10 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__field-jbswy3dpehpk3pxp {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__field-url {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__button-12 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__field-recovery-codes {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__field-text-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__button-add {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__button-14 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__button-15 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__button-cancel {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.password-detail-view__field-text::placeholder {
  color: var(--ui-zinc-600);
}
.password-detail-view__field-text-2::placeholder {
  color: var(--ui-zinc-600);
}
.password-detail-view__field-email::placeholder {
  color: var(--ui-zinc-600);
}
.password-detail-view__field-master-password::placeholder {
  color: var(--ui-zinc-600);
}
.password-detail-view__field-jbswy3dpehpk3pxp::placeholder {
  color: var(--ui-zinc-600);
}
.password-detail-view__field-url::placeholder {
  color: var(--ui-zinc-600);
}
.password-detail-view__field-recovery-codes::placeholder {
  color: var(--ui-zinc-600);
}
.password-detail-view__field-text-3::placeholder {
  color: var(--ui-zinc-600);
}
.password-detail-view__field-text:focus {
  border-color: var(--ui-zinc-600);
}
.password-detail-view__field-text-2:focus {
  border-color: var(--ui-zinc-600);
}
.password-detail-view__field-email:focus {
  border-color: var(--ui-zinc-600);
}
.password-detail-view__field-master-password:focus {
  border-color: var(--ui-zinc-600);
}
.password-detail-view__field-jbswy3dpehpk3pxp:focus {
  border-color: var(--ui-zinc-600);
}
.password-detail-view__field-url:focus {
  border-color: var(--ui-zinc-600);
}
.password-detail-view__field-recovery-codes:focus {
  border-color: var(--ui-zinc-600);
}
.password-detail-view__field-text-3:focus {
  border-color: var(--ui-zinc-600);
}
.password-detail-view__field-text:focus {
  --outline-style: none;
  outline-style: none;
}
.password-detail-view__field-text-2:focus {
  --outline-style: none;
  outline-style: none;
}
.password-detail-view__field-email:focus {
  --outline-style: none;
  outline-style: none;
}
.password-detail-view__field-master-password:focus {
  --outline-style: none;
  outline-style: none;
}
.password-detail-view__field-jbswy3dpehpk3pxp:focus {
  --outline-style: none;
  outline-style: none;
}
.password-detail-view__field-url:focus {
  --outline-style: none;
  outline-style: none;
}
.password-detail-view__field-recovery-codes:focus {
  --outline-style: none;
  outline-style: none;
}
.password-detail-view__field-text-3:focus {
  --outline-style: none;
  outline-style: none;
}
.password-detail-view__button:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.password-detail-view__button-16:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.password-detail-view__button-add:disabled {
  opacity: .4;
}
.password-detail-view__button-16:disabled {
  opacity: .5;
}
[data-theme="light"] .password-detail-view__check-2 {
  color: var(--app-success);
}
[data-theme="light"] .password-detail-view__check-3 {
  color: var(--app-success);
}
[data-theme="light"] .password-detail-view__check-4 {
  color: var(--app-success);
}
[data-theme="light"] .password-detail-view__shield-check {
  color: var(--app-success);
}
[data-theme="light"] .password-detail-view__check-6 {
  color: var(--app-success);
}
[data-theme="light"] .password-detail-view__button-2 {
  color: var(--app-danger);
}
[data-theme="light"] .password-detail-view__button-15 {
  color: var(--app-danger);
}
[data-theme="light"] .password-detail-view__button-4 {
  color: var(--app-text-soft);
}
[data-theme="light"] .password-detail-view__button-5 {
  color: var(--app-text-soft);
}
[data-theme="light"] .password-detail-view__button-7 {
  color: var(--app-text-soft);
}
[data-theme="light"] .password-detail-view__link {
  color: var(--app-text-soft);
}
[data-theme="light"] .password-detail-view__text-9 {
  color: var(--app-text-soft);
}
[data-theme="light"] .password-detail-view__button-cancel {
  color: var(--app-text-soft);
}
[data-theme="light"] .password-detail-view__button-8 {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__button-13 {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__button-17 {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__text {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__text-2fa-verification {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__button-6 {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__label-title {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__label-username {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__user {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__label-email {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__mail {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__label-password {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__key-round {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__button-9 {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__label-totp-authenticator {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__text-11 {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__clock {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__button-11 {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__label-website-urls {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__globe {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__button-12 {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__label-notes {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__label-tags {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__tag {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__button-14 {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__block-55 {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__text-created {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__text-last-updated {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__text-event-id {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__text-15 {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__text-16 {
  color: var(--app-muted);
}
[data-theme="light"] .password-detail-view__text-username {
  color: var(--app-text-soft);
}
[data-theme="light"] .password-detail-view__text-email {
  color: var(--app-text-soft);
}
[data-theme="light"] .password-detail-view__text-password {
  color: var(--app-text-soft);
}
[data-theme="light"] .password-detail-view__text-websites {
  color: var(--app-text-soft);
}
[data-theme="light"] .password-detail-view__text-secure-notes {
  color: var(--app-text-soft);
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__block-57 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__block-58 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__block-59 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__block-14 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__block-18 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__block-20 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__block-22 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__block-25 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__block-27 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__text-9 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__field-text {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__field-text-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__field-email {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__field-master-password {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__block-38 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__field-jbswy3dpehpk3pxp {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__field-url {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__field-recovery-codes {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__field-text-3 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__button-add {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__text-12 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__button-cancel {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__block-57 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__block-58 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__block-59 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__status {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__article {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__button-4 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__button-5 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__button-6 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__button-7 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__form {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.password-detail-view__section {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}
}
</style>
