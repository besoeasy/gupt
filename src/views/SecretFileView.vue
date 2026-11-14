<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ChevronLeft,
  Fingerprint,
  FolderOpen,
  Lock,
  RefreshCcw,
  ShieldCheck,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PinStrengthMeter from "@/components/PinStrengthMeter.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { useIdentityStore } from "@/stores/identity";
import { resumeTarget } from "@/router";
import {
  hashSecretFile,
  MAX_SECRET_FILE_BYTES,
  PIN_MIN_CHARS,
  secretPinEntropyBits,
} from "@/lib/crypto";

const identity = useIdentityStore();
const route = useRoute();
const router = useRouter();

const fileInput = ref(null);
const pickedName = ref("");
const pickedSize = ref(0);
const fileHash = ref("");
const pin = ref("");
const busy = ref(false);
const message = ref("");
const error = ref("");

const pinValid = computed(() => pin.value.trim().length >= PIN_MIN_CHARS);
const pinBits = computed(() => secretPinEntropyBits(pin.value));
const canCreate = computed(() => Boolean(fileHash.value) && pinValid.value && !busy.value);

const sizeLabel = computed(() => {
  const bytes = pickedSize.value;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
});

const howItWorks = [
  {
    icon: ShieldCheck,
    text: "The file's SHA-256 and your PIN are hashed once with Argon2id — that digest is your identity.",
  },
  {
    icon: RefreshCcw,
    text: "The same file and PIN derive the same account on every device. Nothing to store, sync or export.",
  },
  {
    icon: Lock,
    text: "The file is read locally and never uploaded — only its hash is used. A copied file alone opens nothing.",
  },
];

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

