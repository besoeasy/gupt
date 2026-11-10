<script setup>
import PageBackHeader from "@/components/PageBackHeader.vue";
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <PageBackHeader back-to="/chat" back-label="Chat" title="Invite" />
      </div>
    </div>
  </main>
</template>
