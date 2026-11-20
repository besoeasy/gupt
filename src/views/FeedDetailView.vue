<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Paperclip, X, Trash2, LoaderCircle, Check, Pencil, Music, Image, Film } from "@lucide/vue";
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
  <main class="feed-detail-view__main">
    <div class="feed-detail-view__block">
      <div class="feed-detail-view__block-2">
        <PageHeader
          :eyebrow="isNew ? 'New Post' : 'Public Post'"
          :title="isNew ? 'Create Post' : 'Post'"
        >
          <p class="feed-detail-view__text">
            {{
              isNew
                ? "Public for anyone to read. Auto-expires with retention, media stays encrypted with keys in the event."
                : "Anyone can read this post until it expires."
            }}
          </p>
        </PageHeader>

        <AppAlertBanner v-if="error" :message="error" />

        <div v-if="isLoading" class="feed-detail-view__status" role="status">
          <span class="feed-detail-view__text-2">Loading post…</span>

          <article class="feed-detail-view__article">
            <header class="feed-detail-view__header">
              <AppSkeleton class="feed-detail-view__app-skeleton" />
              <div class="feed-detail-view__block-3">
                <AppSkeleton class="feed-detail-view__app-skeleton-2" />
                <AppSkeleton class="feed-detail-view__app-skeleton-3" />
              </div>
              <AppSkeleton class="feed-detail-view__app-skeleton-4" />
            </header>

            <div class="feed-detail-view__block-4">
              <AppSkeleton class="feed-detail-view__app-skeleton-5" />
              <AppSkeleton class="feed-detail-view__app-skeleton-6" />
              <AppSkeleton class="feed-detail-view__app-skeleton-7" />
            </div>

            <div class="feed-detail-view__block-5">
              <AppSkeleton class="feed-detail-view__app-skeleton-8" />
            </div>

            <footer
              class="feed-detail-view__footer"
            >
              <AppSkeleton class="feed-detail-view__app-skeleton-9" />
              <AppSkeleton class="feed-detail-view__app-skeleton-10" />
            </footer>
          </article>
        </div>

        <template v-else>
          <div v-if="!isEditing && post" class="feed-detail-view__block-6">
            <FeedPostCard
              :post="post"
              :mine="isMine"
              :comment-count="comments.length"
              :reaction-counts="reactionSummary.counts"
              :my-reaction="reactionSummary.myReaction"
              @react="handleReact"
            />
            <div v-if="isMine" class="feed-detail-view__block-7">
              <button
                type="button"
                class="feed-detail-view__button"
                @click="isEditing = true"
              >
                <Pencil class="feed-detail-view__pencil" :stroke-width="2.2" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                class="feed-detail-view__button-2"
                @click="showDeleteConfirm = true"
              >
                <Trash2 class="feed-detail-view__trash2" />
                <span>Delete</span>
              </button>
            </div>
            <div
              v-if="post.expiresAt"
              class="feed-detail-view__block-expires"
            >
              Expires {{ formatDate(post.expiresAt) }}
            </div>

            <section class="feed-detail-view__section">
              <div class="feed-detail-view__block-8">
                <h2 class="feed-detail-view__subtitle-comments">
                  Comments
                  <span
                    v-if="comments.length"
                    class="feed-detail-view__text-3"
                  >
                    ({{ comments.length }})
                  </span>
                </h2>
                <button
                  v-if="comments.length"
                  type="button"
                  :disabled="threadLoading"
                  class="feed-detail-view__button-refresh"
                  @click="loadThread"
                >
                  Refresh
                </button>
              </div>

              <form
                class="feed-detail-view__form"
                @submit.prevent="postComment"
              >
                <textarea
                  v-model="commentText"
                  rows="2"
                  :maxlength="FEED_COMMENT_MAX_CHARS"
                  placeholder="Write a comment…"
                  class="feed-detail-view__field-write-a"
                />
                <div class="feed-detail-view__block-9">
                  <span class="feed-detail-view__text-4">
                    {{ commentText.trim().length }}/{{ FEED_COMMENT_MAX_CHARS }}
                  </span>
                  <button
                    type="submit"
                    :disabled="commentPosting || !commentText.trim()"
                    class="feed-detail-view__button-3"
                  >
                    <LoaderCircle v-if="commentPosting" class="feed-detail-view__loader-circle" />
                    <span>Comment</span>
                  </button>
                </div>
              </form>

              <div v-if="threadLoading && !comments.length" class="feed-detail-view__status-2" role="status">
                <span class="feed-detail-view__text-5">Loading thread…</span>
                <div
                  v-for="n in 2"
                  :key="n"
                  class="feed-detail-view__block-10"
                >
                  <AppSkeleton class="feed-detail-view__app-skeleton-11" />
                  <div class="feed-detail-view__block-11">
                    <div class="feed-detail-view__block-12">
                      <AppSkeleton class="feed-detail-view__app-skeleton-12" />
                      <AppSkeleton class="feed-detail-view__app-skeleton-13" />
                    </div>
                    <AppSkeleton class="feed-detail-view__app-skeleton-14" />
                    <AppSkeleton class="feed-detail-view__app-skeleton-15" />
                  </div>
                </div>
              </div>
              <p
                v-else-if="!comments.length"
                class="feed-detail-view__text-6"
              >
                No comments yet. Start the discussion.
              </p>
              <div v-else class="feed-detail-view__block-13">
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
            class="feed-detail-view__form-2"
            @submit.prevent="handleSave"
          >
            <div class="feed-detail-view__block-14">
              <div class="feed-detail-view__block-15">
                <label class="feed-detail-view__label-post"
                  >Post</label
                >
                <span class="feed-detail-view__text-7">
                  {{ text.trim().length }}/{{ FEED_MAX_TEXT_CHARS }}
                </span>
              </div>
              <textarea
                v-model="text"
                rows="5"
                :maxlength="FEED_MAX_TEXT_CHARS"
                placeholder="Share an update…"
                class="feed-detail-view__field-share-an"
              />
            </div>

            <div class="feed-detail-view__block-16">
              <div class="feed-detail-view__block-17">
                <label class="feed-detail-view__label">
                  Media & music
                </label>
                <button
                  type="button"
                  class="feed-detail-view__button-add-files"
                  @click="fileInput?.click()"
                >
                  <Paperclip class="feed-detail-view__paperclip" />
                  Add files
                </button>
              </div>
              <input
                ref="fileInput"
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                class="feed-detail-view__field-file"
                @change="onFileSelect"
              />
              <div v-if="keepMedia.length" class="feed-detail-view__block-18">
                <div
                  v-for="(m, idx) in keepMedia"
                  :key="`kept-${idx}`"
                  class="feed-detail-view__block-19"
                >
                  <component :is="pickIcon(m.mime)" class="feed-detail-view__component" />
                  <div class="feed-detail-view__block-20">
                    <p class="feed-detail-view__text-8">{{ m.name }}</p>
                    <p class="feed-detail-view__text-9">
                      {{ formatBytes(m.size) }} · kept
                    </p>
                  </div>
                  <button
                    type="button"
                    class="feed-detail-view__button-4"
                    @click="removeKeptMedia(idx)"
                  >
                    <X class="feed-detail-view__x" />
                  </button>
                </div>
              </div>
              <div v-if="newFiles.length" class="feed-detail-view__block-21">
                <div
                  v-for="(f, idx) in newFiles"
                  :key="`${f.name}-${f.size}-${idx}`"
                  class="feed-detail-view__block-22"
                >
                  <component :is="pickIcon(f.type)" class="feed-detail-view__component-2" />
                  <div class="feed-detail-view__block-23">
                    <p class="feed-detail-view__text-10">{{ f.name }}</p>
                    <p class="feed-detail-view__text-11">
                      {{ formatBytes(f.size) }} · new
                    </p>
                  </div>
                  <button
                    type="button"
                    class="feed-detail-view__button-5"
                    @click="removeNewFile(idx)"
                  >
                    <X class="feed-detail-view__x-2" />
                  </button>
                </div>
              </div>
              <p class="feed-detail-view__text-12">
                Up to {{ FEED_MAX_FILES }} files: images, video, audio (music). Encrypted before
                upload.
              </p>
            </div>

            <div v-if="isSaving && uploadStatus" class="feed-detail-view__block-24">
              {{ uploadStatus }}
            </div>

            <div class="feed-detail-view__block-25">
              <button
                v-if="!isNew"
                type="button"
                class="feed-detail-view__button-cancel"
                @click="isEditing = false"
              >
                Cancel
              </button>
              <button
                v-else
                type="button"
                class="feed-detail-view__button-cancel-2"
                @click="router.push('/feed')"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="isSaving"
                class="feed-detail-view__button-6"
              >
                <LoaderCircle v-if="isSaving" class="feed-detail-view__loader-circle-2" />
                <Check v-else class="feed-detail-view__check" />
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

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {






































@media (hover:hover) {
.feed-detail-view__button-2:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.feed-detail-view__button:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.feed-detail-view__button-3:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.feed-detail-view__button-6:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.feed-detail-view__button-2:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.feed-detail-view__button-cancel:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
.feed-detail-view__button-cancel-2:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__button-cancel:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__button-cancel-2:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}
}

