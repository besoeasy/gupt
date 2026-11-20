<script setup>
import { Container } from "@/icons";

import PageHeader from "@/components/PageHeader.vue";
import BackupNodeCard from "@/components/BackupNodeCard.vue";
</script>

<template>
  <main
    class="backup-integration-view__main"
  >
    <div class="backup-integration-view__block">
      <div class="backup-integration-view__block-2">
        <PageHeader eyebrow="Self-hosting" title="Local backup node">
          <p class="backup-integration-view__text">
            Run a Rabta node yourself, in one command. This browser already keeps a 1:1 copy of your
            account, so a backup node is for an off-device copy.
          </p>
        </PageHeader>

        <section class="backup-integration-view__section">
          <h2
            class="backup-integration-view__subtitle"
          >
            <Container class="backup-integration-view__container" :stroke-width="2" aria-hidden="true" />
            Docker &amp; Podman
          </h2>
          <BackupNodeCard />
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@media (min-width:40rem) {
.backup-integration-view__block {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.backup-integration-view__main {
  height: 100%;
}
}

@media (min-width:64rem) {
.backup-integration-view__block {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.backup-integration-view__block {
  margin-inline: auto;
}
.backup-integration-view__subtitle {
  display: inline-flex;
}
.backup-integration-view__container {
  height: calc(var(--spacing) * 3.5);
}
.backup-integration-view__main {
  min-height: 100dvh;
}
.backup-integration-view__container {
  width: calc(var(--spacing) * 3.5);
}
.backup-integration-view__block {
  width: 100%;
}
.backup-integration-view__block {
  max-width: var(--container-6xl);
}
.backup-integration-view__subtitle {
  align-items: center;
}
.backup-integration-view__subtitle {
  gap: calc(var(--spacing) * 1.5);
}
:where(.backup-integration-view__section>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.backup-integration-view__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 8) * 0);
  margin-block-end: calc(calc(var(--spacing) * 8) * calc(1 - 0));
}
:where(.backup-integration-view__block-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 8) * 0);
  margin-block-end: calc(calc(var(--spacing) * 8) * calc(1 - 0));
}
.backup-integration-view__main {
  overflow-x: hidden;
}
.backup-integration-view__main {
  overflow-y: auto;
}
.backup-integration-view__main {
  background-color: var(--app-bg);
}
.backup-integration-view__block {
  padding-inline: calc(var(--spacing) * 4);
}
.backup-integration-view__block {
  padding-block: calc(var(--spacing) * 6);
}
.backup-integration-view__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.backup-integration-view__subtitle {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.backup-integration-view__text {
  --leading: calc(var(--spacing) * 6);
  line-height: calc(var(--spacing) * 6);
}
.backup-integration-view__subtitle {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.backup-integration-view__subtitle {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.backup-integration-view__text {
  color: var(--app-muted);
}
.backup-integration-view__main {
  color: var(--app-text);
}
.backup-integration-view__subtitle {
  color: var(--ui-zinc-500);
}
.backup-integration-view__subtitle {
  text-transform: uppercase;
}
[data-theme="light"] .backup-integration-view__subtitle {
  color: var(--app-muted);
}
}
}
</style>
