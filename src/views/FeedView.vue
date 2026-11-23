<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter, RouterLink } from "vue-router";
import { RefreshCw, Search, Plus } from "@/icons";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import FeedPostCard from "@/components/FeedPostCard.vue";
import FeedPaginationSentinel from "@/components/FeedPaginationSentinel.vue";
import { useIdentityStore } from "@/stores/identity";
import {
  getFeedCached,
  fetchGlobalFeed,
  fetchTrustedFeed,
  deleteFeedPost,
  fetchFeedInteractionSummaries,
  publishFeedReaction,
  deleteFeedReaction,
  summarizeFeedReactions,
} from "@/lib/feed";

const router = useRouter();
const identity = useIdentityStore();

const tab = ref("global");
const isLoading = ref(true);
const isRefreshing = ref(false);
const isLoadingMore = ref(false);
const hasMore = ref(true);
const error = ref("");
const posts = ref([]);
const trustedPosts = ref([]);
const searchQuery = ref("");
const pendingDelete = ref(null);
const summaries = ref({});

const myPubkey = computed(() => identity.pubkeyHex || "");

const visiblePosts = computed(() => {
  let list = tab.value === "trusted" ? (trustedPosts.value || []) : (posts.value || []);
  if (tab.value === "mine") list = (posts.value || []).filter((p) => p && p.pubkey === myPubkey.value);
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return list || [];
  return (list || []).filter(
    (p) =>
      p &&
      ((p.text || "").toLowerCase().includes(q) || (p.pubkey || "").toLowerCase().includes(q)),
  );
});

function isMine(post) {
  return Boolean(myPubkey.value && post.pubkey === myPubkey.value);
}

function summaryFor(post) {
  return summaries.value[post?.id]?.summary || { counts: {}, total: 0, myReaction: "", mine: null };
}

function commentCountFor(post) {
  return summaries.value[post?.id]?.commentCount || 0;
}

async function refreshInteractions() {
  const mine = myPubkey.value || identity.pubkeyHex || "";
  const combined = [...posts.value.slice(0, 30), ...trustedPosts.value.slice(0, 30)];
  const seen = new Map();
  for (const p of combined) {
    if (p?.id && !seen.has(p.id)) seen.set(p.id, p);
  }
  if (!seen.size) return;
  try {
    const result = await fetchFeedInteractionSummaries([...seen.values()], {
      myPubkeyHex: mine,
    });
    summaries.value = { ...summaries.value, ...result };
  } catch {}
}

async function handleReact({ post, emoji }) {
  if (!identity.privkeyHex || !identity.pubkeyHex) {
    error.value = "Unlock your identity to react.";
    return;
  }
  const self = identity.pubkeyHex;
  const entry = summaries.value[post.id] || { commentCount: 0, reactions: [] };
  const mine = entry.summary?.mine || entry.reactions.find((r) => r.pubkey === self) || null;
  if (mine && mine.emoji === emoji) {
    const prev = [...entry.reactions];
    summaries.value = {
      ...summaries.value,
      [post.id]: {
        ...entry,
        reactions: prev.filter((r) => r.id !== mine.id),
        summary: summarizeFeedReactions(
          prev.filter((r) => r.id !== mine.id),
          self,
        ),
      },
    };
    try {
      await deleteFeedReaction(identity.privkeyHex, identity.pubkeyHex, mine);
    } catch (err) {
      error.value = err?.message || "Failed to remove reaction.";
      void refreshInteractions();
    }
    return;
  }
  try {
    if (mine && mine.emoji !== emoji) {
      await deleteFeedReaction(identity.privkeyHex, identity.pubkeyHex, mine).catch(() => {});
    }
    const optimistic = {
      ...(await publishFeedReaction(identity.privkeyHex, identity.pubkeyHex, post, emoji)),
      feedType: "reaction",
      parentId: post.id,
      pubkey: self,
    };
    const next = [...entry.reactions.filter((r) => r.pubkey !== self), optimistic];
    summaries.value = {
      ...summaries.value,
      [post.id]: { ...entry, reactions: next, summary: summarizeFeedReactions(next, self) },
    };
    void refreshInteractions();
  } catch (err) {
    error.value = err?.message || "Failed to react.";
  }
}

function openPost(post) {
  router.push(`/feed/${post.eventId}`);
}

