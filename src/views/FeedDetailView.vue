<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Paperclip, X, Trash2, Loader2, Check, Pencil, Music, Image, Film } from "@lucide/vue";
import PageBackHeader from "@/components/PageBackHeader.vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import FeedPostCard from "@/components/FeedPostCard.vue";
import FeedCommentItem from "@/components/FeedCommentItem.vue";
import { useIdentityStore } from "@/stores/identity";
import { useProfileStore } from "@/stores/profiles";
import {
  publishFeedPost,
  saveFeedPost,
  deleteFeedPost,
  fetchFeedPostById,
  fetchFeedThread,
  publishFeedComment,
  saveFeedComment,
  deleteFeedComment,
  publishFeedReaction,
  deleteFeedReaction,
  summarizeFeedReactions,
  validateFeedFiles,
  FEED_MAX_TEXT_CHARS,
  FEED_MAX_FILES,
  FEED_COMMENT_MAX_CHARS,
} from "@/lib/feed";
import { formatBytes } from "@/lib/share";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const profiles = useProfileStore();

const postKey = computed(() => String(route.params.id || ""));
const isNew = computed(() => route.path === "/feed/new");

const isLoading = ref(!isNew.value);
const isSaving = ref(false);
const isDeleting = ref(false);
const error = ref("");
const showDeleteConfirm = ref(false);
const uploadStatus = ref("");

const post = ref(null);
const isEditing = ref(isNew.value);
const text = ref("");
const keepMedia = ref([]);
const newFiles = ref([]);
const fileInput = ref(null);

const comments = ref([]);
const reactions = ref([]);
const threadLoading = ref(false);
const commentText = ref("");
const commentPosting = ref(false);
const busyCommentId = ref("");
const pendingCommentDelete = ref(null);

const isMine = computed(() => {
  if (isNew.value || !post.value) return true;
  return post.value.pubkey === identity.pubkeyHex;
});

const reactionSummary = computed(() => summarizeFeedReactions(reactions.value, identity.pubkeyHex));

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pickIcon(mime) {
  if (String(mime || "").startsWith("audio/")) return Music;
  if (String(mime || "").startsWith("video/")) return Film;
  return Image;
}

function onFileSelect(e) {
  const selected = Array.from(e.target.files || []);
  const combined = [...newFiles.value, ...selected];
  const total = combined.length + keepMedia.value.length;
  if (total > FEED_MAX_FILES) {
    error.value = `Attach up to ${FEED_MAX_FILES} files per post.`;
    e.target.value = "";
    return;
  }
  const validation = validateFeedFiles(combined);
  if (!validation.ok) {
    error.value = validation.error;
    e.target.value = "";
    return;
  }
  error.value = "";
  newFiles.value = combined;
  e.target.value = "";
}

function removeNewFile(index) {
  newFiles.value.splice(index, 1);
}

function removeKeptMedia(index) {
  keepMedia.value.splice(index, 1);
}

async function loadPost() {
  if (isNew.value) {
    isEditing.value = true;
    return;
  }
  isLoading.value = true;
  error.value = "";
  try {
    const found = await fetchFeedPostById(postKey.value);
    if (!found) {
      error.value = "Post not found or expired.";
      return;
    }
    post.value = found;
    text.value = found.text || "";
    keepMedia.value = [...(found.media || [])];
    void loadThread();
  } catch (err) {
    error.value = err?.message || "Failed to load post.";
  } finally {
    isLoading.value = false;
  }
}

async function loadThread() {
  if (!post.value || isNew.value) return;
  threadLoading.value = true;
  try {
    const thread = await fetchFeedThread(post.value);
    comments.value = thread.comments || [];
    reactions.value = thread.reactions || [];
    const authors = [...new Set(comments.value.map((c) => c.pubkey).filter(Boolean))];
    if (post.value.pubkey) authors.push(post.value.pubkey);
    if (authors.length) void profiles.prefetch(authors);
  } catch {
    comments.value = [];
    reactions.value = [];
  } finally {
    threadLoading.value = false;
  }
}

