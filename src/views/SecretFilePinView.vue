<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, Eye, EyeOff, FileKey2, ShieldCheck, Upload } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { useIdentityStore } from "@/stores/identity";
import { resumeTarget } from "@/router";
import {
  FILE_PIN_MAX_DIGITS,
  FILE_PIN_MIN_DIGITS,
  filePinEntropyBits,
  hashSecretFile,
  isValidFilePin,
  normalizeFilePin,
} from "@/lib/crypto";

const identity = useIdentityStore();
const route = useRoute();
const router = useRouter();

const fileInput = ref(null);
const pickedName = ref("");
const pickedSize = ref(0);
const fileHash = ref("");
const pin = ref("");
const confirmPin = ref("");
const showPin = ref(false);
const shortPinAck = ref(false);
const busy = ref(false);
const message = ref("");
const error = ref("");

const pinDigits = computed(() => normalizeFilePin(pin.value));
const confirmDigits = computed(() => normalizeFilePin(confirmPin.value));
const pinBits = computed(() => filePinEntropyBits(pin.value));
const pinValid = computed(() => isValidFilePin(pin.value));
const pinsMatch = computed(
  () => confirmDigits.value.length > 0 && confirmDigits.value === pinDigits.value,
);

/**
 * A 4–5 digit PIN is only ~13–17 bits. The file is already in the attacker's
 * hands in the scenario this method exists for, so a short PIN must be an
 * explicit choice rather than something a typo slips into.
 */
const needsShortPinAck = computed(
  () => pinDigits.value.length >= FILE_PIN_MIN_DIGITS && pinDigits.value.length < 6,
);
const shortPinAckMissing = computed(() => needsShortPinAck.value && !shortPinAck.value);

const canCreate = computed(
  () =>
    Boolean(fileHash.value) &&
    pinValid.value &&
    pinsMatch.value &&
    !shortPinAckMissing.value &&
    !busy.value,
);

const pinStrength = computed(() => {
  const length = pinDigits.value.length;
  if (length === 0) {
    return {
      label: "Waiting for a PIN",
      hint: `${FILE_PIN_MIN_DIGITS}–${FILE_PIN_MAX_DIGITS} digits`,
      tone: "text-(--app-muted)",
      bar: "bg-(--app-border)",
      width: 0,
    };
  }
  if (length < FILE_PIN_MIN_DIGITS) {
    return {
      label: `${length} of ${FILE_PIN_MIN_DIGITS} digits`,
      hint: "Too short",
      tone: "text-amber-400",
      bar: "bg-amber-500",
      width: (length / FILE_PIN_MAX_DIGITS) * 100,
    };
  }
  if (length <= 5) {
    return {
      label: `${length} digits · ~${pinBits.value} bits`,
      hint: "Weak on its own — brute-forceable if the file is copied",
      tone: "text-rose-400",
      bar: "bg-rose-500",
      width: (length / FILE_PIN_MAX_DIGITS) * 100,
    };
  }
  if (length === 6) {
    return {
      label: `${length} digits · ~${pinBits.value} bits`,
      hint: "Fair",
      tone: "text-amber-400",
      bar: "bg-amber-500",
      width: (length / FILE_PIN_MAX_DIGITS) * 100,
    };
  }
  return {
    label: `${length} digits · ~${pinBits.value} bits`,
    hint: length === FILE_PIN_MAX_DIGITS ? "Best protection" : "Good",
    tone: "text-emerald-400",
    bar: "bg-emerald-500",
    width: (length / FILE_PIN_MAX_DIGITS) * 100,
  };
});

const sizeLabel = computed(() => {
  const bytes = pickedSize.value;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
});

function clearPicked() {
  pickedName.value = "";
  pickedSize.value = 0;
  fileHash.value = "";
  if (fileInput.value) fileInput.value.value = "";
}

function resetFeedback() {
  message.value = "";
  error.value = "";
}

async function onFileChange(event) {
  resetFeedback();
  const file = event.target.files?.[0];
  if (!file) {
    clearPicked();
    return;
  }

  pickedName.value = file.name;
  pickedSize.value = file.size;
  fileHash.value = "";

  try {
    fileHash.value = await hashSecretFile(file);
  } catch (e) {
    clearPicked();
    error.value = e.message || "Could not read that file.";
  }
}

