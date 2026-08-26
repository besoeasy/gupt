<script setup>
import { computed } from "vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { KeyRound, Plus, X, Hash, ShieldCheck, Check } from "@lucide/vue";

const props = defineProps({
  activePanel: { type: String, default: "" },
  dmPubkey: { type: String, default: "" },
  name: { type: String, default: "" },
  memberInput: { type: String, default: "" },
  members: { type: Array, default: () => [] },
  trustedContacts: { type: Array, default: () => [] },
  openingDm: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:dmPubkey",
  "update:name",
  "update:memberInput",
  "add-member",
  "remove-member",
  "toggle-trusted-member",
  "create-dm",
  "create-group",
]);

function isSelected(pubkey) {
  return props.members.some((m) => m.pubkey === pubkey);
}

const extraMembers = computed(() => {
  const trusted = new Set(props.trustedContacts.map((c) => c.pubkey));
  return props.members.filter((m) => !trusted.has(m.pubkey));
});
</script>

<template>
  <form v-if="activePanel === 'dm'" class="space-y-5" @submit.prevent="emit('create-dm')">
    <div>
      <label class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-(--app-text)">
        <KeyRound class="h-4 w-4 text-(--app-muted)" aria-hidden="true" />
        Public key or domain
      </label>
      <input
        :value="dmPubkey"
        placeholder="example.com, npub1…, or 64-char hex key"
        class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-sm leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--app-primary)_50%,transparent),0_0_0_4px_color-mix(in_srgb,var(--app-primary)_12%,transparent)]"
        :class="dmPubkey.includes('.') ? '' : 'font-mono'"
        autocomplete="off"
        spellcheck="false"
        @input="emit('update:dmPubkey', $event.target.value)"
      />
      <p class="mt-2 text-xs leading-relaxed text-(--app-muted)">
        Paste a public key, or enter a domain to look up its
        <span class="font-mono text-(--app-text-soft)">gupt.</span> TXT record.
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
      <label class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-(--app-text)">
        <Hash class="h-4 w-4 text-(--app-muted)" aria-hidden="true" />
        Name
      </label>
      <input
        :value="name"
        placeholder="e.g. crew, family2024"
        class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-sm leading-[1.5] font-mono text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--app-primary)_50%,transparent),0_0_0_4px_color-mix(in_srgb,var(--app-primary)_12%,transparent)]"
        autocomplete="off"
        spellcheck="false"
        @input="emit('update:name', $event.target.value)"
      />
      <p class="mt-2 text-xs leading-relaxed text-(--app-muted)">
        Letters and numbers — this is the group id, and it stays the same when members join or
        leave.
      </p>
    </div>

    <div>
      <label class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-(--app-text)">
        <Plus class="h-4 w-4 text-(--app-muted)" aria-hidden="true" />
        Members
      </label>
      <div v-if="trustedContacts.length" class="mb-3 flex flex-wrap gap-2">
        <button
          v-for="c in trustedContacts"
          :key="c.pubkey"
          type="button"
          class="inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-all active:scale-95"
          :class="
            isSelected(c.pubkey)
              ? 'border-(--app-primary) bg-(--app-primary-soft) text-(--app-text)'
              : 'border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
          "
          :title="c.label"
          :aria-pressed="isSelected(c.pubkey)"
          @click="emit('toggle-trusted-member', c)"
        >
          <RoboAvatar :pubkey="c.pubkey" :src="c.picture" size="sm" rounded="xl" />
          <span class="min-w-0 truncate text-xs font-semibold">{{ c.label }}</span>
          <ShieldCheck class="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
          <Check
            v-if="isSelected(c.pubkey)"
            class="h-3.5 w-3.5 shrink-0 text-(--app-primary)"
            aria-hidden="true"
          />
        </button>
      </div>
      <div class="flex gap-2">
        <input
          :value="memberInput"
          placeholder="example.com or 64-char hex key"
          class="block min-w-0 flex-1 rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-sm leading-[1.5] font-mono text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--app-primary)_50%,transparent),0_0_0_4px_color-mix(in_srgb,var(--app-primary)_12%,transparent)]"
          autocomplete="off"
          spellcheck="false"
          @input="emit('update:memberInput', $event.target.value)"
          @keydown.enter.prevent="emit('add-member')"
        />
        <button
          type="button"
          @click="emit('add-member')"
          class="inline-flex shrink-0 items-center justify-center rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-3.5 text-sm font-semibold text-(--app-text-soft) transition-all hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) active:scale-95"
        >
          Add
        </button>
      </div>
      <ul v-if="extraMembers.length" class="mt-3 space-y-2">
        <li
          v-for="m in extraMembers"
          :key="m.pubkey"
          class="flex items-center justify-between gap-2 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2"
        >
          <span class="min-w-0 truncate font-mono text-xs text-(--app-text-soft)">
            {{ m.label || m.pubkey }}
          </span>
          <button
            type="button"
            @click="emit('remove-member', m.pubkey)"
            class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-(--app-muted) transition-all hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            :aria-label="'Remove ' + (m.label || m.pubkey)"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </li>
      </ul>
      <p class="mt-2 text-xs leading-relaxed text-(--app-muted)">
        Tap a trusted contact, or paste a public key or domain. They will see the group when you
        send the first message.
      </p>
    </div>

    <PrimaryButton type="submit" :loading="saving">
      {{ saving ? "Creating…" : "Create group" }}
    </PrimaryButton>
  </form>
</template>
