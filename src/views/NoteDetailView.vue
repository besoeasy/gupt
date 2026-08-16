<script setup>
import { ref, computed, onMounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  FileText,
  Trash2,
  Loader2,
  Check,
  X,
  Pencil,
  Copy,
  Heading1,
  Heading2,
  Bold,
  Italic,
  Code,
  SquareCode,
  ListTodo,
  List,
  Quote,
  Link as LinkIcon,
  Eye,
  Tag,
  Calendar,
  ShieldCheck,
  ExternalLink,
} from "@lucide/vue";
import PageBackHeader from "@/components/PageBackHeader.vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import { useIdentityStore } from "@/stores/identity";
import { copyToClipboard } from "@/lib/clipboard";
import {
  getNotesCached,
  fetchNotes,
  saveNote,
  deleteNote,
  normalizeNoteTags,
  parseNoteTagsInput,
} from "@/lib/notes";

marked.setOptions({
  breaks: true,
  gfm: true,
});

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();

const noteId = computed(() => route.params.id || "");
const isNew = computed(() => !noteId.value || route.path === "/notes/new");

const isLoading = ref(!isNew.value);
const isSaving = ref(false);
const isDeleting = ref(false);
const error = ref("");
const showDeleteConfirm = ref(false);

const noteItem = ref(null);
const isEditing = ref(isNew.value);
const editorMode = ref("write"); // 'write' | 'preview'
const bodyTextareaRef = ref(null);

const form = ref({
  title: "",
  body: "",
  tags: [],
});
const tagDraft = ref("");
const copiedBody = ref(false);
let copyBodyTimer = null;
const copiedEventId = ref(false);
let copyEventTimer = null;

const renderedHtml = computed(() => {
  const text = isEditing.value ? form.value.body : noteItem.value?.body || form.value.body;
  if (!text?.trim()) {
    return "<p class='text-sm italic text-(--app-muted)'>Empty note content.</p>";
  }
  return DOMPurify.sanitize(marked.parse(text));
});

const markdownActions = [
  { id: "h1", label: "Heading 1", icon: Heading1 },
  { id: "h2", label: "Heading 2", icon: Heading2 },
  { id: "bold", label: "Bold", icon: Bold },
  { id: "italic", label: "Italic", icon: Italic },
  { id: "code", label: "Inline Code", icon: Code },
  { id: "codeblock", label: "Code Block", icon: SquareCode },
  { id: "task", label: "Task List", icon: ListTodo },
  { id: "list", label: "Bullet List", icon: List },
  { id: "quote", label: "Quote", icon: Quote },
  { id: "link", label: "Link", icon: LinkIcon },
];

