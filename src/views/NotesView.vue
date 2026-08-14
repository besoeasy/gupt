<script setup>
import { ref, computed, onMounted } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  FileText,
  Trash2,
  Loader2,
  RefreshCw,
  Search,
  ExternalLink,
  Plus,
  X,
  Pencil,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import { useIdentityStore } from "@/stores/identity";
import {
  getNotesCached,
  fetchNotes,
  saveNote,
  deleteNote,
  renewExpiringNotes,
  normalizeNoteTags,
  parseNoteTagsInput,
  notePreview,
} from "@/lib/notes";

marked.setOptions({
  breaks: true,
  gfm: true,
});

const identity = useIdentityStore();
const isLoading = ref(true);
const isRefreshing = ref(false);
const isSaving = ref(false);
const items = ref([]);
const searchQuery = ref("");
const activeTag = ref("all");
const error = ref("");
const showForm = ref(false);
const editingId = ref(null);
const selectedItem = ref(null);
const pendingDelete = ref(null);

const emptyForm = () => ({
  title: "",
  body: "",
  tags: [],
});

const form = ref(emptyForm());
const tagDraft = ref("");

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

const formTitle = computed(() => (editingId.value ? "Edit note" : "Add note"));

const selectedHtml = computed(() => {
  if (!selectedItem.value?.body) return "";
  return DOMPurify.sanitize(marked.parse(selectedItem.value.body || ""));
});

onMounted(async () => {
  await loadItems();
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
    if (selectedItem.value) {
      selectedItem.value = next.find((n) => n.id === selectedItem.value.id) || null;
    }
  } catch (err) {
    console.error("Failed to load notes:", err);
    error.value = err?.message || "Failed to load notes.";
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
}

function openCreateForm() {
  editingId.value = null;
  form.value = emptyForm();
  tagDraft.value = "";
  showForm.value = true;
  selectedItem.value = null;
  error.value = "";
}

function openEditForm(item) {
  editingId.value = item.id;
  form.value = {
    title: item.title || "",
    body: item.body || "",
    tags: [...(item.tags || [])],
  };
  tagDraft.value = "";
  showForm.value = true;
  selectedItem.value = null;
  error.value = "";
}

function closeForm() {
  showForm.value = false;
  editingId.value = null;
  form.value = emptyForm();
  tagDraft.value = "";
}

function addTagFromDraft() {
  form.value.tags = normalizeNoteTags([...form.value.tags, ...parseNoteTagsInput(tagDraft.value)]);
  tagDraft.value = "";
}

function removeFormTag(tag) {
  form.value.tags = form.value.tags.filter((t) => t !== tag);
}

async function handleSave() {
  if (isSaving.value) return;
  if (tagDraft.value.trim()) addTagFromDraft();
  isSaving.value = true;
  error.value = "";
  try {
    const saved = await saveNote(
      identity.privkeyHex,
      identity.pubkeyHex,
      {
        title: form.value.title,
        body: form.value.body,
        tags: form.value.tags,
      },
      { id: editingId.value || undefined, existingItems: items.value },
    );
    items.value = [saved, ...items.value.filter((n) => n.id !== saved.id)].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    );
    closeForm();
    selectedItem.value = saved;
  } catch (err) {
    error.value = err?.message || "Failed to save note.";
  } finally {
    isSaving.value = false;
  }
}

function openItem(item) {
  selectedItem.value = item;
}

function closeDetail() {
  selectedItem.value = null;
}

function getNjumpUrl(item) {
  if (!item?.eventId) return "";
  return `https://njump.me/e/${item.eventId}`;
}

function subtitle(item) {
  const parts = [];
  const preview = notePreview(item.body, 80);
  if (preview) parts.push(preview);
  if ((item.tags || []).length) parts.push(item.tags.slice(0, 3).join(" · "));
  return parts.join(" · ");
}

async function handleDelete(item) {
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
    if (selectedItem.value?.id === item.id) selectedItem.value = null;
    if (editingId.value === item.id) closeForm();
  } catch (err) {
    error.value = err?.message || "Failed to delete note.";
  }
}

