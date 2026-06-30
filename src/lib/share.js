import { gcm } from "@noble/ciphers/aes.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent } from "nostr-tools/pure";

import { asyncPool } from "@/lib/asyncPool";
import { api, publishEventToRelays, queryNostrEvents } from "@/lib/api";
import { base64ToBytes, bytesToBase64 } from "@/lib/chatUtils";
import { aesDecrypt } from "@/lib/crypto";
import { generateKeypair, aesEncrypt } from "@/lib/crypto";
import { resolveMediaUrls } from "@/lib/upload";
import { publicAppBaseUrl } from "@/lib/runtime";

export const SHARE_UPLOAD_CONCURRENCY = 3;
export const SHARE_DECRYPT_CONCURRENCY = 3;
export const SHARE_MAX_FILE_BYTES = 100 * 1024 * 1024;
export const SHARE_MAX_TOTAL_BYTES = 250 * 1024 * 1024;
/** Rough Nostr relay limit for tag payloads (bytes). */
export const SHARE_MAX_EVENT_BYTES = 60 * 1024;

const SHARE_TAG = "gupt_share";

export function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

export function validateShareFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) return { ok: true };

  let total = 0;
  for (const file of list) {
    if (!(file instanceof File)) {
      return { ok: false, error: "Invalid file selection." };
    }
    if (file.size > SHARE_MAX_FILE_BYTES) {
      return {
        ok: false,
        error: `${file.name} exceeds the ${formatBytes(SHARE_MAX_FILE_BYTES)} per-file limit.`,
      };
    }
    total += file.size;
  }

  if (total > SHARE_MAX_TOTAL_BYTES) {
    return {
      ok: false,
      error: `Total attachments exceed the ${formatBytes(SHARE_MAX_TOTAL_BYTES)} limit.`,
    };
  }

  return { ok: true };
}

export function resolveShareFileUrls(file) {
  return resolveMediaUrls({ media: { locations: file?.locations || [] } });
}

export function shareFileCacheKey(shareId, index, file) {
  const name = String(file?.name || "file");
  return `share:${shareId}:${index}:${name}`;
}

function encryptFileBytes(fileBuf) {
  const fileKey = crypto.getRandomValues(new Uint8Array(32));
  const fileNonce = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuf = gcm(fileKey, fileNonce).encrypt(new Uint8Array(fileBuf));
  return { fileKey, fileNonce, encryptedBuf };
}

async function uploadEncryptedBlob(encryptedBlob, { onProgress } = {}) {
  const encryptedFile = new File([encryptedBlob], "encrypted", {
    type: "application/octet-stream",
  });

  const { locations } = await api.uploadFile(encryptedFile, {
    onProgress(p) {
      if (p.phase === "uploading") onProgress?.(p);
    },
  });

  const successfulLocations = locations
    .filter((l) => l.ok)
    .map((l) => ({
      type: l.type || "",
      url: l.url || "",
      cid: l.cid || "",
      server: l.server || "",
      sha256: l.sha256 || "",
    }));
  if (!successfulLocations.length) {
    throw new Error("Failed to upload to any server.");
  }

  return successfulLocations;
}

/**
 * Encrypt and upload one file. Progress callback receives 0–100 for this file.
 */
export async function encryptAndUploadFile(file, { onProgress } = {}) {
  onProgress?.({ phase: "encrypting", percent: 5, message: `Encrypting ${file.name}...` });

  const fileBuf = await file.arrayBuffer();
  const { fileKey, fileNonce, encryptedBuf } = encryptFileBytes(fileBuf);

  onProgress?.({ phase: "uploading", percent: 35, message: `Uploading ${file.name}...` });

  const locations = await uploadEncryptedBlob(new Blob([encryptedBuf]), {
    onProgress(p) {
      if (p.phase === "uploading") {
        onProgress?.({
          phase: "uploading",
          percent: 60,
          message: `Uploading ${file.name} to ${p.server}...`,
        });
      }
    },
  });

  onProgress?.({ phase: "done", percent: 100, message: `${file.name} uploaded` });

  return {
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    key: bytesToBase64(fileKey),
    nonce: bytesToBase64(fileNonce),
    locations,
  };
}

/**
 * Encrypt and upload many files with a concurrency cap.
 * onProgress({ percent, message, fileIndex, fileCount, fileName })
 */
