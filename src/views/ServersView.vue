<script setup>
import { ref } from "vue";
import { Radio, UploadCloud } from "@lucide/vue";
import UiTabBar from "@/components/UiTabBar.vue";
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
  <div class="min-h-screen pb-12">
    <main class="mx-auto w-full max-w-[80rem] px-4 py-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-5">
        <UiTabBar v-model="activeTab" :tabs="TABS" variant="surface" />

        <template v-if="activeTab === 'relay'">
          <section class="space-y-2">
            <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-(--app-muted)">
              User set servers
            </h2>
            <CustomRelaysPanel />
          </section>
          <section class="space-y-2">
            <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-(--app-muted)">
              Active servers
            </h2>
            <ActiveRelaysPanel />
          </section>
        </template>

        <template v-else>
          <section class="space-y-2">
            <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-(--app-muted)">
              User set servers
            </h2>
            <UploadServersPanel />
          </section>
          <section class="space-y-2">
            <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-(--app-muted)">
              Active servers
            </h2>
            <OriginlessPerformancePanel />
          </section>
        </template>
      </div>
    </main>
  </div>
</template>