@media (hover:hover) {
.feed-detail-view__button-4:hover {
  color: var(--color-red-400);
}
}

@media (hover:hover) {
.feed-detail-view__button-5:hover {
  color: var(--color-red-400);
}
}

@media (hover:hover) {
.feed-detail-view__button-add-files:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.feed-detail-view__button-refresh:hover {
  color: var(--ui-zinc-200);
}
}

@media (min-width:40rem) {
.feed-detail-view__form-2 {
  padding: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.feed-detail-view__header {
  padding-inline: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.feed-detail-view__block-4 {
  padding-inline: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.feed-detail-view__block-5 {
  padding-inline: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.feed-detail-view__footer {
  padding-inline: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.feed-detail-view__block {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.feed-detail-view__header {
  padding-top: calc(var(--spacing) * 5);
}
}

@media (min-width:64rem) {
.feed-detail-view__block {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.feed-detail-view__text-2 {
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
.feed-detail-view__text-5 {
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
.feed-detail-view__block {
  margin-inline: auto;
}
.feed-detail-view__footer {
  margin-top: calc(var(--spacing) * 3);
}
.feed-detail-view__text-3 {
  margin-left: var(--spacing);
}
.feed-detail-view__field-write-a {
  display: block;
}
.feed-detail-view__label-post {
  display: block;
}
.feed-detail-view__field-share-an {
  display: block;
}
.feed-detail-view__label {
  display: block;
}
.feed-detail-view__header {
  display: flex;
}
.feed-detail-view__footer {
  display: flex;
}
.feed-detail-view__block-7 {
  display: flex;
}
.feed-detail-view__block-8 {
  display: flex;
}
.feed-detail-view__block-9 {
  display: flex;
}
.feed-detail-view__block-10 {
  display: flex;
}
.feed-detail-view__block-12 {
  display: flex;
}
.feed-detail-view__block-15 {
  display: flex;
}
.feed-detail-view__block-17 {
  display: flex;
}
.feed-detail-view__block-19 {
  display: flex;
}
.feed-detail-view__block-22 {
  display: flex;
}
.feed-detail-view__block-25 {
  display: flex;
}
.feed-detail-view__field-file {
  display: none;
}
.feed-detail-view__button {
  display: inline-flex;
}
.feed-detail-view__button-2 {
  display: inline-flex;
}
.feed-detail-view__button-3 {
  display: inline-flex;
}
.feed-detail-view__button-add-files {
  display: inline-flex;
}
.feed-detail-view__button-4 {
  display: inline-flex;
}
.feed-detail-view__button-5 {
  display: inline-flex;
}
.feed-detail-view__button-cancel {
  display: inline-flex;
}
.feed-detail-view__button-cancel-2 {
  display: inline-flex;
}
.feed-detail-view__button-6 {
  display: inline-flex;
}
.feed-detail-view__app-skeleton-13 {
  height: calc(var(--spacing) * 2.5);
}
.feed-detail-view__app-skeleton-3 {
  height: calc(var(--spacing) * 3);
}
.feed-detail-view__app-skeleton-5 {
  height: calc(var(--spacing) * 3);
}
.feed-detail-view__app-skeleton-6 {
  height: calc(var(--spacing) * 3);
}
.feed-detail-view__app-skeleton-7 {
  height: calc(var(--spacing) * 3);
}
.feed-detail-view__app-skeleton-10 {
  height: calc(var(--spacing) * 3);
}
.feed-detail-view__app-skeleton-12 {
  height: calc(var(--spacing) * 3);
}
.feed-detail-view__app-skeleton-14 {
  height: calc(var(--spacing) * 3);
}
.feed-detail-view__app-skeleton-15 {
  height: calc(var(--spacing) * 3);
}
.feed-detail-view__app-skeleton-2 {
  height: calc(var(--spacing) * 3.5);
}
.feed-detail-view__pencil {
  height: calc(var(--spacing) * 3.5);
}
.feed-detail-view__trash2 {
  height: calc(var(--spacing) * 3.5);
}
.feed-detail-view__loader-circle {
  height: calc(var(--spacing) * 3.5);
}
.feed-detail-view__paperclip {
  height: calc(var(--spacing) * 3.5);
}
.feed-detail-view__component {
  height: calc(var(--spacing) * 4);
}
.feed-detail-view__x {
  height: calc(var(--spacing) * 4);
}
.feed-detail-view__component-2 {
  height: calc(var(--spacing) * 4);
}
.feed-detail-view__x-2 {
  height: calc(var(--spacing) * 4);
}
.feed-detail-view__loader-circle-2 {
  height: calc(var(--spacing) * 4);
}
.feed-detail-view__check {
  height: calc(var(--spacing) * 4);
}
.feed-detail-view__app-skeleton-4 {
  height: calc(var(--spacing) * 6);
}
.feed-detail-view__app-skeleton-8 {
  height: calc(var(--spacing) * 8);
}
.feed-detail-view__app-skeleton-9 {
  height: calc(var(--spacing) * 8);
}
.feed-detail-view__button {
  height: calc(var(--spacing) * 8);
}
.feed-detail-view__button-2 {
  height: calc(var(--spacing) * 8);
}
.feed-detail-view__button-3 {
  height: calc(var(--spacing) * 8);
}
.feed-detail-view__app-skeleton-11 {
  height: calc(var(--spacing) * 8);
}
.feed-detail-view__button-4 {
  height: calc(var(--spacing) * 8);
}
.feed-detail-view__button-5 {
  height: calc(var(--spacing) * 8);
}
.feed-detail-view__button-cancel {
  height: calc(var(--spacing) * 9);
}
.feed-detail-view__button-cancel-2 {
  height: calc(var(--spacing) * 9);
}
.feed-detail-view__button-6 {
  height: calc(var(--spacing) * 9);
}
.feed-detail-view__app-skeleton {
  height: calc(var(--spacing) * 10);
}
.feed-detail-view__main {
  min-height: 100dvh;
}
.feed-detail-view__pencil {
  width: calc(var(--spacing) * 3.5);
}
.feed-detail-view__trash2 {
  width: calc(var(--spacing) * 3.5);
}
.feed-detail-view__loader-circle {
  width: calc(var(--spacing) * 3.5);
}
.feed-detail-view__paperclip {
  width: calc(var(--spacing) * 3.5);
}
.feed-detail-view__app-skeleton-7 {
  width: 75%;
}
.feed-detail-view__app-skeleton-15 {
  width: 60%;
}
.feed-detail-view__component {
  width: calc(var(--spacing) * 4);
}
.feed-detail-view__x {
  width: calc(var(--spacing) * 4);
}
.feed-detail-view__component-2 {
  width: calc(var(--spacing) * 4);
}
.feed-detail-view__x-2 {
  width: calc(var(--spacing) * 4);
}
.feed-detail-view__loader-circle-2 {
  width: calc(var(--spacing) * 4);
}
.feed-detail-view__check {
  width: calc(var(--spacing) * 4);
}
.feed-detail-view__app-skeleton-11 {
  width: calc(var(--spacing) * 8);
}
.feed-detail-view__button-4 {
  width: calc(var(--spacing) * 8);
}
.feed-detail-view__button-5 {
  width: calc(var(--spacing) * 8);
}
.feed-detail-view__app-skeleton {
  width: calc(var(--spacing) * 10);
}
.feed-detail-view__app-skeleton-6 {
  width: 91.6667%;
}
.feed-detail-view__app-skeleton-13 {
  width: calc(var(--spacing) * 12);
}
.feed-detail-view__app-skeleton-4 {
  width: calc(var(--spacing) * 16);
}
.feed-detail-view__app-skeleton-3 {
  width: calc(var(--spacing) * 24);
}
.feed-detail-view__app-skeleton-9 {
  width: calc(var(--spacing) * 24);
}
.feed-detail-view__app-skeleton-12 {
  width: calc(var(--spacing) * 24);
}
.feed-detail-view__app-skeleton-10 {
  width: calc(var(--spacing) * 28);
}
.feed-detail-view__app-skeleton-2 {
  width: calc(var(--spacing) * 36);
}
.feed-detail-view__app-skeleton-8 {
  width: calc(var(--spacing) * 40);
}
.feed-detail-view__block {
  width: 100%;
}
.feed-detail-view__app-skeleton-5 {
  width: 100%;
}
.feed-detail-view__field-write-a {
  width: 100%;
}
.feed-detail-view__app-skeleton-14 {
  width: 100%;
}
.feed-detail-view__field-share-an {
  width: 100%;
}
.feed-detail-view__block {
  max-width: var(--container-6xl);
}
.feed-detail-view__app-skeleton-2 {
  max-width: 100%;
}
.feed-detail-view__block-3 {
  min-width: 0;
}
.feed-detail-view__block-11 {
  min-width: 0;
}
.feed-detail-view__block-20 {
  min-width: 0;
}
.feed-detail-view__block-23 {
  min-width: 0;
}
.feed-detail-view__block-3 {
  flex: 1;
}
.feed-detail-view__block-11 {
  flex: 1;
}
.feed-detail-view__block-20 {
  flex: 1;
}
.feed-detail-view__block-23 {
  flex: 1;
}
.feed-detail-view__app-skeleton {
  flex-shrink: 0;
}
.feed-detail-view__app-skeleton-4 {
  flex-shrink: 0;
}
.feed-detail-view__app-skeleton-11 {
  flex-shrink: 0;
}
.feed-detail-view__component {
  flex-shrink: 0;
}
.feed-detail-view__component-2 {
  flex-shrink: 0;
}
.feed-detail-view__loader-circle {
  animation: var(--animate-spin);
}
.feed-detail-view__loader-circle-2 {
  animation: var(--animate-spin);
}
.feed-detail-view__button {
  cursor: pointer;
}
.feed-detail-view__button-2 {
  cursor: pointer;
}
.feed-detail-view__button-refresh {
  cursor: pointer;
}
.feed-detail-view__button-3 {
  cursor: pointer;
}
.feed-detail-view__button-add-files {
  cursor: pointer;
}
.feed-detail-view__button-4 {
  cursor: pointer;
}
.feed-detail-view__button-5 {
  cursor: pointer;
}
.feed-detail-view__button-cancel {
  cursor: pointer;
}
.feed-detail-view__button-cancel-2 {
  cursor: pointer;
}
.feed-detail-view__button-6 {
  cursor: pointer;
}
.feed-detail-view__field-write-a {
  resize: vertical;
}
.feed-detail-view__field-share-an {
  resize: vertical;
}
.feed-detail-view__block-7 {
  flex-wrap: wrap;
}
.feed-detail-view__footer {
  align-items: center;
}
.feed-detail-view__button {
  align-items: center;
}
.feed-detail-view__button-2 {
  align-items: center;
}
.feed-detail-view__block-8 {
  align-items: center;
}
.feed-detail-view__block-9 {
  align-items: center;
}
.feed-detail-view__button-3 {
  align-items: center;
}
.feed-detail-view__block-12 {
  align-items: center;
}
.feed-detail-view__block-15 {
  align-items: center;
}
.feed-detail-view__block-17 {
  align-items: center;
}
.feed-detail-view__button-add-files {
  align-items: center;
}
.feed-detail-view__block-19 {
  align-items: center;
}
.feed-detail-view__button-4 {
  align-items: center;
}
.feed-detail-view__block-22 {
  align-items: center;
}
.feed-detail-view__button-5 {
  align-items: center;
}
.feed-detail-view__block-25 {
  align-items: center;
}
.feed-detail-view__button-cancel {
  align-items: center;
}
.feed-detail-view__button-cancel-2 {
  align-items: center;
}
.feed-detail-view__button-6 {
  align-items: center;
}
.feed-detail-view__header {
  align-items: flex-start;
}
.feed-detail-view__footer {
  justify-content: space-between;
}
.feed-detail-view__block-8 {
  justify-content: space-between;
}
.feed-detail-view__block-9 {
  justify-content: space-between;
}
.feed-detail-view__block-15 {
  justify-content: space-between;
}
.feed-detail-view__block-17 {
  justify-content: space-between;
}
.feed-detail-view__button-4 {
  justify-content: center;
}
.feed-detail-view__button-5 {
  justify-content: center;
}
.feed-detail-view__block-25 {
  justify-content: flex-end;
}
.feed-detail-view__button {
  gap: calc(var(--spacing) * 1.5);
}
.feed-detail-view__button-2 {
  gap: calc(var(--spacing) * 1.5);
}
.feed-detail-view__button-3 {
  gap: calc(var(--spacing) * 1.5);
}
.feed-detail-view__button-add-files {
  gap: calc(var(--spacing) * 1.5);
}
.feed-detail-view__footer {
  gap: calc(var(--spacing) * 2);
}
.feed-detail-view__block-7 {
  gap: calc(var(--spacing) * 2);
}
.feed-detail-view__block-12 {
  gap: calc(var(--spacing) * 2);
}
.feed-detail-view__block-25 {
  gap: calc(var(--spacing) * 2);
}
.feed-detail-view__button-6 {
  gap: calc(var(--spacing) * 2);
}
.feed-detail-view__block-10 {
  gap: calc(var(--spacing) * 2.5);
}
.feed-detail-view__header {
  gap: calc(var(--spacing) * 3);
}
.feed-detail-view__block-19 {
  gap: calc(var(--spacing) * 3);
}
.feed-detail-view__block-22 {
  gap: calc(var(--spacing) * 3);
}
:where(.feed-detail-view__block-14>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.feed-detail-view__block-3>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.feed-detail-view__block-4>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.feed-detail-view__form>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.feed-detail-view__status-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.feed-detail-view__block-11>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.feed-detail-view__block-13>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.feed-detail-view__block-16>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.feed-detail-view__block-18>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.feed-detail-view__block-21>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.feed-detail-view__section>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.feed-detail-view__status>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.feed-detail-view__block-6>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.feed-detail-view__form-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.feed-detail-view__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
:where(.feed-detail-view__block-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
.feed-detail-view__text-8 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.feed-detail-view__text-10 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.feed-detail-view__main {
  overflow-x: hidden;
}
.feed-detail-view__main {
  overflow-y: auto;
}
.feed-detail-view__app-skeleton-4 {
  border-radius: 3.40282e38px;
}
.feed-detail-view__app-skeleton-8 {
  border-radius: var(--radius-lg);
}
.feed-detail-view__app-skeleton-9 {
  border-radius: var(--radius-lg);
}
.feed-detail-view__button {
  border-radius: var(--radius-lg);
}
.feed-detail-view__button-2 {
  border-radius: var(--radius-lg);
}
.feed-detail-view__field-write-a {
  border-radius: var(--radius-lg);
}
.feed-detail-view__button-3 {
  border-radius: var(--radius-lg);
}
.feed-detail-view__app-skeleton-11 {
  border-radius: var(--radius-lg);
}
.feed-detail-view__button-4 {
  border-radius: var(--radius-lg);
}
.feed-detail-view__button-5 {
  border-radius: var(--radius-lg);
}
.feed-detail-view__button-cancel {
  border-radius: var(--radius-lg);
}
.feed-detail-view__button-cancel-2 {
  border-radius: var(--radius-lg);
}
.feed-detail-view__button-6 {
  border-radius: var(--radius-lg);
}
.feed-detail-view__article {
  border-radius: var(--radius-xl);
}
.feed-detail-view__app-skeleton {
  border-radius: var(--radius-xl);
}
.feed-detail-view__block-expires {
  border-radius: var(--radius-xl);
}
.feed-detail-view__form {
  border-radius: var(--radius-xl);
}
.feed-detail-view__block-10 {
  border-radius: var(--radius-xl);
}
.feed-detail-view__text-6 {
  border-radius: var(--radius-xl);
}
.feed-detail-view__form-2 {
  border-radius: var(--radius-xl);
}
.feed-detail-view__field-share-an {
  border-radius: var(--radius-xl);
}
.feed-detail-view__block-19 {
  border-radius: var(--radius-xl);
}
.feed-detail-view__block-22 {
  border-radius: var(--radius-xl);
}
.feed-detail-view__article {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-detail-view__button-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-detail-view__block-expires {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-detail-view__form {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-detail-view__field-write-a {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-detail-view__block-10 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-detail-view__text-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-detail-view__form-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-detail-view__field-share-an {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-detail-view__block-19 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-detail-view__block-22 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-detail-view__button-cancel {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-detail-view__button-cancel-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-detail-view__footer {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.feed-detail-view__block-25 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.feed-detail-view__text-6 {
  --border-style: dashed;
  border-style: dashed;
}
.feed-detail-view__button-2 {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__field-write-a {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__text-6 {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__field-share-an {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__button-cancel {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__button-cancel-2 {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__article {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__footer {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__block-expires {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__form {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__block-10 {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__form-2 {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__block-19 {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__block-22 {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__block-25 {
  border-color: var(--ui-zinc-800);
}
.feed-detail-view__main {
  background-color: var(--ui-black);
}
.feed-detail-view__button {
  background-color: var(--color-white);
}
.feed-detail-view__button-3 {
  background-color: var(--color-white);
}
.feed-detail-view__button-6 {
  background-color: var(--color-white);
}
.feed-detail-view__block-19 {
  background-color: var(--ui-zinc-900);
}
.feed-detail-view__block-22 {
  background-color: var(--ui-zinc-900);
}
.feed-detail-view__button-2 {
  background-color: var(--ui-zinc-900);
}
.feed-detail-view__field-write-a {
  background-color: var(--ui-zinc-900);
}
.feed-detail-view__field-share-an {
  background-color: var(--ui-zinc-900);
}
.feed-detail-view__article {
  background-color: var(--ui-zinc-950);
}
.feed-detail-view__block-expires {
  background-color: var(--ui-zinc-950);
}
.feed-detail-view__form {
  background-color: var(--ui-zinc-950);
}
.feed-detail-view__block-10 {
  background-color: var(--ui-zinc-950);
}
.feed-detail-view__form-2 {
  background-color: var(--ui-zinc-950);
}
.feed-detail-view__block-expires {
  padding: calc(var(--spacing) * 3);
}
.feed-detail-view__form {
  padding: calc(var(--spacing) * 3);
}
.feed-detail-view__field-write-a {
  padding: calc(var(--spacing) * 3);
}
.feed-detail-view__block-10 {
  padding: calc(var(--spacing) * 3);
}
.feed-detail-view__block-19 {
  padding: calc(var(--spacing) * 3);
}
.feed-detail-view__block-22 {
  padding: calc(var(--spacing) * 3);
}
.feed-detail-view__field-share-an {
  padding: calc(var(--spacing) * 4);
}
.feed-detail-view__form-2 {
  padding: calc(var(--spacing) * 5);
}
.feed-detail-view__button {
  padding-inline: calc(var(--spacing) * 3);
}
.feed-detail-view__button-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.feed-detail-view__button-3 {
  padding-inline: calc(var(--spacing) * 3);
}
.feed-detail-view__block {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-detail-view__header {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-detail-view__block-4 {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-detail-view__block-5 {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-detail-view__footer {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-detail-view__text-6 {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-detail-view__button-cancel {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-detail-view__button-cancel-2 {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-detail-view__button-6 {
  padding-inline: calc(var(--spacing) * 5);
}
.feed-detail-view__footer {
  padding-block: calc(var(--spacing) * 2.5);
}
.feed-detail-view__block {
  padding-block: calc(var(--spacing) * 6);
}
.feed-detail-view__text-6 {
  padding-block: calc(var(--spacing) * 6);
}
.feed-detail-view__block-4 {
  padding-top: calc(var(--spacing) * 3);
}
.feed-detail-view__block-5 {
  padding-top: calc(var(--spacing) * 3);
}
.feed-detail-view__header {
  padding-top: calc(var(--spacing) * 4);
}
.feed-detail-view__block-25 {
  padding-top: calc(var(--spacing) * 5);
}
.feed-detail-view__main {
  padding-bottom: calc(var(--spacing) * 16);
}
.feed-detail-view__text-6 {
  text-align: center;
}
.feed-detail-view__block-expires {
  font-family: var(--font-mono);
}
.feed-detail-view__text-3 {
  font-family: var(--font-mono);
}
.feed-detail-view__text-4 {
  font-family: var(--font-mono);
}
.feed-detail-view__text-7 {
  font-family: var(--font-mono);
}
.feed-detail-view__text-9 {
  font-family: var(--font-mono);
}
.feed-detail-view__text-11 {
  font-family: var(--font-mono);
}
.feed-detail-view__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.feed-detail-view__subtitle-comments {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.feed-detail-view__field-write-a {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.feed-detail-view__field-share-an {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.feed-detail-view__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-detail-view__button-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-detail-view__button-3 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-detail-view__text-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-detail-view__button-add-files {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-detail-view__text-8 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-detail-view__text-10 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-detail-view__block-24 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-detail-view__button-cancel {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-detail-view__button-cancel-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-detail-view__button-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-detail-view__text-4 {
  font-size: 10px;
}
.feed-detail-view__block-expires {
  font-size: 11px;
}
.feed-detail-view__text-3 {
  font-size: 11px;
}
.feed-detail-view__button-refresh {
  font-size: 11px;
}
.feed-detail-view__label-post {
  font-size: 11px;
}
.feed-detail-view__text-7 {
  font-size: 11px;
}
.feed-detail-view__label {
  font-size: 11px;
}
.feed-detail-view__text-9 {
  font-size: 11px;
}
.feed-detail-view__text-11 {
  font-size: 11px;
}
.feed-detail-view__text-12 {
  font-size: 11px;
}
.feed-detail-view__text {
  --leading: calc(var(--spacing) * 6);
  line-height: calc(var(--spacing) * 6);
}
.feed-detail-view__field-write-a {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.feed-detail-view__field-share-an {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.feed-detail-view__button-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-detail-view__text-3 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-detail-view__button-refresh {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-detail-view__label-post {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-detail-view__label {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-detail-view__button-add-files {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-detail-view__text-8 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-detail-view__text-10 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-detail-view__button-cancel {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-detail-view__button-cancel-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-detail-view__button {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.feed-detail-view__subtitle-comments {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.feed-detail-view__button-3 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.feed-detail-view__button-6 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.feed-detail-view__subtitle-comments {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.feed-detail-view__label-post {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.feed-detail-view__label {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.feed-detail-view__button {
  color: var(--ui-black);
}
.feed-detail-view__button-3 {
  color: var(--ui-black);
}
.feed-detail-view__button-6 {
  color: var(--ui-black);
}
.feed-detail-view__button-2 {
  color: var(--color-red-400);
}
.feed-detail-view__main {
  color: var(--ui-zinc-100);
}
.feed-detail-view__field-write-a {
  color: var(--ui-zinc-100);
}
.feed-detail-view__field-share-an {
  color: var(--ui-zinc-100);
}
.feed-detail-view__subtitle-comments {
  color: var(--ui-zinc-200);
}
.feed-detail-view__text-8 {
  color: var(--ui-zinc-200);
}
.feed-detail-view__text-10 {
  color: var(--ui-zinc-200);
}
.feed-detail-view__button-cancel {
  color: var(--ui-zinc-300);
}
.feed-detail-view__button-cancel-2 {
  color: var(--ui-zinc-300);
}
.feed-detail-view__text {
  color: var(--ui-zinc-400);
}
.feed-detail-view__button-add-files {
  color: var(--ui-zinc-400);
}
.feed-detail-view__block-expires {
  color: var(--ui-zinc-500);
}
.feed-detail-view__text-3 {
  color: var(--ui-zinc-500);
}
.feed-detail-view__button-refresh {
  color: var(--ui-zinc-500);
}
.feed-detail-view__label-post {
  color: var(--ui-zinc-500);
}
.feed-detail-view__label {
  color: var(--ui-zinc-500);
}
.feed-detail-view__component {
  color: var(--ui-zinc-500);
}
.feed-detail-view__button-4 {
  color: var(--ui-zinc-500);
}
.feed-detail-view__component-2 {
  color: var(--ui-zinc-500);
}
.feed-detail-view__button-5 {
  color: var(--ui-zinc-500);
}
.feed-detail-view__block-24 {
  color: var(--ui-zinc-500);
}
.feed-detail-view__text-4 {
  color: var(--ui-zinc-600);
}
.feed-detail-view__text-6 {
  color: var(--ui-zinc-600);
}
.feed-detail-view__text-7 {
  color: var(--ui-zinc-600);
}
.feed-detail-view__text-9 {
  color: var(--ui-zinc-600);
}
.feed-detail-view__text-11 {
  color: var(--ui-zinc-600);
}
.feed-detail-view__text-12 {
  color: var(--ui-zinc-600);
}
.feed-detail-view__label-post {
  text-transform: uppercase;
}
.feed-detail-view__label {
  text-transform: uppercase;
}
.feed-detail-view__block-expires {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-detail-view__text-3 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-detail-view__text-4 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-detail-view__text-7 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-detail-view__text-9 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-detail-view__text-11 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-detail-view__button {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.feed-detail-view__button-3 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.feed-detail-view__button-6 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.feed-detail-view__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-detail-view__button-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-detail-view__button-3 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-detail-view__button-6 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-detail-view__field-write-a::placeholder {
  color: var(--ui-zinc-600);
}
.feed-detail-view__field-share-an::placeholder {
  color: var(--ui-zinc-600);
}
.feed-detail-view__field-write-a:focus {
  border-color: var(--ui-zinc-600);
}
.feed-detail-view__field-share-an:focus {
  border-color: var(--ui-zinc-600);
}
.feed-detail-view__field-write-a:focus {
  --outline-style: none;
  outline-style: none;
}
.feed-detail-view__field-share-an:focus {
  --outline-style: none;
  outline-style: none;
}
.feed-detail-view__button:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.feed-detail-view__button-refresh:disabled {
  opacity: .5;
}
.feed-detail-view__button-3:disabled {
  opacity: .5;
}
.feed-detail-view__button-6:disabled {
  opacity: .5;
}
[data-theme="light"] .feed-detail-view__button-2 {
  color: var(--app-danger);
}
[data-theme="light"] .feed-detail-view__button-cancel {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-detail-view__button-cancel-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-detail-view__text {
  color: var(--app-muted);
}
[data-theme="light"] .feed-detail-view__button-add-files {
  color: var(--app-muted);
}
[data-theme="light"] .feed-detail-view__block-expires {
  color: var(--app-muted);
}
[data-theme="light"] .feed-detail-view__text-3 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-detail-view__button-refresh {
  color: var(--app-muted);
}
[data-theme="light"] .feed-detail-view__label-post {
  color: var(--app-muted);
}
[data-theme="light"] .feed-detail-view__label {
  color: var(--app-muted);
}
[data-theme="light"] .feed-detail-view__component {
  color: var(--app-muted);
}
[data-theme="light"] .feed-detail-view__button-4 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-detail-view__component-2 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-detail-view__button-5 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-detail-view__block-24 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-detail-view__text-4 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-detail-view__text-6 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-detail-view__text-7 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-detail-view__text-9 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-detail-view__text-11 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-detail-view__text-12 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-detail-view__button-refresh:hover {
  color: var(--app-text) !important;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__article {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__footer {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__block-expires {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__form {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__block-10 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__form-2 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__block-19 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__block-22 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__block-25 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__block-19 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__block-22 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__button-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__field-write-a {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__field-share-an {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__article {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__block-expires {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__form {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__block-10 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-detail-view__form-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}
}
</style>
