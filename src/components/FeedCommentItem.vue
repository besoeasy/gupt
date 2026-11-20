<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { Check, LoaderCircle, Pencil, Trash2, X } from "@/icons";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { useProfileStore } from "@/stores/profiles";
import { FEED_COMMENT_MAX_CHARS } from "@/lib/feed";

const props = defineProps({
  comment: { type: Object, required: true },
  mine: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
});

const emit = defineEmits(["save", "delete"]);

const router = useRouter();
const profiles = useProfileStore();
const isEditing = ref(false);
const draft = ref("");
const error = ref("");

const displayName = computed(() => profiles.displayName(props.comment.pubkey));
const avatarSrc = computed(() => profiles.profilePicture(props.comment.pubkey));

function shortPubkey(pk) {
  const s = String(pk || "");
  return s ? `${s.slice(0, 8)}…${s.slice(-4)}` : "—";
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

const isEdited = computed(() => {
  const created = Number(props.comment.createdAt || 0);
  const updated = Number(props.comment.updatedAt || 0);
  return created && updated && updated - created > 60_000;
});

function startEdit() {
  draft.value = props.comment.text || "";
  error.value = "";
  isEditing.value = true;
}

function cancelEdit() {
  isEditing.value = false;
  error.value = "";
}

function submitEdit() {
  const clean = draft.value.trim();
  if (!clean) {
    error.value = "Write a comment first.";
    return;
  }
  error.value = "";
  emit("save", { comment: props.comment, text: clean });
}

function openProfile(e) {
  e.stopPropagation();
  if (props.comment.pubkey) router.push(`/profile/${props.comment.pubkey}`);
}
</script>

<template>
  <div class="feed-comment-item__block">
    <div class="feed-comment-item__block-2" @click="openProfile">
      <RoboAvatar
        :pubkey="comment.pubkey"
        :src="avatarSrc"
        size="sm"
        rounded="xl"
        hoverable
        :alt="displayName"
      />
    </div>
    <div class="feed-comment-item__block-3">
      <div class="feed-comment-item__block-4">
        <button
          type="button"
          class="feed-comment-item__button"
          @click="openProfile"
        >
          {{ displayName }}
        </button>
        <span
          v-if="mine"
          class="feed-comment-item__text-you"
        >
          You
        </span>
        <span class="feed-comment-item__text">{{ shortPubkey(comment.pubkey) }}</span>
        <span aria-hidden="true" class="feed-comment-item__text-2">·</span>
        <time
          :title="fullDate(comment.createdAt)"
          class="feed-comment-item__time"
        >
          {{ timeAgo(comment.createdAt) }}
        </time>
        <span v-if="isEdited && !isEditing" class="feed-comment-item__text-3">· edited</span>
      </div>

      <p
        v-if="!isEditing"
        class="feed-comment-item__text-4"
      >
        {{ comment.text }}
      </p>

      <div v-else class="feed-comment-item__block-5">
        <textarea
          v-model="draft"
          rows="2"
          :maxlength="FEED_COMMENT_MAX_CHARS"
          class="feed-comment-item__field"
        />
        <p v-if="error" class="feed-comment-item__text-5">{{ error }}</p>
        <div class="feed-comment-item__block-6">
          <span class="feed-comment-item__text-6">
            {{ draft.trim().length }}/{{ FEED_COMMENT_MAX_CHARS }}
          </span>
          <div class="feed-comment-item__block-7">
            <button
              type="button"
              :disabled="busy"
              class="feed-comment-item__button-2"
              @click="cancelEdit"
            >
              <X class="feed-comment-item__x" />
              <span>Cancel</span>
            </button>
            <button
              type="button"
              :disabled="busy"
              class="feed-comment-item__button-3"
              @click="submitEdit"
            >
              <LoaderCircle v-if="busy" class="feed-comment-item__loader-circle" />
              <Check v-else class="feed-comment-item__check" />
              <span>Save</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="mine && !isEditing" class="feed-comment-item__block-8">
        <button
          type="button"
          class="feed-comment-item__button-4"
          @click="startEdit"
        >
          <Pencil class="feed-comment-item__pencil" />
          <span>Edit</span>
        </button>
        <button
          type="button"
          class="feed-comment-item__button-5"
          @click="emit('delete', comment)"
        >
          <Trash2 class="feed-comment-item__trash2" />
          <span>Delete</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.feed-comment-item__button-5:hover {
  background-color: var(--app-danger-soft);
}
}

@media (hover:hover) {
.feed-comment-item__button-3:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.feed-comment-item__button:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.feed-comment-item__button-2:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.feed-comment-item__button-4:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.feed-comment-item__button:hover {
  text-decoration-line: underline;
}
}

