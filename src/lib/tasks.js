import { finalizeEvent } from "./crypto.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { encryptDm, decryptDm, normalizePubkey } from "./crypto.js";
import { getRawEventsByOrigin, deleteRawEvent } from "./idb.js";
import { publishLocal, requestEngineSync } from "./engine/index.js";
import { normalizeBookmarkTags, parseBookmarkTagsInput } from "./bookmarks.js";
import { renewStreamItems } from "./streamRenewal.js";
import { STREAM_EXPIRY_SECONDS, STREAM_DELETE_EXPIRY_SECONDS } from "../config/retention.js";
import {
  TASK_COLLECTION,
  TASK_TAG,
  TASK_PRIORITIES,
  normalizeTaskTitle,
  normalizeTaskNotes,
  normalizeTaskPriority,
  normalizeTaskDueAt,
  reduceTasks,
  sortTasks,
} from "./taskFields.js";

export {
  TASK_COLLECTION,
  TASK_TAG,
  TASK_PRIORITIES,
  normalizeTaskTitle,
  normalizeTaskNotes,
  normalizeTaskPriority,
  normalizeTaskDueAt,
  reduceTasks,
  sortTasks,
};

const TASK_KIND = 1;

export const normalizeTaskTags = normalizeBookmarkTags;
export const parseTaskTagsInput = parseBookmarkTagsInput;

function newId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeLiveFields({ title, notes, done, dueAt, priority, tags }) {
  const resolvedNotes = normalizeTaskNotes(notes);
  const resolvedTitle = normalizeTaskTitle(title, resolvedNotes);
  return {
    title: resolvedTitle,
    notes: resolvedNotes,
    done: Boolean(done),
    dueAt: normalizeTaskDueAt(dueAt),
    priority: normalizeTaskPriority(priority),
    tags: normalizeTaskTags(tags),
  };
}

async function publishTaskEvent(privkeyHex, pubkeyHex, payload, expirySeconds) {
  const encryptedPayload = await encryptDm(privkeyHex, pubkeyHex, JSON.stringify(payload));
  const expiryTimestamp = Math.floor(Date.now() / 1000) + expirySeconds;
  const event = finalizeEvent(
    {
      collection: TASK_COLLECTION,
      labels: [TASK_TAG, pubkeyHex],
      data: {
        v: 1,
        nonce: encryptedPayload.nonce,
        ciphertext: encryptedPayload.ciphertext,
      },
      created_at: Math.floor(Date.now() / 1000),
      expires_at: expiryTimestamp,
      kind: TASK_KIND,
      tags: [
        ["p", pubkeyHex],
        ["t", TASK_TAG],
        [TASK_TAG, String(encryptedPayload)],
        ["expiration", String(expiryTimestamp)],
      ],
      content: "Task : https://github.com/besoeasy/gupt",
    },
    hexToBytes(privkeyHex),
  );

  await publishLocal(event, { origin: "tasks" });
  return { ...payload, eventId: event.id, expiresAt: expiryTimestamp * 1000 };
}

function repairDecrypted(item) {
  if (item.deleted) return item;
  const notes = normalizeTaskNotes(item.notes);
  return {
    ...item,
    title: normalizeTaskTitle(item.title, notes),
    notes,
    done: Boolean(item.done),
    dueAt: normalizeTaskDueAt(item.dueAt),
    priority: normalizeTaskPriority(item.priority),
    tags: normalizeTaskTags(item.tags),
  };
}

async function decryptTaskEvents(privkeyHex, pubkeyHex, events) {
  const items = [];
  for (const event of events) {
    const encrypted = event.data?.ciphertext
      ? event.data
      : event.tags?.find((t) => t[0] === TASK_TAG)?.[1] || event.data?.content || event.content;
    if (!encrypted) continue;
    try {
      const plaintext = await decryptDm(privkeyHex, pubkeyHex, encrypted);
      const item = JSON.parse(plaintext);
      if (!item?.id) continue;
      item.eventId = event.id;
      Object.assign(item, repairDecrypted(item));
      const expiryTag = event.tags?.find((t) => t[0] === "expiration");
      if (expiryTag) {
        item.expiresAt = Number(expiryTag[1]) * 1000;
        if (item.expiresAt < Date.now()) continue;
      }
      items.push(item);
    } catch (err) {
      console.warn("Failed to decrypt a task", err);
    }
  }
  return items;
}

