<script setup>
import { useRouter } from "vue-router";
import { Phone, Video, ShieldCheck, Users } from "@lucide/vue";

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
    class="flex h-11 sm:h-12 shrink-0 items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-950/80 px-3 backdrop-blur-md sm:px-4 md:px-5"
  >
    <!-- Left: 1-Line Info Row [Username] [Trust] [Timeago] -->
    <div class="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
      <!-- 1. [username] -->
      <div class="shrink-0 min-w-0 max-w-[140px] sm:max-w-[220px]">
        <button
          v-if="!isGroup && peerPubkey"
          type="button"
          @click="handleProfileClick"
          class="truncate block text-xs sm:text-sm font-medium tracking-tight text-white hover:text-zinc-300 transition-colors cursor-pointer text-left focus:outline-none"
          :title="'View ' + title + ' profile'"
        >
          {{ title || "Conversation" }}
        </button>
        <span
          v-else
          class="truncate block text-xs sm:text-sm font-medium tracking-tight text-white"
        >
          {{ title || (isGroup ? "Group" : "Conversation") }}
        </span>
      </div>

      <!-- 2. [trust] -->
      <div v-if="!isGroup && peerPubkey" class="flex items-center shrink-0">
        <span
          v-if="isTrusted"
          class="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-400"
          title="Trusted Contact"
        >
          <ShieldCheck class="h-3.5 w-3.5 shrink-0" />
          <span class="hidden sm:inline">trusted</span>
        </span>

        <!-- Trust progress dots until calls unlock -->
        <span
          v-else
          class="flex items-center gap-1 shrink-0"
          title="Messages sent towards unlocking call feature"
        >
          <span
            v-for="i in 7"
            :key="i"
            class="h-1.5 w-1.5 rounded-full"
            :class="i <= sentCount ? 'bg-emerald-400' : 'bg-zinc-700'"
          />
        </span>
      </div>

      <!-- 3. [timeago / status] -->
      <div
        class="flex items-center gap-1.5 font-mono text-[10px] sm:text-[11px] text-zinc-400 truncate min-w-0"
      >
        <template v-if="!isGroup">
          <span
            v-if="lastSeenLoading"
            class="inline-flex items-center gap-1.5 text-zinc-500 truncate"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-pulse shrink-0" />
            checking…
          </span>
          <span v-else class="inline-flex items-center gap-1.5 truncate">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span class="truncate">{{ lastSeenLabel || "Encrypted Direct Message" }}</span>
          </span>
        </template>
        <template v-else>
          <span class="truncate">{{ memberCount }} member{{ memberCount !== 1 ? "s" : "" }}</span>
        </template>
      </div>
    </div>

    <!-- Right: Call & Group Actions -->
    <div class="flex items-center gap-1.5 shrink-0">
      <!-- DM Call Actions (CRITICAL: ONLY unlocked for trusted contacts per AGENTS.md) -->
      <template v-if="!isGroup && isTrusted">
        <button
          type="button"
          @click="emit('start-audio-call')"
          :disabled="!canStartCall"
          class="inline-flex h-7.5 w-7.5 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-40 cursor-pointer"
          title="Start Audio Call"
        >
          <Phone class="h-3.5 w-3.5" :stroke-width="1.8" />
        </button>

        <button
          type="button"
          @click="emit('start-video-call')"
          :disabled="!canStartCall"
          class="inline-flex h-7.5 w-7.5 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-40 cursor-pointer"
          title="Start Video Call"
        >
          <Video class="h-3.5 w-3.5" :stroke-width="1.8" />
        </button>
      </template>

      <!-- Group Actions -->
      <template v-if="isGroup">
        <button
          type="button"
          @click="emit('start-group-call')"
          class="inline-flex h-7.5 w-7.5 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white cursor-pointer"
          title="Group Call"
        >
          <Phone class="h-3.5 w-3.5" :stroke-width="1.8" />
        </button>

        <button
          type="button"
          @click="emit('toggle-drawer')"
          class="inline-flex h-7.5 w-7.5 sm:h-8 sm:w-8 items-center justify-center rounded-lg border transition-colors cursor-pointer"
          :class="
            drawerOpen
              ? 'bg-zinc-800 text-white border-zinc-700'
              : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white'
          "
          title="Group Members"
        >
          <Users class="h-3.5 w-3.5" :stroke-width="1.8" />
        </button>
      </template>
    </div>
  </div>
</template>
