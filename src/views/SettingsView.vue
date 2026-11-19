<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Settings } from "@lucide/vue";
import SettingsGeneralPanel from "@/components/settings/SettingsGeneralPanel.vue";
import SettingsSyncPanel from "@/components/settings/SettingsSyncPanel.vue";
import ServersPanel from "@/components/settings/ServersPanel.vue";

const route = useRoute();
const version = __APP_VERSION__;
const buildDate = new Date(__APP_BUILD_TIME__).toLocaleString(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const highlightRelays = ref(false);
let highlightTimer = null;

async function focusRelays() {
  if (route.query.focus !== "relays") return;
  await nextTick();
  document.getElementById("relays")?.scrollIntoView({ behavior: "smooth", block: "start" });
  highlightRelays.value = true;
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlightRelays.value = false;
    highlightTimer = null;
  }, 2200);
}

onMounted(focusRelays);
watch(() => route.query.focus, focusRelays);

onUnmounted(() => {
  if (highlightTimer) clearTimeout(highlightTimer);
});
</script>

<template>
  <div class="h-full w-full min-w-0 overflow-y-auto bg-black pb-16 text-zinc-100">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-5">
      <header class="flex items-center gap-3 pb-6">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-950/40 text-zinc-500"
        >
          <Settings class="h-4 w-4" :stroke-width="2" />
        </div>
        <div class="min-w-0">
          <h1 class="truncate text-lg font-semibold tracking-tight text-white">Settings</h1>
          <p class="mt-0.5 truncate text-xs leading-relaxed text-zinc-500">
            Preferences, sync status, and relay health.
          </p>
        </div>
      </header>

      <div class="space-y-7">
        <SettingsGeneralPanel />
        <SettingsSyncPanel />
        <div
          id="relays"
          class="scroll-mt-20 rounded-2xl transition-shadow duration-500"
          :class="
            highlightRelays
              ? 'ring-2 ring-amber-400/40 shadow-[0_0_28px_rgba(251,191,36,0.14)]'
              : ''
          "
        >
          <ServersPanel />
        </div>
      </div>

      <div class="pt-8 pb-4 text-center">
        <p class="font-mono text-[10px] uppercase tracking-widest text-zinc-600 tabular-nums">
          v{{ version }} &middot; Build {{ buildDate }}
        </p>
      </div>
    </main>
  </div>
</template>
