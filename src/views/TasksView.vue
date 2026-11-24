<script setup>
import { ref, computed, onMounted } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { CircleCheckBig, Trash2, RefreshCw, Search, Plus, X, Pencil } from "@/icons";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import PageHeader from "@/components/PageHeader.vue";
import { useIdentityStore } from "@/stores/identity";
import { getTasksCached, fetchTasks, deleteTask, setTaskDone } from "@/lib/tasks";
import { formatTaskDue, taskBucket, taskCounts, taskSearchText, sortTasks } from "@/lib/taskFields";

const router = useRouter();
const identity = useIdentityStore();

const isLoading = ref(true);
const isRefreshing = ref(false);
const items = ref([]);
const searchQuery = ref("");
const activeFilter = ref("open");
const error = ref("");
const pendingDelete = ref(null);
const toggling = ref({});

const FILTERS = [
  { id: "open", label: "Open" },
  { id: "today", label: "Today" },
  { id: "overdue", label: "Overdue" },
  { id: "upcoming", label: "Upcoming" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];

const counts = computed(() => taskCounts(items.value));

const visibleItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  let result = sortTasks(items.value);
  if (activeFilter.value === "open") result = result.filter((t) => !t.done);
  else if (activeFilter.value === "done") result = result.filter((t) => t.done);
  else if (activeFilter.value !== "all") {
    result = result.filter((t) => taskBucket(t) === activeFilter.value);
  }
  if (!q) return result;
  return result.filter((t) => taskSearchText(t).includes(q));
});

function filterCount(id) {
  if (id === "all") return counts.value.total;
  if (id === "done") return counts.value.done;
  if (id === "open") return counts.value.open;
  return counts.value[id] || 0;
}

const emptyCopy = computed(() => {
  if (!items.value.length) return { title: "No tasks yet", body: "Add a to-do with an optional due date. It stays encrypted and renews while you use gupt." };
  if (searchQuery.value.trim()) return { title: "No matching tasks", body: `Nothing matches "${searchQuery.value.trim()}".` };
  return { title: "Nothing here", body: "No task is in this bucket right now." };
});

onMounted(loadItems);

async function loadItems() {
  const cached = await getTasksCached(identity.privkeyHex, identity.pubkeyHex);
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
    items.value = await fetchTasks(identity.privkeyHex, identity.pubkeyHex);
  } catch (err) {
    error.value = err?.message || "Failed to load tasks.";
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
}

async function toggleDone(task, event) {
  if (event) event.stopPropagation();
  if (!task?.id || toggling.value[task.id]) return;
  toggling.value = { ...toggling.value, [task.id]: true };
  // Optimistic: flip the row now, roll back if the publish fails.
  const before = { ...task };
  items.value = items.value.map((t) =>
    t.id === task.id ? { ...t, done: !t.done, doneAt: t.done ? null : Date.now() } : t,
  );
  try {
    error.value = "";
    await setTaskDone(identity.privkeyHex, identity.pubkeyHex, before, !before.done);
  } catch (err) {
    items.value = items.value.map((t) => (t.id === task.id ? before : t));
    error.value = err?.message || "Could not update the task.";
  } finally {
    const next = { ...toggling.value };
    delete next[task.id];
    toggling.value = next;
  }
}

async function confirmDelete() {
  const item = pendingDelete.value;
  if (!item) return;
  pendingDelete.value = null;
  try {
    await deleteTask(identity.privkeyHex, identity.pubkeyHex, item);
    items.value = items.value.filter((t) => t.id !== item.id);
  } catch (err) {
    error.value = err?.message || "Failed to delete task.";
  }
}
</script>

