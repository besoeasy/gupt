import {
  buildOriginlessDownloadUrl,
  buildOriginlessUploadUrl,
  readConfiguredOriginlessServers,
} from "@/config/servers";

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

function pickUploadSha256(payload) {
  if (!payload || typeof payload !== "object") return null;

  const direct =
    payload.sha256 ||
    payload.SHA256 ||
    payload.hash ||
    payload.HASH ||
    payload.Hash ||
    payload.cid ||
    payload.CID ||
    payload.ipfs;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  if (payload.value && typeof payload.value === "object") {
    return pickUploadSha256(payload.value);
  }

  return null;
}

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

async function readUploadFailure(response) {
  let text = "";
  try {
    text = await response.text();
  } catch {}
  const status = response?.status || 0;
  const snippet = text ? text.slice(0, 200).trim() : "";
  return new Error(`Upload failed (${status})${snippet ? `: ${snippet}` : ""}`);
}

function canonicalJSON(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJSON).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`).join(",")}}`;
}

async function createSignedBlobEvent(blobHash, fileSize, name = "gupt.bin") {
  const keyPair = await globalThis.crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign"]);
  const rawPub = await globalThis.crypto.subtle.exportKey("raw", keyPair.publicKey);
  const pubHex = Array.from(new Uint8Array(rawPub))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const owner = `ed25519:${pubHex}`;
  const now = Math.floor(Date.now() / 1000);
  const expires = now + 86400 * 30; // 30 days retention
  const collection = "gupt";
  const data = { name, size: fileSize };
  const canonicalData = canonicalJSON(data);
  const labels = ["app:gupt", "type:media"];

  const msg = `${owner}:${collection}:${now}:${expires}:${canonicalData}:${blobHash}:${labels.join(",")}`;
  const msgHash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg));
  const sigBytes = await globalThis.crypto.subtle.sign(
    { name: "Ed25519" },
    keyPair.privateKey,
    msgHash,
  );
  const sig = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    owner,
    collection,
    created_at: now,
    expires_at: expires,
    data,
    blob: blobHash,
    labels,
    sig,
  };
}

