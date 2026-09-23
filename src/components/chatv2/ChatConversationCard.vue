<script setup>
import { Pin, ShieldCheck, Users } from "@lucide/vue";
import RoboAvatar from "@/components/RoboAvatar.vue";

const props = defineProps({
  conv: { type: Object, required: true },
  active: { type: Boolean, default: false },
});

const emit = defineEmits(["select", "toggle-pin"]);
</script>

<template>
  <article
    @click="emit('select', conv)"
    class="group relative flex h-10 sm:h-10.5 cursor-pointer items-center gap-2.5 sm:gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2.5 sm:px-3 transition-colors duration-150 hover:border-zinc-700 hover:bg-zinc-900/40 select-none min-w-0"
    :class="active ? 'border-zinc-600 bg-zinc-900/70 ring-1 ring-zinc-700/60' : ''"
  >
    <!-- Avatar with overlay indicators -->
    <div class="relative shrink-0">
      <div
        class="flex h-6.5 w-6.5 sm:h-7 sm:w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 overflow-hidden"
      >
        <RoboAvatar
          v-if="!conv.isGroup && conv.peerPubkey"
          :pubkey="conv.peerPubkey"
          :src="conv.avatarSrc"
          size="sm"
          rounded="xl"
        />
        <RoboAvatar
          v-else
          :src="conv.avatarSrc"
          :pubkey="conv.avatarKey || conv.id"
          size="sm"
          rounded="xl"
        />
      </div>

      <!-- Group overlay badge -->
      <span
        v-if="conv.isGroup"
        class="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-xs border border-zinc-800 bg-zinc-900 text-zinc-400 shadow-xs"
        title="Group chat"
      >
        <Users class="h-2 w-2" :stroke-width="2" />
      </span>
    </div>

    <!-- 1-Line Conversation Row: [username] [timeago] [msg] [pin/unread] -->
    <div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
      <!-- [username] -->
      <div class="flex items-center gap-1.5 w-24 sm:w-40 shrink-0 min-w-0">
        <h2
          class="truncate text-xs sm:text-sm font-medium tracking-tight text-zinc-200 group-hover:text-white transition-colors"
        >
          {{ conv.displayName }}
        </h2>
        <ShieldCheck
          v-if="!conv.isGroup && conv.isTrusted"
          class="h-3 w-3 shrink-0 text-emerald-400"
          title="Trusted Contact"
        />
      </div>

      <!-- [timeago] -->
      <span
        class="shrink-0 font-mono text-[10px] sm:text-[11px] tracking-tight tabular-nums text-zinc-500 w-10 sm:w-14 text-left"
        :class="conv.unreadCount ? 'text-zinc-300 font-medium' : ''"
      >
        {{ conv.ageLabel || "" }}
      </span>

      <!-- [msg] -->
      <p
        class="truncate text-xs leading-none min-w-0 flex-1"
        :class="
          conv.unreadCount ? 'text-zinc-200 font-medium' : 'text-zinc-400 group-hover:text-zinc-300'
        "
      >
        <span v-if="conv.lastMessageMine" class="text-zinc-500 font-normal">You: </span>
        {{ conv.secondaryLabel || "No messages yet" }}
      </p>

      <!-- Pin and Unread Badges -->
      <div class="flex items-center gap-1.5 shrink-0 ml-auto" @click.stop>
        <!-- Pin button -->
        <button
          type="button"
          class="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
          :class="conv.pinned ? 'text-zinc-300 opacity-100' : 'opacity-0 group-hover:opacity-100'"
          :title="conv.pinned ? 'Unpin chat' : 'Pin chat'"
          @click="emit('toggle-pin', conv.id)"
        >
          <Pin class="h-3 w-3" :class="conv.pinned ? 'fill-current' : ''" :stroke-width="2" />
        </button>

        <!-- Unread Badge -->
        <span
          v-if="conv.unreadCount > 0"
          class="flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1.5 font-mono text-[10px] font-semibold text-black shadow-xs"
        >
          {{ conv.unreadCount > 99 ? "99+" : conv.unreadCount }}
        </span>
      </div>
    </div>
  </article>
</template>