function applyMarkdown(actionId) {
  const el = bodyTextareaRef.value;
  if (!el) return;
  const start = el.selectionStart || 0;
  const end = el.selectionEnd || 0;
  const text = form.value.body;
  const selected = text.slice(start, end);
  let insert = "";
  let cursorOffset = 0;

  switch (actionId) {
    case "h1":
      insert = `# ${selected || "Heading"}`;
      cursorOffset = insert.length;
      break;
    case "h2":
      insert = `## ${selected || "Heading"}`;
      cursorOffset = insert.length;
      break;
    case "bold":
      insert = `**${selected || "bold text"}**`;
      cursorOffset = selected ? insert.length : 2;
      break;
    case "italic":
      insert = `*${selected || "italic text"}*`;
      cursorOffset = selected ? insert.length : 1;
      break;
    case "code":
      insert = `\`${selected || "code"}\``;
      cursorOffset = selected ? insert.length : 1;
      break;
    case "codeblock":
      insert = `\`\`\`\n${selected || "code block"}\n\`\`\``;
      cursorOffset = selected ? insert.length : 4;
      break;
    case "task":
      insert = `- [ ] ${selected || "Task item"}`;
      cursorOffset = insert.length;
      break;
    case "list":
      insert = `- ${selected || "List item"}`;
      cursorOffset = insert.length;
      break;
    case "quote":
      insert = `> ${selected || "Quote"}`;
      cursorOffset = insert.length;
      break;
    case "link":
      insert = `[${selected || "Link text"}](https://example.com)`;
      cursorOffset = insert.length - 1;
      break;
  }

  form.value.body = text.slice(0, start) + insert + text.slice(end);
  void nextTick(() => {
    el.focus();
    el.setSelectionRange(start + cursorOffset, start + cursorOffset);
  });
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function addTagFromDraft() {
  const parsed = parseNoteTagsInput(tagDraft.value);
  if (!parsed.length) return;
  form.value.tags = normalizeNoteTags([...form.value.tags, ...parsed]);
  tagDraft.value = "";
}

function removeTag(tag) {
  form.value.tags = form.value.tags.filter((t) => t !== tag);
}

async function copyBody() {
  const text = form.value.body || noteItem.value?.body;
  if (!text) return;
  await copyToClipboard(text);
  copiedBody.value = true;
  if (copyBodyTimer) clearTimeout(copyBodyTimer);
  copyBodyTimer = setTimeout(() => {
    copiedBody.value = false;
  }, 1800);
}

async function copyEventId(id) {
  if (!id) return;
  await copyToClipboard(id);
  copiedEventId.value = true;
  if (copyEventTimer) clearTimeout(copyEventTimer);
  copyEventTimer = setTimeout(() => {
    copiedEventId.value = false;
  }, 1800);
}

function getNjumpUrl(eventId) {
  if (!eventId) return "";
  return `https://njump.me/e/${eventId}`;
}

async function loadNote() {
  if (isNew.value) {
    isEditing.value = true;
    return;
  }
  isLoading.value = true;
  error.value = "";
  try {
    const cached = await getNotesCached(identity.privkeyHex, identity.pubkeyHex);
    let item = (cached?.items || []).find((n) => n.id === noteId.value);

    if (!item) {
      const live = await fetchNotes(identity.privkeyHex, identity.pubkeyHex);
      item = live.find((n) => n.id === noteId.value);
    }

    if (!item) {
      error.value = "Note not found or has been deleted.";
      return;
    }

    noteItem.value = item;
    form.value = {
      title: item.title || "",
      body: item.body || "",
      tags: [...(item.tags || [])],
    };
  } catch (err) {
    error.value = err?.message || "Failed to load note.";
  } finally {
    isLoading.value = false;
  }
}

async function handleSave() {
  if (isSaving.value) return;
  if (tagDraft.value.trim()) addTagFromDraft();
  if (!form.value.title.trim() && !form.value.body.trim()) {
    error.value = "Note title or body is required.";
    return;
  }

  isSaving.value = true;
  error.value = "";
  try {
    await saveNote(
      identity.privkeyHex,
      identity.pubkeyHex,
      {
        title: form.value.title,
        body: form.value.body,
        tags: form.value.tags,
      },
      { id: isNew.value ? null : noteId.value },
    );
    router.push("/notes");
  } catch (err) {
    error.value = err?.message || "Failed to save note.";
  } finally {
    isSaving.value = false;
  }
}

async function confirmDelete() {
  if (!noteItem.value) return;
  isDeleting.value = true;
  error.value = "";
  try {
    await deleteNote(identity.privkeyHex, identity.pubkeyHex, noteItem.value);
    showDeleteConfirm.value = false;
    router.push("/notes");
  } catch (err) {
    error.value = err?.message || "Failed to delete note.";
  } finally {
    isDeleting.value = false;
  }
}

onMounted(() => {
  loadNote();
});
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) pb-16 lg:h-full"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-3xl space-y-6">
        <PageBackHeader
          back-to="/notes"
          back-label="Notes"
          :eyebrow="isNew ? 'New Note' : 'Encrypted Markdown Note'"
          :title="isNew ? 'Create Note' : form.title || 'Untitled Note'"
        >
          <p class="text-sm leading-6 text-(--app-muted)">
            {{
              isNew
                ? "Write private notes with full Markdown formatting, encrypted locally with your keys."
                : "Stored securely with end-to-end encryption on your relays."
            }}
          </p>
        </PageBackHeader>

        <AppAlertBanner v-if="error" :message="error" />

        <!-- Loading State -->
        <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 text-center">
          <Loader2 class="h-8 w-8 animate-spin text-(--app-primary)" />
          <p class="mt-3 text-sm text-(--app-muted)">Fetching encrypted note…</p>
        </div>

        <template v-else>
          <!-- View / Read Mode (when not editing an existing note) -->
          <article
            v-if="!isEditing && noteItem"
            class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-6 sm:p-8 shadow-sm space-y-6"
          >
            <!-- Top Controls -->
            <div
              class="flex flex-wrap items-center justify-between gap-3 border-b border-(--app-border) pb-4"
            >
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-(--app-primary) px-3.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-(--app-primary-strong) active:scale-95 cursor-pointer"
                  @click="isEditing = true"
                >
                  <Pencil class="h-3.5 w-3.5" />
                  <span>Edit Note</span>
                </button>
                <button
                  type="button"
                  class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 text-xs font-semibold text-(--app-text-soft) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors cursor-pointer"
                  @click="copyBody"
                >
                  <Check v-if="copiedBody" class="h-3.5 w-3.5 text-emerald-400" />
                  <Copy v-else class="h-3.5 w-3.5" />
                  <span>{{ copiedBody ? "Copied" : "Copy markdown" }}</span>
                </button>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/5 px-3 text-xs font-semibold text-red-400 hover:bg-red-500/15 transition-colors cursor-pointer"
                  @click="showDeleteConfirm = true"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>

            <!-- Tags -->
            <div v-if="form.tags.length" class="flex flex-wrap gap-1.5">
              <span
                v-for="tag in form.tags"
                :key="tag"
                class="rounded-md border border-(--app-border) bg-(--app-surface-soft) px-2.5 py-1 text-xs font-semibold text-(--app-text-soft)"
              >
                #{{ tag }}
              </span>
            </div>

            <!-- Markdown Rendered Body -->
            <div
              class="prose prose-zinc dark:prose-invert max-w-none text-sm sm:text-base leading-relaxed break-words"
              v-html="renderedHtml"
            />
          </article>

          <!-- Edit / Create Form Card -->
          <form
            v-else
            class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-5 sm:p-7 shadow-sm space-y-5"
            @submit.prevent="handleSave"
          >
            <!-- Title -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-(--app-text)">
                Title
              </label>
              <input
                v-model="form.title"
                type="text"
                placeholder="Note title (leave empty to derive from first line)"
                class="block w-full rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors font-semibold"
              />
            </div>

            <!-- Editor Toolbar & Mode Switcher -->
            <div class="space-y-2">
              <div
                class="flex flex-wrap items-center justify-between gap-2 border-b border-(--app-border) pb-2.5"
              >
                <!-- Mode Switcher -->
                <div
                  class="flex items-center rounded-xl bg-(--app-surface-soft) p-0.5 border border-(--app-border)"
                >
                  <button
                    type="button"
                    class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
                    :class="
                      editorMode === 'write'
                        ? 'bg-(--app-surface) text-(--app-text) shadow-xs'
                        : 'text-(--app-muted) hover:text-(--app-text)'
                    "
                    @click="editorMode = 'write'"
                  >
                    <Pencil class="h-3.5 w-3.5" />
                    <span>Write</span>
                  </button>
                  <button
                    type="button"
                    class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
                    :class="
                      editorMode === 'preview'
                        ? 'bg-(--app-surface) text-(--app-text) shadow-xs'
                        : 'text-(--app-muted) hover:text-(--app-text)'
                    "
                    @click="editorMode = 'preview'"
                  >
                    <Eye class="h-3.5 w-3.5" />
                    <span>Preview</span>
                  </button>
                </div>

                <!-- Formatting Toolbar (Visible in write mode) -->
                <div v-if="editorMode === 'write'" class="flex flex-wrap items-center gap-1">
                  <button
                    v-for="btn in markdownActions"
                    :key="btn.id"
                    type="button"
                    class="inline-flex h-8 w-8 items-center justify-center rounded-xl text-(--app-muted) hover:bg-(--app-surface-soft) hover:text-(--app-text) transition-colors cursor-pointer"
                    :title="btn.label"
                    @click="applyMarkdown(btn.id)"
                  >
                    <component :is="btn.icon" class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <!-- Write Area -->
              <div v-if="editorMode === 'write'" class="relative">
                <textarea
                  ref="bodyTextareaRef"
                  v-model="form.body"
                  rows="14"
                  placeholder="Write your note with Markdown formatting (headings, checklists, code blocks, tables)…"
                  class="block w-full rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4 font-mono text-sm leading-relaxed text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors resize-y"
                />
              </div>

              <!-- Preview Area -->
              <div
                v-else
                class="min-h-[350px] rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-5 prose prose-zinc dark:prose-invert max-w-none text-sm leading-relaxed"
                v-html="renderedHtml"
              />
            </div>

            <!-- Tags -->
            <div class="space-y-2">
              <label class="block text-xs font-bold uppercase tracking-wider text-(--app-text)">
                Tags
              </label>
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <Tag
                    class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-(--app-muted)"
                  />
                  <input
                    v-model="tagDraft"
                    type="text"
                    placeholder="Add tags (e.g. personal, ideas, meetings) and press Enter…"
                    class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) pl-10 pr-4 py-2 text-xs text-(--app-text) placeholder:text-(--app-muted-2) focus:border-(--app-primary) focus:outline-none transition-colors"
                    @keydown.enter.prevent="addTagFromDraft"
                    @keydown.comma.prevent="addTagFromDraft"
                  />
                </div>
                <button
                  type="button"
                  :disabled="!tagDraft.trim()"
                  class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2 text-xs font-semibold text-(--app-text) hover:bg-(--app-surface-hover) disabled:opacity-40 transition-colors cursor-pointer"
                  @click="addTagFromDraft"
                >
                  Add
                </button>
              </div>

              <div v-if="form.tags.length" class="flex flex-wrap gap-2 pt-1">
                <span
                  v-for="tag in form.tags"
                  :key="tag"
                  class="inline-flex items-center gap-1.5 rounded-full border border-(--app-border) bg-(--app-surface-soft) px-3 py-1 text-xs font-semibold text-(--app-text)"
                >
                  <span>#{{ tag }}</span>
                  <button
                    type="button"
                    class="text-(--app-muted) hover:text-rose-400 transition-colors cursor-pointer"
                    title="Remove tag"
                    @click="removeTag(tag)"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            </div>

            <!-- Form Actions -->
            <div
              class="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 border-t border-(--app-border) pt-5"
            >
              <div class="flex items-center gap-2 w-full sm:w-auto">
                <button
                  v-if="!isNew"
                  type="button"
                  class="inline-flex h-10 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  @click="showDeleteConfirm = true"
                >
                  <Trash2 class="h-4 w-4" />
                  <span>Delete</span>
                </button>
              </div>

              <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  class="inline-flex h-10 flex-1 sm:flex-initial items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 text-xs font-semibold text-(--app-text-soft) hover:bg-(--app-surface-hover) hover:text-(--app-text) transition-colors cursor-pointer"
                  @click="isNew ? router.push('/notes') : (isEditing = false)"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  :disabled="isSaving"
                  class="inline-flex h-10 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl bg-(--app-primary) px-6 text-xs font-bold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  <Loader2 v-if="isSaving" class="h-4 w-4 animate-spin" />
                  <Check v-else class="h-4 w-4" />
                  <span>{{ isNew ? "Save Note" : "Save Changes" }}</span>
                </button>
              </div>
            </div>
          </form>

          <!-- Metadata Section -->
          <section
            v-if="!isNew && noteItem"
            class="rounded-3xl border border-(--app-border) bg-(--app-surface) p-5 sm:p-6 space-y-4"
          >
            <div
              class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-(--app-muted)"
            >
              <ShieldCheck class="h-4 w-4 text-emerald-400" />
              <span>Encrypted Storage Details</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div
                class="space-y-1 rounded-2xl bg-(--app-surface-soft) p-3.5 border border-(--app-border)/60"
              >
                <p class="text-(--app-muted)">Created</p>
                <p class="font-medium text-(--app-text)">{{ formatDate(noteItem.createdAt) }}</p>
              </div>

              <div
                class="space-y-1 rounded-2xl bg-(--app-surface-soft) p-3.5 border border-(--app-border)/60"
              >
                <p class="text-(--app-muted)">Last Updated</p>
                <p class="font-medium text-(--app-text)">{{ formatDate(noteItem.updatedAt) }}</p>
              </div>

              <div
                v-if="noteItem.eventId"
                class="sm:col-span-2 space-y-1.5 rounded-2xl bg-(--app-surface-soft) p-3.5 border border-(--app-border)/60"
              >
                <div class="flex items-center justify-between">
                  <p class="text-(--app-muted)">Event ID</p>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-[11px] font-semibold text-(--app-primary) hover:underline cursor-pointer"
                      @click="copyEventId(noteItem.eventId)"
                    >
                      <Check v-if="copiedEventId" class="h-3 w-3 text-emerald-400" />
                      <Copy v-else class="h-3 w-3" />
                      <span>{{ copiedEventId ? "Copied" : "Copy ID" }}</span>
                    </button>
                    <span class="text-(--app-muted)">·</span>
                    <a
                      :href="getNjumpUrl(noteItem.eventId)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 text-[11px] font-semibold text-(--app-muted) hover:text-(--app-text)"
                    >
                      <ExternalLink class="h-3 w-3" />
                      <span>njump</span>
                    </a>
                  </div>
                </div>
                <p class="font-mono text-[11px] text-(--app-muted) break-all">
                  {{ noteItem.eventId }}
                </p>
              </div>
            </div>
          </section>
        </template>
      </div>
    </div>

    <!-- Confirm Delete Modal -->
    <AppConfirmDialog
      :open="showDeleteConfirm"
      title="Delete Note?"
      message="This will publish an encrypted deletion tombstone to your relays. This action cannot be undone."
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />
  </main>
</template>
