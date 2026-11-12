<script setup>
import { Container } from "@lucide/vue";

import PageBackHeader from "@/components/PageBackHeader.vue";
import BackupNodeCard from "@/components/BackupNodeCard.vue";
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <PageBackHeader
          back-to="/integrations"
          back-label="Integrations"
          eyebrow="Self-hosting"
          title="Local backup node"
        >
          <p class="text-sm leading-6 text-(--app-muted)">
            Run a Rabta node yourself, in one command. This browser already keeps a 1:1 copy of your
            account, so a backup node is for an off-device copy — or as a sync point when several
            devices share the same account.
          </p>
        </PageBackHeader>

        <section class="space-y-3">
          <h2
            class="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500"
          >
            <Container class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
            Docker &amp; Podman
          </h2>
          <BackupNodeCard />
        </section>
      </div>
    </div>
  </main>
</template>