export async function encryptAndUploadFiles(
  files,
  { concurrency = SHARE_UPLOAD_CONCURRENCY, onProgress } = {},
) {
  const list = Array.from(files || []);
  const validation = validateShareFiles(list);
  if (!validation.ok) throw new Error(validation.error);

  const uploadedMedia = new Array(list.length);
  const fileProgress = new Array(list.length).fill(0);

  const reportOverall = (message) => {
    const total = fileProgress.reduce((sum, value) => sum + value, 0);
    const percent = list.length ? Math.round(total / list.length) : 0;
    onProgress?.({ percent, message, fileCount: list.length });
  };

  await asyncPool(concurrency, list, async (file, index) => {
    uploadedMedia[index] = await encryptAndUploadFile(file, {
      onProgress(entry) {
        fileProgress[index] = entry.percent ?? fileProgress[index];
        reportOverall(entry.message || `Processing ${file.name}...`);
        onProgress?.({
          percent: Math.round(fileProgress.reduce((s, v) => s + v, 0) / list.length),
          message: entry.message,
          fileIndex: index,
          fileCount: list.length,
          fileName: file.name,
        });
      },
    });
  });

  return uploadedMedia;
}

export function buildSharePayload(noteText, uploadedMedia) {
  return JSON.stringify({
    text: noteText,
    media: uploadedMedia,
    createdAt: Date.now(),
  });
}

function encodeShareKey(ephemeralKey) {
  return bytesToBase64(ephemeralKey).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildShareUrl(eventId, ephemeralKey) {
  const keyB64 = encodeShareKey(ephemeralKey);
  return `${publicAppBaseUrl()}/#/share/view?id=${eventId}&key=${keyB64}`;
}

function assertEventSize(encPayload) {
  const bytes = new TextEncoder().encode(encPayload).length;
  if (bytes > SHARE_MAX_EVENT_BYTES) {
    throw new Error(
      `Encrypted payload is too large (${formatBytes(bytes)}). Reduce note size or attachments metadata.`,
    );
  }
}

export async function publishShareEvent(encPayload) {
  assertEventSize(encPayload);

  const { privkeyHex } = generateKeypair();
  const event = finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["t", SHARE_TAG],
        [SHARE_TAG, encPayload],
      ],
      content:
        "This note and its attachments were securely shared end-to-end encrypted using Gupt. Protect your privacy at https://github.com/besoeasy/gupt",
    },
    hexToBytes(privkeyHex),
  );

  const publishResponse = await publishEventToRelays([], event);
  const anyOk = Object.values(publishResponse).some((r) => r.ok);
  if (!anyOk) throw new Error("Failed to publish to any relay.");

  return event;
}

/**
 * Full share flow: encrypt payload, publish, return URL.
 */
export async function createShareLink({ noteText = "", files = [], onProgress } = {}) {
  const trimmed = String(noteText || "").trim();
  const list = Array.from(files || []);

  if (!trimmed && !list.length) {
    throw new Error("Add a note or at least one file to share.");
  }

  const validation = validateShareFiles(list);
  if (!validation.ok) throw new Error(validation.error);

  const ephemeralKey = crypto.getRandomValues(new Uint8Array(32));

  onProgress?.({ percent: 0, message: "Preparing share..." });

  const uploadedMedia = list.length ? await encryptAndUploadFiles(list, { onProgress }) : [];

  onProgress?.({ percent: 92, message: "Encrypting payload..." });
  const payload = buildSharePayload(trimmed, uploadedMedia);
  const encPayload = await aesEncrypt(ephemeralKey, payload);

  onProgress?.({ percent: 96, message: "Publishing to Nostr..." });
  const event = await publishShareEvent(encPayload);

  onProgress?.({ percent: 100, message: "Share link ready" });

  return {
    eventId: event.id,
    shareUrl: buildShareUrl(event.id, ephemeralKey),
  };
}

export function decodeShareKey(keyB64) {
  return base64ToBytes(
    String(keyB64 || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/"),
  );
}

export async function fetchSharePayload(eventId, keyB64, { maxWait = 10000 } = {}) {
  if (!eventId || !keyB64) {
    throw new Error("Invalid share link. Missing ID or key.");
  }

  const keyBytes = decodeShareKey(keyB64);
  const events = await queryNostrEvents({ ids: [eventId], limit: 1 }, maxWait);

  if (!events?.length) {
    throw new Error("Event not found. It may have expired or hasn't propagated yet.");
  }

  const event = events[0];
  const shareTag = event.tags?.find((t) => t[0] === SHARE_TAG);
  const encryptedContent = shareTag?.[1];
  if (!encryptedContent) {
    throw new Error("Share payload not found on this event.");
  }

  const decryptedStr = await aesDecrypt(keyBytes, encryptedContent);
  return JSON.parse(decryptedStr);
}
