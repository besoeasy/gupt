import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent } from "nostr-tools/pure";

import {
  buildOriginlessUploadUrl,
  readConfiguredOriginlessServers,
  BLOSSOM_FALLBACK_SERVER,
} from "@/config/servers";

const BLOSSOM_AUTH_KIND = 24242;
const IDENTITY_STORAGE_KEY = "gupt_privkey";
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

  if (payload.value && typeof payload.value === "object") {
    return pickUploadUrl(payload.value);
  }

  return null;
}

function pickUploadCid(payload) {
  if (!payload || typeof payload !== "object") return null;

  const direct = payload.cid || payload.CID || payload.hash || payload.Hash || payload.ipfs;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  if (payload.value && typeof payload.value === "object") {
    return pickUploadCid(payload.value);
  }

  return null;
}

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

// Score storage and update functions removed — callers should not rely on scores.

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function shuffleTargets(targets) {
  const shuffled = [...targets];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
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

async function uploadToOriginless(uploadServer, file, { signal } = {}) {
  const uploadUrl = buildOriginlessUploadUrl(uploadServer);
  if (!uploadUrl) throw new Error("Invalid upload server URL");

  const form = new FormData();
  form.append("file", file);
  const response = await fetch(uploadUrl, { method: "POST", body: form, signal });
  if (!response.ok) throw await readUploadFailure(response);

  const payload = await response.json();
  return {
    cid: pickUploadCid(payload),
    sha256: typeof payload?.sha256 === "string" ? payload?.sha256 : "",
    url: pickUploadUrl(payload),
    raw: payload,
  };
}

async function uploadToBlossomFallback(file, { signal } = {}) {
  const uploadServer = BLOSSOM_FALLBACK_SERVER;
  const privkeyHex = readUploadPrivateKey();
  if (!privkeyHex) throw new Error("A local Nostr private key is required for Blossom uploads.");

  const sha256 = await sha256Hex(file);
  const headers = new Headers({
    Authorization: buildBlossomAuthorization(privkeyHex, uploadServer, sha256),
    "X-SHA-256": sha256,
  });
  if (file.type) headers.set("Content-Type", file.type);

  // Note: Blossom upload doesn't have a /upload suffix, it is a PUT to the root /
  const uploadUrl = new URL("/upload", uploadServer).toString(); 
  // Actually, blossom uploads are just PUT to the root URL or /upload depending on server.
  // Wait, primal blossom is just PUT /upload.
  const response = await fetch(uploadUrl, { method: "PUT", body: file, headers, signal });
  if (!response.ok) throw await readUploadFailure(response);

  const payload = await response.json();
  return {
    type: "media",
    fallback: true,
    cid: "",
    sha256: typeof payload?.sha256 === "string" ? payload?.sha256 : sha256,
    url: pickUploadUrl(payload),
    server: uploadServer,
    raw: payload,
  };
}

function parseUploadTestError(error) {
  const message = error instanceof Error ? error.message : String(error || "upload failed");
  const match = message.match(/Upload failed \((\d+)\)(?::\s*(.*))?$/);
  if (!match) {
    return {
      status: 0,
      summary: message,
    };
  }

  return {
    status: Number(match[1] || 0),
    summary: String(match[2] || "upload failed").trim() || "upload failed",
  };
}

function createTestUploadFile(type) {
  const now = new Date().toISOString();
  const header = `hello world\nserver-type=${type}\nts=${now}\n\n`;
  const body = "gupt-upload-test-payload\n".repeat(128);
  const content = `${header}${body}`;
  return new File([content], `gupt-server-test-${Date.now()}.txt`, {
    type: "text/plain;charset=utf-8",
  });
}

function emitUploadProgress(options, update) {
  options?.onProgress?.(update);
}

/**
 * How many originless servers to target in parallel for propagation.
 * The first to return a CID unblocks the caller; the rest keep seeding
 * in the background.  Capped to avoid flooding small server lists.
 */
const PROPAGATION_TARGETS = 2;

/**
 * Upload `file` to up to PROPAGATION_TARGETS originless servers in parallel.
 *
 * Strategy:
 *  1. Shuffle configured servers and take up to PROPAGATION_TARGETS.
 *  2. Fire all uploads concurrently.
 *  3. Resolve as soon as the first returns a valid CID — unblocks the caller.
 *  4. The remaining in-flight uploads keep running fire-and-forget so the
 *     CID is pinned on multiple nodes before anyone fetches it.
 *  5. If every parallel attempt fails, falls through to Blossom.
 */
export async function uploadFile(file, options = {}) {
  const originlessServers = readConfiguredOriginlessServers();
  const timeoutMs = Number(options?.timeoutMs || 30000);

  // Pick up to PROPAGATION_TARGETS distinct servers at random.
  const targets = shuffleTargets(originlessServers).slice(0, PROPAGATION_TARGETS);

  // ── Phase 1: parallel originless uploads ──────────────────────────────────
  if (targets.length > 0) {
    const attempts = targets.map((server) => {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const signal = controller?.signal;
      const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

      emitUploadProgress(options, {
        phase: "uploading",
        server,
        type: "originless",
        method: "POST",
        parallel: targets.length > 1,
      });

      // Each attempt resolves to a valid result object or null on error.
      // We never reject so Promise-based racing stays simple.
      return uploadToOriginless(server, file, { signal })
        .then((uploaded) => {
          if (timeoutId) clearTimeout(timeoutId);
          if (!uploaded?.cid) return null;
          return {
            type: "media",
            cid: uploaded.cid,
            url: uploaded.url || "",
            sha256: uploaded.sha256 || "",
            server,
          };
        })
        .catch((err) => {
          if (timeoutId) clearTimeout(timeoutId);
          console.warn(`Originless upload failed for ${server}: ${err?.message}`);
          return null;
        });
    });

    // Race: resolve with the first non-null result, or null if all fail.
    const winner = await new Promise((resolve) => {
      let settled = 0;
      let resolved = false;
      for (const p of attempts) {
        p.then((result) => {
          settled += 1;
          if (result && !resolved) {
            resolved = true;
            // Return immediately — peer uploads keep running in the background
            // so the CID gets pinned on the second server without blocking.
            resolve(result);
          } else if (settled === attempts.length && !resolved) {
            resolve(null);
          }
        });
      }
    });

    if (winner) return winner;
  }

  // ── Phase 2: fallback to Blossom ──────────────────────────────────────────
  try {
    emitUploadProgress(options, {
      phase: "uploading",
      server: BLOSSOM_FALLBACK_SERVER,
      type: "blossom-fallback",
      method: "PUT",
    });

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const signal = controller?.signal;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    const uploaded = await uploadToBlossomFallback(file, { signal });
    if (timeout) clearTimeout(timeout);

    if (uploaded?.url) {
      return uploaded; // type: "media", fallback: true
    }
    throw new Error("Blossom fallback response did not contain a URL.");
  } catch (err) {
    console.warn(`Blossom fallback failed: ${err?.message}`);
    throw new Error(`Upload failed on all servers. Last error: ${err?.message}`);
  }
}

export async function testUploadServer(server, type) {
  const uploadUrl = buildOriginlessUploadUrl(server);
  if (!uploadUrl) {
    return {
      ok: false,
      server,
      status: 0,
      summary: "invalid URL",
      type,
      uploadUrl: null,
      returnedUrl: "",
      returnedCid: "",
    };
  }

  try {
    const normalizedType = String(type || "").toLowerCase();
    const file = createTestUploadFile(normalizedType);
    const uploaded = await uploadToOriginless(server, file);

    return {
      ok: Boolean(uploaded.url || uploaded.cid),
      server,
      status: 200,
      summary: uploaded.url ? "uploaded test file" : "uploaded without URL",
      type,
      uploadUrl,
      returnedUrl: uploaded.url || "",
      returnedCid: uploaded.cid || "",
    };
  } catch (error) {
    const details = parseUploadTestError(error);
    return {
      ok: false,
      server,
      status: details.status,
      summary: details.summary,
      type,
      uploadUrl,
      returnedUrl: "",
      returnedCid: "",
    };
  }
}

export async function testUploadServers(servers) {
  const targets = Array.isArray(servers) ? servers : [];
  const results = await Promise.all(
    targets.map((entry) => testUploadServer(entry.server, String(entry.type || "").toLowerCase())),
  );

  return results.map((result, index) => ({
    ...result,
    id: targets[index]?.id || `${result.type}:${result.server}`,
  }));
}

export { resolveMediaSources, resolveMediaUrls } from "@/lib/mediaDecrypt";
