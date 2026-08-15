<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { RouterLink, useRouter } from "vue-router";
import {
  FileText,
  Trash2,
  Loader2,
  RefreshCw,
  Search,
  Plus,
  X,
  Pencil,
  Copy,
  Check,
  Calendar,
  Layers,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import { useIdentityStore } from "@/stores/identity";
import { copyToClipboard } from "@/lib/clipboard";
import {
  getNotesCached,
  fetchNotes,
  deleteNote,
  renewExpiringNotes,
  notePreview,
} from "@/lib/notes";

const router = useRouter();
const identity = useIdentityStore();

const isLoading = ref(true);
const isRefreshing = ref(false);
const items = ref([]);
const searchQuery = ref("");
const activeTag = ref("all");
const error = ref("");
const pendingDelete = ref(null);

const copiedId = ref(null);
let copyTimer = null;

const allTags = computed(() => {
  const counts = {};
  for (const item of items.value) {
    for (const tag of item.tags || []) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
});

const filteredItems = computed(() => {
  let result = items.value;
  if (activeTag.value !== "all") {
    result = result.filter((item) => (item.tags || []).includes(activeTag.value));
  }
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return result;
  return result.filter((item) => {
    return (
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.body && item.body.toLowerCase().includes(q)) ||
      (item.tags || []).some((t) => t.includes(q))
    );
  });
});

onMounted(async () => {
  await loadItems();
});

onUnmounted(() => {
  if (copyTimer) clearTimeout(copyTimer);
});

async function loadItems() {
  const cached = await getNotesCached(identity.privkeyHex, identity.pubkeyHex);
  if (cached) {
    items.value = cached.items;
    isLoading.value = false;
    if (!cached.fresh) refreshFromRelay();
    return;
  }
  isLoading.value = true;
  await refreshFromRelay();
}

async function refreshFromRelay() {
  isRefreshing.value = true;
  try {
    let next = await fetchNotes(identity.privkeyHex, identity.pubkeyHex);
    next = await renewExpiringNotes(identity.privkeyHex, identity.pubkeyHex, next);
    items.value = next;
  } catch (err) {
    console.error("Failed to load notes:", err);
    error.value = err?.message || "Failed to load notes.";
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
}

function navigateToDetail(item) {
  router.push(`/notes/${item.id}`);
}

async function copyContent(text, id, event) {
  if (event) event.stopPropagation();
  if (!text) return;
  await copyToClipboard(text);
  copiedId.value = id;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copiedId.value = null;
  }, 1800);
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function handleDelete(item, event) {
  if (event) event.stopPropagation();
  pendingDelete.value = item;
}

async function confirmDelete() {
  const item = pendingDelete.value;
  if (!item) return;
  pendingDelete.value = null;
  try {
    error.value = "";
    await deleteNote(identity.privkeyHex, identity.pubkeyHex, item);
    items.value = items.value.filter((n) => n.id !== item.id);
  } catch (err) {
    error.value = err?.message || "Failed to delete note.";
  }
}
</script>

<template>
  <div class="min-h-screen bg-(--app-bg) text-(--app-text) pb-16">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <!-- Header Section -->
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-(--app-border) pb-6">
        <div>
          <div class="flex items-center gap-2.5">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-2xl bg-(--app-primary)/10 text-(--app-primary)"
            >
              <FileText class="h-4.5 w-4.5" />
            </div>
            <h1 class="text-2xl font-bold tracking-tight text-(--app-text)">Notes</h1>
            <span
              v-if="items.length"
              class="rounded-full bg-(--app-surface-soft) px-2.5 py-0.5 text-xs font-bold tabular-nums text-(--app-muted)"
            >
              {{ items.length }}
            </span>
          </div>
          <p class="mt-1 text-sm text-(--app-muted)">
            End-to-end encrypted Markdown notes stored privately on your Nostr relays.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <!-- Sync button -->
          <button
            type="button"
            :disabled="isRefreshing"
            class="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-(--app-border) bg-(--app-surface) px-3.5 text-xs font-semibold text-(--app-text-soft) shadow-sm transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-50 cursor-pointer"
            title="Sync from relays"
            @click="refreshFromRelay"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': isRefreshing }" />
            <span>Sync</span>
          </button>

          <!-- New Note button -->
          <RouterLink
            to="/notes/new"
            class="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-(--app-primary) px-4 text-xs font-bold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-95 cursor-pointer"
          >
            <Plus class="h-4 w-4" />
            <span>New Note</span>
          </RouterLink>
        </div>
      </div>

      <AppAlertBanner v-if="error" :message="error" />

      <!-- Search and Tag Filter Bar -->
      <div class="space-y-3">
        <div class="relative">
          <Search
            class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-(--app-muted)"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by title, body, or tags…"
            class="h-11 w-full rounded-2xl border border-(--app-border) bg-(--app-surface) pl-10 pr-9 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors shadow-xs"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-(--app-muted) hover:text-(--app-text) cursor-pointer"
            @click="searchQuery = ''"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <!-- Tag Filter Chips -->
        <div
          v-if="allTags.length"
          class="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          <button
            type="button"
            class="rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
            :class="
              activeTag === 'all'
                ? 'bg-(--app-primary) text-white shadow-xs'
                : 'bg-(--app-surface) text-(--app-muted) border border-(--app-border) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
            "
            @click="activeTag = 'all'"
          >
            All ({{ items.length }})
          </button>
          <button
            v-for="tagInfo in allTags"
            :key="tagInfo.tag"
            type="button"
            class="rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
            :class="
              activeTag === tagInfo.tag
                ? 'bg-(--app-primary) text-white shadow-xs'
                : 'bg-(--app-surface) text-(--app-muted) border border-(--app-border) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
            "
            @click="activeTag = tagInfo.tag"
          >
            #{{ tagInfo.tag }}
            <span class="ml-1 opacity-70">({{ tagInfo.count }})</span>
          </button>
        </div>
      </div>

      <!-- Shimmer Skeleton Loading State -->
      <div v-if="isLoading" class="space-y-3">
        <div
          v-for="n in 4"
          :key="n"
          class="flex items-center gap-4 rounded-2xl border border-(--app-border) bg-(--app-surface) p-4"
        >
          <div class="h-10 w-10 shrink-0 rounded-xl bg-(--app-surface-soft) animate-pulse" />
          <div class="min-w-0 flex-1 space-y-2">
            <div class="h-4 w-48 rounded-md bg-(--app-surface-soft) animate-pulse" />
            <div class="h-3 w-72 rounded-md bg-(--app-surface-soft)/60 animate-pulse" />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="items.length === 0"
        class="flex flex-col items-center justify-center rounded-3xl border border-(--app-border) bg-(--app-surface) px-6 py-16 text-center shadow-xs"
      >
        <div
          class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--app-surface-soft) text-(--app-muted)"
        >
          <Layers class="h-7 w-7" />
        </div>
        <h2 class="text-lg font-bold tracking-tight text-(--app-text)">No notes yet</h2>
        <p class="mt-1 max-w-sm text-sm text-(--app-muted) leading-relaxed">
          Your private note stream is empty. Create your first encrypted Markdown note to keep ideas, snippets, and drafts safe.
        </p>
        <RouterLink
          to="/notes/new"
          class="mt-6 inline-flex items-center gap-2 rounded-2xl bg-(--app-primary) px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-(--app-primary-strong) active:scale-95"
        >
          <Plus class="h-4 w-4" />
          <span>Create first note</span>
        </RouterLink>
      </div>

      <!-- Search No Results -->
      <div
        v-else-if="filteredItems.length === 0"
        class="flex flex-col items-center justify-center rounded-3xl border border-(--app-border) bg-(--app-surface) px-6 py-12 text-center shadow-xs"
      >
        <Search class="h-8 w-8 text-(--app-muted) mb-3" />
        <h2 class="text-base font-bold text-(--app-text)">No matching notes</h2>
        <p class="mt-1 text-sm text-(--app-muted)">
          No notes match your search query "{{ searchQuery }}".
        </p>
        <button
          type="button"
          class="mt-4 text-xs font-semibold text-(--app-primary) hover:underline cursor-pointer"
          @click="searchQuery = ''; activeTag = 'all'"
        >
          Clear filters
        </button>
      </div>

      <!-- Notes List -->
      <div v-else class="space-y-3">
        <article
          v-for="item in filteredItems"
          :key="item.id"
          class="group/card relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-(--app-border) bg-(--app-surface) p-4 sm:p-5 transition-all duration-200 hover:border-(--app-border-strong) hover:bg-(--app-surface-hover)/40 shadow-xs cursor-pointer"
          @click="navigateToDetail(item)"
        >
          <div class="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
            <!-- Note Icon -->
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-primary)"
            >
              <FileText class="h-5 w-5" />
            </div>

            <!-- Content -->
            <div class="min-w-0 flex-1 space-y-1.5">
              <h2 class="text-sm font-bold text-(--app-text) group-hover/card:text-(--app-primary) transition-colors truncate">
                {{ item.title || "Untitled Note" }}
              </h2>

              <p class="text-xs text-(--app-muted) line-clamp-2 leading-relaxed">
                {{ notePreview(item.body, 160) || "Empty note body." }}
              </p>

              <!-- Tags & Meta row -->
              <div class="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-(--app-muted)">
                <span class="inline-flex items-center gap-1 text-[11px]">
                  <Calendar class="h-3 w-3" />
                  {{ formatDate(item.updatedAt || item.createdAt) }}
                </span>

                <span v-if="item.tags && item.tags.length" class="text-(--app-border)">•</span>

                <div v-if="item.tags && item.tags.length" class="flex flex-wrap items-center gap-1.5">
                  <span
                    v-for="tag in item.tags"
                    :key="tag"
                    class="rounded-md border border-(--app-border) bg-(--app-surface-soft) px-2 py-0.5 text-[10px] font-semibold text-(--app-text-soft)"
                    @click.stop="activeTag = tag"
                  >
                    #{{ tag }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Action Buttons -->
          <div
            class="flex items-center gap-1.5 shrink-0 self-end sm:self-center border-t sm:border-t-0 border-(--app-border) pt-3 sm:pt-0 w-full sm:w-auto justify-end"
            @click.stop
          >
            <!-- Copy Note Markdown -->
            <button
              type="button"
              class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors cursor-pointer"
              :title="copiedId === item.id ? 'Copied Markdown!' : 'Copy Markdown'"
              @click="copyContent(item.body, item.id, $event)"
            >
              <Check v-if="copiedId === item.id" class="h-4 w-4 text-emerald-400" />
              <Copy v-else class="h-4 w-4" />
            </button>

            <!-- Edit / View detail -->
            <button
              type="button"
              class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors cursor-pointer"
              title="View & Edit note"
              @click="navigateToDetail(item)"
            >
              <Pencil class="h-3.5 w-3.5" />
            </button>

            <!-- Delete -->
            <button
              type="button"
              class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/15 transition-colors cursor-pointer"
              title="Delete note"
              @click="handleDelete(item, $event)"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
        </article>
      </div>
    </main>

    <!-- Delete Confirmation Modal -->
    <AppConfirmDialog
      :open="Boolean(pendingDelete)"
      title="Delete Note?"
      :message="`Delete note '${pendingDelete?.title || 'Untitled'}'? An encrypted tombstone will be published to your relays.`"
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </div>
</template>
