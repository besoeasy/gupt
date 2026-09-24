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

function pickUploadCid(payload) {
  if (!payload || typeof payload !== "object") return null;

  const direct =
    payload.cid || payload.CID || payload.hash || payload.Hash || payload.root || payload.Root;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  if (payload.value && typeof payload.value === "object") {
    return pickUploadCid(payload.value);
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

async function prepareBlobUpload(fileOrPrepared) {
  if (fileOrPrepared && fileOrPrepared.rawBytes) {
    return fileOrPrepared;
  }

  const name = fileOrPrepared.name || "gupt.bin";
  const buffer = await fileOrPrepared.arrayBuffer();
  const rawBytes = new Uint8Array(buffer);

  return { rawBytes, name, fileSize: rawBytes.byteLength };
}

const STALL_TIMEOUT_MS = 5000;

function uploadViaXhr(
  url,
  formData,
  { signal, timeoutMs, stallTimeoutMs = STALL_TIMEOUT_MS, onProgress } = {},
) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    if (timeoutMs) xhr.timeout = timeoutMs;

    let isDone = false;
    let stallTimer = null;
    let lastLoaded = 0;

    function clearTimers() {
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    }

    function resetStallTimer() {
      clearTimers();
      if (isDone) return;
      stallTimer = setTimeout(() => {
        if (isDone) return;
        isDone = true;
        try {
          xhr.abort();
        } catch {}
        const err = new Error("Upload stalled: no progress for 5 seconds");
        err.name = "StallError";
        reject(err);
      }, stallTimeoutMs);
    }

    resetStallTimer();

    const onAbort = () => {
      if (isDone) return;
      isDone = true;
      clearTimers();
      try {
        xhr.abort();
      } catch {}
      const err = new DOMException("Upload aborted", "AbortError");
      reject(err);
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    if (xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (isDone) return;
        if (event.loaded > lastLoaded) {
          lastLoaded = event.loaded;
          resetStallTimer();
        }
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
          onProgress?.({ loaded: event.loaded, total: event.total, percent });
        }
      };
      xhr.upload.onload = () => {
        if (isDone) return;
        resetStallTimer();
      };
    }

    xhr.onload = () => {
      if (isDone) return;
      isDone = true;
      clearTimers();
      if (signal) signal.removeEventListener("abort", onAbort);

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const text = xhr.responseText || "{}";
          resolve(JSON.parse(text));
        } catch {
          resolve({});
        }
      } else {
        const snippet = (xhr.responseText || "").slice(0, 200).trim();
        reject(new Error(`Upload failed (${xhr.status})${snippet ? `: ${snippet}` : ""}`));
      }
    };

    xhr.onerror = () => {
      if (isDone) return;
      isDone = true;
      clearTimers();
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(new Error("Network error during upload"));
    };

    xhr.ontimeout = () => {
      if (isDone) return;
      isDone = true;
      clearTimers();
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(new Error("Upload timed out"));
    };

    xhr.onabort = () => {
      if (isDone) return;
      isDone = true;
      clearTimers();
      if (signal) signal.removeEventListener("abort", onAbort);
      const err = new DOMException("Upload aborted", "AbortError");
      reject(err);
    };

    xhr.send(formData);
  });
}

