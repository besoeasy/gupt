<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { BarChart2, MessageCircle, Moon, Settings, Sun, UserRound } from "lucide-vue-next";
import { useTheme } from "@/lib/theme";

const route = useRoute();
const router = useRouter();
const { isDark, toggle } = useTheme();

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
    <div class="max-w-7xl mx-auto px-4">
      <div class="flex min-h-14 items-center justify-between gap-3">
        <!-- Left: GUPT wordmark — always clickable, navigates home -->
        <div class="shrink-0 flex items-center">
          <button
            @click="navigateTo('/')"
            class="text-base font-black tracking-[0.22em] text-white uppercase select-none cursor-pointer transition-all duration-200 transform-gpu will-change-transform hover:opacity-80 hover:scale-105 hover:tracking-[0.28em] active:scale-95"
            aria-label="Go home"
          >
            GUPT
          </button>
        </div>

        <!-- Centre: nav items -->
        <nav class="flex items-center gap-0.5" aria-label="Primary navigation">
          <button
            v-for="item in primaryNavItems"
            :key="item.to"
            @click="navigateTo(item.to)"
            class="relative flex shrink-0 items-center justify-center px-3 lg:px-4 gap-2 h-14 transition-colors duration-150 active:scale-95 cursor-pointer"
            :class="
              isNavActive(item.to)
                ? 'text-white'
                : 'text-zinc-500 hover:text-white'
            "
            :aria-label="item.label"
            :title="item.label"
          >
            <component
              :is="item.icon"
              class="h-4.5 w-4.5"
              :stroke-width="isNavActive(item.to) ? 2.2 : 1.8"
              aria-hidden="true"
            />
            <span class="hidden lg:inline text-xs font-medium">{{ item.label }}</span>
            <span
              v-if="isNavActive(item.to)"
              class="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-(--ig-blue)"
            />
          </button>
        </nav>

        <!-- Right: theme toggle -->
        <div class="shrink-0 flex items-center justify-end">
          <button
            @click="toggle"
            class="group flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-all duration-150 hover:bg-white/8 hover:text-white active:scale-95 cursor-pointer"
            :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            <Sun
              v-if="isDark"
              class="h-4.5 w-4.5 transition-transform duration-300 group-hover:rotate-90"
              :stroke-width="1.8"
              aria-hidden="true"
            />
            <Moon
              v-else
              class="h-4.5 w-4.5 transition-transform duration-300 group-hover:-rotate-12"
              :stroke-width="1.8"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