function askDelete(post) {
  pendingDelete.value = post;
}

async function confirmDelete() {
  const post = pendingDelete.value;
  if (!post) return;
  pendingDelete.value = null;
  try {
    await deleteFeedPost(identity.privkeyHex, identity.pubkeyHex, post);
    posts.value = posts.value.filter((p) => p.id !== post.id && p.eventId !== post.eventId);
    trustedPosts.value = trustedPosts.value.filter(
      (p) => p.id !== post.id && p.eventId !== post.eventId,
    );
  } catch (err) {
    error.value = err?.message || "Failed to delete post.";
  }
}

onMounted(loadFeed);

async function loadFeed() {
  const cached = await getFeedCached().catch(() => null);
  if (cached?.items?.length) {
    posts.value = Array.isArray(cached.items) ? cached.items : [];
    if (cached.commentsByParent || cached.reactionsByParent) {
      const next = {};
      for (const p of posts.value) {
        if (!p?.id) continue;
        const reactions = cached.reactionsByParent?.[p.id] || [];
        next[p.id] = {
          commentCount: (cached.commentsByParent?.[p.id] || []).length,
          reactions,
          summary: summarizeFeedReactions(reactions, myPubkey.value),
        };
      }
      summaries.value = next;
    }
    isLoading.value = false;
    if (!cached.fresh) {
      await refreshFeed();
      return;
    }
    void refreshInteractions();
    return;
  }
  await refreshFeed();
}

