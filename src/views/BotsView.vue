<script setup>
import { computed, onMounted, ref } from "vue";
import { Bot, ExternalLink, RefreshCw, Search } from "@lucide/vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { useOpenConversation } from "@/composables/useOpenConversation";
import { BOT_ESTABLISHED_DAYS, fetchBots, shortBotPubkey } from "@/lib/bots";
import { botKnownDays, readBotSightings, recordBotSightings } from "@/lib/botSightings";
import { useIdentityStore } from "@/stores/identity";

const identity = useIdentityStore();
const { openDmWith } = useOpenConversation();

const bots = ref([]);
const sightings = ref({});
const filter = ref("all");
const searchQuery = ref("");
const isLoading = ref(true);
const isRefreshing = ref(false);
const openingPubkey = ref("");
const error = ref("");

const enriched = computed(() =>
  bots.value.map((bot) => {
    const knownDays = botKnownDays(sightings.value[bot.pubkey]);
    return {
      ...bot,
      knownDays,
      established: knownDays !== null && knownDays >= BOT_ESTABLISHED_DAYS,
      fresh: knownDays !== null && knownDays < 7,
    };
  }),
);

const counts = computed(() => ({
  all: enriched.value.length,
  established: enriched.value.filter((bot) => bot.established).length,
  new: enriched.value.filter((bot) => bot.fresh).length,
}));

