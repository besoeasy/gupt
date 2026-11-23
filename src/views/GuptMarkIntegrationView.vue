<script setup>
import { RouterLink } from "vue-router";
import { ArrowUp, Bookmark, MousePointerClick, ShieldCheck, Tags } from "@/icons";

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
  <main class="gupt-mark">
    <div class="gupt-mark__main">
      <PageHeader eyebrow="Browser bookmarklet" title="gupt-mark">
        <p class="gupt-mark__lede">
          Save the page you're reading from the browser itself: one click in your bookmarks bar,
          tags optional. There's nothing to install beyond a bookmark.
        </p>
      </PageHeader>

      <section class="gupt-mark-section">
        <h2 class="gupt-mark-section__label">Install</h2>

        <div class="gupt-mark-card">
          <div class="gupt-mark-card__head">
            <span class="gupt-mark-card__mark" aria-hidden="true">
              <Bookmark class="gupt-mark-card__mark-icon" :stroke-width="1.8" />
            </span>
            <div class="gupt-mark-card__body">
              <div class="gupt-mark-card__titleline">
                <h2 class="gupt-mark-card__title">gupt-mark</h2>
                <span class="gupt-mark-card__badge">Bookmarklet</span>
              </div>
              <p class="gupt-mark-card__description">
                A bookmark that isn't a link — a tiny script that saves the tab you're on into gupt.
              </p>
            </div>
          </div>

          <div class="gupt-mark-install">
            <a
              :href="BOOKMARKLET_HREF"
              draggable="true"
              class="gupt-mark-chip"
              title="Drag to bookmarks bar"
            >
              <Bookmark class="gupt-mark-chip__icon" :stroke-width="1.8" aria-hidden="true" />
              <span>gupt-mark</span>
              <ArrowUp class="gupt-mark-chip__arrow" :stroke-width="2" aria-hidden="true" />
            </a>
            <p class="gupt-mark-install__hint">
              Don't click — <span>drag</span> it up to your browser's bookmarks bar.
            </p>
          </div>
        </div>
      </section>

      <section class="gupt-mark-section">
        <h2 class="gupt-mark-section__label">How it works</h2>
        <ol class="gupt-mark-steps">
          <li v-for="(step, index) in steps" :key="step.title" class="gupt-mark-step">
            <span class="gupt-mark-step__index" aria-hidden="true">
              {{ String(index + 1).padStart(2, "0") }}
            </span>
            <div class="gupt-mark-step__body">
              <h3 class="gupt-mark-step__title">
                <component :is="step.icon" class="gupt-mark-step__icon" :stroke-width="1.8" aria-hidden="true" />
                {{ step.title }}
              </h3>
              <p class="gupt-mark-step__text">{{ step.body }}</p>
            </div>
          </li>
        </ol>
      </section>

      <section class="gupt-mark-section">
        <h2 class="gupt-mark-section__label">Good to know</h2>
        <div class="gupt-mark-notes">
          <div class="gupt-mark-note">
            <ShieldCheck class="gupt-mark-note__icon" :stroke-width="1.8" aria-hidden="true" />
            <p class="gupt-mark-note__text">
              <span class="gupt-mark-note__lead">Private by default.</span> The URL and page title go
              straight from the tab into your encrypted bookmark stream on your relays — gupt servers
              never see them.
            </p>
          </div>
          <div class="gupt-mark-note">
            <Bookmark class="gupt-mark-note__icon" :stroke-width="1.8" aria-hidden="true" />
            <p class="gupt-mark-note__text">
              <span class="gupt-mark-note__lead">Works signed out.</span> No session in the tab
              gupt-mark opens? The link waits on this device and is imported into your stream the next
              time you sign in and open
              <RouterLink to="/bookmarks" class="gupt-mark-note__link">Bookmarks</RouterLink>.
            </p>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
/* Ledger pass: the bookmarklet is one install record and a short procedure. */

.gupt-mark {
  min-height: 100vh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.gupt-mark__main {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  width: 100%;
  max-width: 720px;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.gupt-mark__lede {
  max-width: 58ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.65;
  color: var(--app-muted);
}

.gupt-mark-section {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.gupt-mark-section__label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.gupt-mark-card {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-rise 480ms var(--app-ease-emphasized) both;
}

.gupt-mark-card__head {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  padding: 14px;
  border-bottom: 1px solid var(--app-border);
}

.gupt-mark-card__mark {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--app-radius-sm);
  background: color-mix(in oklab, var(--app-warning) 14%, var(--app-surface));
  color: var(--app-warning);
}

.gupt-mark-card__mark-icon {
  width: 14px;
  height: 14px;
}

.gupt-mark-card__body {
  min-width: 0;
}

.gupt-mark-card__titleline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.gupt-mark-card__title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text);
}

.gupt-mark-card__badge {
  padding: 1px 5px;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.gupt-mark-card__description {
  margin: 4px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--app-muted);
}

.gupt-mark-install {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--app-space-3);
  padding: 14px;
  background: var(--app-surface-soft);
}

.gupt-mark-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding-inline: 12px;
  border: 1px solid var(--app-text);
  border-radius: var(--app-radius-sm);
  background: var(--app-text);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--app-bg);
  text-decoration: none;
  cursor: grab;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.gupt-mark-chip:active {
  cursor: grabbing;
  transform: translateY(1px);
}

.gupt-mark-chip__icon {
  width: 12px;
  height: 12px;
}

.gupt-mark-chip__arrow {
  width: 11px;
  height: 11px;
  color: color-mix(in oklab, var(--app-bg) 60%, transparent);
}

.gupt-mark-install__hint {
  margin: 0;
  font-size: 11px;
  color: var(--app-muted);
}

.gupt-mark-install__hint span {
  color: var(--app-text);
  font-weight: 500;
}

.gupt-mark-steps {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-rise 480ms var(--app-ease-emphasized) 60ms both;
}

.gupt-mark-step {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  padding: 14px;
}

.gupt-mark-step + .gupt-mark-step {
  border-top: 1px solid var(--app-border);
}

.gupt-mark-step__index {
  padding-top: 1px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.gupt-mark-step__body {
  min-width: 0;
}

.gupt-mark-step__title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--app-text);
}

.gupt-mark-step__icon {
  width: 13px;
  height: 13px;
  color: var(--app-muted-2);
}

.gupt-mark-step__text {
  margin: 4px 0 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--app-muted);
}

.gupt-mark-notes {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
}

.gupt-mark-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px;
}

.gupt-mark-note + .gupt-mark-note {
  border-top: 1px solid var(--app-border);
}

.gupt-mark-note__icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  color: var(--app-success);
}

.gupt-mark-note__text {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--app-muted);
}

.gupt-mark-note__lead {
  color: var(--app-text);
  font-weight: 500;
}

.gupt-mark-note__link {
  color: var(--app-primary);
  text-decoration: none;
}

@media (min-width: 40rem) {
  .gupt-mark__main {
    padding-inline: var(--app-space-6);
  }

  .gupt-mark-card__head,
  .gupt-mark-step,
  .gupt-mark-note {
    padding: 16px;
  }

  .gupt-mark-install {
    padding: 16px;
  }
}

@media (hover: hover) {
  .gupt-mark-chip:hover {
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
  }

  .gupt-mark-note__link:hover {
    color: var(--app-text);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
}

@media (pointer: coarse) {
  .gupt-mark-chip {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .gupt-mark,
  .gupt-mark-card,
  .gupt-mark-steps {
    animation: none;
  }

  .gupt-mark-chip {
    transition: none;
  }
}
</style>