async function handleReact({ emoji } = {}) {
  const target = post.value;
  if (!target || !emoji) return;
  if (!identity.privkeyHex || !identity.pubkeyHex) {
    error.value = "Unlock your identity to react.";
    return;
  }
  const self = identity.pubkeyHex;
  const mine = reactionSummary.value.mine || reactions.value.find((r) => r.pubkey === self) || null;
  if (mine && mine.emoji === emoji) {
    const prev = [...reactions.value];
    reactions.value = prev.filter((r) => r.id !== mine.id);
    try {
      await deleteFeedReaction(identity.privkeyHex, identity.pubkeyHex, mine);
    } catch (err) {
      error.value = err?.message || "Failed to remove reaction.";
      reactions.value = prev;
    }
    return;
  }
  try {
    if (mine && mine.emoji !== emoji) {
      await deleteFeedReaction(identity.privkeyHex, identity.pubkeyHex, mine).catch(() => {});
      reactions.value = reactions.value.filter((r) => r.id !== mine.id);
    }
    const optimistic = {
      ...(await publishFeedReaction(identity.privkeyHex, identity.pubkeyHex, target, emoji)),
      feedType: "reaction",
      parentId: target.id,
      pubkey: self,
    };
    reactions.value = [...reactions.value.filter((r) => r.pubkey !== self), optimistic];
    void loadThread();
  } catch (err) {
    error.value = err?.message || "Failed to react.";
  }
}

async function postComment() {
  const clean = commentText.value.trim();
  if (!clean || commentPosting.value || !post.value) return;
  if (!identity.privkeyHex || !identity.pubkeyHex) {
    error.value = "Unlock your identity to comment.";
    return;
  }
  commentPosting.value = true;
  error.value = "";
  try {
    const optimistic = {
      ...(await publishFeedComment(identity.privkeyHex, identity.pubkeyHex, post.value, clean)),
      feedType: "comment",
      parentId: post.value.id,
      pubkey: identity.pubkeyHex,
    };
    comments.value = [...comments.value, optimistic].sort(
      (a, b) => (a.createdAt || 0) - (b.createdAt || 0),
    );
    commentText.value = "";
    void loadThread();
  } catch (err) {
    error.value = err?.message || "Failed to publish comment.";
  } finally {
    commentPosting.value = false;
  }
}

async function handleSaveComment({ comment, text: next }) {
  if (!comment || busyCommentId.value) return;
  busyCommentId.value = comment.id;
  try {
    const updated = {
      ...(await saveFeedComment(identity.privkeyHex, identity.pubkeyHex, comment, next)),
      feedType: "comment",
      parentId: comment.parentId,
      pubkey: comment.pubkey,
    };
    comments.value = comments.value.map((c) => (c.id === comment.id ? { ...c, ...updated } : c));
    void loadThread();
  } catch (err) {
    error.value = err?.message || "Failed to save comment.";
  } finally {
    busyCommentId.value = "";
  }
}

function askDeleteComment(comment) {
  pendingCommentDelete.value = comment;
}

async function confirmDeleteComment() {
  const comment = pendingCommentDelete.value;
  if (!comment) return;
  pendingCommentDelete.value = null;
  busyCommentId.value = comment.id;
  try {
    await deleteFeedComment(identity.privkeyHex, identity.pubkeyHex, comment);
    comments.value = comments.value.filter((c) => c.id !== comment.id);
  } catch (err) {
    error.value = err?.message || "Failed to delete comment.";
  } finally {
    busyCommentId.value = "";
  }
}

function isCommentMine(comment) {
  return Boolean(identity.pubkeyHex && comment.pubkey === identity.pubkeyHex);
}

async function handleSave() {
  if (isSaving.value) return;
  if (!text.value.trim() && !keepMedia.value.length && !newFiles.value.length) {
    error.value = "Write something or attach media first.";
    return;
  }
  isSaving.value = true;
  error.value = "";
  uploadStatus.value = "Preparing…";
  try {
    if (isNew.value) {
      await publishFeedPost(identity.privkeyHex, identity.pubkeyHex, {
        text: text.value,
        files: newFiles.value,
        onProgress(p) {
          if (p?.phase === "uploading" && typeof p.percent === "number") {
            uploadStatus.value = `Uploading… ${p.percent}%`;
          } else if (p?.message) {
            uploadStatus.value = p.message;
          }
        },
      });
    } else {
      await saveFeedPost(
        identity.privkeyHex,
        identity.pubkeyHex,
        { text: text.value, files: newFiles.value, keepMedia: keepMedia.value },
        { id: post.value.id },
      );
    }
    router.push("/feed");
  } catch (err) {
    error.value = err?.message || "Failed to publish post.";
  } finally {
    isSaving.value = false;
    uploadStatus.value = "";
  }
}

