<script setup>
import { ref, computed } from "vue";
import { Lock, Eye, EyeOff, KeyRound, AlertTriangle, ShieldCheck } from "@lucide/vue";
import { useIdentityStore } from "@/stores/identity";
import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { shortId } from "@/lib/crypto";

const identity = useIdentityStore();

const passphrase = ref("");
const pin = ref("");
const showPassphrase = ref(false);
const error = ref("");
const busy = ref(false);

const canUnlock = computed(
  () => passphrase.value.length >= 8 && pin.value.trim().length > 0 && !busy.value
);

async function handleUnlock() {
  if (!canUnlock.value) return;
  error.value = "";
  busy.value = true;
  try {
    await identity.deriveIdentity(passphrase.value, pin.value);
    passphrase.value = "";
    pin.value = "";
  } catch (err) {
    error.value = err.message || "Failed to unlock account. Check your Password and PIN.";
  } finally {
    busy.value = false;
  }
}

function handleSwitchToGuest() {
  if (confirm("Switch to a temporary guest session? Your account will remain saved on this device for next time.")) {
    identity.startGuestSession();
  }
}

function handleResetAccount() {
  if (confirm("Remove saved account marker from this device and start a fresh session? Make sure you know your Password & PIN to log back in later!")) {
    identity.resetAccount();
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-none"
  >
    <div
      class="w-full max-w-md space-y-6 rounded-3xl border border-(--app-border) bg-(--app-surface) p-6 shadow-2xl sm:p-8"
    >
      <!-- Header -->
      <div class="flex flex-col items-center text-center space-y-3">
        <RoboAvatar :pubkey="identity.accountPubkey || identity.pubkeyHex" size="hero" />
        <div class="space-y-1">
          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-primary)">
            Account Locked
          </p>
          <h2 class="text-2xl font-bold tracking-tight text-(--app-text)">Welcome Back</h2>
          <p class="text-xs text-(--app-muted)">
            Enter your Password and PIN to derive your private key into memory.
          </p>
        </div>

        <div
          v-if="identity.accountPubkey"
          class="inline-flex items-center gap-1.5 rounded-full border border-(--app-border) bg-(--app-surface-soft) px-3 py-1 text-[11px] font-mono text-(--app-muted)"
        >
          <ShieldCheck class="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span>{{ shortId(identity.accountPubkey) }}</span>
        </div>
      </div>

      <!-- Error alert -->
      <div
        v-if="error"
        class="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400"
      >
        <AlertTriangle class="h-4 w-4 shrink-0" />
        <span>{{ error }}</span>
      </div>

      <!-- Form -->
      <form class="space-y-4" @submit.prevent="handleUnlock">
        <!-- Passphrase -->
        <div>
          <label class="mb-1.5 block text-xs font-semibold text-(--app-text)">Password</label>
          <div class="relative">
            <input
              v-model="passphrase"
              :type="showPassphrase ? 'text' : 'password'"
              placeholder="At least 8 characters"
              class="block w-full rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3 pr-10 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none"
              autocomplete="current-password"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-(--app-muted) hover:text-(--app-text)"
              @click="showPassphrase = !showPassphrase"
            >
              <EyeOff v-if="showPassphrase" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- PIN -->
        <div>
          <label class="mb-1.5 block text-xs font-semibold text-(--app-text)">Numeric PIN</label>
          <input
            v-model="pin"
            type="password"
            inputmode="numeric"
            placeholder="e.g. 1234"
            class="block w-full rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3 text-sm font-mono text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none"
            autocomplete="off"
          />
        </div>

        <!-- Unlock Button -->
        <PrimaryButton type="submit" :loading="busy" :disabled="!canUnlock" class="w-full">
          <Lock class="h-4 w-4" />
          {{ busy ? "Deriving Key (Argon2id)…" : "Unlock Account" }}
        </PrimaryButton>
      </form>

      <!-- Guest / Reset Fallbacks -->
      <div class="border-t border-(--app-border) pt-4 flex flex-col items-center gap-2 text-center text-xs">
        <button
          type="button"
          class="text-(--app-muted) hover:text-(--app-text) transition-colors underline"
          @click="handleSwitchToGuest"
        >
          Use temporary guest session instead
        </button>

        <button
          type="button"
          class="text-rose-400/80 hover:text-rose-400 transition-colors"
          @click="handleResetAccount"
        >
          Reset / Switch saved account on this device
        </button>
      </div>
    </div>
  </div>
</template>
