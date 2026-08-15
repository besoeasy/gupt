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
    class="group relative flex cursor-pointer items-center gap-4 rounded-2xl border border-(--app-border) bg-(--app-surface) p-4 sm:p-4.5 shadow-xs transition-all duration-200 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover)/40 select-none"
    :class="
      active
        ? 'border-(--app-primary)/50 bg-(--app-primary)/5 ring-1 ring-(--app-primary)/30'
        : ''
    "
  >
    <!-- Avatar with overlay indicators -->
    <div class="relative shrink-0">
      <div
        class="flex h-12 w-12 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) overflow-hidden"
      >
        <RoboAvatar
          v-if="!conv.isGroup && conv.peerPubkey"
          :pubkey="conv.peerPubkey"
          :src="conv.avatarSrc"
          size="md"
        />
        <RoboAvatar v-else :src="conv.avatarSrc" :pubkey="conv.avatarKey || conv.id" size="md" />
      </div>

      <!-- Group overlay badge -->
      <span
        v-if="conv.isGroup"
        class="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-(--app-border) bg-(--app-surface) text-(--app-muted) shadow-xs"
        title="Group chat"
      >
        <Users class="h-3 w-3" :stroke-width="2.2" />
      </span>
    </div>

    <!-- Conversation Details -->
    <div class="min-w-0 flex-1 space-y-1">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 min-w-0">
          <h2
            class="truncate text-sm sm:text-base font-bold text-(--app-text) group-hover:text-(--app-primary) transition-colors"
          >
            {{ conv.displayName }}
          </h2>
          <ShieldCheck
            v-if="!conv.isGroup && conv.isTrusted"
            class="h-4 w-4 shrink-0 text-emerald-400"
            title="Trusted Contact"
          />
        </div>

        <span
          v-if="conv.ageLabel"
          class="shrink-0 text-xs font-semibold tabular-nums"
          :class="conv.unreadCount ? 'text-(--app-primary)' : 'text-(--app-muted)'"
        >
          {{ conv.ageLabel }}
        </span>
      </div>

      <div class="flex items-center justify-between gap-3">
        <p
          class="truncate text-xs leading-relaxed"
          :class="conv.unreadCount ? 'font-medium text-(--app-text)' : 'text-(--app-muted)'"
        >
          <span v-if="conv.lastMessageMine" class="text-(--app-muted) font-medium">You: </span>
          {{ conv.secondaryLabel || "No messages yet" }}
        </p>

        <div class="flex items-center gap-2 shrink-0" @click.stop>
          <!-- Pin button -->
          <button
            type="button"
            class="rounded-xl p-1.5 text-(--app-muted) transition-all hover:bg-(--app-surface-soft) hover:text-(--app-text) cursor-pointer"
            :class="conv.pinned ? 'text-(--app-primary)' : 'opacity-0 group-hover:opacity-100'"
            :title="conv.pinned ? 'Unpin chat' : 'Pin chat'"
            @click="emit('toggle-pin', conv.id)"
          >
            <Pin class="h-3.5 w-3.5" :class="conv.pinned ? 'fill-current' : ''" :stroke-width="2" />
          </button>

          <!-- Unread Badge -->
          <span
            v-if="conv.unreadCount > 0"
            class="flex h-5 min-w-5 items-center justify-center rounded-full bg-(--app-primary) px-2 text-[11px] font-bold text-white shadow-xs"
          >
            {{ conv.unreadCount > 99 ? "99+" : conv.unreadCount }}
          </span>
        </div>
      </div>
    </div>
  </article>
</template>
