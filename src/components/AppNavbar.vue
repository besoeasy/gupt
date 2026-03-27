<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { BarChart2, MessageCircle, Moon, Settings, Sun, UserRound } from "lucide-vue-next";
import { useTheme } from "@/lib/theme";

const route = useRoute();
const router = useRouter();
const { isDark, toggle } = useTheme();

const containerClass = computed(() => {
  return "w-full max-w-7xl";
});

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
  <header class="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
    <div :class="containerClass" class="mx-auto px-4">
      <div class="flex min-h-14 items-center justify-between gap-2">
        <!-- Left: GUPT wordmark — plain on home, clickable home link on sub-pages -->
        <div
          class="shrink-0 flex items-center gap-2.5"
          :class="'cursor-pointer hover:scale-105 transition-all'"
          @click="navigateTo('/')"
          role="button"
          aria-label="Go home"
        >
          <span
            class="text-[15px] font-black tracking-[0.18em] uppercase select-none bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent"
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
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-all duration-150 active:scale-95"
            :class="
              isNavActive(item.to)
                ? 'bg-primary/10 text-primary shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
            class="group flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-95"
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
