<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Trash2, LoaderCircle, Check, X, Pencil, Copy, Tag, ShieldCheck } from "@/icons";
import PageHeader from "@/components/PageHeader.vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
import RelayEventLink from "@/components/RelayEventLink.vue";
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

const bodyText = computed(() => {
  const text = isEditing.value ? form.value.body : noteItem.value?.body || form.value.body;
  return String(text || "").trimEnd();
});

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
  <main class="note-page">
    <div class="note-page__inner">
      <PageHeader
        :eyebrow="isNew ? 'New Note' : 'Encrypted Note'"
        :title="isNew ? 'Create Note' : form.title || 'Untitled Note'"
      >
        <p class="note-page__intro">
          {{
            isNew
              ? "Write a private note, encrypted locally with your keys before it leaves this device."
              : "Stored securely with end-to-end encryption on your relays."
          }}
        </p>
      </PageHeader>

      <AppAlertBanner v-if="error" :message="error" />

      <!-- Loading state -->
      <div v-if="isLoading" class="note-card note-card--loading" role="status">
        <span class="note-visually-hidden">Fetching encrypted note…</span>

        <div class="note-card__top">
          <div class="note-card__controls">
            <AppSkeleton class="note-skeleton note-skeleton--button" />
            <AppSkeleton class="note-skeleton note-skeleton--button-wide" />
          </div>
          <AppSkeleton class="note-skeleton note-skeleton--button" />
        </div>

        <div class="note-tags">
          <AppSkeleton v-for="n in 3" :key="n" class="note-skeleton note-skeleton--tag" />
        </div>

        <div class="note-skeleton-body">
          <AppSkeleton class="note-skeleton note-skeleton--line-title" />
          <div class="note-skeleton-lines">
            <AppSkeleton class="note-skeleton note-skeleton--line" />
            <AppSkeleton class="note-skeleton note-skeleton--line note-skeleton--line-95" />
            <AppSkeleton class="note-skeleton note-skeleton--line note-skeleton--line-80" />
            <AppSkeleton class="note-skeleton note-skeleton--line note-skeleton--line-65" />
          </div>
        </div>
      </div>

      <template v-else>
        <!-- Read mode -->
        <article v-if="!isEditing && noteItem" class="note-card">
          <div class="note-card__top">
            <div class="note-card__controls">
              <button
                type="button"
                class="note-button note-button--primary"
                @click="isEditing = true"
              >
                <Pencil class="note-icon" :stroke-width="2.2" />
                <span>Edit Note</span>
              </button>
              <button type="button" class="note-button" @click="copyBody">
                <Check v-if="copiedBody" class="note-icon note-icon--success" />
                <Copy v-else class="note-icon" />
                <span>{{ copiedBody ? "Copied" : "Copy text" }}</span>
              </button>
            </div>

            <button
              type="button"
              class="note-button note-button--danger"
              @click="showDeleteConfirm = true"
            >
              <Trash2 class="note-icon" />
              <span>Delete</span>
            </button>
          </div>

          <div v-if="form.tags.length" class="note-tags">
            <span v-for="tag in form.tags" :key="tag" class="note-tag note-tag--muted">
              #{{ tag }}
            </span>
          </div>

          <div v-if="bodyText" class="note-body">{{ bodyText }}</div>
          <p v-else class="note-body note-body--empty">Empty note content.</p>
        </article>

        <!-- Edit / create form -->
        <form v-else class="note-card" @submit.prevent="handleSave">
          <div class="note-field">
            <label class="note-label" for="note-title">Title</label>
            <input
              id="note-title"
              v-model="form.title"
              type="text"
              placeholder="Note title (leave empty to derive from first line)"
              class="note-input"
            />
          </div>

          <div class="note-field">
            <label class="note-label" for="note-body">Note</label>
            <textarea
              id="note-body"
              v-model="form.body"
              rows="14"
              placeholder="Write your note…"
              class="note-input note-textarea"
            />
            <p class="note-hint">
              Plain text only. Line breaks are kept exactly as you write them.
            </p>
          </div>

          <div class="note-field">
            <label class="note-label" for="note-tags">Tags</label>
            <div class="note-tag-row">
              <div class="note-tag-input-wrap">
                <Tag class="note-tag-icon" />
                <input
                  id="note-tags"
                  v-model="tagDraft"
                  type="text"
                  placeholder="Add tags (e.g. personal, ideas, meetings) and press Enter…"
                  class="note-input note-input--tag"
                  @keydown.enter.prevent="addTagFromDraft"
                  @keydown.comma.prevent="addTagFromDraft"
                />
              </div>
              <button
                type="button"
                :disabled="!tagDraft.trim()"
                class="note-button note-button--secondary"
                @click="addTagFromDraft"
              >
                Add
              </button>
            </div>

            <div v-if="form.tags.length" class="note-tags note-tags--editable">
              <span v-for="tag in form.tags" :key="tag" class="note-tag">
                <span>#{{ tag }}</span>
                <button
                  type="button"
                  class="note-tag__remove"
                  title="Remove tag"
                  @click="removeTag(tag)"
                >
                  <X class="note-icon note-icon--xs" />
                </button>
              </span>
            </div>
          </div>

          <div class="note-actions">
            <button
              v-if="!isNew"
              type="button"
              class="note-button note-button--danger"
              @click="showDeleteConfirm = true"
            >
              <Trash2 class="note-icon" />
              <span>Delete</span>
            </button>
            <div class="note-actions__end">
              <button
                type="button"
                class="note-button note-button--secondary"
                @click="isNew ? router.push('/notes') : (isEditing = false)"
              >
                Cancel
              </button>
              <button type="submit" :disabled="isSaving" class="note-button note-button--primary">
                <LoaderCircle v-if="isSaving" class="note-icon note-icon--spin" />
                <Check v-else class="note-icon" />
                <span>{{ isNew ? "Save Note" : "Save Changes" }}</span>
              </button>
            </div>
          </div>
        </form>

        <!-- Metadata -->
        <section v-if="!isNew && noteItem" class="note-meta">
          <div class="note-meta__heading">
            <ShieldCheck class="note-icon note-icon--success" />
            <span>Encrypted Storage Details</span>
          </div>

          <div class="note-meta__grid">
            <div class="note-meta__item">
              <p class="note-meta__key">Created</p>
              <p class="note-meta__value">{{ formatDate(noteItem.createdAt) }}</p>
            </div>

            <div class="note-meta__item">
              <p class="note-meta__key">Last Updated</p>
              <p class="note-meta__value">{{ formatDate(noteItem.updatedAt) }}</p>
            </div>

            <div v-if="noteItem.eventId" class="note-meta__item note-meta__item--wide">
              <div class="note-meta__event-head">
                <p class="note-meta__key">Event ID</p>
                <div class="note-meta__event-tools">
                  <button
                    type="button"
                    class="note-link-button"
                    @click="copyEventId(noteItem.eventId)"
                  >
                    <Check
                      v-if="copiedEventId"
                      class="note-icon note-icon--xs note-icon--success"
                    />
                    <Copy v-else class="note-icon note-icon--xs" />
                    <span>{{ copiedEventId ? "Copied" : "Copy ID" }}</span>
                  </button>
                  <span class="note-meta__dot" aria-hidden="true">·</span>
                  <RelayEventLink :event-id="noteItem.eventId" />
                </div>
              </div>
              <p class="note-event-id">{{ noteItem.eventId }}</p>
            </div>
          </div>
        </section>
      </template>
    </div>

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

