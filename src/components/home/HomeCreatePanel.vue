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
  <form v-if="activePanel === 'dm'" class="space-y-5" @submit.prevent="emit('create-dm')">
    <div>
      <label class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-300">
        <KeyRound class="h-4 w-4 text-zinc-500" aria-hidden="true" />
        Public key or domain
      </label>
      <input
        :value="dmPubkey"
        placeholder="example.com, npub1…, or 64-char hex key"
        class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-sm leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--app-primary)_50%,transparent),0_0_0_4px_color-mix(in_srgb,var(--app-primary)_12%,transparent)]"
        :class="dmPubkey.includes('.') ? '' : 'font-mono'"
        autocomplete="off"
        spellcheck="false"
        @input="emit('update:dmPubkey', $event.target.value)"
      />
      <p class="mt-2 text-xs leading-relaxed text-zinc-500">
        Paste a Nostr public key, or enter a domain to look up its
        <span class="font-mono text-zinc-400">gupt.</span> TXT record.
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
        class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--app-primary)_50%,transparent),0_0_0_4px_color-mix(in_srgb,var(--app-primary)_12%,transparent)]"
        @input="emit('update:name', $event.target.value)"
      />
    </div>

    <div>
      <label class="mb-1.5 block text-sm font-medium text-zinc-300">Description (optional)</label>
      <textarea
        :value="description"
        rows="3"
        placeholder="What is this group for?"
        class="block min-h-[88px] w-full resize-y rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-[0.95rem] leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--app-primary)_50%,transparent),0_0_0_4px_color-mix(in_srgb,var(--app-primary)_12%,transparent)]"
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
