<script setup>
import { Check, Copy, Link2, SquarePen, Users } from "lucide-vue-next";
import { Button } from "@/components/ui/button";

defineProps({
  activePanel: { type: String, default: "" },
  copied: { type: Boolean, default: false },
  inviteCopied: { type: Boolean, default: false },
});

const emit = defineEmits(["toggle-panel", "copy-id", "copy-invite"]);
</script>

<template>
  <section class="flex items-center justify-around px-2 py-1">
    <Button
      variant="ghost"
      class="flex flex-col items-center gap-2 h-auto px-4 py-3"
      :class="activePanel === 'dm' ? 'text-primary' : 'text-muted-foreground'"
      title="New Message"
      aria-label="New Message"
      @click="emit('toggle-panel', 'dm')"
    >
      <SquarePen class="h-5 w-5" :stroke-width="1.8" aria-hidden="true" />
      <span class="text-[11px] font-medium">Message</span>
    </Button>

    <Button
      variant="ghost"
      class="flex flex-col items-center gap-2 h-auto px-4 py-3"
      :class="activePanel === 'group' ? 'text-primary' : 'text-muted-foreground'"
      title="New Group"
      aria-label="New Group"
      @click="emit('toggle-panel', 'group')"
    >
      <Users class="h-5 w-5" :stroke-width="1.8" aria-hidden="true" />
      <span class="text-[11px] font-medium">Group</span>
    </Button>

    <Button
      variant="ghost"
      class="flex flex-col items-center gap-2 h-auto px-4 py-3"
      :class="copied ? 'text-emerald-500 hover:text-emerald-600' : 'text-muted-foreground'"
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
      <span class="text-[11px] font-medium">{{ copied ? "Copied" : "Copy ID" }}</span>
    </Button>

    <Button
      variant="ghost"
      class="flex flex-col items-center gap-2 h-auto px-4 py-3"
      :class="inviteCopied ? 'text-emerald-500 hover:text-emerald-600' : 'text-muted-foreground'"
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
      <span class="text-[11px] font-medium">{{ inviteCopied ? "Copied" : "Invite" }}</span>
    </Button>
  </section>
</template>
