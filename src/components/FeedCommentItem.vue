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
  <article class="comment">
    <div class="comment__avatar" @click="openProfile">
      <RoboAvatar
        :pubkey="comment.pubkey"
        :src="avatarSrc"
        size="sm"
        rounded="xl"
        hoverable
        :alt="displayName"
      />
    </div>

    <div class="comment__body">
      <div class="comment__meta">
        <button type="button" class="comment__name" @click="openProfile">
          {{ displayName }}
        </button>
        <span v-if="mine" class="comment__you">You</span>
        <span class="comment__key">{{ shortPubkey(comment.pubkey) }}</span>
        <span class="comment__dot" aria-hidden="true">·</span>
        <time :title="fullDate(comment.createdAt)" class="comment__time">
          {{ timeAgo(comment.createdAt) }}
        </time>
        <span v-if="isEdited && !isEditing" class="comment__edited">· edited</span>
      </div>

      <p v-if="!isEditing" class="comment__text">{{ comment.text }}</p>

      <div v-else class="comment__editor">
        <textarea
          v-model="draft"
          rows="2"
          :maxlength="FEED_COMMENT_MAX_CHARS"
          class="comment__field"
          aria-label="Edit comment"
        />
        <p v-if="error" class="comment__error">{{ error }}</p>
        <div class="comment__editor-foot">
          <span class="comment__count">{{ draft.trim().length }}/{{ FEED_COMMENT_MAX_CHARS }}</span>
          <div class="comment__editor-actions">
            <button type="button" :disabled="busy" class="comment__btn" @click="cancelEdit">
              <X class="comment__btn-icon" :stroke-width="1.9" aria-hidden="true" />
              <span>Cancel</span>
            </button>
            <button type="button" :disabled="busy" class="comment__btn comment__btn--ink" @click="submitEdit">
              <LoaderCircle v-if="busy" class="comment__btn-icon comment__btn-icon--spin" aria-hidden="true" />
              <Check v-else class="comment__btn-icon" :stroke-width="2.2" aria-hidden="true" />
              <span>Save</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="mine && !isEditing" class="comment__owner-actions">
        <button type="button" class="comment__action" @click="startEdit">
          <Pencil class="comment__action-icon" :stroke-width="1.9" aria-hidden="true" />
          <span>Edit</span>
        </button>
        <button type="button" class="comment__action comment__action--danger" @click="emit('delete', comment)">
          <Trash2 class="comment__action-icon" :stroke-width="1.9" aria-hidden="true" />
          <span>Delete</span>
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* Ledger pass: each comment is a ruled row in the thread sheet. */

.comment {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
}

.comment + .comment {
  border-top: 1px solid var(--app-border);
}

.comment__avatar {
  flex-shrink: 0;
  cursor: pointer;
}

.comment__body {
  flex: 1;
  min-width: 0;
}

.comment__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 6px;
}

.comment__name {
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.comment__you {
  padding: 0 4px;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 7.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.comment__key,
.comment__time,
.comment__edited {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
}

.comment__dot {
  color: var(--app-border-strong);
}

.comment__text {
  margin: 5px 0 0;
  font-size: 12.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  color: var(--app-text-soft);
  overflow-wrap: anywhere;
}

/* ---- Editor ---- */

.comment__editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.comment__field {
  width: 100%;
  min-height: 64px;
  padding: 9px 11px;
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

.comment__field:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.comment__error {
  margin: 0;
  font-size: 10.5px;
  color: var(--app-danger);
}

.comment__editor-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.comment__count {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.comment__editor-actions {
  display: inline-flex;
  gap: 4px;
}

.comment__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 28px;
  padding-inline: 9px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.comment__btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.comment__btn--ink {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.comment__btn-icon {
  width: 10px;
  height: 10px;
}

.comment__btn-icon--spin {
  animation: spin 1s linear infinite;
}

/* ---- Owner actions ---- */

.comment__owner-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
}

.comment__action {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition: color var(--app-dur-fast) var(--app-ease-standard);
}

.comment__action--danger {
  color: color-mix(in oklab, var(--app-danger) 74%, var(--app-muted));
}

.comment__action-icon {
  width: 9px;
  height: 9px;
}

@media (hover: hover) {
  .comment__name:hover {
    color: var(--app-primary);
  }

  .comment__btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .comment__btn--ink:hover {
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .comment__action:hover {
    color: var(--app-text);
  }

  .comment__action--danger:hover {
    color: var(--app-danger);
  }
}

@media (pointer: coarse) {
  .comment__btn,
  .comment__action {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .comment__name,
  .comment__field,
  .comment__btn,
  .comment__action {
    transition: none;
  }
}
</style>
