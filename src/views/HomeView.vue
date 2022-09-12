<script setup>
import { useRouter } from "vue-router";
import {
  MessageCircle,
  UploadCloud,
  Shield,
  ArrowRight,
  Github,
  Lock,
  Zap,
  EyeOff,
} from "lucide-vue-next";

const router = useRouter();

const features = [
  {
    id: "messages",
    title: "Anonymous Chat",
    badge: "Chat",
    description:
      "End-to-end encrypted DMs, group rooms, and WebRTC voice & video calls. No phone number required — ever.",
    icon: MessageCircle,
    path: "/messages",
    color: "text-(--app-primary)",
    bg: "bg-(--app-primary)/10",
    border: "group-hover:border-(--app-primary)/50",
    gradient: "from-(--app-primary)/20 to-transparent",
    shadow: "group-hover:shadow-[0_0_30px_rgba(77,159,255,0.15)]",
  },
  {
    id: "vault",
    title: "Secure Vault",
    badge: "Vault",
    description:
      "Store passwords, 2FA secrets, and private notes encrypted with your keypair — synced across devices via Nostr relays.",
    icon: Shield,
    path: "/vault",
    color: "text-(--app-success)",
    bg: "bg-(--app-success)/10",
    border: "group-hover:border-(--app-success)/50",
    gradient: "from-(--app-success)/20 to-transparent",
    shadow: "group-hover:shadow-[0_0_30px_rgba(72,213,151,0.15)]",
  },
  {
    id: "share",
    title: "Ephemeral Share",
    badge: "Share",
    description:
      "Send encrypted files and text via self-destructing links. Recipients need no account. Traces disappear automatically.",
    icon: UploadCloud,
    path: "/share",
    color: "text-[#c084fc]",
    bg: "bg-[#c084fc]/10",
    border: "group-hover:border-[#c084fc]/50",
    gradient: "from-[#c084fc]/20 to-transparent",
    shadow: "group-hover:shadow-[0_0_30px_rgba(192,132,252,0.15)]",
  },
];
</script>

<template>
  <div
    class="relative min-h-full flex flex-col items-center justify-center p-4 sm:p-8 lg:p-12 overflow-hidden"
  >
    <!-- Ambient Background Effects -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        class="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] bg-(--app-primary)/10 blur-[120px] rounded-full mix-blend-normal animate-pulse"
      ></div>
      <div
        class="absolute top-[20%] -right-[10%] w-[60%] h-[60%] bg-[#c084fc]/10 blur-[120px] rounded-full mix-blend-normal animate-pulse"
        style="animation-delay: 2s"
      ></div>
      <div
        class="absolute -bottom-[10%] left-[20%] w-[80%] h-[60%] bg-(--app-success)/10 blur-[120px] rounded-full mix-blend-normal animate-pulse"
        style="animation-delay: 4s"
      ></div>
    </div>

    <div
      class="relative z-10 w-full max-w-6xl mx-auto flex flex-col items-center animate-in fade-in zoom-in-95 duration-700"
    >
      <!-- Hero Section -->
      <div class="text-center space-y-6 mb-12 lg:mb-20 max-w-3xl mx-auto pt-8 sm:pt-12">
        <!-- Suite Badge -->
        <div
          class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-xs font-semibold tracking-widest uppercase text-zinc-400 mb-2"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-(--app-primary) animate-pulse"></span>
          Anonymous Privacy Suite
        </div>

        <h1
          class="text-7xl sm:text-9xl lg:text-[11rem] font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-(--app-primary) via-(--app-success) to-[#c084fc] animate-gradient-x transition-all duration-700 ease-out hover:tracking-[0.25em] hover:scale-110 hover:drop-shadow-[0_0_40px_rgba(77,159,255,0.4)] cursor-default select-none"
        >
          GUPT
        </h1>

        <p
          class="text-base sm:text-lg lg:text-xl text-(--app-text-soft) leading-relaxed max-w-2xl mx-auto font-light px-2 sm:px-0"
        >
          Your complete anonymous digital life — chat, vault, and share. No phone number. No email.
          No account. No server.
        </p>
      </div>

      <!-- Feature Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 w-full">
        <button
          v-for="feature in features"
          :key="feature.id"
          @click="router.push(feature.path)"
          class="group relative text-left rounded-3xl p-6 sm:p-8 overflow-hidden transition-all duration-500 hover:-translate-y-2 ui-panel ui-surface-hover"
          :class="[feature.border, feature.shadow]"
        >
          <!-- Background Gradient Glow -->
          <div
            class="absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            :class="feature.gradient"
          ></div>

          <!-- Glossy Reflection -->
          <div
            class="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none mix-blend-overlay"
          ></div>

          <div class="relative z-10">
            <div
              class="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl flex items-center justify-center mb-5 sm:mb-6 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-sm"
              :class="[feature.bg, feature.color]"
            >
              <component :is="feature.icon" class="h-6 w-6 sm:h-8 sm:w-8" :stroke-width="2" />
            </div>

            <h2
              class="text-lg sm:text-xl lg:text-2xl font-bold text-(--app-text) mb-2 sm:mb-3 flex items-center justify-between tracking-tight"
            >
              {{ feature.title }}
              <ArrowRight
                class="h-5 w-5 sm:h-6 sm:w-6 text-(--app-muted) opacity-0 -translate-x-4 transition-all duration-500 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-(--app-text)"
              />
            </h2>
            <p class="text-sm sm:text-base text-(--app-text-soft) leading-relaxed font-light">
              {{ feature.description }}
            </p>
          </div>
        </button>
      </div>

      <!-- Trust Indicators -->
      <div
        class="hidden md:flex items-center justify-center gap-8 mt-16 lg:mt-24 text-(--app-muted) animate-in fade-in duration-1000 delay-500"
      >
        <div class="flex items-center gap-2">
          <EyeOff class="h-5 w-5" />
          <span class="text-sm font-medium">No Account Required</span>
        </div>
        <div class="w-1.5 h-1.5 rounded-full bg-(--app-border-strong)"></div>
        <div class="flex items-center gap-2">
          <Lock class="h-5 w-5" />
          <span class="text-sm font-medium">Zero Plaintext Storage</span>
        </div>
        <div class="w-1.5 h-1.5 rounded-full bg-(--app-border-strong)"></div>
        <div class="flex items-center gap-2">
          <Zap class="h-5 w-5" />
          <span class="text-sm font-medium">Decentralized Relays</span>
        </div>
      </div>

      <!-- Open Source Footer Badge -->
      <div
        class="mt-12 sm:mt-16 lg:mt-12 text-center animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300"
      >
        <a
          href="https://github.com/besoeasy/gupt"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center justify-center gap-2.5 px-5 py-2.5 sm:px-6 sm:py-3 rounded-full bg-(--app-surface) hover:bg-(--app-surface-hover) transition-all duration-300 border border-(--app-border) hover:border-(--app-border-strong) group shadow-sm hover:shadow-md backdrop-blur-sm"
        >
          <Github
            class="h-4 w-4 sm:h-5 sm:w-5 text-(--app-muted) group-hover:text-(--app-text) transition-colors"
          />
          <span
            class="text-xs sm:text-sm font-medium text-(--app-text-soft) group-hover:text-(--app-text) transition-colors"
          >
            100% Free and Open Source
          </span>
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes gradient-x {
  0%,
  100% {
    background-size: 200% 200%;
    background-position: left center;
  }
  50% {
    background-size: 200% 200%;
    background-position: right center;
  }
}
.animate-gradient-x {
  animation: gradient-x 6s ease infinite;
}
</style>
