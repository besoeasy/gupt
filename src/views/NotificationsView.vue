<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowRight, Bell, Check, Copy, Globe, Smartphone } from "lucide-vue-next";

import { copyToClipboard } from "@/lib/clipboard";
import { dismissNtfyOnboarding, NTFY_LINKS } from "@/lib/ntfyOnboarding";
import { useIdentityStore } from "@/stores/identity";

const router = useRouter();
const identity = useIdentityStore();
const pubKeyCopied = ref(false);
const currentStep = ref(1);

const platforms = [
  {
    id: "ios",
    name: "iPhone & iPad",
    store: "App Store",
    href: NTFY_LINKS.ios,
    accent: "from-sky-500/20 to-blue-600/10",
    icon: Smartphone,
  },
  {
    id: "android",
    name: "Android",
    store: "Google Play",
    href: NTFY_LINKS.android,
    accent: "from-emerald-500/20 to-green-600/10",
    icon: Smartphone,
  },
  {
    id: "web",
    name: "Web browser",
    store: "ntfy.sh",
    href: NTFY_LINKS.website,
    accent: "from-violet-500/20 to-purple-600/10",
    icon: Globe,
  },
];

async function copyPubKey() {
  if (!identity.pubkeyHex) return;
  await copyToClipboard(identity.pubkeyHex);
  pubKeyCopied.value = true;
  setTimeout(() => {
    pubKeyCopied.value = false;
  }, 2000);
}

function nextStep() {
  currentStep.value++;
}

function prevStep() {
  currentStep.value--;
}

function continueToApp() {
  dismissNtfyOnboarding();
  if (router.currentRoute.value.path === "/notifications") {
    void router.push("/");
  }
}
</script>

<template>
  <main
    class="min-h-dvh flex flex-col justify-center overflow-y-auto bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(16,185,129,0.14),transparent)]"
  >
    <div class="app-page-shell mx-auto w-full max-w-xl px-4 py-8 sm:px-6 lg:px-8">
      <div class="space-y-8">
        <!-- Hero -->
        <header class="text-center">
          <div
            class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20"
          >
            <Bell class="h-8 w-8" :stroke-width="1.8" />
          </div>

          <h1 class="text-3xl font-black tracking-tight sm:text-4xl">Offline Notifications</h1>
        </header>

        <!-- Progress Indicator -->
        <div class="mb-8 flex items-center justify-center gap-2 px-8">
          <div class="h-1.5 flex-1 rounded-full bg-emerald-500 transition-all duration-300"></div>
          <div
            :class="[
              'h-1.5 flex-1 rounded-full transition-all duration-300',
              currentStep >= 2 ? 'bg-emerald-500' : 'bg-emerald-500/20',
            ]"
          ></div>
        </div>

        <section class="ui-panel relative overflow-hidden rounded-3xl p-6 sm:p-8">
          <!-- Step 1 -->
          <div
            v-if="currentStep === 1"
            class="animate-in fade-in slide-in-from-right-4 duration-300"
          >
            <h2 class="mb-2 text-2xl font-bold">1. Get the App</h2>
            <p class="mb-6 text-sm leading-relaxed text-zinc-400">
              To keep your chats truly private, Gupt avoids standard push notifications that can
              track you.
              <br /><br />
              Instead, we use a secure, open-source app called <strong>ntfy</strong> to safely ping
              your phone when you get a message.
            </p>

            <div class="mb-8 grid gap-3 sm:grid-cols-3">
              <a
                v-for="platform in platforms"
                :key="platform.id"
                :href="platform.href"
                target="_blank"
                rel="noopener noreferrer"
                class="group flex flex-col items-center rounded-2xl border border-white/10 bg-white/5 p-4 text-center transition-all hover:border-emerald-500/30 hover:bg-white/8"
              >
                <component
                  :is="platform.icon"
                  class="mb-2 h-6 w-6 text-emerald-400"
                  :stroke-width="1.8"
                />
                <span class="text-sm font-bold text-zinc-100">{{ platform.name }}</span>
                <span class="text-xs text-zinc-500">{{ platform.store }}</span>
              </a>
            </div>

            <button
              type="button"
              class="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-(--app-primary) px-6 py-3.5 font-bold text-white transition hover:bg-(--app-primary-strong)"
              @click="nextStep"
            >
              I have the app
              <ArrowRight class="h-5 w-5" :stroke-width="2.5" />
            </button>
            <div class="mt-4 text-center">
              <button
                type="button"
                @click="continueToApp"
                class="text-sm text-zinc-500 hover:text-zinc-300 transition"
              >
                Skip for now
              </button>
            </div>
          </div>

          <!-- Step 2 -->
          <div
            v-if="currentStep === 2"
            class="animate-in fade-in slide-in-from-right-4 duration-300"
          >
            <h2 class="mb-2 text-2xl font-bold">2. Subscribe</h2>
            <p class="mb-6 text-sm text-zinc-400">
              Open the ntfy app, tap <strong>Subscribe to topic</strong>, and paste your unique
              secure key:
            </p>

            <div class="mb-6 rounded-2xl border border-emerald-500/15 bg-black/40 p-5">
              <code
                class="block break-all text-center font-mono text-sm leading-relaxed text-emerald-400"
              >
                {{ identity.pubkeyHex || "Sign in to view your public key" }}
              </code>
            </div>

            <div class="flex flex-col gap-3">
              <button
                v-if="identity.pubkeyHex"
                type="button"
                class="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-zinc-800 px-6 py-3.5 font-bold text-white transition hover:bg-zinc-700"
                @click="copyPubKey"
              >
                <Check v-if="pubKeyCopied" class="h-5 w-5 text-emerald-400" />
                <Copy v-else class="h-5 w-5" />
                {{ pubKeyCopied ? "Copied to clipboard!" : "Copy Secure Key" }}
              </button>

              <button
                type="button"
                class="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-(--app-primary) px-6 py-3.5 font-bold text-white transition hover:bg-(--app-primary-strong)"
                @click="continueToApp"
              >
                Finish Setup
                <Check class="h-5 w-5" :stroke-width="2.5" />
              </button>
            </div>

            <button
              type="button"
              class="mt-6 w-full text-center text-sm text-zinc-500 transition hover:text-zinc-300"
              @click="prevStep"
            >
              Back
            </button>
          </div>
        </section>

        <p class="px-4 text-center text-xs leading-relaxed text-zinc-600">
          Gupt messages are end-to-end encrypted and routed through Nostr relays. We avoid
          traditional push notifications to protect your privacy.
        </p>
      </div>
    </div>
  </main>
</template>
