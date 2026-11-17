<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Moon,
  Settings,
  Sun,
  UserRound,
  MessageCircle,
  Heart,
  Bookmark,
  KeyRound,
  FileText,
  Newspaper,
  Bot,
  Shield,
  Plug,
  Radio,
  RefreshCw,
} from "@lucide/vue";

import { useThemeStore } from "@/stores/theme";
import { useIdentityStore } from "@/stores/identity";
import { useRabtaSyncStore } from "@/stores/rabtaSync";

const route = useRoute();
const router = useRouter();
const { isDark, toggle } = useThemeStore();
const identity = useIdentityStore();
const rabtaSyncStore = useRabtaSyncStore();

const DONATE_REVEAL_DELAY_MS = 15000;

// The navbar unmounts on call routes, so this lives at module scope: the delay
// counts from the first mount of the app, not from the latest remount.
const donateRevealed = ref(false);
let donateRevealStarted = false;

function startDonateReveal() {
  if (donateRevealStarted) return;
  donateRevealStarted = true;
  setTimeout(() => {
    donateRevealed.value = true;
  }, DONATE_REVEAL_DELAY_MS);
}

const primaryNavItems = computed(() => {
  const items = [];

  if (donateRevealed.value) {
    items.push({ to: "/donate", label: "Donate", icon: Heart, isDonate: true });
  }

  if (identity.isReady) {
    items.push(
      { to: "/chat", label: "Chat", icon: MessageCircle },
      { to: "/bookmarks", label: "Bookmarks", icon: Bookmark },
      { to: "/passwords", label: "Passwords", icon: KeyRound },
      { to: "/notes", label: "Notes", icon: FileText },
      { to: "/feed", label: "Feed", icon: Newspaper },
      { to: "/bots", label: "Bots", icon: Bot },
      { to: "/me", label: "Me", icon: UserRound },
      { to: "/rabta-sync", label: "Rabta", icon: Radio },
      { to: "/integrations", label: "Integrations", icon: Plug },
      { to: "/settings", label: "Settings", icon: Settings },
    );
  } else {
    // Surfaced while there is no account, as the way in to /welcome.
    items.push({ to: "/welcome", label: "Account", icon: Shield, isSwitch: true });
  }

  return items;
});

function isNavActive(targetPath) {
  return route.path === targetPath || route.path.startsWith(targetPath + "/");
}

function navigateTo(targetPath) {
  if (route.path === targetPath) return;
  router.push(targetPath);
}

onMounted(startDonateReveal);

function getNavItemClass(item) {
  const active = isNavActive(item.to);
  if (item.isDonate) {
    if (active) {
      return "bg-pink-500/20 px-3 text-pink-400 font-semibold";
    }
    return "w-9 text-pink-400 bg-pink-500/10 hover:bg-pink-500/20";
  }
  if (item.isSwitch) {
    if (active) {
      return "bg-emerald-500/15 px-3 text-emerald-300 font-semibold ring-1 ring-emerald-500/30";
    }
    return "w-9 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 ring-1 ring-emerald-500/20";
  }
  if (active) {
    return "bg-zinc-800 px-3 text-white font-semibold shadow-xs";
  }
  return "w-9 text-zinc-500 hover:bg-zinc-900 hover:text-amber-300";
}
</script>

