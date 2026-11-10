<script setup>
import CustomRelaysPanel from "@/components/settings/CustomRelaysPanel.vue";
</script>

<template>
  <section class="space-y-2">
    <div class="px-1">
      <h2 class="text-xs font-semibold tracking-tight text-zinc-200 sm:text-sm">
        Rabta Relays & Storage Nodes
      </h2>
      <p class="mt-0.5 text-xs text-zinc-500">
        Encrypted message streams and content-addressed media in one peer mesh.
      </p>
    </div>
    <CustomRelaysPanel />
  </section>
</template>