async function confirmDelete() {
  if (!post.value) return;
  isDeleting.value = true;
  try {
    await deleteFeedPost(identity.privkeyHex, identity.pubkeyHex, post.value);
    showDeleteConfirm.value = false;
    router.push("/feed");
  } catch (err) {
    error.value = err?.message || "Failed to delete post.";
  } finally {
    isDeleting.value = false;
  }
}

onMounted(loadPost);
</script>

<template>
  <main class="min-h-dvh overflow-y-auto overflow-x-hidden bg-black text-zinc-100 pb-16">
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-6">
        <PageBackHeader
          back-to="/feed"
          back-label="Feed"
          :eyebrow="isNew ? 'New Post' : 'Public Post'"
          :title="isNew ? 'Create Post' : 'Post'"
        >
          <p class="text-sm leading-6 text-zinc-400">
            {{
              isNew
                ? "Public for anyone to read. Auto-expires with retention, media stays encrypted with keys in the event."
                : "Anyone can read this post until it expires."
            }}
          </p>
        </PageBackHeader>

        <AppAlertBanner v-if="error" :message="error" />

        <div v-if="isLoading" class="flex flex-col items-center py-16">
          <Loader2 class="h-8 w-8 animate-spin text-zinc-500" />
          <p class="mt-3 text-sm text-zinc-500">Loading post…</p>
        </div>

        <template v-else>
          <div v-if="!isEditing && post" class="space-y-4">
            <FeedPostCard
              :post="post"
              :mine="isMine"
              :comment-count="comments.length"
              :reaction-counts="reactionSummary.counts"
              :my-reaction="reactionSummary.myReaction"
              @react="handleReact"
            />
            <div v-if="isMine" class="flex flex-wrap gap-2">
              <button
                type="button"
                class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-95 cursor-pointer"
                @click="isEditing = true"
              >
                <Pencil class="h-3.5 w-3.5" :stroke-width="2.2" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-red-400 transition-all hover:border-zinc-700 hover:bg-zinc-800 cursor-pointer"
                @click="showDeleteConfirm = true"
              >
                <Trash2 class="h-3.5 w-3.5" />
                <span>Delete</span>
              </button>
            </div>
            <div
              v-if="post.expiresAt"
              class="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 font-mono text-[11px] tabular-nums text-zinc-500"
            >
              Expires {{ formatDate(post.expiresAt) }}
            </div>

            <section class="space-y-3">
              <div class="flex items-center justify-between">
                <h2 class="text-sm font-semibold tracking-tight text-zinc-200">
                  Comments
                  <span
                    v-if="comments.length"
                    class="ml-1 font-mono text-[11px] font-medium tabular-nums text-zinc-500"
                  >
                    ({{ comments.length }})
                  </span>
                </h2>
                <button
                  v-if="comments.length"
                  type="button"
                  :disabled="threadLoading"
                  class="text-[11px] font-medium text-zinc-500 hover:text-zinc-200 disabled:opacity-50 cursor-pointer"
                  @click="loadThread"
                >
                  Refresh
                </button>
              </div>

              <form
                class="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 space-y-2"
                @submit.prevent="postComment"
              >
                <textarea
                  v-model="commentText"
                  rows="2"
                  :maxlength="FEED_COMMENT_MAX_CHARS"
                  placeholder="Write a comment…"
                  class="block w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none resize-y"
                />
                <div class="flex items-center justify-between">
                  <span class="font-mono text-[10px] tabular-nums text-zinc-600">
                    {{ commentText.trim().length }}/{{ FEED_COMMENT_MAX_CHARS }}
                  </span>
                  <button
                    type="submit"
                    :disabled="commentPosting || !commentText.trim()"
                    class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 disabled:opacity-50 cursor-pointer"
                  >
                    <Loader2 v-if="commentPosting" class="h-3.5 w-3.5 animate-spin" />
                    <span>Comment</span>
                  </button>
                </div>
              </form>

              <div v-if="threadLoading && !comments.length" class="flex items-center gap-2 py-4">
                <Loader2 class="h-4 w-4 animate-spin text-zinc-600" />
                <p class="text-xs text-zinc-500">Loading thread…</p>
              </div>
              <p
                v-else-if="!comments.length"
                class="rounded-xl border border-dashed border-zinc-800 px-4 py-6 text-center text-xs text-zinc-600"
              >
                No comments yet. Start the discussion.
              </p>
              <div v-else class="space-y-2">
                <FeedCommentItem
                  v-for="comment in comments"
                  :key="comment.eventId"
                  :comment="comment"
                  :mine="isCommentMine(comment)"
                  :busy="busyCommentId === comment.id"
                  @save="handleSaveComment"
                  @delete="askDeleteComment"
                />
              </div>
            </section>
          </div>

          <form
            v-else-if="isEditing && (isNew || isMine)"
            class="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-5 sm:p-6 space-y-5"
            @submit.prevent="handleSave"
          >
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="block text-[11px] font-medium uppercase tracking-wider text-zinc-500"
                  >Post</label
                >
                <span class="font-mono text-[11px] tabular-nums text-zinc-600">
                  {{ text.trim().length }}/{{ FEED_MAX_TEXT_CHARS }}
                </span>
              </div>
              <textarea
                v-model="text"
                rows="5"
                :maxlength="FEED_MAX_TEXT_CHARS"
                placeholder="Share an update…"
                class="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none resize-y"
              />
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  Media & music
                </label>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white cursor-pointer"
                  @click="fileInput?.click()"
                >
                  <Paperclip class="h-3.5 w-3.5" />
                  Add files
                </button>
              </div>
              <input
                ref="fileInput"
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                class="hidden"
                @change="onFileSelect"
              />
              <div v-if="keepMedia.length" class="space-y-2">
                <div
                  v-for="(m, idx) in keepMedia"
                  :key="`kept-${idx}`"
                  class="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3"
                >
                  <component :is="pickIcon(m.mime)" class="h-4 w-4 shrink-0 text-zinc-500" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-xs font-medium text-zinc-200">{{ m.name }}</p>
                    <p class="font-mono text-[11px] tabular-nums text-zinc-600">
                      {{ formatBytes(m.size) }} · kept
                    </p>
                  </div>
                  <button
                    type="button"
                    class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 cursor-pointer"
                    @click="removeKeptMedia(idx)"
                  >
                    <X class="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div v-if="newFiles.length" class="space-y-2">
                <div
                  v-for="(f, idx) in newFiles"
                  :key="`${f.name}-${f.size}-${idx}`"
                  class="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3"
                >
                  <component :is="pickIcon(f.type)" class="h-4 w-4 shrink-0 text-zinc-500" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-xs font-medium text-zinc-200">{{ f.name }}</p>
                    <p class="font-mono text-[11px] tabular-nums text-zinc-600">
                      {{ formatBytes(f.size) }} · new
                    </p>
                  </div>
                  <button
                    type="button"
                    class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 cursor-pointer"
                    @click="removeNewFile(idx)"
                  >
                    <X class="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p class="text-[11px] text-zinc-600">
                Up to {{ FEED_MAX_FILES }} files: images, video, audio (music). Encrypted before
                upload.
              </p>
            </div>

            <div v-if="isSaving && uploadStatus" class="text-xs text-zinc-500">
              {{ uploadStatus }}
            </div>

            <div class="flex items-center justify-end gap-2 border-t border-zinc-800/80 pt-5">
              <button
                v-if="!isNew"
                type="button"
                class="inline-flex h-9 items-center rounded-lg border border-zinc-800 px-4 text-xs font-medium text-zinc-300 hover:bg-zinc-900/40 cursor-pointer"
                @click="isEditing = false"
              >
                Cancel
              </button>
              <button
                v-else
                type="button"
                class="inline-flex h-9 items-center rounded-lg border border-zinc-800 px-4 text-xs font-medium text-zinc-300 hover:bg-zinc-900/40 cursor-pointer"
                @click="router.push('/feed')"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="isSaving"
                class="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-5 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 disabled:opacity-50 cursor-pointer"
              >
                <Loader2 v-if="isSaving" class="h-4 w-4 animate-spin" />
                <Check v-else class="h-4 w-4" />
                <span>{{ isNew ? "Publish" : "Save" }}</span>
              </button>
            </div>
          </form>
        </template>
      </div>
    </div>

    <AppConfirmDialog
      :open="showDeleteConfirm"
      title="Delete Post?"
      message="This publishes a deletion tombstone. Relays drop the original once they see it."
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />
    <AppConfirmDialog
      :open="Boolean(pendingCommentDelete)"
      title="Delete Comment?"
      message="This publishes a deletion tombstone. Relays drop the original once they see it."
      confirm-label="Delete"
      @confirm="confirmDeleteComment"
      @cancel="pendingCommentDelete = null"
    />
  </main>
</template>
