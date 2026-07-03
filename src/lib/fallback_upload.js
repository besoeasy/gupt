/**
 * fallback_upload.js
 *
 * Handles encrypted blob uploads to Blossom servers (BUD-01/BUD-02).
 *
 * Called in parallel alongside originless uploads — not as a last resort,
 * but always, so there is a fast reliable URL available for download even
 * before IPFS propagation completes.
 *
 * Tries BLOSSOM_FALLBACK_SERVERS in order; moves to the next server if the
 * current one fails. Throws only if all servers fail.
 *
 * Returned value: a URL string on success, throws on failure.
 */

import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent } from "nostr-tools/pure";

import { BLOSSOM_FALLBACK_SERVERS } from "@/config/servers";

const BLOSSOM_AUTH_KIND = 24242;
const IDENTITY_STORAGE_KEY = "gupt_privkey";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizePrivateKeyHex(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function readUploadPrivateKey() {
  if (typeof localStorage === "undefined") return null;
  try {
    return normalizePrivateKeyHex(localStorage.getItem(IDENTITY_STORAGE_KEY));
  } catch {
    return null;
  }
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(value) {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(blob) {
  const buffer = await blob.arrayBuffer();
  return bytesToHex(nobleSha256(new Uint8Array(buffer)));
}

function buildUploadError(status, reason) {
  return new Error(reason ? `Upload failed (${status}): ${reason}` : `Upload failed (${status})`);
}

async function readUploadFailure(response) {
  const headerReason = response.headers.get("x-reason") || response.headers.get("X-Reason");
  if (headerReason) return buildUploadError(response.status, headerReason);

  const contentType = response.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      const reason =
        payload?.error ||
        payload?.message ||
        payload?.reason ||
        (typeof payload === "string" ? payload : "");
      return buildUploadError(response.status, reason);
    }
    const text = (await response.text()).trim();
    return buildUploadError(response.status, text);
  } catch {
    return buildUploadError(response.status);
  }
}

function pickUploadUrl(payload) {
  if (!payload || typeof payload !== "object") return null;
  const direct =
    payload.url ||
    payload.URL ||
    payload.location ||
    payload.Location ||
    payload.href ||
    payload.Href;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (payload.value && typeof payload.value === "object") return pickUploadUrl(payload.value);
  return null;
}

// ─── Nostr / Blossom auth ─────────────────────────────────────────────────────

function buildBlossomAuthorization(privkeyHex, serverUrl, sha256) {
  const hostname = new URL(serverUrl).hostname.toLowerCase();
  const createdAt = Math.floor(Date.now() / 1000);
  const event = finalizeEvent(
    {
      kind: BLOSSOM_AUTH_KIND,
      created_at: createdAt,
      tags: [
        ["t", "upload"],
        ["expiration", String(createdAt + 60)],
        ["server", hostname],
        ["x", sha256],
      ],
      content: "Upload Blob",
    },
    hexToBytes(privkeyHex),
  );
  return `Nostr ${base64UrlEncode(JSON.stringify(event))}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upload `file` to the first available Blossom fallback server.
 *
 * Iterates through BLOSSOM_FALLBACK_SERVERS in order. If a server fails,
 * logs a warning and tries the next one. Throws only if all servers fail.
 *
 * @param {File | Blob} file
 * @param {{ signal?: AbortSignal }} options
 * @returns {Promise<string>} The URL where the blob was stored.
 * @throws {Error} If no private key is available or all servers fail.
 */
export async function uploadToBlossomFallback(file, { signal } = {}) {
  const privkeyHex = readUploadPrivateKey();
  if (!privkeyHex) {
    throw new Error("A local Nostr private key is required for Blossom uploads.");
  }

  const sha256 = await sha256Hex(file);
  const lastError = { current: null };

  for (const uploadServer of BLOSSOM_FALLBACK_SERVERS) {
    if (signal?.aborted) break;

    try {
      const headers = new Headers({
        Authorization: buildBlossomAuthorization(privkeyHex, uploadServer, sha256),
        "X-SHA-256": sha256,
      });
      if (file.type) headers.set("Content-Type", file.type);

      const uploadUrl = new URL("/upload", uploadServer).toString();
      const response = await fetch(uploadUrl, { method: "PUT", body: file, headers, signal });
      if (!response.ok) throw await readUploadFailure(response);

      const payload = await response.json();
      const url = pickUploadUrl(payload);
      if (!url) throw new Error("Blossom response did not contain a URL.");

      return url;
    } catch (err) {
      lastError.current = err;
      console.warn(`Blossom upload failed for ${uploadServer}: ${err?.message}`);
    }
  }

  throw lastError.current ?? new Error("All Blossom fallback servers failed.");
}
