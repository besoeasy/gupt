<script setup>
import { MessageCircle } from "lucide-vue-next";
</script>

<template>
  <div
    class="h-full flex flex-col items-center justify-center p-6 text-center bg-[linear-gradient(180deg,color-mix(in_srgb,var(--app-surface)_62%,transparent),var(--app-bg))] text-(--app-text)"
  >
    <div
      class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] p-6 rounded-[2rem] shadow-xl border border-white/5 bg-black/10 backdrop-blur-md mb-6"
    >
      <MessageCircle class="h-12 w-12 text-zinc-600" />
    </div>
    <h2 class="text-2xl font-bold tracking-tight text-zinc-300">Your Messages</h2>
    <p class="text-base text-zinc-500 max-w-sm mt-2">
      Select a conversation from the sidebar or start a new end-to-end encrypted chat.
    </p>
  </div>
</template>
