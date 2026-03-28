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
  <section class="grid grid-cols-4 gap-1 sm:gap-3">
    <!-- Message -->
    <article
      class="group flex flex-col items-center justify-center cursor-pointer rounded-md sm:rounded-xl border border-zinc-700 bg-zinc-900/70 p-2 sm:px-4 sm:py-4 transition-colors duration-200 hover:border-zinc-500 hover:bg-zinc-800 min-h-12 sm:min-h-22"
      role="button"
      tabindex="0"
      @click="emit('toggle-panel', 'dm')"
      @keydown.enter="emit('toggle-panel', 'dm')"
      title="New Message"
      aria-label="New Message"
    >
      <SquarePen class="w-6 h-6 sm:w-7 sm:h-7 text-zinc-100" />
      <h3 class="hidden sm:block text-xs font-semibold tracking-wide text-zinc-100 mt-2">
        Message
      </h3>
      <p class="hidden lg:block text-xs text-zinc-400 mt-1 text-center">
        Open a new direct message room with anyone instantly.
      </p>
    </article>

    <!-- Group -->
    <article
      class="group flex flex-col items-center justify-center cursor-pointer rounded-md sm:rounded-xl border border-zinc-700 bg-zinc-900/70 p-2 sm:px-4 sm:py-4 transition-colors duration-200 hover:border-zinc-500 hover:bg-zinc-800 min-h-12 sm:min-h-22"
      role="button"
      tabindex="0"
      @click="emit('toggle-panel', 'group')"
      @keydown.enter="emit('toggle-panel', 'group')"
      title="New Group"
      aria-label="New Group"
    >
      <Users class="w-6 h-6 sm:w-7 sm:h-7 text-zinc-100" />
      <h3 class="hidden sm:block text-xs font-semibold tracking-wide text-zinc-100 mt-2">Group</h3>
      <p class="hidden lg:block text-xs text-zinc-400 mt-1 text-center">
        Create a group to chat and coordinate with multiple people.
      </p>
    </article>

    <!-- Copy ID -->
    <article
      class="group flex flex-col items-center justify-center cursor-pointer rounded-md sm:rounded-xl border border-zinc-700 bg-zinc-900/70 p-2 sm:px-4 sm:py-4 transition-colors duration-200 hover:border-zinc-500 hover:bg-zinc-800 min-h-12 sm:min-h-22"
      role="button"
      tabindex="0"
      @click="emit('copy-id')"
      @keydown.enter="emit('copy-id')"
      title="Copy ID"
      aria-label="Copy ID"
    >
      <Copy class="w-6 h-6 sm:w-7 sm:h-7 text-zinc-100" />
      <h3 class="hidden sm:block text-xs font-semibold tracking-wide text-zinc-100 mt-2">
        Copy ID
      </h3>
      <p class="hidden lg:block text-xs text-zinc-400 mt-1 text-center">
        Copy your public ID to share with contacts.
      </p>
      <p v-if="copied" class="hidden sm:block text-[10px] text-emerald-300 mt-1">
        Copied to clipboard!
      </p>
    </article>

    <!-- Invite -->
    <article
      class="group flex flex-col items-center justify-center cursor-pointer rounded-md sm:rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 sm:px-4 sm:py-4 transition-colors duration-200 hover:border-emerald-400 hover:bg-emerald-500/20 min-h-12 sm:min-h-22"
      role="button"
      tabindex="0"
      @click="emit('copy-invite')"
      @keydown.enter="emit('copy-invite')"
      title="Invite"
      aria-label="Invite"
    >
      <Link2 class="w-6 h-6 sm:w-7 sm:h-7 text-emerald-100" />
      <h3 class="hidden sm:block text-xs font-semibold tracking-wide text-emerald-100 mt-2">
        Invite
      </h3>
      <p class="hidden lg:block text-xs text-emerald-200 mt-1 text-center">
        Copy your invite URL and share it with friends.
      </p>
      <p v-if="inviteCopied" class="hidden sm:block text-[10px] text-emerald-100 mt-1">
        Copied to clipboard!
      </p>
    </article>
  </section>
</template>
