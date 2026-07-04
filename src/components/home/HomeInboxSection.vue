<script setup>
import { computed } from "vue";
import { MessageCircle, RefreshCw, Pin, PinOff, SquarePen } from "lucide-vue-next";
import { useRouter } from "vue-router";
import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import InboxSkeleton from "@/components/home/InboxSkeleton.vue";

const router = useRouter();

const props = defineProps({
  activeTab: { type: String, default: "messages" },
  activeId: { type: String, default: "" },
  searchActive: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  messages: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] },
});

const emit = defineEmits([
  "update:activeTab",
  "open-room",
  "open-group",
  "open-profile",
  "refresh-groups",
  "toggle-pin",
]);

function formatUnread(count) {
  const n = Number(count || 0);
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}

const messageRows = computed(() => {
  const rows = [];
  let dividerAdded = false;
  for (let idx = 0; idx < props.messages.length; idx++) {
    const room = props.messages[idx];
    if (idx > 0 && !room.pinned && props.messages[idx - 1]?.pinned && !dividerAdded) {
      rows.push({ id: "__divider-all", kind: "divider" });
      dividerAdded = true;
    }
    rows.push({ ...room, kind: "room" });
  }
  return rows;
});
</script>

<template>
  <section v-if="!searchActive" class="flex min-h-0 flex-1 flex-col">
    <div
      class="sticky top-0 z-10 flex items-center gap-2 py-2 -mx-4 px-4 mb-1 backdrop-blur-xl"
      style="background: color-mix(in srgb, var(--app-surface) 90%, transparent)"
    >
      <button
        v-if="messages.length || loading"
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150"
        :class="
          activeTab === 'messages'
            ? 'bg-(--app-primary-soft) ring-1 ring-(--app-border-strong)'
            : 'border border-(--app-border) bg-(--app-surface-soft) text-zinc-500 hover:text-zinc-300'
        "
        @click="emit('update:activeTab', 'messages')"
      >
        Messages
        <span
          class="text-[10px] tabular-nums"
          :class="activeTab === 'messages' ? 'text-zinc-300' : 'text-zinc-500'"
          >{{ messages.length }}</span
        >
      </button>
      <button
        v-if="groups.length"
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150"
        :class="
          activeTab === 'groups'
            ? 'bg-(--app-primary-soft) ring-1 ring-(--app-border-strong)'
            : 'border border-(--app-border) bg-(--app-surface-soft) text-zinc-500 hover:text-zinc-300'
        "
        @click="emit('update:activeTab', 'groups')"
      >
        Groups
        <span
          class="text-[10px] tabular-nums"
          :class="activeTab === 'groups' ? 'text-zinc-300' : 'text-zinc-500'"
          >{{ groups.length }}</span
        >
      </button>

      <button
        v-if="activeTab === 'groups' && groups.length"
        class="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
        @click="emit('refresh-groups')"
      >
        <RefreshCw class="w-3 h-3" :stroke-width="1.8" aria-hidden="true" />
      </button>
    </div>

    <InboxSkeleton v-if="loading && activeTab === 'messages'" />

    <div v-else-if="activeTab === 'messages'" class="space-y-0.5">
      <p
        v-if="messages.some((r) => r.pinned)"
        class="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
      >
        Pinned
      </p>

      <TransitionGroup appear name="inbox-list" tag="div" class="space-y-0.5">
        <template v-for="(row, index) in messageRows" :key="row.id">
          <p
            v-if="row.kind === 'divider'"
            class="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 animate-in fade-in duration-500 fill-mode-backwards"
            :style="{ animationDelay: `${index * 30}ms` }"
          >
            All
          </p>

          <button
            v-else
            class="inbox-row group relative flex w-full items-center gap-2.5 rounded-xl pl-2 pr-9 py-2 text-left transition-all duration-300 ease-out hover:translate-x-1 animate-in fade-in slide-in-from-left-2 fill-mode-backwards"
            :style="{ animationDelay: `${index * 30}ms` }"
            :class="
              activeId && activeId === row.roomId
                ? 'border border-(--app-border) bg-(--app-surface-soft) border-(--app-border-strong) shadow-sm'
                : 'border border-(--app-border) bg-(--app-surface-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:shadow-sm hover:border-(--app-primary)/30'
            "
            @click="emit('open-room', row.roomId)"
          >
            <div
              v-if="row.peerPubkey"
              class="shrink-0 transition-transform duration-300 group-hover:scale-105"
              @click.stop="emit('open-profile', row.peerPubkey)"
            >
              <RoboAvatar
                :pubkey="row.peerPubkey"
                :src="row.avatarSrc"
                size="md"
                :hoverable="true"
                :alt="row.displayName"
              />
            </div>
            <div
              v-else
              class="border border-(--app-border) bg-(--app-surface-soft) flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold transition-transform duration-300 group-hover:scale-105"
            >
              {{ row.fallbackInitial }}
            </div>

            <div
              class="min-w-0 flex-1 transition-transform duration-300 group-hover:translate-x-0.5"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-1">
                  <p
                    class="truncate text-[13px] leading-snug"
                    :class="
                      row.unreadCount
                        ? 'font-bold text-(--app-text)'
                        : 'font-semibold text-(--app-text)'
                    "
                  >
                    {{ row.displayName }}
                  </p>
                  <Pin
                    v-if="row.pinned"
                    class="h-3 w-3 shrink-0 text-(--app-primary)"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <span
                    v-if="row.unreadCount"
                    class="inline-flex min-w-5 items-center justify-center rounded-full bg-(--app-primary) px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white shadow-[0_0_0_1px_color-mix(in_srgb,var(--app-primary)_40%,transparent)]"
                    :aria-label="`${row.unreadCount} unread`"
                  >
                    {{ formatUnread(row.unreadCount) }}
                  </span>
                  <span
                    v-if="row.ageLabel"
                    class="text-[10px] tabular-nums transition-colors duration-300"
                    :class="
                      row.unreadCount
                        ? 'text-(--app-primary) font-medium'
                        : 'text-(--app-muted) group-hover:text-(--app-text-soft)'
                    "
                  >
                    {{ row.ageLabel }}
                  </span>
                </div>
              </div>
              <p
                class="mt-0.5 truncate text-[11px] leading-snug transition-colors duration-300"
                :class="
                  row.unreadCount
                    ? 'font-medium text-(--app-text)'
                    : 'text-(--app-text-soft) group-hover:text-(--app-text)'
                "
              >
                {{ row.secondaryLabel }}
              </p>
            </div>

            <div
              role="button"
              tabindex="0"
              class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              :class="[
                'text-(--app-muted) hover:text-(--app-primary)',
                row.pinned ? 'bg-(--app-surface-hover) text-(--app-text-soft)' : '',
              ]"
              :title="row.pinned ? 'Unpin chat' : 'Pin chat'"
              @click.stop="emit('toggle-pin', row.roomId)"
              @keydown.enter.stop="emit('toggle-pin', row.roomId)"
              @keydown.space.stop.prevent="emit('toggle-pin', row.roomId)"
            >
              <PinOff v-if="row.pinned" class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
              <Pin v-else class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
            </div>
          </button>
        </template>
      </TransitionGroup>
    </div>

    <div v-if="activeTab === 'groups'" class="space-y-0.5">
      <TransitionGroup appear name="inbox-list" tag="div" class="space-y-0.5">
        <button
          v-for="(group, index) in groups"
          :key="group.id"
          class="inbox-row group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-all duration-300 ease-out hover:translate-x-1 animate-in fade-in slide-in-from-left-2 fill-mode-backwards"
          :style="{ animationDelay: `${index * 30}ms` }"
          :class="
            activeId && activeId === group.groupId
              ? 'border border-(--app-border) bg-(--app-surface-soft) border-(--app-border-strong) shadow-sm'
              : 'border border-(--app-border) bg-(--app-surface-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:shadow-sm hover:border-(--app-primary)/30'
          "
          @click="emit('open-group', group.groupId)"
        >
          <div class="shrink-0 transition-transform duration-300 group-hover:scale-105">
            <RoboAvatar :group-id="group.avatarKey" :alt="group.displayName" size="md" />
          </div>
          <div class="min-w-0 flex-1 transition-transform duration-300 group-hover:translate-x-0.5">
            <div class="flex items-center justify-between gap-2">
              <p
                class="truncate text-[13px] leading-snug transition-colors duration-300"
                :class="
                  group.unreadCount
                    ? 'font-bold text-(--app-text)'
                    : 'font-semibold text-(--app-text)'
                "
              >
                {{ group.displayName }}
              </p>
              <span
                v-if="group.unreadCount"
                class="inline-flex min-w-5 items-center justify-center rounded-full bg-(--app-primary) px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white shadow-[0_0_0_1px_color-mix(in_srgb,var(--app-primary)_40%,transparent)]"
              >
                {{ formatUnread(group.unreadCount) }}
              </span>
            </div>
            <p
              class="mt-0.5 truncate text-[11px] transition-colors duration-300"
              :class="
                group.unreadCount
                  ? 'font-medium text-(--app-text)'
                  : 'text-(--app-text-soft) group-hover:text-(--app-text)'
              "
            >
              {{ group.secondaryLabel }}
            </p>
          </div>
        </button>
      </TransitionGroup>
    </div>

    <div
      v-if="!loading && !messages.length && !groups.length"
      class="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center lg:py-20 animate-in fade-in zoom-in-95 duration-500"
    >
      <div class="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center">
        <!-- Floating decorative shapes -->
        <div
          class="absolute -left-3 top-2 h-12 w-12 animate-bounce rounded-2xl bg-(--app-primary)/10 [animation-delay:100ms] [animation-duration:3s]"
        ></div>
        <div
          class="absolute -right-2 bottom-0 h-10 w-10 animate-bounce rounded-xl bg-(--app-primary)/20 [animation-delay:500ms] [animation-duration:2.5s]"
        ></div>

        <!-- Main Icon -->
        <div
          class="border border-(--app-border) bg-(--app-surface-soft) relative z-10 flex h-16 w-16 items-center justify-center rounded-3xl shadow-xl ring-1 ring-white/5"
        >
          <MessageCircle
            class="h-8 w-8 text-(--app-primary)"
            :stroke-width="1.8"
            aria-hidden="true"
          />
        </div>
      </div>
      <p class="text-lg font-bold text-(--app-text-soft)">Your inbox is empty</p>
      <p class="mt-2 max-w-xs text-sm text-(--app-muted) leading-relaxed">
        Start a secure, private chat using an invite link or public key.
      </p>
      <div class="mt-6 w-full max-w-xs space-y-2">
        <PrimaryButton @click="router.push('/new')">
          <SquarePen class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
          New chat
        </PrimaryButton>
        <button
          type="button"
          class="w-full rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3 text-sm font-semibold text-(--app-text-soft) transition-colors hover:bg-(--app-surface-hover) active:scale-[0.98]"
          @click="router.push({ path: '/new/start', query: { type: 'group' } })"
        >
          Create a group
        </button>
      </div>
    </div>
  </section>
</template>