async function refreshFeed() {
  isRefreshing.value = true;
  error.value = "";
  hasMore.value = true;
  try {
    const fetched = await fetchGlobalFeed();
    posts.value = Array.isArray(fetched) ? fetched : [];
    if (identity.pubkeyHex) {
      const trusted = await fetchTrustedFeed(identity.pubkeyHex).catch(() => []);
      trustedPosts.value = Array.isArray(trusted) ? trusted : [];
    }
    void refreshInteractions();
  } catch (err) {
    error.value = err?.message || "Failed to load feed.";
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
}

async function loadOlderPosts() {
  if (isLoadingMore.value || isRefreshing.value || isLoading.value || !hasMore.value) return;

  const currentList = tab.value === "trusted" ? trustedPosts.value : posts.value;
  if (!currentList?.length) return;

  const oldest = currentList[currentList.length - 1];
  const oldestSec = Math.floor((Number(oldest.createdAt) || Date.now()) / 1000);
  const until = oldestSec > 0 ? oldestSec - 1 : null;
  if (!until) {
    hasMore.value = false;
    return;
  }

  isLoadingMore.value = true;
  try {
    let older = [];
    if (tab.value === "trusted" && identity.pubkeyHex) {
      older = await fetchTrustedFeed(identity.pubkeyHex, { limit: 30, until });
    } else {
      older = await fetchGlobalFeed({ limit: 30, until });
    }

    if (!older || !older.length) {
      hasMore.value = false;
      return;
    }

    if (tab.value === "trusted") {
      const existingIds = new Set(trustedPosts.value.map((p) => p.id || p.eventId));
      const fresh = older.filter((p) => p && !existingIds.has(p.id) && !existingIds.has(p.eventId));
      if (!fresh.length) {
        hasMore.value = false;
      } else {
        trustedPosts.value = [...trustedPosts.value, ...fresh];
      }
    } else {
      const existingIds = new Set(posts.value.map((p) => p.id || p.eventId));
      const fresh = older.filter((p) => p && !existingIds.has(p.id) && !existingIds.has(p.eventId));
      if (!fresh.length) {
        hasMore.value = false;
      } else {
        posts.value = [...posts.value, ...fresh];
      }
    }

    void refreshInteractions();
  } catch (err) {
    console.warn("Failed to load older feed posts:", err);
  } finally {
    isLoadingMore.value = false;
  }
}

async function switchTab(next) {
  tab.value = next;
  hasMore.value = true;
  if (next === "trusted" && !trustedPosts.value?.length && identity.pubkeyHex) {
    isRefreshing.value = true;
    try {
      const trusted = await fetchTrustedFeed(identity.pubkeyHex);
      trustedPosts.value = Array.isArray(trusted) ? trusted : [];
      void refreshInteractions();
    } catch (err) {
      error.value = err?.message || "Failed to load trusted feed.";
    } finally {
      isRefreshing.value = false;
    }
  }
}
</script>

<template>
  <div class="feed-view__block">
    <main class="feed-view__main">
      <header class="feed-head">
        <div class="feed-head__identity">
          <p class="feed-head__eyebrow">Public feed</p>
          <h1 class="feed-head__title">
            Feed
            <span
              v-if="visiblePosts?.length"
              class="feed-head__count"
            >
              {{ visiblePosts?.length || 0 }}
            </span>
          </h1>
          <p class="feed-head__lede">
            Public posts with auto-expiry. Media stays encrypted, keys ride in the event.
          </p>
        </div>
        <div class="feed-head__actions">
          <button
            type="button"
            :disabled="isRefreshing"
            class="feed-action"
            @click="refreshFeed"
          >
            <RefreshCw class="feed-action__icon" :class="{ 'feed-action__icon--spin': isRefreshing }" />
            <span>Sync</span>
          </button>
          <RouterLink
            to="/feed/new"
            class="feed-action feed-action--ink"
          >
            <Plus class="feed-action__icon" :stroke-width="2.2" />
            <span>New post</span>
          </RouterLink>
        </div>
      </header>

      <AppAlertBanner v-if="error" :message="error" />

      <nav class="feed-tabs" aria-label="Feed scope">
        <button
          type="button"
          class="feed-tabs__tab"
          :class="{ 'is-active': tab === 'global' }"
          :aria-current="tab === 'global' ? 'page' : undefined"
          @click="switchTab('global')"
        >
          Global
          <span class="feed-tabs__count">{{ posts?.length || 0 }}</span>
        </button>
        <button
          type="button"
          class="feed-tabs__tab"
          :class="{ 'is-active': tab === 'trusted' }"
          :aria-current="tab === 'trusted' ? 'page' : undefined"
          @click="switchTab('trusted')"
        >
          Trusted
        </button>
        <button
          type="button"
          class="feed-tabs__tab"
          :class="{ 'is-active': tab === 'mine' }"
          :aria-current="tab === 'mine' ? 'page' : undefined"
          @click="switchTab('mine')"
        >
          Mine
        </button>
      </nav>

      <label class="feed-search">
        <Search class="feed-search__icon" aria-hidden="true" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search posts…"
          class="feed-search__field"
        />
      </label>

      <div v-if="isLoading" class="feed-view__status" role="status">
        <span class="feed-loading__label">Loading posts…</span>
        <div
          v-for="n in 3"
          :key="n"
          class="feed-view__block-6"
          aria-hidden="true"
        >
          <div class="skeleton-shimmer feed-view__block-7" />
          <div class="skeleton-shimmer feed-view__block-8" />
          <div class="skeleton-shimmer feed-view__block-9" />
        </div>
      </div>

      <div
        v-else-if="!visiblePosts?.length"
        class="feed-empty"
      >
        <p class="feed-empty__eyebrow">
          {{ tab === "trusted" ? "Trusted circle" : tab === "mine" ? "Your archive" : "Empty ledger" }}
        </p>
        <h2 class="feed-empty__title">
          {{
            tab === "trusted"
              ? "No trusted posts yet"
              : tab === "mine"
                ? "No posts yet"
                : "No posts yet"
          }}
        </h2>
        <p class="feed-empty__lede">
          {{
            tab === "trusted"
              ? "Posts from contacts you have messaged will appear here."
              : "Publish the first post to your relays."
          }}
        </p>
        <RouterLink
          v-if="tab !== 'trusted'"
          to="/feed/new"
          class="feed-action feed-action--ink feed-empty__action"
        >
          <Plus class="feed-action__icon" :stroke-width="2.2" />
          <span>Create post</span>
        </RouterLink>
      </div>

      <div v-else class="feed-view__block-11">
        <FeedPostCard
          v-for="post in visiblePosts"
          :key="post.eventId"
          :post="post"
          :mine="isMine(post)"
          :comment-count="commentCountFor(post)"
          :reaction-counts="summaryFor(post).counts"
          :my-reaction="summaryFor(post).myReaction"
          @open="openPost"
          @delete="askDelete"
          @react="handleReact"
        />

        <!-- Infinite Scroll Sentinel & Pagination Controls -->
        <FeedPaginationSentinel
          v-if="visiblePosts?.length"
          :has-more="hasMore"
          :is-loading="isLoadingMore"
          @load-more="loadOlderPosts"
        />
      </div>
    </main>

    <AppConfirmDialog
      :open="Boolean(pendingDelete)"
      title="Delete Post?"
      message="This publishes a deletion tombstone. Relays drop the original once they see it."
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.feed-view__button:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.feed-view__router-link:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.feed-view__router-link-2:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.feed-view__button:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.feed-view__button-global--muted:hover {
  background-color: var(--app-surface-tint-soft);
}
}

