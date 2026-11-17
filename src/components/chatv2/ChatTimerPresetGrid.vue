<script setup>
import { computed } from "vue";
import { CHAT_TIMER_PRESETS } from "@/lib/chatTimer";

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  columns: { type: Number, default: 3 },
});

const emit = defineEmits(["select"]);

const gridClass = computed(() => (props.columns >= 4 ? "grid-cols-4" : "grid-cols-3"));
</script>

<template>
  <div class="grid gap-1.5" :class="gridClass">
    <button
      v-for="preset in CHAT_TIMER_PRESETS"
      :key="preset.sec"
      type="button"
      class="min-h-[44px] rounded-lg border px-1.5 text-[11px] font-mono transition-all duration-150 cursor-pointer active:scale-[0.97]"
      :class="
        preset.sec === modelValue
          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
          : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-white'
      "
      :aria-pressed="preset.sec === modelValue"
      :title="'Messages expire after ' + preset.label"
      @click="emit('select', preset.sec)"
    >
      {{ preset.short }}
    </button>
  </div>
</template>
