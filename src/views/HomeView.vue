<script setup>
import { MessageCircle } from "lucide-vue-next";
</script>

<template>
  <div class="chat-shell h-full text-white">
    <!-- Desktop: welcome panel (sidebar is rendered by App.vue) -->
    <div class="hidden lg:flex flex-col items-center justify-center h-full">
      <div class="text-center space-y-3">
        <div class="ui-surface mx-auto flex h-18 w-18 items-center justify-center rounded-3xl">
          <MessageCircle class="h-8 w-8 text-zinc-500" :stroke-width="1.5" aria-hidden="true" />
        </div>
        <h2 class="text-lg font-semibold text-zinc-300">Your messages</h2>
        <p class="max-w-xs text-sm text-zinc-500">
          Select a conversation from the sidebar or start a new chat.
        </p>
      </div>
    </div>
  </div>
</template>
