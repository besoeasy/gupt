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
  <section class="flex items-center justify-between py-1">
    <h1 class="text-2xl font-bold tracking-tight text-white">Chats</h1>

    <div class="flex items-center gap-1">
      <!-- Copy ID -->
      <button
        class="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-zinc-300 transition-colors hover:bg-white/14 hover:text-white active:scale-90"
        :class="copied ? 'text-emerald-300' : ''"
        :title="copied ? 'Copied!' : 'Copy ID'"
        :aria-label="copied ? 'Copied!' : 'Copy ID'"
        @click="emit('copy-id')"
      >
        <Check v-if="copied" class="h-4 w-4" :stroke-width="2.2" aria-hidden="true" />
        <Copy v-else class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
      </button>

      <!-- Invite link -->
      <button
        class="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-zinc-300 transition-colors hover:bg-white/14 hover:text-white active:scale-90"
        :class="inviteCopied ? 'text-emerald-300' : ''"
        :title="inviteCopied ? 'Copied!' : 'Copy invite link'"
        :aria-label="inviteCopied ? 'Copied!' : 'Copy invite link'"
        @click="emit('copy-invite')"
      >
        <Check v-if="inviteCopied" class="h-4 w-4" :stroke-width="2.2" aria-hidden="true" />
        <Link2 v-else class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
      </button>

      <!-- New Group -->
      <button
        class="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-zinc-300 transition-colors hover:bg-white/14 hover:text-white active:scale-90"
        :class="activePanel === 'group' ? 'bg-white/16 text-white ring-1 ring-white/20' : ''"
        title="New Group"
        aria-label="New Group"
        @click="emit('toggle-panel', 'group')"
      >
        <Users class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
      </button>

      <!-- New Message -->
      <button
        class="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-zinc-300 transition-colors hover:bg-white/14 hover:text-white active:scale-90"
        :class="activePanel === 'dm' ? 'bg-white/16 text-white ring-1 ring-white/20' : ''"
        title="New Message"
        aria-label="New Message"
        @click="emit('toggle-panel', 'dm')"
      >
        <SquarePen class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>
