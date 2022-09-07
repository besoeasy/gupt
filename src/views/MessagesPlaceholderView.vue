<script setup>
import { MessageCircle } from "lucide-vue-next";
</script>

<template>
  <div class="chat-shell h-full flex flex-col items-center justify-center p-6 text-center">
    <div
      class="ui-panel p-6 rounded-[2rem] shadow-xl border border-white/5 bg-black/10 backdrop-blur-md mb-6"
    >
      <MessageCircle class="h-12 w-12 text-zinc-600" />
    </div>
    <h2 class="text-2xl font-bold tracking-tight text-zinc-300">Your Messages</h2>
    <p class="text-base text-zinc-500 max-w-sm mt-2">
      Select a conversation from the sidebar or start a new end-to-end encrypted chat.
    </p>
  </div>
</template>
