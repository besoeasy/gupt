<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
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
  Users,
  CircleCheckBig,
  Newspaper,
  Bot,
  Shield,
  Plug,
} from "@/icons";

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

  if (identity.isReady) {
    items.push(
      { to: "/chat", label: "Chat", icon: MessageCircle },
      { to: "/contacts", label: "Contacts", icon: Users },
      { to: "/feed", label: "Feed", icon: Newspaper },
      { to: "/notes", label: "Notes", icon: FileText },
      { to: "/passwords", label: "Passwords", icon: KeyRound },
      { to: "/bookmarks", label: "Bookmarks", icon: Bookmark },
      { to: "/tasks", label: "Tasks", icon: CircleCheckBig },
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

// The rail is icon-only, so it fits a desktop but not a phone. It scrolls
// horizontally: native swipe on touch, pointer drag with a mouse, and the
// active item is centred whenever the route changes.
const scrollEl = ref(null);
const navEl = ref(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
const isDragging = ref(false);

let dragStartX = 0;
let dragStartScroll = 0;
let dragMoved = false;
let dragEndedAt = 0;
let revealTimer = 0;
let railObserver = null;

function updateScrollState() {
  const el = scrollEl.value;
  if (!el) return;
  const max = el.scrollWidth - el.clientWidth;
  canScrollLeft.value = el.scrollLeft > 1;
  canScrollRight.value = max > 1 && el.scrollLeft < max - 1;
}

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function revealActiveItem() {
  const el = scrollEl.value;
  if (!el) return;
  const active = el.querySelector(".nav-item--active");
  if (!active) return;

  const itemRect = active.getBoundingClientRect();
  const railRect = el.getBoundingClientRect();
  if (itemRect.left >= railRect.left && itemRect.right <= railRect.right) return;

  const target =
    el.scrollLeft + itemRect.left - railRect.left - (railRect.width - itemRect.width) / 2;
  el.scrollTo({
    left: Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth)),
    behavior: reducedMotion() ? "auto" : "smooth",
  });
}

// The active label grows over a transition, so centre after it settles.
function scheduleReveal() {
  window.clearTimeout(revealTimer);
  revealTimer = window.setTimeout(() => {
    revealActiveItem();
    updateScrollState();
  }, 240);
}

function onPointerDown(event) {
  if (event.pointerType !== "mouse" || event.button !== 0) return;
  const el = scrollEl.value;
  if (!el || el.scrollWidth <= el.clientWidth) return;
  isDragging.value = true;
  dragMoved = false;
  dragStartX = event.clientX;
  dragStartScroll = el.scrollLeft;
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endDrag, { once: true });
  window.addEventListener("pointercancel", endDrag, { once: true });
}

function onPointerMove(event) {
  if (!isDragging.value) return;
  const el = scrollEl.value;
  if (!el) return;
  const dx = event.clientX - dragStartX;
  if (!dragMoved && Math.abs(dx) < 4) return;
  dragMoved = true;
  event.preventDefault();
  el.scrollLeft = dragStartScroll - dx;
}

function endDrag() {
  if (!isDragging.value) return;
  isDragging.value = false;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
  if (dragMoved) dragEndedAt = Date.now();
  dragMoved = false;
  updateScrollState();
}

// A drag must not also activate the button it started on.
function onRailClickCapture(event) {
  if (Date.now() - dragEndedAt > 300) return;
  event.preventDefault();
  event.stopPropagation();
}

watch(
  () => route.path,
  () => scheduleReveal(),
);

watch(
  () => primaryNavItems.value.length,
  () => {
    nextTick(() => {
      updateScrollState();
      scheduleReveal();
    });
  },
);

onMounted(() => {
  startDonateReveal();
  updateScrollState();
  railObserver = new ResizeObserver(updateScrollState);
  if (scrollEl.value) railObserver.observe(scrollEl.value);
  if (navEl.value) railObserver.observe(navEl.value);
  nextTick(() => {
    updateScrollState();
    scheduleReveal();
  });
});

onUnmounted(() => {
  railObserver?.disconnect();
  window.clearTimeout(revealTimer);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
});

function isNavActive(targetPath) {
  return route.path === targetPath || route.path.startsWith(targetPath + "/");
}

function navigateTo(targetPath) {
  if (route.path === targetPath) return;
  router.push(targetPath);
}
</script>

