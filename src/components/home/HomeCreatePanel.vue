<script setup>
import PrimaryButton from "@/components/PrimaryButton.vue";
import { KeyRound, Users } from "lucide-vue-next";

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
  <form
    v-if="activePanel === 'dm'"
    class="space-y-5"
    @submit.prevent="emit('create-dm')"
  >
    <div>
      <label class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-300">
        <KeyRound class="h-4 w-4 text-zinc-500" aria-hidden="true" />
        Recipient public key
      </label>
      <input
        :value="dmPubkey"
        placeholder="64-char x-only or 66-char compressed hex key"
        class="ui-input w-full font-mono text-sm"
        autocomplete="off"
        spellcheck="false"
        @input="emit('update:dmPubkey', $event.target.value)"
      />
      <p class="mt-2 text-xs leading-relaxed text-zinc-500">
        Paste their Nostr public key to open an end-to-end encrypted direct message.
      </p>
    </div>

    <PrimaryButton type="submit" :loading="openingDm">
      {{ openingDm ? "Opening…" : "Open conversation" }}
    </PrimaryButton>
  </form>

  <form
    v-else-if="activePanel === 'group'"
    class="space-y-5"
    @submit.prevent="emit('create-group')"
  >
    <div>
      <label class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-300">
        <Users class="h-4 w-4 text-zinc-500" aria-hidden="true" />
        Group name
      </label>
      <input
        :value="name"
        placeholder="e.g. Project crew, Family, Ops"
        class="ui-input w-full"
        @input="emit('update:name', $event.target.value)"
      />
    </div>

    <div>
      <label class="mb-1.5 block text-sm font-medium text-zinc-300">Description (optional)</label>
      <textarea
        :value="description"
        rows="3"
        placeholder="What is this group for?"
        class="ui-input min-h-[88px] w-full resize-y"
        @input="emit('update:description', $event.target.value)"
      />
      <p class="mt-2 text-xs leading-relaxed text-zinc-500">
        You can invite members after the group is created. Epoch rotation keeps membership private.
      </p>
    </div>

    <PrimaryButton type="submit" :loading="saving">
      {{ saving ? "Creating…" : "Create group" }}
    </PrimaryButton>
  </form>
</template>