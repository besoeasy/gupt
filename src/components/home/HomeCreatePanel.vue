<script setup>
import PrimaryButton from "@/components/PrimaryButton.vue";

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
  <div v-if="activePanel === 'dm'" class="space-y-3 pt-1">
    <p class="text-xs font-semibold uppercase tracking-wider text-zinc-500">New Direct Message</p>
    <input
      :value="dmPubkey"
      placeholder="Recipient public key (64 or 66 hex chars)"
      class="w-full bg-zinc-900/60 border border-white/8 rounded-2xl px-4 py-3 text-sm placeholder-zinc-600 focus:outline-none focus:border-white/20 transition-colors"
      @input="emit('update:dmPubkey', $event.target.value)"
    />
    <PrimaryButton @click="emit('create-dm')" :loading="openingDm">
      {{ openingDm ? "Opening…" : "Open Conversation" }}
    </PrimaryButton>
    <p class="text-zinc-600 text-xs text-center">End-to-end encrypted</p>
  </div>

  <div v-else-if="activePanel === 'group'" class="space-y-3 pt-1">
    <p class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Create Group</p>
    <input
      :value="name"
      placeholder="Group name"
      class="w-full bg-zinc-900/60 border border-white/8 rounded-2xl px-4 py-3 text-sm placeholder-zinc-600 focus:outline-none focus:border-white/20 transition-colors"
      @input="emit('update:name', $event.target.value)"
    />
    <textarea
      :value="description"
      rows="2"
      placeholder="Short description (optional)"
      class="w-full bg-zinc-900/60 border border-white/8 rounded-2xl px-4 py-3 text-sm placeholder-zinc-600 focus:outline-none focus:border-white/20 resize-none transition-colors"
      @input="emit('update:description', $event.target.value)"
    />
    <PrimaryButton @click="emit('create-group')" :loading="saving">
      {{ saving ? "Creating…" : "Create Group" }}
    </PrimaryButton>
    <p class="text-zinc-600 text-xs text-center">
      Create a private group, then invite people later with automatic epoch rotation
    </p>
  </div>
</template>
