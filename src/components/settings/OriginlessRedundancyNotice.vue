<script setup>
import { AlertTriangle, ExternalLink } from "@lucide/vue";
import { useOriginlessServers } from "@/composables/useOriginlessServers";

const { count, needsRedundancy } = useOriginlessServers();
</script>

<template>
  <section
    v-if="needsRedundancy"
    class="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs"
  >
    <AlertTriangle class="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" :stroke-width="2" />
    <div class="min-w-0 space-y-1">
      <p class="font-semibold tracking-tight text-zinc-200">Single originless server</p>
      <p class="text-zinc-500 leading-relaxed">
        Only {{ count }} server{{ count === 1 ? "" : "s" }} configured. Add another for redundancy
        &mdash; ideally one you run yourself.
      </p>
      <a
        href="https://github.com/besoeasy/Originless"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1 font-medium text-zinc-200 hover:text-white hover:underline underline-offset-2"
      >
        <span>Originless setup on GitHub</span>
        <ExternalLink class="h-3 w-3 shrink-0" :stroke-width="2" />
      </a>
    </div>
  </section>
</template>
