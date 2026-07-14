<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  MessageCircle,
  SquarePen,
  UserPlus,
  ShieldCheck,
  Pin,
  PinOff,
  RefreshCw,
  Lock,
} from "@lucide/vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import InboxSkeleton from "@/components/home/InboxSkeleton.vue";
import { useConversations } from "@/composables/useConversations";

const router = useRouter();
const activeTab = ref("all");

const {
  initPromise,
  activeId,
  conversations,
  unreadTotal,
  inboxLoading,
  refreshGroups,
  togglePin,
  openRoom,
  openProfile,
} = useConversations();

onMounted(async () => {
  await initPromise;
  void refreshGroups();
});

function formatUnread(count) {
  const n = Number(count || 0);
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}

const filteredConversations = computed(() => {
  if (activeTab.value === "unread") {
    return conversations.value.filter((c) => c.unreadCount > 0);
  }
  return conversations.value;
});

const messageRows = computed(() => {
  const rows = [];
  let dividerAdded = false;
  const list = filteredConversations.value;
  for (let idx = 0; idx < list.length; idx++) {
    const room = list[idx];
    if (idx > 0 && !room.pinned && list[idx - 1]?.pinned && !dividerAdded) {
      rows.push({ id: "__divider-all", kind: "divider" });
      dividerAdded = true;
    }
    rows.push({ ...room, kind: "room" });
  }
  return rows;
});
</script>