<style scoped>
.note-page {
  min-height: 100dvh;
  padding-bottom: 64px;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--app-bg);
  color: var(--app-text);
}

.note-page__inner {
  display: flex;
  flex-direction: column;
  gap: 22px;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: 24px 16px;
}

.note-page__intro {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--app-muted);
}

.note-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.note-card,
.note-meta {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  animation: rise-in 320ms var(--app-ease-standard) backwards;
}

.note-card__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--app-border);
}

.note-card__controls,
.note-actions,
.note-actions__end {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.note-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.note-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--app-muted);
}

.note-input {
  width: 100%;
  padding: 11px 14px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font: inherit;
  font-size: 13px;
  transition:
    border-color 140ms var(--app-ease-standard),
    background-color 140ms var(--app-ease-standard),
    box-shadow 140ms var(--app-ease-standard);
}

.note-input::placeholder {
  color: var(--app-muted-2);
}

.note-input:hover {
  border-color: var(--app-border-strong);
}

.note-input:focus {
  outline: none;
  border-color: var(--app-primary);
  background: var(--app-surface);
  box-shadow: 0 0 0 3px var(--app-primary-soft);
}

.note-textarea {
  min-height: 320px;
  padding: 16px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 13px;
  line-height: 1.7;
  resize: vertical;
}

.note-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--app-muted-2);
}

.note-body {
  font-size: 14px;
  line-height: 1.75;
  color: var(--app-text-soft);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.note-body--empty {
  font-style: italic;
  color: var(--app-muted-2);
}

.note-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface-soft);
  color: var(--app-text-soft);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 140ms var(--app-ease-standard),
    border-color 140ms var(--app-ease-standard),
    color 140ms var(--app-ease-standard),
    transform 140ms var(--app-ease-swift);
}