const visibleBots = computed(() => {
  const needle = searchQuery.value.trim().toLowerCase();
  const matches = enriched.value.filter((bot) => {
    if (filter.value === "established" && !bot.established) return false;
    if (filter.value === "new" && !bot.fresh) return false;
    if (!needle) return true;
    return [bot.name, bot.description, bot.owner, bot.websiteHost]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
  return matches.sort(
    (a, b) =>
      Number(b.established) - Number(a.established) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
});

function timeAgo(ts) {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function knownLabel(bot) {
  if (bot.knownDays === null) return "";
  if (bot.knownDays === 0) return "first seen today";
  if (bot.knownDays === 1) return "known 1 day";
  return `known ${bot.knownDays} days`;
}

async function load({ refresh = false } = {}) {
  if (refresh) isRefreshing.value = true;
  else isLoading.value = true;
  error.value = "";
  try {
    const list = await fetchBots();
    bots.value = list;
    sightings.value = recordBotSightings(list);
  } catch (err) {
    error.value = err?.message || "Could not reach your relays.";
    if (!refresh) bots.value = [];
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
}

async function openBotChat(bot) {
  if (!bot?.pubkey || openingPubkey.value) return;
  openingPubkey.value = bot.pubkey;
  error.value = "";
  try {
    await identity.init();
    if (!identity.isReady) return;
    await openDmWith(identity, bot.pubkey, { label: bot.name });
  } catch (err) {
    error.value = err?.message || "Could not open the chat.";
  } finally {
    openingPubkey.value = "";
  }
}

onMounted(() => {
  sightings.value = readBotSightings();
  load();
});
</script>

<template>
  <div class="min-h-screen bg-black pb-16 text-zinc-100">
    <main class="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div
        class="flex flex-col gap-4 border-b border-zinc-800/80 pb-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 class="text-xl font-semibold tracking-tight text-white">
            Bots
            <span
              v-if="enriched.length"
              class="ml-1 font-mono text-[11px] font-medium tabular-nums text-zinc-500"
            >
              ({{ enriched.length }})
            </span>
          </h1>
          <p class="mt-1 text-sm leading-6 text-zinc-400">
            Signed heartbeats from bots that announced on your relays in the last 60 minutes.
            Long-running bots are pinned first.
          </p>
        </div>
        <button
          type="button"
          :disabled="isRefreshing"
          class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-50"
          @click="load({ refresh: true })"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': isRefreshing }" />
          <span>Sync</span>
        </button>
      </div>

      <div
        v-if="error"
        class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
      >
        <span>{{ error }}</span>
        <button
          type="button"
          class="cursor-pointer text-xs font-medium underline underline-offset-2 hover:text-red-200"
          @click="load({ refresh: true })"
        >
          Retry
        </button>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          class="inline-flex max-w-full shrink-0 gap-0.5 overflow-x-auto rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          <button
            v-for="option in [
              { id: 'all', label: 'All', count: counts.all },
              { id: 'established', label: 'Established', count: counts.established },
              { id: 'new', label: 'New', count: counts.new },
            ]"
            :key="option.id"
            type="button"
            class="cursor-pointer select-none whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all"
            :class="
              filter === option.id
                ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                : 'text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200'
            "
            @click="filter = option.id"
          >
            {{ option.label }}
            <span class="ml-1 font-mono text-[10px] tabular-nums text-zinc-500"
              >({{ option.count }})</span
            >
          </button>
        </div>

        <div class="relative min-w-0 flex-1">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search bots, owners, sites…"
            class="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-950/60 pl-9 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
        </div>
      </div>

      <div v-if="isLoading" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="status">
        <span class="sr-only">Loading bots…</span>
        <div
          v-for="n in 6"
          :key="n"
          class="space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4"
          aria-hidden="true"
        >
          <div class="flex items-center gap-3">
            <div class="skeleton-shimmer h-10 w-10 rounded-xl" />
            <div class="space-y-1.5">
              <div class="skeleton-shimmer h-4 w-28" />
              <div class="skeleton-shimmer h-3 w-20" />
            </div>
          </div>
          <div class="skeleton-shimmer h-3 w-full" />
          <div class="skeleton-shimmer h-3 w-4/5" />
        </div>
      </div>

      <div
        v-else-if="!visibleBots.length"
        class="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-6 py-14 text-center"
      >
        <div
          class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-500"
        >
          <Bot class="h-6 w-6" :stroke-width="1.8" />
        </div>
        <h2 class="text-sm font-semibold tracking-tight text-zinc-200">
          {{ searchQuery || filter !== "all" ? "No bots match" : "No bots live right now" }}
        </h2>
        <p class="mx-auto mt-1 max-w-md text-sm leading-relaxed text-zinc-500">
          {{
            searchQuery || filter !== "all"
              ? "Try another search or filter."
              : "A bot appears here only if it published a beacon to a relay you have configured in the last 60 minutes."
          }}
        </p>
        <a
          v-if="!searchQuery && filter === 'all'"
          href="https://gist.githubusercontent.com/besoeasy/098bbed1f63a57a16f208c15155fbf7c/raw/bots.md"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
        >
          Publish your own bot
          <ExternalLink class="h-3.5 w-3.5" />
        </a>
        <button
          v-else
          type="button"
          class="mt-4 cursor-pointer text-xs font-medium text-zinc-400 hover:text-white hover:underline"
          @click="
            searchQuery = '';
            filter = 'all';
          "
        >
          Clear filters
        </button>
      </div>

      <div v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="bot in visibleBots"
          :key="bot.pubkey"
          role="button"
          tabindex="0"
          :aria-label="`Open chat with ${bot.name}`"
          :aria-busy="openingPubkey === bot.pubkey"
          class="flex cursor-pointer flex-col gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4 transition-colors hover:border-zinc-700/80 hover:bg-zinc-900/30 focus:outline-none focus-visible:border-zinc-500"
          :class="{ 'opacity-60': openingPubkey === bot.pubkey }"
          @click="openBotChat(bot)"
          @keydown.enter.prevent="openBotChat(bot)"
          @keydown.space.prevent="openBotChat(bot)"
        >
          <div class="flex items-start gap-3">
            <RoboAvatar :pubkey="bot.pubkey" size="md" rounded="xl" :alt="bot.name" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h2 class="truncate text-sm font-semibold tracking-tight text-zinc-100">
                  {{ bot.name }}
                </h2>
                <span
                  v-if="bot.established"
                  class="shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-400"
                  :title="`Known to this device for ${BOT_ESTABLISHED_DAYS}+ days`"
                >
                  {{ BOT_ESTABLISHED_DAYS }}d+
                </span>
              </div>
              <p v-if="bot.owner" class="truncate text-xs text-zinc-500">by {{ bot.owner }}</p>
              <p v-else class="truncate text-xs text-zinc-600">unattributed</p>
            </div>
          </div>

          <p v-if="bot.description" class="line-clamp-3 text-sm leading-relaxed text-zinc-400">
            {{ bot.description }}
          </p>
          <p v-else class="text-sm italic text-zinc-600">No description</p>

          <div class="mt-auto flex items-end justify-between gap-3 pt-1">
            <div class="min-w-0 space-y-0.5">
              <a
                v-if="bot.website"
                :href="bot.website"
                target="_blank"
                rel="noopener noreferrer nofollow"
                class="inline-flex max-w-full items-center gap-1 text-xs font-medium text-(--app-primary) hover:underline"
                @click.stop
              >
                <ExternalLink class="h-3 w-3 shrink-0" />
                <span class="truncate">{{ bot.websiteHost }}</span>
              </a>
              <p class="truncate text-[11px] text-zinc-600" :title="`ed25519:${bot.pubkey}`">
                {{ shortBotPubkey(bot.pubkey) }}
              </p>
            </div>
            <div class="shrink-0 text-right text-[11px] leading-5 text-zinc-500">
              <p>{{ timeAgo(bot.createdAt) }}</p>
              <p v-if="bot.knownDays !== null" class="text-zinc-600">{{ knownLabel(bot) }}</p>
            </div>
          </div>
        </article>
      </div>
    </main>
  </div>
</template>
