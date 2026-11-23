<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Paperclip, X, Trash2, LoaderCircle, Check, Pencil, Music, Image, Film } from "@/icons";
import PageHeader from "@/components/PageHeader.vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
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
  formatBytes,
} from "@/lib/feed";

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
  const combined = [...(newFiles.value || []), ...selected];
  const total = combined.length + (keepMedia.value?.length || 0);
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
  if (!text.value.trim() && !keepMedia.value?.length && !newFiles.value?.length) {
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
  <main class="feed-detail">
    <div class="feed-detail__inner">
      <PageHeader
        :eyebrow="isNew ? 'New post' : 'Public post'"
        :title="isNew ? 'Create post' : 'Post'"
      >
        <p class="feed-detail__lede">
          {{
            isNew
              ? "Public for anyone to read. Auto-expires with retention, media stays encrypted with keys in the event."
              : "Anyone can read this post until it expires."
          }}
        </p>
      </PageHeader>

      <AppAlertBanner v-if="error" :message="error" />

      <div v-if="isLoading" class="feed-detail__loading" role="status">
        <span class="feed-detail__sr">Loading post…</span>
        <AppSkeleton class="feed-detail__skeleton-line" />
        <AppSkeleton class="feed-detail__skeleton-line feed-detail__skeleton-line--short" />
        <AppSkeleton class="feed-detail__skeleton-block" />
      </div>

      <template v-else>
        <div v-if="!isEditing && post" class="feed-detail__read">
          <FeedPostCard
            :post="post"
            :mine="isMine"
            :comment-count="comments.length"
            :reaction-counts="reactionSummary.counts"
            :my-reaction="reactionSummary.myReaction"
            @react="handleReact"
          />

          <div v-if="isMine" class="feed-detail__owner-actions">
            <button type="button" class="feed-detail__btn" @click="isEditing = true">
              <Pencil class="feed-detail__btn-icon" :stroke-width="2" aria-hidden="true" />
              <span>Edit</span>
            </button>
            <button type="button" class="feed-detail__btn feed-detail__btn--danger" @click="showDeleteConfirm = true">
              <Trash2 class="feed-detail__btn-icon" :stroke-width="1.9" aria-hidden="true" />
              <span>Delete</span>
            </button>
          </div>

          <p v-if="post.expiresAt" class="feed-detail__expires">
            Expires {{ formatDate(post.expiresAt) }}
          </p>

          <section class="feed-detail__comments">
            <div class="feed-detail__comments-head">
              <h2 class="feed-detail__comments-title">
                Comments
                <span v-if="comments.length" class="feed-detail__comments-count">{{ comments.length }}</span>
              </h2>
              <button
                v-if="comments.length"
                type="button"
                :disabled="threadLoading"
                class="feed-detail__refresh"
                @click="loadThread"
              >
                Refresh
              </button>
            </div>

            <form class="feed-detail__composer" @submit.prevent="postComment">
              <textarea
                v-model="commentText"
                rows="2"
                :maxlength="FEED_COMMENT_MAX_CHARS"
                placeholder="Write a comment…"
                class="feed-detail__textarea feed-detail__textarea--comment"
              />
              <div class="feed-detail__composer-foot">
                <span class="feed-detail__count">
                  {{ commentText.trim().length }}/{{ FEED_COMMENT_MAX_CHARS }}
                </span>
                <button
                  type="submit"
                  :disabled="commentPosting || !commentText.trim()"
                  class="feed-detail__btn feed-detail__btn--ink"
                >
                  <LoaderCircle v-if="commentPosting" class="feed-detail__btn-icon feed-detail__btn-icon--spin" aria-hidden="true" />
                  <span>Comment</span>
                </button>
              </div>
            </form>

            <div v-if="threadLoading && !comments.length" class="feed-detail__thread-loading" role="status">
              <span class="feed-detail__sr">Loading thread…</span>
              <AppSkeleton v-for="n in 2" :key="n" class="feed-detail__skeleton-line" />
            </div>
            <p v-else-if="!comments.length" class="feed-detail__empty">
              No comments yet. Start the discussion.
            </p>
            <div v-else class="feed-detail__thread">
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
          class="feed-detail__editor"
          @submit.prevent="handleSave"
        >
          <div class="feed-detail__field">
            <div class="feed-detail__field-head">
              <label class="feed-detail__label" for="feed-post-text">Post</label>
              <span class="feed-detail__count">
                {{ text.trim().length }}/{{ FEED_MAX_TEXT_CHARS }}
              </span>
            </div>
            <textarea
              id="feed-post-text"
              v-model="text"
              rows="5"
              :maxlength="FEED_MAX_TEXT_CHARS"
              placeholder="Share an update…"
              class="feed-detail__textarea"
            />
          </div>

          <div class="feed-detail__field">
            <div class="feed-detail__field-head">
              <span class="feed-detail__label">Media &amp; music</span>
              <button type="button" class="feed-detail__btn" @click="fileInput?.click()">
                <Paperclip class="feed-detail__btn-icon" :stroke-width="1.9" aria-hidden="true" />
                <span>Add files</span>
              </button>
            </div>
            <input
              ref="fileInput"
              type="file"
              multiple
              accept="image/*,video/*,audio/*"
              class="feed-detail__sr"
              @change="onFileSelect"
            />

            <div v-if="keepMedia.length" class="feed-detail__files">
              <div v-for="(m, idx) in keepMedia" :key="`kept-${idx}`" class="feed-detail__file">
                <component :is="pickIcon(m.mime)" class="feed-detail__file-icon" aria-hidden="true" />
                <div class="feed-detail__file-body">
                  <p class="feed-detail__file-name">{{ m.name }}</p>
                  <p class="feed-detail__file-meta">{{ formatBytes(m.size) }} · kept</p>
                </div>
                <button
                  type="button"
                  class="feed-detail__file-remove"
                  aria-label="Remove file"
                  @click="removeKeptMedia(idx)"
                >
                  <X class="feed-detail__file-x" :stroke-width="2" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div v-if="newFiles.length" class="feed-detail__files">
              <div
                v-for="(f, idx) in newFiles"
                :key="`${f.name}-${f.size}-${idx}`"
                class="feed-detail__file"
              >
                <component :is="pickIcon(f.type)" class="feed-detail__file-icon" aria-hidden="true" />
                <div class="feed-detail__file-body">
                  <p class="feed-detail__file-name">{{ f.name }}</p>
                  <p class="feed-detail__file-meta">{{ formatBytes(f.size) }} · new</p>
                </div>
                <button
                  type="button"
                  class="feed-detail__file-remove"
                  aria-label="Remove file"
                  @click="removeNewFile(idx)"
                >
                  <X class="feed-detail__file-x" :stroke-width="2" aria-hidden="true" />
                </button>
              </div>
            </div>

            <p class="feed-detail__hint">
              Up to {{ FEED_MAX_FILES }} files: images, video, audio (music). Encrypted before upload.
            </p>
          </div>

          <p v-if="isSaving && uploadStatus" class="feed-detail__status">{{ uploadStatus }}</p>

          <div class="feed-detail__actions">
            <button
              v-if="!isNew"
              type="button"
              class="feed-detail__btn"
              @click="isEditing = false"
            >
              Cancel
            </button>
            <button v-else type="button" class="feed-detail__btn" @click="router.push('/feed')">
              Cancel
            </button>
            <button type="submit" :disabled="isSaving" class="feed-detail__btn feed-detail__btn--ink">
              <LoaderCircle v-if="isSaving" class="feed-detail__btn-icon feed-detail__btn-icon--spin" aria-hidden="true" />
              <Check v-else class="feed-detail__btn-icon" :stroke-width="2.2" aria-hidden="true" />
              <span>{{ isNew ? "Publish" : "Save" }}</span>
            </button>
          </div>
        </form>
      </template>
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

<style scoped>
/* Ledger pass: the post page is a sheet, its thread a ruled ledger. */

.feed-detail {
  min-height: 100dvh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.feed-detail__inner {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  width: 100%;
  max-width: 760px;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.feed-detail__lede {
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.feed-detail__sr {
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

.feed-detail__loading {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
}

.feed-detail__skeleton-line {
  display: block;
  height: 10px;
  border-radius: 3px;
}

.feed-detail__skeleton-line--short {
  width: 56%;
}

.feed-detail__skeleton-block {
  display: block;
  height: 60px;
  border-radius: var(--app-radius-sm);
}

.feed-detail__read {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.feed-detail__owner-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.feed-detail__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding-inline: 11px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.feed-detail__btn-icon {
  width: 12px;
  height: 12px;
}

.feed-detail__btn-icon--spin {
  animation: var(--animate-spin);
}

.feed-detail__btn:active {
  transform: translateY(1px);
}

.feed-detail__btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.feed-detail__btn--ink {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.feed-detail__btn--danger {
  border-color: color-mix(in oklab, var(--app-danger) 28%, var(--app-border));
  color: var(--app-danger);
}

.feed-detail__expires {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.feed-detail__comments {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  padding-top: var(--app-space-5);
  border-top: 1px solid var(--app-border);
}

.feed-detail__comments-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--app-space-2);
}

.feed-detail__comments-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

.feed-detail__comments-count {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.03em;
  color: var(--app-muted-2);
}

.feed-detail__refresh {
  min-height: 26px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.feed-detail__composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feed-detail__textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-family: var(--font-sans);
  font-size: var(--app-text-body);
  line-height: 1.6;
  color: var(--app-text);
  resize: vertical;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.feed-detail__textarea--comment {
  min-height: 68px;
}

.feed-detail__textarea::placeholder {
  color: var(--app-muted-2);
}

.feed-detail__textarea:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.feed-detail__composer-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
}

.feed-detail__count {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.03em;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.feed-detail__thread-loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: var(--app-space-4);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
}

.feed-detail__empty {
  margin: 0;
  padding: var(--app-space-4);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-size: 11.5px;
  text-align: center;
  color: var(--app-muted-2);
}

.feed-detail__thread {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-fade 320ms var(--app-ease-standard) both;
}

.feed-detail__editor {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}

.feed-detail__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.feed-detail__field-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-2);
}

.feed-detail__label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

.feed-detail__files {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  overflow: hidden;
}

.feed-detail__file {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
}

.feed-detail__file + .feed-detail__file {
  border-top: 1px solid var(--app-border);
}

.feed-detail__file-icon {
  flex-shrink: 0;
  width: 13px;
  height: 13px;
  color: var(--app-muted-2);
}

.feed-detail__file-body {
  flex: 1;
  min-width: 0;
}

.feed-detail__file-name {
  margin: 0;
  font-size: 11.5px;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-detail__file-meta {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  color: var(--app-muted-2);
}

.feed-detail__file-remove {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
}

.feed-detail__file-x {
  width: 10px;
  height: 10px;
}

.feed-detail__hint {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--app-muted-2);
}

.feed-detail__status {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--app-primary);
}

.feed-detail__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding-top: var(--app-space-4);
  border-top: 1px solid var(--app-border);
}

@media (min-width: 40rem) {
  .feed-detail__inner {
    padding-inline: var(--app-space-6);
  }

  .feed-detail__editor {
    padding: var(--app-space-6);
  }
}

@media (hover: hover) {
  .feed-detail__btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .feed-detail__btn--ink:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .feed-detail__btn--danger:hover {
    border-color: var(--app-danger);
    background: var(--app-danger-soft);
    color: var(--app-danger);
  }

  .feed-detail__refresh:hover {
    color: var(--app-text);
  }

  .feed-detail__file-remove:hover {
    background: var(--app-surface-soft);
    color: var(--app-danger);
  }
}

@media (pointer: coarse) {
  .feed-detail__btn,
  .feed-detail__refresh,
  .feed-detail__file-remove {
    min-height: var(--app-touch-h);
  }

  .feed-detail__file-remove {
    min-width: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .feed-detail,
  .feed-detail__thread,
  .feed-detail__editor {
    animation: none;
  }

  .feed-detail__btn,
  .feed-detail__textarea,
  .feed-detail__refresh {
    transition: none;
  }
}
</style>
