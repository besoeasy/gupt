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
    class="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-950/80 px-3 backdrop-blur-md sm:px-4 md:px-5"
  >
    <!-- Left: Back Button + Avatar + Title & Status -->
    <div class="flex items-center gap-3 min-w-0">
      <!-- Back button -->
      <button
        type="button"
        @click="emit('back')"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white cursor-pointer"
        title="Back to conversations"
        aria-label="Back to conversations"
      >
        <ArrowLeft class="h-4 w-4" :stroke-width="1.8" />
      </button>

      <!-- Avatar -->
      <button
        v-if="!isGroup && peerPubkey"
        type="button"
        @click="handleProfileClick"
        class="shrink-0 overflow-hidden rounded-lg border border-zinc-800 focus:outline-none"
        :title="'View ' + title + ' profile'"
      >
        <RoboAvatar :pubkey="peerPubkey" :src="peerAvatar" size="sm" :hoverable="true" />
      </button>
      <div v-else class="shrink-0 overflow-hidden rounded-lg border border-zinc-800">
        <RoboAvatar :src="groupAvatar" size="sm" />
      </div>

      <!-- Title & Subtitle -->
      <div class="min-w-0 flex-1 leading-tight">
        <div
          class="flex items-center gap-1.5 font-medium text-sm tracking-tight text-white truncate"
        >
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
              :class="i <= sentCount ? 'bg-emerald-400' : 'bg-zinc-700'"
            />
          </span>
        </div>

        <!-- Status / Subtitle line -->
        <p class="text-[11px] font-mono text-zinc-400 truncate mt-0.5">
          <template v-if="!isGroup">
            <span v-if="lastSeenLoading" class="inline-flex items-center gap-1">
              <span class="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-pulse" />
              checking…
            </span>
            <span v-else class="inline-flex items-center gap-1.5">
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
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-emerald-400"
          title="Trusted Contact"
        >
          <ShieldCheck class="h-4 w-4" :stroke-width="1.8" />
        </span>

        <button
          type="button"
          @click="emit('start-audio-call')"
          :disabled="!canStartCall"
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-40 cursor-pointer"
          title="Start Audio Call"
        >
          <Phone class="h-3.5 w-3.5" :stroke-width="1.8" />
        </button>

        <button
          type="button"
          @click="emit('start-video-call')"
          :disabled="!canStartCall"
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-40 cursor-pointer"
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
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white cursor-pointer"
          title="Group Call"
        >
          <Phone class="h-3.5 w-3.5" :stroke-width="1.8" />
        </button>

        <button
          type="button"
          @click="emit('toggle-drawer')"
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors cursor-pointer"
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
