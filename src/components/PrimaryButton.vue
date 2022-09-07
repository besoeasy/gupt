<script setup>
defineProps({
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
});
</script>

<template>
  <button
    :disabled="disabled || loading"
    class="group relative w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-(--app-primary) text-[#ffffff] hover:bg-(--app-primary-strong) disabled:opacity-50 disabled:cursor-not-allowed py-3.5 text-sm font-bold transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-primary)/45 focus-visible:ring-offset-2 focus-visible:ring-offset-(--app-bg)"
  >
    <!-- spinner overlay -->
    <span
      v-if="loading"
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
    >
      <svg
        class="animate-spin w-4 h-4 text-white/80"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </span>
    <span
      :class="loading ? 'opacity-0' : 'opacity-100'"
      class="inline-flex items-center gap-2 transition-opacity duration-150"
    >
      <slot />
    </span>
  </button>
</template>
