<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { RouterLink, useRouter } from "vue-router";
import {
  FileText,
  Trash2,
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
import { getNotesCached, fetchNotes, deleteNote, notePreview } from "@/lib/notes";

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
    const next = await fetchNotes(identity.privkeyHex, identity.pubkeyHex);
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
  <div class="min-h-screen bg-black text-zinc-100 pb-16">
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-5">
      <!-- Header Section -->
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-5"
      >
        <div>
          <h1 class="text-xl font-semibold tracking-tight text-white">
            Notes
            <span
              v-if="items.length"
              class="ml-1 font-mono text-[11px] font-medium tabular-nums text-zinc-500"
            >
              ({{ items.length }})
            </span>
          </h1>
          <p class="mt-1 text-sm leading-6 text-zinc-400">
            End-to-end encrypted Markdown notes stored privately on your relays.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <!-- Sync button -->
          <button
            type="button"
            :disabled="isRefreshing"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-50 cursor-pointer"
            title="Sync from relays"
            @click="refreshFromRelay"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': isRefreshing }" />
            <span>Sync</span>
          </button>

          <!-- New Note button -->
          <RouterLink
            to="/notes/new"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-95 cursor-pointer"
          >
            <Plus class="h-3.5 w-3.5" :stroke-width="2.2" />
            <span>New Note</span>
          </RouterLink>
        </div>
      </div>

      <AppAlertBanner v-if="error" :message="error" />

      <!-- Search and Tag Filter Bar -->
      <div class="space-y-3">
        <div class="relative">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by title, body, or tags…"
            class="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-950/60 pl-9 pr-9 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none transition-colors"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-200 cursor-pointer"
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
            class="rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-all cursor-pointer select-none border"
            :class="
              activeTag === 'all'
                ? 'bg-zinc-800 text-white border-zinc-800 shadow-xs'
                : 'text-zinc-400 border-zinc-800/80 hover:bg-zinc-900/40 hover:text-zinc-200'
            "
            @click="activeTag = 'all'"
          >
            All
            <span class="ml-1 font-mono text-[10px] tabular-nums text-zinc-500"
              >({{ items.length }})</span
            >
          </button>
          <button
            v-for="tagInfo in allTags"
            :key="tagInfo.tag"
            type="button"
            class="rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-all cursor-pointer select-none border"
            :class="
              activeTag === tagInfo.tag
                ? 'bg-zinc-800 text-white border-zinc-800 shadow-xs'
                : 'text-zinc-400 border-zinc-800/80 hover:bg-zinc-900/40 hover:text-zinc-200'
            "
            @click="activeTag = tagInfo.tag"
          >
            #{{ tagInfo.tag }}
            <span class="ml-1 font-mono text-[10px] tabular-nums text-zinc-500"
              >({{ tagInfo.count }})</span
            >
          </button>
        </div>
      </div>

      <!-- Shimmer Skeleton Loading State -->
      <div v-if="isLoading" class="space-y-3">
        <div
          v-for="n in 4"
          :key="n"
          class="flex items-center gap-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4"
        >
          <div class="h-10 w-10 shrink-0 rounded-xl bg-zinc-800 animate-pulse" />
          <div class="min-w-0 flex-1 space-y-2">
            <div class="h-4 w-48 rounded-md bg-zinc-800 animate-pulse" />
            <div class="h-3 w-72 rounded-md bg-zinc-800/60 animate-pulse" />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="items.length === 0"
        class="flex flex-col items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-6 py-16 text-center"
      >
        <div
          class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-500"
        >
          <Layers class="h-6 w-6" />
        </div>
        <h2 class="text-sm font-semibold tracking-tight text-zinc-200">No notes yet</h2>
        <p class="mt-1 max-w-sm text-sm text-zinc-500 leading-relaxed">
          Your private note stream is empty. Create your first encrypted Markdown note to keep
          ideas, snippets, and drafts safe.
        </p>
        <RouterLink
          to="/notes/new"
          class="mt-6 inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-4 text-xs font-semibold text-black shadow-xs transition-all hover:bg-zinc-200 active:scale-95"
        >
          <Plus class="h-3.5 w-3.5" :stroke-width="2.2" />
          <span>Create first note</span>
        </RouterLink>
      </div>

      <!-- Search No Results -->
      <div
        v-else-if="filteredItems.length === 0"
        class="flex flex-col items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-6 py-12 text-center"
      >
        <Search class="h-7 w-7 text-zinc-600 mb-3" />
        <h2 class="text-sm font-semibold text-zinc-200">No matching notes</h2>
        <p class="mt-1 text-sm text-zinc-500">
          No notes match your search query "{{ searchQuery }}".
        </p>
        <button
          type="button"
          class="mt-4 text-xs font-medium text-zinc-400 hover:text-white hover:underline cursor-pointer"
          @click="
            searchQuery = '';
            activeTag = 'all';
          "
        >
          Clear filters
        </button>
      </div>

      <!-- Notes List -->
      <div v-else class="space-y-3">
        <article
          v-for="item in filteredItems"
          :key="item.id"
          class="group/card relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4 sm:p-5 transition-colors duration-150 hover:border-zinc-700 hover:bg-zinc-900/40 cursor-pointer"
          @click="navigateToDetail(item)"
        >
          <div class="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
            <!-- Note Icon -->
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300"
            >
              <FileText class="h-5 w-5" :stroke-width="2" />
            </div>

            <!-- Content -->
            <div class="min-w-0 flex-1 space-y-1.5">
              <h2
                class="text-xs font-semibold tracking-tight text-zinc-200 group-hover/card:text-white transition-colors truncate sm:text-sm"
              >
                {{ item.title || "Untitled Note" }}
              </h2>

              <p class="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                {{ notePreview(item.body, 160) || "Empty note body." }}
              </p>

              <!-- Tags & Meta row -->
              <div class="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-zinc-600">
                <span class="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums">
                  <Calendar class="h-3 w-3" />
                  {{ formatDate(item.updatedAt || item.createdAt) }}
                </span>

                <span v-if="item.tags && item.tags.length" class="text-zinc-700">•</span>

                <div
                  v-if="item.tags && item.tags.length"
                  class="flex flex-wrap items-center gap-1.5"
                >
                  <span
                    v-for="tag in item.tags"
                    :key="tag"
                    class="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
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
            class="flex items-center gap-1.5 shrink-0 self-end sm:self-center border-t sm:border-t-0 border-zinc-800/80 pt-3 sm:pt-0 w-full sm:w-auto justify-end"
            @click.stop
          >
            <!-- Copy Note Markdown -->
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-200 transition-colors cursor-pointer"
              :title="copiedId === item.id ? 'Copied Markdown!' : 'Copy Markdown'"
              @click="copyContent(item.body, item.id, $event)"
            >
              <Check v-if="copiedId === item.id" class="h-4 w-4 text-emerald-400" />
              <Copy v-else class="h-4 w-4" />
            </button>

            <!-- Edit / View detail -->
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-200 transition-colors cursor-pointer"
              title="View & Edit note"
              @click="navigateToDetail(item)"
            >
              <Pencil class="h-3.5 w-3.5" />
            </button>

            <!-- Delete -->
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-colors cursor-pointer"
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
