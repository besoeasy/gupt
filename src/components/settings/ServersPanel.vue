<script setup>
import { ref } from "vue";
import { Radio, UploadCloud } from "@lucide/vue";
import UploadServersPanel from "@/components/settings/UploadServersPanel.vue";
import OriginlessPerformancePanel from "@/components/settings/OriginlessPerformancePanel.vue";
import ActiveRelaysPanel from "@/components/settings/ActiveRelaysPanel.vue";
import CustomRelaysPanel from "@/components/settings/CustomRelaysPanel.vue";

const TABS = [
  { id: "relay", label: "Relay", icon: Radio },
  { id: "originless", label: "Originless", icon: UploadCloud },
];

const activeTab = ref("relay");
</script>

<template>
  <div class="space-y-3">
    <!-- Vercel-style Segmented Control Bar -->
    <div
      class="inline-flex p-0.5 rounded-lg border border-zinc-800/80 bg-zinc-950/60 overflow-x-auto max-w-full [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-all cursor-pointer select-none"
        :class="
          activeTab === tab.id
            ? 'bg-zinc-800 text-white shadow-xs'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
        "
        @click="activeTab = tab.id"
      >
        <component :is="tab.icon" class="h-3.5 w-3.5 shrink-0" :stroke-width="2" />
        {{ tab.label }}
      </button>
    </div>

    <template v-if="activeTab === 'relay'">
      <section class="space-y-2">
        <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          User set servers
        </h2>
        <CustomRelaysPanel />
      </section>
      <ActiveRelaysPanel />
    </template>

    <template v-else>
      <section class="space-y-2">
        <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          User set servers
        </h2>
        <UploadServersPanel />
      </section>
      <OriginlessPerformancePanel />
    </template>
  </div>
</template>
