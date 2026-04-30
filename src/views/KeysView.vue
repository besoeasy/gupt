<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Check, Copy, Eye, EyeOff, KeyRound } from "lucide-vue-next";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { npubFromPubkey } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";

const identity = useIdentityStore();
const router = useRouter();

const message = ref("");
const error = ref("");

const npub = computed(() => npubFromPubkey(identity.pubkeyHex) || "");

const npubCopied = ref(false);
async function copyNpub() {
  if (!npub.value) return;
  await navigator.clipboard.writeText(npub.value);
  npubCopied.value = true;
  setTimeout(() => (npubCopied.value = false), 2000);
}

const copied = ref(false);
async function copyPubkey() {
  await navigator.clipboard.writeText(identity.pubkeyHex);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

const showPrivkey = ref(false);
const privkeyCopied = ref(false);
async function copyPrivkey() {
  await navigator.clipboard.writeText(identity.privkeyHex);
  privkeyCopied.value = true;
  setTimeout(() => (privkeyCopied.value = false), 2000);
}

const rawKey = ref("");
const restoreBusy = ref(false);
const canRestoreKey = computed(() => rawKey.value.trim().length > 0 && !restoreBusy.value);
async function loadFromKey() {
  error.value = "";
  message.value = "";
  restoreBusy.value = true;
  try {
    await identity.restorePrivateKey(rawKey.value.trim());
    rawKey.value = "";
    message.value = "Identity restored. Redirecting…";
    setTimeout(() => router.replace("/"), 350);
  } catch (e) {
    error.value = e.message || "Failed to restore identity.";
  } finally {
    restoreBusy.value = false;
  }
}

const passphrase = ref("");
const pin = ref("");
const busy = ref(false);
const passphraseOk = computed(() => passphrase.value.length >= 8);
const canSubmit = computed(() => passphraseOk.value && pin.value.trim().length > 0 && !busy.value);
async function loadAccount() {
  error.value = "";
  message.value = "";
  busy.value = true;
  try {
    await identity.deriveIdentity(passphrase.value, pin.value);
    passphrase.value = "";
    pin.value = "";
    message.value = "Identity loaded. Redirecting…";
    setTimeout(() => router.replace("/"), 350);
  } catch (e) {
    error.value = e.message || "Failed to derive identity.";
  } finally {
    busy.value = false;
  }
}

onMounted(() => identity.init());
</script>

<template>
  <div class="min-h-screen text-white">
    <main class="app-page-shell mx-auto px-4 py-6 lg:px-8">
      <div class="max-w-2xl mx-auto space-y-5">
        <h1 class="text-2xl font-bold tracking-tight">Keys & Account</h1>

        <!-- Nostr npub -->
        <div v-if="npub" class="ui-panel rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-semibold text-zinc-300">Nostr npub</p>
              <p class="mt-0.5 text-[11px] text-zinc-500">Share your Nostr identity.</p>
            </div>
            <button
              @click="copyNpub"
              class="ui-icon-button flex items-center gap-1 text-xs px-3 py-1 rounded-full transition-colors"
              :class="npubCopied ? 'text-emerald-400' : 'text-zinc-400'"
            >
              <Copy v-if="!npubCopied" class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />
              <Check v-else class="w-3.5 h-3.5" :stroke-width="2.5" aria-hidden="true" />
              {{ npubCopied ? "Copied!" : "Copy" }}
            </button>
          </div>
          <p class="text-xs font-mono text-zinc-400 break-all leading-relaxed select-all">
            {{ npub }}
          </p>
        </div>

        <!-- Raw Public Key -->
        <div v-if="identity.pubkeyHex" class="ui-panel rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold text-zinc-300">Raw public key</p>
            <button
              @click="copyPubkey"
              class="ui-icon-button flex items-center gap-1 text-xs px-3 py-1 rounded-full transition-colors"
              :class="copied ? 'text-emerald-400' : 'text-zinc-400'"
            >
              <Copy v-if="!copied" class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />
              <Check v-else class="w-3.5 h-3.5" :stroke-width="2.5" aria-hidden="true" />
              {{ copied ? "Copied!" : "Copy" }}
            </button>
          </div>
          <p class="text-xs font-mono text-zinc-400 break-all leading-relaxed">
            {{ identity.pubkeyHex }}
          </p>
        </div>

        <!-- Private Key -->
        <div v-if="identity.privkeyHex" class="ui-panel rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold text-zinc-300">Private Key</p>
            <button
              @click="showPrivkey = !showPrivkey"
              class="ui-icon-button inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full transition-colors"
            >
              <Eye v-if="!showPrivkey" class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />
              <EyeOff v-else class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />
              {{ showPrivkey ? "Hide" : "Reveal" }}
            </button>
          </div>

          <div v-if="showPrivkey" class="space-y-2">
            <div class="ui-surface px-3 py-2 rounded-xl">
              <p class="text-[11px] font-mono text-amber-300 break-all leading-relaxed select-all">
                {{ identity.privkeyHex }}
              </p>
            </div>
            <p class="text-[11px] text-red-400/80">
              Never share this. Anyone with this key controls your account.
            </p>
          </div>

          <button
            @click="copyPrivkey"
            class="ui-icon-button w-full inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-xs font-semibold transition-colors"
            :class="
              privkeyCopied
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'text-zinc-300 hover:bg-white/7 hover:text-white'
            "
          >
            <KeyRound
              v-if="!privkeyCopied"
              class="w-3.5 h-3.5"
              :stroke-width="2"
              aria-hidden="true"
            />
            <Check v-else class="w-3.5 h-3.5" :stroke-width="2.5" aria-hidden="true" />
            {{ privkeyCopied ? "Copied!" : "Copy private key" }}
          </button>
        </div>

        <!-- Restore -->
        <p class="text-xs font-semibold text-zinc-500">Restore account</p>

        <!-- From key -->
        <div class="ui-panel rounded-2xl p-4 space-y-3">
          <p class="text-xs font-semibold text-zinc-300">Paste private key or backup file</p>
          <textarea
            v-model="rawKey"
            rows="3"
            placeholder="Paste your 64-character hex private key or backup JSON here…"
            autocomplete="off"
            spellcheck="false"
            class="chat-input-modern w-full rounded-2xl px-4 py-2.5 text-sm font-mono placeholder-zinc-500 focus:outline-none resize-none leading-relaxed transition-colors"
          />
          <PrimaryButton @click="loadFromKey" :disabled="!canRestoreKey" :loading="restoreBusy">
            {{ restoreBusy ? "Restoring…" : "Restore from key" }}
          </PrimaryButton>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex-1 h-px bg-white/8" />
          <span class="text-xs text-zinc-500">or</span>
          <div class="flex-1 h-px bg-white/8" />
        </div>

        <!-- From passphrase -->
        <div class="ui-panel rounded-2xl p-4 space-y-3">
          <p class="text-xs font-semibold text-zinc-300">Derive from passphrase + PIN</p>
          <p class="text-[11px] text-zinc-500">
            Same passphrase + PIN always unlocks the same account.
          </p>

          <div class="space-y-1.5">
            <input
              v-model="passphrase"
              type="password"
              placeholder="Passphrase (min 8 characters)"
              autocomplete="new-password"
              class="chat-input-modern w-full rounded-2xl px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none transition-colors"
            />
            <p v-if="passphrase.length > 0 && !passphraseOk" class="text-xs text-red-400 px-1">
              At least 8 characters required ({{ passphrase.length }}/8)
            </p>
          </div>

          <input
            v-model="pin"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            placeholder="PIN (numeric, e.g. 2847)"
            autocomplete="off"
            class="chat-input-modern w-full rounded-2xl px-4 py-2.5 text-sm font-mono placeholder-zinc-500 tracking-widest focus:outline-none transition-colors"
            @keydown.enter="canSubmit && loadAccount()"
          />

          <PrimaryButton @click="loadAccount" :disabled="!canSubmit" :loading="busy">
            {{ busy ? "Loading…" : "Load Account" }}
          </PrimaryButton>
          <p class="text-[11px] text-zinc-500 leading-relaxed">
            Key derivation uses Argon2id — the same passphrase + PIN always restores the same
            account.
          </p>
        </div>

        <AppAlertBanner v-if="message" :message="message" variant="success" />
        <AppAlertBanner v-if="error" :message="error" />
      </div>
    </main>
  </div>
</template>
