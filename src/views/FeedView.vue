<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter, RouterLink } from "vue-router";
import { RefreshCw, Search, Plus } from "@lucide/vue";
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
  <div class="min-h-screen bg-black text-zinc-100 pb-16">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-5">
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-5"
      >
        <div>
          <h1 class="text-xl font-semibold tracking-tight text-white">
            Feed
            <span
              v-if="visiblePosts.length"
              class="ml-1 font-mono text-[11px] font-medium tabular-nums text-zinc-500"
            >
              ({{ visiblePosts.length }})
            </span>
          </h1>
          <p class="mt-1 text-sm leading-6 text-zinc-400">
            Public posts with auto-expiry. Media stays encrypted, keys ride in the event.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            :disabled="isRefreshing"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-50 cursor-pointer"
            @click="refreshFeed"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': isRefreshing }" />
            <span>Sync</span>
          </button>
          <RouterLink
            to="/feed/new"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-95"
          >
            <Plus class="h-3.5 w-3.5" :stroke-width="2.2" />
            <span>New Post</span>
          </RouterLink>
        </div>
      </div>

      <AppAlertBanner v-if="error" :message="error" />

      <div
        class="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          class="whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all cursor-pointer select-none"
          :class="
            tab === 'global'
              ? 'bg-zinc-800 text-white shadow-xs'
              : 'text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200'
          "
          @click="switchTab('global')"
        >
          Global
          <span class="ml-1 font-mono text-[10px] tabular-nums text-zinc-500"
            >({{ posts.length }})</span
          >
        </button>
        <button
          type="button"
          class="whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all cursor-pointer select-none"
          :class="
            tab === 'trusted'
              ? 'bg-zinc-800 text-white shadow-xs'
              : 'text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200'
          "
          @click="switchTab('trusted')"
        >
          Trusted
        </button>
        <button
          type="button"
          class="whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all cursor-pointer select-none"
          :class="
            tab === 'mine'
              ? 'bg-zinc-800 text-white shadow-xs'
              : 'text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200'
          "
          @click="switchTab('mine')"
        >
          Mine
        </button>
      </div>

      <div class="relative">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search posts…"
          class="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-950/60 pl-9 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
      </div>

      <div v-if="isLoading" class="space-y-3">
        <div
          v-for="n in 3"
          :key="n"
          class="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4 space-y-2"
        >
          <div class="h-4 w-48 rounded-md bg-zinc-800 animate-pulse" />
          <div class="h-3 w-full rounded-md bg-zinc-800/60 animate-pulse" />
        </div>
      </div>

      <div
        v-else-if="!visiblePosts.length"
        class="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-6 py-14 text-center"
      >
        <h2 class="text-sm font-semibold text-zinc-200">
          {{
            tab === "trusted"
              ? "No trusted posts yet"
              : tab === "mine"
                ? "No posts yet"
                : "No posts yet"
          }}
        </h2>
        <p class="mt-1 text-sm text-zinc-500">
          {{
            tab === "trusted"
              ? "Posts from contacts you have messaged will appear here."
              : "Publish the first post to your relays."
          }}
        </p>
        <RouterLink
          v-if="tab !== 'trusted'"
          to="/feed/new"
          class="mt-6 inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-4 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-95"
        >
          <Plus class="h-3.5 w-3.5" :stroke-width="2.2" />
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
