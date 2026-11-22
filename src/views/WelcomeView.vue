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
.welcome {
  position: relative;
  min-height: 100%;
  width: 100%;
  overflow-y: auto;
  background-color: var(--app-bg);
  color: var(--app-text);
}

.welcome__glow {
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 560px;
  pointer-events: none;
  background-image: radial-gradient(
    60% 50% at 50% 0%,
    color-mix(in srgb, var(--app-text) 9%, transparent),
    transparent
  );
}

.welcome__main {
  position: relative;
  width: 100%;
  max-width: 34rem;
  margin-inline: auto;
  padding: 2.5rem 1rem 6rem;
}

.welcome__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  animation: welcome-in 0.4s ease both;
}

.welcome__title {
  margin: 0;
  font-size: 1.85rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: var(--app-text);
}

.welcome__lede {
  max-width: 28rem;
  margin: 0.75rem 0 0;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--app-muted);
}

.welcome__http {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  max-width: 28rem;
  margin: 1.5rem auto 0;
  padding: 0.85rem 1rem;
  border: 1px solid color-mix(in srgb, var(--app-warning, #f59e0b) 30%, transparent);
  border-radius: var(--radius-xl);
  background-color: var(--app-warning-soft, color-mix(in srgb, var(--app-warning, #f59e0b) 10%, transparent));
  font-size: 0.72rem;
  line-height: 1.55;
}

.welcome__http-icon {
  width: 16px;
  height: 16px;
  margin-top: 0.1rem;
  flex-shrink: 0;
  color: var(--app-warning, #f59e0b);
}

.welcome__http-text {
  margin: 0;
  color: var(--app-text);
}

.welcome__flow {
  display: flex;
  flex-direction: column;
  gap: 1.35rem;
  margin-top: 2rem;
}

.welcome__card {
  padding: 1.25rem;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-2xl);
  background-color: var(--app-surface);
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 12%), 0 1px 2px -1px rgb(0 0 0 / 12%);
  animation: welcome-in 0.45s 60ms ease both;
}

.welcome__step {
  min-height: 15rem;
}

.welcome__step-head {
  margin-bottom: 1rem;
}

.welcome__step-index {
  margin: 0;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--app-muted);
}

.welcome__step-title {
  margin: 0.3rem 0 0;
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--app-text);
}

.welcome__summary {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.welcome__summary-list {
  margin: 0;
  padding: 0.25rem 0;
  border-top: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
}

.welcome__summary-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 0;
}

.welcome__summary-row + .welcome__summary-row {
  border-top: 1px solid var(--app-border);
}

.welcome__summary-row dt {
  flex-shrink: 0;
  font-size: 0.72rem;
  color: var(--app-muted);
}

.welcome__summary-row dd {
  margin: 0;
  min-width: 0;
  text-align: right;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.welcome__summary-note {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.5;
  color: var(--app-muted);
}

.welcome__cta {
  margin-top: 1.35rem;
}

.welcome__promises {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 2rem 0 0;
  padding: 0;
  list-style: none;
}

.welcome__promise {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background-color: var(--app-surface-soft);
  font-size: 11px;
  color: var(--app-muted);
  animation: welcome-in 0.4s var(--delay, 0ms) ease both;
}

.welcome__promise-icon {
  width: 14px;
  height: 14px;
  color: var(--app-muted-2);
}

/* Forward and back step transitions: the outgoing step leaves the way the
   user came from, so the flow reads as a horizontal track. */
.welcome-step-next-enter-active,
.welcome-step-prev-enter-active {
  transition:
    opacity 0.22s ease,
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.welcome-step-next-leave-active,
.welcome-step-prev-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.2s ease;
}

.welcome-step-next-enter-from {
  opacity: 0;
  transform: translateX(26px);
}

.welcome-step-next-leave-to {
  opacity: 0;
  transform: translateX(-18px);
}

.welcome-step-prev-enter-from {
  opacity: 0;
  transform: translateX(-26px);
}

.welcome-step-prev-leave-to {
  opacity: 0;
  transform: translateX(18px);
}

@keyframes welcome-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

[data-theme="light"] .welcome__card {
  box-shadow: 0 1px 2px rgb(15 23 42 / 8%), 0 1px 3px rgb(15 23 42 / 6%);
}

[data-theme="light"] .welcome__http {
  background-color: var(--app-warning-soft, #fef3c7);
}

[data-theme="light"] .welcome__http-text {
  color: var(--app-text);
}

@media (min-width: 40rem) {
  .welcome__main {
    padding-top: 3.5rem;
  }

  .welcome__card {
    padding: 1.75rem;
  }

  .welcome__title {
    font-size: 2.15rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome__header,
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