<template>
  <header class="sticky top-0 z-30 w-full shrink-0 bg-black/80 backdrop-blur-md">
    <div
      class="mx-auto flex w-full max-w-6xl items-center justify-start sm:justify-center overflow-x-auto scroll-smooth px-3 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      <nav class="flex items-center gap-1 shrink-0" aria-label="Primary navigation">
        <TransitionGroup
          tag="div"
          class="flex items-center gap-1 shrink-0"
          appear
          enter-active-class="transition-[opacity,transform] duration-200 ease-[var(--app-ease-swift)]"
          enter-from-class="opacity-0 scale-90 -translate-y-1"
          enter-to-class="opacity-100 scale-100 translate-y-0"
          leave-active-class="transition-[opacity,transform] duration-150 ease-[var(--app-ease-in)]"
          leave-from-class="opacity-100 scale-100 translate-y-0"
          leave-to-class="opacity-0 scale-90 translate-y-1"
          move-class="transition-transform duration-200 ease-[var(--app-ease-swift)]"
        >
          <button
            v-for="item in primaryNavItems"
            :key="item.to"
            @click="navigateTo(item.to)"
            class="group relative flex h-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg transition-all duration-200 ease-out active:scale-95"
            :class="getNavItemClass(item)"
            :aria-label="item.label"
            :title="item.label"
          >
            <component
              :is="item.icon"
              class="h-[18px] w-[18px] shrink-0 transition-all duration-200"
              :class="[
                isNavActive(item.to) ? 'scale-100' : 'scale-90 group-hover:scale-100',
                item.isDonate
                  ? 'fill-pink-500/30'
                  : item.isSwitch
                    ? 'fill-emerald-500/25'
                    : // Neutral icons warm up to gold with a soft glow on hover.
                      'group-hover:text-amber-300 group-hover:drop-shadow-[0_0_7px_rgba(251,191,36,0.55)]',
              ]"
              :stroke-width="isNavActive(item.to) ? 2.5 : 2"
              aria-hidden="true"
            />
            <span
              class="overflow-hidden whitespace-nowrap text-xs font-medium transition-all duration-200 ease-out"
              :class="
                isNavActive(item.to) ? 'ml-2 max-w-[100px] opacity-100' : 'ml-0 max-w-0 opacity-0'
              "
            >
              {{ item.label }}
            </span>
          </button>
        </TransitionGroup>

        <!-- Rabta Server Mesh Sync Status in Navbar -->
        <button
          @click="navigateTo('/rabta-sync')"
          class="group relative flex h-9 min-w-[44px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs transition-all duration-200 ease-out active:scale-95"
          :class="[
            isNavActive('/rabta-sync')
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold ring-1 ring-emerald-500/30'
              : 'border-zinc-800/80 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200',
          ]"
          :aria-label="`Rabta server sync status: ${rabtaSyncStore.navbarStatusText}`"
          :title="`Rabta Server Mesh: ${rabtaSyncStore.onlineServers}/${rabtaSyncStore.totalServers} online · ${rabtaSyncStore.status}`"
        >
          <span class="relative flex h-2 w-2 shrink-0">
            <span
              v-if="rabtaSyncStore.isSyncing"
              class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"
            />
            <span
              class="relative inline-flex h-2 w-2 rounded-full"
              :class="{
                'bg-amber-400': rabtaSyncStore.isSyncing,
                'bg-emerald-400': !rabtaSyncStore.isSyncing && rabtaSyncStore.onlineServers > 0,
                'bg-red-400': rabtaSyncStore.status === 'error' || rabtaSyncStore.status === 'offline',
                'bg-zinc-500': rabtaSyncStore.status === 'paused' || rabtaSyncStore.onlineServers === 0,
              }"
            />
          </span>

          <RefreshCw
            v-if="rabtaSyncStore.isSyncing"
            class="h-3.5 w-3.5 shrink-0 animate-spin text-amber-400"
            :stroke-width="2"
            aria-hidden="true"
          />
          <Radio
            v-else
            class="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:scale-110"
            :class="isNavActive('/rabta-sync') ? 'text-emerald-400' : 'text-zinc-400 group-hover:text-amber-300'"
            :stroke-width="2"
            aria-hidden="true"
          />

          <span class="hidden font-mono text-[11px] font-medium tracking-tight sm:inline">
            {{ rabtaSyncStore.navbarStatusText }}
          </span>
        </button>

        <button
          @click="toggle"
          class="group relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-all duration-200 hover:bg-zinc-900 hover:text-zinc-200 active:scale-95"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          <Transition name="theme-icon" mode="out-in">
            <Sun
              v-if="isDark"
              key="sun"
              class="h-[18px] w-[18px] transition-transform duration-300 group-hover:rotate-90"
              :stroke-width="1.8"
              aria-hidden="true"
            />
            <Moon
              v-else
              key="moon"
              class="h-[18px] w-[18px] transition-transform duration-300 group-hover:-rotate-12"
              :stroke-width="1.8"
              aria-hidden="true"
            />
          </Transition>
        </button>

        <a
          href="https://github.com/besoeasy/gupt"
          target="_blank"
          rel="noopener noreferrer"
          class="group relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-all duration-200 hover:bg-zinc-900 hover:text-zinc-200 active:scale-95"
          aria-label="GitHub Repository"
          title="GitHub Repository"
        >
          <svg
            class="h-[18px] w-[18px] fill-current transition-transform duration-300 group-hover:scale-110"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            />
          </svg>
        </a>
      </nav>
    </div>
  </header>
</template>
