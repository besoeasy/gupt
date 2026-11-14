import { enginePutBlob } from "./engine/index.js";
import { BLOB_MAX_PARTS, BLOB_SPLIT_THRESHOLD, sealParts } from "./rabta/index.js";

/**
 * Part budget for a multi-file message: small files cost one blob each, the
 * big files share what remains of the 8-blob event cap.
 */
export function partBudgetForFiles(sizes) {
  const list = Array.from(sizes || []).map(Number);
  const smallCount = list.filter((size) => size <= BLOB_SPLIT_THRESHOLD).length;
  const bigCount = list.length - smallCount;
  if (!bigCount) return 1;
  const budget = Math.max(1, Math.floor((BLOB_MAX_PARTS - smallCount) / bigCount));
  return Math.min(BLOB_MAX_PARTS, budget);
}

/**
 * How many parts a plaintext of this size should be sealed into. Small files
 * stay a single blob; anything over the threshold fills the event's blob
 * budget so no part outgrows a relay's blob size limit.
 */
export function decidePartCount(size, partBudget = BLOB_MAX_PARTS) {
  if (size > BLOB_SPLIT_THRESHOLD) {
    return Math.max(1, Math.min(BLOB_MAX_PARTS, Math.floor(partBudget)));
  }
  return 1;
}

function emitUploadProgress(options, update) {
  options?.onProgress?.(update);
}

/**
 * Store sealed RABTA1 containers (one per attachment part) into the Dexie
 * engine and return their verified hashes. No relay traffic here: the
 * replication worker mirrors bytes to every relay in the background, so the
 * UI never waits on a network upload.
 */
export async function uploadFile(containers, options = {}) {
  if (options?.signal?.aborted) {
    throw new DOMException("Upload aborted", "AbortError");
  }

  const list = Array.isArray(containers) ? [...containers] : [containers];
  if (!list.length || !list[0]) {
    throw new Error("uploadFile: nothing to upload");
  }

  const emit = (update) => emitUploadProgress(options, update);
  const hashes = [];
  let lastError = null;

  for (let i = 0; i < list.length; i++) {
    const uploadId = `engine-blob-${i}`;
    emit({
      phase: "uploading",
      uploadId,
      server: "local engine",
      type: "rabta",
      method: "PUT",
      status: "started",
      attempt: 1,
      totalUploads: list.length,
      percent: 0,
    });

    try {
      const hash = await enginePutBlob(list[i]);
      hashes.push(hash);
      emit({
        phase: "uploading",
        uploadId,
        server: "local engine",
        type: "rabta",
        method: "PUT",
        status: "done",
        percent: 100,
        retryCount: 0,
        maxRetries: 0,
        totalUploads: list.length,
      });
    } catch (err) {
      lastError = err;
      emit({
        phase: "uploading",
        uploadId: `engine-blob-overall-${i}`,
        server: "local engine",
        type: "rabta",
        method: "PUT",
        status: "failed",
        error: err?.message || String(err),
        totalUploads: list.length,
      });
      throw err;
    }
  }

  if (!hashes.length) {
    throw lastError || new Error("Upload failed: no parts stored.");
  }

  return {
    type: "media",
    parts: hashes,
    hash: hashes[0],
    url: "",
    server: "local engine",
    relays: [],
  };
}
