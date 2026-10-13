<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, Fingerprint, Upload } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { useIdentityStore } from "@/stores/identity";
import { resumeTarget } from "@/router";
import { hashSecretFile, MAX_SECRET_FILE_BYTES } from "@/lib/crypto";

const identity = useIdentityStore();
const route = useRoute();
const router = useRouter();

const fileInput = ref(null);
const pickedName = ref("");
const pickedSize = ref(0);
const fileHash = ref("");
const busy = ref(false);
const message = ref("");
const error = ref("");

const canCreate = computed(() => Boolean(fileHash.value) && !busy.value);

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

async function create() {
  if (!canCreate.value) return;
  busy.value = true;
  resetFeedback();
  try {
    await identity.createFromSecret(fileHash.value);
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
            <ArrowLeft class="w-4 h-4" :stroke-width="2" />
          </RouterLink>
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          >
            <Fingerprint class="h-6 w-6" :stroke-width="1.8" />
          </div>
          <div class="min-w-0">
            <h1 class="text-2xl font-extrabold tracking-tight text-(--app-text)">
              Use a secret file
            </h1>
            <p class="text-xs text-(--app-muted)">The file never leaves your device</p>
          </div>
        </div>

        <section
          class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-3xl p-5 sm:p-7 space-y-4"
        >
          <label class="block text-xs font-semibold text-(--app-text)">File</label>
          <p class="text-sm text-(--app-muted) leading-relaxed -mt-2">
            Pick a file only you have — an old photo, a keepsake, anything. Its SHA-256 is hashed
            once with Argon2id and that becomes your identity, exactly like a passphrase. The file
            is read locally and never uploaded; only its hash is used. Use the same file on another
            device to get the same account back.
          </p>

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
              Pick a file that will <strong>never change</strong>. If an editor re-saves it, a sync
              client rewrites it, or it gets re-compressed, the hash changes and you land on a new,
              empty account with no way back.
            </p>
          </div>

          <p class="text-xs text-(--app-muted) leading-relaxed">
            Keep it somewhere safe and private — that file is now your account.
          </p>

          <PrimaryButton @click="create" :disabled="!canCreate" :loading="busy">
            {{ busy ? "Deriving Argon2id key in memory…" : "Create identity" }}
          </PrimaryButton>
        </section>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />
      </div>
    </main>
  </div>
</template>
