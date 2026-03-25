<script setup>
import { Check, Copy, Link2, SquarePen, Users } from 'lucide-vue-next'

defineProps({
  activePanel: { type: String, default: '' },
  copied: { type: Boolean, default: false },
  inviteCopied: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle-panel', 'copy-id', 'copy-invite'])
</script>

<template>
  <section class="flex items-center justify-around px-2 py-1">
    <button
      class="flex flex-col items-center gap-2 px-3 py-2 transition-all duration-200 active:scale-[0.94]"
      :class="activePanel === 'dm' ? 'text-sky-400' : 'text-zinc-400 hover:text-zinc-100'"
      title="New Message"
      aria-label="New Message"
      @click="emit('toggle-panel', 'dm')"
    >
      <SquarePen class="h-5 w-5" :stroke-width="1.8" aria-hidden="true" />
      <span class="text-[11px] font-medium">Message</span>
    </button>

    <button
      class="flex flex-col items-center gap-2 px-3 py-2 transition-all duration-200 active:scale-[0.94]"
      :class="activePanel === 'group' ? 'text-sky-400' : 'text-zinc-400 hover:text-zinc-100'"
      title="New Group"
      aria-label="New Group"
      @click="emit('toggle-panel', 'group')"
    >
      <Users class="h-5 w-5" :stroke-width="1.8" aria-hidden="true" />
      <span class="text-[11px] font-medium">Group</span>
    </button>

    <button
      class="flex flex-col items-center gap-2 px-3 py-2 transition-all duration-200 active:scale-[0.94]"
      :class="copied ? 'text-emerald-400' : 'text-zinc-400 hover:text-zinc-100'"
      title="Copy ID"
      aria-label="Copy ID"
      @click="emit('copy-id')"
    >
      <Check
        v-if="copied"
        class="h-5 w-5 motion-safe:animate-pulse"
        :stroke-width="2"
        aria-hidden="true"
      />
      <Copy v-else class="h-5 w-5" :stroke-width="1.8" aria-hidden="true" />
      <span class="text-[11px] font-medium">{{ copied ? 'Copied' : 'Copy ID' }}</span>
    </button>

    <button
      class="flex flex-col items-center gap-2 px-3 py-2 transition-all duration-200 active:scale-[0.94]"
      :class="inviteCopied ? 'text-emerald-400' : 'text-zinc-400 hover:text-zinc-100'"
      title="Invite"
      aria-label="Invite"
      @click="emit('copy-invite')"
    >
      <Check
        v-if="inviteCopied"
        class="h-5 w-5 motion-safe:animate-pulse"
        :stroke-width="2"
        aria-hidden="true"
      />
      <Link2 v-else class="h-5 w-5" :stroke-width="1.8" aria-hidden="true" />
      <span class="text-[11px] font-medium">{{ inviteCopied ? 'Copied' : 'Invite' }}</span>
    </button>
  </section>
</template>