const inputClass =
  "block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-2.5 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]";
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div
      class="mx-auto w-full max-w-[80rem] px-4 pt-4 pb-10 sm:px-8 sm:pt-6 sm:pb-12 lg:px-10 lg:pt-8 lg:pb-16"
    >
      <div class="mx-auto max-w-2xl space-y-6">
        <AppAlertBanner v-if="error" :message="error" />

        <div v-if="isLoading" class="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 class="mb-4 h-7 w-7 animate-spin text-(--app-primary)" />
          <p class="text-sm font-medium text-(--app-text-soft)">Loading notes…</p>
        </div>

        <template v-else>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-(--app-muted)">
              <span class="font-semibold tabular-nums text-(--app-text)">{{ items.length }}</span>
              {{ items.length === 1 ? "note" : "notes" }}
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                :disabled="isRefreshing"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-60"
                @click="refreshFromRelay"
              >
                <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': isRefreshing }" />
                Sync
              </button>
              <button
                type="button"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-(--app-primary) px-3.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-[0.97]"
                @click="openCreateForm"
              >
                <Plus class="h-3.5 w-3.5" />
                New
              </button>
            </div>
          </div>

          <form
            v-if="showForm"
            class="space-y-3 rounded-2xl border border-(--app-border) bg-(--app-surface) p-4"
            @submit.prevent="handleSave"
          >
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-semibold">{{ formTitle }}</p>
              <button
                type="button"
                class="rounded-lg p-1 text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                title="Close"
                @click="closeForm"
              >
                <X class="h-4 w-4" />
              </button>
            </div>

            <input
              v-model="form.title"
              type="text"
              placeholder="Title (optional)"
              :class="inputClass"
            />
            <textarea
              v-model="form.body"
              rows="10"
              placeholder="Write in Markdown…"
              :class="inputClass + ' font-mono text-[13px] leading-6'"
            />

            <div class="space-y-2">
              <div class="flex gap-2">
                <input
                  v-model="tagDraft"
                  type="text"
                  placeholder="Add tag…"
                  :class="inputClass"
                  @keydown.enter.prevent="addTagFromDraft"
                />
                <button
                  type="button"
                  class="inline-flex shrink-0 items-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-muted) transition-colors hover:text-(--app-text)"
                  @click="addTagFromDraft"
                >
                  Add tag
                </button>
              </div>
              <div v-if="form.tags.length" class="flex flex-wrap gap-1.5">
                <button
                  v-for="tag in form.tags"
                  :key="tag"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full bg-(--app-primary)/10 px-2.5 py-1 text-[11px] font-medium text-(--app-primary)"
                  @click="removeFormTag(tag)"
                >
                  {{ tag }}
                  <X class="h-3 w-3" />
                </button>
              </div>
            </div>

            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="px-3 py-2 text-xs font-medium text-(--app-muted) transition-colors hover:text-(--app-text)"
                @click="closeForm"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="isSaving"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-(--app-primary) px-3.5 text-xs font-semibold text-white transition-colors hover:bg-(--app-primary-strong) disabled:opacity-50"
              >
                <Loader2 v-if="isSaving" class="h-3.5 w-3.5 animate-spin" />
                <Plus v-else class="h-3.5 w-3.5" />
                Save
              </button>
            </div>
          </form>

          <div v-if="items.length === 0 && !showForm" class="py-12 text-center">
            <div
              class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--app-primary-soft) text-(--app-primary)"
            >
              <FileText class="h-7 w-7" />
            </div>
            <h2 class="mb-2 text-lg font-semibold">No notes yet</h2>
            <p class="mx-auto mb-6 max-w-sm text-sm leading-6 text-(--app-muted)">
              Write encrypted Markdown notes that sync privately across your devices.
            </p>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-xl bg-(--app-primary) px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-(--app-primary-strong)"
              @click="openCreateForm"
            >
              <Plus class="h-4 w-4" />
              Add note
            </button>
          </div>

          <template v-else-if="items.length > 0">
            <div class="space-y-3">
              <div class="relative">
                <div
                  class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-(--app-muted-2)"
                >
                  <Search class="h-4 w-4" />
                </div>
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search…"
                  class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) py-2.5 pr-4 pl-10 text-sm text-(--app-text) transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
                />
              </div>

              <div v-if="allTags.length" class="flex gap-2 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  class="rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors"
                  :class="
                    activeTag === 'all'
                      ? 'bg-(--app-primary)/15 text-(--app-primary)'
                      : 'text-(--app-muted) hover:text-(--app-text)'
                  "
                  @click="activeTag = 'all'"
                >
                  All
                </button>
                <button
                  v-for="tagInfo in allTags"
                  :key="tagInfo.tag"
                  type="button"
                  class="rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors"
                  :class="
                    activeTag === tagInfo.tag
                      ? 'bg-(--app-primary)/15 text-(--app-primary)'
                      : 'text-(--app-muted) hover:text-(--app-text)'
                  "
                  @click="activeTag = tagInfo.tag"
                >
                  {{ tagInfo.tag }}
                  <span class="opacity-50">{{ tagInfo.count }}</span>
                </button>
              </div>
            </div>

            <div
              v-if="filteredItems.length === 0"
              class="py-16 text-center text-sm text-(--app-muted)"
            >
              No notes match your search or filter.
            </div>

            <ul v-else class="divide-y divide-(--app-border) border-y border-(--app-border)">
              <li
                v-for="item in filteredItems"
                :key="item.id"
                class="cursor-pointer transition-colors hover:bg-(--app-surface-soft)/40"
                @click="openItem(item)"
              >
                <div class="flex items-center gap-3 px-1 py-3">
                  <FileText class="h-4 w-4 shrink-0 text-(--app-primary)" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium tracking-tight">
                      {{ item.title || "Note" }}
                    </p>
                    <p class="truncate text-xs text-(--app-muted)">
                      {{ subtitle(item) }}
                    </p>
                  </div>
                  <a
                    v-if="getNjumpUrl(item)"
                    :href="getNjumpUrl(item)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="rounded-lg p-1.5 text-(--app-muted) transition-colors hover:bg-(--app-primary-soft)/40 hover:text-(--app-primary)"
                    title="View event on njump.me"
                    @click.stop
                  >
                    <ExternalLink class="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    class="rounded-lg p-1.5 text-(--app-muted) transition-colors hover:bg-red-500/10 hover:text-red-400"
                    title="Delete"
                    @click.stop="handleDelete(item)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            </ul>
          </template>
        </template>
      </div>
    </div>

    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="selectedItem"
          class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
        >
          <div class="absolute inset-0 bg-black/70" @click="closeDetail" />

          <div
            class="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-(--app-border) bg-(--app-surface) shadow-[0_24px_64px_rgba(0,0,0,0.4)] sm:rounded-3xl"
          >
            <div
              class="flex shrink-0 items-center justify-between gap-3 border-b border-(--app-border) px-5 py-4"
            >
              <div class="flex min-w-0 items-center gap-3">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--app-primary-soft) text-(--app-primary) ring-1 ring-inset ring-(--app-primary)/20"
                >
                  <FileText class="h-5 w-5" />
                </div>
                <div class="min-w-0">
                  <h2 class="truncate text-base font-bold">
                    {{ selectedItem.title || "Note" }}
                  </h2>
                  <p
                    v-if="(selectedItem.tags || []).length"
                    class="truncate text-xs text-(--app-muted)"
                  >
                    {{ selectedItem.tags.join(" · ") }}
                  </p>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) transition-colors hover:text-(--app-text)"
                  title="Edit"
                  @click="openEditForm(selectedItem)"
                >
                  <Pencil class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) transition-colors hover:text-red-400"
                  title="Delete"
                  @click="handleDelete(selectedItem)"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) transition-colors hover:text-(--app-text)"
                  @click="closeDetail"
                >
                  <X class="h-5 w-5" />
                </button>
              </div>
            </div>

            <div class="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div
                v-if="selectedHtml"
                class="prose prose-sm max-w-none text-(--app-text-soft)"
                v-html="selectedHtml"
              />
              <p v-else class="text-sm text-(--app-muted)">Empty note.</p>

              <div class="border-t border-(--app-border) pt-2">
                <a
                  v-if="getNjumpUrl(selectedItem)"
                  :href="getNjumpUrl(selectedItem)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="group flex items-center justify-center gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-3 transition-colors hover:border-(--app-primary)/30 hover:bg-(--app-primary-soft)/30"
                >
                  <ExternalLink
                    class="h-4 w-4 text-(--app-muted) transition-colors group-hover:text-(--app-primary)"
                  />
                  <span
                    class="text-sm font-medium text-(--app-muted) transition-colors group-hover:text-(--app-text)"
                  >
                    View event on njump.me
                  </span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <AppConfirmDialog
      :open="!!pendingDelete"
      title="Delete note?"
      message="This publishes a delete tombstone. The note will disappear from your list."
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </main>
</template>

