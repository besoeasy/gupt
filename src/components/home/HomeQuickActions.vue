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
  <section
    class="mx-3 mt-4 mb-2 flex flex-row items-center justify-between gap-1 rounded-2xl bg-muted/40 p-2"
  >
    <Button
      variant="ghost"
      class="flex flex-1 h-14 flex-col items-center justify-center gap-1 rounded-xl transition-all hover:bg-background/60 text-muted-foreground"
      title="New Message"
      aria-label="New Message"
      @click="emit('toggle-panel', 'dm')"
    >
      <SquarePen class="h-[18px] w-[18px]" :stroke-width="1.8" aria-hidden="true" />
      <span class="text-[10px] font-medium leading-none">Message</span>
    </Button>

    <Button
      variant="ghost"
      class="flex flex-1 h-14 flex-col items-center justify-center gap-1 rounded-xl transition-all hover:bg-background/60 text-muted-foreground"
      title="New Group"
      aria-label="New Group"
      @click="emit('toggle-panel', 'group')"
    >
      <Users class="h-[18px] w-[18px]" :stroke-width="1.8" aria-hidden="true" />
      <span class="text-[10px] font-medium leading-none">Group</span>
    </Button>

    <Button
      variant="ghost"
      class="flex flex-1 h-14 flex-col items-center justify-center gap-1 rounded-xl transition-all hover:bg-background/60"
      :class="copied ? 'text-emerald-500 hover:text-emerald-600' : 'text-muted-foreground'"
      title="Copy ID"
      aria-label="Copy ID"
      @click="emit('copy-id')"
    >
      <Check
        v-if="copied"
        class="h-[18px] w-[18px] motion-safe:animate-pulse"
        :stroke-width="2"
        aria-hidden="true"
      />
      <Copy v-else class="h-[18px] w-[18px]" :stroke-width="1.8" aria-hidden="true" />
      <span class="text-[10px] font-medium leading-none">{{ copied ? "Copied" : "Copy ID" }}</span>
    </Button>

    <Button
      variant="ghost"
      class="flex flex-1 h-14 flex-col items-center justify-center gap-1 rounded-xl transition-all hover:bg-background/60"
      :class="inviteCopied ? 'text-emerald-500 hover:text-emerald-600' : 'text-muted-foreground'"
      title="Invite"
      aria-label="Invite"
      @click="emit('copy-invite')"
    >
      <Check
        v-if="inviteCopied"
        class="h-[18px] w-[18px] motion-safe:animate-pulse"
        :stroke-width="2"
        aria-hidden="true"
      />
      <Link2 v-else class="h-[18px] w-[18px]" :stroke-width="1.8" aria-hidden="true" />
      <span class="text-[10px] font-medium leading-none">{{
        inviteCopied ? "Copied" : "Invite"
      }}</span>
    </Button>
  </section>
</template>
