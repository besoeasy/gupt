<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Bot, ExternalLink, RefreshCw, Search, Users } from "@/icons";
import PageHeader from "@/components/PageHeader.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { useOpenConversation } from "@/composables/useOpenConversation";
import { BOT_ESTABLISHED_DAYS, fetchBots, formatBotUsers, shortBotPubkey } from "@/lib/bots";
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
  <div class="bots-view">
    <main class="bots-view__main">
      <PageHeader eyebrow="Relay directory" title="Bots" :count="enriched.length">
        <p class="bots-view__lede">
          Signed heartbeats from bots that announced on your relays in the last 60 minutes.
          Long-running bots are pinned first.
        </p>
        <template #actions>
          <button
            type="button"
            :disabled="isRefreshing"
            class="bots-action"
            @click="load({ refresh: true })"
          >
            <RefreshCw class="bots-action__icon" :class="{ 'bots-action__icon--spin': isRefreshing }" />
            <span>Sync</span>
          </button>
        </template>
      </PageHeader>

      <div v-if="error" class="bots-note" role="alert">
        <span>{{ error }}</span>
        <button type="button" class="bots-note__retry" @click="load({ refresh: true })">
          Retry
        </button>
      </div>

      <div class="bots-filters">
        <div class="bots-search">
          <Search class="bots-search__icon" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search bots, owners, sites…"
            class="bots-search__field"
          />
        </div>

        <div class="bots-filters__chips">
          <button
            v-for="option in [
              { id: 'all', label: 'All', count: counts.all },
              { id: 'established', label: 'Established', count: counts.established },
              { id: 'new', label: 'New', count: counts.new },
            ]"
            :key="option.id"
            type="button"
            class="bots-chip"
            :class="{ 'is-active': filter === option.id }"
            @click="filter = option.id"
          >
            {{ option.label }}
            <span class="bots-chip__count">{{ option.count }}</span>
          </button>
        </div>
      </div>

      <div v-if="isLoading" class="bots-loading" role="status">
        <span class="bots-loading__label">Loading bots…</span>
        <div v-for="n in 6" :key="n" class="bots-skeleton" aria-hidden="true">
          <div class="skeleton-shimmer bots-skeleton__avatar" />
          <div class="bots-skeleton__body">
            <div class="skeleton-shimmer bots-skeleton__line" />
            <div class="skeleton-shimmer bots-skeleton__line bots-skeleton__line--short" />
          </div>
        </div>
      </div>

      <div v-else-if="!visibleBots.length" class="bots-empty">
        <Bot class="bots-empty__mark" :stroke-width="1.6" aria-hidden="true" />
        <p class="bots-empty__eyebrow">
          {{ searchQuery || filter !== "all" ? "No match" : "Quiet relays" }}
        </p>
        <h2 class="bots-empty__title">
          {{ searchQuery || filter !== "all" ? "No bots match" : "No bots live right now" }}
        </h2>
        <p class="bots-empty__lede">
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
          class="bots-action bots-empty__action"
        >
          Publish your own bot
          <ExternalLink class="bots-action__icon" aria-hidden="true" />
        </a>
        <button
          v-else
          type="button"
          class="bots-action bots-empty__action"
          @click="
            searchQuery = '';
            filter = 'all';
          "
        >
          Clear filters
        </button>
      </div>

      <div v-else class="bots-list">
        <article
          v-for="bot in visibleBots"
          :key="bot.pubkey"
          role="button"
          tabindex="0"
          :aria-label="`Open chat with ${bot.name}`"
          :aria-busy="openingPubkey === bot.pubkey"
          class="bots-row"
          :class="{ 'bots-row--opening': openingPubkey === bot.pubkey }"
          @click="openBotChat(bot)"
          @keydown.enter.prevent="openBotChat(bot)"
          @keydown.space.prevent="openBotChat(bot)"
        >
          <div class="bots-row__avatar">
            <RoboAvatar :pubkey="bot.pubkey" size="md" rounded="xl" :alt="bot.name" />
          </div>

          <div class="bots-row__body">
            <div class="bots-row__titleline">
              <h2 class="bots-row__name">{{ bot.name }}</h2>
              <span
                v-if="bot.established"
                class="bots-row__badge"
                :title="`Known to this device for ${BOT_ESTABLISHED_DAYS}+ days`"
              >
                {{ BOT_ESTABLISHED_DAYS }}d+
              </span>
            </div>
            <p v-if="bot.owner" class="bots-row__owner">by {{ bot.owner }}</p>
            <p v-else class="bots-row__owner bots-row__owner--none">unattributed</p>

            <p v-if="bot.description" class="bots-row__description">{{ bot.description }}</p>
            <p v-else class="bots-row__description bots-row__description--none">No description</p>

            <div class="bots-row__meta">
              <p
                v-if="bot.users !== null && bot.users !== undefined"
                class="bots-row__fact"
                title="Self-reported by the bot"
              >
                <Users class="bots-row__meta-icon" aria-hidden="true" />
                <span>{{ formatBotUsers(bot.users) }} {{ bot.users === 1 ? "user" : "users" }}</span>
              </p>
              <a
                v-if="bot.website"
                :href="bot.website"
                target="_blank"
                rel="noopener noreferrer nofollow"
                class="bots-row__site"
                @click.stop
              >
                <ExternalLink class="bots-row__meta-icon" aria-hidden="true" />
                <span>{{ bot.websiteHost }}</span>
              </a>
              <p class="bots-row__key" :title="`ed25519:${bot.pubkey}`">
                {{ shortBotPubkey(bot.pubkey) }}
              </p>
            </div>
          </div>

          <div class="bots-row__stamp">
            <p>{{ timeAgo(bot.createdAt) }}</p>
            <p v-if="bot.knownDays !== null" class="bots-row__known">{{ knownLabel(bot) }}</p>
          </div>
        </article>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Ledger pass: the bot directory is a ruled register of live beacons. */

