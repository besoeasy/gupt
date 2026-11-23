<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { CloudOff, RefreshCw, ShieldAlert, UserRound } from "@/icons";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import LoginStepper from "@/components/welcome/LoginStepper.vue";
import WelcomeMethodStep from "@/components/welcome/WelcomeMethodStep.vue";
import WelcomePinStep from "@/components/welcome/WelcomePinStep.vue";
import WelcomeSessionStep from "@/components/welcome/WelcomeSessionStep.vue";
import { useIdentityStore } from "@/stores/identity";
import {
  formatVaultTtl,
  isSupported as canRememberDevice,
  VAULT_TTL_MS,
} from "@/lib/keyVault";
import { isLongEnoughSecret, PIN_MIN_CHARS } from "@/lib/crypto";
import { resumeTarget } from "@/router";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();

// init() is memoised, so this is free when App.vue already booted it.
onMounted(() => {
  void identity.init();
});

// No crypto.subtle outside a secure context, so plain HTTP keeps the key in
// memory and asks for the secret every load. Say so instead of silently
// behaving differently.
const remembersDevice = canRememberDevice();

const step = ref(0);
const direction = ref(1);
const method = ref(route.query.method === "file" ? "file" : "secret");
const secret = ref("");
const allowShort = ref(false);
const file = ref(null);
const pin = ref("");
const ttlMs = ref(VAULT_TTL_MS);
const busy = ref(false);
const error = ref("");
const message = ref("");

const steps = computed(() => {
  const list = [
    { key: "method", label: "Your secret" },
    { key: "pin", label: "PIN" },
  ];
  if (remembersDevice) list.push({ key: "session", label: "Session" });
  list.push({ key: "confirm", label: "Sign in" });
  return list;
});

const currentIndex = computed(() => Math.min(step.value, steps.value.length - 1));
const currentKey = computed(() => steps.value[currentIndex.value]?.key || "method");
const isLast = computed(() => currentIndex.value === steps.value.length - 1);

const secretReady = computed(() => {
  if (method.value === "file") return Boolean(file.value?.hash);
  if (allowShort.value) return secret.value.trim().length > 0;
  return isLongEnoughSecret(secret.value);
});

const pinReady = computed(() => pin.value.trim().length >= PIN_MIN_CHARS);

const stepReady = computed(() => {
  if (currentKey.value === "method") return secretReady.value;
  if (currentKey.value === "pin") return pinReady.value;
  return true;
});

const stepTitles = {
  method: "Choose how you sign in",
  pin: "Your PIN",
  session: "Stay signed in",
  confirm: "Ready when you are",
};

const methodLabel = computed(() => {
  if (method.value === "file") {
    return file.value?.name ? `Secret file — ${file.value.name}` : "Secret file";
  }
  return "Secret phrase";
});

const ttlLabel = computed(() => formatVaultTtl(ttlMs.value));

const bouncedFrom = computed(() => String(route.query.next || ""));

const heading = computed(() =>
  bouncedFrom.value ? "No account in this browser" : "Sign in to Gupt",
);

const subheading = computed(() =>
  bouncedFrom.value
    ? "Restore the account this browser had. Nothing is sent under a throwaway identity."
    : "A secret you already know, a PIN, and how long this device may remember you.",
);

const promises = [
  { icon: UserRound, text: "No email or phone number" },
  { icon: CloudOff, text: "Your secret is never uploaded" },
  { icon: RefreshCw, text: "Same secret, same account, any device" },
];

watch(
  () => route.query.method,
  (value) => {
    if (value === "file" || value === "secret") method.value = value;
  },
);

function goTo(index) {
  if (busy.value) return;
  if (index < 0 || index >= steps.value.length || index > currentIndex.value) return;
  if (index === currentIndex.value) return;
  direction.value = index > currentIndex.value ? 1 : -1;
  step.value = index;
  error.value = "";
}

function goNext() {
  if (!stepReady.value || busy.value) return;
  error.value = "";
  if (isLast.value) {
    void submit();
    return;
  }
  direction.value = 1;
  step.value = currentIndex.value + 1;
}

async function submit() {
  if (busy.value || !secretReady.value || !pinReady.value) return;
  busy.value = true;
  error.value = "";
  message.value = "";

  try {
    const secretText = method.value === "file" ? file.value.hash : secret.value;
    await identity.createFromSecret(secretText, pin.value, { ttlMs: ttlMs.value });
    secret.value = "";
    pin.value = "";
    message.value = "Identity ready. Redirecting…";
    setTimeout(() => router.replace(resumeTarget(route.query)), 350);
  } catch (e) {
    error.value = e.message || "Failed to create identity.";
    busy.value = false;
  }
}
</script>

