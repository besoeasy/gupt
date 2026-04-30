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
  <header
    class="app-shell-nav sticky top-0 z-30 lg:h-dvh lg:w-18 lg:shrink-0"
  >
    <div class="px-3 sm:px-4 lg:px-0 lg:py-4 lg:h-full">
      <div
        class="relative flex min-h-16 items-center justify-between gap-3 lg:flex-col lg:min-h-0 lg:h-full lg:justify-start lg:items-stretch lg:gap-2"
      >
        <!-- Brand: horizontal on mobile -->
        <div class="shrink-0 flex items-center lg:hidden">
          <button
            @click="navigateTo('/')"
            class="app-wordmark text-base font-black uppercase select-none cursor-pointer transition-all duration-200 transform-gpu will-change-transform hover:opacity-80 hover:scale-105 active:scale-95"
            aria-label="Go home"
          >
            GUPT
          </button>
        </div>

        <!-- Brand: centered vertical wordmark on the desktop rail -->
        <button
          @click="navigateTo('/')"
          class="app-wordmark app-wordmark-vertical absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 text-sm font-black uppercase select-none transition-all duration-200 hover:opacity-80 active:scale-95 lg:block"
          aria-label="Go home"
          title="Go home"
        >
          GUPT
        </button>

        <!-- Nav items: horizontal on mobile / vertical icon-only on desktop -->
        <nav
          class="flex items-center gap-0.5 lg:flex-col lg:gap-1.5 lg:flex-1 lg:items-stretch lg:px-2"
          aria-label="Primary navigation"
        >
          <button
            v-for="item in primaryNavItems"
            :key="item.to"
            @click="navigateTo(item.to)"
            class="app-nav-item relative flex shrink-0 items-center justify-center rounded-2xl px-3 lg:px-0 gap-2 h-11 lg:h-12 lg:w-12 lg:mx-auto transition-colors duration-150 active:scale-95 cursor-pointer"
            :class="isNavActive(item.to) ? 'app-nav-item-active bg-white/8' : 'hover:bg-white/6'"
            :aria-label="item.label"
            :title="item.label"
          >
            <component
              :is="item.icon"
              class="h-4.5 w-4.5 lg:h-5 lg:w-5"
              :stroke-width="isNavActive(item.to) ? 2.2 : 1.8"
              aria-hidden="true"
            />
            <span class="lg:hidden text-xs font-medium">{{ item.label }}</span>
            <!-- Mobile: bottom underline indicator -->
            <span
              v-if="isNavActive(item.to)"
              class="app-nav-indicator absolute bottom-1.5 left-4 right-4 h-0.5 rounded-full lg:hidden"
            />
            <!-- Desktop: left-edge vertical indicator -->
            <span
              v-if="isNavActive(item.to)"
              class="app-nav-indicator hidden lg:block absolute -left-2.5 top-2 bottom-2 w-0.5 rounded-full"
            />
          </button>
        </nav>

        <!-- Theme toggle: right on mobile / bottom of rail on desktop -->
        <div class="shrink-0 flex items-center justify-end lg:justify-center lg:pb-1">
          <button
            @click="toggle"
            class="ui-icon-button group flex h-10 w-10 shrink-0 cursor-pointer"
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
