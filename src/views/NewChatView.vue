<script setup>
import { ChevronRight, Link2, MessageCircle, Sparkles } from "lucide-vue-next";
import PageBackHeader from "@/components/PageBackHeader.vue";

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
    description: "Hide your public key — best for one-off intros in WhatsApp, Telegram, or SMS.",
    icon: Link2,
    featured: true,
  },
];
</script>

<template>
  <main class="chat-shell min-h-dvh overflow-y-auto lg:h-full">
    <div class="app-page-shell mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="mx-auto max-w-lg space-y-8">
        <PageBackHeader
          back-to="/messages"
          back-label="Messages"
          :show-back-icon="false"
          eyebrow="New conversation"
          title="How do you want to connect?"
        >
          <p class="text-sm leading-6 text-zinc-500">
            Start a chat when you have someone's key or domain, or share an invite when they need a
            way to reach you.
          </p>
        </PageBackHeader>

        <section class="grid gap-3">
          <router-link
            v-for="option in options"
            :key="option.to"
            :to="option.to"
            class="group flex items-center gap-4 rounded-2xl border p-4 transition-all"
            :class="
              option.featured
                ? 'border-(--app-primary)/35 bg-(--app-primary)/8 ring-1 ring-(--app-primary)/20 hover:border-(--app-primary)/45 hover:bg-(--app-primary)/12'
                : 'border-white/8 bg-white/[0.02] hover:border-(--app-primary)/30 hover:bg-(--app-primary)/5'
            "
          >
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors"
              :class="
                option.featured
                  ? 'bg-(--app-primary)/20 text-(--app-primary) group-hover:bg-(--app-primary)/25'
                  : 'bg-(--app-primary)/10 text-(--app-primary) group-hover:bg-(--app-primary)/15'
              "
            >
              <component :is="option.icon" class="h-5 w-5" :stroke-width="1.9" aria-hidden="true" />
            </div>
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base font-semibold tracking-tight">{{ option.title }}</h2>
                <span
                  v-if="option.featured"
                  class="inline-flex items-center gap-1 rounded-full border border-(--app-primary)/30 bg-(--app-primary)/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-(--app-primary)"
                >
                  <Sparkles class="h-2.5 w-2.5" :stroke-width="2.5" aria-hidden="true" />
                  Top pick
                </span>
              </div>
              <p
                class="text-sm leading-relaxed"
                :class="option.featured ? 'text-zinc-300' : 'text-zinc-500'"
              >
                {{ option.description }}
              </p>
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
