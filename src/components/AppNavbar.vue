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
} from "@lucide/vue";

import { useKnownRelays } from "@/composables/useKnownRelays";
import { RELAY_RECOMMENDED_MIN } from "@/lib/relayNudge";
import { useThemeStore } from "@/stores/theme";
import { useIdentityStore } from "@/stores/identity";

const route = useRoute();
const router = useRouter();
const { isDark, toggle } = useThemeStore();
const identity = useIdentityStore();
const { count: relayCount } = useKnownRelays();

const needsMoreRelays = computed(
  () => identity.isReady && relayCount.value < RELAY_RECOMMENDED_MIN,
);

function navTitle(item) {
  return item.to === "/settings" && needsMoreRelays.value
    ? `${item.label} — ${relayCount.value} of ${RELAY_RECOMMENDED_MIN} recommended relays`
    : item.label;
}

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
</script>

<template>
  <header class="app-navbar">
    <div class="app-navbar__scroll">
      <nav class="app-navbar__nav" aria-label="Primary navigation">
        <TransitionGroup tag="div" class="app-navbar__items" name="nav-item" appear>
          <button
            v-for="item in primaryNavItems"
            :key="item.to"
            @click="navigateTo(item.to)"
            class="nav-item"
            :class="{
              'nav-item--active': isNavActive(item.to),
              'nav-item--donate': item.isDonate,
              'nav-item--switch': item.isSwitch,
            }"
            :aria-label="navTitle(item)"
            :title="navTitle(item)"
          >
            <component
              :is="item.icon"
              class="nav-item__icon"
              :class="{
                'nav-item__icon--donate': item.isDonate,
                'nav-item__icon--switch': item.isSwitch,
              }"
              :stroke-width="isNavActive(item.to) ? 2.5 : 2"
              aria-hidden="true"
            />
            <span class="nav-item__label">{{ item.label }}</span>

            <span
              v-if="item.to === '/settings' && needsMoreRelays"
              class="nav-item__dot"
              aria-hidden="true"
            />
          </button>
        </TransitionGroup>

        <button
          @click="toggle"
          class="app-navbar__utility"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          <Transition name="theme-icon" mode="out-in">
            <Sun
              v-if="isDark"
              key="sun"
              class="app-navbar__utility-icon app-navbar__utility-icon--sun"
              :stroke-width="1.8"
              aria-hidden="true"
            />
            <Moon
              v-else
              key="moon"
              class="app-navbar__utility-icon app-navbar__utility-icon--moon"
              :stroke-width="1.8"
              aria-hidden="true"
            />
          </Transition>
        </button>

        <a
          href="https://github.com/besoeasy/gupt"
          target="_blank"
          rel="noopener noreferrer"
          class="app-navbar__utility"
          aria-label="GitHub Repository"
          title="GitHub Repository"
        >
          <svg class="app-navbar__github" viewBox="0 0 24 24" aria-hidden="true">
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
