<script setup>
import { ref, computed, onMounted } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { CircleCheckBig, Trash2, RefreshCw, Search, Plus, X, Pencil, Layers } from "@/icons";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
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
      <div class="tasks-view__head">
        <div>
          <h1 class="tasks-view__title">
            Tasks
            <span v-if="counts.open" class="tasks-view__count">{{ counts.open }} open</span>
          </h1>
          <p class="tasks-view__sub">
            Encrypted to-dos with due dates. Overdue, today and upcoming stay in order on their own.
          </p>
        </div>
        <div class="tasks-view__actions">
          <button type="button" :disabled="isRefreshing" class="tasks-view__btn" @click="refreshFromRelay">
            <RefreshCw :class="{ spin: isRefreshing }" />
            <span>Sync</span>
          </button>
          <RouterLink to="/tasks/new" class="tasks-view__btn tasks-view__btn--primary">
            <Plus />
            <span>New Task</span>
          </RouterLink>
        </div>
      </div>

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
        <p>Loading tasks…</p>
      </div>

      <div v-else-if="!visibleItems.length" class="tasks-view__empty">
        <Layers class="tasks-view__empty-icon" />
        <h2>{{ emptyCopy.title }}</h2>
        <p>{{ emptyCopy.body }}</p>
        <RouterLink v-if="!items.length" to="/tasks/new" class="tasks-view__btn tasks-view__btn--primary">
          <Plus />
          <span>Add first task</span>
        </RouterLink>
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
              @click="router.push(`/tasks/${task.id}`)"
            >
              <Pencil />
            </button>
            <button
              type="button"
              class="tasks-view__icon-btn tasks-view__icon-btn--danger"
              title="Delete task"
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
.tasks-view {
  min-height: 100vh;
  background: var(--app-bg);
  color: var(--app-text);
  padding-bottom: 4rem;
  animation: tasks-in 0.25s ease;
}

@keyframes tasks-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.tasks-view__main {
  width: 100%;
  max-width: var(--container-6xl);
  margin-inline: auto;
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tasks-view__head {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--app-border-quiet);
}

.tasks-view__title {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: var(--text-xl);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
  color: var(--app-text);
}

.tasks-view__count {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--app-muted);
}

.tasks-view__sub {
  margin-top: 0.25rem;
  font-size: var(--text-sm);
  color: var(--app-muted);
}

.tasks-view__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.tasks-view__btn {
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
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.tasks-view__btn:hover {
  background: var(--app-surface-soft);
  border-color: var(--app-border-strong);
  color: var(--app-text);
}

.tasks-view__btn:active {
  scale: 0.97;
}

.tasks-view__btn:disabled {
  cursor: default;
  opacity: 0.5;
}

.tasks-view__btn--primary {
  background: var(--app-text);
  border-color: var(--app-text);
  color: var(--app-bg);
  font-weight: 600;
}

.tasks-view__btn--primary:hover {
  background: var(--app-text);
  color: var(--app-bg);
  filter: brightness(0.92);
}

.tasks-view__search {
  position: relative;
}

.tasks-view__search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  translate: 0 -50%;
  width: 1rem;
  height: 1rem;
  color: var(--app-muted-2);
  pointer-events: none;
}

.tasks-view__input {
  width: 100%;
  min-height: 44px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--app-border);
  background: var(--app-surface-inset-strong);
  color: var(--app-text);
  padding-left: 2.25rem;
  padding-right: 2.75rem;
  font: inherit;
  font-size: var(--text-sm);
}

.tasks-view__input::placeholder {
  color: var(--app-muted-2);
}

.tasks-view__input:focus {
  outline: none;
  border-color: var(--app-border-strong);
}

.tasks-view__clear {
  position: absolute;
  right: 0.25rem;
  top: 50%;
  translate: 0 -50%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  border: 0;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
}

.tasks-view__filters {
  display: flex;
  gap: 0.375rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
  scrollbar-width: none;
}

