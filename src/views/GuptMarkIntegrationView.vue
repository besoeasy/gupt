<script setup>
import { RouterLink } from "vue-router";
import { ArrowUp, Bookmark, MousePointerClick, ShieldCheck, Tags } from "@lucide/vue";

import PageBackHeader from "@/components/PageBackHeader.vue";

// Same snippet the Bookmarks header used to host; this page is now the one
// place gupt-mark is handed out from.
const BOOKMARKLET_HREF = `javascript:(()=>{const raw=prompt('Tags (comma-separated, optional)\\nExample: work,read later','');if(raw===null)return;const tags=raw.split(',').map(function(s){return s.trim().toLowerCase().replace(/\\s+/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'').slice(0,32)}).filter(Boolean);const u=encodeURIComponent(location.href),og=document.querySelector('meta[property="og:title"]')?.content?.trim(),t=encodeURIComponent((og||document.title||(document.querySelector('h1')?.innerText||'').trim()).slice(0,200)),q=tags.map(function(tag){return 'tags='+encodeURIComponent(tag)}).join('&');open('${window.location.origin}/#/hotlink/bookmark?url='+u+'&title='+t+(q?'&'+q:''),'_blank','noopener,noreferrer')})()`;

const steps = [
  {
    icon: ArrowUp,
    title: "Drag it to the bookmarks bar",
    body: "Grab the gupt-mark chip above and drop it on your browser's bookmarks bar. One-time install, no extension.",
  },
  {
    icon: MousePointerClick,
    title: "Click it on any page",
    body: "When a page is worth keeping, click gupt-mark in the bar. No copy-pasting URLs into gupt.",
  },
  {
    icon: Tags,
    title: "Tag it, optionally",
    body: "It asks for comma-separated tags. Cancel the prompt and nothing happens; skip the tags and the link still lands.",
  },
  {
    icon: ShieldCheck,
    title: "Encrypted — or queued",
    body: "Signed in, the link is encrypted and published to your relays. Signed out, it queues on this device and is imported on your next visit.",
  },
];
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <PageBackHeader eyebrow="Browser bookmarklet" title="gupt-mark">
          <p class="text-sm leading-6 text-(--app-muted)">
            Save the page you're reading from the browser itself: one click in your bookmarks bar,
            tags optional. There's nothing to install beyond a bookmark.
          </p>
        </PageBackHeader>

        <section class="space-y-3">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Install</h2>
          <div class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 shadow-xs sm:p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-sm font-semibold tracking-tight text-white">gupt-mark</h2>
                  <span
                    class="rounded-full border border-zinc-800 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500"
                  >
                    Bookmarklet
                  </span>
                </div>
                <p class="text-xs leading-relaxed text-zinc-500">
                  A bookmark that isn't a link — a tiny script that saves the tab you're on into
                  gupt.
                </p>
              </div>
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400"
              >
                <Bookmark class="h-4 w-4" />
              </div>
            </div>

            <div
              class="mt-4 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center"
            >
              <a
                :href="BOOKMARKLET_HREF"
                draggable="true"
                class="inline-flex h-10 cursor-grab items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 shadow-xs transition-all hover:border-zinc-600 hover:bg-zinc-800 hover:text-white active:cursor-grabbing"
                title="Drag to bookmarks bar"
              >
                <Bookmark class="h-4 w-4" />
                <span>gupt-mark</span>
              </a>
              <p class="mt-3 text-xs text-zinc-500">
                Don't click — <span class="font-bold text-zinc-200">drag</span> it up to your
                browser's bookmarks bar.
              </p>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-500">How it works</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <div
              v-for="step in steps"
              :key="step.title"
              class="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 shadow-xs"
            >
              <div class="flex items-center gap-2">
                <component :is="step.icon" class="h-4 w-4 text-(--app-primary)" />
                <h3 class="text-sm font-semibold tracking-tight text-zinc-200">
                  {{ step.title }}
                </h3>
              </div>
              <p class="text-xs leading-relaxed text-zinc-500">{{ step.body }}</p>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Good to know</h2>
          <div class="space-y-2">
            <div
              class="flex items-start gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3"
            >
              <ShieldCheck class="mt-0.5 h-4 w-4 shrink-0 text-(--app-success)" />
              <p class="text-xs leading-relaxed text-zinc-400">
                <span class="font-semibold text-zinc-200">Private by default.</span> The URL and
                page title go straight from the tab into your encrypted bookmark stream on your
                relays — gupt servers never see them.
              </p>
            </div>
            <div
              class="flex items-start gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3"
            >
              <Bookmark class="mt-0.5 h-4 w-4 shrink-0 text-(--app-primary)" />
              <p class="text-xs leading-relaxed text-zinc-400">
                <span class="font-semibold text-zinc-200">Works signed out.</span> No session in the
                tab gupt-mark opens? The link waits on this device and is imported into your stream
                the next time you sign in and open
                <RouterLink
                  to="/bookmarks"
                  class="font-medium text-zinc-200 underline underline-offset-2 hover:text-white"
                  >Bookmarks</RouterLink
                >.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