<template>
  <div class="welcome">
    <div class="welcome__glow" aria-hidden="true" />

    <main class="welcome__main">
      <header class="welcome__header">
        <span class="welcome__brand" role="img" aria-label="GUPT">
          <svg class="welcome__brand-svg" viewBox="0 0 32 32" aria-hidden="true">
            <defs>
              <linearGradient id="welcome-accent" x1="6" x2="26" y1="6" y2="26" gradientUnits="userSpaceOnUse">
                <stop stop-color="var(--app-warning)" />
                <stop offset="1" stop-color="var(--app-accent-heart)" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="7" fill="var(--app-text)" />
            <path
              d="M16 5.5c-5.8 0-10.5 4.7-10.5 10.5s4.7 10.5 10.5 10.5c3.1 0 5.9-1.3 7.9-3.4V18.7h-4.5v-4.3h9.1v9.7C26.1 27 21.3 29 16 29c-7.2 0-13-5.8-13-13S8.8 3 16 3c3.8 0 7.2 1.6 9.7 4.1l-2.9 2.8C21 7.5 18.6 5.5 16 5.5Z"
              fill="url(#welcome-accent)"
            />
            <circle cx="23" cy="9" r="1.8" fill="var(--app-bg)" fill-opacity="0.92" />
          </svg>
        </span>
        <p class="welcome__eyebrow">Private messaging</p>
        <h1 class="welcome__title">{{ heading }}</h1>
        <p class="welcome__lede">{{ subheading }}</p>
      </header>

      <div v-if="!remembersDevice" class="welcome__http">
        <ShieldAlert class="welcome__http-icon" aria-hidden="true" />
        <p class="welcome__http-text">
          <strong>This connection is not encrypted (HTTP).</strong>
          Nothing is stored on this device, so each visit needs your secret and PIN. Serve gupt
          over HTTPS to stay signed in and to keep the page safe from tampering.
        </p>
      </div>

      <div class="welcome__flow">
        <LoginStepper
          :steps="steps"
          :current="currentIndex"
          :disabled="busy"
          @select="goTo"
        />

        <div class="welcome__card">
          <Transition
            :name="direction > 0 ? 'welcome-step-next' : 'welcome-step-prev'"
            mode="out-in"
          >
            <section :key="currentKey" class="welcome__step">
              <header class="welcome__step-head">
                <p class="welcome__step-index">
                  Step {{ currentIndex + 1 }} of {{ steps.length }}
                </p>
                <h2 class="welcome__step-title">{{ stepTitles[currentKey] }}</h2>
              </header>

              <WelcomeMethodStep
                v-if="currentKey === 'method'"
                v-model:method="method"
                v-model:secret="secret"
                v-model:file="file"
                v-model:allow-short="allowShort"
              />

              <WelcomePinStep
                v-else-if="currentKey === 'pin'"
                v-model:pin="pin"
                @next="goNext"
              />

              <WelcomeSessionStep
                v-else-if="currentKey === 'session'"
                v-model="ttlMs"
              />

              <div v-else class="welcome__summary">
                <dl class="welcome__summary-list">
                  <div class="welcome__summary-row">
                    <dt>Method</dt>
                    <dd>{{ methodLabel }}</dd>
                  </div>
                  <div class="welcome__summary-row">
                    <dt>PIN</dt>
                    <dd>{{ pin.trim().length }} characters</dd>
                  </div>
                  <div class="welcome__summary-row">
                    <dt>This device</dt>
                    <dd v-if="remembersDevice">Remembered for {{ ttlLabel }}</dd>
                    <dd v-else>Nothing stored — secret and PIN every visit</dd>
                  </div>
                </dl>
                <p class="welcome__summary-note">
                  There is no recovery if you forget your secret and PIN. That is the point.
                </p>
              </div>
            </section>
          </Transition>

          <PrimaryButton
            class="welcome__cta"
            :disabled="!stepReady"
            :loading="busy"
            @click="goNext"
          >
            {{ busy
              ? "Deriving Argon2id key in memory…"
              : isLast
                ? "Sign in"
                : "Continue" }}
          </PrimaryButton>

          <AppAlertBanner v-if="message" :message="message" variant="success" />
          <AppAlertBanner v-if="error" :message="error" />
        </div>
      </div>

      <ul class="welcome__promises">
        <li v-for="(promise, index) in promises" :key="promise.text" class="welcome__promise" :style="{ '--delay': `${140 + index * 40}ms` }">
          <component :is="promise.icon" class="welcome__promise-icon" :stroke-width="1.8" aria-hidden="true" />
          {{ promise.text }}
        </li>
      </ul>
    </main>
  </div>
</template>

<style scoped>
/* Ledger pass: the sign-in is one quiet sheet under the G-mark. */

.welcome {
  position: relative;
  min-height: 100%;
  width: 100%;
  overflow-y: auto;
  background: var(--app-bg);
  color: var(--app-text);
}

.welcome__glow {
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 480px;
  pointer-events: none;
  background-image: radial-gradient(
    58% 48% at 50% 0%,
    color-mix(in srgb, var(--app-text) 9%, transparent),
    transparent
  );
}