async function uploadToOriginless(uploadServer, file, { signal } = {}) {
  const uploadUrl = buildOriginlessUploadUrl(uploadServer);
  if (!uploadUrl) throw new Error("Invalid upload server URL");

  const buffer = await file.arrayBuffer();
  const rawBytes = new Uint8Array(buffer);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", rawBytes);
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const event = await createSignedBlobEvent(hash, rawBytes.byteLength, file.name || "gupt.bin");

  const form = new FormData();
  form.append("event", new Blob([JSON.stringify(event)], { type: "application/json" }));
  form.append("blob", new Blob([rawBytes], { type: "application/octet-stream" }), "gupt.bin");

  const response = await fetch(uploadUrl, { method: "POST", body: form, signal });
  if (!response.ok) throw await readUploadFailure(response);

  const payload = await response.json();
  const sha256 = hash || pickUploadSha256(payload);
  return {
    sha256,
    cid: sha256,
    url:
      (hash ? buildOriginlessDownloadUrl(uploadServer, hash) : "") || pickUploadUrl(payload) || "",
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
  const content = crypto.getRandomValues(new Uint8Array(8 * 1024));
  return new File([content], `gupt-server-test-${Date.now()}.bin`, {
    type: "application/octet-stream",
  });
}

function emitUploadProgress(options, update) {
  options?.onProgress?.(update);
}

const BASE_TIMEOUT_MS = 30_000;
const MIN_UPLOAD_BYTES_PER_SEC = 50_000;

function calcTimeoutMs(file, overrideMs) {
  if (overrideMs) return Number(overrideMs);
  const sizeBytes = file?.size ?? 0;
  return Math.max(BASE_TIMEOUT_MS, Math.ceil((sizeBytes / MIN_UPLOAD_BYTES_PER_SEC) * 1000));
}

const PROPAGATION_TARGETS = 2;

export async function uploadFile(file, options = {}) {
  const originlessServers = readConfiguredOriginlessServers();
  const timeoutMs = calcTimeoutMs(file, options?.timeoutMs);

  if (!originlessServers.length) {
    throw new Error("No originless servers configured.");
  }

  const availableServers = shuffleTargets(originlessServers);
  const targetRedundancy = Math.min(PROPAGATION_TARGETS, availableServers.length);

  const successfulUploads = [];
  const failures = [];
  let untriedIndex = 0;
  let activeCount = 0;

  return new Promise((resolve, reject) => {
    let isSettled = false;
    let successTimer = null;

    function finishResolve() {
      if (isSettled) return;
      isSettled = true;
      if (successTimer) clearTimeout(successTimer);

      const primary = successfulUploads[0];
      resolve({
        type: "media",
        sha256: primary.sha256 || "",
        cid: primary.sha256 || "",
        url: primary.url || "",
        server: primary.server || "",
        servers: successfulUploads.slice(0, 2).map((s) => s.server),
        redundancyCount: Math.min(2, successfulUploads.length),
      });
    }

    function checkResolution() {
      if (isSettled) return;

      if (successfulUploads.length >= targetRedundancy) {
        finishResolve();
        return;
      }

      if (activeCount === 0 && untriedIndex >= availableServers.length) {
        if (successfulUploads.length > 0) {
          finishResolve();
        } else {
          isSettled = true;
          if (successTimer) clearTimeout(successTimer);
          const lastErr = failures[failures.length - 1]?.error;
          reject(new Error(lastErr || "Upload failed on all servers."));
        }
        return;
      }

      if (successfulUploads.length > 0 && !successTimer) {
        successTimer = setTimeout(() => {
          if (!isSettled && successfulUploads.length > 0) {
            finishResolve();
          }
        }, 2500);
      }
    }

    function launchNext() {
      if (isSettled) return;
      if (untriedIndex >= availableServers.length) return;

      const serverIndex = untriedIndex;
      const server = availableServers[serverIndex];
      untriedIndex++;
      activeCount++;

      const uploadId = `originless-${serverIndex}`;
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const signal = controller?.signal;
      const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

      emitUploadProgress(options, {
        phase: "uploading",
        uploadId,
        server,
        type: "originless",
        method: "POST",
        status: "started",
        totalUploads: targetRedundancy,
      });

      uploadToOriginless(server, file, { signal })
        .then((uploaded) => {
          if (timeoutId) clearTimeout(timeoutId);
          activeCount--;
          const ok = Boolean(uploaded?.sha256 || uploaded?.cid || uploaded?.url);
          emitUploadProgress(options, {
            phase: "uploading",
            uploadId,
            server,
            type: "originless",
            method: "POST",
            status: ok ? "done" : "failed",
            totalUploads: targetRedundancy,
          });

          if (ok) {
            successfulUploads.push({
              sha256: uploaded.sha256 || uploaded.cid || "",
              url: uploaded.url || "",
              server,
            });
          } else {
            failures.push({ server, error: "Response missing sha256 or URL" });
            launchNext();
          }

          checkResolution();
        })
        .catch((err) => {
          if (timeoutId) clearTimeout(timeoutId);
          activeCount--;
          console.warn(`Originless upload failed for ${server}: ${err?.message}`);
          emitUploadProgress(options, {
            phase: "uploading",
            uploadId,
            server,
            type: "originless",
            method: "POST",
            status: "failed",
            totalUploads: targetRedundancy,
          });

          failures.push({ server, error: err?.message });
          launchNext();
          checkResolution();
        });
    }

    for (let i = 0; i < targetRedundancy && untriedIndex < availableServers.length; i++) {
      launchNext();
    }
  });
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
      returnedSha256: "",
      returnedCid: "",
    };
  }

  try {
    const normalizedType = String(type || "").toLowerCase();
    const file = createTestUploadFile(normalizedType);
    const uploaded = await uploadToOriginless(server, file);

    return {
      ok: Boolean(uploaded.url || uploaded.sha256 || uploaded.cid),
      server,
      status: 200,
      summary: uploaded.url ? "uploaded test file" : "uploaded without URL",
      type,
      uploadUrl,
      returnedUrl: uploaded.url || "",
      returnedSha256: uploaded.sha256 || uploaded.cid || "",
      returnedCid: uploaded.sha256 || uploaded.cid || "",
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
      returnedSha256: "",
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
