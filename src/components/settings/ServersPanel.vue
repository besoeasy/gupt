<script setup>
import CustomRelaysPanel from "@/components/settings/CustomRelaysPanel.vue";
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Rabta Relays & Storage Nodes
        </h2>
      </div>
      <p class="text-xs text-zinc-400">
        Rabta relays host both encrypted message streams and content-addressed media blobs in a
        single unified peer mesh.
      </p>
      <CustomRelaysPanel />
    </section>
  </div>
</template>
