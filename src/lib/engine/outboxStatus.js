// Reactive view of the engine outbox, shared by the bridge and the UI.
import { reactive } from "vue";
import { createEngineStore } from "./store.js";

const EMPTY = {
  pending: 0,
  stuck: 0,
  failed: 0,
  total: 0,
  failedIds: [],
  oldestCreatedAt: 0,
  failedAfter: 5,
  updatedAt: 0,
};

export const outboxStatus = reactive({ ...EMPTY, loading: false });

export function applyOutboxStatus(status) {
  if (!status) return;
  const updatedAt = Number(status.updatedAt) || Date.now();
  // A slow Dexie read must not overwrite a newer worker summary.
  if (outboxStatus.updatedAt && updatedAt < outboxStatus.updatedAt) return;
  Object.assign(outboxStatus, {
    pending: Number(status.pending) || 0,
    stuck: Number(status.stuck) || 0,
    failed: Number(status.failed) || 0,
    total: Number(status.total) || 0,
    failedIds: Array.isArray(status.failedIds) ? status.failedIds : [],
    oldestCreatedAt: Number(status.oldestCreatedAt) || 0,
    failedAfter: Number(status.failedAfter) || EMPTY.failedAfter,
    updatedAt,
    loading: false,
  });
}

export function resetOutboxStatus() {
  Object.assign(outboxStatus, EMPTY, { failedIds: [], loading: false });
}

export async function refreshOutboxStatus(selfHex) {
  const pubkey = String(selfHex || "").toLowerCase();
  if (!pubkey) {
    resetOutboxStatus();
    return;
  }
  outboxStatus.loading = true;
  try {
    const store = createEngineStore({ selfHex: pubkey });
    applyOutboxStatus(await store.getOutboxStatus());
  } catch {
    outboxStatus.loading = false;
  }
}
