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
} from "@/icons";
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
  <main class="vault-page">
    <div class="vault-page__inner">
      <PageHeader
        :eyebrow="isNew ? 'New credential' : 'Encrypted password'"
        :title="isNew ? 'Add password' : form.title || primaryHostname || 'Password entry'"
      >
        <p class="vault-page__lede">
          {{
            isNew
              ? "Store logins, TOTP 2FA keys, and secure credentials encrypted with Argon2id."
              : "All secrets, passwords, and TOTP keys remain strictly inside encrypted ciphertext."
          }}
        </p>
      </PageHeader>

      <AppAlertBanner v-if="error" :message="error" />

      <!-- Loading State -->
      <div v-if="isLoading" class="vault-loading" role="status">
        <span class="vault-sr">Fetching encrypted password…</span>
        <AppSkeleton class="vault-loading__line" />
        <AppSkeleton class="vault-loading__line vault-loading__line--short" />
        <AppSkeleton class="vault-loading__block" />
      </div>

      <template v-else>
        <!-- View / Read Mode -->
        <article v-if="!isEditing && passwordItem" class="vault-sheet">
          <div class="vault-sheet__top">
            <button type="button" class="vault-btn" @click="isEditing = true">
              <Pencil class="vault-btn__icon" :stroke-width="1.9" aria-hidden="true" />
              <span>Edit entry</span>
            </button>
            <button type="button" class="vault-btn vault-btn--danger" @click="showDeleteConfirm = true">
              <Trash2 class="vault-btn__icon" :stroke-width="1.9" aria-hidden="true" />
              <span>Delete</span>
            </button>
          </div>

          <!-- TOTP 2FA Banner -->
          <div v-if="totpCode" class="vault-totp">
            <div class="vault-totp__body">
              <span class="vault-totp__label">2FA verification code</span>
              <div class="vault-totp__line">
                <p class="vault-totp__code">{{ totpCode.slice(0, 3) }} {{ totpCode.slice(3) }}</p>
                <span class="vault-totp__remain">{{ totpRemain }}s</span>
              </div>
            </div>

            <button type="button" class="vault-btn" @click="copyValue(totpCode, 'totpCode')">
              <Check v-if="copiedField === 'totpCode'" class="vault-btn__icon vault-btn__icon--success" :stroke-width="2" aria-hidden="true" />
              <Copy v-else class="vault-btn__icon" :stroke-width="1.9" aria-hidden="true" />
              <span>{{ copiedField === "totpCode" ? "Copied" : "Copy code" }}</span>
            </button>
          </div>

          <!-- Credential rows -->
          <dl class="vault-fields">
            <div v-if="form.username" class="vault-field-row">
              <dt class="vault-field-row__label">Username</dt>
              <dd class="vault-field-row__value">
                <span class="vault-field-row__text">{{ form.username }}</span>
                <button type="button" class="vault-copy" @click="copyValue(form.username, 'username')">
                  <Check v-if="copiedField === 'username'" class="vault-copy__icon vault-copy__icon--success" :stroke-width="2" aria-hidden="true" />
                  <Copy v-else class="vault-copy__icon" :stroke-width="1.9" aria-hidden="true" />
                  <span>{{ copiedField === "username" ? "Copied" : "Copy" }}</span>
                </button>
              </dd>
            </div>

            <div v-if="form.email" class="vault-field-row">
              <dt class="vault-field-row__label">Email</dt>
              <dd class="vault-field-row__value">
                <span class="vault-field-row__text">{{ form.email }}</span>
                <button type="button" class="vault-copy" @click="copyValue(form.email, 'email')">
                  <Check v-if="copiedField === 'email'" class="vault-copy__icon vault-copy__icon--success" :stroke-width="2" aria-hidden="true" />
                  <Copy v-else class="vault-copy__icon" :stroke-width="1.9" aria-hidden="true" />
                  <span>{{ copiedField === "email" ? "Copied" : "Copy" }}</span>
                </button>
              </dd>
            </div>

            <div class="vault-field-row">
              <dt class="vault-field-row__label">Password</dt>
              <dd class="vault-field-row__value">
                <span class="vault-field-row__text vault-field-row__text--secret">
                  {{ showPassword ? form.password : "••••••••••••••••" }}
                </span>
                <div class="vault-field-row__tools">
                  <button
                    type="button"
                    class="vault-icon-btn"
                    :title="showPassword ? 'Hide password' : 'Show password'"
                    :aria-label="showPassword ? 'Hide password' : 'Show password'"
                    @click="showPassword = !showPassword"
                  >
                    <EyeOff v-if="showPassword" class="vault-icon-btn__icon" :stroke-width="1.9" aria-hidden="true" />
                    <Eye v-else class="vault-icon-btn__icon" :stroke-width="1.9" aria-hidden="true" />
                  </button>
                  <button type="button" class="vault-copy" @click="copyValue(form.password, 'password')">
                    <Check v-if="copiedField === 'password'" class="vault-copy__icon vault-copy__icon--success" :stroke-width="2" aria-hidden="true" />
                    <Copy v-else class="vault-copy__icon" :stroke-width="1.9" aria-hidden="true" />
                    <span>{{ copiedField === "password" ? "Copied" : "Copy" }}</span>
                  </button>
                </div>
              </dd>
            </div>

            <div v-if="form.uris.filter((u) => u && u.trim()).length" class="vault-field-row">
              <dt class="vault-field-row__label">Websites</dt>
              <dd class="vault-field-row__value vault-field-row__value--stack">
                <div
                  v-for="(uri, idx) in form.uris.filter((u) => u && u.trim())"
                  :key="idx"
                  class="vault-site"
                >
                  <span class="vault-site__url">{{ uri }}</span>
                  <a :href="uri" target="_blank" rel="noopener noreferrer" class="vault-site__open">
                    <ExternalLink class="vault-site__icon" :stroke-width="1.9" aria-hidden="true" />
                    <span>Open</span>
                  </a>
                </div>
              </dd>
            </div>

            <div v-if="form.notes" class="vault-field-row">
              <dt class="vault-field-row__label">Secure notes</dt>
              <dd class="vault-field-row__value">
                <p class="vault-notes">{{ form.notes }}</p>
              </dd>
            </div>

            <div v-if="form.tags.length" class="vault-field-row">
              <dt class="vault-field-row__label">Tags</dt>
              <dd class="vault-field-row__value">
                <div class="vault-tags">
                  <span v-for="tag in form.tags" :key="tag" class="vault-tag">#{{ tag }}</span>
                </div>
              </dd>
            </div>
          </dl>
        </article>

        <!-- Edit / Create Form -->
        <form v-else class="vault-form" @submit.prevent="handleSave">
          <!-- Title -->
          <div class="vault-field">
            <label class="vault-label" for="vault-title">Title</label>
            <input
              id="vault-title"
              v-model="form.title"
              type="text"
              placeholder="e.g. GitHub, Google, Work VPN"
              class="vault-input"
            />
          </div>

          <!-- Username & Email -->
          <div class="vault-grid">
            <div class="vault-field">
              <label class="vault-label" for="vault-username">Username</label>
              <div class="vault-input-group">
                <User class="vault-input-group__icon" :stroke-width="1.8" aria-hidden="true" />
                <input
                  id="vault-username"
                  v-model="form.username"
                  type="text"
                  placeholder="username"
                  class="vault-input vault-input--bare"
                />
              </div>
            </div>

            <div class="vault-field">
              <label class="vault-label" for="vault-email">Email</label>
              <div class="vault-input-group">
                <Mail class="vault-input-group__icon" :stroke-width="1.8" aria-hidden="true" />
                <input
                  id="vault-email"
                  v-model="form.email"
                  type="email"
                  placeholder="user@example.com"
                  class="vault-input vault-input--bare"
                />
              </div>
            </div>
          </div>

          <!-- Password -->
          <div class="vault-field">
            <div class="vault-field__head">
              <label class="vault-label" for="vault-secret">
                Password <span class="vault-label__required">*</span>
              </label>
              <button type="button" class="vault-linkbtn" @click="showGenerator = !showGenerator">
                <Sparkles class="vault-linkbtn__icon" :stroke-width="1.9" aria-hidden="true" />
                <span>{{ showGenerator ? "Hide generator" : "Generate strong password" }}</span>
              </button>
            </div>

            <div class="vault-input-group">
              <KeyRound class="vault-input-group__icon" :stroke-width="1.8" aria-hidden="true" />
              <input
                id="vault-secret"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                required
                placeholder="Master password or phrase"
                class="vault-input vault-input--bare vault-input--mono"
              />
              <button
                type="button"
                class="vault-icon-btn"
                :title="showPassword ? 'Hide password' : 'Show password'"
                :aria-label="showPassword ? 'Hide password' : 'Show password'"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" class="vault-icon-btn__icon" :stroke-width="1.9" aria-hidden="true" />
                <Eye v-else class="vault-icon-btn__icon" :stroke-width="1.9" aria-hidden="true" />
              </button>
            </div>

            <!-- Password Generator -->
            <div v-if="showGenerator" class="vault-generator">
              <div class="vault-generator__head">
                <span class="vault-generator__length">Password length: {{ genLength }}</span>
                <button type="button" class="vault-linkbtn" @click="generatePassword">
                  <RefreshCw class="vault-linkbtn__icon" :stroke-width="1.9" aria-hidden="true" />
                  <span>Regenerate</span>
                </button>
              </div>

              <input
                v-model.number="genLength"
                type="range"
                min="8"
                max="64"
                class="vault-range"
                aria-label="Password length"
                @input="generatePassword"
              />

              <div class="vault-generator__options">
                <label class="vault-check">
                  <input v-model="genIncludeUpper" type="checkbox" class="vault-check__box" @change="generatePassword" />
                  <span>A-Z</span>
                </label>
                <label class="vault-check">
                  <input v-model="genIncludeLower" type="checkbox" class="vault-check__box" @change="generatePassword" />
                  <span>a-z</span>
                </label>
                <label class="vault-check">
                  <input v-model="genIncludeNumbers" type="checkbox" class="vault-check__box" @change="generatePassword" />
                  <span>0-9</span>
                </label>
                <label class="vault-check">
                  <input v-model="genIncludeSymbols" type="checkbox" class="vault-check__box" @change="generatePassword" />
                  <span>Symbols (!@#$)</span>
                </label>
              </div>
            </div>
          </div>

          <!-- TOTP -->
          <div class="vault-field">
            <label class="vault-label" for="vault-totp">
              TOTP authenticator key <span class="vault-label__optional">(2FA Base32)</span>
            </label>
            <div class="vault-input-group">
              <Clock class="vault-input-group__icon" :stroke-width="1.8" aria-hidden="true" />
              <input
                id="vault-totp"
                v-model="form.totp"
                :type="showTotpSecret ? 'text' : 'password'"
                placeholder="JBSWY3DPEHPK3PXP"
                class="vault-input vault-input--bare vault-input--mono"
              />
              <button
                type="button"
                class="vault-icon-btn"
                :title="showTotpSecret ? 'Hide key' : 'Show key'"
                :aria-label="showTotpSecret ? 'Hide TOTP key' : 'Show TOTP key'"
                @click="showTotpSecret = !showTotpSecret"
              >
                <EyeOff v-if="showTotpSecret" class="vault-icon-btn__icon" :stroke-width="1.9" aria-hidden="true" />
                <Eye v-else class="vault-icon-btn__icon" :stroke-width="1.9" aria-hidden="true" />
              </button>
            </div>
          </div>

          <!-- Websites -->
          <div class="vault-field">
            <span class="vault-label">Website URLs</span>
            <div class="vault-uris">
              <div v-for="(uri, idx) in form.uris" :key="idx" class="vault-uri">
                <div class="vault-input-group">
                  <Globe class="vault-input-group__icon" :stroke-width="1.8" aria-hidden="true" />
                  <input
                    v-model="form.uris[idx]"
                    type="url"
                    placeholder="https://example.com/login"
                    class="vault-input vault-input--bare"
                    :aria-label="`Website URL ${idx + 1}`"
                  />
                </div>
                <button
                  v-if="form.uris.length > 1"
                  type="button"
                  class="vault-icon-btn"
                  title="Remove URL"
                  aria-label="Remove URL"
                  @click="removeUri(idx)"
                >
                  <X class="vault-icon-btn__icon" :stroke-width="2" aria-hidden="true" />
                </button>
              </div>
              <button type="button" class="vault-add" @click="form.uris.push('')">
                + Add another URL
              </button>
            </div>
          </div>

          <!-- Notes -->
          <div class="vault-field">
            <label class="vault-label" for="vault-notes">Notes</label>
            <textarea
              id="vault-notes"
              v-model="form.notes"
              rows="4"
              placeholder="Recovery codes, pin codes, security questions…"
              class="vault-input vault-textarea"
            />
          </div>

          <!-- Tags -->
          <div class="vault-field">
            <label class="vault-label" for="vault-tag">Tags</label>
            <div class="vault-tag-row">
              <div class="vault-input-group">
                <Tag class="vault-input-group__icon" :stroke-width="1.8" aria-hidden="true" />
                <input
                  id="vault-tag"
                  v-model="tagDraft"
                  type="text"
                  placeholder="Add tag (e.g. personal, banking, work) and press Enter…"
                  class="vault-input vault-input--bare"
                  @keydown.enter.prevent="addTagFromDraft"
                  @keydown.comma.prevent="addTagFromDraft"
                />
              </div>
              <button type="button" :disabled="!tagDraft.trim()" class="vault-btn" @click="addTagFromDraft">
                Add
              </button>
            </div>

            <div v-if="form.tags.length" class="vault-tags">
              <span v-for="tag in form.tags" :key="tag" class="vault-tag">
                <span>#{{ tag }}</span>
                <button
                  type="button"
                  class="vault-tag__remove"
                  :aria-label="`Remove ${tag}`"
                  @click="removeTag(tag)"
                >
                  <X class="vault-tag__x" :stroke-width="2" aria-hidden="true" />
                </button>
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="vault-actions">
            <button
              v-if="!isNew"
              type="button"
              class="vault-btn vault-btn--danger"
              @click="showDeleteConfirm = true"
            >
              <Trash2 class="vault-btn__icon" :stroke-width="1.9" aria-hidden="true" />
              <span>Delete</span>
            </button>

            <div class="vault-actions__end">
              <button
                type="button"
                class="vault-btn"
                @click="isNew ? router.push('/passwords') : (isEditing = false)"
              >
                Cancel
              </button>
              <button type="submit" :disabled="isSaving" class="vault-btn vault-btn--ink">
                <LoaderCircle v-if="isSaving" class="vault-btn__icon vault-btn__icon--spin" aria-hidden="true" />
                <Check v-else class="vault-btn__icon" :stroke-width="2.2" aria-hidden="true" />
                <span>{{ isNew ? "Save password" : "Save changes" }}</span>
              </button>
            </div>
          </div>
        </form>

        <!-- Metadata -->
        <section v-if="!isNew && passwordItem" class="vault-meta">
          <div class="vault-meta__head">
            <ShieldCheck class="vault-meta__icon" :stroke-width="1.8" aria-hidden="true" />
            <span>Encrypted storage details</span>
          </div>

          <dl class="vault-meta__grid">
            <div class="vault-meta__item">
              <dt>Created</dt>
              <dd>{{ formatDate(passwordItem.createdAt) }}</dd>
            </div>

            <div class="vault-meta__item">
              <dt>Last updated</dt>
              <dd>{{ formatDate(passwordItem.updatedAt) }}</dd>
            </div>

            <div v-if="passwordItem.eventId" class="vault-meta__item vault-meta__item--wide">
              <div class="vault-meta__event-head">
                <dt>Event ID</dt>
                <div class="vault-meta__tools">
                  <button type="button" class="vault-copy" @click="copyValue(passwordItem.eventId, 'eventId')">
                    <Check v-if="copiedField === 'eventId'" class="vault-copy__icon vault-copy__icon--success" :stroke-width="2" aria-hidden="true" />
                    <Copy v-else class="vault-copy__icon" :stroke-width="1.9" aria-hidden="true" />
                    <span>{{ copiedField === "eventId" ? "Copied" : "Copy ID" }}</span>
                  </button>
                  <span class="vault-meta__dot" aria-hidden="true">·</span>
                  <RelayEventLink :event-id="passwordItem.eventId" />
                </div>
              </div>
              <dd class="vault-meta__event-id">{{ passwordItem.eventId }}</dd>
            </div>
          </dl>
        </section>
      </template>
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
/* Ledger pass: the vault entry is one identity sheet and one ruled form. */

.vault-page {
  min-height: 100dvh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.vault-page__inner {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  width: 100%;
  max-width: 700px;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.vault-page__lede {
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.vault-sr {
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

.vault-loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
}

.vault-loading__line {
  display: block;
  height: 10px;
  border-radius: 3px;
}

.vault-loading__line--short {
  width: 54%;
}

.vault-loading__block {
  display: block;
  height: 52px;
  border-radius: var(--app-radius-sm);
}

/* ---- Read sheet ---- */

.vault-sheet {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}

.vault-sheet__top {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  padding-bottom: var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
}

/* ---- TOTP ---- */

.vault-totp {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
  padding: 12px;
  border: 1px solid color-mix(in oklab, var(--app-primary) 26%, var(--app-border));
  border-radius: var(--app-radius-sm);
  background: color-mix(in oklab, var(--app-primary) 6%, var(--app-surface));
}

.vault-totp__body {
  min-width: 0;
}

.vault-totp__label {
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.vault-totp__line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 3px;
}

.vault-totp__code {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 500;
  letter-spacing: 0.14em;
  line-height: 1.1;
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}

.vault-totp__remain {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--app-warning);
  font-variant-numeric: tabular-nums;
}

/* ---- Field rows ---- */

.vault-fields {
  display: flex;
  flex-direction: column;
  margin: 0;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  overflow: hidden;
}

.vault-field-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
}

.vault-field-row + .vault-field-row {
  border-top: 1px solid var(--app-border);
}

.vault-field-row__label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.vault-field-row__value {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 10px;
  margin: 0;
  min-width: 0;
}

.vault-field-row__value--stack {
  flex-direction: column;
  align-items: stretch;
}

.vault-field-row__text {
  min-width: 0;
  font-size: 12.5px;
  color: var(--app-text-soft);
  overflow-wrap: anywhere;
}

.vault-field-row__text--secret {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
}

.vault-field-row__tools {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.vault-copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.vault-copy__icon {
  width: 10px;
  height: 10px;
}

.vault-copy__icon--success {
  color: var(--app-success);
}

.vault-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.vault-icon-btn__icon {
  width: 12px;
  height: 12px;
}

.vault-site {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  padding: 5px 0;
}

.vault-site + .vault-site {
  border-top: 1px solid var(--app-border);
}

.vault-site__url {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-primary);
  overflow-wrap: anywhere;
}

.vault-site__open {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  text-decoration: none;
}

.vault-site__icon {
  width: 10px;
  height: 10px;
}

.vault-notes {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  color: var(--app-text-soft);
  overflow-wrap: anywhere;
}

.vault-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.vault-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  background: var(--app-surface-soft);
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
}

/* ---- Form ---- */

.vault-form {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}

.vault-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vault-field__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.vault-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

.vault-label__required {
  color: var(--app-danger);
}

.vault-label__optional {
  font-weight: 400;
  letter-spacing: 0.02em;
  text-transform: none;
  color: var(--app-muted-2);
}

.vault-input-group {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 42px;
  padding-inline: 11px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.vault-input-group:focus-within {
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.vault-input-group__icon {
  flex-shrink: 0;
  width: 13px;
  height: 13px;
  color: var(--app-muted-2);
}

.vault-input {
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-family: var(--font-sans);
  font-size: var(--app-text-body);
  color: var(--app-text);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.vault-input::placeholder {
  color: var(--app-muted-2);
}

.vault-input:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.vault-input--bare {
  min-height: 40px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.vault-input--bare:focus {
  box-shadow: none;
}

.vault-input--mono {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.02em;
}

.vault-textarea {
  min-height: 104px;
  resize: vertical;
  line-height: 1.6;
}

.vault-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--app-space-4);
}

.vault-linkbtn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.vault-linkbtn__icon {
  width: 10px;
  height: 10px;
}

/* ---- Generator ---- */

.vault-generator {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  animation: ledger-fade 240ms var(--app-ease-standard) both;
}

.vault-generator__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.vault-generator__length {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
  font-variant-numeric: tabular-nums;
}

.vault-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 32px;
  margin: 0;
  background: transparent;
  cursor: pointer;
}

.vault-range::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 2px;
  background: var(--app-border-strong);
}

.vault-range::-moz-range-track {
  height: 3px;
  border-radius: 2px;
  background: var(--app-border-strong);
}

.vault-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5.5px;
  border: 2px solid var(--app-surface);
  border-radius: 50%;
  background: var(--app-text);
}

