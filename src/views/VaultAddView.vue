<script setup>
import { useRouter } from "vue-router";
import PageBackHeader from "@/components/PageBackHeader.vue";
import VaultCreatePanel from "@/components/vault/VaultCreatePanel.vue";

const router = useRouter();

function handleSaved() {
  router.push("/vault");
}

function handleCancel() {
  router.push("/vault");
}
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="mx-auto max-w-3xl space-y-6">
        <PageBackHeader
          back-to="/vault"
          back-label="Vault"
          eyebrow="New entry"
          title="Add to Vault"
        >
          <p class="text-sm leading-6 text-(--app-muted)">
            Encrypted locally, then published to your relays
          </p>
        </PageBackHeader>

        <VaultCreatePanel @saved="handleSaved" @cancel="handleCancel" />
      </div>
    </div>
  </main>
</template>
