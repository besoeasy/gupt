<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, KeyRound } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { useIdentityStore } from "@/stores/identity";
import { resumeTarget } from "@/router";

const identity = useIdentityStore();
const route = useRoute();
const router = useRouter();

const paste = ref("");
const message = ref("");
const error = ref("");
const busy = ref(false);

const canCreate = computed(() => !busy.value && paste.value.trim().length > 0);

async function create() {
  if (!canCreate.value) return;
  error.value = "";
  message.value = "";
  busy.value = true;
  try {
    await identity.createFromSecret(paste.value);
    paste.value = "";
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
            <KeyRound class="h-6 w-6" :stroke-width="1.8" />
          </div>
          <div class="min-w-0">
            <h1 class="text-2xl font-extrabold tracking-tight text-(--app-text)">Paste a secret</h1>
            <p class="text-xs text-(--app-muted)">Any text you can remember on any device</p>
          </div>
        </div>

        <section
          class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-3xl p-5 sm:p-7 space-y-4"
        >
          <label class="block text-xs font-semibold text-(--app-text)">Secret</label>
          <p class="text-sm text-(--app-muted) leading-relaxed -mt-2">
            Type or paste anything at all: a passphrase, a PIN, a sentence, a crypto seed, a wallet
            mnemonic, any string. It is hashed once with Argon2id and that becomes your identity.
            The same secret always derives the same account on every device, so there is nothing to
            store, sync or export.
          </p>
          <textarea
            v-model="paste"
            rows="8"
            spellcheck="false"
            autocomplete="off"
            placeholder="e.g. the passphrase you use everywhere…"
            class="block w-full resize-y rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] font-mono text-[0.85rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-emerald-500/60 focus:bg-(--app-surface-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
          />
          <p class="text-xs text-(--app-muted) leading-relaxed">
            There is no recovery if you forget it — that is the point.
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
