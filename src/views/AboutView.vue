<script setup>
import {
  Clock3,
  CloudUpload,
  Download,
  LockKeyhole,
  Mic,
  Phone,
  RadioTower,
  Search,
  ShieldCheck,
  Users,
} from "lucide-vue-next";

const buildTime = new Date(__APP_BUILD_TIME__);

const features = [
  {
    title: "Zero-config start",
    description: "Open the app and chat immediately without assembling relays or extra services.",
    icon: ShieldCheck,
  },
  {
    title: "Encrypted DMs",
    description:
      "Private direct conversations with local-first room history and identity-based routing.",
    icon: LockKeyhole,
  },
  {
    title: "Groups",
    description:
      "Create rooms, invite members, and keep encrypted group state synced across devices.",
    icon: Users,
  },
  {
    title: "Voice and calls",
    description: "Recorded voice messages and built-in calling stay inside the same chat flow.",
    icon: Phone,
  },
  {
    title: "Encrypted media",
    description: "Send media through Originless while keeping payloads encrypted end to end.",
    icon: CloudUpload,
  },
  {
    title: "Fast local search",
    description:
      "Search cached messages on-device without sending your chat history anywhere else.",
    icon: Search,
  },
  {
    title: "Voice notes",
    description: "Capture quick voice updates without leaving the conversation screen.",
    icon: Mic,
  },
];

const marqueeFeatures = [...features, ...features];
</script>

<template>
  <div class="min-h-screen bg-black text-white">
    <main class="app-page-shell mx-auto px-4 py-6">
      <section class="pt-8">
        <div class="flex items-center gap-2 text-zinc-300">
          <RadioTower class="h-4 w-4" :stroke-width="1.8" aria-hidden="true" />
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">About Gupt</p>
        </div>

        <div class="mt-4 space-y-3">
          <h2 class="text-xl font-bold tracking-tight text-white">Gupt works out of the box.</h2>
          <p class="max-w-2xl text-sm leading-6 text-zinc-400">
            Encrypted messaging, groups, media, and calls are ready on first launch. Relays power
            sync in the background while identity and cached state stay local to the device.
          </p>
        </div>

        <div class="mt-5 space-y-3">
          <div class="flex items-center justify-between gap-3">
            <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
              Feature showcase
            </p>
            <p class="text-[11px] text-zinc-600">Live overview</p>
          </div>

          <div class="feature-marquee-shell">
            <div class="feature-marquee-track">
              <article
                v-for="(feature, index) in marqueeFeatures"
                :key="`${feature.title}-${index}`"
                class="feature-card"
              >
                <div
                  class="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-white"
                >
                  <component
                    :is="feature.icon"
                    class="h-5 w-5"
                    :stroke-width="1.9"
                    aria-hidden="true"
                  />
                </div>
                <h3 class="mt-4 text-sm font-semibold text-white">{{ feature.title }}</h3>
                <p class="mt-2 text-xs leading-6 text-zinc-400">{{ feature.description }}</p>
              </article>
            </div>
          </div>
        </div>

        <div class="mt-5 flex items-center gap-2 text-xs text-zinc-500">
          <Clock3 class="h-3.5 w-3.5" :stroke-width="1.8" aria-hidden="true" />
          <span>Build {{ buildTime.toISOString() }}</span>
        </div>

        <div class="mt-6">
          <a
            href="/dist.zip"
            download="gupt-dist.zip"
            class="inline-flex items-center gap-2 rounded-full bg-white/8 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/14 hover:text-white active:scale-95"
          >
            <Download class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
            Download dist.zip
          </a>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.feature-marquee-shell {
  overflow: hidden;
  mask-image: linear-gradient(to right, transparent, black 6%, black 94%, transparent);
}

.feature-marquee-track {
  display: flex;
  width: max-content;
  gap: 0.75rem;
  animation: feature-marquee 34s linear infinite;
}

.feature-marquee-shell:hover .feature-marquee-track {
  animation-play-state: paused;
}

.feature-card {
  width: 17rem;
  flex-shrink: 0;
  border-radius: 1.5rem;
  background: rgb(255 255 255 / 0.04);
  padding: 1rem;
}

@keyframes feature-marquee {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(calc(-50% - 0.375rem));
  }
}

@media (prefers-reduced-motion: reduce) {
  .feature-marquee-track {
    animation: none;
  }

  .feature-marquee-shell {
    overflow-x: auto;
    mask-image: none;
  }
}
</style>