.vault-range::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: 2px solid var(--app-surface);
  border-radius: 50%;
  background: var(--app-text);
}

.vault-range:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
}

.vault-generator__options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
}

.vault-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 26px;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
  cursor: pointer;
}

.vault-check__box {
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: var(--app-text);
}

/* ---- URLs ---- */

.vault-uris {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vault-uri {
  display: flex;
  align-items: center;
  gap: 6px;
}

.vault-uri .vault-input-group {
  flex: 1;
}

.vault-add {
  align-self: flex-start;
  min-height: 26px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

/* ---- Tags ---- */

.vault-tag-row {
  display: flex;
  gap: 6px;
}

.vault-tag-row .vault-input-group {
  flex: 1;
}

.vault-tag__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
}

.vault-tag__x {
  width: 9px;
  height: 9px;
}

/* ---- Buttons ---- */

.vault-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding-inline: 11px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.vault-btn__icon {
  width: 12px;
  height: 12px;
}

.vault-btn__icon--success {
  color: var(--app-success);
}

.vault-btn__icon--spin {
  animation: spin 1s linear infinite;
}

.vault-btn:active {
  transform: translateY(1px);
}

.vault-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.vault-btn--ink {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.vault-btn--danger {
  border-color: color-mix(in oklab, var(--app-danger) 28%, var(--app-border));
  color: var(--app-danger);
}

.vault-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
  padding-top: var(--app-space-4);
  border-top: 1px solid var(--app-border);
}

.vault-actions__end {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: auto;
}

/* ---- Metadata ---- */

.vault-meta {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  animation: ledger-rise 420ms var(--app-ease-emphasized) 60ms both;
}

.vault-meta__head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.vault-meta__icon {
  width: 12px;
  height: 12px;
  color: var(--app-success);
}

.vault-meta__grid {
  display: grid;
  grid-template-columns: 1fr;
  margin: 0;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  overflow: hidden;
}

.vault-meta__item {
  padding: 11px 12px;
}

.vault-meta__item + .vault-meta__item {
  border-top: 1px solid var(--app-border);
}

.vault-meta__item dt {
  margin: 0 0 4px;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.vault-meta__item dd {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-soft);
}

.vault-meta__event-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.vault-meta__event-head dt {
  margin: 0;
}

.vault-meta__tools {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.vault-meta__dot {
  color: var(--app-border-strong);
}

.vault-meta__item .vault-meta__event-id {
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted);
  overflow-wrap: anywhere;
}

@media (min-width: 40rem) {
  .vault-page__inner {
    padding-inline: var(--app-space-6);
  }

  .vault-sheet,
  .vault-form,
  .vault-meta {
    padding: var(--app-space-6);
  }

  .vault-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .vault-meta__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .vault-meta__item + .vault-meta__item {
    border-top: 0;
  }

  .vault-meta__item:nth-child(even) {
    border-left: 1px solid var(--app-border);
  }

  .vault-meta__item:nth-child(n + 3) {
    border-top: 1px solid var(--app-border);
  }

  .vault-meta__item--wide {
    grid-column: 1 / -1;
    border-left: 0;
  }
}

@media (max-width: 26rem) {
  .vault-tag-row {
    flex-wrap: wrap;
  }

  .vault-tag-row .vault-btn {
    width: 100%;
  }

  .vault-totp {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (hover: hover) {
  .vault-btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .vault-btn--ink:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .vault-btn--danger:hover {
    border-color: var(--app-danger);
    background: var(--app-danger-soft);
    color: var(--app-danger);
  }

  .vault-copy:hover,
  .vault-linkbtn:hover,
  .vault-add:hover,
  .vault-site__open:hover {
    color: var(--app-text);
  }

  .vault-icon-btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .vault-tag__remove:hover {
    color: var(--app-danger);
  }
}

@media (pointer: coarse) {
  .vault-btn,
  .vault-copy,
  .vault-icon-btn,
  .vault-linkbtn,
  .vault-add,
  .vault-tag__remove,
  .vault-site__open {
    min-height: var(--app-touch-h);
  }

  .vault-icon-btn,
  .vault-tag__remove {
    min-width: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .vault-page,
  .vault-sheet,
  .vault-form,
  .vault-meta,
  .vault-generator {
    animation: none;
  }

  .vault-btn,
  .vault-copy,
  .vault-input,
  .vault-input-group,
  .vault-icon-btn,
  .vault-linkbtn,
  .vault-add {
    transition: none;
  }
}
</style>
