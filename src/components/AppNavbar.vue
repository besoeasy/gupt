<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Moon,
  Settings,
  Sun,
  UserRound,
  MessageCircle,
  UploadCloud,
  Loader2,
  Heart,
  Database,
  Bookmark,
  KeyRound,
  FileText,
  Newspaper,
  Shield,
} from "@lucide/vue";

import { useThemeStore } from "@/stores/theme";
import { pendingCount } from "@/lib/sendQueue";
import { useIdentityStore } from "@/stores/identity";

const route = useRoute();
const router = useRouter();
const { isDark, toggle } = useThemeStore();
const identity = useIdentityStore();

const primaryNavItems = computed(() => {
  const items = [
    { to: "/donate", label: "Donate", icon: Heart, isDonate: true },
    { to: "/chat", label: "Chat", icon: MessageCircle },
    { to: "/share", label: "Share", icon: UploadCloud },
    { to: "/bookmarks", label: "Bookmarks", icon: Bookmark },
    { to: "/passwords", label: "Passwords", icon: KeyRound },
    { to: "/notes", label: "Notes", icon: FileText },
    { to: "/feed", label: "Feed", icon: Newspaper },
    { to: "/me", label: "Me", icon: UserRound },
  ];

  if (identity.mode === "ephemeral") {
    items.push({ to: "/switch", label: "Switch", icon: Shield, isSwitch: true });
  }

  items.push(
    { to: "/cache", label: "Cache", icon: Database },
    { to: "/settings", label: "Settings", icon: Settings },
  );

  return items;
});

function isNavActive(targetPath) {
  return route.path === targetPath || route.path.startsWith(targetPath + "/");
}

function navigateTo(targetPath) {
  if (route.path === targetPath) return;
  router.push(targetPath);
}

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
  return "w-9 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200";
}
</script>

<template>
  <header
    class="sticky top-0 z-30 w-full shrink-0 border-b border-zinc-800/80 bg-black/80 backdrop-blur-md"
  >
    <div
      class="mx-auto flex w-full max-w-6xl items-center justify-start sm:justify-center overflow-x-auto scroll-smooth px-3 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      <nav class="flex items-center gap-1 shrink-0" aria-label="Primary navigation">
        <button
          v-for="item in primaryNavItems"
          :key="item.to"
          @click="navigateTo(item.to)"
          class="relative flex h-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg transition-all duration-200 ease-out active:scale-95"
          :class="getNavItemClass(item)"
          :aria-label="item.label"
          :title="item.label"
        >
          <component
            :is="item.icon"
            class="h-[18px] w-[18px] shrink-0 transition-all duration-200"
            :class="[
              isNavActive(item.to) ? 'scale-100' : 'scale-90 group-hover:scale-100',
              item.isDonate ? 'fill-pink-500/30' : '',
              item.isSwitch ? 'fill-emerald-500/25' : '',
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

        <!-- Queue indicator: only when >1 pending, links to /queue -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 scale-75"
          leave-active-class="transition-all duration-150 ease-in"
          leave-to-class="opacity-0 scale-75"
        >
          <button
            v-if="pendingCount > 1"
            @click="navigateTo('/queue')"
            class="group relative flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 text-zinc-200 transition-all duration-200 hover:bg-zinc-700 active:scale-95"
            :title="`${pendingCount} pending relay writes`"
            aria-label="View pending actions"
          >
            <Loader2
              class="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400"
              :stroke-width="2.5"
              aria-hidden="true"
            />
            <span class="font-mono text-[11px] font-medium tabular-nums">{{ pendingCount }}</span>
          </button>
        </Transition>

        <button
          @click="toggle"
          class="group relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-all duration-200 hover:bg-zinc-900 hover:text-zinc-200 active:scale-95"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          <Sun
            v-if="isDark"
            class="h-[18px] w-[18px] transition-transform duration-300 group-hover:rotate-90"
            :stroke-width="1.8"
            aria-hidden="true"
          />
          <Moon
            v-else
            class="h-[18px] w-[18px] transition-transform duration-300 group-hover:-rotate-12"
            :stroke-width="1.8"
            aria-hidden="true"
          />
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
