<script setup>
import { RouterLink } from "vue-router";
import { ArrowUp, Bookmark, MousePointerClick, ShieldCheck, Tags } from "@lucide/vue";

import PageHeader from "@/components/PageHeader.vue";

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
    class="gupt-mark-integration-view__main"
  >
    <div class="gupt-mark-integration-view__block">
      <div class="gupt-mark-integration-view__block-2">
        <PageHeader eyebrow="Browser bookmarklet" title="gupt-mark">
          <p class="gupt-mark-integration-view__text">
            Save the page you're reading from the browser itself: one click in your bookmarks bar,
            tags optional. There's nothing to install beyond a bookmark.
          </p>
        </PageHeader>

        <section class="gupt-mark-integration-view__section">
          <h2 class="gupt-mark-integration-view__subtitle-install">Install</h2>
          <div class="gupt-mark-integration-view__block-3">
            <div class="gupt-mark-integration-view__block-4">
              <div class="gupt-mark-integration-view__block-5">
                <div class="gupt-mark-integration-view__block-6">
                  <h2 class="gupt-mark-integration-view__subtitle-gupt-mark">gupt-mark</h2>
                  <span
                    class="gupt-mark-integration-view__text-bookmarklet"
                  >
                    Bookmarklet
                  </span>
                </div>
                <p class="gupt-mark-integration-view__text-2">
                  A bookmark that isn't a link — a tiny script that saves the tab you're on into
                  gupt.
                </p>
              </div>
              <div
                class="gupt-mark-integration-view__block-7"
              >
                <Bookmark class="gupt-mark-integration-view__bookmark" />
              </div>
            </div>

            <div
              class="gupt-mark-integration-view__block-8"
            >
              <a
                :href="BOOKMARKLET_HREF"
                draggable="true"
                class="gupt-mark-integration-view__link-drag-to"
                title="Drag to bookmarks bar"
              >
                <Bookmark class="gupt-mark-integration-view__bookmark-2" />
                <span>gupt-mark</span>
              </a>
              <p class="gupt-mark-integration-view__text-3">
                Don't click — <span class="gupt-mark-integration-view__text-drag">drag</span> it up to your
                browser's bookmarks bar.
              </p>
            </div>
          </div>
        </section>

        <section class="gupt-mark-integration-view__section-2">
          <h2 class="gupt-mark-integration-view__subtitle-how-it">How it works</h2>
          <div class="gupt-mark-integration-view__block-9">
            <div
              v-for="step in steps"
              :key="step.title"
              class="gupt-mark-integration-view__block-10"
            >
              <div class="gupt-mark-integration-view__block-11">
                <component :is="step.icon" class="gupt-mark-integration-view__component" />
                <h3 class="gupt-mark-integration-view__heading">
                  {{ step.title }}
                </h3>
              </div>
              <p class="gupt-mark-integration-view__text-4">{{ step.body }}</p>
            </div>
          </div>
        </section>

        <section class="gupt-mark-integration-view__section-3">
          <h2 class="gupt-mark-integration-view__subtitle-good-to">Good to know</h2>
          <div class="gupt-mark-integration-view__block-12">
            <div
              class="gupt-mark-integration-view__block-13"
            >
              <ShieldCheck class="gupt-mark-integration-view__shield-check" />
              <p class="gupt-mark-integration-view__text-5">
                <span class="gupt-mark-integration-view__text-private-by">Private by default.</span> The URL and
                page title go straight from the tab into your encrypted bookmark stream on your
                relays — gupt servers never see them.
              </p>
            </div>
            <div
              class="gupt-mark-integration-view__block-14"
            >
              <Bookmark class="gupt-mark-integration-view__bookmark-3" />
              <p class="gupt-mark-integration-view__text-6">
                <span class="gupt-mark-integration-view__text-works-signed">Works signed out.</span> No session in the
                tab gupt-mark opens? The link waits on this device and is imported into your stream
                the next time you sign in and open
                <RouterLink
                  to="/bookmarks"
                  class="gupt-mark-integration-view__router-link-bookmarks"
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

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.gupt-mark-integration-view__link-drag-to:hover {
  border-color: var(--ui-zinc-600);
}
}

@media (hover:hover) {
.gupt-mark-integration-view__link-drag-to:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.gupt-mark-integration-view__link-drag-to:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.gupt-mark-integration-view__router-link-bookmarks:hover {
  color: var(--color-white);
}
}