<style>
.prose {
  --tw-prose-body: var(--app-text-soft);
  --tw-prose-headings: var(--app-text);
  --tw-prose-links: var(--app-primary);
  --tw-prose-bold: var(--app-text);
  --tw-prose-code: var(--app-text-soft);
  --tw-prose-pre-bg: var(--app-surface);
  --tw-prose-pre-code: var(--app-text-soft);
}
.prose :where(code):not(:where([class~="not-prose"], [class~="not-prose"] *)) {
  background: var(--app-surface);
  padding: 0.2em 0.4em;
  border-radius: 0.25rem;
  font-size: 0.875em;
}
.prose :where(pre):not(:where([class~="not-prose"], [class~="not-prose"] *)) {
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 0.75rem;
  padding: 1rem;
  overflow-x: auto;
}
.prose :where(a):not(:where([class~="not-prose"], [class~="not-prose"] *)) {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.prose :where(strong):not(:where([class~="not-prose"], [class~="not-prose"] *)) {
  color: var(--app-text);
  font-weight: 600;
}
.prose :where(h1, h2, h3):not(:where([class~="not-prose"], [class~="not-prose"] *)) {
  color: var(--app-text);
  font-weight: 600;
  margin-top: 1em;
  margin-bottom: 0.4em;
}
.prose :where(p, ul, ol):not(:where([class~="not-prose"], [class~="not-prose"] *)) {
  margin-bottom: 0.75em;
}
.prose :where(ul, ol):not(:where([class~="not-prose"], [class~="not-prose"] *)) {
  padding-left: 1.25em;
}
</style>