.tasks-view__filters::-webkit-scrollbar {
  display: none;
}

.tasks-view__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 44px;
  padding-inline: 0.75rem;
  white-space: nowrap;
  border-radius: var(--radius-md);
  border: 1px solid var(--app-border-quiet);
  background: transparent;
  color: var(--app-muted);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.tasks-view__chip:hover {
  background: var(--app-surface-tint-soft);
  color: var(--app-text-soft);
}

.tasks-view__chip--on {
  background: var(--app-surface-raised);
  border-color: var(--app-border-strong);
  color: var(--app-text);
}

.tasks-view__chip-count {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted);
}

.tasks-view__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 4rem 1.5rem;
  text-align: center;
  border: 1px solid var(--app-border-quiet);
  border-radius: var(--radius-xl);
  background: var(--app-surface-inset);
}

.tasks-view__empty h2 {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--app-text-soft);
}

.tasks-view__empty p {
  max-width: 34rem;
  font-size: var(--text-sm);
  color: var(--app-muted);
}

.tasks-view__empty-icon {
  width: 1.75rem;
  height: 1.75rem;
  color: var(--app-muted-2);
}

.tasks-view__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tasks-view__row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border-radius: var(--radius-xl);
  border: 1px solid var(--app-border-quiet);
  background: var(--app-surface-inset);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.tasks-view__row:hover {
  background: var(--app-surface-tint-soft);
  border-color: var(--app-border);
}

.tasks-view__row--done .tasks-view__name {
  color: var(--app-muted);
  text-decoration: line-through;
}

.tasks-view__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: -0.5rem 0 -0.5rem -0.5rem;
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
}

.tasks-view__check svg {
  width: 22px;
  height: 22px;
}

.tasks-view__check::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1.5px solid var(--app-border-strong);
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.tasks-view__check {
  position: relative;
}

.tasks-view__check:hover::before {
  border-color: var(--app-success);
}

.tasks-view__check--on {
  color: var(--app-success);
}

.tasks-view__check--on::before {
  border-color: var(--app-success);
  background: var(--app-success-soft);
}

.tasks-view__check--busy {
  opacity: 0.6;
}

.tasks-view__body {
  flex: 1;
  min-width: 0;
}

.tasks-view__name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.tasks-view__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.25rem;
  font-size: 11px;
}

.tasks-view__due {
  padding: 1px 0.5rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--app-border-quiet);
  color: var(--app-muted);
}

.tasks-view__due--overdue {
  border-color: color-mix(in srgb, var(--app-danger) 45%, transparent);
  background: var(--app-danger-soft);
  color: var(--app-danger);
}

.tasks-view__due--today {
  border-color: color-mix(in srgb, var(--app-warning) 45%, transparent);
  background: color-mix(in srgb, var(--app-warning) 14%, transparent);
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
  padding: 1px 0.5rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--app-border-quiet);
  font-family: var(--font-mono);
  color: var(--app-muted);
}

.tasks-view__prio--high {
  color: var(--app-danger);
  border-color: color-mix(in srgb, var(--app-danger) 35%, transparent);
}

.tasks-view__tag {
  font-family: var(--font-mono);
  color: var(--app-muted);
}

.tasks-view__row-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.tasks-view__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--app-border-quiet);
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}

.tasks-view__icon-btn:hover {
  background: var(--app-surface-soft);
  border-color: var(--app-border);
  color: var(--app-text-soft);
}

.tasks-view__icon-btn svg {
  width: 18px;
  height: 18px;
}

.tasks-view__icon-btn--danger:hover {
  background: var(--app-danger-soft);
  border-color: color-mix(in srgb, var(--app-danger) 35%, transparent);
  color: var(--app-danger);
}

.spin {
  animation: var(--animate-spin);
}

@media (min-width: 40rem) {
  .tasks-view__main {
    padding-inline: 1.5rem;
  }

  .tasks-view__head {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}
</style>