@media (hover:hover) {
.feed-view__button-trusted--muted:hover {
  background-color: var(--app-surface-tint-soft);
}
}

@media (hover:hover) {
.feed-view__button-mine--muted:hover {
  background-color: var(--app-surface-tint-soft);
}
}

@media (hover:hover) {
.feed-view__button:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.feed-view__button-global--muted:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.feed-view__button-trusted--muted:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.feed-view__button-mine--muted:hover {
  color: var(--ui-zinc-200);
}
}

@media (min-width:40rem) {
.feed-view__block-2 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.feed-view__block-2 {
  align-items: center;
}
}

@media (min-width:40rem) {
.feed-view__block-2 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.feed-view__main {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.feed-view__main {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.feed-view__search {
  pointer-events: none;
}
.feed-view__text-4 {
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
.feed-view__search {
  position: absolute;
}
.feed-view__block-5 {
  position: relative;
}
.feed-view__search {
  top: 50%;
}
.feed-view__search {
  left: calc(var(--spacing) * 3);
}
.feed-view__main {
  margin-inline: auto;
}
.feed-view__text-2 {
  margin-top: var(--spacing);
}
.feed-view__text-5 {
  margin-top: var(--spacing);
}
.feed-view__router-link-2 {
  margin-top: calc(var(--spacing) * 6);
}
.feed-view__text {
  margin-left: var(--spacing);
}
.feed-view__text-3 {
  margin-left: var(--spacing);
}
.feed-view__block-2 {
  display: flex;
}
.feed-view__block-3 {
  display: flex;
}
.feed-view__button {
  display: inline-flex;
}
.feed-view__router-link {
  display: inline-flex;
}
.feed-view__block-4 {
  display: inline-flex;
}
.feed-view__router-link-2 {
  display: inline-flex;
}
.feed-view__block-8 {
  height: calc(var(--spacing) * 3);
}
.feed-view__block-9 {
  height: calc(var(--spacing) * 3);
}
.feed-view__refresh-cw {
  height: calc(var(--spacing) * 3.5);
}
.feed-view__plus {
  height: calc(var(--spacing) * 3.5);
}
.feed-view__plus-2 {
  height: calc(var(--spacing) * 3.5);
}
.feed-view__search {
  height: calc(var(--spacing) * 4);
}
.feed-view__block-7 {
  height: calc(var(--spacing) * 4);
}
.feed-view__button {
  height: calc(var(--spacing) * 8);
}
.feed-view__router-link {
  height: calc(var(--spacing) * 8);
}
.feed-view__router-link-2 {
  height: calc(var(--spacing) * 9);
}
.feed-view__field-text {
  height: calc(var(--spacing) * 10);
}
.feed-view__block {
  min-height: 100vh;
}
.feed-view__refresh-cw {
  width: calc(var(--spacing) * 3.5);
}
.feed-view__plus {
  width: calc(var(--spacing) * 3.5);
}
.feed-view__plus-2 {
  width: calc(var(--spacing) * 3.5);
}
.feed-view__search {
  width: calc(var(--spacing) * 4);
}
.feed-view__block-9 {
  width: 80%;
}
.feed-view__block-7 {
  width: calc(var(--spacing) * 48);
}
.feed-view__main {
  width: 100%;
}
.feed-view__field-text {
  width: 100%;
}
.feed-view__block-8 {
  width: 100%;
}
.feed-view__main {
  max-width: var(--container-6xl);
}
.feed-view__block-4 {
  max-width: 100%;
}
.feed-view__search {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.feed-view__refresh-cw--spin {
  animation: var(--animate-spin);
}
.feed-view__button {
  cursor: pointer;
}
.feed-view__button-global {
  cursor: pointer;
}
.feed-view__button-trusted {
  cursor: pointer;
}
.feed-view__button-mine {
  cursor: pointer;
}
.feed-view__block-4 {
  scrollbar-width: none;
}
.feed-view__block-2 {
  flex-direction: column;
}
.feed-view__block-3 {
  flex-wrap: wrap;
}
.feed-view__block-3 {
  align-items: center;
}
.feed-view__button {
  align-items: center;
}
.feed-view__router-link {
  align-items: center;
}
.feed-view__router-link-2 {
  align-items: center;
}
.feed-view__block-4 {
  gap: calc(var(--spacing) * .5);
}
.feed-view__button {
  gap: calc(var(--spacing) * 1.5);
}
.feed-view__router-link {
  gap: calc(var(--spacing) * 1.5);
}
.feed-view__router-link-2 {
  gap: calc(var(--spacing) * 1.5);
}
.feed-view__block-3 {
  gap: calc(var(--spacing) * 2);
}
.feed-view__block-2 {
  gap: calc(var(--spacing) * 4);
}
:where(.feed-view__block-6>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.feed-view__status>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.feed-view__main>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.feed-view__block-11>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
.feed-view__block-4 {
  overflow-x: auto;
}
.feed-view__button {
  border-radius: var(--radius-lg);
}
.feed-view__router-link {
  border-radius: var(--radius-lg);
}
.feed-view__block-4 {
  border-radius: var(--radius-lg);
}
.feed-view__router-link-2 {
  border-radius: var(--radius-lg);
}
.feed-view__button-global {
  border-radius: var(--radius-md);
}
.feed-view__button-trusted {
  border-radius: var(--radius-md);
}
.feed-view__button-mine {
  border-radius: var(--radius-md);
}
.feed-view__field-text {
  border-radius: var(--radius-xl);
}
.feed-view__block-6 {
  border-radius: var(--radius-xl);
}
.feed-view__block-10 {
  border-radius: var(--radius-xl);
}
.feed-view__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-view__block-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-view__field-text {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-view__block-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-view__block-10 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-view__block-2 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.feed-view__button {
  border-color: var(--ui-zinc-800);
}
.feed-view__field-text {
  border-color: var(--ui-zinc-800);
}
.feed-view__block-2 {
  border-color: var(--app-border-quiet);
}
.feed-view__block-4 {
  border-color: var(--app-border-quiet);
}
.feed-view__block-6 {
  border-color: var(--app-border-quiet);
}
.feed-view__block-10 {
  border-color: var(--app-border-quiet);
}
.feed-view__block {
  background-color: var(--ui-black);
}
.feed-view__router-link {
  background-color: var(--color-white);
}
.feed-view__router-link-2 {
  background-color: var(--color-white);
}
.feed-view__button-global--selected {
  background-color: var(--ui-zinc-800);
}
.feed-view__button-trusted--selected {
  background-color: var(--ui-zinc-800);
}
.feed-view__button-mine--selected {
  background-color: var(--ui-zinc-800);
}
.feed-view__button {
  background-color: var(--app-surface-tint);
}
.feed-view__block-6 {
  background-color: var(--app-surface-inset);
}
.feed-view__block-10 {
  background-color: var(--app-surface-inset);
}
.feed-view__block-4 {
  background-color: var(--app-surface-inset-strong);
}
.feed-view__field-text {
  background-color: var(--app-surface-inset-strong);
}
.feed-view__block-4 {
  padding: calc(var(--spacing) * .5);
}
.feed-view__block-6 {
  padding: calc(var(--spacing) * 4);
}
.feed-view__button {
  padding-inline: calc(var(--spacing) * 3);
}
.feed-view__router-link {
  padding-inline: calc(var(--spacing) * 3);
}
.feed-view__button-global {
  padding-inline: calc(var(--spacing) * 3);
}
.feed-view__button-trusted {
  padding-inline: calc(var(--spacing) * 3);
}
.feed-view__button-mine {
  padding-inline: calc(var(--spacing) * 3);
}
.feed-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-view__router-link-2 {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-view__block-10 {
  padding-inline: calc(var(--spacing) * 6);
}
.feed-view__button-global {
  padding-block: var(--spacing);
}
.feed-view__button-trusted {
  padding-block: var(--spacing);
}
.feed-view__button-mine {
  padding-block: var(--spacing);
}
.feed-view__main {
  padding-block: calc(var(--spacing) * 6);
}
.feed-view__block-10 {
  padding-block: calc(var(--spacing) * 14);
}
.feed-view__field-text {
  padding-right: calc(var(--spacing) * 4);
}
.feed-view__block-2 {
  padding-bottom: calc(var(--spacing) * 5);
}
.feed-view__block {
  padding-bottom: calc(var(--spacing) * 16);
}
.feed-view__field-text {
  padding-left: calc(var(--spacing) * 9);
}
.feed-view__block-10 {
  text-align: center;
}
.feed-view__text {
  font-family: var(--font-mono);
}
.feed-view__text-3 {
  font-family: var(--font-mono);
}
.feed-view__text-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.feed-view__field-text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.feed-view__subtitle {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.feed-view__text-5 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.feed-view__title-feed {
  font-size: var(--text-xl);
  line-height: var(--leading,var(--text-xl--line-height));
}
.feed-view__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-view__router-link {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-view__button-global {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-view__button-trusted {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-view__button-mine {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-view__router-link-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-view__text-3 {
  font-size: 10px;
}
.feed-view__text {
  font-size: 11px;
}
.feed-view__text-2 {
  --leading: calc(var(--spacing) * 6);
  line-height: calc(var(--spacing) * 6);
}
.feed-view__text {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-view__button {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-view__button-global {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-view__button-trusted {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-view__button-mine {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-view__title-feed {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.feed-view__router-link {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.feed-view__subtitle {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.feed-view__router-link-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.feed-view__title-feed {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.feed-view__button-global {
  white-space: nowrap;
}
.feed-view__button-trusted {
  white-space: nowrap;
}
.feed-view__button-mine {
  white-space: nowrap;
}
.feed-view__router-link {
  color: var(--ui-black);
}
.feed-view__router-link-2 {
  color: var(--ui-black);
}
.feed-view__title-feed {
  color: var(--color-white);
}
.feed-view__button-global--selected {
  color: var(--color-white);
}
.feed-view__button-trusted--selected {
  color: var(--color-white);
}
.feed-view__button-mine--selected {
  color: var(--color-white);
}
.feed-view__block {
  color: var(--ui-zinc-100);
}
.feed-view__field-text {
  color: var(--ui-zinc-100);
}
.feed-view__subtitle {
  color: var(--ui-zinc-200);
}
.feed-view__button {
  color: var(--ui-zinc-300);
}
.feed-view__text-2 {
  color: var(--ui-zinc-400);
}
.feed-view__button-global--muted {
  color: var(--ui-zinc-400);
}
.feed-view__button-trusted--muted {
  color: var(--ui-zinc-400);
}
.feed-view__button-mine--muted {
  color: var(--ui-zinc-400);
}
.feed-view__text {
  color: var(--ui-zinc-500);
}
.feed-view__text-3 {
  color: var(--ui-zinc-500);
}
.feed-view__text-5 {
  color: var(--ui-zinc-500);
}
.feed-view__search {
  color: var(--ui-zinc-600);
}
.feed-view__text {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-view__text-3 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-view__button {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.feed-view__router-link {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.feed-view__button-global--selected {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.feed-view__button-trusted--selected {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.feed-view__button-mine--selected {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.feed-view__router-link-2 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.feed-view__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-view__router-link {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-view__button-global {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-view__button-trusted {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-view__button-mine {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-view__router-link-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-view__button-global {
  -webkit-user-select: none;
  user-select: none;
}
.feed-view__button-trusted {
  -webkit-user-select: none;
  user-select: none;
}
.feed-view__button-mine {
  -webkit-user-select: none;
  user-select: none;
}
.feed-view__block-4 {
  -ms-overflow-style: none;
}
.feed-view__field-text::placeholder {
  color: var(--ui-zinc-600);
}
.feed-view__field-text:focus {
  border-color: var(--ui-zinc-600);
}
.feed-view__field-text:focus {
  --outline-style: none;
  outline-style: none;
}
.feed-view__router-link:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.feed-view__router-link-2:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.feed-view__button:disabled {
  opacity: .5;
}
.feed-view__block-4::-webkit-scrollbar {
  display: none;
}
[data-theme="light"] .feed-view__button {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-view__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-view__button-global--muted {
  color: var(--app-muted);
}
[data-theme="light"] .feed-view__button-trusted--muted {
  color: var(--app-muted);
}
[data-theme="light"] .feed-view__button-mine--muted {
  color: var(--app-muted);
}
[data-theme="light"] .feed-view__text {
  color: var(--app-muted);
}
[data-theme="light"] .feed-view__text-3 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-view__text-5 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-view__search {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-view__button-global--muted:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .feed-view__button-trusted--muted:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .feed-view__button-mine--muted:hover {
  color: var(--app-text) !important;
}
}
}

/* Ledger pass: the feed header is a title rule, the tabs an underline. */

.feed-head {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  padding-bottom: var(--app-space-6);
  border-bottom: 1px solid var(--app-border);
  animation: ledger-rise 480ms var(--app-ease-emphasized) both;
}

.feed-head__identity {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
  min-width: 0;
}

.feed-head__eyebrow {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  line-height: 1.4;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.feed-head__title {
  display: flex;
  align-items: baseline;
  gap: var(--app-space-3);
  margin: 0;
  font-size: var(--app-text-display);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: var(--app-tracking-display);
  color: var(--app-text);
}

.feed-head__count {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.feed-head__count::before {
  content: "·";
  margin-right: var(--app-space-2);
  color: var(--app-border-strong);
}

.feed-head__lede {
  max-width: 56ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.feed-head__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-2);
}

.feed-action {
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
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.feed-action:active {
  transform: translateY(1px);
}

.feed-action:disabled {
  opacity: 0.5;
  cursor: default;
}

.feed-action--ink {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.feed-action__icon {
  width: 13px;
  height: 13px;
}

.feed-action__icon--spin {
  animation: var(--animate-spin);
}

.feed-tabs {
  display: flex;
  align-items: stretch;
  gap: var(--app-space-6);
  border-bottom: 1px solid var(--app-border);
}

.feed-tabs__tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 12px 0;
  border: 0;
  background: none;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.feed-tabs__tab::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 1px;
  background: currentColor;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform var(--app-dur) var(--app-ease-emphasized);
}

.feed-tabs__tab.is-active {
  color: var(--app-text);
}

.feed-tabs__tab.is-active::after {
  transform: scaleX(1);
  animation: ledger-draw var(--app-dur-slow) var(--app-ease-emphasized) both;
}

.feed-tabs__count {
  font-size: 10px;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.feed-tabs__tab.is-active .feed-tabs__count {
  color: var(--app-muted);
}

.feed-search {
  position: relative;
  display: block;
}

.feed-search__icon {
  position: absolute;
  top: 50%;
  left: 14px;
  width: 14px;
  height: 14px;
  transform: translateY(-50%);
  color: var(--app-muted-2);
  pointer-events: none;
}

.feed-search__field {
  width: 100%;
  height: 40px;
  padding: 0 16px 0 38px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: transparent;
  font-size: var(--app-text-body);
  color: var(--app-text);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.feed-search__field::placeholder {
  color: var(--app-muted-2);
}

.feed-search__field:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.feed-empty {
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

.feed-empty__eyebrow {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.feed-empty__title {
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

.feed-empty__lede {
  max-width: 36ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.feed-empty__action {
  margin-top: var(--app-space-3);
}

.feed-loading__label {
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

@media (min-width: 40rem) {
  .feed-head {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--app-space-6);
  }

  .feed-head__actions {
    flex-shrink: 0;
    padding-bottom: 2px;
  }
}

@media (max-width: 26rem) {
  .feed-head {
    padding-bottom: var(--app-space-5);
  }

  .feed-head__title {
    font-size: 26px;
  }

  .feed-tabs {
    gap: var(--app-space-5);
  }
}

@media (hover: hover) {
  .feed-action:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .feed-action--ink:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .feed-tabs__tab:hover {
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .feed-action {
    min-height: var(--app-touch-h);
  }

  .feed-tabs__tab {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .feed-head,
  .feed-empty,
  .feed-tabs__tab.is-active::after {
    animation: none;
  }

  .feed-action,
  .feed-tabs__tab,
  .feed-tabs__tab::after,
  .feed-search__field {
    transition: none;
  }
}
</style>
