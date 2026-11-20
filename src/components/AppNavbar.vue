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

<style scoped>
/* ---------------------------------------------------------------
   Primary navigation
   Custom CSS, no Tailwind utilities. Widths grow with the active
   label, so the bar reads as icons until a route owns it.
   --------------------------------------------------------------- */

.app-navbar {
  position: sticky;
  top: 0;
  z-index: 30;
  width: 100%;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--app-bg) 84%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.app-navbar__scroll {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  max-width: 72rem;
  margin-inline: auto;
  padding: 8px 12px;
  overflow-x: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.app-navbar__scroll::-webkit-scrollbar {
  display: none;
}

.app-navbar__nav,
.app-navbar__items {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.nav-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  flex-shrink: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--app-muted);
  font: inherit;
  cursor: pointer;
  transition:
    background-color var(--app-dur-base) var(--app-ease-swift),
    color var(--app-dur-base) var(--app-ease-swift),
    padding var(--app-dur-base) var(--app-ease-swift),
    box-shadow var(--app-dur-base) var(--app-ease-swift);
}

.nav-item:not(.nav-item--active):hover {
  background: var(--app-surface-soft);
  color: var(--app-warning);
}

.nav-item--active {
  padding: 0 12px;
  background: var(--ui-zinc-800);
  color: var(--app-text);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.nav-item--donate {
  background: color-mix(in srgb, #ec4899 10%, transparent);
  color: #f472b6;
}

.nav-item--donate:not(.nav-item--active):hover {
  background: color-mix(in srgb, #ec4899 20%, transparent);
}

.nav-item--donate.nav-item--active {
  background: color-mix(in srgb, #ec4899 20%, transparent);
  color: #f472b6;
}

.nav-item--switch {
  background: color-mix(in srgb, var(--app-success) 10%, transparent);
  color: var(--app-success);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-success) 20%, transparent);
}

.nav-item--switch:not(.nav-item--active):hover {
  background: color-mix(in srgb, var(--app-success) 20%, transparent);
}

.nav-item--switch.nav-item--active {
  background: color-mix(in srgb, var(--app-success) 15%, transparent);
  color: var(--app-success);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-success) 30%, transparent);
}

.nav-item__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  transform: scale(0.9);
  transition:
    transform var(--app-dur-base) var(--app-ease-swift),
    filter var(--app-dur-base) var(--app-ease-swift);
}

.nav-item:hover .nav-item__icon,
.nav-item--active .nav-item__icon {
  transform: scale(1);
}

/* Neutral icons warm up to gold with a soft glow on hover. */

.nav-item:not(.nav-item--active, .nav-item--donate, .nav-item--switch):hover .nav-item__icon {
  filter: drop-shadow(0 0 7px color-mix(in srgb, var(--app-warning) 55%, transparent));
}

.nav-item__icon--donate {
  fill: color-mix(in srgb, #f472b6 30%, transparent);
}

.nav-item__icon--switch {
  fill: color-mix(in srgb, var(--app-success) 25%, transparent);
}

.nav-item__label {
  max-width: 0;
  margin-left: 0;
  overflow: hidden;
  opacity: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  transition:
    max-width var(--app-dur-base) var(--app-ease-swift),
    margin-left var(--app-dur-base) var(--app-ease-swift),
    opacity var(--app-dur-base) var(--app-ease-swift);
}

.nav-item--active .nav-item__label {
  max-width: 100px;
  margin-left: 8px;
  opacity: 1;
}

.nav-item__dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--app-warning);
  box-shadow: 0 0 6px color-mix(in srgb, var(--app-warning) 85%, transparent);
}

.app-navbar__utility {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-base) var(--app-ease-swift),
    color var(--app-dur-base) var(--app-ease-swift);
}

.app-navbar__utility:hover {
  background: var(--app-surface-soft);
  color: var(--ui-zinc-200);
}

.app-navbar__utility-icon {
  width: 18px;
  height: 18px;
  transition: transform 300ms var(--app-ease-swift);
}

.app-navbar__utility:hover .app-navbar__utility-icon--sun {
  transform: rotate(90deg);
}

.app-navbar__utility:hover .app-navbar__utility-icon--moon {
  transform: rotate(-12deg);
}

.app-navbar__github {
  width: 18px;
  height: 18px;
  fill: currentColor;
  transition: transform 300ms var(--app-ease-swift);
}

.app-navbar__utility:hover .app-navbar__github {
  transform: scale(1.1);
}

.nav-item-enter-active {
  transition:
    opacity 200ms var(--app-ease-swift),
    transform 200ms var(--app-ease-swift);
}

.nav-item-leave-active {
  transition:
    opacity 150ms var(--app-ease-in),
    transform 150ms var(--app-ease-in);
}

.nav-item-enter-from {
  opacity: 0;
  transform: translateY(-4px) scale(0.9);
}

.nav-item-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.9);
}

.nav-item-move {
  transition: transform 200ms var(--app-ease-swift);
}

@media (min-width: 640px) {
  .app-navbar__scroll {
    justify-content: center;
  }
}
</style>