@media (min-width:40rem) {
.gupt-mark-integration-view__block-9 {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
}

@media (min-width:40rem) {
.gupt-mark-integration-view__block-3 {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.gupt-mark-integration-view__block {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.gupt-mark-integration-view__main {
  height: 100%;
}
}

@media (min-width:64rem) {
.gupt-mark-integration-view__block {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.gupt-mark-integration-view__block {
  margin-inline: auto;
}
.gupt-mark-integration-view__shield-check {
  margin-top: calc(var(--spacing) * .5);
}
.gupt-mark-integration-view__bookmark-3 {
  margin-top: calc(var(--spacing) * .5);
}
.gupt-mark-integration-view__text-3 {
  margin-top: calc(var(--spacing) * 3);
}
.gupt-mark-integration-view__block-8 {
  margin-top: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__block-4 {
  display: flex;
}
.gupt-mark-integration-view__block-6 {
  display: flex;
}
.gupt-mark-integration-view__block-7 {
  display: flex;
}
.gupt-mark-integration-view__block-11 {
  display: flex;
}
.gupt-mark-integration-view__block-13 {
  display: flex;
}
.gupt-mark-integration-view__block-14 {
  display: flex;
}
.gupt-mark-integration-view__block-9 {
  display: grid;
}
.gupt-mark-integration-view__link-drag-to {
  display: inline-flex;
}
.gupt-mark-integration-view__bookmark {
  height: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__bookmark-2 {
  height: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__component {
  height: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__shield-check {
  height: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__bookmark-3 {
  height: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__block-7 {
  height: calc(var(--spacing) * 9);
}
.gupt-mark-integration-view__link-drag-to {
  height: calc(var(--spacing) * 10);
}
.gupt-mark-integration-view__main {
  min-height: 100dvh;
}
.gupt-mark-integration-view__bookmark {
  width: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__bookmark-2 {
  width: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__component {
  width: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__shield-check {
  width: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__bookmark-3 {
  width: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__block-7 {
  width: calc(var(--spacing) * 9);
}
.gupt-mark-integration-view__block {
  width: 100%;
}
.gupt-mark-integration-view__block {
  max-width: var(--container-6xl);
}
.gupt-mark-integration-view__block-5 {
  min-width: 0;
}
.gupt-mark-integration-view__block-7 {
  flex-shrink: 0;
}
.gupt-mark-integration-view__shield-check {
  flex-shrink: 0;
}
.gupt-mark-integration-view__bookmark-3 {
  flex-shrink: 0;
}
.gupt-mark-integration-view__link-drag-to {
  cursor: grab;
}
.gupt-mark-integration-view__block-6 {
  flex-wrap: wrap;
}
.gupt-mark-integration-view__block-6 {
  align-items: center;
}
.gupt-mark-integration-view__block-7 {
  align-items: center;
}
.gupt-mark-integration-view__link-drag-to {
  align-items: center;
}
.gupt-mark-integration-view__block-11 {
  align-items: center;
}
.gupt-mark-integration-view__block-4 {
  align-items: flex-start;
}
.gupt-mark-integration-view__block-13 {
  align-items: flex-start;
}
.gupt-mark-integration-view__block-14 {
  align-items: flex-start;
}
.gupt-mark-integration-view__block-4 {
  justify-content: space-between;
}
.gupt-mark-integration-view__block-7 {
  justify-content: center;
}
.gupt-mark-integration-view__block-6 {
  gap: calc(var(--spacing) * 2);
}
.gupt-mark-integration-view__link-drag-to {
  gap: calc(var(--spacing) * 2);
}
.gupt-mark-integration-view__block-11 {
  gap: calc(var(--spacing) * 2);
}
.gupt-mark-integration-view__block-4 {
  gap: calc(var(--spacing) * 3);
}
.gupt-mark-integration-view__block-9 {
  gap: calc(var(--spacing) * 3);
}
.gupt-mark-integration-view__block-13 {
  gap: calc(var(--spacing) * 3);
}
.gupt-mark-integration-view__block-14 {
  gap: calc(var(--spacing) * 3);
}
:where(.gupt-mark-integration-view__block-5>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.gupt-mark-integration-view__block-10>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.gupt-mark-integration-view__block-12>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.gupt-mark-integration-view__section>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.gupt-mark-integration-view__section-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.gupt-mark-integration-view__section-3>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.gupt-mark-integration-view__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 8) * 0);
  margin-block-end: calc(calc(var(--spacing) * 8) * calc(1 - 0));
}
:where(.gupt-mark-integration-view__block-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 8) * 0);
  margin-block-end: calc(calc(var(--spacing) * 8) * calc(1 - 0));
}
.gupt-mark-integration-view__main {
  overflow-x: hidden;
}
.gupt-mark-integration-view__main {
  overflow-y: auto;
}
.gupt-mark-integration-view__block-8 {
  border-radius: var(--radius-2xl);
}
.gupt-mark-integration-view__text-bookmarklet {
  border-radius: 3.40282e38px;
}
.gupt-mark-integration-view__link-drag-to {
  border-radius: var(--radius-lg);
}
.gupt-mark-integration-view__block-3 {
  border-radius: var(--radius-xl);
}
.gupt-mark-integration-view__block-7 {
  border-radius: var(--radius-xl);
}
.gupt-mark-integration-view__block-10 {
  border-radius: var(--radius-xl);
}
.gupt-mark-integration-view__block-13 {
  border-radius: var(--radius-xl);
}
.gupt-mark-integration-view__block-14 {
  border-radius: var(--radius-xl);
}
.gupt-mark-integration-view__block-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.gupt-mark-integration-view__text-bookmarklet {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.gupt-mark-integration-view__block-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.gupt-mark-integration-view__block-8 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.gupt-mark-integration-view__link-drag-to {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.gupt-mark-integration-view__block-10 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.gupt-mark-integration-view__block-13 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.gupt-mark-integration-view__block-14 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.gupt-mark-integration-view__block-8 {
  --border-style: dashed;
  border-style: dashed;
}
.gupt-mark-integration-view__link-drag-to {
  border-color: var(--ui-zinc-700);
}
.gupt-mark-integration-view__block-3 {
  border-color: var(--ui-zinc-800);
}
.gupt-mark-integration-view__text-bookmarklet {
  border-color: var(--ui-zinc-800);
}
.gupt-mark-integration-view__block-7 {
  border-color: var(--ui-zinc-800);
}
.gupt-mark-integration-view__block-8 {
  border-color: var(--ui-zinc-800);
}
.gupt-mark-integration-view__block-10 {
  border-color: var(--ui-zinc-800);
}
.gupt-mark-integration-view__block-13 {
  border-color: var(--app-border-quiet);
}
.gupt-mark-integration-view__block-14 {
  border-color: var(--app-border-quiet);
}
.gupt-mark-integration-view__main {
  background-color: var(--app-bg);
}
.gupt-mark-integration-view__block-7 {
  background-color: var(--ui-zinc-900);
}
.gupt-mark-integration-view__link-drag-to {
  background-color: var(--ui-zinc-900);
}
.gupt-mark-integration-view__block-8 {
  background-color: var(--app-surface-tint-soft);
}
.gupt-mark-integration-view__block-13 {
  background-color: var(--app-surface-inset);
}
.gupt-mark-integration-view__block-14 {
  background-color: var(--app-surface-inset);
}
.gupt-mark-integration-view__block-3 {
  background-color: var(--app-surface-inset-strong);
}
.gupt-mark-integration-view__block-10 {
  background-color: var(--app-surface-inset-strong);
}
.gupt-mark-integration-view__block-3 {
  padding: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__block-10 {
  padding: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__text-bookmarklet {
  padding-inline: calc(var(--spacing) * 2);
}
.gupt-mark-integration-view__block {
  padding-inline: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__block-8 {
  padding-inline: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__link-drag-to {
  padding-inline: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__block-13 {
  padding-inline: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__block-14 {
  padding-inline: calc(var(--spacing) * 4);
}
.gupt-mark-integration-view__text-bookmarklet {
  padding-block: calc(var(--spacing) * .5);
}
.gupt-mark-integration-view__block-13 {
  padding-block: calc(var(--spacing) * 3);
}
.gupt-mark-integration-view__block-14 {
  padding-block: calc(var(--spacing) * 3);
}
.gupt-mark-integration-view__block {
  padding-block: calc(var(--spacing) * 6);
}
.gupt-mark-integration-view__block-8 {
  padding-block: calc(var(--spacing) * 6);
}
.gupt-mark-integration-view__block-8 {
  text-align: center;
}
.gupt-mark-integration-view__text-bookmarklet {
  font-family: var(--font-mono);
}
.gupt-mark-integration-view__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.gupt-mark-integration-view__subtitle-gupt-mark {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.gupt-mark-integration-view__link-drag-to {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.gupt-mark-integration-view__heading {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.gupt-mark-integration-view__subtitle-install {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.gupt-mark-integration-view__text-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.gupt-mark-integration-view__text-3 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.gupt-mark-integration-view__subtitle-how-it {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.gupt-mark-integration-view__text-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.gupt-mark-integration-view__subtitle-good-to {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.gupt-mark-integration-view__text-5 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.gupt-mark-integration-view__text-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.gupt-mark-integration-view__text-bookmarklet {
  font-size: 9px;
}
.gupt-mark-integration-view__text {
  --leading: calc(var(--spacing) * 6);
  line-height: calc(var(--spacing) * 6);
}
.gupt-mark-integration-view__text-2 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.gupt-mark-integration-view__text-4 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.gupt-mark-integration-view__text-5 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.gupt-mark-integration-view__text-6 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.gupt-mark-integration-view__text-drag {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.gupt-mark-integration-view__link-drag-to {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.gupt-mark-integration-view__router-link-bookmarks {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.gupt-mark-integration-view__subtitle-install {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.gupt-mark-integration-view__subtitle-gupt-mark {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.gupt-mark-integration-view__subtitle-how-it {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.gupt-mark-integration-view__heading {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.gupt-mark-integration-view__subtitle-good-to {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.gupt-mark-integration-view__text-private-by {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.gupt-mark-integration-view__text-works-signed {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.gupt-mark-integration-view__subtitle-gupt-mark {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.gupt-mark-integration-view__heading {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.gupt-mark-integration-view__subtitle-install {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.gupt-mark-integration-view__text-bookmarklet {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.gupt-mark-integration-view__subtitle-how-it {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.gupt-mark-integration-view__subtitle-good-to {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.gupt-mark-integration-view__text {
  color: var(--app-muted);
}
.gupt-mark-integration-view__component {
  color: var(--app-primary);
}
.gupt-mark-integration-view__bookmark-3 {
  color: var(--app-primary);
}
.gupt-mark-integration-view__shield-check {
  color: var(--app-success);
}
.gupt-mark-integration-view__main {
  color: var(--app-text);
}
.gupt-mark-integration-view__subtitle-gupt-mark {
  color: var(--color-white);
}
.gupt-mark-integration-view__link-drag-to {
  color: var(--ui-zinc-200);
}
.gupt-mark-integration-view__text-drag {
  color: var(--ui-zinc-200);
}
.gupt-mark-integration-view__heading {
  color: var(--ui-zinc-200);
}
.gupt-mark-integration-view__text-private-by {
  color: var(--ui-zinc-200);
}
.gupt-mark-integration-view__text-works-signed {
  color: var(--ui-zinc-200);
}
.gupt-mark-integration-view__router-link-bookmarks {
  color: var(--ui-zinc-200);
}
.gupt-mark-integration-view__block-7 {
  color: var(--ui-zinc-400);
}
.gupt-mark-integration-view__text-5 {
  color: var(--ui-zinc-400);
}
.gupt-mark-integration-view__text-6 {
  color: var(--ui-zinc-400);
}
.gupt-mark-integration-view__subtitle-install {
  color: var(--ui-zinc-500);
}
.gupt-mark-integration-view__text-bookmarklet {
  color: var(--ui-zinc-500);
}
.gupt-mark-integration-view__text-2 {
  color: var(--ui-zinc-500);
}
.gupt-mark-integration-view__text-3 {
  color: var(--ui-zinc-500);
}
.gupt-mark-integration-view__subtitle-how-it {
  color: var(--ui-zinc-500);
}
.gupt-mark-integration-view__text-4 {
  color: var(--ui-zinc-500);
}
.gupt-mark-integration-view__subtitle-good-to {
  color: var(--ui-zinc-500);
}
.gupt-mark-integration-view__subtitle-install {
  text-transform: uppercase;
}
.gupt-mark-integration-view__text-bookmarklet {
  text-transform: uppercase;
}
.gupt-mark-integration-view__subtitle-how-it {
  text-transform: uppercase;
}
.gupt-mark-integration-view__subtitle-good-to {
  text-transform: uppercase;
}
.gupt-mark-integration-view__router-link-bookmarks {
  text-decoration-line: underline;
}
.gupt-mark-integration-view__router-link-bookmarks {
  text-underline-offset: 2px;
}
.gupt-mark-integration-view__block-3 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.gupt-mark-integration-view__link-drag-to {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.gupt-mark-integration-view__block-10 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.gupt-mark-integration-view__link-drag-to {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.gupt-mark-integration-view__link-drag-to:active {
  cursor: grabbing;
}
[data-theme="light"] .gupt-mark-integration-view__block-7 {
  color: var(--app-muted);
}
[data-theme="light"] .gupt-mark-integration-view__text-5 {
  color: var(--app-muted);
}
[data-theme="light"] .gupt-mark-integration-view__text-6 {
  color: var(--app-muted);
}
[data-theme="light"] .gupt-mark-integration-view__subtitle-install {
  color: var(--app-muted);
}
[data-theme="light"] .gupt-mark-integration-view__text-bookmarklet {
  color: var(--app-muted);
}
[data-theme="light"] .gupt-mark-integration-view__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .gupt-mark-integration-view__text-3 {
  color: var(--app-muted);
}
[data-theme="light"] .gupt-mark-integration-view__subtitle-how-it {
  color: var(--app-muted);
}
[data-theme="light"] .gupt-mark-integration-view__text-4 {
  color: var(--app-muted);
}
[data-theme="light"] .gupt-mark-integration-view__subtitle-good-to {
  color: var(--app-muted);
}
}
}
</style>
