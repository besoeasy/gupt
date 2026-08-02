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
  <div
    @click="emit('select', conv)"
    class="group relative flex cursor-pointer items-center gap-3.5 rounded-lg px-3.5 py-3 transition-all duration-150 select-none"
    :class="
      active
        ? 'bg-(--app-primary-soft) text-(--app-text) border border-[color-mix(in_srgb,var(--app-primary)_40%,transparent)]'
        : 'bg-(--app-surface-soft) hover:bg-(--app-surface-hover) text-(--app-text) border border-transparent'
    "
  >
    <!-- Avatar -->
    <div class="relative shrink-0">
      <RoboAvatar
        v-if="!conv.isGroup && conv.peerPubkey"
        :pubkey="conv.peerPubkey"
        :src="conv.avatarSrc"
        size="md"
      />
      <RoboAvatar v-else :src="conv.avatarSrc" :pubkey="conv.avatarKey || conv.id" size="md" />
      <!-- Group overlay badge on avatar -->
      <span
        v-if="conv.isGroup"
        class="absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-(--app-border) bg-(--app-surface) text-(--app-muted)"
        title="Group chat"
      >
        <Users class="h-2.5 w-2.5" :stroke-width="2.2" />
      </span>
    </div>

    <!-- Details -->
    <div class="min-w-0 flex-1 leading-tight">
      <div class="flex items-center justify-between gap-1.5 mb-1">
        <span class="flex items-center gap-1.5 truncate text-sm font-semibold">
          <span class="truncate">{{ conv.displayName }}</span>
          <ShieldCheck
            v-if="!conv.isGroup && conv.isTrusted"
            class="h-3.5 w-3.5 shrink-0 text-emerald-400"
            title="Trusted Contact"
          />
        </span>
        <span
          v-if="conv.ageLabel"
          class="shrink-0 text-[11px] font-medium"
          :class="conv.unreadCount ? 'text-(--app-primary) font-bold' : 'text-(--app-muted)'"
        >
          {{ conv.ageLabel }}
        </span>
      </div>

      <div class="flex items-center justify-between gap-2">
        <p
          class="truncate text-xs"
          :class="conv.unreadCount ? 'font-medium text-(--app-text)' : 'text-(--app-muted)'"
        >
          <span v-if="conv.lastMessageMine" class="text-(--app-muted)">You: </span>
          {{ conv.secondaryLabel || "No messages yet" }}
        </p>

        <div class="flex items-center gap-1.5 shrink-0">
          <!-- Pin button / indicator -->
          <button
            type="button"
            @click.stop="emit('toggle-pin', conv.id)"
            class="rounded-lg p-1 text-(--app-muted) transition-all hover:bg-(--app-surface) hover:text-(--app-text) group-hover:opacity-100"
            :class="conv.pinned ? 'opacity-100 text-(--app-primary)' : 'opacity-0'"
            :title="conv.pinned ? 'Unpin chat' : 'Pin chat'"
          >
            <Pin class="h-3.5 w-3.5" :class="conv.pinned ? 'fill-current' : ''" :stroke-width="2" />
          </button>

          <!-- Unread Badge -->
          <span
            v-if="conv.unreadCount > 0"
            class="flex h-5 min-w-5 items-center justify-center rounded-full bg-(--app-primary) px-1.5 text-[10px] font-bold text-zinc-950 shadow-sm"
          >
            {{ conv.unreadCount > 99 ? "99+" : conv.unreadCount }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
