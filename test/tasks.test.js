import test from "node:test";
import assert from "node:assert/strict";
import {
  TASK_COLLECTION,
  TASK_TAG,
  normalizeTaskPriority,
  normalizeTaskDueAt,
  normalizeTaskTitle,
  normalizeTaskNotes,
  taskBucket,
  formatTaskDue,
  sortTasks,
  taskCounts,
  reduceTasks,
  taskSearchText,
  toDateTimeLocalValue,
  startOfDay,
} from "../src/lib/taskFields.js";

const NOW = new Date(2026, 4, 20, 12, 0, 0).getTime(); // 20 May 2026, local noon
const at = (dayOffset, hour = 9) => {
  const d = new Date(2026, 4, 20 + dayOffset, hour, 0, 0);
  return d.getTime();
};

test("tasks collection constants", () => {
  assert.equal(TASK_COLLECTION, "gupt/vault/tasks");
  assert.equal(TASK_TAG, "gupt_task");
});

test("normalizeTaskPriority only accepts the three known values", () => {
  assert.equal(normalizeTaskPriority("High"), "high");
  assert.equal(normalizeTaskPriority("urgent"), "normal");
  assert.equal(normalizeTaskPriority(null), "normal");
});

test("normalizeTaskDueAt accepts ms, Date, ISO and datetime-local", () => {
  assert.equal(normalizeTaskDueAt(at(0)), at(0));
  assert.equal(normalizeTaskDueAt(new Date(at(0))), at(0));
  assert.equal(normalizeTaskDueAt(String(at(0))), at(0));
  assert.equal(normalizeTaskDueAt("2026-05-20T09:00"), new Date(2026, 4, 20, 9, 0, 0).getTime());
  assert.equal(normalizeTaskDueAt(""), null);
  assert.equal(normalizeTaskDueAt("not a date"), null);
  assert.equal(normalizeTaskDueAt(-5), null);
});

test("normalizeTaskTitle falls back to the first note line, then Task", () => {
  assert.equal(normalizeTaskTitle("  Renew passport ", "ignored"), "Renew passport");
  assert.equal(normalizeTaskTitle("", "\n\n call the bank \nmore"), "call the bank");
  assert.equal(normalizeTaskTitle("", ""), "Task");
});

test("normalizeTaskNotes trims and caps length", () => {
  assert.equal(normalizeTaskNotes("  hello  "), "hello");
  assert.equal(normalizeTaskNotes("x".repeat(5000)).length, 2000);
});

test("taskBucket is day-granular, so a task due this morning is not overdue", () => {
  assert.equal(taskBucket({ dueAt: at(0, 8) }, NOW), "today");
  assert.equal(taskBucket({ dueAt: at(-1, 23) }, NOW), "overdue");
  assert.equal(taskBucket({ dueAt: at(3) }, NOW), "upcoming");
  assert.equal(taskBucket({ dueAt: null }, NOW), "someday");
  assert.equal(taskBucket({ dueAt: at(-9), done: true }, NOW), "done");
});

test("startOfDay lands on local midnight", () => {
  const ms = startOfDay(NOW);
  const d = new Date(ms);
  assert.equal(d.getHours(), 0);
  assert.equal(d.getMinutes(), 0);
  assert.equal(d.getDate(), 20);
});

test("formatTaskDue words the nearby days and leaves far dates to the locale", () => {
  assert.equal(formatTaskDue({ dueAt: at(0) }, NOW).text, "Today");
  assert.equal(formatTaskDue({ dueAt: at(1) }, NOW).text, "Tomorrow");
  assert.equal(formatTaskDue({ dueAt: at(-1) }, NOW).text, "Yesterday");
  assert.equal(formatTaskDue({ dueAt: at(4) }, NOW).text, "In 4 days");
  assert.equal(formatTaskDue({ dueAt: at(-3) }, NOW).text, "3 days overdue");
  assert.equal(formatTaskDue({ dueAt: at(0) }, NOW).tone, "today");
  assert.equal(formatTaskDue({ dueAt: at(-3) }, NOW).tone, "overdue");
  assert.equal(formatTaskDue({ dueAt: at(40) }, NOW).text.length > 0, true);
  assert.equal(formatTaskDue({ dueAt: at(0), done: true }, NOW).text, "");
  assert.equal(formatTaskDue({}, NOW).text, "");
});

test("sortTasks: overdue, today, upcoming, someday, then done", () => {
  const order = sortTasks(
    [
      { id: "done", done: true, doneAt: 5 },
      { id: "someday" },
      { id: "later", dueAt: at(9) },
      { id: "today", dueAt: at(0, 15) },
      { id: "overdue", dueAt: at(-2) },
    ],
    NOW,
  ).map((t) => t.id);
  assert.deepEqual(order, ["overdue", "today", "later", "someday", "done"]);
});

test("sortTasks puts high priority first inside the same day", () => {
  const order = sortTasks(
    [
      { id: "normal", dueAt: at(1), priority: "normal" },
      { id: "high", dueAt: at(1), priority: "high" },
    ],
    NOW,
  ).map((t) => t.id);
  assert.deepEqual(order, ["high", "normal"]);
});

test("taskCounts splits open, overdue, today, done", () => {
  const counts = taskCounts(
    [
      { id: "a", dueAt: at(-1) },
      { id: "b", dueAt: at(0) },
      { id: "c", dueAt: at(4) },
      { id: "d" },
      { id: "e", done: true },
    ],
    NOW,
  );
  assert.deepEqual(counts, {
    total: 5,
    open: 4,
    overdue: 1,
    today: 1,
    upcoming: 1,
    someday: 1,
    done: 1,
  });
});

test("reduceTasks tombstone wins, newest update wins", () => {
  const out = reduceTasks([
    { id: "a", updatedAt: 1, title: "old" },
    { id: "a", updatedAt: 2, title: "new" },
    { id: "b", updatedAt: 3, deleted: true },
    { id: "b", updatedAt: 1, title: "ghost" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "new");
});

test("taskSearchText spans title, notes and tags", () => {
  const hay = taskSearchText({ title: "Renew Passport", notes: "bank", tags: ["admin"] });
  for (const needle of ["renew passport", "bank", "admin"]) {
    assert.ok(hay.includes(needle), needle);
  }
});

test("toDateTimeLocalValue round-trips through the same local clock", () => {
  const ms = new Date(2026, 4, 20, 9, 5, 0).getTime();
  assert.equal(toDateTimeLocalValue(ms), "2026-05-20T09:05");
  assert.equal(toDateTimeLocalValue(0), "");
  assert.equal(normalizeTaskDueAt(toDateTimeLocalValue(ms)), ms);
});
