<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Bot, ExternalLink, RefreshCw, Search } from "@lucide/vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { useOpenConversation } from "@/composables/useOpenConversation";
import { BOT_ESTABLISHED_DAYS, fetchBots, shortBotPubkey } from "@/lib/bots";
import { botKnownDays, readBotSightings, recordBotSightings } from "@/lib/botSightings";
import { useIdentityStore } from "@/stores/identity";

const AUTO_REFRESH_MS = 60 * 1000;

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

let inFlight = false;
let refreshTimer = null;

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

async function load({ refresh = false, silent = false } = {}) {
  if (inFlight) return;
  inFlight = true;
  if (!silent) {
    if (refresh) isRefreshing.value = true;
    else isLoading.value = true;
    error.value = "";
  }
  try {
    const list = await fetchBots();
    bots.value = list;
    sightings.value = recordBotSightings(list);
    error.value = "";
  } catch (err) {
    // A background poll keeps the last good list; only manual loads surface it.
    if (!silent) {
      error.value = err?.message || "Could not reach your relays.";
      if (!refresh) bots.value = [];
    }
  } finally {
    inFlight = false;
    if (!silent) {
      isLoading.value = false;
      isRefreshing.value = false;
    }
  }
}

function refreshIfVisible() {
  if (document.visibilityState === "visible") load({ refresh: true, silent: true });
}

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(refreshIfVisible, AUTO_REFRESH_MS);
}

function stopAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
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
  startAutoRefresh();
  document.addEventListener("visibilitychange", refreshIfVisible);
});

onBeforeUnmount(() => {
  stopAutoRefresh();
  document.removeEventListener("visibilitychange", refreshIfVisible);
});
</script>

