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
.task-detail {
  min-height: 100dvh;
  background: var(--app-bg);
  color: var(--app-text);
  animation: task-in 0.25s ease;
}

@keyframes task-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.task-detail__wrap {
  width: 100%;
  max-width: 42rem;
  margin-inline: auto;
  padding: 1.5rem 1rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.task-detail__lede {
  font-size: var(--text-sm);
  color: var(--app-muted);
}

.task-detail__card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  border-radius: var(--radius-xl);
  border: 1px solid var(--app-border-quiet);
  background: var(--app-surface-inset);
}

.task-detail__top {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
}

.task-detail__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 44px;
  padding-inline: 0.75rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--app-border);
  background: var(--app-surface-tint);
  color: var(--app-text-soft);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.task-detail__btn svg {
  width: 16px;
  height: 16px;
}

.task-detail__btn:hover {
  background: var(--app-surface-soft);
  border-color: var(--app-border-strong);
  color: var(--app-text);
}

.task-detail__btn:active {
  scale: 0.97;
}

.task-detail__btn--primary {
  background: var(--app-text);
  border-color: var(--app-text);
  color: var(--app-bg);
  font-weight: 600;
}

.task-detail__btn--primary:hover {
  background: var(--app-text);
  color: var(--app-bg);
  filter: brightness(0.92);
}

.task-detail__btn--danger {
  color: var(--app-danger);
}

.task-detail__btn--danger:hover {
  background: var(--app-danger-soft);
  border-color: color-mix(in srgb, var(--app-danger) 35%, transparent);
  color: var(--app-danger);
}

.task-detail__btn--done {
  color: var(--app-success);
}

.task-detail__name {
  font-size: var(--text-xl);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.task-detail__name--done {
  color: var(--app-muted);
  text-decoration: line-through;
}

.task-detail__due {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: var(--text-sm);
  color: var(--app-text-soft);
}

.task-detail__due svg {
  width: 16px;
  height: 16px;
  color: var(--app-muted);
}

.task-detail__prio {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-muted);
}

.task-detail__notes {
  white-space: pre-wrap;
  font-size: var(--text-sm);
  color: var(--app-text-soft);
}

.task-detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--app-muted);
}

.task-detail__tags span {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 2px 0.5rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--app-border-quiet);
}

.task-detail__tags button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 0;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
}

.task-detail__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 11px;
}

.task-detail__mini {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 44px;
  padding-inline: 0.5rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--app-border-quiet);
  background: transparent;
  color: var(--app-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.task-detail__mini svg {
  width: 14px;
  height: 14px;
}

.task-detail__label {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--app-text-soft);
}

.task-detail__label svg {
  width: 14px;
  height: 14px;
}

.task-detail__input {
  width: 100%;
  min-height: 44px;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--app-border);
  background: var(--app-surface-inset-strong);
  color: var(--app-text);
  font: inherit;
  font-size: var(--text-sm);
}

.task-detail__input::placeholder {
  color: var(--app-muted-2);
}

.task-detail__input:focus {
  outline: none;
  border-color: var(--app-border-strong);
}

.task-detail__hint {
  margin-top: -0.375rem;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-muted);
}

.task-detail__fieldset {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.task-detail__legend {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--app-text-soft);
}

.task-detail__segmented {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--app-border);
  background: var(--app-surface-inset-strong);
}

.task-detail__seg {
  flex: 1;
  min-height: 44px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--app-muted);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: capitalize;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.task-detail__seg--on {
  background: var(--app-surface-raised);
  color: var(--app-text);
}

.task-detail__check-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  font-size: var(--text-sm);
  color: var(--app-text-soft);
  cursor: pointer;
}

.task-detail__checkbox {
  width: 20px;
  height: 20px;
  accent-color: var(--app-success);
}

.task-detail__footnote {
  font-size: 11px;
  line-height: 1.5;
  color: var(--app-muted-2);
}

.spin {
  animation: var(--animate-spin);
}
</style>
