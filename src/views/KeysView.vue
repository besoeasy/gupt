<script setup>
import { computed, onMounted, ref } from 'vue'
import { Check, Copy, Eye, EyeOff, KeyRound } from 'lucide-vue-next'
import AppAlertBanner from '@/components/AppAlertBanner.vue'
import PrimaryButton from '@/components/PrimaryButton.vue'
import { npubFromPubkey } from '@/lib/crypto'
import { useIdentityStore } from '@/stores/identity'

const identity = useIdentityStore()

const message = ref('')
const error = ref('')

const npub = computed(() => npubFromPubkey(identity.pubkeyHex) || '')

// ── npub copy ─────────────────────────────────────────────────
const npubCopied = ref(false)
async function copyNpub() {
  if (!npub.value) return
  await navigator.clipboard.writeText(npub.value)
  npubCopied.value = true
  setTimeout(() => (npubCopied.value = false), 2000)
}

// ── pubkey copy ───────────────────────────────────────────────
const copied = ref(false)
async function copyPubkey() {
  await navigator.clipboard.writeText(identity.pubkeyHex)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

// ── private key reveal ────────────────────────────────────────
const showPrivkey = ref(false)
const privkeyCopied = ref(false)
async function copyPrivkey() {
  await navigator.clipboard.writeText(identity.privkeyHex)
  privkeyCopied.value = true
  setTimeout(() => (privkeyCopied.value = false), 2000)
}

// ── restore from raw private key ──────────────────────────────
const rawKey = ref('')
const restoreBusy = ref(false)
const canRestoreKey = computed(() => rawKey.value.trim().length > 0 && !restoreBusy.value)
async function loadFromKey() {
  error.value = ''
  message.value = ''
  restoreBusy.value = true
  try {
    await identity.restorePrivateKey(rawKey.value.trim())
    rawKey.value = ''
    message.value = 'Identity restored. Redirecting…'
    setTimeout(() => window.location.assign('/'), 350)
  } catch (e) {
    error.value = e.message || 'Failed to restore identity.'
  } finally {
    restoreBusy.value = false
  }
}

// ── restore from passphrase + PIN ─────────────────────────────
const passphrase = ref('')
const pin = ref('')
const busy = ref(false)
const passphraseOk = computed(() => passphrase.value.length >= 8)
const canSubmit = computed(() => passphraseOk.value && pin.value.trim().length > 0 && !busy.value)
async function loadAccount() {
  error.value = ''
  message.value = ''
  busy.value = true
  try {
    await identity.deriveIdentity(passphrase.value, pin.value)
    passphrase.value = ''
    pin.value = ''
    message.value = 'Identity loaded. Redirecting…'
    setTimeout(() => window.location.assign('/'), 350)
  } catch (e) {
    error.value = e.message || 'Failed to derive identity.'
  } finally {
    busy.value = false
  }
}

onMounted(() => identity.init())
</script>

<template>
  <div class="min-h-screen bg-black text-white flex flex-col">
    <main class="app-page-shell mx-auto px-4 py-8 space-y-6">
      <p class="text-base font-bold">Keys &amp; Account</p>

      <!-- ── Nostr npub ──────────────────────────────────────── -->
      <div
        v-if="npub"
        class="bg-white border border-cyan-300/35 rounded-2xl px-4 py-4 space-y-3 text-zinc-950 transition-colors duration-200 hover:border-cyan-400/60"
      >
        <div class="flex items-center justify-between gap-3">
          <div>
            <span class="text-xs font-semibold text-cyan-800 tracking-wide uppercase"
              >Nostr npub</span
            >
            <p class="mt-1 text-[11px] text-zinc-600">Use this to share your Nostr identity.</p>
          </div>
          <button
            @click="copyNpub"
            class="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 active:scale-95 transition-all duration-150"
            :class="npubCopied ? 'text-emerald-300' : 'text-white'"
          >
            <Copy v-if="!npubCopied" class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />
            <Check v-else class="w-3.5 h-3.5" :stroke-width="2.5" aria-hidden="true" />
            {{ npubCopied ? 'Copied!' : 'Copy npub' }}
          </button>
        </div>
        <p class="text-[12px] font-mono text-zinc-800 break-all leading-relaxed select-all">
          {{ npub }}
        </p>
      </div>

      <!-- ── Raw Public Key ─────────────────────────────────── -->
      <div
        v-if="identity.pubkeyHex"
        class="bg-zinc-900 border border-white/8 rounded-2xl px-4 py-4 space-y-3 transition-colors duration-200 hover:border-white/20"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-zinc-300 tracking-wide uppercase"
            >Raw public key</span
          >
          <button
            @click="copyPubkey"
            class="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all duration-150"
            :class="copied ? 'text-emerald-400' : 'text-zinc-400'"
          >
            <Copy v-if="!copied" class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />
            <Check v-else class="w-3.5 h-3.5" :stroke-width="2.5" aria-hidden="true" />
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
        <p class="text-[11px] font-mono text-zinc-500 break-all leading-relaxed">
          {{ identity.pubkeyHex }}
        </p>
        <p class="text-[11px] text-zinc-600">
          Hex form for advanced use, debugging, and low-level interoperability.
        </p>
      </div>

      <!-- ── Backup Private Key ─────────────────────────────── -->
      <div
        v-if="identity.privkeyHex"
        class="bg-zinc-900 border border-white/8 rounded-2xl px-4 py-4 space-y-3 transition-colors duration-200 hover:border-white/20"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-zinc-300 tracking-wide uppercase"
            >Private Key</span
          >
          <button
            @click="showPrivkey = !showPrivkey"
            class="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-400 transition-all duration-150"
          >
            <Eye v-if="!showPrivkey" class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />
            <EyeOff v-else class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />
            {{ showPrivkey ? 'Hide' : 'Reveal' }}
          </button>
        </div>

        <div v-if="showPrivkey" class="space-y-2">
          <div class="px-3 py-2 bg-zinc-800 rounded-xl">
            <p class="text-[11px] font-mono text-amber-300 break-all leading-relaxed select-all">
              {{ identity.privkeyHex }}
            </p>
          </div>
          <p class="text-[11px] text-red-400/80">
            Never share this with anyone. Anyone with this key controls your account.
          </p>
        </div>

        <button
          @click="copyPrivkey"
          class="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold active:scale-[0.98] transition-all duration-150"
          :class="
            privkeyCopied
              ? 'bg-emerald-900/50 text-emerald-300'
              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
          "
        >
          <KeyRound
            v-if="!privkeyCopied"
            class="w-3.5 h-3.5"
            :stroke-width="2"
            aria-hidden="true"
          />
          <Check v-else class="w-3.5 h-3.5" :stroke-width="2.5" aria-hidden="true" />
          {{ privkeyCopied ? 'Copied!' : 'Copy private key' }}
        </button>
      </div>

      <!-- ── Restore Account ────────────────────────────────── -->
      <p class="text-xs font-semibold text-zinc-500 tracking-wide uppercase">Restore account</p>

      <!-- Option 1 -->
      <div
        class="bg-zinc-900 border border-white/8 rounded-2xl px-4 py-4 space-y-3 transition-colors duration-200 hover:border-white/20"
      >
        <p class="text-xs font-semibold text-zinc-300">Paste private key or backup file</p>
        <textarea
          v-model="rawKey"
          rows="3"
          placeholder="Paste your 64-character hex private key or backup JSON here…"
          autocomplete="off"
          spellcheck="false"
          class="w-full bg-zinc-800 border border-white/8 rounded-xl px-3 py-2.5 text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-white/20 resize-none leading-relaxed transition-colors duration-150"
        />
        <PrimaryButton @click="loadFromKey" :disabled="!canRestoreKey" :loading="restoreBusy">
          {{ restoreBusy ? 'Restoring…' : 'Restore from key' }}
        </PrimaryButton>
      </div>

      <!-- Divider -->
      <div class="flex items-center gap-3">
        <div class="flex-1 h-px bg-white/8" />
        <span class="text-xs text-zinc-600">or</span>
        <div class="flex-1 h-px bg-white/8" />
      </div>

      <!-- Option 2 -->
      <div
        class="bg-zinc-900 border border-white/8 rounded-2xl px-4 py-4 space-y-3 transition-colors duration-200 hover:border-white/20"
      >
        <p class="text-xs font-semibold text-zinc-300">Derive from passphrase + PIN</p>
        <p class="text-[11px] text-zinc-500">
          Same passphrase + PIN always unlocks the same account.
        </p>

        <div class="space-y-1">
          <input
            v-model="passphrase"
            type="password"
            placeholder="Passphrase (min 8 characters)"
            autocomplete="new-password"
            class="w-full bg-zinc-800 border rounded-xl px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:border-white/20 transition-all duration-150"
            :class="passphrase.length > 0 && !passphraseOk ? 'border-red-800' : 'border-white/8'"
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
          class="w-full bg-zinc-800 border border-white/8 rounded-xl px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:border-white/20 font-mono tracking-widest transition-all duration-150"
          @keydown.enter="canSubmit && loadAccount()"
        />

        <PrimaryButton @click="loadAccount" :disabled="!canSubmit" :loading="busy">
          {{ busy ? 'Loading…' : 'Load Account' }}
        </PrimaryButton>

        <p class="text-[11px] text-zinc-600 leading-relaxed">
          Key derivation uses Argon2id — the same passphrase + PIN always restores the same account.
        </p>
      </div>

      <!-- Notices -->
      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />
    </main>
  </div>
</template>
