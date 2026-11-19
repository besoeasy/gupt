<script setup>
import { computed, ref } from "vue";
import { ChevronDown } from "@lucide/vue";

import { useMediaQuery } from "@/composables/useMediaQuery";

const props = defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  /** Collapse the body behind a summary row on phones only. */
  collapsible: { type: Boolean, default: false },
  summary: { type: String, default: "" },
});

const isNarrow = useMediaQuery("(max-width: 639px)");
const open = ref(false);

const collapsibleHere = computed(() => props.collapsible && isNarrow.value);
const expanded = computed(() => !collapsibleHere.value || open.value);

function toggle() {
  open.value = !open.value;
}

/** Used by `?focus=` so a deep link never lands on a closed card. */
function expand() {
  open.value = true;
}

defineExpose({ expand });
</script>

<template>
  <section
    :id="id"
    class="scroll-mt-20 rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-4 transition-shadow duration-500"
  >
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold tracking-tight text-zinc-100">{{ title }}</h2>
        <p v-if="description" class="mt-0.5 text-xs leading-relaxed text-zinc-500">
          {{ description }}
        </p>
      </div>
      <slot name="action" />
    </header>

    <button
      v-if="collapsibleHere"
      type="button"
      class="mt-3 flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg border border-zinc-800/70 bg-zinc-900/40 px-3 text-left text-[11px] font-medium text-zinc-300 transition-colors duration-200 hover:border-zinc-700 hover:bg-zinc-900/70 active:scale-[0.995]"
      :aria-expanded="expanded"
      :aria-controls="`${id}-body`"
      @click="toggle"
    >
      <span class="min-w-0 flex-1 truncate font-mono text-[10px] tracking-tight text-zinc-400">
        {{ summary }}
      </span>
      <ChevronDown
        class="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-200"
        :class="expanded ? 'rotate-180' : ''"
        :stroke-width="2"
        aria-hidden="true"
      />
    </button>

    <div
      :id="`${id}-body`"
      class="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
      :class="expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      :inert="expanded ? null : ''"
    >
      <div class="overflow-hidden">
        <div class="mt-3">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>
