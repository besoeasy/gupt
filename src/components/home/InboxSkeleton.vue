<script setup>
defineProps({
  rows: { type: Number, default: 7 },
});
</script>

<template>
  <div class="inbox-skeleton space-y-1 px-1" aria-hidden="true">
    <div v-for="i in rows" :key="i" class="flex items-center gap-2.5 rounded-xl px-2 py-2">
      <div
        class="h-11 w-11 shrink-0 rounded-full bg-[linear-gradient(90deg,color-mix(in_srgb,var(--app-surface-raised)_88%,transparent)_0%,color-mix(in_srgb,var(--app-surface-hover)_90%,transparent)_45%,color-mix(in_srgb,var(--app-surface-raised)_88%,transparent)_100%)] bg-[size:200%_100%] animate-[inbox-skeleton-shimmer_1.4s_ease-in-out_infinite]"
      />
      <div class="min-w-0 flex-1 space-y-2">
        <div
          class="h-3.5 w-[58%] rounded-md bg-[linear-gradient(90deg,color-mix(in_srgb,var(--app-surface-raised)_88%,transparent)_0%,color-mix(in_srgb,var(--app-surface-hover)_90%,transparent)_45%,color-mix(in_srgb,var(--app-surface-raised)_88%,transparent)_100%)] bg-[size:200%_100%] animate-[inbox-skeleton-shimmer_1.4s_ease-in-out_infinite]"
        />
        <div
          class="h-3 w-[82%] rounded-md bg-[linear-gradient(90deg,color-mix(in_srgb,var(--app-surface-raised)_88%,transparent)_0%,color-mix(in_srgb,var(--app-surface-hover)_90%,transparent)_45%,color-mix(in_srgb,var(--app-surface-raised)_88%,transparent)_100%)] bg-[size:200%_100%] animate-[inbox-skeleton-shimmer_1.4s_ease-in-out_infinite]"
        />
      </div>
      <div
        class="h-3 w-8 shrink-0 rounded-md bg-[linear-gradient(90deg,color-mix(in_srgb,var(--app-surface-raised)_88%,transparent)_0%,color-mix(in_srgb,var(--app-surface-hover)_90%,transparent)_45%,color-mix(in_srgb,var(--app-surface-raised)_88%,transparent)_100%)] bg-[size:200%_100%] animate-[inbox-skeleton-shimmer_1.4s_ease-in-out_infinite]"
      />
    </div>
  </div>
</template>
