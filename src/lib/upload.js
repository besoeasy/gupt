import { hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent } from "nostr-tools/pure";

import {
  buildOriginlessUploadUrl,
  readConfiguredBlossomServers,
  readConfiguredIpfsGateways,
  readConfiguredOriginlessServers,
} from "@/config/servers";

const BLOSSOM_AUTH_KIND = 24242;
const IDENTITY_STORAGE_KEY = "gupt_privkey";
// Score-based upload server selection removed: no-op behavior retained.
const IPFS_GATEWAYS = readConfiguredIpfsGateways();

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

function buildUploadPlan(targets) {
  // Simple randomized order — no score promotion.
  return shuffleTargets(targets);
}

function buildUploadTargets() {
  const blossomServers = readConfiguredBlossomServers();
  const originlessServers = readConfiguredOriginlessServers();

  return [
    ...blossomServers.map((server, index) => ({
      server,
      type: "blossom",
      baseOrder: index,
      attempts: [uploadToBlossom, uploadToOriginless],
    })),
    ...originlessServers.map((server, index) => ({
      server,
      type: "originless",
      baseOrder: blossomServers.length + index,
      attempts: [uploadToOriginless, uploadToBlossom],
    })),
  ];
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
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(digest));
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

async function uploadToBlossom(uploadServer, file, { signal } = {}) {
  const uploadUrl = buildOriginlessUploadUrl(uploadServer);
  if (!uploadUrl) throw new Error("Invalid upload server URL");

  const privkeyHex = readUploadPrivateKey();
  if (!privkeyHex) throw new Error("A local Nostr private key is required for Blossom uploads.");

  const sha256 = await sha256Hex(file);
  const headers = new Headers({
    Authorization: buildBlossomAuthorization(privkeyHex, uploadServer, sha256),
    "X-SHA-256": sha256,
  });
  if (file.type) headers.set("Content-Type", file.type);

  const response = await fetch(uploadUrl, { method: "PUT", body: file, headers, signal });
  if (!response.ok) throw await readUploadFailure(response);

  const payload = await response.json();
  return {
    cid: pickUploadCid(payload),
    sha256: typeof payload?.sha256 === "string" ? payload?.sha256 : sha256,
    url: pickUploadUrl(payload),
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

export async function uploadFile(file, options = {}) {
  const allTargets = buildUploadTargets();
  const timeoutMs = Number(options?.timeoutMs || 30000);

  // Upload to a limited set of random servers (default 3) instead of all.
  const maxUploads = Number(options?.maxServers || 3);
  const targets =
    Array.isArray(allTargets) && allTargets.length > maxUploads
      ? shuffleTargets(allTargets).slice(0, maxUploads)
      : allTargets;

  // Upload to all targets in parallel. For each server, try its attempts in order.
  async function uploadServerEntry(entry) {
    const { server, type, attempts } = entry;
    let lastError = null;

    for (const attempt of attempts) {
      try {
        emitUploadProgress(options, {
          phase: "uploading",
          server,
          type,
          method: attempt === uploadToBlossom ? "PUT" : "POST",
        });

        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const signal = controller ? controller.signal : undefined;
        const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

        try {
          const uploaded = await attempt(server, file, { signal });
          if (timeout) clearTimeout(timeout);
          if (uploaded?.cid || uploaded?.url) {
            return {
              server,
              type,
              ok: true,
              cid: uploaded.cid || "",
              url: uploaded.url || "",
              sha256: uploaded.sha256 || "",
              method: attempt === uploadToBlossom ? "PUT" : "POST",
              raw: uploaded.raw,
            };
          }
          lastError = new Error("Upload response did not contain a CID, hash, or URL.");
        } catch (err) {
          if (timeout) clearTimeout(timeout);
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    return { server, type, ok: false, error: lastError?.message || "upload failed" };
  }

  const settled = await Promise.allSettled(targets.map((t) => uploadServerEntry(t)));
  const locations = settled
    .map((s) => (s.status === "fulfilled" ? s.value : { ok: false, error: String(s.reason) }))
    .filter(Boolean);

  // Choose first successful for quick-access fields for callers that expect them
  const firstSuccess = locations.find((l) => l.ok) || null;

  return {
    locations,
    cid: firstSuccess?.cid || "",
    url: firstSuccess?.url || "",
    server: firstSuccess?.server || "",
    type: firstSuccess?.type || "",
    method: firstSuccess?.method || "",
    // score removed
  };
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
    const uploaded =
      normalizedType === "blossom"
        ? await uploadToBlossom(server, file)
        : await uploadToOriginless(server, file);

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

export function resolveMediaUrls(message) {
  const urls = [];
  if (message?.media?.locations && Array.isArray(message.media.locations)) {
    for (const loc of message.media.locations) {
      if (typeof loc?.url === "string" && loc.url.trim()) urls.push(loc.url.trim());
      if (typeof loc?.cid === "string" && loc.cid.trim()) {
        for (const gateway of IPFS_GATEWAYS) {
          urls.push(`${gateway}/${loc.cid.trim()}`);
        }
      }
    }
    return [...new Set(urls)];
  }

  // Fallback to legacy fields if present
  if (typeof message?.mediaUrl === "string" && message.mediaUrl.trim()) {
    urls.push(message.mediaUrl.trim());
  }
  if (typeof message?.mediaCid === "string" && message.mediaCid.trim()) {
    for (const gateway of IPFS_GATEWAYS) {
      urls.push(`${gateway}/${message.mediaCid.trim()}`);
    }
  }
  return [...new Set(urls)];
}
