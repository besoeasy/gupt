<script setup>
defineProps({
  rows: { type: Number, default: 7 },
});
</script>

<template>
  <div class="inbox-skeleton space-y-1 px-1" aria-hidden="true">
    <div
      v-for="i in rows"
      :key="i"
      class="inbox-skeleton-row flex items-center gap-2.5 rounded-xl px-2 py-2"
    >
      <div class="inbox-skeleton-avatar h-11 w-11 shrink-0 rounded-full" />
      <div class="min-w-0 flex-1 space-y-2">
        <div class="inbox-skeleton-line h-3.5 w-[58%] rounded-md" />
        <div class="inbox-skeleton-line h-3 w-[82%] rounded-md" />
      </div>
      <div class="inbox-skeleton-line h-3 w-8 shrink-0 rounded-md" />
    </div>
  </div>
</template>
