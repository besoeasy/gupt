<script setup>
import { useRouter } from "vue-router";
import { MessageSquare, SquarePen, UserPlus, Shield } from "@lucide/vue";

const router = useRouter();
</script>

<template>
  <div
    class="flex h-full w-full flex-col items-center justify-center bg-(--app-bg) p-6 text-center text-(--app-text)"
  >
    <div class="max-w-md space-y-6">
      <!-- Icon Container -->
      <div
        class="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-(--app-border) bg-(--app-surface) shadow-sm"
      >
        <MessageSquare class="h-10 w-10 text-(--app-primary)" :stroke-width="1.75" />
      </div>

      <!-- Title & Description -->
      <div class="space-y-2">
        <h2 class="text-xl font-bold tracking-tight">Your Messages</h2>
        <p class="text-xs leading-relaxed text-(--app-muted)">
          Select a conversation from the sidebar or start a new encrypted message with your
          contacts.
        </p>
      </div>

      <!-- Quick Action Buttons -->
      <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          type="button"
          @click="router.push('/new/start')"
          class="inline-flex items-center gap-2 rounded-2xl bg-(--app-primary) px-4 py-2.5 text-xs font-semibold text-zinc-950 transition-all hover:bg-(--app-primary-strong) hover:scale-[1.02] active:scale-95"
        >
          <SquarePen class="h-4 w-4" :stroke-width="2" />
          Start New Chat
        </button>

        <button
          type="button"
          @click="router.push('/new/share')"
          class="inline-flex items-center gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-2.5 text-xs font-semibold text-(--app-text) transition-all hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) active:scale-95"
        >
          <UserPlus class="h-4 w-4" :stroke-width="2" />
          Share Invite Link
        </button>
      </div>

      <!-- Feature Pill -->
      <div
        class="inline-flex items-center gap-2 rounded-full border border-(--app-border) bg-(--app-surface-soft) px-3 py-1.5 text-[11px] text-(--app-muted)"
      >
        <Shield class="h-3.5 w-3.5 text-emerald-400" :stroke-width="2" />
        <span>End-to-End Encrypted via Nostr</span>
      </div>
    </div>
  </div>
</template>
