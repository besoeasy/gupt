<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter, RouterLink } from "vue-router";
import { Newspaper, RefreshCw, Search, Users, Globe, Plus, UserRound } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import FeedPostCard from "@/components/FeedPostCard.vue";
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
const error = ref("");
const posts = ref([]);
const trustedPosts = ref([]);
const searchQuery = ref("");
const pendingDelete = ref(null);
const summaries = ref({});

const myPubkey = computed(() => identity.pubkeyHex || "");

const visiblePosts = computed(() => {
  let list = tab.value === "trusted" ? trustedPosts.value : posts.value;
  if (tab.value === "mine") list = posts.value.filter((p) => p.pubkey === myPubkey.value);
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (p) => (p.text || "").toLowerCase().includes(q) || (p.pubkey || "").toLowerCase().includes(q),
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
    posts.value = cached.items;
    if (cached.commentsByParent || cached.reactionsByParent) {
      const next = {};
      for (const p of posts.value) {
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
  try {
    posts.value = await fetchGlobalFeed();
    if (identity.pubkeyHex) {
      trustedPosts.value = await fetchTrustedFeed(identity.pubkeyHex).catch(() => []);
    }
    void refreshInteractions();
  } catch (err) {
    error.value = err?.message || "Failed to load feed.";
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
}

async function switchTab(next) {
  tab.value = next;
  if (next === "trusted" && !trustedPosts.value.length && identity.pubkeyHex) {
    isRefreshing.value = true;
    try {
      trustedPosts.value = await fetchTrustedFeed(identity.pubkeyHex);
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
  <div class="min-h-screen bg-(--app-bg) text-(--app-text) pb-16">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-(--app-border) pb-6"
      >
        <div>
          <div class="flex items-center gap-2.5">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-2xl bg-(--app-primary)/10 text-(--app-primary)"
            >
              <Newspaper class="h-4.5 w-4.5" />
            </div>
            <h1 class="text-2xl font-bold tracking-tight">Feed</h1>
            <span
              v-if="visiblePosts.length"
              class="rounded-full bg-(--app-surface-soft) px-2.5 py-0.5 text-xs font-bold tabular-nums text-(--app-muted)"
            >
              {{ visiblePosts.length }}
            </span>
          </div>
          <p class="mt-1 text-sm text-(--app-muted)">
            Public posts with auto-expiry. Media stays encrypted, keys ride in the event.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            :disabled="isRefreshing"
            class="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-(--app-border) bg-(--app-surface) px-3.5 text-xs font-semibold shadow-sm hover:bg-(--app-surface-hover) disabled:opacity-50 cursor-pointer"
            @click="refreshFeed"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': isRefreshing }" />
            <span>Sync</span>
          </button>
          <RouterLink
            to="/feed/new"
            class="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-(--app-primary) px-4 text-xs font-bold text-white shadow-sm hover:bg-(--app-primary-strong) active:scale-95"
          >
            <Plus class="h-4 w-4" />
            <span>New Post</span>
          </RouterLink>
        </div>
      </div>

      <AppAlertBanner v-if="error" :message="error" />

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold cursor-pointer"
          :class="
            tab === 'global'
              ? 'bg-(--app-primary) text-white'
              : 'border border-(--app-border) bg-(--app-surface) text-(--app-muted)'
          "
          @click="switchTab('global')"
        >
          <Globe class="h-3.5 w-3.5" />
          <span>Global</span>
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold cursor-pointer"
          :class="
            tab === 'trusted'
              ? 'bg-(--app-primary) text-white'
              : 'border border-(--app-border) bg-(--app-surface) text-(--app-muted)'
          "
          @click="switchTab('trusted')"
        >
          <Users class="h-3.5 w-3.5" />
          <span>Trusted</span>
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold cursor-pointer"
          :class="
            tab === 'mine'
              ? 'bg-(--app-primary) text-white'
              : 'border border-(--app-border) bg-(--app-surface) text-(--app-muted)'
          "
          @click="switchTab('mine')"
        >
          <UserRound class="h-3.5 w-3.5" />
          <span>Mine</span>
        </button>
      </div>

      <div class="relative">
        <Search
          class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-(--app-muted)"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search posts…"
          class="h-11 w-full rounded-2xl border border-(--app-border) bg-(--app-surface) pl-10 pr-4 text-sm focus:border-(--app-primary) focus:outline-none"
        />
      </div>

      <div v-if="isLoading" class="space-y-3">
        <div
          v-for="n in 3"
          :key="n"
          class="rounded-2xl border border-(--app-border) bg-(--app-surface) p-5 space-y-2"
        >
          <div class="h-4 w-48 rounded-md bg-(--app-surface-soft) animate-pulse" />
          <div class="h-3 w-full rounded-md bg-(--app-surface-soft)/60 animate-pulse" />
        </div>
      </div>

      <div
        v-else-if="!visiblePosts.length"
        class="rounded-3xl border border-(--app-border) bg-(--app-surface) px-6 py-14 text-center"
      >
        <h2 class="text-base font-bold">
          {{
            tab === "trusted"
              ? "No trusted posts yet"
              : tab === "mine"
                ? "No posts yet"
                : "No posts yet"
          }}
        </h2>
        <p class="mt-1 text-sm text-(--app-muted)">
          {{
            tab === "trusted"
              ? "Posts from contacts you have messaged will appear here."
              : "Publish the first post to your relays."
          }}
        </p>
        <RouterLink
          v-if="tab !== 'trusted'"
          to="/feed/new"
          class="mt-6 inline-flex items-center gap-2 rounded-2xl bg-(--app-primary) px-5 py-2.5 text-sm font-bold text-white"
        >
          <Plus class="h-4 w-4" />
          <span>Create post</span>
        </RouterLink>
      </div>

      <div v-else class="mx-auto max-w-2xl space-y-5">
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