.note-button:hover {
  border-color: var(--app-border-strong);
  background: var(--app-surface-hover);
  color: var(--app-text);
}

.note-button:active {
  transform: scale(0.97);
}

.note-button:focus-visible {
  outline: 2px solid var(--app-primary);
  outline-offset: 2px;
}

.note-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.note-button--primary {
  border-color: transparent;
  background: var(--app-text);
  color: var(--app-bg);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.note-button--primary:hover {
  background: color-mix(in srgb, var(--app-text) 88%, var(--app-bg));
  color: var(--app-bg);
}

.note-button--secondary {
  background: transparent;
}

.note-button--danger {
  border-color: color-mix(in srgb, var(--app-danger) 30%, transparent);
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  color: var(--app-danger);
}

.note-button--danger:hover {
  border-color: color-mix(in srgb, var(--app-danger) 50%, transparent);
  background: color-mix(in srgb, var(--app-danger) 16%, transparent);
  color: var(--app-danger);
}

.note-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.note-icon--xs {
  width: 12px;
  height: 12px;
}

.note-icon--success {
  color: var(--app-success);
}

.note-icon--spin {
  animation: note-spin 900ms linear infinite;
}

.note-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.note-tags--editable {
  padding-top: 4px;
  gap: 8px;
}

.note-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-soft);
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 500;
  animation: rise-in 220ms var(--app-ease-standard) backwards;
}

.note-tag--muted {
  pointer-events: none;
}

.note-tag__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  min-height: 20px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
  transition: color 140ms var(--app-ease-standard);
}

.note-tag__remove:hover {
  color: var(--app-danger);
}

.note-tag-row {
  display: flex;
  gap: 8px;
}

.note-tag-input-wrap {
  position: relative;
  flex: 1;
}

.note-tag-icon {
  position: absolute;
  top: 50%;
  left: 12px;
  width: 15px;
  height: 15px;
  color: var(--app-muted-2);
  pointer-events: none;
  transform: translateY(-50%);
}

.note-input--tag {
  padding-left: 34px;
}

.note-actions {
  justify-content: space-between;
  gap: 12px;
  padding-top: 18px;
  border-top: 1px solid var(--app-border);
}

.note-actions__end {
  justify-content: flex-end;
  margin-left: auto;
}

.note-link-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--app-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: color 140ms var(--app-ease-standard);
}

.note-link-button:hover {
  color: var(--app-text);
  text-decoration: underline;
}

.note-meta {
  gap: 16px;
  padding: 20px;
}

.note-meta__heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--app-muted);
}

.note-meta__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.note-meta__item {
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: var(--app-surface-soft);
}

.note-meta__key {
  margin: 0 0 4px;
  font-size: 11px;
  color: var(--app-muted-2);
}

.note-meta__value {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-soft);
}

.note-meta__event-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.note-meta__event-head .note-meta__key {
  margin: 0;
}

.note-meta__event-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.note-meta__dot {
  color: var(--app-muted-2);
}

.note-event-id {
  margin: 0;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  color: var(--app-muted);
  overflow-wrap: anywhere;
}

.note-card--loading {
  gap: 18px;
}

.note-skeleton {
  background: var(--app-surface-soft);
  border-radius: 8px;
}

.note-skeleton--button {
  width: 96px;
  height: 32px;
}

.note-skeleton--button-wide {
  width: 132px;
  height: 32px;
}

.note-skeleton--tag {
  width: 64px;
  height: 24px;
  border-radius: 6px;
}

.note-skeleton-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.note-skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

.note-skeleton--line-title {
  width: 75%;
  height: 18px;
}

.note-skeleton--line {
  width: 100%;
  height: 10px;
}

.note-skeleton--line-95 {
  width: 95%;
}

.note-skeleton--line-80 {
  width: 82%;
}

.note-skeleton--line-65 {
  width: 66%;
}

@keyframes note-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (min-width: 640px) {
  .note-page__inner {
    padding: 24px;
    gap: 24px;
  }

  .note-card,
  .note-meta {
    padding: 28px;
  }

  .note-body {
    font-size: 15px;
  }

  .note-meta__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .note-meta__item--wide {
    grid-column: span 2;
  }
}

@media (min-width: 1024px) {
  .note-page {
    height: 100%;
    min-height: 0;
  }

  .note-page__inner {
    padding: 28px 32px;
  }
}

@media (pointer: coarse) {
  .note-button {
    min-height: 44px;
    padding: 0 16px;
  }

  .note-tag__remove {
    min-width: 32px;
    min-height: 32px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .note-card,
  .note-meta,
  .note-tag {
    animation: none;
  }

  .note-button,
  .note-input {
    transition: none;
  }
}
</style>
