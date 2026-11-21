export const TASK_COLLECTION = "gupt/vault/tasks";
export const TASK_TAG = "gupt_task";

export const TASK_PRIORITIES = ["low", "normal", "high"];
export const TASK_MAX_TITLE_CHARS = 200;
export const TASK_MAX_NOTES_CHARS = 2000;

const DAY_MS = 24 * 60 * 60 * 1000;

const PRIORITY_RANK = { low: 0, normal: 1, high: 2 };
const BUCKET_RANK = { overdue: 0, today: 1, upcoming: 2, someday: 3, done: 4 };

/** Unknown priorities read as "normal" instead of throwing. */
export function normalizeTaskPriority(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  return TASK_PRIORITIES.includes(v) ? v : "normal";
}

/**
 * Due dates accept a number (ms), a Date, or an ISO / `datetime-local` string.
 * Unparseable or non-positive values are simply "no date" — a bad value must
 * never drop the whole task.
 */
export function normalizeTaskDueAt(value) {
  if (value == null || value === "") return null;
  let ms = null;
  if (typeof value === "number") {
    ms = value;
  } else if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    ms = /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : Date.parse(text);
  }
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round(ms);
}

/** First line of the note stands in when no title was typed. */
export function normalizeTaskTitle(title, notes) {
  const typed = String(title || "")
    .trim()
    .slice(0, TASK_MAX_TITLE_CHARS);
  if (typed) return typed;
  const line = String(notes || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  return line ? line.slice(0, TASK_MAX_TITLE_CHARS) : "Task";
}

export function normalizeTaskNotes(notes) {
  return String(notes || "")
    .trim()
    .slice(0, TASK_MAX_NOTES_CHARS);
}

/** Local midnight, so "today" means the user's day, not UTC's. */
export function startOfDay(ms) {
  const d = new Date(Number(ms) || 0);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function daysUntilDay(dueMs, nowMs = Date.now()) {
  return Math.round((startOfDay(dueMs) - startOfDay(nowMs)) / DAY_MS);
}

/**
 * Where a task sits right now: done, overdue (a past day), today, upcoming,
 * or someday (no date). Day granularity on purpose — a task due 09:00 is not
 * "overdue" at 09:05, it is today's.
 */
export function taskBucket(task, nowMs = Date.now()) {
  if (task?.done) return "done";
  const due = Number(task?.dueAt) || 0;
  if (!due) return "someday";
  const diff = daysUntilDay(due, nowMs);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  return "upcoming";
}

const DUE_TONES = { overdue: "overdue", today: "today", upcoming: "soon", someday: "none" };

/**
 * Human label plus the tone a badge should use. Keeps every screen wording
 * the same instead of five call sites inventing their own.
 */
export function formatTaskDue(task, nowMs = Date.now()) {
  const due = Number(task?.dueAt) || 0;
  if (!due || task?.done) return { text: "", tone: "none" };
  const diff = daysUntilDay(due, nowMs);
  const tone = diff < 0 ? "overdue" : diff === 0 ? "today" : diff <= 7 ? "soon" : "later";
  if (diff === 0) return { text: "Today", tone };
  if (diff === 1) return { text: "Tomorrow", tone };
  if (diff === -1) return { text: "Yesterday", tone };
  if (diff > 0 && diff <= 7) return { text: `In ${diff} days`, tone };
  if (diff < 0 && diff >= -7) return { text: `${-diff} days overdue`, tone };
  const date = new Date(due).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: new Date(due).getFullYear() === new Date(nowMs).getFullYear() ? undefined : "numeric",
  });
  return { text: date, tone };
}

/** Overdue first, then today, upcoming, someday; done sinks to the bottom. */
export function sortTasks(items, nowMs = Date.now()) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return [...list].sort((a, b) => {
    const bucketA = taskBucket(a, nowMs);
    const bucketB = taskBucket(b, nowMs);
    if (bucketA !== bucketB) return BUCKET_RANK[bucketA] - BUCKET_RANK[bucketB];
    if (bucketA === "done") {
      return Number(b.doneAt || b.updatedAt || 0) - Number(a.doneAt || a.updatedAt || 0);
    }
    const dueA = Number(a.dueAt) || 0;
    const dueB = Number(b.dueAt) || 0;
    if (dueA !== dueB) {
      if (!dueA) return 1;
      if (!dueB) return -1;
      return dueA - dueB;
    }
    const priorityA = PRIORITY_RANK[normalizeTaskPriority(a.priority)] ?? 1;
    const priorityB = PRIORITY_RANK[normalizeTaskPriority(b.priority)] ?? 1;
    if (priorityA !== priorityB) return priorityB - priorityA;
    return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
  });
}

/** Counts for the header and filter chips. */
export function taskCounts(items, nowMs = Date.now()) {
  const counts = { total: 0, open: 0, overdue: 0, today: 0, upcoming: 0, someday: 0, done: 0 };
  for (const task of items || []) {
    if (!task) continue;
    counts.total++;
    const bucket = taskBucket(task, nowMs);
    counts[bucket]++;
    if (bucket !== "done") counts.open++;
  }
  return counts;
}

/** Collapse stream: tombstone wins; else newest live by updatedAt. */
export function reduceTasks(items) {
  const deletedIds = new Set();
  const liveById = new Map();

  for (const item of items || []) {
    if (!item?.id) continue;
    if (item.deleted === true) {
      deletedIds.add(item.id);
      liveById.delete(item.id);
      continue;
    }
    if (deletedIds.has(item.id)) continue;
    const prev = liveById.get(item.id);
    if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) {
      liveById.set(item.id, item);
    }
  }

  return [...liveById.values()];
}

/** Lowercase haystack across title, notes and tags. */
export function taskSearchText(task) {
  return [task?.title, task?.notes, ...(task?.tags || [])].filter(Boolean).join(" ").toLowerCase();
}

/** `datetime-local` value for an input, in the user's timezone. */
export function toDateTimeLocalValue(ms) {
  const value = Number(ms) || 0;
  if (!value) return "";
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export { DUE_TONES };