/**
 * Filter the field as it is typed instead of trusting v-model: a pasted "12-34"
 * becomes 1234, letters never enter the value, and the raw input is rewritten
 * so the visible text always matches what will be derived.
 */
function applyPinInput(event, target) {
  const digits = normalizeFilePin(event.target.value).slice(0, FILE_PIN_MAX_DIGITS);
  target.value = digits;
  if (event.target.value !== digits) event.target.value = digits;
}

function onPinInput(event) {
  applyPinInput(event, pin);
  // A shorter PIN weakens the second factor, so the acknowledgement has to be
  // given again for the new value instead of carrying over.
  if (pinDigits.value.length < 6) shortPinAck.value = false;
}

function onConfirmPinInput(event) {
  applyPinInput(event, confirmPin);
}

async function create() {
  if (!canCreate.value) return;
  resetFeedback();

  if (pinDigits.value !== confirmDigits.value) {
    error.value = "The PINs do not match.";
    return;
  }

  busy.value = true;
  try {
    await identity.createFromFileAndPin(fileHash.value, pinDigits.value);
    pin.value = "";
    confirmPin.value = "";
    shortPinAck.value = false;
    message.value = "Identity created. Redirecting…";
    setTimeout(() => router.replace(resumeTarget(route.query)), 350);
  } catch (e) {
    error.value = e.message || "Failed to create identity.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-(--app-bg) text-(--app-text) pb-16">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-6">
        <div class="flex items-center gap-3">
          <RouterLink
            to="/welcome"
            class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors"
            title="Back"
          >
            <ArrowLeft class="h-4 w-4" :stroke-width="2" />
          </RouterLink>
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          >
            <FileKey2 class="h-6 w-6" :stroke-width="1.8" />
          </div>
          <div class="min-w-0">
            <h1 class="text-2xl font-extrabold tracking-tight text-(--app-text)">File + PIN</h1>
            <p class="text-xs text-(--app-muted)">
              Something you have, plus something you remember
            </p>
          </div>
        </div>

        <section
          class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-3xl p-5 sm:p-7 space-y-5"
        >
          <div
            class="flex items-start gap-3 rounded-[14px] border border-emerald-500/25 bg-emerald-500/5 px-4 py-3"
          >
            <ShieldCheck
              class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
              :stroke-width="2"
              aria-hidden="true"
            />
            <p class="text-xs text-emerald-200/90 leading-relaxed">
              Both factors are required. The file is mixed with your PIN before Argon2id, so a
              copied file on its own derives nothing and a guessed PIN without the exact file
              derives nothing either.
            </p>
          </div>

          <!-- 1. File -->
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-(--app-text)">1. File</label>
              <p class="mt-1 text-sm text-(--app-muted) leading-relaxed">
                Pick a file only you have — an old photo, a keepsake, anything. Its SHA-256 is read
                locally and never uploaded.
              </p>
            </div>

            <input ref="fileInput" type="file" class="hidden" @change="onFileChange" />

            <div class="flex flex-wrap items-center gap-3">
              <PrimaryButton :disabled="busy" @click="fileInput?.click()">
                <Upload class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                {{ pickedName ? "Choose a different file" : "Choose a file" }}
              </PrimaryButton>
              <button
                v-if="pickedName"
                type="button"
                class="cursor-pointer text-xs text-(--app-muted) underline underline-offset-2 hover:text-(--app-text)"
                @click="clearPicked"
              >
                Clear
              </button>
            </div>

            <div
              v-if="pickedName"
              class="rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-4 py-3 space-y-1"
            >
              <p class="truncate font-mono text-[0.8rem] text-(--app-text)">{{ pickedName }}</p>
              <p class="text-[11px] text-(--app-muted)">
                {{ sizeLabel }}
                <template v-if="fileHash"> · SHA-256</template>
              </p>
              <p
                v-if="fileHash"
                class="break-all font-mono text-[11px] text-emerald-400 leading-relaxed"
              >
                {{ fileHash }}
              </p>
              <p v-else class="text-[11px] text-(--app-muted)">Hashing…</p>
            </div>

            <div class="rounded-[14px] border border-amber-500/25 bg-amber-500/5 px-4 py-3">
              <p class="text-xs text-amber-200/90 leading-relaxed">
                The file must <strong>never change</strong>. An editor re-save, a sync client, or a
                re-compression changes the hash and lands you on a new, empty account.
              </p>
            </div>
          </div>

          <div class="border-t border-(--app-border)" />

          <!-- 2. PIN -->
          <div class="space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <label for="file-pin" class="block text-xs font-semibold text-(--app-text)">
                  2. PIN
                </label>
                <p class="mt-1 text-sm text-(--app-muted) leading-relaxed">
                  {{ FILE_PIN_MIN_DIGITS }}–{{ FILE_PIN_MAX_DIGITS }} digits. The same file and the
                  same PIN restore this account on any device.
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 cursor-pointer rounded-lg p-1.5 text-(--app-muted) transition-colors hover:text-(--app-text)"
                :title="showPin ? 'Hide PIN' : 'Show PIN'"
                @click="showPin = !showPin"
              >
                <EyeOff v-if="showPin" class="h-4 w-4" :stroke-width="1.8" />
                <Eye v-else class="h-4 w-4" :stroke-width="1.8" />
              </button>
            </div>

            <input
              id="file-pin"
              :type="showPin ? 'text' : 'password'"
              :value="pin"
              inputmode="numeric"
              pattern="[0-9]*"
              :maxlength="FILE_PIN_MAX_DIGITS"
              autocomplete="off"
              spellcheck="false"
              placeholder="e.g. 73921408"
              class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] font-mono text-[0.95rem] leading-[1.5] tracking-[0.3em] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:tracking-normal placeholder:text-(--app-muted-2) focus:border-emerald-500/60 focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              @input="onPinInput"
            />

            <div class="space-y-1">
              <div class="h-1 w-full overflow-hidden rounded-full bg-(--app-surface-soft)">
                <div
                  class="h-full rounded-full transition-all duration-300"
                  :class="pinStrength.bar"
                  :style="{ width: `${pinStrength.width}%` }"
                />
              </div>
              <div class="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                <span class="font-mono" :class="pinStrength.tone">{{ pinStrength.label }}</span>
                <span class="text-(--app-muted)">{{ pinStrength.hint }}</span>
              </div>
            </div>

            <input
              :type="showPin ? 'text' : 'password'"
              :value="confirmPin"
              inputmode="numeric"
              pattern="[0-9]*"
              :maxlength="FILE_PIN_MAX_DIGITS"
              autocomplete="off"
              spellcheck="false"
              placeholder="Repeat the PIN"
              aria-label="Repeat the PIN"
              class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] font-mono text-[0.95rem] leading-[1.5] tracking-[0.3em] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:tracking-normal placeholder:text-(--app-muted-2) focus:border-emerald-500/60 focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              :class="
                confirmDigits.length > 0 && !pinsMatch
                  ? 'border-rose-500/50 focus:border-rose-500/60'
                  : ''
              "
              @input="onConfirmPinInput"
            />
            <p
              v-if="confirmDigits.length > 0 && !pinsMatch"
              class="text-[11px] text-rose-400 leading-relaxed"
            >
              The PINs do not match.
            </p>
            <p v-else class="text-[11px] text-(--app-muted) leading-relaxed">
              There is no recovery if you forget this PIN — the file alone will not get you back in.
            </p>

            <div
              v-if="needsShortPinAck"
              class="rounded-[14px] border border-rose-500/25 bg-rose-500/5 px-4 py-3 space-y-2"
            >
              <p class="text-xs text-rose-200/90 leading-relaxed">
                A {{ pinDigits.length }}-digit PIN is only ~{{ pinBits }} bits. If someone has this
                device, they already have the file — the PIN is all that is left. An 8-digit PIN is
                10,000× harder to guess.
              </p>
              <label class="flex items-start gap-2 cursor-pointer">
                <input
                  v-model="shortPinAck"
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
                />
                <span class="text-[11px] text-(--app-text-soft) leading-relaxed">
                  I understand, and I will use 8 digits if I can.
                </span>
              </label>
            </div>
          </div>

          <p class="text-xs text-(--app-muted) leading-relaxed">
            This is its own account. A file-only account is a different key, so the same file
            without a PIN cannot unlock it — and that account cannot be restored on this page.
          </p>

          <PrimaryButton @click="create" :disabled="!canCreate" :loading="busy">
            <ShieldCheck v-if="!busy" class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
            {{
              busy
                ? "Deriving file + PIN key in memory…"
                : shortPinAckMissing
                  ? "Accept the short-PIN warning to continue"
                  : "Create identity"
            }}
          </PrimaryButton>
        </section>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />
      </div>
    </main>
  </div>
</template>
