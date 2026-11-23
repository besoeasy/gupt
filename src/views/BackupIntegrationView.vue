<script setup>
import { Container } from "@/icons";

import PageHeader from "@/components/PageHeader.vue";
import BackupNodeCard from "@/components/BackupNodeCard.vue";
</script>

<template>
  <main class="backup">
    <div class="backup__inner">
      <PageHeader eyebrow="Self-hosting" title="Local backup node">
        <p class="backup__lede">
          Run a Rabta node yourself, in one command. This browser already keeps a 1:1 copy of your
          account, so a backup node is for an off-device copy.
        </p>
      </PageHeader>

      <section class="backup__section">
        <h2 class="backup__label">
          <Container class="backup__label-icon" :stroke-width="1.9" aria-hidden="true" />
          Docker &amp; Podman
        </h2>
        <BackupNodeCard />
      </section>
    </div>
  </main>
</template>

<style scoped>
/* Ledger pass: one self-hosting record under a mono section label. */

.backup {
  min-height: 100dvh;
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 240ms var(--app-ease-standard) both;
}

.backup__inner {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  width: 100%;
  max-width: 720px;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4) var(--app-space-8);
}

.backup__lede {
  max-width: 58ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.65;
  color: var(--app-muted);
}

.backup__section {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  animation: ledger-rise 440ms var(--app-ease-emphasized) 50ms both;
}

.backup__label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.backup__label-icon {
  width: 13px;
  height: 13px;
}

@media (min-width: 40rem) {
  .backup__inner {
    padding-inline: var(--app-space-6);
  }
}

@media (min-width: 64rem) {
  .backup {
    height: 100%;
    overflow-y: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .backup,
  .backup__section {
    animation: none;
  }
}
</style>
