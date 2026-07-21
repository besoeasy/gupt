<script setup>
import { useRoute, useRouter } from "vue-router";
import {
  Moon,
  Settings,
  Sun,
  UserRound,
  MessageCircle,
  Shield,
  UploadCloud,
  Loader2,
} from "@lucide/vue";

import { useTheme } from "@/lib/theme";
import { pendingCount } from "@/lib/sendQueue";

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
  <header class="sticky top-0 z-30 w-full shrink-0 bg-(--nav-bg)">
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
            class="group relative flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl bg-(--app-primary)/10 px-3 text-(--app-primary) transition-all duration-200 hover:bg-(--app-primary)/20 active:scale-95 sm:h-11"
            :title="`${pendingCount} pending relay writes`"
            aria-label="View pending actions"
          >
            <Loader2
              class="h-3.5 w-3.5 shrink-0 animate-spin"
              :stroke-width="2.5"
              aria-hidden="true"
            />
            <span class="text-xs font-bold tabular-nums">{{ pendingCount }}</span>
          </button>
        </Transition>



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
      </nav>
    </div>
  </header>
</template>
