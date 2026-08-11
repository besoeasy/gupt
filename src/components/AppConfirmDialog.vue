<script setup>
import { Trash2, X } from "@lucide/vue";

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: "Delete?" },
  message: { type: String, default: "This cannot be undone." },
  confirmLabel: { type: String, default: "Delete" },
});

const emit = defineEmits(["confirm", "cancel"]);
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      >
        <div class="absolute inset-0 bg-black/70" @click="emit('cancel')" />
        <div
          class="relative z-10 w-full max-w-sm overflow-hidden rounded-t-3xl border border-(--app-border) bg-(--app-surface) shadow-[0_24px_64px_rgba(0,0,0,0.4)] sm:rounded-3xl"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <div class="flex items-start justify-between gap-3 border-b border-(--app-border) px-5 py-4">
            <div class="min-w-0">
              <h2 class="text-base font-bold text-(--app-text)">{{ title }}</h2>
              <p class="mt-1 text-sm leading-6 text-(--app-muted)">{{ message }}</p>
            </div>
            <button
              type="button"
              class="rounded-xl p-1.5 text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
              title="Cancel"
              @click="emit('cancel')"
            >
              <X class="h-5 w-5" />
            </button>
          </div>
          <div class="flex justify-end gap-2 px-5 py-4">
            <button
              type="button"
              class="rounded-xl px-3.5 py-2 text-sm font-medium text-(--app-muted) transition-colors hover:text-(--app-text)"
              @click="emit('cancel')"
            >
              Cancel
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl bg-red-500/15 px-3.5 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/25"
              @click="emit('confirm')"
            >
              <Trash2 class="h-4 w-4" />
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
