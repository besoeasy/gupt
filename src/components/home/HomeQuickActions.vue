<script setup>
import { Check, Copy, Link2, SquarePen, Users } from "lucide-vue-next";

defineProps({
  activePanel: { type: String, default: "" },
  copied: { type: Boolean, default: false },
  inviteCopied: { type: Boolean, default: false },
});

const emit = defineEmits(["toggle-panel", "copy-id", "copy-invite"]);
</script>

<template>
  <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
    <article
      class="group flex cursor-pointer flex-col items-start rounded-xl border border-zinc-700 bg-zinc-900/70 px-4 py-4 transition-colors duration-200 hover:border-zinc-500 hover:bg-zinc-800"
      role="button"
      tabindex="0"
      @click="emit('toggle-panel', 'dm')"
      @keydown.enter="emit('toggle-panel', 'dm')"
      title="New Message"
      aria-label="New Message"
    >
      <span class="text-xl mb-2">✉️</span>
      <h3 class="text-sm font-semibold uppercase tracking-wide text-zinc-100">Message</h3>
      <p class="text-xs text-zinc-400 mt-1">
        Open a new direct message room with anyone instantly.
      </p>
    </article>

    <article
      class="group flex cursor-pointer flex-col items-start rounded-xl border border-zinc-700 bg-zinc-900/70 px-4 py-4 transition-colors duration-200 hover:border-zinc-500 hover:bg-zinc-800"
      role="button"
      tabindex="0"
      @click="emit('toggle-panel', 'group')"
      @keydown.enter="emit('toggle-panel', 'group')"
      title="New Group"
      aria-label="New Group"
    >
      <span class="text-xl mb-2">👥</span>
      <h3 class="text-sm font-semibold uppercase tracking-wide text-zinc-100">Group</h3>
      <p class="text-xs text-zinc-400 mt-1">
        Create a group to chat and coordinate with multiple people.
      </p>
    </article>

    <article
      class="group flex cursor-pointer flex-col items-start rounded-xl border border-zinc-700 bg-zinc-900/70 px-4 py-4 transition-colors duration-200 hover:border-zinc-500 hover:bg-zinc-800"
      role="button"
      tabindex="0"
      @click="emit('copy-id')"
      @keydown.enter="emit('copy-id')"
      title="Copy ID"
      aria-label="Copy ID"
    >
      <span class="text-xl mb-2">📋</span>
      <h3 class="text-sm font-semibold uppercase tracking-wide text-zinc-100">Copy ID</h3>
      <p class="text-xs text-zinc-400 mt-1">Copy your public ID to share with contacts.</p>
      <p v-if="copied" class="text-[10px] text-emerald-300 mt-1">Copied to clipboard!</p>
    </article>

    <article
      class="group flex cursor-pointer flex-col items-start rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 transition-colors duration-200 hover:border-emerald-400 hover:bg-emerald-500/20"
      role="button"
      tabindex="0"
      @click="emit('copy-invite')"
      @keydown.enter="emit('copy-invite')"
      title="Invite"
      aria-label="Invite"
    >
      <span class="text-xl mb-2">🔗</span>
      <h3 class="text-sm font-semibold uppercase tracking-wide text-emerald-100">Invite</h3>
      <p class="text-xs text-emerald-200 mt-1">Copy your invite URL and share it with friends.</p>
      <p v-if="inviteCopied" class="text-[10px] text-emerald-100 mt-1">Copied to clipboard!</p>
    </article>
  </section>
</template>
