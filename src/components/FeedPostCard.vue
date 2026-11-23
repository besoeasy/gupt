<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Clock, Images, MessageCircle, Trash2 } from "@/icons";
import RoboAvatar from "@/components/RoboAvatar.vue";
import FeedReactionBar from "@/components/FeedReactionBar.vue";
import FeedPostMedia from "@/components/FeedPostMedia.vue";
import { useProfileStore } from "@/stores/profiles";

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

const expanded = ref(false);
const copied = ref(false);

const displayName = computed(() => profiles.displayName(props.post?.pubkey));
const avatarSrc = computed(() => profiles.profilePicture(props.post?.pubkey));

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

onMounted(() => {
  if (props.post.pubkey) void profiles.prefetch([props.post.pubkey]);
});
</script>

<template>
  <article class="post-card" @click="openThread">
    <header class="post-card__head">
      <div class="post-card__avatar" @click="openProfile">
        <RoboAvatar
          :pubkey="post.pubkey"
          :src="avatarSrc"
          size="md"
          rounded="xl"
          hoverable
          :alt="displayName"
        />
      </div>

      <div class="post-card__identity">
        <div class="post-card__name-row">
          <button type="button" class="post-card__name" :title="displayName" @click="openProfile">
            {{ displayName }}
          </button>
          <span v-if="mine" class="post-card__you">You</span>
          <span v-if="isEdited" class="post-card__meta">· edited</span>
        </div>
        <div class="post-card__meta-row">
          <button
            type="button"
            class="post-card__pubkey"
            :title="post.pubkey"
            @click="copyPubkey"
          >
            {{ copied ? "copied!" : shortPubkey(post.pubkey) }}
          </button>
          <span class="post-card__sep" aria-hidden="true">·</span>
          <time class="post-card__time" :title="fullDate(post.createdAt)">{{
            timeAgo(post.createdAt)
          }}</time>
        </div>
      </div>

      <span
        v-if="expiryLabel"
        class="post-card__expiry"
        :title="post.expiresAt ? fullDate(post.expiresAt) : ''"
      >
        <Clock class="post-card__expiry-icon" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ expiryLabel }}</span>
      </span>
    </header>

    <div v-if="post.text" class="post-card__body">
      <p class="post-card__text">
        <template v-for="(seg, i) in textSegments" :key="i">
          <a v-if="seg.link" class="post-card__link" @click="openExternal(seg.value, $event)">
            {{ seg.value }}
          </a>
          <template v-else>{{ seg.value }}</template>
        </template>
      </p>
      <button v-if="isLongText" type="button" class="post-card__more" @click="toggleExpanded">
        {{ expanded ? "Show less" : "Show more" }}
      </button>
    </div>

    <FeedPostMedia v-if="mediaList.length" :post="post" :media-list="mediaList" />

    <div class="post-card__reactions" @click.stop>
      <FeedReactionBar
        :counts="reactionCounts"
        :my-reaction="myReaction"
        :disabled="reactionsDisabled"
        @react="(emoji) => emit('react', { post, emoji })"
      />
    </div>

    <footer class="post-card__foot" @click.stop>
      <div class="post-card__foot-left">
        <button type="button" class="post-card__action" @click="openThread">
          <MessageCircle class="post-card__action-icon" :stroke-width="1.8" aria-hidden="true" />
          <span v-if="commentCount">{{ commentCount }} {{ commentCount === 1 ? "comment" : "comments" }}</span>
          <span v-else>Comment</span>
        </button>
        <span v-if="mediaList.length" class="post-card__count">
          <Images class="post-card__action-icon" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ mediaList.length }}</span>
        </span>
      </div>

      <div v-if="mine" class="post-card__foot-right">
        <span class="post-card__you post-card__you--quiet">Your post</span>
        <button
          type="button"
          class="post-card__action post-card__action--danger"
          @click="emit('delete', post)"
        >
          <Trash2 class="post-card__action-icon" :stroke-width="1.8" aria-hidden="true" />
          <span>Delete</span>
        </button>
      </div>
      <span v-else class="post-card__note">Public · auto-expires</span>
    </footer>
  </article>
</template>

<style scoped>
@layer base, gupt-components;

/* Ledger post: a hairline sheet, mono metadata, no shadow at rest or hover. */

.post-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background-color: var(--app-surface);
  cursor: pointer;
  animation: ledger-rise 440ms var(--app-ease-emphasized) backwards;
  transition:
    border-color var(--app-dur-base) var(--app-ease-standard),
    background-color var(--app-dur-base) var(--app-ease-standard),
    transform var(--app-dur-base) var(--app-ease-swift);
}

.post-card__head {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  min-width: 0;
}

.post-card__avatar {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: var(--app-radius-sm);
  overflow: hidden;
  cursor: pointer;
}

.post-card__identity {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.post-card__name-row {
  display: flex;
  align-items: baseline;
  gap: var(--app-space-2);
  min-width: 0;
}

.post-card__name {
  min-width: 0;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: inherit;
  font-size: var(--app-text-body);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--app-text);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.post-card__you {
  flex-shrink: 0;
  padding: 1px 5px;
  border: 1px solid color-mix(in oklab, var(--app-success) 35%, transparent);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-success);
}

.post-card__you--quiet {
  border-color: var(--app-border);
  color: var(--app-muted-2);
}

.post-card__meta {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--app-muted-2);
}

.post-card__meta-row {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}

.post-card__pubkey,
.post-card__time {
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.01em;
  color: var(--app-muted-2);
}

.post-card__pubkey {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.post-card__sep {
  font-size: 10px;
  color: var(--app-border-strong);
}

.post-card__expiry {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--app-muted-2);
  white-space: nowrap;
}

.post-card__expiry-icon {
  width: 11px;
  height: 11px;
}

.post-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-1);
}

.post-card__text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--app-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.post-card__link {
  color: var(--app-primary);
  text-decoration: underline;
  text-decoration-color: color-mix(in oklab, var(--app-primary) 40%, transparent);
  text-underline-offset: 2px;
  cursor: pointer;
  transition: text-decoration-color var(--app-dur-fast) var(--app-ease-standard);
}

.post-card__more {
  align-self: flex-start;
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.post-card__reactions {
  padding-top: var(--app-space-3);
  border-top: 1px solid var(--app-border);
}

.post-card__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-2) var(--app-space-4);
  padding-top: var(--app-space-3);
  border-top: 1px solid var(--app-border);
}

.post-card__foot-left,
.post-card__foot-right {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  min-width: 0;
}

.post-card__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

.post-card__action-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

.post-card__action--danger:hover {
  color: var(--app-danger);
}

.post-card__count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--app-muted-2);
}

.post-card__note {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.post-card__action:focus-visible,
.post-card__name:focus-visible,
.post-card__pubkey:focus-visible,
.post-card__more:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 2px;
}

@media (hover: hover) {
  .post-card:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-raised);
    transform: translateY(-1px);
  }

  .post-card__name:hover,
  .post-card__pubkey:hover {
    color: var(--app-primary);
  }

  .post-card__more:hover,
  .post-card__action:hover {
    color: var(--app-text);
    background-color: var(--app-surface-soft);
  }

  .post-card__link:hover {
    text-decoration-color: var(--app-primary);
  }
}

@media (pointer: coarse) {
  .post-card__action {
    min-height: var(--app-control-h);
  }
}

@media (max-width: 30rem) {
  .post-card {
    padding: var(--app-space-4);
  }

  .post-card__expiry {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .post-card {
    animation: none;
    transition: none;
  }

  .post-card:hover {
    transform: none;
  }
}
</style>