.welcome__main {
  position: relative;
  width: 100%;
  max-width: 33rem;
  margin-inline: auto;
  padding: var(--app-space-8) var(--app-space-4) var(--app-space-8);
}

/* ---- Hero ---- */

.welcome__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  animation: ledger-rise 460ms var(--app-ease-emphasized) both;
}

.welcome__brand {
  display: inline-flex;
  width: 38px;
  height: 38px;
  margin-bottom: var(--app-space-3);
  border-radius: 9px;
  overflow: hidden;
}

.welcome__brand-svg {
  width: 100%;
  height: 100%;
}

.welcome__eyebrow {
  margin: 0 0 6px;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.welcome__title {
  margin: 0;
  font-size: clamp(1.6rem, 6vw, 2rem);
  font-weight: 600;
  line-height: 1.12;
  letter-spacing: var(--app-tracking-display);
  color: var(--app-text);
}

.welcome__lede {
  max-width: 30rem;
  margin: 10px 0 0;
  font-size: var(--app-text-meta);
  line-height: 1.65;
  color: var(--app-muted);
}

/* ---- HTTP warning ---- */

.welcome__http {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 30rem;
  margin: var(--app-space-4) auto 0;
  padding: 11px 12px;
  border: 1px solid color-mix(in oklab, var(--app-warning) 30%, var(--app-border));
  border-radius: var(--app-radius-sm);
  background: var(--app-warning-soft);
  font-size: 10.5px;
  line-height: 1.6;
  animation: ledger-fade 320ms var(--app-ease-standard) 80ms both;
}

.welcome__http-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-top: 1px;
  color: var(--app-warning);
}

.welcome__http-text {
  margin: 0;
  color: var(--app-text-soft);
}

.welcome__http-text strong {
  font-weight: 500;
  color: var(--app-warning);
}

/* ---- Flow ---- */

.welcome__flow {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  margin-top: var(--app-space-6);
}

.welcome__card {
  display: flex;
  flex-direction: column;
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  box-shadow: none;
  animation: ledger-rise 460ms var(--app-ease-emphasized) 70ms both;
}

.welcome__step {
  min-height: 15rem;
}

.welcome__step-head {
  margin-bottom: var(--app-space-4);
  padding-bottom: var(--app-space-3);
  border-bottom: 1px solid var(--app-border);
}

.welcome__step-index {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.welcome__step-title {
  margin: 4px 0 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

/* ---- Summary ---- */

.welcome__summary {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.welcome__summary-list {
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--app-border);
}

.welcome__summary-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--app-space-4);
  padding: 11px 0;
  border-bottom: 1px solid var(--app-border);
}

.welcome__summary-row dt {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.welcome__summary-row dd {
  min-width: 0;
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  text-align: right;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.welcome__summary-note {
  margin: 0;
  padding: 9px 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--app-muted);
}

.welcome__cta {
  margin-top: var(--app-space-5);
}

/* ---- Promises ---- */

.welcome__promises {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: var(--app-space-5) 0 0;
  padding: 0;
  list-style: none;
}

.welcome__promise {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--app-surface);
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
  animation: ledger-fade 360ms var(--app-ease-standard) var(--delay, 0ms) both;
}

.welcome__promise-icon {
  width: 11px;
  height: 11px;
  color: var(--app-muted-2);
}

/* Forward and back step transitions: the outgoing step leaves the way the
   user came from, so the flow reads as a horizontal track. */
.welcome-step-next-enter-active,
.welcome-step-prev-enter-active {
  transition:
    opacity var(--app-dur-fast) var(--app-ease-standard),
    transform 260ms var(--app-ease-emphasized);
}

.welcome-step-next-leave-active,
.welcome-step-prev-leave-active {
  transition:
    opacity var(--app-dur-fast) var(--app-ease-standard),
    transform 180ms var(--app-ease-standard);
}

.welcome-step-next-enter-from {
  opacity: 0;
  transform: translateX(22px);
}

.welcome-step-next-leave-to {
  opacity: 0;
  transform: translateX(-14px);
}

.welcome-step-prev-enter-from {
  opacity: 0;
  transform: translateX(-22px);
}

.welcome-step-prev-leave-to {
  opacity: 0;
  transform: translateX(14px);
}

@media (min-width: 40rem) {
  .welcome__main {
    padding-top: var(--app-space-8);
    padding-inline: var(--app-space-6);
  }

  .welcome__card {
    padding: var(--app-space-6);
  }

  .welcome__brand {
    width: 42px;
    height: 42px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome__header,
  .welcome__http,
  .welcome__card,
  .welcome__promise,
  .welcome-step-next-enter-active,
  .welcome-step-next-leave-active,
  .welcome-step-prev-enter-active,
  .welcome-step-prev-leave-active {
    animation: none;
    transition: none;
  }
}
</style>
