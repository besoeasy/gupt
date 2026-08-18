<script setup>
import { useRouter } from "vue-router";
import { ArrowLeft, Phone, Video, ShieldCheck, Users } from "@lucide/vue";
import RoboAvatar from "@/components/RoboAvatar.vue";

const props = defineProps({
  isGroup: { type: Boolean, default: false },
  title: { type: String, default: "" },
  peerPubkey: { type: String, default: "" },
  peerAvatar: { type: String, default: "" },
  groupAvatar: { type: String, default: "" },
  lastSeenLabel: { type: String, default: "" },
  lastSeenLoading: { type: Boolean, default: false },
  sentCount: { type: Number, default: 0 },
  isTrusted: { type: Boolean, default: false },
  memberCount: { type: Number, default: 0 },
  drawerOpen: { type: Boolean, default: false },
  canStartCall: { type: Boolean, default: false },
});

const emit = defineEmits([
  "back",
  "start-audio-call",
  "start-video-call",
  "start-group-call",
  "toggle-drawer",
  "open-profile",
]);

const router = useRouter();

function handleProfileClick() {
  if (props.peerPubkey) {
    router.push(`/profile/${props.peerPubkey}`);
  }
}
</script>

<template>
  <div
    class="flex min-h-16 shrink-0 items-center justify-between gap-3 px-3 py-2.5 sm:px-4 md:px-5"
  >
    <!-- Left: Back Button + Avatar + Title & Status -->
    <div class="flex items-center gap-3 min-w-0">
      <!-- Back button -->
      <button
        type="button"
        @click="emit('back')"
        class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) transition-all hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) active:scale-95 cursor-pointer"
        title="Back to conversations"
        aria-label="Back to conversations"
      >
        <ArrowLeft class="h-4 w-4" :stroke-width="2" />
      </button>

      <!-- Avatar -->
      <button
        v-if="!isGroup && peerPubkey"
        type="button"
        @click="handleProfileClick"
        class="shrink-0 focus:outline-none"
        :title="'View ' + title + ' profile'"
      >
        <RoboAvatar :pubkey="peerPubkey" :src="peerAvatar" size="sm" :hoverable="true" />
      </button>
      <div v-else class="shrink-0">
        <RoboAvatar :src="groupAvatar" size="sm" />
      </div>

      <!-- Title & Subtitle -->
      <div class="min-w-0 flex-1 leading-tight">
        <div class="flex items-center gap-1.5 font-bold text-sm truncate">
          <span class="truncate">{{ title || (isGroup ? "Group" : "Conversation") }}</span>

          <!-- Trust progress dots until calls unlock -->
          <span
            v-if="!isGroup && peerPubkey && !isTrusted"
            class="flex items-center gap-0.5"
            title="Messages sent towards unlocking call feature"
          >
            <span
              v-for="i in 7"
              :key="i"
              class="h-1.5 w-1.5 rounded-full"
              :class="i <= sentCount ? 'bg-emerald-400' : 'bg-zinc-600/50'"
            />
          </span>
        </div>

        <!-- Status / Subtitle line -->
        <p class="text-[11px] text-(--app-muted) truncate mt-0.5">
          <template v-if="!isGroup">
            <span v-if="lastSeenLoading" class="inline-flex items-center gap-1">
              <span class="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-pulse" />
              checking…
            </span>
            <span v-else class="inline-flex items-center gap-1">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {{ lastSeenLabel || "Encrypted Direct Message" }}
            </span>
          </template>
          <template v-else> {{ memberCount }} member{{ memberCount !== 1 ? "s" : "" }} </template>
        </p>
      </div>
    </div>

    <!-- Right: Call & Group Actions -->
    <div class="flex items-center gap-1.5 shrink-0">
      <!-- DM Call Actions (CRITICAL: ONLY unlocked for trusted contacts per AGENTS.md) -->
      <template v-if="!isGroup && isTrusted">
        <span
          class="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-emerald-400"
          title="Trusted Contact"
        >
          <ShieldCheck class="h-4 w-4" :stroke-width="1.9" />
        </span>

        <button
          type="button"
          @click="emit('start-audio-call')"
          :disabled="!canStartCall"
          class="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) transition-all hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-40 active:scale-95"
          title="Start Audio Call"
        >
          <Phone class="h-4 w-4" :stroke-width="1.9" />
        </button>

        <button
          type="button"
          @click="emit('start-video-call')"
          :disabled="!canStartCall"
          class="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) transition-all hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-40 active:scale-95"
          title="Start Video Call"
        >
          <Video class="h-4 w-4" :stroke-width="1.9" />
        </button>
      </template>

      <!-- Group Actions -->
      <template v-if="isGroup">
        <button
          type="button"
          @click="emit('start-group-call')"
          class="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) transition-all hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) active:scale-95"
          title="Group Call"
        >
          <Phone class="h-4 w-4" :stroke-width="1.9" />
        </button>

        <button
          type="button"
          @click="emit('toggle-drawer')"
          class="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-(--app-border) transition-all active:scale-95"
          :class="
            drawerOpen
              ? 'bg-(--app-surface-hover) text-(--app-text) border-(--app-border-strong)'
              : 'bg-(--app-surface-soft) text-(--app-text-soft) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
          "
          title="Group Members"
        >
          <Users class="h-4 w-4" :stroke-width="1.9" />
        </button>
      </template>
    </div>
  </div>
</template>