<template>
  <div class="tasks-view">
    <main class="tasks-view__main">
      <PageHeader eyebrow="Private vault" title="Tasks" :count="items.length">
        <p class="tasks-view__sub">
          Encrypted to-dos with due dates. Overdue, today and upcoming stay in order on their own.
        </p>
        <template #actions>
          <button type="button" :disabled="isRefreshing" class="tasks-view__btn" @click="refreshFromRelay">
            <RefreshCw :class="{ spin: isRefreshing }" />
            <span>Sync</span>
          </button>
          <RouterLink to="/tasks/new" class="tasks-view__btn tasks-view__btn--primary">
            <Plus />
            <span>New task</span>
          </RouterLink>
        </template>
      </PageHeader>

      <AppAlertBanner v-if="error" :message="error" />

      <div class="tasks-view__search">
        <Search class="tasks-view__search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search title, notes or tags…"
          class="tasks-view__input"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="tasks-view__clear"
          aria-label="Clear search"
          @click="searchQuery = ''"
        >
          <X />
        </button>
      </div>

      <div class="tasks-view__filters" role="tablist" aria-label="Task filters">
        <button
          v-for="f in FILTERS"
          :key="f.id"
          type="button"
          role="tab"
          :aria-selected="activeFilter === f.id"
          :class="['tasks-view__chip', { 'tasks-view__chip--on': activeFilter === f.id }]"
          @click="activeFilter = f.id"
        >
          {{ f.label }}
          <span class="tasks-view__chip-count">{{ filterCount(f.id) }}</span>
        </button>
      </div>

      <div v-if="isLoading" class="tasks-view__empty" role="status">
        <p class="tasks-view__empty-eyebrow">Loading</p>
        <p>Loading tasks…</p>
      </div>

      <div v-else-if="!visibleItems.length" class="tasks-view__empty">
        <p class="tasks-view__empty-eyebrow">
          {{ !items.length ? "Empty ledger" : "No match" }}
        </p>
        <h2>{{ emptyCopy.title }}</h2>
        <p>{{ emptyCopy.body }}</p>
        <RouterLink v-if="!items.length" to="/tasks/new" class="tasks-view__btn tasks-view__btn--primary">
          <Plus />
          <span>Add first task</span>
        </RouterLink>
        <button v-else type="button" class="tasks-view__btn" @click="searchQuery = ''; activeFilter = 'open'">
          Clear filters
        </button>
      </div>

      <div v-else class="tasks-view__list">
        <article
          v-for="task in visibleItems"
          :key="task.id"
          :class="['tasks-view__row', { 'tasks-view__row--done': task.done }]"
          @click="router.push(`/tasks/${task.id}`)"
        >
          <button
            type="button"
            class="tasks-view__check"
            :class="{
              'tasks-view__check--on': task.done,
              'tasks-view__check--busy': toggling[task.id],
            }"
            :aria-label="task.done ? 'Mark as not done' : 'Mark as done'"
            :aria-pressed="task.done"
            @click="toggleDone(task, $event)"
          >
            <CircleCheckBig v-if="task.done" />
          </button>

          <div class="tasks-view__body">
            <p class="tasks-view__name">{{ task.title }}</p>
            <div class="tasks-view__meta">
              <span
                v-if="formatTaskDue(task).text"
                :class="[
                  'tasks-view__due',
                  `tasks-view__due--${formatTaskDue(task).tone}`,
                ]"
              >
                {{ formatTaskDue(task).text }}
              </span>
              <span v-else-if="!task.done" class="tasks-view__due tasks-view__due--none">No date</span>
              <span v-if="task.done" class="tasks-view__due tasks-view__due--done">Done</span>
              <span
                v-if="task.priority && task.priority !== 'normal'"
                :class="['tasks-view__prio', `tasks-view__prio--${task.priority}`]"
              >
                {{ task.priority }}
              </span>
              <span v-for="tag in task.tags || []" :key="tag" class="tasks-view__tag">#{{ tag }}</span>
            </div>
          </div>

          <div class="tasks-view__row-actions" @click.stop>
            <button
              type="button"
              class="tasks-view__icon-btn"
              title="Edit task"
              aria-label="Edit task"
              @click="router.push(`/tasks/${task.id}`)"
            >
              <Pencil />
            </button>
            <button
              type="button"
              class="tasks-view__icon-btn tasks-view__icon-btn--danger"
              title="Delete task"
              aria-label="Delete task"
              @click="pendingDelete = task"
            >
              <Trash2 />
            </button>
          </div>
        </article>
      </div>
    </main>

    <AppConfirmDialog
      :open="Boolean(pendingDelete)"
      title="Delete Task?"
      :message="`Delete '${pendingDelete?.title || 'task'}'? An encrypted tombstone will be published to your relays.`"
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </div>
</template>

<style scoped>
/* Ledger pass: tasks are a ruled list with a check column. */