@layer gupt-components {
.feed-comment-item__text-4 {
  margin-top: var(--spacing);
}
.feed-comment-item__block-8 {
  margin-top: calc(var(--spacing) * 1.5);
}
.feed-comment-item__block-5 {
  margin-top: calc(var(--spacing) * 2);
}
.feed-comment-item__field {
  display: block;
}
.feed-comment-item__block {
  display: flex;
}
.feed-comment-item__block-4 {
  display: flex;
}
.feed-comment-item__block-6 {
  display: flex;
}
.feed-comment-item__block-7 {
  display: flex;
}
.feed-comment-item__block-8 {
  display: flex;
}
.feed-comment-item__button-2 {
  display: inline-flex;
}
.feed-comment-item__button-3 {
  display: inline-flex;
}
.feed-comment-item__button-4 {
  display: inline-flex;
}
.feed-comment-item__button-5 {
  display: inline-flex;
}
.feed-comment-item__pencil {
  height: calc(var(--spacing) * 3);
}
.feed-comment-item__trash2 {
  height: calc(var(--spacing) * 3);
}
.feed-comment-item__x {
  height: calc(var(--spacing) * 3.5);
}
.feed-comment-item__loader-circle {
  height: calc(var(--spacing) * 3.5);
}
.feed-comment-item__check {
  height: calc(var(--spacing) * 3.5);
}
.feed-comment-item__button-4 {
  height: calc(var(--spacing) * 7);
}
.feed-comment-item__button-5 {
  height: calc(var(--spacing) * 7);
}
.feed-comment-item__button-2 {
  height: calc(var(--spacing) * 8);
}
.feed-comment-item__button-3 {
  height: calc(var(--spacing) * 8);
}
.feed-comment-item__pencil {
  width: calc(var(--spacing) * 3);
}
.feed-comment-item__trash2 {
  width: calc(var(--spacing) * 3);
}
.feed-comment-item__x {
  width: calc(var(--spacing) * 3.5);
}
.feed-comment-item__loader-circle {
  width: calc(var(--spacing) * 3.5);
}
.feed-comment-item__check {
  width: calc(var(--spacing) * 3.5);
}
.feed-comment-item__field {
  width: 100%;
}
.feed-comment-item__block-3 {
  min-width: 0;
}
.feed-comment-item__block-3 {
  flex: 1;
}
.feed-comment-item__block-2 {
  flex-shrink: 0;
}
.feed-comment-item__loader-circle {
  animation: var(--animate-spin);
}
.feed-comment-item__button {
  cursor: pointer;
}
.feed-comment-item__button-2 {
  cursor: pointer;
}
.feed-comment-item__button-3 {
  cursor: pointer;
}
.feed-comment-item__button-4 {
  cursor: pointer;
}
.feed-comment-item__button-5 {
  cursor: pointer;
}
.feed-comment-item__field {
  resize: vertical;
}
.feed-comment-item__block-4 {
  flex-wrap: wrap;
}
.feed-comment-item__block-4 {
  align-items: center;
}
.feed-comment-item__block-6 {
  align-items: center;
}
.feed-comment-item__block-7 {
  align-items: center;
}
.feed-comment-item__button-2 {
  align-items: center;
}
.feed-comment-item__button-3 {
  align-items: center;
}
.feed-comment-item__block-8 {
  align-items: center;
}
.feed-comment-item__button-4 {
  align-items: center;
}
.feed-comment-item__button-5 {
  align-items: center;
}
.feed-comment-item__block-6 {
  justify-content: space-between;
}
.feed-comment-item__block-7 {
  gap: var(--spacing);
}
.feed-comment-item__button-2 {
  gap: var(--spacing);
}
.feed-comment-item__button-3 {
  gap: var(--spacing);
}
.feed-comment-item__block-8 {
  gap: var(--spacing);
}
.feed-comment-item__button-4 {
  gap: var(--spacing);
}
.feed-comment-item__button-5 {
  gap: var(--spacing);
}
.feed-comment-item__block {
  gap: calc(var(--spacing) * 2.5);
}
:where(.feed-comment-item__block-5>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
.feed-comment-item__block-4 {
  column-gap: calc(var(--spacing) * 2);
}
.feed-comment-item__block-4 {
  row-gap: calc(var(--spacing) * .5);
}
.feed-comment-item__button {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.feed-comment-item__text-you {
  border-radius: 3.40282e38px;
}
.feed-comment-item__field {
  border-radius: var(--radius-lg);
}
.feed-comment-item__button-2 {
  border-radius: var(--radius-lg);
}
.feed-comment-item__button-3 {
  border-radius: var(--radius-lg);
}
.feed-comment-item__button-4 {
  border-radius: var(--radius-md);
}
.feed-comment-item__button-5 {
  border-radius: var(--radius-md);
}
.feed-comment-item__block {
  border-radius: var(--radius-xl);
}
.feed-comment-item__block {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-comment-item__field {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.feed-comment-item__field {
  border-color: var(--ui-zinc-800);
}
.feed-comment-item__block {
  border-color: var(--app-border-quiet);
}
.feed-comment-item__button-3 {
  background-color: var(--color-white);
}
.feed-comment-item__text-you {
  background-color: var(--ui-zinc-800);
}
.feed-comment-item__field {
  background-color: var(--app-surface-tint);
}
.feed-comment-item__block {
  background-color: var(--app-surface-inset);
}
.feed-comment-item__field {
  padding: calc(var(--spacing) * 2.5);
}
.feed-comment-item__block {
  padding: calc(var(--spacing) * 3);
}
.feed-comment-item__text-you {
  padding-inline: calc(var(--spacing) * 1.5);
}
.feed-comment-item__button-4 {
  padding-inline: calc(var(--spacing) * 2);
}
.feed-comment-item__button-5 {
  padding-inline: calc(var(--spacing) * 2);
}
.feed-comment-item__button-2 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.feed-comment-item__button-3 {
  padding-inline: calc(var(--spacing) * 3);
}
.feed-comment-item__text-you {
  padding-block: 1px;
}
.feed-comment-item__text {
  font-family: var(--font-mono);
}
.feed-comment-item__time {
  font-family: var(--font-mono);
}
.feed-comment-item__text-6 {
  font-family: var(--font-mono);
}
.feed-comment-item__text-4 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.feed-comment-item__field {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.feed-comment-item__button {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.feed-comment-item__text-you {
  font-size: 10px;
}
.feed-comment-item__text {
  font-size: 10px;
}
.feed-comment-item__text-2 {
  font-size: 10px;
}
.feed-comment-item__text-3 {
  font-size: 10px;
}
.feed-comment-item__text-6 {
  font-size: 10px;
}
.feed-comment-item__time {
  font-size: 11px;
}
.feed-comment-item__text-5 {
  font-size: 11px;
}
.feed-comment-item__button-2 {
  font-size: 11px;
}
.feed-comment-item__button-3 {
  font-size: 11px;
}
.feed-comment-item__button-4 {
  font-size: 11px;
}
.feed-comment-item__button-5 {
  font-size: 11px;
}
.feed-comment-item__text-4 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.feed-comment-item__field {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.feed-comment-item__text-you {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-comment-item__button-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-comment-item__button-4 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-comment-item__button-5 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.feed-comment-item__button {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.feed-comment-item__button-3 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.feed-comment-item__text-you {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.feed-comment-item__text-4 {
  overflow-wrap: break-word;
}
.feed-comment-item__text-4 {
  white-space: pre-wrap;
}
.feed-comment-item__button-3 {
  color: var(--ui-black);
}
.feed-comment-item__text-5 {
  color: var(--color-red-400);
}
.feed-comment-item__button-5 {
  color: var(--color-red-400);
}
.feed-comment-item__field {
  color: var(--ui-zinc-100);
}
.feed-comment-item__button {
  color: var(--ui-zinc-200);
}
.feed-comment-item__text-4 {
  color: var(--ui-zinc-200);
}
.feed-comment-item__text-you {
  color: var(--ui-zinc-300);
}
.feed-comment-item__time {
  color: var(--ui-zinc-500);
}
.feed-comment-item__button-2 {
  color: var(--ui-zinc-500);
}
.feed-comment-item__button-4 {
  color: var(--ui-zinc-500);
}
.feed-comment-item__text {
  color: var(--ui-zinc-600);
}
.feed-comment-item__text-2 {
  color: var(--ui-zinc-600);
}
.feed-comment-item__text-3 {
  color: var(--ui-zinc-600);
}
.feed-comment-item__text-6 {
  color: var(--ui-zinc-600);
}
.feed-comment-item__text-you {
  text-transform: uppercase;
}
.feed-comment-item__time {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-comment-item__text-6 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.feed-comment-item__field::placeholder {
  color: var(--ui-zinc-600);
}
.feed-comment-item__field:focus {
  border-color: var(--ui-zinc-600);
}
.feed-comment-item__field:focus {
  --outline-style: none;
  outline-style: none;
}
.feed-comment-item__button-2:disabled {
  opacity: .5;
}
.feed-comment-item__button-3:disabled {
  opacity: .5;
}
[data-theme="light"] .feed-comment-item__text-5 {
  color: var(--app-danger);
}
[data-theme="light"] .feed-comment-item__button-5 {
  color: var(--app-danger);
}
[data-theme="light"] .feed-comment-item__text-you {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-comment-item__time {
  color: var(--app-muted);
}
[data-theme="light"] .feed-comment-item__button-2 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-comment-item__button-4 {
  color: var(--app-muted);
}
[data-theme="light"] .feed-comment-item__text {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-comment-item__text-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-comment-item__text-3 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-comment-item__text-6 {
  color: var(--app-text-soft);
}
[data-theme="light"] .feed-comment-item__button-2:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .feed-comment-item__button-4:hover {
  color: var(--app-text) !important;
}
}
}
</style>
