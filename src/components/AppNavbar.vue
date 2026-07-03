<script setup>
import { useRoute, useRouter } from "vue-router";
import {
  Moon,
  Settings,
  Sun,
  UserRound,
  Github,
  MessageCircle,
  Shield,
  UploadCloud,
} from "lucide-vue-next";

import { useTheme } from "@/lib/theme";

const route = useRoute();
const router = useRouter();
const { isDark, toggle } = useTheme();

const primaryNavItems = [
  { to: "/messages", label: "Chat", icon: MessageCircle },
  { to: "/vault", label: "Vault", icon: Shield },
  { to: "/share", label: "Share", icon: UploadCloud },
  { to: "/me", label: "Me", icon: UserRound },
  { to: "/settings", label: "Settings", icon: Settings },
];

function isNavActive(targetPath) {
  return route.path === targetPath || route.path.startsWith(targetPath + "/");
}

function navigateTo(targetPath) {
  if (route.path === targetPath) return;
  router.push(targetPath);
}
</script>

<template>
  <header class="app-shell-nav sticky top-0 z-30 w-full shrink-0">
    <div class="flex w-full items-center justify-center overflow-x-auto px-2 py-2 sm:py-3">
      <nav class="flex items-center gap-1 sm:gap-1.5" aria-label="Primary navigation">
        <button
          v-for="item in primaryNavItems"
          :key="item.to"
          @click="navigateTo(item.to)"
          class="relative flex h-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl transition-all duration-300 ease-out active:scale-95 sm:h-11"
          :class="
            isNavActive(item.to)
              ? 'bg-(--app-primary)/15 px-4 text-(--app-primary)'
              : 'w-10 text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text) sm:w-11'
          "
          :aria-label="item.label"
          :title="item.label"
        >
          <component
            :is="item.icon"
            class="h-5 w-5 shrink-0 transition-all duration-300"
            :class="isNavActive(item.to) ? 'scale-100' : 'scale-90 group-hover:scale-100'"
            :stroke-width="isNavActive(item.to) ? 2.5 : 2"
            aria-hidden="true"
          />
          <span
            class="overflow-hidden whitespace-nowrap text-sm font-bold transition-all duration-300 ease-out"
            :class="
              isNavActive(item.to) ? 'ml-2.5 max-w-[100px] opacity-100' : 'ml-0 max-w-0 opacity-0'
            "
          >
            {{ item.label }}
          </span>
        </button>

        <div class="mx-1 h-6 w-px bg-(--app-border) sm:mx-2"></div>

        <button
          @click="toggle"
          class="group relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl text-(--app-muted) transition-all duration-300 hover:bg-(--app-surface-hover) hover:text-(--app-text) active:scale-95 sm:h-11 sm:w-11"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          <Sun
            v-if="isDark"
            class="h-5 w-5 transition-transform duration-300 group-hover:rotate-90"
            :stroke-width="1.8"
            aria-hidden="true"
          />
          <Moon
            v-else
            class="h-5 w-5 transition-transform duration-300 group-hover:-rotate-12"
            :stroke-width="1.8"
            aria-hidden="true"
          />
        </button>

        <a
          href="https://github.com/besoeasy/gupt"
          target="_blank"
          rel="noopener noreferrer"
          class="group relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl text-(--app-muted) transition-all duration-300 hover:bg-(--app-surface-hover) hover:text-(--app-text) active:scale-95 sm:h-11 sm:w-11"
          aria-label="GitHub Repository"
          title="GitHub Repository"
        >
          <Github
            class="h-5 w-5 transition-transform duration-300 group-hover:scale-110"
            :stroke-width="1.8"
            aria-hidden="true"
          />
        </a>
      </nav>
    </div>
  </header>
</template>
