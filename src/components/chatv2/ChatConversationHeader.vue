<script setup>
import { useRouter } from "vue-router";
import { Bell, Check, Phone, Video, ShieldCheck, Users, Info, Timer } from "@lucide/vue";

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
  relayEventCount: { type: Number, default: null },
  syncParityLabel: { type: String, default: "" },
  timerLabel: { type: String, default: "" },
  canPing: { type: Boolean, default: false },
  pingLabel: { type: String, default: "" },
  pingSent: { type: Boolean, default: false },
  pingCooldown: { type: Boolean, default: false },
  pingSending: { type: Boolean, default: false },
});

const emit = defineEmits([
  "back",
  "start-audio-call",
  "start-video-call",
  "ping",
  "toggle-drawer",
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
    class="grid h-12 sm:h-14 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-zinc-800/80 bg-zinc-950/80 px-3 backdrop-blur-md sm:px-4 md:px-5"
  >
    <!-- Left: Spacing placeholder -->
    <div class="w-2" />

    <!-- Center: 1-Line Info Row [Username] [Trust] [Timeago / Live Status] -->
    <div
      class="flex items-center justify-center gap-2 sm:gap-3 min-w-0 max-w-[340px] sm:max-w-[460px] mx-auto cursor-pointer"
      @click="emit('toggle-drawer')"
      title="View enriched relay details"
    >
      <!-- 1. [username] -->
      <div class="shrink-0 min-w-0 max-w-[130px] sm:max-w-[200px]">
        <button
          v-if="!isGroup && peerPubkey"
          type="button"
          @click.stop="handleProfileClick"
          class="truncate block text-xs sm:text-sm font-medium tracking-tight text-white hover:text-emerald-300 transition-colors cursor-pointer text-left focus:outline-none"
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

      <!-- 3. [timeago / live relay status] -->
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
            <span class="truncate">{{ lastSeenLabel || "Encrypted DM" }}</span>
          </span>
        </template>
        <template v-else>
          <span class="truncate">{{ memberCount }} member{{ memberCount !== 1 ? "s" : "" }}</span>
        </template>

        <span
          v-if="!isGroup && timerLabel"
          class="inline-flex items-center gap-1 shrink-0 font-mono text-[10px] text-zinc-500"
          :title="`Messages disappear after ${timerLabel}`"
        >
          <Timer class="h-3 w-3" :stroke-width="1.8" />
          {{ timerLabel }}
        </span>

        <span
          v-if="relayEventCount !== null"
          class="hidden md:inline-flex items-center font-mono text-[10px] text-zinc-500"
        >
          · {{ relayEventCount }} ev
        </span>
      </div>
    </div>

    <!-- Right: Ping, Call & Info Drawer Toggle (>=44px touch targets) -->
    <div class="flex items-center justify-end gap-1 shrink-0">
      <!-- Wake the contact through ntfy when their app is closed. Lives here,
           next to the other per-conversation actions, instead of a full-width
           bar above the composer. -->
      <button
        v-if="canPing"
        type="button"
        @click="emit('ping')"
        :disabled="pingCooldown || pingSending"
        class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg border px-2 transition-colors cursor-pointer disabled:cursor-not-allowed sm:px-2.5"
        :class="
          pingSent
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
            : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white'
        "
        :title="pingLabel || 'Ping · wake them via ntfy'"
        :aria-label="pingLabel || 'Ping · wake them via ntfy'"
        :aria-busy="pingSending"
      >
        <Check v-if="pingSent" class="h-4 w-4" :stroke-width="2.2" aria-hidden="true" />
        <Bell v-else class="h-4 w-4" :stroke-width="1.8" aria-hidden="true" />
        <span class="hidden font-mono text-[11px] sm:inline">
          {{ pingSent ? "Pinged" : "Ping" }}
        </span>
      </button>

      <!-- DM Call Actions (ONLY unlocked for trusted contacts per AGENTS.md) -->
      <template v-if="!isGroup && isTrusted">
        <button
          type="button"
          @click="emit('start-audio-call')"
          :disabled="!canStartCall"
          class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-40 cursor-pointer"
          title="Start Audio Call"
        >
          <Phone class="h-4 w-4" :stroke-width="1.8" />
        </button>

        <button
          type="button"
          @click="emit('start-video-call')"
          :disabled="!canStartCall"
          class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-40 cursor-pointer"
          title="Start Video Call"
        >
          <Video class="h-4 w-4" :stroke-width="1.8" />
        </button>
      </template>

      <!-- Details & Telemetry Drawer Toggle Button -->
      <button
        type="button"
        @click="emit('toggle-drawer')"
        class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border transition-colors cursor-pointer"
        :class="
          drawerOpen
            ? 'bg-zinc-800 text-emerald-400 border-zinc-700'
            : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white'
        "
        :title="isGroup ? 'Group Members & Telemetry' : 'Contact & Relay Telemetry'"
      >
        <Users v-if="isGroup" class="h-4 w-4" :stroke-width="1.8" />
        <Info v-else class="h-4 w-4" :stroke-width="1.8" />
      </button>
    </div>
  </div>
</template>
