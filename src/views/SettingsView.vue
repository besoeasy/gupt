<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { ExternalLink, Settings } from "@lucide/vue";

import SettingsAccountPanel from "@/components/settings/SettingsAccountPanel.vue";
import SettingsAppearancePanel from "@/components/settings/SettingsAppearancePanel.vue";
import SettingsNotificationsPanel from "@/components/settings/SettingsNotificationsPanel.vue";
import SettingsPrivacyPanel from "@/components/settings/SettingsPrivacyPanel.vue";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import SettingsStatusStrip from "@/components/settings/SettingsStatusStrip.vue";
import SettingsSyncPanel from "@/components/settings/SettingsSyncPanel.vue";
import CustomRelaysPanel from "@/components/settings/CustomRelaysPanel.vue";
import RelaySuggestionsPanel from "@/components/settings/RelaySuggestionsPanel.vue";

import { shortId } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";

const SECTIONS = [
  { id: "relays", label: "Relays" },
  { id: "sync", label: "Sync" },
  { id: "notifications", label: "Notifications" },
  { id: "appearance", label: "Appearance" },
  { id: "privacy", label: "Privacy & data" },
  { id: "account", label: "Account" },
  { id: "about", label: "About" },
];

const HIGHLIGHT_MS = 2200;

const route = useRoute();
const identity = useIdentityStore();
const scroller = ref(null);
const activeId = ref(SECTIONS[0].id);
const highlightId = ref("");
let highlightTimer = null;

const version = __APP_VERSION__;
const buildDate = new Date(__APP_BUILD_TIME__).toLocaleString(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const identityLabel = computed(() =>
  identity.pubkeyHex ? shortId(identity.pubkeyHex, 8, 4) : "—",
);

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  activeId.value = id;
}

function onScroll() {
  const node = scroller.value;
  if (!node) return;
  const threshold = node.getBoundingClientRect().top + 120;
  let current = SECTIONS[0].id;
  for (const section of SECTIONS) {
    const el = document.getElementById(section.id);
    if (el && el.getBoundingClientRect().top <= threshold) current = section.id;
  }
  activeId.value = current;
}

async function applyFocus() {
  const target = String(route.query.focus || "");
  if (!SECTIONS.some((section) => section.id === target)) return;
  await nextTick();
  scrollToSection(target);
  highlightId.value = target;
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlightId.value = "";
    highlightTimer = null;
  }, HIGHLIGHT_MS);
}

/** Amber pulse on the section the user was sent to. */
function highlightClass(id) {
  return highlightId.value === id
    ? "ring-2 ring-amber-400/40 shadow-[0_0_28px_rgba(251,191,36,0.14)]"
    : "";
}

onMounted(async () => {
  await nextTick();
  onScroll();
  scroller.value?.addEventListener("scroll", onScroll, { passive: true });
  void applyFocus();
});

watch(() => route.query.focus, applyFocus);

onUnmounted(() => {
  scroller.value?.removeEventListener("scroll", onScroll);
  if (highlightTimer) clearTimeout(highlightTimer);
});
</script>

<template>
  <div ref="scroller" class="h-full w-full min-w-0 overflow-y-auto bg-black pb-20 text-zinc-100">
    <main class="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <header class="flex items-start justify-between gap-3 pb-5">
        <div class="flex min-w-0 items-start gap-3">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-950/40 text-zinc-500"
          >
            <Settings class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
          </div>
          <div class="min-w-0">
            <h1 class="truncate text-lg font-semibold tracking-tight text-white">Settings</h1>
            <p class="mt-0.5 truncate text-xs leading-relaxed text-zinc-500">
              Signed in as
              <span class="font-mono text-zinc-400">{{ identityLabel }}</span>
              · changes save instantly
            </p>
          </div>
        </div>
      </header>

      <SettingsStatusStrip class="mb-6" />

      <div class="grid items-start gap-6 lg:grid-cols-[176px_minmax(0,1fr)]">
        <nav class="sticky top-4 hidden flex-col gap-0.5 lg:flex" aria-label="Settings sections">
          <button
            v-for="section in SECTIONS"
            :key="section.id"
            type="button"
            class="min-h-11 cursor-pointer rounded-r-lg border-l-2 px-3 text-left text-xs transition-colors duration-200"
            :class="
              activeId === section.id
                ? 'border-(--app-primary) bg-(--app-primary-soft) font-medium text-white'
                : 'border-transparent text-zinc-500 hover:bg-white/5 hover:text-zinc-200'
            "
            :aria-current="activeId === section.id ? 'true' : undefined"
            @click="scrollToSection(section.id)"
          >
            {{ section.label }}
          </button>
        </nav>

        <div class="min-w-0 space-y-5">
          <SettingsSection
            id="relays"
            title="Relays"
            description="Every configured relay is used for reads and writes."
            :class="highlightClass('relays')"
          >
            <CustomRelaysPanel />
            <RelaySuggestionsPanel />
          </SettingsSection>

          <SettingsSection
            id="sync"
            title="Sync"
            description="Replication to your relays, and what they still hold."
            :class="highlightClass('sync')"
          >
            <SettingsSyncPanel />
          </SettingsSection>

          <SettingsSection
            id="notifications"
            title="Notifications"
            description="Alerts on this device and through ntfy."
            :class="highlightClass('notifications')"
          >
            <SettingsNotificationsPanel />
          </SettingsSection>

          <SettingsSection
            id="appearance"
            title="Appearance"
            description="How Gupt looks on this device."
            :class="highlightClass('appearance')"
          >
            <SettingsAppearancePanel />
          </SettingsSection>

          <SettingsSection
            id="privacy"
            title="Privacy & data"
            description="Cached data is disposable; relays keep the originals."
            :class="highlightClass('privacy')"
          >
            <SettingsPrivacyPanel />
          </SettingsSection>

          <SettingsSection
            id="account"
            title="Account"
            description="Your identity, devices, and backups."
            :class="highlightClass('account')"
          >
            <SettingsAccountPanel />
          </SettingsSection>

          <SettingsSection
            id="about"
            title="About"
            description="Gupt is local-first: your relays hold the truth."
            :class="highlightClass('about')"
          >
            <SettingsRow title="Version" :description="`Build ${buildDate}`">
              <span class="font-mono text-[11px] text-zinc-400 tabular-nums">v{{ version }}</span>
            </SettingsRow>
            <SettingsRow title="Source & support" description="Issues, releases, and donations.">
              <a
                href="https://github.com/besoeasy/gupt"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-h-11 items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-[0.98] sm:min-h-8"
              >
                GitHub
                <ExternalLink class="h-3 w-3" :stroke-width="2" aria-hidden="true" />
              </a>
              <RouterLink
                to="/donate"
                class="inline-flex min-h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-[0.98] sm:min-h-8"
              >
                Donate
              </RouterLink>
            </SettingsRow>
          </SettingsSection>
        </div>
      </div>
    </main>
  </div>
</template>
