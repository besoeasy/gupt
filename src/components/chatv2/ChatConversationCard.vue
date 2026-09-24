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
    class="group relative flex cursor-pointer items-center gap-3 sm:gap-3.5 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 sm:p-3.5 transition-colors duration-150 hover:border-zinc-700 hover:bg-zinc-900/40 select-none min-w-0"
    :class="active ? 'border-zinc-600 bg-zinc-900/70 ring-1 ring-zinc-700/60' : ''"
  >
    <!-- Avatar with overlay indicators -->
    <div class="relative shrink-0">
      <div
        class="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden"
      >
        <RoboAvatar
          v-if="!conv.isGroup && conv.peerPubkey"
          :pubkey="conv.peerPubkey"
          :src="conv.avatarSrc"
          size="md"
          rounded="xl"
        />
        <RoboAvatar
          v-else
          :src="conv.avatarSrc"
          :pubkey="conv.avatarKey || conv.id"
          size="md"
          rounded="xl"
        />
      </div>

      <!-- Group overlay badge -->
      <span
        v-if="conv.isGroup"
        class="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 shadow-xs"
        title="Group chat"
      >
        <Users class="h-2.5 w-2.5" :stroke-width="2" />
      </span>
    </div>

    <!-- 2-Line Conversation Details -->
    <div class="min-w-0 flex-1 space-y-1">
      <!-- Line 1: Name, Trust Badge & Time -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 min-w-0">
          <h2
            class="truncate text-xs sm:text-sm font-semibold tracking-tight text-zinc-200 group-hover:text-white transition-colors"
          >
            {{ conv.displayName }}
          </h2>
          <ShieldCheck
            v-if="!conv.isGroup && conv.isTrusted"
            class="h-3.5 w-3.5 shrink-0 text-emerald-400"
            title="Trusted Contact"
          />
        </div>

        <span
          v-if="conv.ageLabel"
          class="shrink-0 font-mono text-[10px] sm:text-[11px] tabular-nums transition-colors"
          :class="conv.unreadCount ? 'text-zinc-200 font-medium' : 'text-zinc-500'"
        >
          {{ conv.ageLabel }}
        </span>
      </div>

      <!-- Line 2: Message Preview & Action Badges -->
      <div class="flex items-center justify-between gap-3">
        <p
          class="truncate text-xs leading-relaxed min-w-0 flex-1"
          :class="
            conv.unreadCount
              ? 'text-zinc-200 font-medium'
              : 'text-zinc-400 group-hover:text-zinc-300'
          "
        >
          <span v-if="conv.lastMessageMine" class="text-zinc-500 font-normal">You: </span>
          {{ conv.secondaryLabel || "No messages yet" }}
        </p>

        <!-- Pin and Unread Badges -->
        <div class="flex items-center gap-1.5 shrink-0" @click.stop>
          <!-- Pin button -->
          <button
            type="button"
            class="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
            :class="conv.pinned ? 'text-zinc-300 opacity-100' : 'opacity-0 group-hover:opacity-100'"
            :title="conv.pinned ? 'Unpin chat' : 'Pin chat'"
            @click="emit('toggle-pin', conv.id)"
          >
            <Pin
              class="h-3 w-3 sm:h-3.5 sm:w-3.5"
              :class="conv.pinned ? 'fill-current' : ''"
              :stroke-width="2"
            />
          </button>

          <!-- Unread Badge -->
          <span
            v-if="conv.unreadCount > 0"
            class="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-white px-1.5 font-mono text-[10px] font-semibold text-black shadow-xs"
          >
            {{ conv.unreadCount > 99 ? "99+" : conv.unreadCount }}
          </span>
        </div>
      </div>
    </div>
  </article>
</template>
