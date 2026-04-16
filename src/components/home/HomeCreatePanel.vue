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
  <div v-if="activePanel === 'dm'" class="rounded-2xl bg-white/[0.04] p-4 space-y-3">
    <p class="text-xs font-semibold text-zinc-400">New Message</p>
    <input
      :value="dmPubkey"
      placeholder="Recipient public key (64 or 66 hex chars)"
      class="w-full rounded-full bg-white/8 px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:bg-white/12 transition-colors"
      @input="emit('update:dmPubkey', $event.target.value)"
    />
    <PrimaryButton @click="emit('create-dm')" :loading="openingDm">
      {{ openingDm ? "Opening…" : "Open Conversation" }}
    </PrimaryButton>
    <p class="text-zinc-500 text-[11px] text-center">End-to-end encrypted</p>
  </div>

  <div v-else-if="activePanel === 'group'" class="rounded-2xl bg-white/[0.04] p-4 space-y-3">
    <p class="text-xs font-semibold text-zinc-400">Create Group</p>
    <input
      :value="name"
      placeholder="Group name"
      class="w-full rounded-full bg-white/8 px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:bg-white/12 transition-colors"
      @input="emit('update:name', $event.target.value)"
    />
    <textarea
      :value="description"
      rows="2"
      placeholder="Short description (optional)"
      class="w-full rounded-2xl bg-white/8 px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:bg-white/12 resize-none transition-colors"
      @input="emit('update:description', $event.target.value)"
    />
    <PrimaryButton @click="emit('create-group')" :loading="saving">
      {{ saving ? "Creating…" : "Create Group" }}
    </PrimaryButton>
    <p class="text-zinc-500 text-[11px] text-center">
      Invite people later with automatic epoch rotation
    </p>
  </div>
</template>
