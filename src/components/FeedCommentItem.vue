<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { Check, Loader2, Pencil, Trash2, X } from "@lucide/vue";
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
  <div class="flex gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
    <div class="shrink-0" @click="openProfile">
      <RoboAvatar
        :pubkey="comment.pubkey"
        :src="avatarSrc"
        size="sm"
        rounded="xl"
        hoverable
        :alt="displayName"
      />
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <button
          type="button"
          class="truncate text-xs font-semibold text-zinc-200 hover:text-white hover:underline cursor-pointer"
          @click="openProfile"
        >
          {{ displayName }}
        </button>
        <span
          v-if="mine"
          class="rounded-full bg-zinc-800 px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-zinc-300"
        >
          You
        </span>
        <span class="font-mono text-[10px] text-zinc-600">{{ shortPubkey(comment.pubkey) }}</span>
        <span aria-hidden="true" class="text-[10px] text-zinc-600">·</span>
        <time
          :title="fullDate(comment.createdAt)"
          class="font-mono text-[11px] tabular-nums text-zinc-500"
        >
          {{ timeAgo(comment.createdAt) }}
        </time>
        <span v-if="isEdited && !isEditing" class="text-[10px] text-zinc-600">· edited</span>
      </div>

      <p
        v-if="!isEditing"
        class="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap text-zinc-200"
      >
        {{ comment.text }}
      </p>

      <div v-else class="mt-2 space-y-2">
        <textarea
          v-model="draft"
          rows="2"
          :maxlength="FEED_COMMENT_MAX_CHARS"
          class="block w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none resize-y"
        />
        <p v-if="error" class="text-[11px] text-red-400">{{ error }}</p>
        <div class="flex items-center justify-between">
          <span class="font-mono text-[10px] tabular-nums text-zinc-600">
            {{ draft.trim().length }}/{{ FEED_COMMENT_MAX_CHARS }}
          </span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              :disabled="busy"
              class="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-200 disabled:opacity-50 cursor-pointer"
              @click="cancelEdit"
            >
              <X class="h-3.5 w-3.5" />
              <span>Cancel</span>
            </button>
            <button
              type="button"
              :disabled="busy"
              class="inline-flex h-8 items-center gap-1 rounded-lg bg-white px-3 text-[11px] font-semibold text-black hover:bg-zinc-200 disabled:opacity-50 cursor-pointer"
              @click="submitEdit"
            >
              <Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin" />
              <Check v-else class="h-3.5 w-3.5" />
              <span>Save</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="mine && !isEditing" class="mt-1.5 flex items-center gap-1">
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-zinc-500 hover:text-zinc-200 cursor-pointer"
          @click="startEdit"
        >
          <Pencil class="h-3 w-3" />
          <span>Edit</span>
        </button>
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-red-400 hover:bg-red-500/10 cursor-pointer"
          @click="emit('delete', comment)"
        >
          <Trash2 class="h-3 w-3" />
          <span>Delete</span>
        </button>
      </div>
    </div>
  </div>
</template>
