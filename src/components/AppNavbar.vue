<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { BarChart2, MessageCircle, Moon, Settings, Sun, UserRound } from "lucide-vue-next";
import { useTheme } from "@/lib/theme";

const route = useRoute();
const router = useRouter();
const { isDark, toggle } = useTheme();

const containerClass = computed(() => "max-w-[90rem]");

const primaryNavItems = [
  { to: "/", label: "Messages", icon: MessageCircle },
  { to: "/identity", label: "Profile", icon: UserRound },
  { to: "/stats", label: "Stats", icon: BarChart2 },
  { to: "/settings", label: "Settings", icon: Settings },
];

const isHome = computed(() => route.path === "/");

function isNavActive(targetPath) {
  if (targetPath === "/") return route.path === "/";
  return route.path.startsWith(targetPath);
}

function navigateTo(targetPath) {
  if (route.path === targetPath) return;
  router.push(targetPath);
}
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-white/7 bg-black/90 backdrop-blur-xl">
    <div :class="containerClass" class="mx-auto px-4">
      <div class="flex min-h-14 items-center justify-between gap-2">
        <!-- Left: GUPT wordmark — plain on home, clickable home link on sub-pages -->
        <div class="w-20 shrink-0 flex items-center">
          <span
            class="text-sm font-black tracking-[0.22em] text-white uppercase select-none transition-opacity transition-transform duration-200 transform-gpu will-change-transform"
            :class="
              isHome
                ? ''
                : 'cursor-pointer opacity-60 hover:opacity-100 hover:scale-105 hover:tracking-[0.28em]'
            "
            @click="!isHome && navigateTo('/')"
            aria-label="Go home"
            :role="isHome ? undefined : 'button'"
          >
            GUPT
          </span>
        </div>

        <!-- Centre: nav icons always visible -->
        <nav class="flex items-center gap-1" aria-label="Primary navigation">
          <button
            v-for="item in primaryNavItems"
            :key="item.to"
            @click="navigateTo(item.to)"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-all duration-150 active:scale-90"
            :class="
              isNavActive(item.to)
                ? 'border-white/30 bg-white text-black shadow-[0_0_10px_rgba(255,255,255,0.12)] hover:scale-105'
                : 'border-white/10 bg-white/4 text-zinc-400 hover:bg-white/10 hover:text-white hover:border-white/20 hover:scale-105'
            "
            :aria-label="item.label"
            :title="item.label"
          >
            <component
              :is="item.icon"
              class="h-4 w-4"
              :stroke-width="isNavActive(item.to) ? 2.2 : 1.9"
              aria-hidden="true"
            />
          </button>
        </nav>

        <!-- Right: theme toggle -->
        <div class="w-20 shrink-0 flex items-center justify-end">
          <button
            @click="toggle"
            class="group flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/4 text-zinc-400 transition-all duration-150 hover:bg-white/10 hover:text-white hover:border-white/20 hover:scale-105 active:scale-90"
            :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            <Sun
              v-if="isDark"
              class="h-4 w-4 transition-transform duration-300 group-hover:rotate-90"
              :stroke-width="1.9"
              aria-hidden="true"
            />
            <Moon
              v-else
              class="h-4 w-4 transition-transform duration-300 group-hover:-rotate-12"
              :stroke-width="1.9"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