async function create() {
  if (!canCreate.value) return;
  busy.value = true;
  resetFeedback();
  try {
    await identity.createFromSecret(fileHash.value, pin.value);
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
  <!-- Emerald matches the "Use a secret file" card on /welcome. -->
  <div
    class="relative min-h-full w-full overflow-y-auto bg-(--app-bg) text-(--app-text) [--accent:#34d399]"
  >
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_srgb,var(--app-text)_9%,transparent),transparent)]"
      aria-hidden="true"
    />

    <main class="relative mx-auto w-full max-w-2xl px-4 pt-8 pb-24 sm:pt-12">
      <RouterLink
        to="/welcome"
        class="app-list-item inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 -ml-2 text-xs font-medium text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
      >
        <ChevronLeft class="size-3.5" aria-hidden="true" />
        All sign-in methods
      </RouterLink>

      <header class="app-list-item mt-8 flex flex-col items-center text-center [--app-item-delay:40ms]">
        <div
          class="flex size-14 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
        >
          <Fingerprint class="size-7 text-[var(--accent)]" :stroke-width="1.7" aria-hidden="true" />
        </div>
        <h1 class="mt-5 text-3xl font-semibold tracking-tighter sm:text-4xl">Use a secret file</h1>
        <p class="mt-3 max-w-md text-sm leading-relaxed text-(--app-muted)">
          A photo or keepsake only you have, plus a PIN — two-factor sign-in.
        </p>
      </header>

      <p
        v-if="identity.isReady"
        class="app-list-item mt-6 rounded-xl border border-(--app-border) bg-(--app-surface) px-4 py-3 text-xs leading-relaxed text-(--app-muted) [--app-item-delay:70ms]"
      >
        This browser already holds
        <span class="font-medium text-(--app-text-soft)">
          {{ identity.profileName || identity.fingerprint || "an account" }} </span
        >. A different secret moves it to a new identity and clears that account's cached data.
      </p>

      <section
        class="app-list-item mt-6 rounded-2xl border border-(--app-border) bg-(--app-surface) p-5 shadow-sm [--app-item-delay:100ms] sm:p-7"
      >
        <!-- File picker -->
        <input ref="fileInput" type="file" class="hidden" @change="onFileChange" />

        <div class="space-y-2">
          <span class="block text-xs font-semibold text-(--app-text)">File</span>

          <button
            v-if="!pickedName"
            type="button"
            class="group flex w-full flex-col items-center gap-3 rounded-[14px] border border-dashed border-(--app-border) bg-(--app-surface-soft) px-6 py-10 transition-all duration-200 hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:bg-(--app-surface-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
            @click="fileInput?.click()"
          >
            <span
              class="flex size-11 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-transform duration-300 ease-[var(--app-ease-swift)] group-hover:scale-105"
            >
              <FolderOpen
                class="size-5 text-[var(--accent)]"
                :stroke-width="1.7"
                aria-hidden="true"
              />
            </span>
            <span class="text-sm font-medium text-(--app-text)">Choose a file</span>
            <span class="text-xs text-(--app-muted-2)">
              An old photo, a keepsake, anything — up to {{ Math.round(MAX_SECRET_FILE_BYTES / (1024 * 1024)) }} MB
            </span>
          </button>

          <div
            v-else
            class="rounded-[14px] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-(--app-surface-soft) px-4 py-3"
          >
            <div class="flex items-center gap-3">
              <span
                class="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
              >
                <Fingerprint class="size-4 text-[var(--accent)]" :stroke-width="1.8" aria-hidden="true" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate font-mono text-[0.8rem] text-(--app-text)">{{ pickedName }}</p>
                <p class="text-[11px] text-(--app-muted)">
                  {{ sizeLabel }} · hashing…
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-xs text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                @click="clearPicked"
              >
                Clear
              </button>
            </div>
            <p
              v-if="fileHash"
              class="mt-2 break-all border-t border-(--app-border) pt-2 font-mono text-[11px] leading-relaxed text-[var(--accent)]"
            >
              {{ fileHash }}
            </p>
          </div>

          <button
            v-if="pickedName"
            type="button"
            class="cursor-pointer text-xs font-medium text-(--app-muted) underline underline-offset-2 transition-colors hover:text-(--app-text)"
            @click="fileInput?.click()"
          >
            Choose a different file
          </button>
        </div>

        <!-- How it works -->
        <ul class="mt-5 space-y-3 border-t border-(--app-border) pt-5">
          <li
            v-for="(point, index) in howItWorks"
            :key="index"
            class="flex items-start gap-3 text-sm leading-relaxed text-(--app-muted)"
          >
            <span
              class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
            >
              <component
                :is="point.icon"
                class="size-3.5 text-[var(--accent)]"
                :stroke-width="1.8"
                aria-hidden="true"
              />
            </span>
            {{ point.text }}
          </li>
        </ul>

        <!-- PIN -->
        <div class="mt-5 space-y-2 border-t border-(--app-border) pt-5">
          <label for="file-pin" class="block text-xs font-semibold text-(--app-text)">
            PIN
            <span class="font-normal text-(--app-muted)">— {{ PIN_MIN_CHARS }}+ letters or digits</span>
          </label>
          <input
            id="file-pin"
            v-model="pin"
            type="text"
            inputmode="text"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            placeholder="e.g. prairie9Violet"
            class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.75rem] font-mono text-[0.85rem] text-(--app-text) transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--accent)_60%,transparent)] focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
          />
          <PinStrengthMeter :bits="pinBits" suffix=", on top of the file" />
        </div>

        <!-- The one warning that actually matters for this method. -->
        <div
          class="mt-5 rounded-[14px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] px-4 py-3"
        >
          <p class="text-xs leading-relaxed text-(--app-text-soft)">
            Pick a file that will <strong class="text-(--app-text)">never change</strong>. If an
            editor re-saves it, a sync client rewrites it, or it gets re-compressed, the hash
            changes and you land on a new, empty account with no way back. Keep a private copy —
            that file is now your account.
          </p>
        </div>

        <PrimaryButton class="mt-6" @click="create" :disabled="!canCreate" :loading="busy">
          {{ busy ? "Deriving Argon2id key in memory…" : "Create identity" }}
        </PrimaryButton>
      </section>

      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />
    </main>
  </div>
</template>
