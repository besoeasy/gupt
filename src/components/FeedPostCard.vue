<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Clock,
  Download,
  FileAudio,
  FileText,
  Images,
  Loader2,
  MessageCircle,
  Trash2,
} from "@lucide/vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import FeedReactionBar from "@/components/FeedReactionBar.vue";
import { useShareMedia } from "@/composables/useShareMedia";
import { useProfileStore } from "@/stores/profiles";
import { MEDIA_PHASE } from "@/lib/mediaDecrypt";
import { isAudio, isImage, isVideo } from "@/lib/chatUtils";
import { formatBytes } from "@/lib/share";

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
const shareMedia = useShareMedia(computed(() => props.post.eventId).value);
const mediaList = computed(() => props.post.media || []);
const expanded = ref(false);
const copied = ref(false);

const displayName = computed(() => profiles.displayName(props.post.pubkey));
const avatarSrc = computed(() => profiles.profilePicture(props.post.pubkey));

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

const isLongText = computed(() => (props.post.text || "").length > 420);
const visibleText = computed(() => {
  if (expanded.value || !isLongText.value) return props.post.text || "";
  return `${(props.post.text || "").slice(0, 420).trimEnd()}…`;
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

async function download(file, idx, e) {
  e?.stopPropagation();
  await shareMedia.downloadFile(file, idx).catch(() => {});
}

function isLoading(idx) {
  const phase = shareMedia.progress[idx]?.phase;
  return phase === MEDIA_PHASE.FETCH || phase === MEDIA_PHASE.DECRYPT;
}

onMounted(() => {
  if (props.post.pubkey) void profiles.prefetch([props.post.pubkey]);
  shareMedia.autoPreviewMedia(mediaList.value);
});
</script>

<template>
  <article
    class="group cursor-pointer rounded-xl border border-zinc-800/80 bg-zinc-950/40 transition-colors duration-150 hover:border-zinc-700 hover:bg-zinc-900/40"
    @click="openThread"
  >
    <header class="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
      <div class="shrink-0" @click="openProfile">
        <RoboAvatar
          :pubkey="post.pubkey"
          :src="avatarSrc"
          size="md"
          rounded="xl"
          hoverable
          :alt="displayName"
        />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <button
            type="button"
            class="max-w-full truncate text-xs font-semibold tracking-tight text-zinc-200 hover:text-white hover:underline cursor-pointer sm:text-sm"
            :title="displayName"
            @click="openProfile"
          >
            {{ displayName }}
          </button>
          <span
            v-if="mine"
            class="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-300"
          >
            You
          </span>
          <span v-if="isEdited" class="text-[11px] text-zinc-600">· edited</span>
        </div>
        <div class="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500">
          <button
            type="button"
            class="font-mono text-[11px] hover:text-zinc-200 hover:underline cursor-pointer"
            :title="post.pubkey"
            @click="copyPubkey"
          >
            {{ copied ? "copied!" : shortPubkey(post.pubkey) }}
          </button>
          <span aria-hidden="true">·</span>
          <time :title="fullDate(post.createdAt)" class="tabular-nums">{{
            timeAgo(post.createdAt)
          }}</time>
        </div>
      </div>
      <span
        v-if="expiryLabel"
        class="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[10px] font-medium text-zinc-500"
        :title="post.expiresAt ? fullDate(post.expiresAt) : ''"
      >
        <Clock class="h-3 w-3" />
        <span class="hidden sm:inline">{{ expiryLabel }}</span>
        <span class="sm:hidden">{{ timeAgo(post.expiresAt) }}</span>
      </span>
    </header>

    <div v-if="post.text" class="px-4 pt-3 sm:px-5">
      <p class="text-sm leading-relaxed break-words whitespace-pre-wrap text-zinc-200">
        <template v-for="(seg, i) in textSegments" :key="i">
          <a
            v-if="seg.link"
            class="text-zinc-100 underline decoration-zinc-600 underline-offset-2 break-all hover:decoration-zinc-300"
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
        class="mt-1 text-xs font-medium text-zinc-400 hover:text-white hover:underline cursor-pointer"
        @click="toggleExpanded"
      >
        {{ expanded ? "Show less" : "Show more" }}
      </button>
    </div>

    <div v-if="mediaList.length" class="space-y-2 px-4 pt-3 sm:px-5" @click.stop>
      <div
        v-if="visualMedia.length"
        class="grid gap-2"
        :class="visualMedia.length === 1 ? 'grid-cols-1' : 'grid-cols-2'"
      >
        <div
          v-for="{ file, idx } in visualMedia"
          :key="`${post.eventId}:${idx}`"
          class="relative overflow-hidden rounded-xl border border-zinc-800 bg-black/40"
          :class="visualMedia.length === 1 ? 'max-h-96' : 'aspect-square max-h-64'"
        >
          <img
            v-if="shareMedia.blobUrls[idx] && isImage(file.mime)"
            :src="shareMedia.blobUrls[idx]"
            :alt="file.name"
            class="h-full w-full object-cover"
            :class="visualMedia.length === 1 ? 'max-h-96 object-contain' : ''"
            loading="lazy"
          />
          <video
            v-else-if="shareMedia.blobUrls[idx] && isVideo(file.mime)"
            :src="shareMedia.blobUrls[idx]"
            controls
            preload="metadata"
            class="h-full w-full object-contain"
          />
          <div
            v-else
            class="flex h-full min-h-28 flex-col items-center justify-center gap-2 p-6 text-zinc-500"
          >
            <Loader2
              v-if="isLoading(idx) && !shareMedia.failed[idx]"
              class="h-6 w-6 animate-spin"
            />
            <template v-else>
              <Images class="h-6 w-6 opacity-50" />
              <p class="max-w-full truncate text-xs font-semibold">{{ file.name }}</p>
              <p class="text-[11px]">
                {{ formatBytes(file.size) }}
                <span v-if="shareMedia.failed[idx]"> · failed to load</span>
              </p>
            </template>
          </div>
        </div>
      </div>

      <div v-if="audioMedia.length" class="space-y-2">
        <div
          v-for="{ file, idx } in audioMedia"
          :key="`${post.eventId}:${idx}`"
          class="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3"
        >
          <div class="mb-2 flex items-center gap-2">
            <FileAudio class="h-4 w-4 shrink-0 text-zinc-300" />
            <p class="min-w-0 flex-1 truncate text-xs font-medium">{{ file.name }}</p>
            <span class="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
              {{ formatBytes(file.size) }}
            </span>
          </div>
          <audio
            v-if="shareMedia.blobUrls[idx]"
            :src="shareMedia.blobUrls[idx]"
            controls
            preload="metadata"
            class="w-full"
          />
          <div v-else class="flex items-center gap-2 text-[11px] text-zinc-500">
            <Loader2 v-if="isLoading(idx)" class="h-3.5 w-3.5 animate-spin" />
            <span v-else-if="shareMedia.failed[idx]">Preview failed — try downloading.</span>
            <span v-else>Decrypting…</span>
          </div>
        </div>
      </div>

      <div v-if="fileMedia.length" class="space-y-2">
        <div
          v-for="{ file, idx } in fileMedia"
          :key="`${post.eventId}:${idx}`"
          class="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3"
        >
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300"
          >
            <FileText class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-medium">{{ file.name }}</p>
            <p class="font-mono text-[11px] tabular-nums text-zinc-500">
              {{ formatBytes(file.size) }}
              <span v-if="shareMedia.failed[idx]"> · decrypt failed</span>
            </p>
          </div>
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 px-3 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer"
            @click="download(file, idx, $event)"
          >
            <Download class="h-3.5 w-3.5" />
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>

    <div class="px-4 pt-3 sm:px-5" @click.stop>
      <FeedReactionBar
        :counts="reactionCounts"
        :my-reaction="myReaction"
        :disabled="reactionsDisabled"
        @react="(emoji) => emit('react', { post, emoji })"
      />
    </div>

    <footer
      class="mt-3 flex items-center justify-between gap-2 border-t border-zinc-800/80 px-4 py-2.5 sm:px-5"
      @click.stop
    >
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-900/40 hover:text-zinc-200 cursor-pointer"
          @click="openThread"
        >
          <MessageCircle class="h-4 w-4" />
          <span v-if="commentCount" class="font-mono tabular-nums"
            >{{ commentCount }} {{ commentCount === 1 ? "comment" : "comments" }}</span
          >
          <span v-else>Comment</span>
        </button>
        <span
          v-if="mediaList.length"
          class="inline-flex items-center gap-1 px-1.5 text-[11px] font-medium text-zinc-600"
        >
          <Images class="h-3.5 w-3.5" />
          <span class="font-mono tabular-nums">{{ mediaList.length }}</span>
        </span>
      </div>
      <div v-if="mine" class="flex items-center gap-1">
        <span class="mr-1 hidden text-[11px] text-zinc-600 sm:inline">Your post</span>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 cursor-pointer"
          @click="emit('delete', post)"
        >
          <Trash2 class="h-4 w-4" />
          <span>Delete</span>
        </button>
      </div>
      <span v-else class="pr-1 text-[11px] text-zinc-600"> Public · auto-expires </span>
    </footer>
  </article>
</template>