.bots-view {
  min-height: 100vh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.bots-view__main {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  width: 100%;
  max-width: 72rem;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.bots-view__lede {
  max-width: 60ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.bots-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 32px;
  padding-inline: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  text-decoration: none;
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.bots-action__icon {
  width: 12px;
  height: 12px;
}

.bots-action__icon--spin {
  animation: spin 1s linear infinite;
}

.bots-action:disabled {
  opacity: 0.5;
  cursor: default;
}

.bots-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
  padding: 10px 14px;
  border: 1px solid color-mix(in oklab, var(--app-danger) 30%, var(--app-border));
  border-radius: var(--app-radius-md);
  background: var(--app-danger-soft);
  font-size: 12px;
  color: var(--app-text);
}

.bots-note__retry {
  min-height: 26px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-danger);
  cursor: pointer;
}

.bots-filters {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.bots-search {
  position: relative;
}

.bots-search__icon {
  position: absolute;
  top: 50%;
  left: 14px;
  width: 14px;
  height: 14px;
  transform: translateY(-50%);
  color: var(--app-muted-2);
  pointer-events: none;
}

.bots-search__field {
  width: 100%;
  height: 40px;
  padding: 0 14px 0 38px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: transparent;
  font-size: var(--app-text-body);
  color: var(--app-text);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.bots-search__field::placeholder {
  color: var(--app-muted-2);
}

.bots-search__field:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.bots-filters__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bots-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 26px;
  padding: 5px 8px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.bots-chip__count {
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.bots-chip.is-active {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.bots-chip.is-active .bots-chip__count {
  color: color-mix(in oklab, var(--app-bg) 65%, transparent);
}

.bots-loading {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
}

.bots-loading__label {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.bots-skeleton {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  padding: 14px;
}

.bots-skeleton + .bots-skeleton {
  border-top: 1px solid var(--app-border);
}

.bots-skeleton__avatar {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: var(--app-radius-sm);
}

.bots-skeleton__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 7px;
}

.bots-skeleton__line {
  height: 10px;
  border-radius: 3px;
}

.bots-skeleton__line--short {
  width: 40%;
}

.bots-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-3);
  padding: var(--app-space-8) var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  text-align: center;
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}

.bots-empty__mark {
  width: 20px;
  height: 20px;
  color: var(--app-muted-2);
}

.bots-empty__eyebrow {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.bots-empty__title {
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

.bots-empty__lede {
  max-width: 44ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.bots-empty__action {
  margin-top: var(--app-space-2);
}

.bots-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-fade 320ms var(--app-ease-standard) both;
}

.bots-row {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  padding: 14px;
  cursor: pointer;
  outline: none;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    opacity var(--app-dur-fast) var(--app-ease-standard);
}

.bots-row + .bots-row {
  border-top: 1px solid var(--app-border);
}

.bots-row:focus-visible {
  box-shadow: inset 0 0 0 2px var(--app-primary);
}

.bots-row--opening {
  opacity: 0.55;
}

.bots-row__avatar {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: var(--app-radius-sm);
  overflow: hidden;
}

.bots-row__body {
  flex: 1;
  min-width: 0;
}

.bots-row__titleline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.bots-row__name {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.005em;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.bots-row__badge {
  padding: 1px 5px;
  border: 1px solid color-mix(in oklab, var(--app-success) 30%, var(--app-border));
  border-radius: 3px;
  background: var(--app-success-soft);
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.04em;
  color: var(--app-success);
}

.bots-row__owner {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
}

.bots-row__owner--none {
  color: var(--app-border-strong);
}

.bots-row__description {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--app-muted);
  overflow-wrap: anywhere;
}

.bots-row__description--none {
  color: var(--app-muted-2);
}

.bots-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin-top: 8px;
}

.bots-row__fact,
.bots-row__site,
.bots-row__key {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
  text-decoration: none;
  font-variant-numeric: tabular-nums;
}

.bots-row__site {
  color: var(--app-muted);
}

.bots-row__key {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bots-row__meta-icon {
  width: 11px;
  height: 11px;
}

.bots-row__stamp {
  flex-shrink: 0;
  padding-top: 1px;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.02em;
  text-align: right;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.bots-row__stamp p {
  margin: 0;
}

.bots-row__known {
  margin-top: 3px !important;
  color: var(--app-border-strong);
}

@media (min-width: 40rem) {
  .bots-view__main {
    padding-inline: var(--app-space-6);
  }
}

@media (max-width: 30rem) {
  .bots-row__stamp {
    display: none;
  }
}

@media (hover: hover) {
  .bots-action:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .bots-row:hover {
    background: var(--app-surface-soft);
  }

  .bots-row__site:hover {
    color: var(--app-primary);
  }

  .bots-chip:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .bots-note__retry:hover {
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .bots-action,
  .bots-chip,
  .bots-note__retry {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bots-view,
  .bots-empty,
  .bots-list {
    animation: none;
  }

  .bots-action,
  .bots-chip,
  .bots-row,
  .bots-search__field {
    transition: none;
  }
}
</style>