export async function getTasksCached(privkeyHex, pubkeyHex) {
  const rows = await getRawEventsByOrigin("tasks").catch(() => []);
  if (!rows.length) return null;
  const events = rows.map((r) => r.event);
  const decrypted = await decryptTaskEvents(privkeyHex, pubkeyHex, events);
  return { items: sortTasks(reduceTasks(decrypted)), fresh: false };
}

export async function fetchTasks(privkeyHex, pubkeyHex) {
  const pubkey = normalizePubkey(pubkeyHex);
  if (!pubkey) throw new Error("Invalid pubkey");

  await requestEngineSync();
  const cached = await getTasksCached(privkeyHex, pubkeyHex);
  return cached?.items || [];
}

/**
 * Create or update a task. Pass `id` to update an existing item.
 * Toggling `done` stamps (or clears) `doneAt` in the same write.
 */
export async function saveTask(privkeyHex, pubkeyHex, input, { id, existingItems } = {}) {
  const items =
    existingItems || (await getTasksCached(privkeyHex, pubkeyHex).catch(() => null))?.items || [];
  const existing = id ? items.find((t) => t.id === id) : null;
  if (id && !existing) throw new Error("Task not found.");

  const merged = {
    title: input.title !== undefined ? input.title : existing?.title,
    notes: input.notes !== undefined ? input.notes : existing?.notes,
    done: input.done !== undefined ? input.done : existing?.done,
    dueAt: input.dueAt !== undefined ? input.dueAt : existing?.dueAt,
    priority: input.priority !== undefined ? input.priority : existing?.priority,
    tags: input.tags !== undefined ? input.tags : existing?.tags || [],
  };

  const now = Date.now();
  const live = sanitizeLiveFields(merged);
  const wasDone = Boolean(existing?.done);
  // Re-saving an already-done task keeps its original completion time; only a
  // real transition writes a new one (and reopening clears it).
  const doneAt = !live.done ? null : wasDone ? existing?.doneAt || now : now;

  const payload = {
    v: 1,
    id: existing?.id || newId(),
    ...live,
    doneAt,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    prevEventId: existing?.eventId || null,
  };
  return publishTaskEvent(privkeyHex, pubkeyHex, payload, STREAM_EXPIRY_SECONDS);
}

/** Flip the checkbox without touching the rest of the record. */
export async function setTaskDone(privkeyHex, pubkeyHex, task, done) {
  if (!task?.id) throw new Error("Invalid task.");
  return saveTask(privkeyHex, pubkeyHex, { done }, { id: task.id, existingItems: [task] });
}

/** Renew a live task (same id, new expiry, prevEventId chain). */
export async function renewTask(privkeyHex, pubkeyHex, item) {
  if (!item?.id) throw new Error("Invalid task.");
  const now = Date.now();
  const live = sanitizeLiveFields(item);
  const payload = {
    v: 1,
    id: item.id,
    ...live,
    doneAt: live.done ? item.doneAt || now : null,
    createdAt: item.createdAt || now,
    updatedAt: now,
    prevEventId: item.eventId || null,
  };
  return publishTaskEvent(privkeyHex, pubkeyHex, payload, STREAM_EXPIRY_SECONDS);
}

/** Delete via never-renewed tombstone (no Kind 5). */
export async function deleteTask(privkeyHex, pubkeyHex, item) {
  if (!item?.id) throw new Error("Invalid task.");
  const now = Date.now();
  const payload = {
    v: 1,
    id: item.id,
    deleted: true,
    createdAt: item.createdAt || now,
    updatedAt: now,
    prevEventId: item.eventId || null,
  };
  const result = await publishTaskEvent(
    privkeyHex,
    pubkeyHex,
    payload,
    STREAM_DELETE_EXPIRY_SECONDS,
  );
  if (item.eventId) {
    await deleteRawEvent(item.eventId).catch(() => {});
  }
  return result;
}

/** Renew stream items via the shared policy (see streamRenewal.js). */
export async function renewExpiringTasks(privkeyHex, pubkeyHex, items, opts = {}) {
  return renewStreamItems(items, (item) => renewTask(privkeyHex, pubkeyHex, item), opts);
}
