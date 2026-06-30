<script setup>
import { ChevronRight, Link2, MessageCircle } from "lucide-vue-next";

const options = [
  {
    to: "/new/start",
    title: "Start chat",
    description: "Enter a public key or domain to open an encrypted conversation.",
    icon: MessageCircle,
  },
  {
    to: "/new/share",
    title: "Share invite",
    description: "Generate a temporary link so someone can message you privately.",
    icon: Link2,
  },
];
</script>

<template>
  <main class="chat-shell min-h-dvh overflow-y-auto lg:h-full">
    <div class="app-page-shell mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="mx-auto max-w-lg space-y-8">
        <header class="space-y-4 border-b border-white/8 pb-6">
          <router-link
            to="/messages"
            class="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-white"
          >
            Messages
          </router-link>
          <div class="space-y-1.5">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-success)">
              New conversation
            </p>
            <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">How do you want to connect?</h1>
            <p class="text-sm leading-6 text-zinc-500">
              Start a chat when you have someone's key or domain, or share an invite when they need
              a way to reach you.
            </p>
          </div>
        </header>

        <section class="grid gap-3">
          <router-link
            v-for="option in options"
            :key="option.to"
            :to="option.to"
            class="group flex items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4 transition-all hover:border-(--app-primary)/30 hover:bg-(--app-primary)/5"
          >
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-(--app-primary)/10 text-(--app-primary) transition-colors group-hover:bg-(--app-primary)/15"
            >
              <component :is="option.icon" class="h-5 w-5" :stroke-width="1.9" aria-hidden="true" />
            </div>
            <div class="min-w-0 flex-1 space-y-1">
              <h2 class="text-base font-semibold tracking-tight">{{ option.title }}</h2>
              <p class="text-sm leading-relaxed text-zinc-500">{{ option.description }}</p>
            </div>
            <ChevronRight
              class="h-5 w-5 shrink-0 text-zinc-600 transition-colors group-hover:text-(--app-primary)"
              :stroke-width="2"
              aria-hidden="true"
            />
          </router-link>
        </section>
      </div>
    </div>
  </main>
</template>