<template>
  <header class="app-navbar">
    <div class="app-navbar__inner">
      <div
        class="app-navbar__rail"
        :class="{
          'app-navbar__rail--start': canScrollLeft,
          'app-navbar__rail--end': canScrollRight,
          'app-navbar__rail--scrollable': canScrollLeft || canScrollRight,
          'app-navbar__rail--dragging': isDragging,
        }"
      >
        <div
          ref="scrollEl"
          class="app-navbar__scroll"
          @scroll.passive="updateScrollState"
          @pointerdown="onPointerDown"
          @click.capture="onRailClickCapture"
        >
          <nav ref="navEl" class="app-navbar__nav" aria-label="Primary navigation">
            <TransitionGroup tag="div" class="app-navbar__items" name="nav-item" appear>
              <button
                v-for="(item, index) in primaryNavItems"
                :key="item.to"
                @click="navigateTo(item.to)"
                class="nav-item"
                :class="{
                  'nav-item--active': isNavActive(item.to),
                  'nav-item--switch': item.isSwitch,
                }"
                :style="{ '--nav-index': index }"
                :aria-label="navTitle(item)"
                :title="navTitle(item)"
                :aria-current="isNavActive(item.to) ? 'page' : undefined"
              >
                <span class="nav-item__mark">
                  <component
                    :is="item.icon"
                    class="nav-item__icon"
                    :class="{
                      'nav-item__icon--switch': item.isSwitch,
                    }"
                    :stroke-width="isNavActive(item.to) ? 2.2 : 1.8"
                    aria-hidden="true"
                  />
                  <span
                    v-if="item.to === '/settings' && needsMoreRelays"
                    class="nav-item__dot"
                    aria-hidden="true"
                  />
                </span>
                <span class="nav-item__label">{{ item.label }}</span>
              </button>
            </TransitionGroup>
          </nav>
        </div>
      </div>

      <div class="app-navbar__utilities">
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

        <RouterLink
          v-if="donateRevealed"
          to="/donate"
          class="app-navbar__utility app-navbar__utility--donate"
          aria-label="Donate"
          title="Donate"
        >
          <Heart
            class="app-navbar__utility-icon app-navbar__utility-icon--donate"
            :stroke-width="1.8"
            aria-hidden="true"
          />
        </RouterLink>
      </div>
    </div>
  </header>
</template>

<style scoped>
@layer base, gupt-components;

/* ---------------------------------------------------------------
   Primary navigation — Ledger chrome: opaque, one hairline, text
   labels always visible, active state is a rule that draws itself.
   --------------------------------------------------------------- */

.app-navbar {
  position: sticky;
  top: 0;
  z-index: 30;
  width: 100%;
  flex-shrink: 0;
  background: var(--app-bg);
  border-bottom: 1px solid var(--app-border);
}

.app-navbar__inner {
  display: flex;
  align-items: stretch;
  gap: var(--app-space-4);
  width: 100%;
  max-width: 72rem;
  margin-inline: auto;
  padding-inline: var(--app-space-3);
  animation: ledger-fade var(--app-dur-slow) var(--app-ease-standard) both;
}

@media (min-width: 40rem) {
  .app-navbar__inner {
    padding-inline: var(--app-space-5);
  }
}

.app-navbar__rail {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
}

/* Edge fades are the only affordance the rail has: they appear when there is
   more to slide to, and stay out of the way when everything fits. */
.app-navbar__rail::before,
.app-navbar__rail::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 1;
  width: 28px;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--app-dur-base) var(--app-ease-standard);
}

.app-navbar__rail::before {
  left: 0;
  background: linear-gradient(to right, var(--app-bg) 20%, transparent);
}

.app-navbar__rail::after {
  right: 0;
  background: linear-gradient(to left, var(--app-bg) 20%, transparent);
}

.app-navbar__rail--start::before,
.app-navbar__rail--end::after {
  opacity: 1;
}

.app-navbar__rail--scrollable {
  cursor: grab;
}

.app-navbar__rail--dragging {
  cursor: grabbing;
}

.app-navbar__scroll {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-behavior: smooth;
  scroll-snap-type: x proximity;
  scroll-padding-inline: var(--app-space-4);
  scrollbar-width: none;
  -ms-overflow-style: none;
  user-select: none;
}

.app-navbar__scroll::-webkit-scrollbar {
  display: none;
}

.app-navbar__nav,
.app-navbar__items {
  display: flex;
  align-items: stretch;
  gap: 2px;
  flex-shrink: 0;
}

.nav-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  min-width: var(--app-touch-h);
  height: 56px;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--app-muted);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: -0.005em;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  scroll-snap-align: center;
  animation: ledger-rise 420ms var(--app-ease-emphasized) backwards;
  animation-delay: calc(var(--nav-index, 0) * 28ms + 40ms);
  transition:
    color var(--app-dur-base) var(--app-ease-swift),
    background-color var(--app-dur-base) var(--app-ease-swift),
    padding var(--app-dur-base) var(--app-ease-swift);
}

