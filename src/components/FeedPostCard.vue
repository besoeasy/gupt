<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Clock,
  Download,
  FileHeadphone,
  FileText,
  Images,
  MessageCircle,
  RefreshCw,
  Trash2,
} from "@lucide/vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import FeedReactionBar from "@/components/FeedReactionBar.vue";
import MediaDecryptStatus from "@/components/chat/MediaDecryptStatus.vue";
import { useChatMedia } from "@/composables/useChatMedia";
import { useProfileStore } from "@/stores/profiles";
import { MEDIA_PHASE } from "@/lib/mediaDecrypt";
import { feedFilesToMediaMessages, formatBytes } from "@/lib/feed";
import { isAudio, isImage, isVideo } from "@/lib/chatUtils";

const props = defineProps({
  post: { type: Object, required: true },
  mine: { type: Boolean, default: false },
  commentCount: { type: Number, default: 0 },
  reactionCounts: { type: Object, default: () => ({}) },
  myReaction: { type: String, default: "" },
  reactionsDisabled: { type: Boolean, default: false },
});

const emit = defineEmits(["open", "delete", "react"]);

const router = useRouter();
const profiles = useProfileStore();
const mediaList = computed(() => props.post?.media || []);
const mediaMessages = computed(() => feedFilesToMediaMessages(mediaList.value));
const messageAt = (idx) => mediaMessages.value[idx];

const {
  mediaBlobUrls,
  mediaProgress,
  decryptFailed,
  preloadMedia,
  downloadMedia,
  retryMedia,
  cleanup: cleanupMedia,
} = useChatMedia();

const expanded = ref(false);
const copied = ref(false);

const displayName = computed(() => profiles.displayName(props.post?.pubkey));
const avatarSrc = computed(() => profiles.profilePicture(props.post?.pubkey));

const visualMedia = computed(() =>
  mediaList.value
    .map((file, idx) => ({ file, idx }))
    .filter(({ file }) => isImage(file.mime) || isVideo(file.mime)),
);
const audioMedia = computed(() =>
  mediaList.value.map((file, idx) => ({ file, idx })).filter(({ file }) => isAudio(file.mime)),
);
const fileMedia = computed(() =>
  mediaList.value
    .map((file, idx) => ({ file, idx }))
    .filter(({ file }) => !isImage(file.mime) && !isVideo(file.mime) && !isAudio(file.mime)),
);

const isLongText = computed(() => (props.post?.text || "").length > 420);
const visibleText = computed(() => {
  if (expanded.value || !isLongText.value) return props.post?.text || "";
  return `${(props.post?.text || "").slice(0, 420).trimEnd()}…`;
});

const URL_RE = /(https?:\/\/[^\s)]+)/g;
const textSegments = computed(() => {
  const text = visibleText.value || "";
  const parts = text.split(URL_RE);
  return parts.map((part) => ({
    value: part,
    link: /^https?:\/\//.test(part),
  }));
});

const isEdited = computed(() => {
  const created = Number(props.post.createdAt || 0);
  const updated = Number(props.post.updatedAt || 0);
  return created && updated && updated - created > 60_000;
});

function shortPubkey(pk) {
  const s = String(pk || "");
  return s ? `${s.slice(0, 8)}…${s.slice(-4)}` : "—";
}

function fullDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(ts) {
  if (!ts) return "—";
  const diff = Date.now() - Number(ts);
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const expiryLabel = computed(() => {
  const exp = Number(props.post.expiresAt || 0);
  if (!exp) return "";
  const diff = exp - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return h <= 1 ? "Expires in ~1h" : `Expires in ~${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return d === 1 ? "Expires in 1d" : `Expires in ${d}d`;
  return `Expires ${new Date(exp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
});

function openThread() {
  emit("open", props.post);
}

function openProfile(e) {
  e.stopPropagation();
  if (props.post.pubkey) router.push(`/profile/${props.post.pubkey}`);
}

async function copyPubkey(e) {
  e.stopPropagation();
  try {
    await navigator.clipboard.writeText(String(props.post.pubkey || ""));
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1200);
  } catch {}
}

function toggleExpanded(e) {
  e.stopPropagation();
  expanded.value = !expanded.value;
}

function openExternal(url, e) {
  e.stopPropagation();
  window.open(url, "_blank", "noopener,noreferrer");
}

async function download(idx, e) {
  e?.stopPropagation();
  await downloadMedia(messageAt(idx)).catch(() => {});
}

const blobAt = (idx) => mediaBlobUrls[messageAt(idx)?.id];
const progressAt = (idx) => mediaProgress[messageAt(idx)?.id];
const failedAt = (idx) => Boolean(decryptFailed[messageAt(idx)?.id]);

function isLoading(idx) {
  const phase = progressAt(idx)?.phase;
  return phase === MEDIA_PHASE.FETCH || phase === MEDIA_PHASE.DECRYPT || phase === MEDIA_PHASE.QUEUED;
}

function retry(idx) {
  retryMedia(messageAt(idx));
}

onMounted(() => {
  if (props.post.pubkey) void profiles.prefetch([props.post.pubkey]);
  for (const message of mediaMessages.value) preloadMedia(message);
});
</script>

<template>
  <article
    class="feed-post-card__article"
    @click="openThread"
  >
    <header class="feed-post-card__header">
      <div class="feed-post-card__block" @click="openProfile">
        <RoboAvatar
          :pubkey="post.pubkey"
          :src="avatarSrc"
          size="md"
          rounded="xl"
          hoverable
          :alt="displayName"
        />
      </div>
      <div class="feed-post-card__block-2">
        <div class="feed-post-card__block-3">
          <button
            type="button"
            class="feed-post-card__button"
            :title="displayName"
            @click="openProfile"
          >
            {{ displayName }}
          </button>
          <span
            v-if="mine"
            class="feed-post-card__text-you"
          >
            You
          </span>
          <span v-if="isEdited" class="feed-post-card__text">· edited</span>
        </div>
        <div class="feed-post-card__block-4">
          <button
            type="button"
            class="feed-post-card__button-2"
            :title="post.pubkey"
            @click="copyPubkey"
          >
            {{ copied ? "copied!" : shortPubkey(post.pubkey) }}
          </button>
          <span aria-hidden="true">·</span>
          <time :title="fullDate(post.createdAt)" class="feed-post-card__time">{{
            timeAgo(post.createdAt)
          }}</time>
        </div>
      </div>
      <span
        v-if="expiryLabel"
        class="feed-post-card__text-2"
        :title="post.expiresAt ? fullDate(post.expiresAt) : ''"
      >
        <Clock class="feed-post-card__clock" />
        <span class="feed-post-card__text-3">{{ expiryLabel }}</span>
        <span class="feed-post-card__text-4">{{ timeAgo(post.expiresAt) }}</span>
      </span>
    </header>

    <div v-if="post.text" class="feed-post-card__block-5">
      <p class="feed-post-card__text-5">
        <template v-for="(seg, i) in textSegments" :key="i">
          <a
            v-if="seg.link"
            class="feed-post-card__link"
            @click="openExternal(seg.value, $event)"
          >
            {{ seg.value }}
          </a>
          <template v-else>{{ seg.value }}</template>
        </template>
      </p>
      <button
        v-if="isLongText"
        type="button"
        class="feed-post-card__button-3"
        @click="toggleExpanded"
      >
        {{ expanded ? "Show less" : "Show more" }}
      </button>
    </div>

    <div v-if="mediaList.length" class="feed-post-card__block-6" @click.stop>
      <div
        v-if="visualMedia.length"
        class="feed-post-card__block-7"
        :class="visualMedia.length === 1 ? 'feed-post-card__block--variant-1' : 'feed-post-card__block--variant-2'"
      >
        <div
          v-for="{ file, idx } in visualMedia"
          :key="`${post.eventId}:${idx}`"
          class="feed-post-card__block-8"
          :class="visualMedia.length === 1 ? 'feed-post-card__block--variant-1-2' : 'feed-post-card__block--variant-2-2'"
        >
          <img
            v-if="blobAt(idx) && isImage(file.mime)"
            :src="blobAt(idx)"
            :alt="file.name"
            class="feed-post-card__image"
            :class="visualMedia.length === 1 ? 'feed-post-card__image--variant-1' : ''"
            loading="lazy"
          />
          <video
            v-else-if="blobAt(idx) && isVideo(file.mime)"
            :src="blobAt(idx)"
            controls
            preload="metadata"
            class="feed-post-card__video"
          />
          <div
            v-else
            class="feed-post-card__block-9"
          >
            <template v-if="isLoading(idx) || failedAt(idx)">
              <MediaDecryptStatus
                :progress="progressAt(idx)"
                :event-id="post.eventId"
                :file-name="file.name"
                :file-size="file.size"
                compact
                retryable
                @retry="retry(idx)"
              />
            </template>
            <template v-else>
              <Images class="feed-post-card__images" />
              <p class="feed-post-card__text-6">{{ file.name }}</p>
              <p class="feed-post-card__text-7">{{ formatBytes(file.size) }}</p>
            </template>
          </div>
        </div>
      </div>

      <div v-if="audioMedia.length" class="feed-post-card__block-10">
        <div
          v-for="{ file, idx } in audioMedia"
          :key="`${post.eventId}:${idx}`"
          class="feed-post-card__block-11"
        >
          <div class="feed-post-card__block-12">
            <FileHeadphone class="feed-post-card__file-headphone" />
            <p class="feed-post-card__text-8">{{ file.name }}</p>
            <span class="feed-post-card__text-9">
              {{ formatBytes(file.size) }}
            </span>
          </div>
          <audio v-if="blobAt(idx)" :src="blobAt(idx)" controls preload="metadata" class="feed-post-card__audio" />
          <MediaDecryptStatus
            v-else-if="isLoading(idx) || failedAt(idx)"
            :progress="progressAt(idx)"
            :event-id="post.eventId"
            :file-name="file.name"
            :file-size="file.size"
            retryable
            compact
            @retry="retry(idx)"
          />
          <div v-else class="feed-post-card__block-13">
            <span>Decrypting…</span>
          </div>
        </div>
      </div>

      <div v-if="fileMedia.length" class="feed-post-card__block-14">
        <div
          v-for="{ file, idx } in fileMedia"
          :key="`${post.eventId}:${idx}`"
          class="feed-post-card__block-15"
        >
          <div
            class="feed-post-card__block-16"
          >
            <FileText class="feed-post-card__file-text" />
          </div>
          <div class="feed-post-card__block-17">
            <p class="feed-post-card__text-10">{{ file.name }}</p>
            <p class="feed-post-card__text-11">
              {{ formatBytes(file.size) }}
              <span v-if="failedAt(idx)"> · decrypt failed</span>
            </p>
            <MediaDecryptStatus
              v-if="isLoading(idx) || failedAt(idx)"
              :progress="progressAt(idx)"
              :event-id="post.eventId"
              :file-name="file.name"
              :file-size="file.size"
              retryable
              compact
              @retry="retry(idx)"
            />
          </div>
          <div class="feed-post-card__block-18">
            <button
              v-if="failedAt(idx)"
              type="button"
              class="feed-post-card__button-4"
              @click="retry(idx)"
            >
              <RefreshCw class="feed-post-card__refresh-cw" />
              <span>Retry</span>
            </button>
            <button
              type="button"
              class="feed-post-card__button-5"
              @click="download(idx, $event)"
            >
              <Download class="feed-post-card__download" />
              <span>Save</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="feed-post-card__block-19" @click.stop>
      <FeedReactionBar
        :counts="reactionCounts"
        :my-reaction="myReaction"
        :disabled="reactionsDisabled"
        @react="(emoji) => emit('react', { post, emoji })"
      />
    </div>

    <footer
      class="feed-post-card__footer"
      @click.stop
    >
      <div class="feed-post-card__block-20">
        <button
          type="button"
          class="feed-post-card__button-6"
          @click="openThread"
        >
          <MessageCircle class="feed-post-card__message-circle" />
          <span v-if="commentCount" class="feed-post-card__text-12"
            >{{ commentCount }} {{ commentCount === 1 ? "comment" : "comments" }}</span
          >
          <span v-else>Comment</span>
        </button>
        <span
          v-if="mediaList.length"
          class="feed-post-card__text-13"
        >
          <Images class="feed-post-card__images-2" />
          <span class="feed-post-card__text-14">{{ mediaList.length }}</span>
        </span>
      </div>
      <div v-if="mine" class="feed-post-card__block-21">
        <span class="feed-post-card__text-your-post">Your post</span>
        <button
          type="button"
          class="feed-post-card__button-7"
          @click="emit('delete', post)"
        >
          <Trash2 class="feed-post-card__trash2" />
          <span>Delete</span>
        </button>
      </div>
      <span v-else class="feed-post-card__text-15"> Public · auto-expires </span>
    </footer>
  </article>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.feed-post-card__article {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-post-card__block-11 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-post-card__block-15 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-post-card__footer {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-post-card__block-8 {
  background-color: color-mix(in oklab,var(--ui-black) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-post-card__block-11 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-post-card__block-15 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-post-card__text-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.feed-post-card__article {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 40%,transparent);
}
}

@media (hover:hover) {
.feed-post-card__article:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.feed-post-card__button-7:hover {
  background-color: #fb2c361a;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.feed-post-card__button-7:hover {
  background-color: color-mix(in oklab,var(--color-red-500) 10%,transparent);
}
}
}

@media (hover:hover) {
.feed-post-card__button-4:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.feed-post-card__button-5:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.feed-post-card__article:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
.feed-post-card__button-6:hover {
  background-color: var(--ui-zinc-900);
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.feed-post-card__article:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.feed-post-card__button-6:hover {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}
}

@media (hover:hover) {
.feed-post-card__button:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.feed-post-card__button-3:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.feed-post-card__button-4:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.feed-post-card__button-5:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.feed-post-card__button-2:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.feed-post-card__button-6:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.feed-post-card__button:hover {
  text-decoration-line: underline;
}
}

@media (hover:hover) {
.feed-post-card__button-2:hover {
  text-decoration-line: underline;
}
}

@media (hover:hover) {
.feed-post-card__button-3:hover {
  text-decoration-line: underline;
}
}

@media (hover:hover) {
.feed-post-card__link:hover {
  -webkit-text-decoration-color: var(--ui-zinc-300);
  text-decoration-color: var(--ui-zinc-300);
}
}

@media (min-width:40rem) {
.feed-post-card__text-4 {
  display: none;
}
}

@media (min-width:40rem) {
.feed-post-card__text-3 {
  display: inline;
}
}

@media (min-width:40rem) {
.feed-post-card__text-your-post {
  display: inline;
}
}

@media (min-width:40rem) {
.feed-post-card__header {
  padding-inline: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.feed-post-card__block-5 {
  padding-inline: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.feed-post-card__block-6 {
  padding-inline: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.feed-post-card__block-19 {
  padding-inline: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.feed-post-card__footer {
  padding-inline: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.feed-post-card__header {
  padding-top: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.feed-post-card__button {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
}

@layer gupt-components {
.feed-post-card__block-8 {
  position: relative;
}
.feed-post-card__block-4 {
  margin-top: calc(var(--spacing) * .5);
}
.feed-post-card__button-3 {
  margin-top: var(--spacing);
}
.feed-post-card__footer {
  margin-top: calc(var(--spacing) * 3);
}
.feed-post-card__text-your-post {
  margin-right: var(--spacing);
}
.feed-post-card__block-12 {
  margin-bottom: calc(var(--spacing) * 2);
}
.feed-post-card__header {
  display: flex;
}
.feed-post-card__block-3 {
  display: flex;
}
.feed-post-card__block-4 {
  display: flex;
}
.feed-post-card__block-9 {
  display: flex;
}
.feed-post-card__block-12 {
  display: flex;
}
.feed-post-card__block-13 {
  display: flex;
}
.feed-post-card__block-15 {
  display: flex;
}
.feed-post-card__block-16 {
  display: flex;
}
.feed-post-card__block-18 {
  display: flex;
}
.feed-post-card__footer {
  display: flex;
}
.feed-post-card__block-20 {
  display: flex;
}
.feed-post-card__block-21 {
  display: flex;
}
.feed-post-card__block-7 {
  display: grid;
}
.feed-post-card__text-3 {
  display: none;
}
.feed-post-card__text-your-post {
  display: none;
}
.feed-post-card__text-2 {
  display: inline-flex;
}
.feed-post-card__button-4 {
  display: inline-flex;
}
.feed-post-card__button-5 {
  display: inline-flex;
}
.feed-post-card__button-6 {
  display: inline-flex;
}
.feed-post-card__text-13 {
  display: inline-flex;
}
.feed-post-card__button-7 {
  display: inline-flex;
}
.feed-post-card__block--variant-2-2 {
  aspect-ratio: 1;
}
.feed-post-card__clock {
  height: calc(var(--spacing) * 3);
}
.feed-post-card__refresh-cw {
  height: calc(var(--spacing) * 3.5);
}
.feed-post-card__download {
  height: calc(var(--spacing) * 3.5);
}
.feed-post-card__images-2 {
  height: calc(var(--spacing) * 3.5);
}
.feed-post-card__file-headphone {
  height: calc(var(--spacing) * 4);
}
.feed-post-card__file-text {
  height: calc(var(--spacing) * 4);
}
.feed-post-card__message-circle {
  height: calc(var(--spacing) * 4);
}
.feed-post-card__trash2 {
  height: calc(var(--spacing) * 4);
}
.feed-post-card__images {
  height: calc(var(--spacing) * 6);
}
.feed-post-card__button-4 {
  height: calc(var(--spacing) * 8);
}
.feed-post-card__button-5 {
  height: calc(var(--spacing) * 8);
}
.feed-post-card__button-6 {
  height: calc(var(--spacing) * 8);
}
.feed-post-card__button-7 {
  height: calc(var(--spacing) * 8);
}
.feed-post-card__block-16 {
  height: calc(var(--spacing) * 9);
}
.feed-post-card__image {
  height: 100%;
}
.feed-post-card__video {
  height: 100%;
}
.feed-post-card__block-9 {
  height: 100%;
}
.feed-post-card__block--variant-2-2 {
  max-height: calc(var(--spacing) * 64);
}
.feed-post-card__block--variant-1-2 {
  max-height: calc(var(--spacing) * 96);
}
.feed-post-card__image--variant-1 {
  max-height: calc(var(--spacing) * 96);
}
.feed-post-card__block-9 {
  min-height: calc(var(--spacing) * 28);
}
.feed-post-card__clock {
  width: calc(var(--spacing) * 3);
}
.feed-post-card__refresh-cw {
  width: calc(var(--spacing) * 3.5);
}
.feed-post-card__download {
  width: calc(var(--spacing) * 3.5);
}
.feed-post-card__images-2 {
  width: calc(var(--spacing) * 3.5);
}
.feed-post-card__file-headphone {
  width: calc(var(--spacing) * 4);
}
.feed-post-card__file-text {
  width: calc(var(--spacing) * 4);
}
.feed-post-card__message-circle {
  width: calc(var(--spacing) * 4);
}
.feed-post-card__trash2 {
  width: calc(var(--spacing) * 4);
}
.feed-post-card__images {
  width: calc(var(--spacing) * 6);
}
.feed-post-card__block-16 {
  width: calc(var(--spacing) * 9);
}
.feed-post-card__image {
  width: 100%;
}
.feed-post-card__video {
  width: 100%;
}
.feed-post-card__audio {
  width: 100%;
}
.feed-post-card__button {
  max-width: 100%;
}
.feed-post-card__text-6 {
  max-width: 100%;
}
.feed-post-card__block-2 {
  min-width: 0;
}
.feed-post-card__text-8 {
  min-width: 0;
}
.feed-post-card__block-17 {
  min-width: 0;
}
.feed-post-card__block-2 {
  flex: 1;
}
.feed-post-card__text-8 {
  flex: 1;
}
.feed-post-card__block-17 {
  flex: 1;
}
.feed-post-card__block {
  flex-shrink: 0;
}
.feed-post-card__text-2 {
  flex-shrink: 0;
}
.feed-post-card__file-headphone {
  flex-shrink: 0;
}
.feed-post-card__text-9 {
  flex-shrink: 0;
}
.feed-post-card__block-16 {
  flex-shrink: 0;
}
.feed-post-card__block-18 {
  flex-shrink: 0;
}
.feed-post-card__article {
  cursor: pointer;
}
.feed-post-card__button {
  cursor: pointer;
}
.feed-post-card__button-2 {
  cursor: pointer;
}
.feed-post-card__button-3 {
  cursor: pointer;
}
.feed-post-card__button-4 {
  cursor: pointer;
}
.feed-post-card__button-5 {
  cursor: pointer;
}
.feed-post-card__button-6 {
  cursor: pointer;
}
.feed-post-card__button-7 {
  cursor: pointer;
}
.feed-post-card__block--variant-1 {
  grid-template-columns: repeat(1,minmax(0,1fr));
}
.feed-post-card__block--variant-2 {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
.feed-post-card__block-9 {
  flex-direction: column;
}
.feed-post-card__block-3 {
  flex-wrap: wrap;
}
.feed-post-card__block-4 {
  flex-wrap: wrap;
}
.feed-post-card__block-3 {
  align-items: center;
}
.feed-post-card__block-4 {
  align-items: center;
}
.feed-post-card__text-2 {
  align-items: center;
}
.feed-post-card__block-9 {
  align-items: center;
}
.feed-post-card__block-12 {
  align-items: center;
}
.feed-post-card__block-13 {
  align-items: center;
}
.feed-post-card__block-15 {
  align-items: center;
}
.feed-post-card__block-16 {
  align-items: center;
}
.feed-post-card__block-18 {
  align-items: center;
}
.feed-post-card__button-4 {
  align-items: center;
}
.feed-post-card__button-5 {
  align-items: center;
}
.feed-post-card__footer {
  align-items: center;
}
.feed-post-card__block-20 {
  align-items: center;
}
.feed-post-card__button-6 {
  align-items: center;
}
.feed-post-card__text-13 {
  align-items: center;
}
.feed-post-card__block-21 {
  align-items: center;
}
.feed-post-card__button-7 {
  align-items: center;
}
.feed-post-card__header {
  align-items: flex-start;
}
.feed-post-card__footer {
  justify-content: space-between;
}
.feed-post-card__block-9 {
  justify-content: center;
}
.feed-post-card__block-16 {
  justify-content: center;
}
.feed-post-card__text-2 {
  gap: var(--spacing);
}
.feed-post-card__block-20 {
  gap: var(--spacing);
}
.feed-post-card__text-13 {
  gap: var(--spacing);
}
.feed-post-card__block-21 {
  gap: var(--spacing);
}
.feed-post-card__button-7 {
  gap: var(--spacing);
}
.feed-post-card__block-18 {
  gap: calc(var(--spacing) * 1.5);
}
.feed-post-card__button-4 {
  gap: calc(var(--spacing) * 1.5);
}
.feed-post-card__button-5 {
  gap: calc(var(--spacing) * 1.5);
}
.feed-post-card__button-6 {
  gap: calc(var(--spacing) * 1.5);
}
.feed-post-card__block-7 {
  gap: calc(var(--spacing) * 2);
}
.feed-post-card__block-9 {
  gap: calc(var(--spacing) * 2);
}
.feed-post-card__block-12 {
  gap: calc(var(--spacing) * 2);
}
.feed-post-card__block-13 {
  gap: calc(var(--spacing) * 2);
}
.feed-post-card__footer {
  gap: calc(var(--spacing) * 2);
}
.feed-post-card__header {
  gap: calc(var(--spacing) * 3);
}
.feed-post-card__block-15 {
  gap: calc(var(--spacing) * 3);
}
:where(.feed-post-card__block-6>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.feed-post-card__block-10>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.feed-post-card__block-14>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
.feed-post-card__block-4 {
  column-gap: calc(var(--spacing) * 1.5);
}
.feed-post-card__block-3 {
  column-gap: calc(var(--spacing) * 2);
}
.feed-post-card__block-3 {
  row-gap: calc(var(--spacing) * .5);
}
.feed-post-card__block-4 {
  row-gap: calc(var(--spacing) * .5);
}
.feed-post-card__button {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.feed-post-card__text-6 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.feed-post-card__text-8 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.feed-post-card__text-10 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.feed-post-card__block-8 {
  overflow: hidden;
}
.feed-post-card__text-you {
  border-radius: 3.40282e38px;
}
.feed-post-card__text-2 {
  border-radius: 3.40282e38px;
}
.feed-post-card__block-16 {
  border-radius: var(--radius-lg);
}
.feed-post-card__button-4 {
  border-radius: var(--radius-lg);
}
.feed-post-card__button-5 {
  border-radius: var(--radius-lg);
}
.feed-post-card__button-6 {
  border-radius: var(--radius-lg);
}
.feed-post-card__button-7 {
  border-radius: var(--radius-lg);
}
.feed-post-card__article {
  border-radius: var(--radius-xl);
}
.feed-post-card__block-8 {
  border-radius: var(--radius-xl);
}
.feed-post-card__block-11 {
  border-radius: var(--radius-xl);
}
.feed-post-card__block-15 {
  border-radius: var(--radius-xl);
}
.feed-post-card__article {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-post-card__text-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-post-card__block-8 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-post-card__block-11 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-post-card__block-15 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-post-card__button-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-post-card__button-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-post-card__footer {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.feed-post-card__text-2 {
  border-color: var(--ui-zinc-800);
}
.feed-post-card__block-8 {
  border-color: var(--ui-zinc-800);
}
.feed-post-card__button-4 {
  border-color: var(--ui-zinc-800);
}
.feed-post-card__button-5 {
  border-color: var(--ui-zinc-800);
}
.feed-post-card__article {
  border-color: var(--ui-zinc-800);
}
.feed-post-card__block-11 {
  border-color: var(--ui-zinc-800);
}
.feed-post-card__block-15 {
  border-color: var(--ui-zinc-800);
}
.feed-post-card__footer {
  border-color: var(--ui-zinc-800);
}
.feed-post-card__block-8 {
  background-color: var(--ui-black);
}
.feed-post-card__text-you {
  background-color: var(--ui-zinc-800);
}
.feed-post-card__block-16 {
  background-color: var(--ui-zinc-800);
}
.feed-post-card__block-11 {
  background-color: var(--ui-zinc-900);
}
.feed-post-card__block-15 {
  background-color: var(--ui-zinc-900);
}
.feed-post-card__text-2 {
  background-color: var(--ui-zinc-900);
}
.feed-post-card__article {
  background-color: var(--ui-zinc-950);
}
.feed-post-card__image--variant-1 {
  object-fit: contain;
}
.feed-post-card__video {
  object-fit: contain;
}
.feed-post-card__image {
  object-fit: cover;
}
.feed-post-card__block-11 {
  padding: calc(var(--spacing) * 3);
}
.feed-post-card__block-15 {
  padding: calc(var(--spacing) * 3);
}
.feed-post-card__block-9 {
  padding: calc(var(--spacing) * 6);
}
.feed-post-card__text-13 {
  padding-inline: calc(var(--spacing) * 1.5);
}
.feed-post-card__text-you {
  padding-inline: calc(var(--spacing) * 2);
}
.feed-post-card__text-2 {
  padding-inline: calc(var(--spacing) * 2);
}
.feed-post-card__button-4 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.feed-post-card__button-6 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.feed-post-card__button-7 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.feed-post-card__button-5 {
  padding-inline: calc(var(--spacing) * 3);
}
.feed-post-card__header {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-post-card__block-5 {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-post-card__block-6 {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-post-card__block-19 {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-post-card__footer {
  padding-inline: calc(var(--spacing) * 4);
}
.feed-post-card__text-you {
  padding-block: calc(var(--spacing) * .5);
}
.feed-post-card__text-2 {
  padding-block: var(--spacing);
}
.feed-post-card__footer {
  padding-block: calc(var(--spacing) * 2.5);
}
.feed-post-card__block-5 {
  padding-top: calc(var(--spacing) * 3);
}
.feed-post-card__block-6 {
  padding-top: calc(var(--spacing) * 3);
}
.feed-post-card__block-19 {
  padding-top: calc(var(--spacing) * 3);
}
.feed-post-card__header {
  padding-top: calc(var(--spacing) * 4);
}
.feed-post-card__text-15 {
  padding-right: var(--spacing);
}
.feed-post-card__button-2 {
  font-family: var(--font-mono);
}
.feed-post-card__text-9 {
  font-family: var(--font-mono);
}
.feed-post-card__text-11 {
  font-family: var(--font-mono);
}
.feed-post-card__text-12 {
  font-family: var(--font-mono);
}
.feed-post-card__text-14 {
  font-family: var(--font-mono);
}
.feed-post-card__text-5 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.feed-post-card__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-post-card__block-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-post-card__button-3 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-post-card__text-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-post-card__text-8 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-post-card__text-10 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-post-card__button-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-post-card__button-7 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-post-card__text-you {
  font-size: 10px;
}
.feed-post-card__text-2 {
  font-size: 10px;
}
.feed-post-card__text {
  font-size: 11px;
}
.feed-post-card__button-2 {
  font-size: 11px;
}
.feed-post-card__text-7 {
  font-size: 11px;
}
.feed-post-card__text-9 {
  font-size: 11px;
}
.feed-post-card__block-13 {
  font-size: 11px;
}
.feed-post-card__text-11 {
  font-size: 11px;
}
.feed-post-card__button-4 {
  font-size: 11px;
}
.feed-post-card__button-5 {
  font-size: 11px;
}
.feed-post-card__text-13 {
  font-size: 11px;
}
.feed-post-card__text-your-post {
  font-size: 11px;
}
.feed-post-card__text-15 {
  font-size: 11px;
}
.feed-post-card__text-5 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.feed-post-card__text-you {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-post-card__text-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-post-card__button-3 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-post-card__text-8 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-post-card__text-10 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-post-card__button-4 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-post-card__button-5 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-post-card__button-6 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-post-card__text-13 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-post-card__button-7 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-post-card__button {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.feed-post-card__text-6 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.feed-post-card__button {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.feed-post-card__text-you {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.feed-post-card__text-5 {
  overflow-wrap: break-word;
}
.feed-post-card__link {
  word-break: break-all;
}
.feed-post-card__text-5 {
  white-space: pre-wrap;
}
.feed-post-card__button-7 {
  color: var(--color-red-400);
}
.feed-post-card__link {
  color: var(--ui-zinc-100);
}
.feed-post-card__button {
  color: var(--ui-zinc-200);
}
.feed-post-card__text-5 {
  color: var(--ui-zinc-200);
}
.feed-post-card__text-you {
  color: var(--ui-zinc-300);
}
.feed-post-card__file-headphone {
  color: var(--ui-zinc-300);
}
.feed-post-card__block-16 {
  color: var(--ui-zinc-300);
}
.feed-post-card__button-4 {
  color: var(--ui-zinc-300);
}
.feed-post-card__button-5 {
  color: var(--ui-zinc-300);
}
.feed-post-card__button-3 {
  color: var(--ui-zinc-400);
}
.feed-post-card__block-4 {
  color: var(--ui-zinc-500);
}
.feed-post-card__text-2 {
  color: var(--ui-zinc-500);
}
.feed-post-card__block-9 {
  color: var(--ui-zinc-500);
}
.feed-post-card__text-9 {
  color: var(--ui-zinc-500);
}
.feed-post-card__block-13 {
  color: var(--ui-zinc-500);
}
.feed-post-card__text-11 {
  color: var(--ui-zinc-500);
}
.feed-post-card__button-6 {
  color: var(--ui-zinc-500);
}
.feed-post-card__text {
  color: var(--ui-zinc-600);
}
.feed-post-card__text-13 {
  color: var(--ui-zinc-600);
}
.feed-post-card__text-your-post {
  color: var(--ui-zinc-600);
}
.feed-post-card__text-15 {
  color: var(--ui-zinc-600);
}
.feed-post-card__text-you {
  text-transform: uppercase;
}
.feed-post-card__time {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-post-card__text-9 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-post-card__text-11 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-post-card__text-12 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-post-card__text-14 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-post-card__link {
  text-decoration-line: underline;
}
.feed-post-card__link {
  -webkit-text-decoration-color: var(--ui-zinc-600);
  text-decoration-color: var(--ui-zinc-600);
}
.feed-post-card__link {
  text-underline-offset: 2px;
}
.feed-post-card__images {
  opacity: .5;
}
.feed-post-card__article {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-post-card__button-6 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-post-card__button-7 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.feed-post-card__article {
  --duration: .15s;
  transition-duration: .15s;
}
[data-theme="light"] .feed-post-card__button-7 {
  color: #dc2626;
}
[data-theme="light"] .feed-post-card__text-you {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-post-card__file-headphone {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-post-card__block-16 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-post-card__button-4 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-post-card__button-5 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-post-card__button-3 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-post-card__block-4 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-post-card__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-post-card__block-9 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-post-card__text-9 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-post-card__block-13 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-post-card__text-11 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-post-card__button-6 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-post-card__text {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-post-card__text-13 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-post-card__text-your-post {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-post-card__text-15 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-post-card__button-2:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .feed-post-card__button-6:hover {
  color: var(--app-text) !important;
}
}
}
</style>
