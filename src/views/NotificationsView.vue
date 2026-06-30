<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowLeft,
  Bell,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Smartphone,
} from "lucide-vue-next";

import PrimaryButton from "@/components/PrimaryButton.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { dismissNtfyOnboarding, NTFY_LINKS } from "@/lib/ntfyOnboarding";
import { useIdentityStore } from "@/stores/identity";

const router = useRouter();
const identity = useIdentityStore();
const pubKeyCopied = ref(false);

const platforms = [
  {
    id: "ios",
    name: "iPhone & iPad",
    store: "App Store",
    href: NTFY_LINKS.ios,
    icon: Smartphone,
  },
  {
    id: "android",
    name: "Android",
    store: "Google Play",
    href: NTFY_LINKS.android,
    icon: Smartphone,
  },
  {
    id: "web",
    name: "Web browser",
    store: "ntfy.sh",
    href: NTFY_LINKS.website,
    icon: Globe,
  },
];

onMounted(() => {
  void identity.init();
});

async function copyPubKey() {
  if (!identity.pubkeyHex) return;
  await copyToClipboard(identity.pubkeyHex);
  pubKeyCopied.value = true;
  setTimeout(() => {
    pubKeyCopied.value = false;
  }, 2000);
}

function continueToApp() {
  dismissNtfyOnboarding();
  if (router.currentRoute.value.path === "/notifications") {
    void router.push("/");
  }
}
</script>

<template>
  <main class="chat-shell min-h-dvh overflow-y-auto lg:h-full">
    <div class="app-page-shell mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <header class="space-y-4 border-b border-white/8 pb-6">
          <router-link
            to="/settings"
            class="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-white"
          >
            <ArrowLeft class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
            Settings
          </router-link>
          <div class="space-y-1.5">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-success)">
              Offline notifications
            </p>
            <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Get pinged when you're away</h1>
            <p class="text-sm leading-6 ui-muted">
              Gupt has no central server and can't use normal push alerts on encrypted chats. Use
              the free, open-source
              <a
                :href="NTFY_LINKS.website"
                target="_blank"
                rel="noopener noreferrer"
                class="text-(--app-primary) hover:underline"
              >
                ntfy
              </a>
              app to receive anonymous wake-up pings when someone taps PING in your chat.
            </p>
          </div>
        </header>

        <section class="space-y-4">
          <div class="ui-panel rounded-2xl p-4 sm:p-5 space-y-4">
            <div class="space-y-1">
              <p class="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-300">
                <Smartphone class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                1. Install ntfy
              </p>
              <p class="text-[11px] ui-muted leading-relaxed">
                Download the free ntfy app on your phone, or use the web client in a browser tab.
              </p>
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
              <a
                v-for="platform in platforms"
                :key="platform.id"
                :href="platform.href"
                target="_blank"
                rel="noopener noreferrer"
                class="group flex flex-col items-center gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4 text-center transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover)"
              >
                <component
                  :is="platform.icon"
                  class="h-5 w-5 text-(--app-primary)"
                  :stroke-width="1.9"
                  aria-hidden="true"
                />
                <span class="text-sm font-semibold text-zinc-200">{{ platform.name }}</span>
                <span class="inline-flex items-center gap-1 text-[11px] ui-muted">
                  {{ platform.store }}
                  <ExternalLink class="h-3 w-3 opacity-60" :stroke-width="2" aria-hidden="true" />
                </span>
              </a>
            </div>
          </div>

          <div class="ui-panel rounded-2xl p-4 sm:p-5 space-y-4">
            <div class="space-y-1">
              <p class="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-300">
                <Bell class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                2. Subscribe to your topic
              </p>
              <p class="text-[11px] ui-muted leading-relaxed">
                Open ntfy, tap <span class="text-zinc-400">Subscribe to topic</span>, and paste your
                public key exactly as shown below. Your topic name is your GUPT identity — no email
                or phone number required.
              </p>
            </div>

            <div class="space-y-2">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Your ntfy topic
              </p>
              <p
                class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2.5 text-xs font-mono text-zinc-300 break-all leading-relaxed select-all"
              >
                {{ identity.pubkeyHex || "Loading your public key…" }}
              </p>
              <button
                v-if="identity.pubkeyHex"
                type="button"
                class="ui-icon-button inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs transition-colors"
                :class="pubKeyCopied ? 'text-emerald-400' : 'text-zinc-400'"
                @click="copyPubKey"
              >
                <Copy
                  v-if="!pubKeyCopied"
                  class="h-3.5 w-3.5"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <Check v-else class="h-3.5 w-3.5" :stroke-width="2.5" aria-hidden="true" />
                {{ pubKeyCopied ? "Copied" : "Copy topic key" }}
              </button>
            </div>
          </div>

          <div class="ui-panel rounded-2xl p-4 sm:p-5 space-y-2">
            <p class="text-sm font-semibold text-zinc-300">How PING works</p>
            <p class="text-[11px] ui-muted leading-relaxed">
              When a contact taps <span class="text-zinc-400">PING</span> while you're offline, ntfy
              delivers a short message like
              <span class="italic">"Hey its swift-fox-042 — come online on gupt.app"</span>. No
              message content leaves the encrypted chat — it's just a nudge to open Gupt.
            </p>
          </div>

          <div class="space-y-3 pt-2">
            <PrimaryButton @click="continueToApp">
              <Check class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
              Done
            </PrimaryButton>
            <button
              type="button"
              class="w-full text-center text-sm ui-muted transition-colors hover:text-zinc-300"
              @click="continueToApp"
            >
              Skip for now
            </button>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>