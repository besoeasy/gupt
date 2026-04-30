<script setup>
import { SquarePen, Users } from "lucide-vue-next";

defineProps({
  activePanel: { type: String, default: "" },
});

const emit = defineEmits(["toggle-panel"]);
</script>

<template>
  <section class="flex items-center justify-between py-1">
    <div>
      <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-success)">
        Private
      </p>
      <h1 class="text-2xl font-bold tracking-tight text-white">Messages</h1>
    </div>

    <div class="flex items-center gap-1">
      <!-- New Group -->
      <button
        class="ui-icon-button flex h-10 w-10 active:scale-90"
        :class="activePanel === 'group' ? 'ui-icon-button-active' : ''"
        title="New Group"
        aria-label="New Group"
        @click="emit('toggle-panel', 'group')"
      >
        <Users class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
      </button>

      <!-- New Message -->
      <button
        class="ui-icon-button flex h-10 w-10 active:scale-90"
        :class="activePanel === 'dm' ? 'ui-icon-button-active' : ''"
        title="New Message"
        aria-label="New Message"
        @click="emit('toggle-panel', 'dm')"
      >
        <SquarePen class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>