<template>
  <div class="bots-view__block">
    <main class="bots-view__main">
      <div
        class="bots-view__block-2"
      >
        <div>
          <h1 class="bots-view__title-bots">
            Bots
            <span
              v-if="enriched.length"
              class="bots-view__text"
            >
              ({{ enriched.length }})
            </span>
          </h1>
          <p class="bots-view__text-2">
            Signed heartbeats from bots that announced on your relays in the last 60 minutes.
            Long-running bots are pinned first.
          </p>
        </div>
        <button
          type="button"
          :disabled="isRefreshing"
          class="bots-view__button"
          @click="load({ refresh: true })"
        >
          <RefreshCw class="bots-view__refresh-cw" :class="{ 'bots-view__refresh-cw--spin': isRefreshing }" />
          <span>Sync</span>
        </button>
      </div>

      <div
        v-if="error"
        class="bots-view__block-3"
      >
        <span>{{ error }}</span>
        <button
          type="button"
          class="bots-view__button-retry"
          @click="load({ refresh: true })"
        >
          Retry
        </button>
      </div>

      <div class="bots-view__block-4">
        <div
          class="bots-view__block-5"
        >
          <button
            v-for="option in [
              { id: 'all', label: 'All', count: counts.all },
              { id: 'established', label: 'Established', count: counts.established },
              { id: 'new', label: 'New', count: counts.new },
            ]"
            :key="option.id"
            type="button"
            class="bots-view__button-2"
            :class="
              filter === option.id
                ? 'bots-view__button--selected'
                : 'bots-view__button--muted'
            "
            @click="filter = option.id"
          >
            {{ option.label }}
            <span class="bots-view__text-3"
              >({{ option.count }})</span
            >
          </button>
        </div>

        <div class="bots-view__block-6">
          <Search
            class="bots-view__search"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search bots, owners, sites…"
            class="bots-view__field-text"
          />
        </div>
      </div>

      <div v-if="isLoading" class="bots-view__status" role="status">
        <span class="bots-view__text-4">Loading bots…</span>
        <div
          v-for="n in 6"
          :key="n"
          class="bots-view__block-7"
          aria-hidden="true"
        >
          <div class="bots-view__block-8">
            <div class="skeleton-shimmer bots-view__block-9" />
            <div class="bots-view__block-10">
              <div class="skeleton-shimmer bots-view__block-11" />
              <div class="skeleton-shimmer bots-view__block-12" />
            </div>
          </div>
          <div class="skeleton-shimmer bots-view__block-13" />
          <div class="skeleton-shimmer bots-view__block-14" />
        </div>
      </div>

      <div
        v-else-if="!visibleBots.length"
        class="bots-view__block-15"
      >
        <div
          class="bots-view__block-16"
        >
          <Bot class="bots-view__bot" :stroke-width="1.8" />
        </div>
        <h2 class="bots-view__subtitle">
          {{ searchQuery || filter !== "all" ? "No bots match" : "No bots live right now" }}
        </h2>
        <p class="bots-view__text-5">
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
          class="bots-view__link-publish-your"
        >
          Publish your own bot
          <ExternalLink class="bots-view__external-link" />
        </a>
        <button
          v-else
          type="button"
          class="bots-view__button-clear-filters"
          @click="
            searchQuery = '';
            filter = 'all';
          "
        >
          Clear filters
        </button>
      </div>

      <div v-else class="bots-view__block-17">
        <article
          v-for="bot in visibleBots"
          :key="bot.pubkey"
          role="button"
          tabindex="0"
          :aria-label="`Open chat with ${bot.name}`"
          :aria-busy="openingPubkey === bot.pubkey"
          class="bots-view__button-3"
          :class="{ 'bots-view__button--variant-1': openingPubkey === bot.pubkey }"
          @click="openBotChat(bot)"
          @keydown.enter.prevent="openBotChat(bot)"
          @keydown.space.prevent="openBotChat(bot)"
        >
          <div class="bots-view__block-18">
            <RoboAvatar :pubkey="bot.pubkey" size="md" rounded="xl" :alt="bot.name" />
            <div class="bots-view__block-19">
              <div class="bots-view__block-20">
                <h2 class="bots-view__subtitle-2">
                  {{ bot.name }}
                </h2>
                <span
                  v-if="bot.established"
                  class="bots-view__text-6"
                  :title="`Known to this device for ${BOT_ESTABLISHED_DAYS}+ days`"
                >
                  {{ BOT_ESTABLISHED_DAYS }}d+
                </span>
              </div>
              <p v-if="bot.owner" class="bots-view__text-by">by {{ bot.owner }}</p>
              <p v-else class="bots-view__text-unattributed">unattributed</p>
            </div>
          </div>

          <p v-if="bot.description" class="bots-view__text-7">
            {{ bot.description }}
          </p>
          <p v-else class="bots-view__text-no-description">No description</p>

          <div class="bots-view__block-21">
            <div class="bots-view__block-22">
              <a
                v-if="bot.website"
                :href="bot.website"
                target="_blank"
                rel="noopener noreferrer nofollow"
                class="bots-view__link"
                @click.stop
              >
                <ExternalLink class="bots-view__external-link-2" />
                <span class="bots-view__text-8">{{ bot.websiteHost }}</span>
              </a>
              <p class="bots-view__text-9" :title="`ed25519:${bot.pubkey}`">
                {{ shortBotPubkey(bot.pubkey) }}
              </p>
            </div>
            <div class="bots-view__block-23">
              <p>{{ timeAgo(bot.createdAt) }}</p>
              <p v-if="bot.knownDays !== null" class="bots-view__text-10">{{ knownLabel(bot) }}</p>
            </div>
          </div>
        </article>
      </div>
    </main>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.bots-view__text-6 {
  border-color: color-mix(in oklab,var(--color-emerald-500) 25%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__block-3 {
  border-color: color-mix(in oklab,var(--color-red-900) 50%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__block-2 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__block-5 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__block-7 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__block-15 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__button-3 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__text-6 {
  background-color: color-mix(in oklab,var(--color-emerald-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__block-3 {
  background-color: color-mix(in oklab,var(--color-red-950) 30%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__button {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__link-publish-your {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__block-7 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__block-15 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__button-3 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__block-5 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.bots-view__field-text {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 60%,transparent);
}
}

@media (hover:hover) {
.bots-view__button:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.bots-view__link-publish-your:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.bots-view__button-3:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.bots-view__button-3:hover {
  border-color: color-mix(in oklab,var(--ui-zinc-700) 80%,transparent);
}
}
}

@media (hover:hover) {
.bots-view__button:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.bots-view__link-publish-your:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.bots-view__button-3:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.bots-view__button-3:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 30%,transparent);
}
}
}

@media (hover:hover) {
.bots-view__button--muted:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.bots-view__button--muted:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}
}

@media (hover:hover) {
.bots-view__button-retry:hover {
  color: var(--color-red-200);
}
}

@media (hover:hover) {
.bots-view__button:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.bots-view__link-publish-your:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.bots-view__button-clear-filters:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.bots-view__button--muted:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.bots-view__button-clear-filters:hover {
  text-decoration-line: underline;
}
}

@media (hover:hover) {
.bots-view__link:hover {
  text-decoration-line: underline;
}
}

@media (min-width:40rem) {
.bots-view__status {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
}

@media (min-width:40rem) {
.bots-view__block-17 {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
}

@media (min-width:40rem) {
.bots-view__block-2 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.bots-view__block-4 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.bots-view__block-2 {
  align-items: center;
}
}

@media (min-width:40rem) {
.bots-view__block-4 {
  align-items: center;
}
}

@media (min-width:40rem) {
.bots-view__block-2 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.bots-view__main {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.bots-view__main {
  padding-inline: calc(var(--spacing) * 8);
}
}

@media (min-width:80rem) {
.bots-view__status {
  grid-template-columns: repeat(3,minmax(0,1fr));
}
}

@media (min-width:80rem) {
.bots-view__block-17 {
  grid-template-columns: repeat(3,minmax(0,1fr));
}
}

@layer gupt-components {
.bots-view__search {
  pointer-events: none;
}
.bots-view__text-4 {
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  position: absolute;
  overflow: hidden;
}
.bots-view__search {
  position: absolute;
}
.bots-view__block-6 {
  position: relative;
}
.bots-view__search {
  top: 50%;
}
.bots-view__search {
  left: calc(var(--spacing) * 3);
}
.bots-view__main {
  margin-inline: auto;
}
.bots-view__block-16 {
  margin-inline: auto;
}
.bots-view__text-5 {
  margin-inline: auto;
}
.bots-view__text-2 {
  margin-top: var(--spacing);
}
.bots-view__text-5 {
  margin-top: var(--spacing);
}
.bots-view__button-clear-filters {
  margin-top: calc(var(--spacing) * 4);
}
.bots-view__link-publish-your {
  margin-top: calc(var(--spacing) * 5);
}
.bots-view__block-21 {
  margin-top: auto;
}
.bots-view__block-16 {
  margin-bottom: calc(var(--spacing) * 4);
}
.bots-view__text {
  margin-left: var(--spacing);
}
.bots-view__text-3 {
  margin-left: var(--spacing);
}
.bots-view__text-7 {
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  display: -webkit-box;
  overflow: hidden;
}
.bots-view__block-2 {
  display: flex;
}
.bots-view__block-3 {
  display: flex;
}
.bots-view__block-4 {
  display: flex;
}
.bots-view__block-8 {
  display: flex;
}
.bots-view__block-16 {
  display: flex;
}
.bots-view__button-3 {
  display: flex;
}
.bots-view__block-18 {
  display: flex;
}
.bots-view__block-20 {
  display: flex;
}
.bots-view__block-21 {
  display: flex;
}
.bots-view__status {
  display: grid;
}
.bots-view__block-17 {
  display: grid;
}
.bots-view__button {
  display: inline-flex;
}
.bots-view__block-5 {
  display: inline-flex;
}
.bots-view__link-publish-your {
  display: inline-flex;
}
.bots-view__link {
  display: inline-flex;
}
.bots-view__block-12 {
  height: calc(var(--spacing) * 3);
}
.bots-view__block-13 {
  height: calc(var(--spacing) * 3);
}
.bots-view__block-14 {
  height: calc(var(--spacing) * 3);
}
.bots-view__external-link-2 {
  height: calc(var(--spacing) * 3);
}
.bots-view__refresh-cw {
  height: calc(var(--spacing) * 3.5);
}
.bots-view__external-link {
  height: calc(var(--spacing) * 3.5);
}
.bots-view__search {
  height: calc(var(--spacing) * 4);
}
.bots-view__block-11 {
  height: calc(var(--spacing) * 4);
}
.bots-view__bot {
  height: calc(var(--spacing) * 6);
}
.bots-view__button {
  height: calc(var(--spacing) * 8);
}
.bots-view__link-publish-your {
  height: calc(var(--spacing) * 9);
}
.bots-view__field-text {
  height: calc(var(--spacing) * 10);
}
.bots-view__block-9 {
  height: calc(var(--spacing) * 10);
}
.bots-view__block-16 {
  height: calc(var(--spacing) * 12);
}
.bots-view__block {
  min-height: 100vh;
}
.bots-view__external-link-2 {
  width: calc(var(--spacing) * 3);
}
.bots-view__refresh-cw {
  width: calc(var(--spacing) * 3.5);
}
.bots-view__external-link {
  width: calc(var(--spacing) * 3.5);
}
.bots-view__search {
  width: calc(var(--spacing) * 4);
}
.bots-view__block-14 {
  width: 80%;
}
.bots-view__bot {
  width: calc(var(--spacing) * 6);
}
.bots-view__block-9 {
  width: calc(var(--spacing) * 10);
}
.bots-view__block-16 {
  width: calc(var(--spacing) * 12);
}
.bots-view__block-12 {
  width: calc(var(--spacing) * 20);
}
.bots-view__block-11 {
  width: calc(var(--spacing) * 28);
}
.bots-view__main {
  width: 100%;
}
.bots-view__field-text {
  width: 100%;
}
.bots-view__block-13 {
  width: 100%;
}
.bots-view__main {
  max-width: var(--container-6xl);
}
.bots-view__block-5 {
  max-width: 100%;
}
.bots-view__link {
  max-width: 100%;
}
.bots-view__text-5 {
  max-width: var(--container-md);
}
.bots-view__block-6 {
  min-width: 0;
}
.bots-view__block-19 {
  min-width: 0;
}
.bots-view__block-22 {
  min-width: 0;
}
.bots-view__block-6 {
  flex: 1;
}
.bots-view__block-19 {
  flex: 1;
}
.bots-view__block-5 {
  flex-shrink: 0;
}
.bots-view__text-6 {
  flex-shrink: 0;
}
.bots-view__external-link-2 {
  flex-shrink: 0;
}
.bots-view__block-23 {
  flex-shrink: 0;
}
.bots-view__search {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.bots-view__refresh-cw--spin {
  animation: var(--animate-spin);
}
.bots-view__button {
  cursor: pointer;
}
.bots-view__button-retry {
  cursor: pointer;
}
.bots-view__button-2 {
  cursor: pointer;
}
.bots-view__button-clear-filters {
  cursor: pointer;
}
.bots-view__button-3 {
  cursor: pointer;
}
.bots-view__block-5 {
  scrollbar-width: none;
}
.bots-view__block-2 {
  flex-direction: column;
}
.bots-view__block-4 {
  flex-direction: column;
}
.bots-view__button-3 {
  flex-direction: column;
}
.bots-view__block-3 {
  flex-wrap: wrap;
}
.bots-view__button {
  align-items: center;
}
.bots-view__block-3 {
  align-items: center;
}
.bots-view__block-8 {
  align-items: center;
}
.bots-view__block-16 {
  align-items: center;
}
.bots-view__link-publish-your {
  align-items: center;
}
.bots-view__block-20 {
  align-items: center;
}
.bots-view__link {
  align-items: center;
}
.bots-view__block-21 {
  align-items: flex-end;
}
.bots-view__block-18 {
  align-items: flex-start;
}
.bots-view__block-3 {
  justify-content: space-between;
}
.bots-view__block-21 {
  justify-content: space-between;
}
.bots-view__block-16 {
  justify-content: center;
}
.bots-view__block-5 {
  gap: calc(var(--spacing) * .5);
}
.bots-view__link {
  gap: var(--spacing);
}
.bots-view__button {
  gap: calc(var(--spacing) * 1.5);
}
.bots-view__link-publish-your {
  gap: calc(var(--spacing) * 1.5);
}
.bots-view__block-3 {
  gap: calc(var(--spacing) * 2);
}
.bots-view__block-20 {
  gap: calc(var(--spacing) * 2);
}
.bots-view__block-4 {
  gap: calc(var(--spacing) * 3);
}
.bots-view__status {
  gap: calc(var(--spacing) * 3);
}
.bots-view__block-8 {
  gap: calc(var(--spacing) * 3);
}
.bots-view__block-17 {
  gap: calc(var(--spacing) * 3);
}
.bots-view__button-3 {
  gap: calc(var(--spacing) * 3);
}
.bots-view__block-18 {
  gap: calc(var(--spacing) * 3);
}
.bots-view__block-21 {
  gap: calc(var(--spacing) * 3);
}
.bots-view__block-2 {
  gap: calc(var(--spacing) * 4);
}
:where(.bots-view__block-22>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * .5) * 0);
  margin-block-end: calc(calc(var(--spacing) * .5) * calc(1 - 0));
}
:where(.bots-view__block-10>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.bots-view__block-7>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.bots-view__main>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
.bots-view__subtitle-2 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.bots-view__text-by {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.bots-view__text-unattributed {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.bots-view__text-8 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.bots-view__text-9 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.bots-view__block-5 {
  overflow-x: auto;
}
.bots-view__block-7 {
  border-radius: var(--radius-2xl);
}
.bots-view__button-3 {
  border-radius: var(--radius-2xl);
}
.bots-view__text-6 {
  border-radius: 3.40282e38px;
}
.bots-view__button {
  border-radius: var(--radius-lg);
}
.bots-view__block-5 {
  border-radius: var(--radius-lg);
}
.bots-view__link-publish-your {
  border-radius: var(--radius-lg);
}
.bots-view__button-2 {
  border-radius: var(--radius-md);
}
.bots-view__block-3 {
  border-radius: var(--radius-xl);
}
.bots-view__field-text {
  border-radius: var(--radius-xl);
}
.bots-view__block-9 {
  border-radius: var(--radius-xl);
}
.bots-view__block-15 {
  border-radius: var(--radius-xl);
}
.bots-view__block-16 {
  border-radius: var(--radius-xl);
}
.bots-view__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bots-view__block-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bots-view__block-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bots-view__field-text {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bots-view__block-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bots-view__block-15 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bots-view__block-16 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bots-view__link-publish-your {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bots-view__button-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bots-view__text-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.bots-view__block-2 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.bots-view__text-6 {
  border-color: #00bb7f40;
}
.bots-view__block-3 {
  border-color: #82181a80;
}
.bots-view__button {
  border-color: var(--ui-zinc-800);
}
.bots-view__field-text {
  border-color: var(--ui-zinc-800);
}
.bots-view__block-16 {
  border-color: var(--ui-zinc-800);
}
.bots-view__link-publish-your {
  border-color: var(--ui-zinc-800);
}
.bots-view__block-2 {
  border-color: var(--ui-zinc-800);
}
.bots-view__block-5 {
  border-color: var(--ui-zinc-800);
}
.bots-view__block-7 {
  border-color: var(--ui-zinc-800);
}
.bots-view__block-15 {
  border-color: var(--ui-zinc-800);
}
.bots-view__button-3 {
  border-color: var(--ui-zinc-800);
}
.bots-view__block {
  background-color: var(--ui-black);
}
.bots-view__text-6 {
  background-color: #00bb7f1a;
}
.bots-view__block-3 {
  background-color: #4608094d;
}
.bots-view__button--selected {
  background-color: var(--ui-zinc-800);
}
.bots-view__block-16 {
  background-color: var(--ui-zinc-900);
}
.bots-view__button {
  background-color: var(--ui-zinc-900);
}
.bots-view__link-publish-your {
  background-color: var(--ui-zinc-900);
}
.bots-view__block-7 {
  background-color: var(--ui-zinc-950);
}
.bots-view__block-15 {
  background-color: var(--ui-zinc-950);
}
.bots-view__button-3 {
  background-color: var(--ui-zinc-950);
}
.bots-view__block-5 {
  background-color: var(--ui-zinc-950);
}
.bots-view__field-text {
  background-color: var(--ui-zinc-950);
}
.bots-view__block-5 {
  padding: calc(var(--spacing) * .5);
}
.bots-view__block-7 {
  padding: calc(var(--spacing) * 4);
}
.bots-view__button-3 {
  padding: calc(var(--spacing) * 4);
}
.bots-view__text-6 {
  padding-inline: calc(var(--spacing) * 2);
}
.bots-view__button {
  padding-inline: calc(var(--spacing) * 3);
}
.bots-view__button-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.bots-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.bots-view__block-3 {
  padding-inline: calc(var(--spacing) * 4);
}
.bots-view__link-publish-your {
  padding-inline: calc(var(--spacing) * 4);
}
.bots-view__block-15 {
  padding-inline: calc(var(--spacing) * 6);
}
.bots-view__text-6 {
  padding-block: calc(var(--spacing) * .5);
}
.bots-view__button-2 {
  padding-block: var(--spacing);
}
.bots-view__block-3 {
  padding-block: calc(var(--spacing) * 3);
}
.bots-view__main {
  padding-block: calc(var(--spacing) * 6);
}
.bots-view__block-15 {
  padding-block: calc(var(--spacing) * 14);
}
.bots-view__block-21 {
  padding-top: var(--spacing);
}
.bots-view__field-text {
  padding-right: calc(var(--spacing) * 4);
}
.bots-view__block-2 {
  padding-bottom: calc(var(--spacing) * 5);
}
.bots-view__block {
  padding-bottom: calc(var(--spacing) * 16);
}
.bots-view__field-text {
  padding-left: calc(var(--spacing) * 9);
}
.bots-view__block-15 {
  text-align: center;
}
.bots-view__block-23 {
  text-align: right;
}
.bots-view__text {
  font-family: var(--font-mono);
}
.bots-view__text-3 {
  font-family: var(--font-mono);
}
.bots-view__text-6 {
  font-family: var(--font-mono);
}
.bots-view__text-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bots-view__block-3 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bots-view__field-text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bots-view__subtitle {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bots-view__text-5 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bots-view__subtitle-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bots-view__text-7 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bots-view__text-no-description {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.bots-view__title-bots {
  font-size: var(--text-xl);
  line-height: var(--leading,var(--text-xl--line-height));
}
.bots-view__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bots-view__button-retry {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bots-view__button-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bots-view__link-publish-your {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bots-view__button-clear-filters {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bots-view__text-by {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bots-view__text-unattributed {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bots-view__link {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.bots-view__text-6 {
  font-size: 9px;
}
.bots-view__text-3 {
  font-size: 10px;
}
.bots-view__text {
  font-size: 11px;
}
.bots-view__text-9 {
  font-size: 11px;
}
.bots-view__block-23 {
  font-size: 11px;
}
.bots-view__block-23 {
  --leading: calc(var(--spacing) * 5);
  line-height: calc(var(--spacing) * 5);
}
.bots-view__text-2 {
  --leading: calc(var(--spacing) * 6);
  line-height: calc(var(--spacing) * 6);
}
.bots-view__text-5 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.bots-view__text-7 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.bots-view__text {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bots-view__button {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bots-view__button-retry {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bots-view__button-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bots-view__link-publish-your {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bots-view__button-clear-filters {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bots-view__link {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.bots-view__title-bots {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.bots-view__subtitle {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.bots-view__subtitle-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.bots-view__title-bots {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.bots-view__subtitle {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.bots-view__subtitle-2 {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.bots-view__text-6 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.bots-view__button-2 {
  white-space: nowrap;
}
.bots-view__link {
  color: var(--app-primary);
}
.bots-view__text-6 {
  color: var(--color-emerald-400);
}
.bots-view__block-3 {
  color: var(--color-red-300);
}
.bots-view__title-bots {
  color: var(--color-white);
}
.bots-view__block {
  color: var(--ui-zinc-100);
}
.bots-view__button--selected {
  color: var(--ui-zinc-100);
}
.bots-view__field-text {
  color: var(--ui-zinc-100);
}
.bots-view__subtitle-2 {
  color: var(--ui-zinc-100);
}
.bots-view__subtitle {
  color: var(--ui-zinc-200);
}
.bots-view__button {
  color: var(--ui-zinc-300);
}
.bots-view__link-publish-your {
  color: var(--ui-zinc-300);
}
.bots-view__text-2 {
  color: var(--ui-zinc-400);
}
.bots-view__button--muted {
  color: var(--ui-zinc-400);
}
.bots-view__button-clear-filters {
  color: var(--ui-zinc-400);
}
.bots-view__text-7 {
  color: var(--ui-zinc-400);
}
.bots-view__text {
  color: var(--ui-zinc-500);
}
.bots-view__text-3 {
  color: var(--ui-zinc-500);
}
.bots-view__block-16 {
  color: var(--ui-zinc-500);
}
.bots-view__text-5 {
  color: var(--ui-zinc-500);
}
.bots-view__text-by {
  color: var(--ui-zinc-500);
}
.bots-view__block-23 {
  color: var(--ui-zinc-500);
}
.bots-view__search {
  color: var(--ui-zinc-600);
}
.bots-view__text-unattributed {
  color: var(--ui-zinc-600);
}
.bots-view__text-no-description {
  color: var(--ui-zinc-600);
}
.bots-view__text-9 {
  color: var(--ui-zinc-600);
}
.bots-view__text-10 {
  color: var(--ui-zinc-600);
}
.bots-view__text-6 {
  text-transform: uppercase;
}
.bots-view__text-no-description {
  font-style: italic;
}
.bots-view__text {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.bots-view__text-3 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.bots-view__button-retry {
  text-decoration-line: underline;
}
.bots-view__button-retry {
  text-underline-offset: 2px;
}
.bots-view__button--variant-1 {
  opacity: .6;
}
.bots-view__button {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.bots-view__button--selected {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.bots-view__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bots-view__button-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bots-view__link-publish-your {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bots-view__button-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.bots-view__button-2 {
  -webkit-user-select: none;
  user-select: none;
}
.bots-view__block-5 {
  -ms-overflow-style: none;
}
.bots-view__field-text::placeholder {
  color: var(--ui-zinc-600);
}
.bots-view__field-text:focus {
  border-color: var(--ui-zinc-600);
}
.bots-view__field-text:focus {
  --outline-style: none;
  outline-style: none;
}
.bots-view__button-3:focus {
  --outline-style: none;
  outline-style: none;
}
.bots-view__button-3:focus-visible {
  border-color: var(--ui-zinc-500);
}
.bots-view__button:disabled {
  opacity: .5;
}
.bots-view__block-5::-webkit-scrollbar {
  display: none;
}
[data-theme="light"] .bots-view__text-6 {
  color: #059669;
}
[data-theme="light"] .bots-view__block-3 {
  color: #dc2626;
}
[data-theme="light"] .bots-view__button {
  color: var(--app-text-soft);
}
[data-theme="light"] .bots-view__link-publish-your {
  color: var(--app-text-soft);
}
[data-theme="light"] .bots-view__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .bots-view__button--muted {
  color: var(--app-muted);
}
[data-theme="light"] .bots-view__button-clear-filters {
  color: var(--app-muted);
}
[data-theme="light"] .bots-view__text-7 {
  color: var(--app-muted);
}
[data-theme="light"] .bots-view__text {
  color: var(--app-muted);
}
[data-theme="light"] .bots-view__text-3 {
  color: var(--app-muted);
}
[data-theme="light"] .bots-view__block-16 {
  color: var(--app-muted);
}
[data-theme="light"] .bots-view__text-5 {
  color: var(--app-muted);
}
[data-theme="light"] .bots-view__text-by {
  color: var(--app-muted);
}
[data-theme="light"] .bots-view__block-23 {
  color: var(--app-muted);
}
[data-theme="light"] .bots-view__search {
  color: var(--app-text-soft);
}
[data-theme="light"] .bots-view__text-unattributed {
  color: var(--app-text-soft);
}
[data-theme="light"] .bots-view__text-no-description {
  color: var(--app-text-soft);
}
[data-theme="light"] .bots-view__text-9 {
  color: var(--app-text-soft);
}
[data-theme="light"] .bots-view__text-10 {
  color: var(--app-text-soft);
}
[data-theme="light"] .bots-view__button--muted:hover {
  color: var(--app-text) !important;
}
}
}
</style>
