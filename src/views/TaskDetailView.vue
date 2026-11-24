<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { X, Trash2, Check, LoaderCircle, Copy, Tag, Calendar, CircleCheckBig } from "@/icons";
import PageHeader from "@/components/PageHeader.vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import RelayEventLink from "@/components/RelayEventLink.vue";
import { useIdentityStore } from "@/stores/identity";
import { copyToClipboard } from "@/lib/clipboard";
import {
  getTasksCached,
  fetchTasks,
  saveTask,
  deleteTask,
  normalizeTaskTags,
  parseTaskTagsInput,
  TASK_PRIORITIES,
} from "@/lib/tasks";
import { toDateTimeLocalValue, normalizeTaskDueAt, formatTaskDue } from "@/lib/taskFields";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();

const taskId = computed(() => route.params.id || "");
const isNew = computed(() => !taskId.value || route.path === "/tasks/new");

const isLoading = ref(!isNew.value);
const isSaving = ref(false);
const error = ref("");
const showDeleteConfirm = ref(false);
const taskItem = ref(null);
const isEditing = ref(false);
const copiedField = ref(null);
let copyTimer = null;

const form = ref({
  title: "",
  notes: "",
  done: false,
  dueLocal: "",
  priority: "normal",
  tags: [],
});
const tagDraft = ref("");

function fillForm(item) {
  form.value = {
    title: item?.title || "",
    notes: item?.notes || "",
    done: Boolean(item?.done),
    dueLocal: toDateTimeLocalValue(item?.dueAt),
    priority: item?.priority || "normal",
    tags: [...(item?.tags || [])],
  };
}

onMounted(async () => {
  if (isNew.value) {
    isEditing.value = true;
    return;
  }
  isLoading.value = true;
  try {
    const cached = await getTasksCached(identity.privkeyHex, identity.pubkeyHex);
    let item = (cached?.items || []).find((t) => t.id === taskId.value);
    if (!item) {
      const live = await fetchTasks(identity.privkeyHex, identity.pubkeyHex);
      item = live.find((t) => t.id === taskId.value);
    }
    if (!item) {
      error.value = "Task not found or has been deleted.";
      return;
    }
    taskItem.value = item;
    fillForm(item);
  } catch (err) {
    error.value = err?.message || "Failed to load task.";
  } finally {
    isLoading.value = false;
  }
});

function addTagFromDraft() {
  const parsed = parseTaskTagsInput(tagDraft.value);
  if (!parsed.length) return;
  form.value.tags = normalizeTaskTags([...form.value.tags, ...parsed]);
  tagDraft.value = "";
}

function removeTag(tag) {
  form.value.tags = form.value.tags.filter((t) => t !== tag);
}

async function copyValue(val, name) {
  if (!val) return;
  await copyToClipboard(val);
  copiedField.value = name;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copiedField.value = null;
  }, 1500);
}

async function handleSave() {
  if (isSaving.value) return;
  if (tagDraft.value.trim()) addTagFromDraft();
  isSaving.value = true;
  error.value = "";
  try {
    const payload = {
      title: form.value.title,
      notes: form.value.notes,
      done: form.value.done,
      // datetime-local is the user's own wall clock; the stored value is that
      // instant in ms so every device renders it in its own timezone.
      dueAt: normalizeTaskDueAt(form.value.dueLocal),
      priority: form.value.priority,
      tags: form.value.tags,
    };
    await saveTask(identity.privkeyHex, identity.pubkeyHex, payload, {
      id: isNew.value ? null : taskId.value,
    });
    router.push("/tasks");
  } catch (err) {
    error.value = err?.message || "Failed to save task.";
  } finally {
    isSaving.value = false;
  }
}

async function toggleDone() {
  if (!taskItem.value) return;
  try {
    error.value = "";
    const next = !taskItem.value.done;
    const saved = await saveTask(
      identity.privkeyHex,
      identity.pubkeyHex,
      { done: next },
      { id: taskItem.value.id, existingItems: [taskItem.value] },
    );
    taskItem.value = { ...taskItem.value, done: next, doneAt: next ? Date.now() : null };
    form.value.done = next;
    void saved;
  } catch (err) {
    error.value = err?.message || "Could not update the task.";
  }
}

