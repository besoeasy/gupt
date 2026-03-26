<script setup>
import PrimaryButton from "@/components/PrimaryButton.vue";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

defineProps({
  activePanel: { type: String, default: "" },
  dmPubkey: { type: String, default: "" },
  name: { type: String, default: "" },
  description: { type: String, default: "" },
  openingDm: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:dmPubkey",
  "update:name",
  "update:description",
  "create-dm",
  "create-group",
]);
</script>

<template>
  <div v-if="activePanel === 'dm'" class="space-y-4">
    <div class="space-y-2">
      <Input
        :model-value="dmPubkey"
        placeholder="Recipient public key (64 or 66 hex chars)"
        @update:model-value="emit('update:dmPubkey', $event)"
      />
    </div>
    <PrimaryButton @click="emit('create-dm')" :loading="openingDm">
      {{ openingDm ? "Opening…" : "Open Conversation" }}
    </PrimaryButton>
    <p class="text-muted-foreground text-xs text-center">End-to-end encrypted</p>
  </div>

  <div v-else-if="activePanel === 'group'" class="space-y-4">
    <div class="space-y-2">
      <Input
        :model-value="name"
        placeholder="Group name"
        @update:model-value="emit('update:name', $event)"
      />
      <Textarea
        :model-value="description"
        rows="2"
        placeholder="Short description (optional)"
        class="resize-none"
        @update:model-value="emit('update:description', $event)"
      />
    </div>
    <PrimaryButton @click="emit('create-group')" :loading="saving">
      {{ saving ? "Creating…" : "Create Group" }}
    </PrimaryButton>
    <p class="text-muted-foreground text-xs text-center">
      Create a private group, then invite people later with automatic epoch rotation
    </p>
  </div>
</template>
