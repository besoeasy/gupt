<script setup>
import SettingsRow from "@/components/settings/SettingsRow.vue";
import { useThemeStore } from "@/stores/theme";

const theme = useThemeStore();

function select(mode) {
  const wantsDark = mode === "dark";
  if (theme.isDark !== wantsDark) theme.toggle();
}
</script>

<template>
  <div>
    <SettingsRow title="Theme" description="Applies everywhere, immediately.">
      <div
        class="inline-flex gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5"
        role="group"
        aria-label="Theme"
      >
        <button
          type="button"
          class="min-h-11 min-w-14 cursor-pointer rounded-md px-3 text-[11px] font-medium transition-colors duration-200 active:scale-[0.98] sm:min-h-8"
          :class="theme.isDark ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'"
          :aria-pressed="theme.isDark"
          @click="select('dark')"
        >
          Dark
        </button>
        <button
          type="button"
          class="min-h-11 min-w-14 cursor-pointer rounded-md px-3 text-[11px] font-medium transition-colors duration-200 active:scale-[0.98] sm:min-h-8"
          :class="!theme.isDark ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'"
          :aria-pressed="!theme.isDark"
          @click="select('light')"
        >
          Light
        </button>
      </div>
    </SettingsRow>
  </div>
</template>
