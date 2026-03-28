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
      class="group flex flex-col items-center justify-center cursor-pointer rounded-md sm:rounded-xl p-2 sm:px-4 sm:py-4 min-h-12 sm:min-h-22 transition-colors duration-200 hover:bg-zinc-800/30 focus:bg-zinc-800/40"
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
      <!-- No description -->
    </article>

    <!-- Group -->
    <article
      class="group flex flex-col items-center justify-center cursor-pointer rounded-md sm:rounded-xl p-2 sm:px-4 sm:py-4 min-h-12 sm:min-h-22 transition-colors duration-200 hover:bg-zinc-800/30 focus:bg-zinc-800/40"
      role="button"
      tabindex="0"
      @click="emit('toggle-panel', 'group')"
      @keydown.enter="emit('toggle-panel', 'group')"
      title="New Group"
      aria-label="New Group"
    >
      <Users class="w-6 h-6 sm:w-7 sm:h-7 text-zinc-100" />
      <h3 class="hidden sm:block text-xs font-semibold tracking-wide text-zinc-100 mt-2">Group</h3>
      <!-- No description -->
    </article>

    <!-- Copy ID -->
    <article
      class="group flex flex-col items-center justify-center cursor-pointer rounded-md sm:rounded-xl p-2 sm:px-4 sm:py-4 min-h-12 sm:min-h-22 transition-colors duration-200 hover:bg-zinc-800/30 focus:bg-zinc-800/40"
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
      <!-- No description -->
      <p v-if="copied" class="hidden sm:block text-[10px] text-emerald-300 mt-1">
        Copied to clipboard!
      </p>
    </article>

    <!-- Invite -->
    <article
      class="group flex flex-col items-center justify-center cursor-pointer rounded-md sm:rounded-xl p-2 sm:px-4 sm:py-4 min-h-12 sm:min-h-22 transition-colors duration-200 hover:bg-emerald-500/10 focus:bg-emerald-500/20"
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
      <!-- No description -->
      <p v-if="inviteCopied" class="hidden sm:block text-[10px] text-emerald-100 mt-1">
        Copied to clipboard!
      </p>
    </article>
  </section>
</template>
