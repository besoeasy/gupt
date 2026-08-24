<script setup>
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { ArrowUpRight, Bot, ExternalLink, RefreshCw } from "@lucide/vue";
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
          <p class="text-sm leading-6 text-(--app-muted)">
            Showcase bots are built using the
            <a
              href="https://github.com/besoeasy/gupt/tree/main/sdk"
              target="_blank"
              rel="noopener noreferrer"
              class="font-semibold text-(--app-primary) hover:underline"
              >GUPT SDK</a
            >.
          </p>
        </PageBackHeader>

        <section
          class="overflow-hidden rounded-3xl border border-(--app-border) bg-(--app-surface)"
        >
          <div
            class="flex flex-col gap-4 border-b border-(--app-border) bg-(--app-surface-soft) px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
          >
            <div class="flex min-w-0 items-center gap-3">
              <span
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-(--app-primary) text-white shadow-sm"
              >
                <Bot class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h2 class="text-base font-semibold text-(--app-text)">Discovered bots</h2>
                  <span
                    v-if="!publicBotsLoading && publicBots.length"
                    class="rounded-full border border-(--app-border) bg-(--app-surface) px-2 py-0.5 text-[11px] font-semibold text-(--app-text-soft)"
                  >
                    {{ publicBots.length }}
                  </span>
                </div>
                <p class="mt-0.5 text-xs text-(--app-muted)">Fresh listings from your relays</p>
              </div>
            </div>
            <button
              type="button"
              class="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-(--app-border) bg-(--app-surface) px-3.5 text-xs font-semibold text-(--app-text-soft) shadow-sm transition-all hover:-translate-y-0.5 hover:border-(--app-border-strong) hover:text-(--app-text) disabled:translate-y-0 disabled:opacity-50"
              :disabled="publicBotsLoading"
              @click="loadBots"
            >
              <RefreshCw
                class="h-4 w-4"
                :class="{ 'animate-spin': publicBotsLoading }"
                :stroke-width="2"
                aria-hidden="true"
              />
              Shuffle bots
            </button>
          </div>

          <div class="p-3 sm:p-4">
            <AppAlertBanner v-if="error" :message="error" class="mb-3" />

            <div v-if="publicBotsLoading" class="grid gap-3 sm:grid-cols-2">
              <div
                v-for="item in 4"
                :key="item"
                class="animate-pulse rounded-2xl border border-(--app-border) p-4"
              >
                <div class="flex gap-3">
                  <div class="h-11 w-11 rounded-2xl bg-(--app-surface-soft)"></div>
                  <div class="flex-1 space-y-2 py-1">
                    <div class="h-3 w-2/5 rounded-full bg-(--app-surface-soft)"></div>
                    <div class="h-3 w-full rounded-full bg-(--app-surface-soft)"></div>
                    <div class="h-3 w-3/4 rounded-full bg-(--app-surface-soft)"></div>
                  </div>
                </div>
              </div>
            </div>
            <div
              v-else-if="!publicBots.length"
              class="flex flex-col items-center px-5 py-12 text-center"
            >
              <span
                class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--app-surface-soft) text-(--app-muted)"
              >
                <Bot class="h-6 w-6" :stroke-width="1.8" aria-hidden="true" />
              </span>
              <h3 class="text-sm font-semibold text-(--app-text)">No bots discovered yet</h3>
              <p class="mt-1 max-w-sm text-sm leading-5 text-(--app-muted)">
                Bots that publish a <span class="font-mono">gupt-bot</span> listing with a name and
                about text will show up here.
              </p>
            </div>
            <ul v-else class="grid gap-3 sm:grid-cols-2">
              <li v-for="bot in publicBots" :key="bot.pubkey" class="min-w-0">
                <article
                  class="group flex h-full flex-col rounded-2xl border border-(--app-border) bg-(--app-surface) p-4 transition-all hover:-translate-y-0.5 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:shadow-sm"
                >
                  <button
                    type="button"
                    class="flex min-h-11 w-full flex-1 items-start gap-3 text-left disabled:opacity-60"
                    :disabled="Boolean(openingBotPubkey)"
                    @click="openPublicBot(bot)"
                  >
                    <span
                      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-(--app-surface-soft) text-(--app-primary) ring-1 ring-(--app-border) transition-colors group-hover:bg-(--app-primary) group-hover:text-white"
                    >
                      <Bot class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center justify-between gap-2">
                        <span class="truncate text-sm font-semibold text-(--app-text)">{{
                          bot.name
                        }}</span>
                        <ArrowUpRight
                          v-if="openingBotPubkey !== bot.pubkey"
                          class="h-4 w-4 shrink-0 text-(--app-muted) transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-(--app-primary)"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                        <span v-else class="shrink-0 text-[11px] font-semibold text-(--app-primary)"
                          >Opening…</span
                        >
                      </span>
                      <span class="mt-1 line-clamp-3 text-sm leading-5 text-(--app-muted)">{{
                        bot.about
                      }}</span>
                      <span class="mt-2 block font-mono text-[11px] text-(--app-text-soft)">{{
                        shortId(bot.pubkey)
                      }}</span>
                    </span>
                  </button>
                  <div
                    v-if="bot.website || bot.owner"
                    class="mt-3 flex flex-wrap items-center gap-2 border-t border-(--app-border) pt-3 text-xs"
                  >
                    <a
                      v-if="bot.website"
                      :href="bot.website"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 font-semibold text-(--app-primary) transition-colors hover:bg-(--app-surface-soft)"
                      @click.stop
                    >
                      <ExternalLink class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
                      Website
                    </a>
                    <RouterLink
                      v-if="bot.owner"
                      :to="`/profile/${bot.owner}`"
                      class="inline-flex min-h-10 items-center rounded-xl px-2 font-mono text-(--app-text-soft) transition-colors hover:bg-(--app-surface-soft) hover:text-(--app-text)"
                      @click.stop
                    >
                      Owner {{ shortId(bot.owner) }}
                    </RouterLink>
                  </div>
                </article>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