<template>
  <main
    class="mx-auto w-full max-w-[80rem] px-4 py-6 lg:px-8 overflow-y-auto h-full text-(--app-text)"
  >
    <div class="mx-auto max-w-2xl space-y-5">
      <!-- Header -->
      <div class="flex items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Messages</h1>
          <p class="mt-1 text-sm text-(--app-muted)">
            {{ conversations.length }} conversation{{ conversations.length !== 1 ? "s" : ""
            }}<span v-if="unreadTotal" class="text-(--app-primary)"> · {{ unreadTotal }} unread</span>
          </p>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="inline-flex shrink-0 items-center justify-center h-9 w-9 rounded-full border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-all"
            title="Invite"
            aria-label="Invite"
            @click="router.push('/new/share')"
          >
            <UserPlus class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="inline-flex shrink-0 items-center justify-center h-9 w-9 rounded-full bg-(--app-primary) text-[#06101a] hover:bg-(--app-primary-strong) hover:text-white hover:scale-105 transition-all"
            title="New chat"
            aria-label="New chat"
            @click="router.push('/new/start')"
          >
            <SquarePen class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- Tab bar + refresh -->
      <div class="flex items-center gap-2">
        <div
          class="relative flex flex-1 gap-1 rounded-xl border border-(--app-border) bg-(--app-surface-soft) p-1"
        >
          <div
            class="absolute inset-y-1 rounded-lg bg-(--app-surface-raised) shadow-sm ring-1 ring-(--app-border-strong) transition-all duration-200 ease-[var(--app-ease-swift)]"
            :style="activeTab === 'unread' ? 'left: 50%; right: 4px;' : 'left: 4px; right: 50%;'"
          />
          <button
            class="relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150"
            :class="
              activeTab === 'all'
                ? 'text-(--app-text)'
                : 'text-(--app-muted) hover:text-(--app-text-soft)'
            "
            @click="activeTab = 'all'"
          >
            All
            <span
              class="text-[10px] tabular-nums"
              :class="activeTab === 'all' ? 'text-(--app-text-soft)' : 'text-(--app-muted-2)'"
              >{{ conversations.length }}</span
            >
          </button>
          <button
            class="relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150"
            :class="
              activeTab === 'unread'
                ? 'text-(--app-text)'
                : 'text-(--app-muted) hover:text-(--app-text-soft)'
            "
            @click="activeTab = 'unread'"
          >
            Unread
            <span
              class="text-[10px] tabular-nums"
              :class="activeTab === 'unread' ? 'text-(--app-text-soft)' : 'text-(--app-muted-2)'"
              >{{ unreadTotal }}</span
            >
          </button>
        </div>
        <button
          class="inline-flex shrink-0 items-center justify-center h-8 w-8 rounded-lg text-(--app-muted) hover:text-(--app-text-soft) hover:bg-(--app-surface-soft) transition-colors"
          @click="refreshGroups"
          title="Sync state from relays"
          aria-label="Sync state from relays"
        >
          <RefreshCw class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>

      <!-- List card -->
      <div
        class="rounded-3xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] overflow-hidden"
      >
        <InboxSkeleton v-if="inboxLoading" />

        <div
          v-else-if="!conversations.length"
          class="flex flex-col items-center px-6 py-16 text-center animate-in fade-in zoom-in-95 duration-500"
        >
          <div
            class="relative mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-(--app-border) bg-(--app-surface-soft) shadow-xl ring-1 ring-white/5"
          >
            <MessageCircle
              class="h-10 w-10 text-(--app-primary)"
              :stroke-width="1.6"
              aria-hidden="true"
            />
            <div
              class="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-(--app-border) bg-(--app-surface) shadow-sm"
            >
              <Lock class="h-3.5 w-3.5 text-(--app-success)" :stroke-width="2.5" aria-hidden="true" />
            </div>
          </div>
          <h2 class="text-lg font-bold text-(--app-text-soft)">Your inbox is empty</h2>
          <p class="mt-2 max-w-xs text-sm text-(--app-muted) leading-relaxed">
            Start a secure, end-to-end encrypted chat using an invite link or public key.
          </p>
          <div class="mt-6 flex items-center justify-center gap-2">
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-2xl bg-(--app-primary) px-4 py-2.5 text-sm font-semibold text-[#06101a] transition-all hover:bg-(--app-primary-strong) hover:text-white active:scale-[0.98]"
              @click="router.push('/new/start')"
            >
              <SquarePen class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
              New chat
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-2.5 text-sm font-semibold text-(--app-text-soft) transition-all hover:bg-(--app-surface-hover) active:scale-[0.98]"
              @click="router.push('/new/share')"
            >
              <UserPlus class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
              Invite
            </button>
          </div>
        </div>

        <div v-else class="divide-y divide-(--app-border)">
          <p
            v-if="filteredConversations.some((r) => r.pinned)"
            class="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-(--app-muted-2)"
          >
            Pinned
          </p>

          <template v-for="(row, index) in messageRows" :key="row.id">
            <p
              v-if="row.kind === 'divider'"
              class="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-(--app-muted-2) animate-in fade-in duration-500 fill-mode-backwards"
              :style="{ animationDelay: `${index * 30}ms` }"
            >
              All
            </p>

            <button
              v-else
              class="group relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 animate-in fade-in slide-in-from-left-2 fill-mode-backwards"
              :style="{ animationDelay: `${index * 30}ms` }"
              :class="
                activeId && activeId === row.roomId
                  ? 'bg-(--app-surface-soft)'
                  : 'bg-transparent hover:bg-(--app-surface-soft)'
              "
              @click="openRoom(row)"
            >
              <div
                v-if="row.isGroup"
                class="shrink-0 relative transition-transform duration-300 group-hover:scale-105"
              >
                <RoboAvatar :group-id="row.avatarKey" size="md" :alt="row.displayName" />
                <div class="absolute -bottom-1 -right-1 bg-(--app-surface) rounded-full p-0.5">
                  <div
                    class="bg-(--app-primary) text-[#06101a] rounded-full h-3 w-3 flex items-center justify-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="w-2 h-2"
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                </div>
              </div>
              <div
                v-else-if="row.peerPubkey"
                class="shrink-0 transition-transform duration-300 group-hover:scale-105"
                @click.stop="openProfile(row.peerPubkey)"
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

              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex min-w-0 items-center gap-1">
                    <p
                      class="truncate text-sm leading-snug"
                      :class="
                        row.unreadCount
                          ? 'font-bold text-(--app-text)'
                          : 'font-semibold text-(--app-text)'
                      "
                    >
                      {{ row.displayName }}
                    </p>
                    <ShieldCheck
                      v-if="row.isTrusted"
                      class="h-3.5 w-3.5 shrink-0 text-emerald-400"
                      :stroke-width="2.5"
                      aria-hidden="true"
                      title="Trusted contact"
                    />
                    <Pin
                      v-if="row.pinned"
                      class="h-3.5 w-3.5 shrink-0 text-(--app-primary)"
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
                      class="text-[11px] tabular-nums transition-colors duration-300"
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
                  class="mt-0.5 truncate text-xs leading-snug transition-colors duration-300"
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
                class="shrink-0 rounded-full p-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                :class="[
                  'text-(--app-muted) hover:text-(--app-primary)',
                  row.pinned ? 'bg-(--app-surface-hover) text-(--app-text-soft)' : '',
                ]"
                :title="row.pinned ? 'Unpin chat' : 'Pin chat'"
                @click.stop="togglePin(row.roomId)"
                @keydown.enter.stop="togglePin(row.roomId)"
                @keydown.space.stop.prevent="togglePin(row.roomId)"
              >
                <PinOff v-if="row.pinned" class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
                <Pin v-else class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
              </div>
            </button>
          </template>
        </div>
      </div>
    </div>
  </main>
</template>
