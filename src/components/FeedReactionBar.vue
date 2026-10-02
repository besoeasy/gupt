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
      class="inline-flex h-8 min-w-9 items-center justify-center gap-1 rounded-xl border px-2 text-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
      :class="
        myReaction === emoji
          ? 'border-(--app-primary)/50 bg-(--app-primary)/10'
          : 'border-(--app-border) bg-transparent hover:border-(--app-primary)/30 hover:bg-(--app-surface-soft)'
      "
      :title="myReaction === emoji ? 'Tap to remove' : 'React'"
      @click="emit('react', emoji)"
    >
      <span>{{ emoji }}</span>
      <span
        v-if="counts?.[emoji]"
        class="text-[11px] font-bold tabular-nums"
        :class="myReaction === emoji ? 'text-(--app-primary)' : 'text-(--app-muted)'"
      >
        {{ counts[emoji] }}
      </span>
    </button>
  </div>
</template>
