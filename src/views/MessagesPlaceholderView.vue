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
  Users,
  Search,
  X,
} from "@lucide/vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import InboxSkeleton from "@/components/home/InboxSkeleton.vue";
import { useConversations } from "@/composables/useConversations";

const router = useRouter();
const activeTab = ref("all");
const searchQuery = ref("");

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
  let list = conversations.value;

  if (activeTab.value === "unread") {
    list = list.filter((c) => c.unreadCount > 0);
  }

  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    list = list.filter((c) => {
      const nameMatch = c.displayName?.toLowerCase().includes(query);
      const labelMatch = c.secondaryLabel?.toLowerCase().includes(query);
      return nameMatch || labelMatch;
    });
  }

  return list;
});

const trustedConversations = computed(() => filteredConversations.value.filter((c) => c.isTrusted));
const pinnedConversations = computed(() =>
  filteredConversations.value.filter((c) => c.pinned && !c.isTrusted),
);
const unpinnedConversations = computed(() =>
  filteredConversations.value.filter((c) => !c.pinned && !c.isTrusted),
);

function accentColor(seed) {
  const h = [...String(seed || "0")].reduce(
    (acc, c) => ((acc * 31 + c.charCodeAt(0)) & 0xffffff) >>> 0,
    0,
  );
  return `hsl(${h % 360}, 64%, 52%)`;
}

function cardAccentStyle(row) {
  const seed = row.isGroup ? row.avatarKey : row.peerPubkey || row.roomId;
  const color = accentColor(seed);
  return {
    "--card-accent": color,
  };
}
</script>

