<script setup>
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { Bot, ExternalLink, RefreshCw } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PageBackHeader from "@/components/PageBackHeader.vue";
import { shortId } from "@/lib/crypto";
import { fetchPublicBots } from "@/lib/publicBots";
import { storePeerRelayHint } from "@/lib/relay";
import { startAppSync } from "@/lib/sync";
import { useIdentityStore } from "@/stores/identity";
import { useOpenConversation } from "@/composables/useOpenConversation";

const identity = useIdentityStore();
const { openDmWith } = useOpenConversation();

const error = ref("");
const publicBots = ref([]);
const publicBotsLoading = ref(false);
const openingBotPubkey = ref("");

const initPromise = identity.init().then(() => {
  void startAppSync(identity);
});

async function loadBots() {
  publicBotsLoading.value = true;
  error.value = "";
  try {
    publicBots.value = await fetchPublicBots();
  } catch {
    publicBots.value = [];
    error.value = "Could not load public bots from your relays.";
  } finally {
    publicBotsLoading.value = false;
  }
}

async function openPublicBot(bot) {
  await initPromise;
  error.value = "";
  openingBotPubkey.value = bot.pubkey;
  try {
    for (const relay of bot.relays || []) {
      await storePeerRelayHint(bot.pubkey, relay).catch(() => {});
    }
    await openDmWith(identity, bot.pubkey, { label: bot.name ? `Bot · ${bot.name}` : "" });
  } catch (e) {
    error.value = e.message || "Unable to open conversation.";
  } finally {
    openingBotPubkey.value = "";
  }
}

onMounted(async () => {
  await initPromise;
  await loadBots();
});
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <PageBackHeader
          back-to="/messages"
          back-label="Messages"
          eyebrow="Public bots"
          title="Talk to a bot"
        >
          <p class="text-sm leading-6 text-(--app-muted)">
            Random GUPT bots discovered on your relays via the public
            <span class="font-mono text-(--app-text-soft)">gupt-bot</span> tag. Listings are
            untrusted ads — only message ones you want to try.
          </p>
        </PageBackHeader>

        <section class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold text-(--app-text)">Discovered bots</h2>
            <button
              type="button"
              class="inline-flex h-10 items-center gap-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-text-soft) transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-50"
              :disabled="publicBotsLoading"
              @click="loadBots"
            >
              <RefreshCw class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
              Shuffle
            </button>
          </div>

          <AppAlertBanner v-if="error" :message="error" />

          <p v-if="publicBotsLoading" class="text-sm text-(--app-muted)">
            Looking for public bots…
          </p>
          <p v-else-if="!publicBots.length" class="text-sm text-(--app-muted)">
            No public bots on your relays yet. Bots that publish a
            <span class="font-mono">gupt-bot</span> listing with a name and about text show up here.
          </p>
          <ul v-else class="space-y-2">
            <li v-for="bot in publicBots" :key="bot.pubkey">
              <div
                class="rounded-2xl border border-(--app-border) bg-(--app-surface) px-4 py-3 transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover)"
              >
                <button
                  type="button"
                  class="flex w-full min-h-11 items-start gap-3 text-left disabled:opacity-60"
                  :disabled="Boolean(openingBotPubkey)"
                  @click="openPublicBot(bot)"
                >
                  <Bot
                    class="mt-0.5 h-5 w-5 shrink-0 text-(--app-primary)"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-semibold text-(--app-text)">{{
                      bot.name
                    }}</span>
                    <span class="mt-0.5 block text-sm leading-5 text-(--app-muted)">{{
                      bot.about
                    }}</span>
                    <span class="mt-1 block font-mono text-xs text-(--app-text-soft)">{{
                      shortId(bot.pubkey)
                    }}</span>
                  </span>
                  <span
                    v-if="openingBotPubkey === bot.pubkey"
                    class="shrink-0 text-xs font-semibold text-(--app-muted)"
                    >Opening…</span
                  >
                </button>
                <div
                  v-if="bot.website || bot.owner"
                  class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 text-xs"
                >
                  <a
                    v-if="bot.website"
                    :href="bot.website"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex min-h-10 items-center gap-1 font-semibold text-(--app-primary) hover:underline"
                    @click.stop
                  >
                    <ExternalLink class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
                    Website
                  </a>
                  <RouterLink
                    v-if="bot.owner"
                    :to="`/profile/${bot.owner}`"
                    class="inline-flex min-h-10 items-center font-mono text-(--app-text-soft) hover:text-(--app-text)"
                    @click.stop
                  >
                    Owner {{ shortId(bot.owner) }}
                  </RouterLink>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </main>
</template>
