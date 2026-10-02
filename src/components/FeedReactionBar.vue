<script setup>
import { FEED_REACTIONS } from "@/lib/feed";

defineProps({
  counts: { type: Object, default: () => ({}) },
  myReaction: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["react"]);
</script>

<template>
  <div class="flex flex-wrap items-center gap-1" @click.stop>
    <button
      v-for="emoji in FEED_REACTIONS"
      :key="emoji"
      type="button"
      :disabled="disabled"
      class="inline-flex h-8 min-w-9 items-center justify-center gap-1 rounded-lg border px-2 text-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
      :class="
        myReaction === emoji
          ? 'border-zinc-600 bg-zinc-800/70'
          : 'border-zinc-800 bg-transparent hover:border-zinc-700 hover:bg-zinc-900/40'
      "
      :title="myReaction === emoji ? 'Tap to remove' : 'React'"
      @click="emit('react', emoji)"
    >
      <span>{{ emoji }}</span>
      <span
        v-if="counts?.[emoji]"
        class="font-mono text-[11px] font-medium tabular-nums"
        :class="myReaction === emoji ? 'text-zinc-100' : 'text-zinc-500'"
      >
        {{ counts[emoji] }}
      </span>
    </button>
  </div>
</template>