/* The rule under the route you are on: it draws from the middle out. */

.nav-item::after {
  content: "";
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 0;
  height: 2px;
  border-radius: 1px;
  background-color: var(--app-text);
  transform: scaleX(0);
  transform-origin: center;
  transition: transform var(--app-dur-slow) var(--app-ease-emphasized);
}

.nav-item:hover {
  color: var(--app-text);
  background-color: var(--app-surface-soft);
}

.nav-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: -2px;
  border-radius: var(--app-radius-sm);
}

.nav-item--active {
  padding: 0 12px;
  color: var(--app-text);
  font-weight: 600;
}

.nav-item--active::after {
  transform: scaleX(1);
}

.nav-item--switch {
  color: var(--app-success);
}

.nav-item--switch::after {
  background-color: var(--app-success);
}

.nav-item__mark {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.nav-item__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  transition:
    transform var(--app-dur-base) var(--app-ease-swift),
    filter var(--app-dur-base) var(--app-ease-swift);
}

.nav-item:hover .nav-item__icon,
.nav-item--active .nav-item__icon {
  transform: translateY(-1px) scale(1.04);
}

/* A whisper of the old gold, only while the pointer is on a neutral item. */

.nav-item:not(.nav-item--active, .nav-item--switch):hover .nav-item__icon {
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--app-warning) 45%, transparent));
}

.nav-item__icon--switch {
  fill: color-mix(in srgb, var(--app-success) 25%, transparent);
}

.nav-item__label {
  max-width: 0;
  margin-left: 0;
  overflow: hidden;
  opacity: 0;
  font-size: 12.5px;
  font-weight: inherit;
  line-height: 1;
  white-space: nowrap;
  transition:
    max-width var(--app-dur-base) var(--app-ease-swift),
    margin-left var(--app-dur-base) var(--app-ease-swift),
    opacity var(--app-dur-base) var(--app-ease-swift);
}

.nav-item--active .nav-item__label {
  max-width: 120px;
  margin-left: 7px;
  opacity: 1;
}

.nav-item__dot {
  position: absolute;
  top: -2px;
  right: -3px;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background-color: var(--app-warning);
  color: var(--app-warning);
  animation: ledger-dot-pulse 2.4s var(--app-ease-standard) infinite;
}

.app-navbar__utilities {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding-left: var(--app-space-3);
  border-left: 1px solid var(--app-border);
}

.app-navbar__utility {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--app-touch-h);
  height: var(--app-touch-h);
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-base) var(--app-ease-swift),
    color var(--app-dur-base) var(--app-ease-swift),
    transform var(--app-dur-fast) var(--app-ease-swift);
}

.app-navbar__utility:hover {
  background-color: var(--app-surface-soft);
  color: var(--app-text);
}

.app-navbar__utility:active {
  transform: scale(0.94);
}

.app-navbar__utility:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: -2px;
}

.app-navbar__utility--donate {
  color: var(--app-accent-heart);
}

.app-navbar__utility--donate:hover {
  background-color: color-mix(in srgb, var(--app-accent-heart) 12%, transparent);
  color: var(--app-accent-heart);
}

.app-navbar__utility-icon--donate {
  fill: color-mix(in srgb, var(--app-accent-heart) 30%, transparent);
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

.app-navbar__utility:hover .app-navbar__utility-icon--donate {
  animation: donate-heart-beat 900ms var(--app-ease-spring) both;
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
  transform: translateY(-4px) scale(0.96);
}

.nav-item-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.96);
}

.nav-item-move {
  transition: transform 200ms var(--app-ease-swift);
}

@keyframes donate-heart-beat {
  0%,
  100% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.18);
  }
  60% {
    transform: scale(0.96);
  }
}

@media (max-width: 40rem) {
  .nav-item {
    height: 56px;
    padding: 0;
    font-size: 12px;
  }

  .nav-item--active {
    padding: 0 10px;
  }

  .nav-item__label {
    font-size: 12px;
  }

  .app-navbar__inner {
    gap: 0;
    padding-inline: 0;
  }

  .app-navbar__scroll {
    padding-left: var(--app-space-2);
  }

  .app-navbar__utilities {
    padding-right: var(--app-space-2);
    background: var(--app-bg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nav-item,
  .nav-item__dot,
  .app-navbar__utility:hover .app-navbar__utility-icon--donate {
    animation: none;
  }

  .app-navbar__scroll {
    scroll-behavior: auto;
  }

  .app-navbar__rail::before,
  .app-navbar__rail::after,
  .nav-item__label {
    transition: none;
  }
}
</style>
