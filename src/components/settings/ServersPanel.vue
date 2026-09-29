<script setup>
import UploadServersPanel from "@/components/settings/UploadServersPanel.vue";
import OriginlessPerformancePanel from "@/components/settings/OriginlessPerformancePanel.vue";
import ActiveRelaysPanel from "@/components/settings/ActiveRelaysPanel.vue";
import CustomRelaysPanel from "@/components/settings/CustomRelaysPanel.vue";
</script>

<template>
  <div class="space-y-3">
    <CustomRelaysPanel />
    <ActiveRelaysPanel />
    <UploadServersPanel />
    <OriginlessPerformancePanel />
  </div>
</template>