<template>
  <main
    class="mx-auto w-full max-w-[80rem] px-4 py-6 lg:px-8 overflow-y-auto h-full text-(--app-text)"
  >
    <div class="mx-auto max-w-5xl space-y-5">


      <!-- Search bar -->
      <div class="relative flex items-center">
        <Search
          class="pointer-events-none absolute left-3.5 h-4 w-4 text-zinc-500"
          :stroke-width="2.2"
          aria-hidden="true"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search conversations..."
          autocomplete="off"
          spellcheck="false"
          class="w-full rounded-2xl py-2.5 pl-10 pr-10 text-sm placeholder-zinc-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--app-primary) border border-(--app-border) bg-(--app-surface-soft) text-(--app-text) focus:border-[var(--app-primary)] focus:bg-(--app-surface)"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="absolute right-3 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
          @click="searchQuery = ''"
          title="Clear search"
          aria-label="Clear search"
        >
          <X class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>

      <!-- Filters + refresh -->
      <div class="flex items-center justify-between">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-200"
          :class="
            activeTab === 'unread'
              ? 'border-[var(--app-primary)] bg-[var(--app-primary)] text-[#06101a]'
              : 'border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) hover:border-(--app-border-strong) hover:text-(--app-text)'
          "
          @click="activeTab = activeTab === 'unread' ? 'all' : 'unread'"
        >
          Unread
          <span
            v-if="unreadTotal > 0"
            class="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
            :class="
              activeTab === 'unread'
                ? 'bg-[#06101a] text-(--app-primary)'
                : 'bg-(--app-surface-hover) text-(--app-text)'
            "
          >
            {{ unreadTotal }}
          </span>
        </button>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="inline-flex shrink-0 items-center justify-center h-8 w-8 rounded-full border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-all"
            title="Invite"
            aria-label="Invite"
            @click="router.push('/new/share')"
          >
            <UserPlus class="h-3.5 w-3.5" :stroke-width="2.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="inline-flex shrink-0 items-center justify-center h-8 w-8 rounded-full bg-(--app-primary) text-[#06101a] hover:bg-(--app-primary-strong) hover:text-white hover:scale-105 transition-all"
            title="New chat"
            aria-label="New chat"
            @click="router.push('/new/start')"
          >
            <SquarePen class="h-3.5 w-3.5" :stroke-width="2.5" aria-hidden="true" />
          </button>
          <div class="mx-0.5 h-3.5 w-px bg-(--app-border)"></div>
          <button
            class="inline-flex shrink-0 items-center justify-center h-8 w-8 rounded-lg text-(--app-muted) hover:text-(--app-text-soft) hover:bg-(--app-surface-soft) transition-colors"
            @click="refreshGroups"
            title="Sync state from relays"
            aria-label="Sync state from relays"
          >
            <RefreshCw class="w-3.5 h-3.5" :stroke-width="1.8" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div
        v-if="inboxLoading"
        class="rounded-3xl border border-(--app-border) bg-(--app-surface-soft) shadow-md overflow-hidden"
      >
        <InboxSkeleton />
      </div>

      <!-- Empty -->
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

      <!-- No unread -->
      <div
        v-else-if="activeTab === 'unread' && !filteredConversations.length"
        class="flex flex-col items-center px-6 py-12 text-center animate-in fade-in duration-500"
      >
        <div
          class="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-success)"
        >
          <ShieldCheck class="h-6 w-6" :stroke-width="2" aria-hidden="true" />
        </div>
        <p class="text-sm font-semibold text-(--app-text-soft)">All caught up</p>
        <p class="mt-1 text-xs text-(--app-muted)">No unread messages.</p>
      </div>

      <!-- Card grid -->
      <template v-else>
        <!-- Trusted contacts (big cards) -->
        <section v-if="trustedConversations.length" class="space-y-3">
          <div class="flex items-center gap-1.5 px-1">
            <ShieldCheck
              class="h-3.5 w-3.5 text-emerald-400"
              :stroke-width="2.5"
              aria-hidden="true"
            />
            <p class="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">
              Trusted contacts
            </p>
            <span class="text-[10px] tabular-nums text-(--app-muted-2)">{{
              trustedConversations.length
            }}</span>
          </div>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <button
              v-for="(row, index) in trustedConversations"
              :key="row.id"
              :style="{ ...cardAccentStyle(row), animationDelay: `${index * 30}ms` }"
              class="group relative flex items-stretch gap-4 rounded-3xl border px-4 py-4 text-left transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]"
              :class="
                activeId && activeId === row.roomId
                  ? 'border-[var(--card-accent)] ring-1 ring-[var(--card-accent)]'
                  : 'border-(--app-border) hover:border-[var(--card-accent)]'
              "
              @click="openRoom(row)"
            >
              <span
                class="absolute left-0 top-4 bottom-4 w-1.5 rounded-r-full bg-[var(--card-accent)]"
                aria-hidden="true"
              />
              <div class="shrink-0 pl-2 group-hover:scale-[1.04] transition-transform duration-300">
                <RoboAvatar
                  v-if="row.isGroup"
                  :group-id="row.avatarKey"
                  size="xl"
                  rounded="3xl"
                  :alt="row.displayName"
                />
                <RoboAvatar
                  v-else-if="row.peerPubkey"
                  :pubkey="row.peerPubkey"
                  :src="row.avatarSrc"
                  size="xl"
                  rounded="3xl"
                  :hoverable="true"
                  :alt="row.displayName"
                  @click.stop="openProfile(row.peerPubkey)"
                />
                <div
                  v-else
                  class="border border-(--app-border) bg-(--app-surface) flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl text-xl font-bold"
                >
                  {{ row.fallbackInitial }}
                </div>
              </div>
              <div class="min-w-0 flex-1 flex flex-col justify-center">
                <div class="flex items-center gap-1.5">
                  <Users
                    v-if="row.isGroup"
                    class="h-4 w-4 shrink-0 text-[var(--card-accent)]"
                    :stroke-width="2.4"
                    aria-hidden="true"
                    title="Group"
                  />
                  <p class="truncate text-base leading-tight font-bold text-(--app-text)">
                    {{ row.displayName }}
                  </p>
                  <ShieldCheck
                    class="h-4 w-4 shrink-0 text-emerald-400"
                    :stroke-width="2.5"
                    aria-hidden="true"
                    title="Trusted contact"
                  />
                  <Pin
                    v-if="row.pinned"
                    class="h-3.5 w-3.5 shrink-0 text-[var(--card-accent)]"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </div>
                <p
                  class="mt-1.5 truncate text-xs leading-snug transition-colors duration-300"
                  :class="
                    row.unreadCount
                      ? 'font-medium text-(--app-text)'
                      : 'text-(--app-text-soft) group-hover:text-(--app-text)'
                  "
                >
                  {{ row.secondaryLabel }}
                </p>
              </div>
              <div class="flex shrink-0 flex-col items-end justify-between py-1">
                <span
                  class="text-xs tabular-nums"
                  :class="
                    row.unreadCount
                      ? 'text-[var(--card-accent)] font-bold'
                      : 'text-(--app-muted)'
                  "
                  >{{ row.ageLabel }}</span
                >
                <div class="flex items-center gap-1.5">
                  <span
                    v-if="row.unreadCount"
                    class="inline-flex min-w-6 items-center justify-center rounded-full px-2 py-1 text-[11px] font-bold tabular-nums text-white"
                    :style="{ background: 'var(--card-accent)' }"
                    :aria-label="`${row.unreadCount} unread`"
                  >
                    {{ formatUnread(row.unreadCount) }}
                  </span>
                  <span
                    role="button"
                    tabindex="0"
                    class="rounded-full p-1.5 text-(--app-muted) hover:text-[var(--card-accent)] hover:bg-(--app-surface-hover) transition opacity-0 group-hover:opacity-100"
                    :title="row.pinned ? 'Unpin chat' : 'Pin chat'"
                    @click.stop="togglePin(row.roomId)"
                    @keydown.enter.stop="togglePin(row.roomId)"
                    @keydown.space.stop.prevent="togglePin(row.roomId)"
                  >
                    <PinOff
                      v-if="row.pinned"
                      class="h-4 w-4"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                    <Pin v-else class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                  </span>
                </div>
              </div>
            </button>
          </div>
        </section>

        <!-- Pinned section -->
        <section v-if="pinnedConversations.length" class="space-y-2.5">
          <p class="px-1 text-[10px] font-semibold uppercase tracking-wider text-(--app-muted-2)">
            Pinned
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            <button
              v-for="row in pinnedConversations"
              :key="row.id"
              :style="cardAccentStyle(row)"
              class="group relative flex items-stretch gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
              :class="
                activeId && activeId === row.roomId
                  ? 'border-[var(--card-accent)] ring-1 ring-[var(--card-accent)]'
                  : 'border-(--app-border) hover:border-[var(--card-accent)]'
              "
              @click="openRoom(row)"
            >
              <span
                class="absolute left-0 top-3 bottom-3 w-1.5 rounded-r-full bg-[var(--card-accent)]"
                aria-hidden="true"
              />
              <div
                class="shrink-0 pl-1.5 group-hover:scale-[1.03] transition-transform duration-300"
              >
                <RoboAvatar
                  v-if="row.isGroup"
                  :group-id="row.avatarKey"
                  size="lg"
                  :alt="row.displayName"
                />
                <RoboAvatar
                  v-else-if="row.peerPubkey"
                  :pubkey="row.peerPubkey"
                  :src="row.avatarSrc"
                  size="lg"
                  :hoverable="true"
                  :alt="row.displayName"
                  @click.stop="openProfile(row.peerPubkey)"
                />
                <div
                  v-else
                  class="border border-(--app-border) bg-(--app-surface-soft) flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold"
                >
                  {{ row.fallbackInitial }}
                </div>
              </div>
              <div class="min-w-0 flex-1 flex flex-col justify-center">
                <div class="flex items-center gap-1.5">
                  <Users
                    v-if="row.isGroup"
                    class="h-3.5 w-3.5 shrink-0 text-[var(--card-accent)]"
                    :stroke-width="2.4"
                    aria-hidden="true"
                    title="Group"
                  />
                  <p
                    class="truncate text-sm leading-snug font-bold text-(--app-text)"
                    :class="row.unreadCount ? '' : 'font-semibold'"
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
                </div>
                <p
                  class="mt-1 truncate text-xs leading-snug transition-colors duration-300"
                  :class="
                    row.unreadCount
                      ? 'font-medium text-(--app-text)'
                      : 'text-(--app-text-soft) group-hover:text-(--app-text)'
                  "
                >
                  {{ row.secondaryLabel }}
                </p>
              </div>
              <div class="flex shrink-0 flex-col items-end justify-between py-0.5">
                <span
                  class="text-[11px] tabular-nums"
                  :class="
                    row.unreadCount
                      ? 'text-[var(--card-accent)] font-medium'
                      : 'text-(--app-muted)'
                  "
                  >{{ row.ageLabel }}</span
                >
                <div class="flex items-center gap-1">
                  <span
                    v-if="row.unreadCount"
                    class="inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
                    :style="{ background: 'var(--card-accent)' }"
                    :aria-label="`${row.unreadCount} unread`"
                  >
                    {{ formatUnread(row.unreadCount) }}
                  </span>
                  <span
                    role="button"
                    tabindex="0"
                    class="rounded-full p-1 text-(--app-muted) hover:text-[var(--card-accent)] hover:bg-(--app-surface-hover) transition"
                    :title="row.pinned ? 'Unpin chat' : 'Pin chat'"
                    @click.stop="togglePin(row.roomId)"
                    @keydown.enter.stop="togglePin(row.roomId)"
                    @keydown.space.stop.prevent="togglePin(row.roomId)"
                  >
                    <PinOff
                      v-if="row.pinned"
                      class="h-3.5 w-3.5"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                    <Pin v-else class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
                  </span>
                </div>
              </div>
            </button>
          </div>
        </section>

        <!-- All conversations -->
        <section v-if="unpinnedConversations.length" class="space-y-2.5">
          <p
            v-if="pinnedConversations.length || trustedConversations.length"
            class="px-1 text-[10px] font-semibold uppercase tracking-wider text-(--app-muted-2)"
          >
            All conversations
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            <button
              v-for="(row, index) in unpinnedConversations"
              :key="row.id"
              :style="{ ...cardAccentStyle(row), animationDelay: `${index * 25}ms` }"
              class="group relative flex items-stretch gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
              :class="
                activeId && activeId === row.roomId
                  ? 'border-[var(--card-accent)] ring-1 ring-[var(--card-accent)]'
                  : 'border-(--app-border) hover:border-[var(--card-accent)]'
              "
              @click="openRoom(row)"
            >
              <div class="shrink-0 group-hover:scale-[1.03] transition-transform duration-300">
                <RoboAvatar
                  v-if="row.isGroup"
                  :group-id="row.avatarKey"
                  size="lg"
                  :alt="row.displayName"
                />
                <RoboAvatar
                  v-else-if="row.peerPubkey"
                  :pubkey="row.peerPubkey"
                  :src="row.avatarSrc"
                  size="lg"
                  :hoverable="true"
                  :alt="row.displayName"
                  @click.stop="openProfile(row.peerPubkey)"
                />
                <div
                  v-else
                  class="border border-(--app-border) bg-(--app-surface) flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold"
                >
                  {{ row.fallbackInitial }}
                </div>
              </div>
              <div class="min-w-0 flex-1 flex flex-col justify-center">
                <div class="flex items-center gap-1.5">
                  <Users
                    v-if="row.isGroup"
                    class="h-3.5 w-3.5 shrink-0 text-[var(--card-accent)]"
                    :stroke-width="2.4"
                    aria-hidden="true"
                    title="Group"
                  />
                  <p
                    class="truncate text-sm leading-snug font-semibold text-(--app-text)"
                    :class="row.unreadCount ? 'font-bold' : ''"
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
                </div>
                <p
                  class="mt-1 truncate text-xs leading-snug transition-colors duration-300"
                  :class="
                    row.unreadCount
                      ? 'font-medium text-(--app-text)'
                      : 'text-(--app-text-soft) group-hover:text-(--app-text)'
                  "
                >
                  {{ row.secondaryLabel }}
                </p>
              </div>
              <div class="flex shrink-0 flex-col items-end justify-between py-0.5">
                <span
                  class="text-[11px] tabular-nums"
                  :class="
                    row.unreadCount
                      ? 'text-[var(--card-accent)] font-bold'
                      : 'text-(--app-muted)'
                  "
                  >{{ row.ageLabel }}</span
                >
                <div class="flex items-center gap-1">
                  <span
                    v-if="row.unreadCount"
                    class="inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
                    :style="{ background: 'var(--card-accent)' }"
                    :aria-label="`${row.unreadCount} unread`"
                  >
                    {{ formatUnread(row.unreadCount) }}
                  </span>
                  <span
                    role="button"
                    tabindex="0"
                    class="rounded-full p-1 text-(--app-muted) hover:text-[var(--card-accent)] hover:bg-(--app-surface-hover) transition opacity-0 group-hover:opacity-100"
                    :title="row.pinned ? 'Unpin chat' : 'Pin chat'"
                    @click.stop="togglePin(row.roomId)"
                    @keydown.enter.stop="togglePin(row.roomId)"
                    @keydown.space.stop.prevent="togglePin(row.roomId)"
                  >
                    <PinOff
                      v-if="row.pinned"
                      class="h-3.5 w-3.5"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                    <Pin v-else class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
                  </span>
                </div>
              </div>
            </button>
          </div>
        </section>
      </template>
    </div>
  </main>
</template>
