<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { Shield, Clock, Loader2, ArrowLeft, Wand2, Eye, EyeOff } from "lucide-vue-next";
import { useIdentityStore } from "@/stores/identity";
import { saveVaultItem } from "@/lib/vault";

const router = useRouter();
const identity = useIdentityStore();
const isSaving = ref(false);

const EXPIRY_OPTIONS = [
  { label: "No Expiry", value: 0 },
  { label: "1 Day", value: 86400 },
  { label: "1 Week", value: 604800 },
  { label: "1 Month", value: 2592000 },
  { label: "3 Months", value: 7776000 },
  { label: "1 Year", value: 31536000 },
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

// ---------------------------------------------------------------------------
// Password strength — pure heuristics, no external packages
// ---------------------------------------------------------------------------
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
  if (score <= 2) return { level: 'weak', label: 'Weak', color: '#f87171', width: '25%' };
  if (score <= 3) return { level: 'fair', label: 'Fair', color: '#fb923c', width: '50%' };
  if (score <= 4) return { level: 'good', label: 'Good', color: '#facc15', width: '75%' };
  return { level: 'strong', label: 'Strong', color: '#34d399', width: '100%' };
});

// ---------------------------------------------------------------------------
// Password generator — crypto.getRandomValues(), no external packages
// ---------------------------------------------------------------------------
function generatePassword() {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const symbols = '!@#$%^&*()-_=+[]{}|;:,.<>?';
  const all = lower + upper + digits + symbols;
  const length = 20;
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  // Guarantee at least one of each character class
  const pick = (set, b) => set[b % set.length];
  const chars = [
    pick(lower, bytes[0]),
    pick(upper, bytes[1]),
    pick(digits, bytes[2]),
    pick(symbols, bytes[3]),
    ...Array.from(bytes.slice(4), b => pick(all, b)),
  ];
  // Fisher-Yates shuffle using remaining random bytes
  const extraBytes = new Uint8Array(length);
  crypto.getRandomValues(extraBytes);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = extraBytes[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  form.value.password = chars.join('');
  showPassword.value = true;
}

async function handleSave() {
  if (!form.value.title) {
    alert("Title is required.");
    return;
  }

  isSaving.value = true;
  try {
    let payload = { type: form.value.type, title: form.value.title };
    if (form.value.type === "note") {
      payload.body = form.value.body;
    } else if (form.value.type === "bookmark") {
      if (!form.value.url) {
        alert("URL is required for a bookmark.");
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
    alert("Failed to save: " + err.message);
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-8">
    <div class="mb-8 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <button
          @click="router.push('/vault')"
          class="ui-icon-button h-10 w-10 text-zinc-400 hover:text-white shrink-0"
        >
          <ArrowLeft class="h-5 w-5" />
        </button>
        <div>
          <h1 class="text-2xl font-bold text-white flex items-center gap-2">Add to Vault</h1>
          <p class="text-sm text-zinc-400 mt-1">
            Securely encrypt a new note, password, or bookmark
          </p>
        </div>
      </div>
    </div>

    <div class="ui-panel rounded-2xl p-6 sm:p-8">
      <div class="space-y-5">
        <div>
          <label class="block text-sm font-medium text-zinc-300 mb-1.5">Type</label>
          <div class="flex ui-surface rounded-lg p-1">
            <button
              @click="form.type = 'note'"
              class="flex-1 py-2.5 text-sm font-medium rounded-md transition-colors"
              :class="
                form.type === 'note'
                  ? 'bg-(--app-primary) text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              "
            >
              Note
            </button>
            <button
              @click="form.type = 'password'"
              class="flex-1 py-2.5 text-sm font-medium rounded-md transition-colors"
              :class="
                form.type === 'password'
                  ? 'bg-(--app-primary) text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              "
            >
              Password
            </button>
            <button
              @click="form.type = 'bookmark'"
              class="flex-1 py-2.5 text-sm font-medium rounded-md transition-colors"
              :class="
                form.type === 'bookmark'
                  ? 'bg-(--app-primary) text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              "
            >
              Bookmark
            </button>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-zinc-300 mb-1.5">Title</label>
          <input
            v-model="form.title"
            type="text"
            class="ui-input w-full"
            placeholder="e.g. My Secret Plan"
          />
        </div>

        <template v-if="form.type === 'password'">
          <div class="grid sm:grid-cols-2 gap-5">
            <div>
              <label class="block text-sm font-medium text-zinc-300 mb-1.5">Username</label>
              <input v-model="form.username" type="text" class="ui-input w-full" />
            </div>
            <div>
              <label class="block text-sm font-medium text-zinc-300 mb-1.5">Email</label>
              <input v-model="form.email" type="email" class="ui-input w-full" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-zinc-300 mb-1.5">Password</label>
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
                  class="ui-icon-button h-7 w-7 text-zinc-400 hover:text-(--app-primary)"
                  title="Generate strong password"
                >
                  <Wand2 class="h-4 w-4" />
                </button>
              </div>
            </div>
            <!-- Strength bar -->
            <div v-if="passwordStrength" class="mt-2">
              <div class="h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-300"
                  :style="{ width: passwordStrength.width, background: passwordStrength.color }"
                />
              </div>
              <p class="text-xs mt-1" :style="{ color: passwordStrength.color }">
                {{ passwordStrength.label }}
              </p>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-zinc-300 mb-1.5"
              >2FA OTP Secret Key (Optional)</label
            >
            <input
              v-model="form.otpKey"
              type="text"
              class="ui-input w-full"
              placeholder="Base32 Secret"
            />
          </div>
        </template>

        <template v-if="form.type === 'bookmark'">
          <div>
            <label class="block text-sm font-medium text-zinc-300 mb-1.5">URL</label>
            <input
              v-model="form.url"
              type="url"
              class="ui-input w-full"
              placeholder="https://example.com"
            />
          </div>
        </template>

        <div>
          <label class="block text-sm font-medium text-zinc-300 mb-1.5">{{
            form.type === "note" ? "Body" : "Notes (Optional)"
          }}</label>
          <textarea
            v-model="form.body"
            rows="6"
            class="ui-input w-full resize-y min-h-[120px]"
          ></textarea>
        </div>

        <div>
          <label class="block text-sm font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
            <Clock class="h-4 w-4" /> Expiry
          </label>
          <select v-model="form.expiry" class="ui-input w-full">
            <option v-for="opt in EXPIRY_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <p class="text-xs text-zinc-500 mt-2">
            If set, standard Nostr relays will automatically delete the post after expiration.
          </p>
        </div>

        <div class="pt-6 mt-6 border-t border-white/5 flex justify-end gap-3">
          <button
            @click="router.push('/vault')"
            class="px-5 py-2.5 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button @click="handleSave" :disabled="isSaving" class="ui-button ui-button-primary px-6">
            <Loader2 v-if="isSaving" class="h-4 w-4 animate-spin mr-2" />
            <Shield v-else class="h-4 w-4 mr-2" />
            Encrypt & Save
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
