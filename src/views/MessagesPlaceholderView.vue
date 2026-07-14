<script setup>
import { MessageCircle, SquarePen, UserPlus, ShieldCheck, Lock } from "@lucide/vue";
import { useRouter } from "vue-router";

const router = useRouter();
</script>

<template>
  <div
    class="h-full flex flex-col items-center justify-center p-6 text-center bg-(--app-bg) text-(--app-text)"
  >
    <div class="w-full max-w-md flex flex-col items-center">
      <!-- Icon -->
      <div
        class="relative mb-8 flex h-20 w-20 items-center justify-center rounded-3xl border border-(--app-border) bg-(--app-surface-soft) shadow-xl ring-1 ring-white/5"
      >
        <MessageCircle
          class="h-10 w-10 text-(--app-primary)"
          :stroke-width="1.6"
          aria-hidden="true"
        />
        <div
          class="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-(--app-border) bg-(--app-surface) shadow-sm"
        >
          <Lock class="h-3.5 w-3.5 text-(--app-success)" :stroke-width="2.5" aria-hidden="true" />
        </div>
      </div>

      <h2 class="text-2xl font-bold tracking-tight text-(--app-text)">Your Messages</h2>
      <p class="mt-2 max-w-xs text-sm leading-relaxed text-(--app-muted)">
        Select a conversation from the sidebar, or start a new end-to-end encrypted chat.
      </p>

      <!-- Feature highlights -->
      <div class="mt-8 grid w-full grid-cols-3 gap-2 text-center">
        <div
          class="flex flex-col items-center gap-1.5 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-2 py-3"
        >
          <ShieldCheck
            class="h-4 w-4 text-(--app-success)"
            :stroke-width="2.5"
            aria-hidden="true"
          />
          <span class="text-[10px] font-medium text-(--app-muted)">E2E Encrypted</span>
        </div>
        <div
          class="flex flex-col items-center gap-1.5 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-2 py-3"
        >
          <Lock class="h-4 w-4 text-(--app-primary)" :stroke-width="2.5" aria-hidden="true" />
          <span class="text-[10px] font-medium text-(--app-muted)">Self-hosted</span>
        </div>
        <div
          class="flex flex-col items-center gap-1.5 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-2 py-3"
        >
          <MessageCircle
            class="h-4 w-4 text-(--app-primary)"
            :stroke-width="2.5"
            aria-hidden="true"
          />
          <span class="text-[10px] font-medium text-(--app-muted)">No phone</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-6 flex w-full items-center justify-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-2xl bg-(--app-primary) px-4 py-2.5 text-sm font-semibold text-[#06101a] transition-all hover:bg-(--app-primary-strong) hover:text-white active:scale-[0.98]"
          @click="router.push('/new/start')"
        >
          <SquarePen class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
          New chat
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-2.5 text-sm font-semibold text-(--app-text-soft) transition-all hover:bg-(--app-surface-hover) active:scale-[0.98]"
          @click="router.push('/new/share')"
        >
          <UserPlus class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
          Invite
        </button>
      </div>
    </div>
  </div>
</template>
