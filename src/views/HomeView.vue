<script setup>
import { MessageCircle } from "lucide-vue-next";
</script>

<template>
  <div class="h-full bg-black text-white">
    <!-- Desktop: welcome panel (sidebar is rendered by App.vue) -->
    <div class="hidden lg:flex flex-col items-center justify-center h-full">
      <div class="text-center space-y-3">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/8">
          <MessageCircle class="h-8 w-8 text-zinc-500" :stroke-width="1.5" aria-hidden="true" />
        </div>
        <h2 class="text-lg font-semibold text-zinc-300">Your messages</h2>
        <p class="max-w-xs text-sm text-zinc-600">
          Select a conversation from the sidebar or start a new chat.
        </p>
      </div>
    </div>
  </div>
</template>
