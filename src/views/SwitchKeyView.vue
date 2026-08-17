<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, KeyRound } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { useIdentityStore } from "@/stores/identity";
import { classifyPastedIdentitySecret } from "@/lib/crypto";

const identity = useIdentityStore();
const router = useRouter();

const paste = ref("");
const message = ref("");
const error = ref("");
const busy = ref(false);

const classified = computed(() => classifyPastedIdentitySecret(paste.value));

const hint = computed(() => {
  switch (classified.value.kind) {
    case "hex":
      return "Detected a 64-character hex private key — will restore as-is.";
    case "invalid-backup":
      return "This looks like JSON, but it is not a Gupt backup with a private key.";
    case "secret":
      return "Will run one Argon2id pass on this text to derive a private key.";
    default:
      return "Paste a hex key, backup JSON, or any secret of any length.";
  }
});

const canRestore = computed(() => {
  const kind = classified.value.kind;
  return !busy.value && (kind === "hex" || kind === "secret");
});

async function restore() {
  if (!canRestore.value) return;
  error.value = "";
  message.value = "";
  busy.value = true;
  try {
    await identity.restorePrivateKey(paste.value);
    paste.value = "";
    message.value = "Identity loaded. Redirecting…";
    setTimeout(() => router.replace("/"), 350);
  } catch (e) {
    error.value = e.message || "Failed to restore identity.";
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
            to="/switch"
            class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors"
            title="Back"
          >
            <ArrowLeft class="h-4 w-4" :stroke-width="2" />
          </RouterLink>
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          >
            <KeyRound class="h-6 w-6" :stroke-width="1.8" />
          </div>
          <div class="min-w-0">
            <h1 class="text-2xl font-extrabold tracking-tight text-(--app-text)">Paste a secret</h1>
            <p class="text-xs text-(--app-muted)">
              Crypto seed phrases, hex keys, backup JSON, or any text you can remember
            </p>
          </div>
        </div>

        <section
          class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-3xl p-5 sm:p-7 space-y-4"
        >
          <label class="block text-xs font-semibold text-(--app-text)">Secret</label>
          <textarea
            v-model="paste"
            rows="8"
            spellcheck="false"
            autocomplete="off"
            placeholder="Paste a 64-character hex key, Gupt backup JSON, or any passphrase…"
            class="block w-full resize-y rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] font-mono text-[0.85rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-emerald-500/60 focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
          />
          <p class="text-xs text-(--app-muted) leading-relaxed">{{ hint }}</p>

          <PrimaryButton @click="restore" :disabled="!canRestore" :loading="busy">
            {{
              busy
                ? classified.kind === "secret"
                  ? "Deriving Argon2id key in memory…"
                  : "Loading identity…"
                : "Restore identity"
            }}
          </PrimaryButton>
        </section>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />
      </div>
    </main>
  </div>
</template>