.tasks-view {
  min-height: 100vh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.tasks-view__main {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  width: 100%;
  max-width: 72rem;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.tasks-view__sub {
  max-width: 56ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.tasks-view__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 32px;
  padding-inline: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  text-decoration: none;
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.tasks-view__btn svg {
  width: 13px;
  height: 13px;
}

.tasks-view__btn:active {
  transform: translateY(1px);
}

.tasks-view__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.tasks-view__btn--primary {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.tasks-view__search {
  position: relative;
}

.tasks-view__search-icon {
  position: absolute;
  top: 50%;
  left: 14px;
  width: 14px;
  height: 14px;
  transform: translateY(-50%);
  color: var(--app-muted-2);
  pointer-events: none;
}

.tasks-view__input {
  width: 100%;
  height: 40px;
  padding: 0 42px 0 38px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: transparent;
  font: inherit;
  font-size: var(--app-text-body);
  color: var(--app-text);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.tasks-view__input::placeholder {
  color: var(--app-muted-2);
}

.tasks-view__input:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.tasks-view__clear {
  position: absolute;
  top: 50%;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  transform: translateY(-50%);
  border: 0;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
}

.tasks-view__clear svg {
  width: 13px;
  height: 13px;
}

.tasks-view__filters {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.tasks-view__filters::-webkit-scrollbar {
  display: none;
}

.tasks-view__chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 26px;
  padding: 5px 8px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  white-space: nowrap;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.tasks-view__chip-count {
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.tasks-view__chip--on {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.tasks-view__chip--on .tasks-view__chip-count {
  color: color-mix(in oklab, var(--app-bg) 65%, transparent);
}

.tasks-view__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--app-space-3);
  padding: var(--app-space-8) var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  text-align: center;
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}

.tasks-view__empty-eyebrow {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.tasks-view__empty-eyebrow + p {
  margin: 0;
  font-size: var(--app-text-meta);
  color: var(--app-muted);
}

.tasks-view__empty h2 {
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

.tasks-view__empty p {
  max-width: 40ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.tasks-view__empty .tasks-view__btn {
  margin-top: var(--app-space-2);
}

.tasks-view__list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-fade 320ms var(--app-ease-standard) both;
}

.tasks-view__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: background-color var(--app-dur-fast) var(--app-ease-standard);
}

.tasks-view__row + .tasks-view__row {
  border-top: 1px solid var(--app-border);
}

.tasks-view__row--done .tasks-view__name {
  color: var(--app-muted);
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.tasks-view__check {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin: 0;
  border: 0;
  background: transparent;
  color: var(--app-bg);
  cursor: pointer;
}

.tasks-view__check svg {
  position: relative;
  z-index: 1;
  width: 11px;
  height: 11px;
  stroke-width: 3;
}

.tasks-view__check::before {
  content: "";
  position: absolute;
  inset: 2px;
  border: 1.5px solid var(--app-border-strong);
  border-radius: 50%;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-emphasized);
}

.tasks-view__check--on::before {
  border-color: var(--app-success);
  background: var(--app-success);
  animation: ledger-dot-pop 260ms var(--app-ease-emphasized) both;
}

.tasks-view__check--busy {
  opacity: 0.5;
}

.tasks-view__body {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
}

.tasks-view__name {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;
  letter-spacing: -0.005em;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.tasks-view__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-top: 5px;
}

.tasks-view__due,
.tasks-view__prio {
  padding: 1px 5px;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--app-muted);
}

.tasks-view__due--overdue {
  border-color: color-mix(in oklab, var(--app-danger) 34%, transparent);
  background: var(--app-danger-soft);
  color: var(--app-danger);
}

.tasks-view__due--today {
  border-color: color-mix(in oklab, var(--app-warning) 34%, transparent);
  background: color-mix(in oklab, var(--app-warning) 12%, transparent);
  color: var(--app-warning);
}

.tasks-view__due--soon {
  color: var(--app-text-soft);
}

.tasks-view__due--none,
.tasks-view__due--done {
  color: var(--app-muted-2);
}

.tasks-view__prio {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tasks-view__prio--high {
  border-color: color-mix(in oklab, var(--app-danger) 30%, transparent);
  color: var(--app-danger);
}

.tasks-view__prio--low {
  color: var(--app-muted-2);
}

.tasks-view__tag {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
}

.tasks-view__row-actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  margin-left: auto;
}

.tasks-view__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.tasks-view__icon-btn svg {
  width: 13px;
  height: 13px;
}

.tasks-view__icon-btn--danger {
  color: color-mix(in oklab, var(--app-danger) 70%, var(--app-muted));
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes ledger-dot-pop {
  from {
    transform: scale(0.7);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@media (min-width: 40rem) {
  .tasks-view__main {
    padding-inline: var(--app-space-6);
  }
}

@media (max-width: 30rem) {
  .tasks-view__row {
    flex-wrap: wrap;
  }

  .tasks-view__row-actions {
    width: 100%;
    margin-left: 34px;
    padding-top: 6px;
  }
}

@media (hover: hover) {
  .tasks-view__btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .tasks-view__btn--primary:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .tasks-view__row:hover {
    background: var(--app-surface-soft);
  }

  .tasks-view__check:hover::before {
    border-color: var(--app-success);
  }

  .tasks-view__chip:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .tasks-view__icon-btn:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }

  .tasks-view__icon-btn--danger:hover {
    background: var(--app-danger-soft);
    color: var(--app-danger);
  }

  .tasks-view__clear:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .tasks-view__btn,
  .tasks-view__chip,
  .tasks-view__clear {
    min-height: var(--app-touch-h);
  }

  .tasks-view__check {
    width: var(--app-touch-h);
    height: var(--app-touch-h);
    margin: -10px -6px -10px -10px;
  }

  .tasks-view__icon-btn {
    width: var(--app-touch-h);
    height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tasks-view,
  .tasks-view__empty,
  .tasks-view__list,
  .tasks-view__check--on::before {
    animation: none;
  }

  .tasks-view__btn,
  .tasks-view__row,
  .tasks-view__chip,
  .tasks-view__icon-btn,
  .tasks-view__input,
  .tasks-view__check::before {
    transition: none;
  }
}
</style>
