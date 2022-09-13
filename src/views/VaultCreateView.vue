<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import {
  Shield,
  Clock,
  Loader2,
  ArrowLeft,
  Wand2,
  Eye,
  EyeOff,
  FileText,
  Key,
  Bookmark,
  Lock,
} from "lucide-vue-next";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { useIdentityStore } from "@/stores/identity";
import { saveVaultItem } from "@/lib/vault";

const router = useRouter();
const identity = useIdentityStore();
const isSaving = ref(false);
const error = ref("");

const TYPE_OPTIONS = [
  {
    value: "note",
    label: "Note",
    description: "Private text and ideas",
    icon: FileText,
    accent: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  {
    value: "password",
    label: "Password",
    description: "Logins, email, and 2FA",
    icon: Key,
    accent: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  {
    value: "bookmark",
    label: "Bookmark",
    description: "URLs with optional notes",
    icon: Bookmark,
    accent: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  },
];

const EXPIRY_OPTIONS = [
  { label: "No expiry", value: 0 },
  { label: "1 day", value: 86400 },
  { label: "1 week", value: 604800 },
  { label: "1 month", value: 2592000 },
  { label: "3 months", value: 7776000 },
  { label: "1 year", value: 31536000 },
];

const form = ref({
  type: "note",
  title: "",
  body: "",
  url: "",
  email: "",
  username: "",
  password: "",
  otpKey: "",
  expiry: 0,
});

const showPassword = ref(false);

const passwordStrength = computed(() => {
  const pw = form.value.password;
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 2) return { level: "weak", label: "Weak", color: "#f87171", width: "25%" };
  if (score <= 3) return { level: "fair", label: "Fair", color: "#fb923c", width: "50%" };
  if (score <= 4) return { level: "good", label: "Good", color: "#facc15", width: "75%" };
  return { level: "strong", label: "Strong", color: "#34d399", width: "100%" };
});

function generatePassword() {
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const symbols = "!@#$%^&*()-_=+[]{}|;:,.<>?";
  const all = lower + upper + digits + symbols;
  const length = 20;
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const pick = (set, b) => set[b % set.length];
  const chars = [
    pick(lower, bytes[0]),
    pick(upper, bytes[1]),
    pick(digits, bytes[2]),
    pick(symbols, bytes[3]),
    ...Array.from(bytes.slice(4), (b) => pick(all, b)),
  ];
  const extraBytes = new Uint8Array(length);
  crypto.getRandomValues(extraBytes);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = extraBytes[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  form.value.password = chars.join("");
  showPassword.value = true;
}

async function handleSave() {
  if (!form.value.title) {
    error.value = "Title is required.";
    return;
  }

  isSaving.value = true;
  error.value = "";
  try {
    let payload = { type: form.value.type, title: form.value.title };
    if (form.value.type === "note") {
      payload.body = form.value.body;
    } else if (form.value.type === "bookmark") {
      if (!form.value.url) {
        error.value = "URL is required for a bookmark.";
        isSaving.value = false;
        return;
      }
      payload.url = form.value.url;
      payload.notes = form.value.body;
    } else {
      payload.email = form.value.email;
      payload.username = form.value.username;
      payload.password = form.value.password;
      payload.otpKey = form.value.otpKey;
      payload.notes = form.value.body;
    }

    await saveVaultItem(identity.privkeyHex, identity.pubkeyHex, payload, form.value.expiry);
    router.push("/vault");
  } catch (err) {
    error.value = err?.message || "Failed to save vault item.";
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="relative min-h-full overflow-hidden">
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        class="absolute -top-[10%] left-[15%] h-[40%] w-[50%] rounded-full bg-(--app-success)/10 blur-[100px]"
      />
    </div>

    <div class="relative z-10 mx-auto max-w-2xl px-4 py-8">
      <div class="mb-6 flex items-center gap-4">
        <button
          @click="router.push('/vault')"
          class="ui-icon-button h-10 w-10 shrink-0 text-zinc-400 hover:text-white"
        >
          <ArrowLeft class="h-5 w-5" />
        </button>
        <div>
          <div
            class="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300"
          >
            <Lock class="h-3 w-3" />
            New entry
          </div>
          <h1 class="text-2xl font-bold text-white">Add to Vault</h1>
          <p class="mt-1 text-sm text-zinc-400">Encrypted locally, then published to your relays</p>
        </div>
      </div>

      <AppAlertBanner v-if="error" :message="error" class="mb-4" />

      <div class="ui-panel rounded-2xl p-5 sm:p-8">
        <div class="space-y-6">
          <div>
            <label class="mb-2 block text-sm font-medium text-zinc-300">Type</label>
            <div class="grid gap-3 sm:grid-cols-3">
              <button
                v-for="option in TYPE_OPTIONS"
                :key="option.value"
                type="button"
                @click="form.type = option.value"
                class="rounded-xl border p-3 text-left transition-all"
                :class="
                  form.type === option.value
                    ? `${option.accent} shadow-[0_0_24px_rgba(72,213,151,0.08)]`
                    : 'border-white/5 bg-black/15 text-zinc-400 hover:border-white/10 hover:text-white'
                "
              >
                <component :is="option.icon" class="mb-2 h-5 w-5" />
                <p class="text-sm font-semibold">{{ option.label }}</p>
                <p class="mt-0.5 text-[11px] leading-snug opacity-80">{{ option.description }}</p>
              </button>
            </div>
          </div>

          <div>
            <label class="mb-1.5 block text-sm font-medium text-zinc-300">Title</label>
            <input
              v-model="form.title"
              type="text"
              class="ui-input w-full"
              placeholder="e.g. Proton Mail, API keys, travel notes"
            />
          </div>

          <template v-if="form.type === 'password'">
            <div class="grid gap-5 sm:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-sm font-medium text-zinc-300">Username</label>
                <input v-model="form.username" type="text" class="ui-input w-full" />
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-zinc-300">Email</label>
                <input v-model="form.email" type="email" class="ui-input w-full" />
              </div>
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium text-zinc-300">Password</label>
              <div class="relative">
                <input
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  class="ui-input w-full !pr-20"
                  placeholder="Enter or generate a password"
                />
                <div class="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-2">
                  <button
                    type="button"
                    @click="showPassword = !showPassword"
                    class="ui-icon-button h-7 w-7 text-zinc-400 hover:text-white"
                    :title="showPassword ? 'Hide' : 'Show'"
                  >
                    <EyeOff v-if="showPassword" class="h-4 w-4" />
                    <Eye v-else class="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    @click="generatePassword"
                    class="ui-icon-button h-7 w-7 text-zinc-400 hover:text-(--app-success)"
                    title="Generate strong password"
                  >
                    <Wand2 class="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div v-if="passwordStrength" class="mt-2">
                <div class="h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    class="h-full rounded-full transition-all duration-300"
                    :style="{ width: passwordStrength.width, background: passwordStrength.color }"
                  />
                </div>
                <p class="mt-1 text-xs" :style="{ color: passwordStrength.color }">
                  {{ passwordStrength.label }}
                </p>
              </div>
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium text-zinc-300"
                >2FA secret (optional)</label
              >
              <input
                v-model="form.otpKey"
                type="text"
                class="ui-input w-full font-mono text-sm"
                placeholder="Base32 secret for live TOTP codes"
              />
            </div>
          </template>

          <template v-if="form.type === 'bookmark'">
            <div>
              <label class="mb-1.5 block text-sm font-medium text-zinc-300">URL</label>
              <input
                v-model="form.url"
                type="url"
                class="ui-input w-full"
                placeholder="https://example.com"
              />
            </div>
          </template>

          <div>
            <label class="mb-1.5 block text-sm font-medium text-zinc-300">{{
              form.type === "note" ? "Body" : "Notes (optional)"
            }}</label>
            <textarea
              v-model="form.body"
              rows="6"
              class="ui-input min-h-[120px] w-full resize-y"
              :placeholder="
                form.type === 'note'
                  ? 'Write your private note here…'
                  : 'Add context or recovery hints…'
              "
            />
          </div>

          <div>
            <label class="mb-2 flex items-center gap-1.5 text-sm font-medium text-zinc-300">
              <Clock class="h-4 w-4" />
              Auto-expiry
            </label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="opt in EXPIRY_OPTIONS"
                :key="opt.value"
                type="button"
                @click="form.expiry = opt.value"
                class="rounded-full border px-3 py-1.5 text-xs font-medium transition-all"
                :class="
                  form.expiry === opt.value
                    ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-100'
                    : 'border-white/5 bg-black/15 text-zinc-400 hover:text-white'
                "
              >
                {{ opt.label }}
              </button>
            </div>
            <p class="mt-2 text-xs text-zinc-500">
              Relays that support expiration will delete the event after this period.
            </p>
          </div>

          <div class="flex justify-end gap-3 border-t border-white/5 pt-6">
            <button
              @click="router.push('/vault')"
              class="px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button @click="handleSave" :disabled="isSaving" class="ui-button ui-button-primary px-6">
              <Loader2 v-if="isSaving" class="mr-2 h-4 w-4 animate-spin" />
              <Shield v-else class="mr-2 h-4 w-4" />
              Encrypt & Save
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>