async function confirmDelete() {
  if (!taskItem.value) return;
  try {
    await deleteTask(identity.privkeyHex, identity.pubkeyHex, taskItem.value);
    router.push("/tasks");
  } catch (err) {
    error.value = err?.message || "Failed to delete task.";
  }
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const dueLabel = computed(() => formatTaskDue({ dueAt: normalizeTaskDueAt(form.value.dueLocal) }));
</script>

<template>
  <main class="task-detail">
    <div class="task-detail__wrap">
      <PageHeader
        :eyebrow="isNew ? 'New Task' : 'Encrypted Task'"
        :title="isNew ? 'Add Task' : form.title || 'Task'"
      >
        <p class="task-detail__lede">
          Title, notes and an optional due date. Everything is encrypted to your key before it
          reaches a relay.
        </p>
      </PageHeader>

      <AppAlertBanner v-if="error" :message="error" />

      <div v-if="isLoading" class="task-detail__card" role="status"><p>Loading task…</p></div>

      <template v-else>
        <article v-if="!isEditing && taskItem" class="task-detail__card">
          <div class="task-detail__top">
            <button
              type="button"
              class="task-detail__btn"
              :class="{ 'task-detail__btn--done': taskItem.done }"
              @click="toggleDone"
            >
              <CircleCheckBig />
              {{ taskItem.done ? "Reopen" : "Mark done" }}
            </button>
            <button type="button" class="task-detail__btn" @click="isEditing = true">Edit</button>
            <button
              type="button"
              class="task-detail__btn task-detail__btn--danger"
              @click="showDeleteConfirm = true"
            >
              <Trash2 />
              Delete
            </button>
          </div>

          <h2 class="task-detail__name" :class="{ 'task-detail__name--done': taskItem.done }">
            {{ taskItem.title }}
          </h2>

          <p v-if="formatTaskDue(taskItem).text" class="task-detail__due">
            <Calendar />
            {{ formatTaskDue(taskItem).text }}
          </p>

          <p v-if="taskItem.priority && taskItem.priority !== 'normal'" class="task-detail__prio">
            Priority: {{ taskItem.priority }}
          </p>

          <p v-if="taskItem.notes" class="task-detail__notes">{{ taskItem.notes }}</p>

          <div v-if="taskItem.tags?.length" class="task-detail__tags">
            <span v-for="tag in taskItem.tags" :key="tag">#{{ tag }}</span>
          </div>

          <div v-if="taskItem.eventId" class="task-detail__meta">
            <button
              type="button"
              class="task-detail__mini"
              @click="copyValue(taskItem.eventId, 'eventId')"
            >
              <Copy />
              {{ copiedField === "eventId" ? "Copied" : "Copy ID" }}
            </button>
            <RelayEventLink :event-id="taskItem.eventId" />
          </div>
        </article>

        <form v-else class="task-detail__card" @submit.prevent="handleSave">
          <label class="task-detail__label">
            Title
            <input
              v-model="form.title"
              type="text"
              placeholder="Renew the passport"
              class="task-detail__input"
            />
          </label>

          <label class="task-detail__label">
            Due
            <input v-model="form.dueLocal" type="datetime-local" class="task-detail__input" />
          </label>
          <p v-if="dueLabel.text" class="task-detail__hint">{{ dueLabel.text }}</p>

          <div class="task-detail__fieldset">
            <span class="task-detail__legend">Priority</span>
            <div class="task-detail__segmented" role="radiogroup" aria-label="Priority">
              <button
                v-for="p in TASK_PRIORITIES"
                :key="p"
                type="button"
                role="radio"
                :aria-checked="form.priority === p"
                :class="['task-detail__seg', { 'task-detail__seg--on': form.priority === p }]"
                @click="form.priority = p"
              >
                {{ p }}
              </button>
            </div>
          </div>

          <label class="task-detail__label">
            Notes
            <textarea
              v-model="form.notes"
              rows="4"
              placeholder="Anything you need to remember…"
              class="task-detail__input"
            />
          </label>

          <label class="task-detail__label">
            <Tag /> Tags (comma separated)
            <input
              v-model="tagDraft"
              type="text"
              placeholder="home, admin…"
              class="task-detail__input"
              @keydown.enter.prevent="addTagFromDraft"
              @keydown.comma.prevent="addTagFromDraft"
            />
          </label>
          <div v-if="form.tags.length" class="task-detail__tags">
            <span v-for="tag in form.tags" :key="tag">
              #{{ tag }}
              <button type="button" :aria-label="`Remove ${tag}`" @click="removeTag(tag)">
                <X />
              </button>
            </span>
          </div>

          <label class="task-detail__check-row">
            <input v-model="form.done" type="checkbox" class="task-detail__checkbox" />
            <span>Already done</span>
          </label>

          <div class="task-detail__top">
            <button
              v-if="!isNew"
              type="button"
              class="task-detail__btn task-detail__btn--danger"
              @click="showDeleteConfirm = true"
            >
              <Trash2 />
              Delete
            </button>
            <button
              type="button"
              class="task-detail__btn"
              @click="isNew ? router.push('/tasks') : (isEditing = false)"
            >
              Cancel
            </button>
            <button type="submit" :disabled="isSaving" class="task-detail__btn task-detail__btn--primary">
              <LoaderCircle v-if="isSaving" class="spin" />
              <Check v-else />
              {{ isNew ? "Save Task" : "Save Changes" }}
            </button>
          </div>
        </form>

        <p v-if="!isNew" class="task-detail__footnote">
          Tasks keep renewing on your relays while you use gupt. Relays drop anything untouched for
          366 days, so a date far in the future survives only as long as the app is opened now and
          then.
        </p>
      </template>
    </div>

    <AppConfirmDialog
      :open="showDeleteConfirm"
      title="Delete Task?"
      message="This publishes an encrypted tombstone. This cannot be undone."
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />
  </main>
</template>

<style scoped>
/* Ledger pass: one task sheet, mono controls, a ruled record. */

.task-detail {
  min-height: 100dvh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.task-detail__wrap {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  width: 100%;
  max-width: 700px;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.task-detail__lede {
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.task-detail__card {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}

.task-detail__top {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.task-detail__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding-inline: 11px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.task-detail__btn svg {
  width: 12px;
  height: 12px;
}

.task-detail__btn:active {
  transform: translateY(1px);
}

.task-detail__btn--primary {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.task-detail__btn--danger {
  border-color: color-mix(in oklab, var(--app-danger) 28%, var(--app-border));
  color: var(--app-danger);
}

.task-detail__btn--done {
  border-color: color-mix(in oklab, var(--app-success) 30%, var(--app-border));
  background: var(--app-success-soft);
  color: var(--app-success);
}

.task-detail__name {
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.task-detail__name--done {
  color: var(--app-muted);
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.task-detail__due {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
}

.task-detail__due svg {
  width: 12px;
  height: 12px;
  color: var(--app-muted-2);
}

.task-detail__prio {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-warning);
}

.task-detail__notes {
  margin: 0;
  padding-top: var(--app-space-4);
  border-top: 1px solid var(--app-border);
  font-size: 13px;
  line-height: 1.75;
  white-space: pre-wrap;
  color: var(--app-text-soft);
  overflow-wrap: anywhere;
}

.task-detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
}

.task-detail__tags span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  background: var(--app-surface-soft);
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
}

.task-detail__tags button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
}

.task-detail__tags button svg {
  width: 9px;
  height: 9px;
}

.task-detail__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--app-space-2);
  padding-top: var(--app-space-4);
  border-top: 1px solid var(--app-border);
}

.task-detail__mini {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  padding-inline: 7px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.task-detail__mini svg {
  width: 10px;
  height: 10px;
}

.task-detail__label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

.task-detail__label svg {
  width: 11px;
  height: 11px;
}

.task-detail__input {
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-family: var(--font-sans);
  font-size: var(--app-text-body);
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  color: var(--app-text);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.task-detail__input::placeholder {
  color: var(--app-muted-2);
}

.task-detail__input:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.task-detail__hint {
  margin: -8px 0 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--app-muted-2);
}

.task-detail__fieldset {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
}

.task-detail__legend {
  padding: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

.task-detail__segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
}

.task-detail__seg {
  flex: 1;
  min-height: 30px;
  padding-inline: 8px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  text-transform: capitalize;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.task-detail__seg--on {
  background: var(--app-text);
  color: var(--app-bg);
}

.task-detail__check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  font-size: 12px;
  color: var(--app-text-soft);
  cursor: pointer;
}

.task-detail__checkbox {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--app-text);
}

.task-detail__footnote {
  margin: 0;
  padding-top: var(--app-space-3);
  border-top: 1px solid var(--app-border);
  font-size: 10.5px;
  line-height: 1.65;
  color: var(--app-muted-2);
}

.spin {
  animation: spin 1s linear infinite;
}

@media (min-width: 40rem) {
  .task-detail__wrap {
    padding-inline: var(--app-space-6);
  }

  .task-detail__card {
    padding: var(--app-space-6);
  }
}

@media (hover: hover) {
  .task-detail__btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .task-detail__btn--primary:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .task-detail__btn--danger:hover {
    border-color: var(--app-danger);
    background: var(--app-danger-soft);
    color: var(--app-danger);
  }

  .task-detail__btn--done:hover {
    border-color: var(--app-success);
    background: var(--app-success-soft);
    color: var(--app-success);
  }

  .task-detail__mini:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .task-detail__tags button:hover {
    color: var(--app-danger);
  }

  .task-detail__seg:not(.task-detail__seg--on):hover {
    background: var(--app-surface);
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .task-detail__btn,
  .task-detail__mini,
  .task-detail__seg,
  .task-detail__check-row,
  .task-detail__tags button {
    min-height: var(--app-touch-h);
  }

  .task-detail__tags button {
    min-width: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .task-detail,
  .task-detail__card {
    animation: none;
  }

  .task-detail__btn,
  .task-detail__mini,
  .task-detail__input,
  .task-detail__seg {
    transition: none;
  }
}
</style>