async function uploadViaFetch(
  url,
  formData,
  { signal, timeoutMs, stallTimeoutMs = STALL_TIMEOUT_MS } = {},
) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) throw new DOMException("Upload aborted", "AbortError");
    signal.addEventListener("abort", onAbort, { once: true });
  }

  const stallTimer = setTimeout(() => {
    const stallErr = new Error("Upload stalled: no progress for 5 seconds");
    stallErr.name = "StallError";
    controller.abort(stallErr);
  }, stallTimeoutMs);

  const timeoutId = timeoutMs
    ? setTimeout(() => controller.abort(new Error("Upload timed out")), timeoutMs)
    : null;

  try {
    const res = await fetch(url, { method: "POST", body: formData, signal: controller.signal });
    clearTimeout(stallTimer);
    if (!res.ok) throw await readUploadFailure(res);
    return await res.json().catch(() => ({}));
  } catch (err) {
    if (controller.signal.aborted && !signal?.aborted) {
      const reason = controller.signal.reason;
      if (reason && /stalled/i.test(reason?.message || "")) {
        const stallErr = new Error("Upload stalled: no progress for 5 seconds");
        stallErr.name = "StallError";
        throw stallErr;
      }
    }
    throw err;
  } finally {
    clearTimeout(stallTimer);
    if (timeoutId) clearTimeout(timeoutId);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

async function uploadToOriginless(uploadServer, fileOrPrepared, options = {}) {
  const prepared = await prepareBlobUpload(fileOrPrepared);
  const uploadUrl = buildOriginlessUploadUrl(uploadServer);
  if (!uploadUrl) throw new Error("Invalid upload server URL");

  const form = new FormData();
  form.append(
    "file",
    new Blob([prepared.rawBytes], { type: "application/octet-stream" }),
    prepared.name || "gupt.bin",
  );

  let payload;
  if (typeof XMLHttpRequest !== "undefined") {
    payload = await uploadViaXhr(uploadUrl, form, options);
  } else {
    payload = await uploadViaFetch(uploadUrl, form, options);
  }

  const cid = pickUploadCid(payload);
  return {
    cid: cid || "",
    url: (cid ? buildOriginlessDownloadUrl(uploadServer, cid) : "") || pickUploadUrl(payload) || "",
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
  const sizeBytes = file?.size ?? file?.fileSize ?? 0;
  return Math.max(BASE_TIMEOUT_MS, Math.ceil((sizeBytes / MIN_UPLOAD_BYTES_PER_SEC) * 1000));
}

export async function uploadFile(file, options = {}) {
  const originlessServers = readConfiguredOriginlessServers();
  const timeoutMs = calcTimeoutMs(file, options?.timeoutMs);

  if (!originlessServers.length) {
    throw new Error("No originless servers configured.");
  }

  if (options?.signal?.aborted) {
    throw new DOMException("Upload aborted", "AbortError");
  }

  const prepared = await prepareBlobUpload(file);
  const availableServers = shuffleTargets(originlessServers);
  const totalUploads = availableServers.length;

  const successfulUploads = [];
  const failures = [];
  const activeControllers = new Map();
  let remaining = availableServers.length;
  let firstSettled = false;
  let resolveFirst;
  let rejectFirst;
  const first = new Promise((resolve, reject) => {
    resolveFirst = resolve;
    rejectFirst = reject;
  });
  let resolveCompleted;
  const completed = new Promise((resolve) => {
    resolveCompleted = resolve;
  });

  function abortAllActive() {
    for (const controller of activeControllers.values()) {
      try {
        controller.abort();
      } catch {}
    }
    activeControllers.clear();
  }

  function checkCompleted() {
    if (remaining > 0) return;
    options?.signal?.removeEventListener("abort", onParentAbort);
    const ordered = availableServers
      .map((server) => successfulUploads.find((result) => result.server === server))
      .filter(Boolean);
    resolveCompleted({
      servers: (ordered.length ? ordered : successfulUploads).map((s) => s.server),
      redundancyCount: successfulUploads.length,
      failures: failures.map((entry) => entry.error || String(entry.error || "upload failed")),
    });
  }

  function recordFailure(server, error) {
    failures.push({ server, error });
    remaining -= 1;
    if (!firstSettled && remaining === 0) {
      firstSettled = true;
      abortAllActive();
      const lastErr = failures[failures.length - 1]?.error;
      rejectFirst(new Error(lastErr || "Upload failed on all servers."));
    }
    checkCompleted();
  }

  function onParentAbort() {
    abortAllActive();
    if (!firstSettled) {
      firstSettled = true;
      rejectFirst(new DOMException("Upload aborted", "AbortError"));
    }
  }

  options?.signal?.addEventListener("abort", onParentAbort, { once: true });

  availableServers.forEach((server, serverIndex) => {
    const uploadId = `originless-${serverIndex}`;
    const controller = new AbortController();
    activeControllers.set(uploadId, controller);
    if (options?.signal) {
      if (options.signal.aborted) controller.abort(options.signal.reason);
      else
        options.signal.addEventListener("abort", () => controller.abort(options.signal.reason), {
          once: true,
        });
    }

    emitUploadProgress(options, {
      phase: "uploading",
      uploadId,
      server,
      type: "originless",
      method: "POST",
      status: "started",
      totalUploads,
    });

    uploadToOriginless(server, prepared, {
      signal: controller.signal,
      timeoutMs,
      stallTimeoutMs: options?.stallTimeoutMs,
      onProgress(p) {
        if (p.loaded != null) {
          emitUploadProgress(options, {
            phase: "uploading",
            uploadId,
            server,
            type: "originless",
            method: "POST",
            status: "progress",
            loaded: p.loaded,
            total: p.total,
            percent: p.percent,
            totalUploads,
          });
        }
      },
    }).then(
      (uploaded) => {
        activeControllers.delete(uploadId);
        const ok = Boolean(uploaded?.cid || uploaded?.url);
        emitUploadProgress(options, {
          phase: "uploading",
          uploadId,
          server,
          type: "originless",
          method: "POST",
          status: ok ? "done" : "failed",
          percent: 100,
          totalUploads,
        });

        if (ok) {
          const entry = {
            cid: uploaded.cid || "",
            url: uploaded.url || "",
            server,
          };
          successfulUploads.push(entry);
          remaining -= 1;
          if (!firstSettled) {
            firstSettled = true;
            resolveFirst(entry);
          }
          checkCompleted();
        } else {
          recordFailure(server, "Response missing CID or URL");
        }
      },
      (err) => {
        activeControllers.delete(uploadId);
        if (options?.signal?.aborted && !firstSettled) {
          firstSettled = true;
          remaining -= 1;
          abortAllActive();
          rejectFirst(
            err?.name === "AbortError" ? err : new DOMException("Upload aborted", "AbortError"),
          );
          checkCompleted();
          return;
        }
        console.warn(`Originless upload failed for ${server}: ${err?.message}`);
        emitUploadProgress(options, {
          phase: "uploading",
          uploadId,
          server,
          type: "originless",
          method: "POST",
          status: "failed",
          error: err?.message,
          totalUploads,
        });
        recordFailure(server, err?.message);
      },
    );
  });

  const primary = await first;
  return {
    type: "media",
    cid: primary.cid || "",
    url: primary.url || "",
    server: primary.server || "",
    servers: [primary.server],
    redundancyCount: 1,
    completed,
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
    const uploaded = await uploadToOriginless(server, file, { timeoutMs: 10_000 });

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
