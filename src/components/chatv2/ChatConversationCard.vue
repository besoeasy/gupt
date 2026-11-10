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
    class="chat-row group relative flex min-w-0 cursor-pointer select-none items-center gap-3 px-2 py-2.5"
    :class="[active ? 'is-active' : '', conv.unreadCount ? 'chat-row-unread' : '']"
  >
    <!-- Avatar with overlay indicators & hover pin button -->
    <div class="relative shrink-0">
      <div
        class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
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

      <!-- Pinned badge indicator (visible when pinned and not hovering) -->
      <span
        v-if="conv.pinned"
        class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-white shadow-xs transition-opacity duration-150 group-hover:opacity-0"
        title="Pinned chat"
      >
        <Pin class="h-2.5 w-2.5 fill-current" :stroke-width="2" />
      </span>

      <!-- Group overlay badge -->
      <span
        v-if="conv.isGroup"
        class="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 shadow-xs transition-opacity group-hover:opacity-0"
        title="Group chat"
      >
        <Users class="h-2.5 w-2.5" :stroke-width="2" />
      </span>

      <!-- Pin action button overlay on avatar on hover -->
      <button
        type="button"
        class="absolute inset-0 pointer-events-none flex items-center justify-center rounded-xl bg-black/75 text-zinc-300 opacity-0 hover:text-white transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 cursor-pointer backdrop-blur-[1px]"
        :title="conv.pinned ? 'Unpin chat' : 'Pin chat'"
        @click.stop="emit('toggle-pin', conv.id)"
      >
        <Pin
          class="h-4 w-4 transition-transform hover:scale-110 active:scale-95"
          :class="conv.pinned ? 'fill-current text-white' : ''"
          :stroke-width="2.2"
        />
      </button>
    </div>

    <!-- 2-Line Conversation Details -->
    <div class="min-w-0 flex-1 space-y-0.5">
      <!-- Line 1: Name, Trust Badge & Time -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 min-w-0">
          <h2
            class="truncate text-[13px] font-semibold tracking-tight transition-colors"
            :class="conv.unreadCount ? 'text-zinc-100' : 'text-zinc-200 group-hover:text-white'"
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
          class="shrink-0 font-mono text-[10px] tabular-nums transition-colors"
          :class="conv.unreadCount ? 'text-zinc-300' : 'text-zinc-500'"
        >
          {{ conv.ageLabel }}
        </span>
      </div>

      <!-- Line 2: Message Preview & Unread Badge -->
      <div class="flex items-center justify-between gap-3">
        <p
          class="truncate text-xs leading-relaxed min-w-0 flex-1"
          :class="
            conv.unreadCount
              ? 'text-zinc-300 font-medium'
              : 'text-zinc-500 group-hover:text-zinc-400'
          "
        >
          <span v-if="conv.lastMessageMine" class="text-zinc-600 font-normal">You: </span>
          {{ conv.secondaryLabel || "No messages yet" }}
        </p>

        <!-- Unread Badge -->
        <span
          v-if="conv.unreadCount > 0"
          class="app-badge-pop chat-unread-badge flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold shadow-xs shrink-0"
        >
          {{ conv.unreadCount > 99 ? "99+" : conv.unreadCount }}
        </span>
      </div>
    </div>
  </article>
</template>
