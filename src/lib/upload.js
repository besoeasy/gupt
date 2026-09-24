import {
  buildOriginlessDownloadUrl,
  buildOriginlessUploadUrl,
  readConfiguredOriginlessServers,
} from "@/config/servers";
import {
  ORIGINLESS_BG_MAX_ATTEMPTS,
  ORIGINLESS_BG_STALL_MS,
  ORIGINLESS_BG_TIMEOUT_CAP_MS,
  ORIGINLESS_FG_HEDGE_DELAY_MS,
  ORIGINLESS_FG_MAX_ACTIVE,
  backoffDelayMs,
  rankOriginlessServers,
  recordOriginlessFailure,
  recordOriginlessSuccess,
  shouldRetryUploadError,
} from "@/lib/originlessHealth";

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

async function uploadViaFetch(url, formData, { signal, timeoutMs } = {}) {
  // Fetch exposes no upload-progress events, so stall detection is impossible
  // here — rely on the absolute size-scaled timeout only.
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) throw new DOMException("Upload aborted", "AbortError");
    signal.addEventListener("abort", onAbort, { once: true });
  }

  const timeoutId = timeoutMs
    ? setTimeout(() => controller.abort(new Error("Upload timed out")), timeoutMs)
    : null;

  try {
    const res = await fetch(url, { method: "POST", body: formData, signal: controller.signal });
    if (!res.ok) throw await readUploadFailure(res);
    return await res.json().catch(() => ({}));
  } finally {
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

export function calcTimeoutMs(file, overrideMs) {
  if (overrideMs) return Number(overrideMs);
  const sizeBytes = file?.size ?? file?.fileSize ?? 0;
  return Math.max(BASE_TIMEOUT_MS, Math.ceil((sizeBytes / MIN_UPLOAD_BYTES_PER_SEC) * 1000));
}

function sleepMs(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

const bgQueue = [];
let bgPumping = false;

function enqueueBackgroundReplicate(job) {
  let resolveCompleted;
  const completed = new Promise((resolve) => {
    resolveCompleted = resolve;
  });
  bgQueue.push({ ...job, resolveCompleted });
  void pumpBackgroundQueue();
  return completed;
}

async function pumpBackgroundQueue() {
  if (bgPumping) return;
  bgPumping = true;
  try {
    while (bgQueue.length) {
      const job = bgQueue.shift();
      await runBackgroundJob(job).catch(() => {});
    }
  } finally {
    bgPumping = false;
  }
}

async function runBackgroundJob(job) {
  const successes = [{ cid: job.primary.cid, url: job.primary.url, server: job.primary.server }];
  const failures = [];

  for (const server of job.rest) {
    let attempt = 0;
    let replicated = false;
    while (attempt < ORIGINLESS_BG_MAX_ATTEMPTS && !replicated) {
      if (attempt > 0) await sleepMs(backoffDelayMs(attempt - 1));
      attempt += 1;
      const perAttemptTimeout = Math.min(ORIGINLESS_BG_TIMEOUT_CAP_MS, job.baseTimeoutMs);
      try {
        const uploaded = await uploadToOriginless(server, job.prepared, {
          timeoutMs: perAttemptTimeout,
          stallTimeoutMs: ORIGINLESS_BG_STALL_MS,
        });
        if (!uploaded?.cid && !uploaded?.url) {
          throw new Error("Response missing CID or URL");
        }
        if (uploaded.cid && job.primary.cid && uploaded.cid !== job.primary.cid) {
          throw new Error("CID mismatch across Originless servers");
        }
        recordOriginlessSuccess(server, 0);
        successes.push({ cid: uploaded.cid || "", url: uploaded.url || "", server });
        job.emit({
          phase: "uploading",
          server,
          type: "originless",
          method: "POST",
          status: "done",
          percent: 100,
          background: true,
          totalUploads: job.totalUploads,
        });
        replicated = true;
      } catch (err) {
        if (err?.name !== "AbortError") recordOriginlessFailure(server);
        job.emit({
          phase: "uploading",
          server,
          type: "originless",
          method: "POST",
          status: "failed",
          error: err?.message,
          retryCount: attempt,
          maxRetries: ORIGINLESS_BG_MAX_ATTEMPTS,
          background: true,
          totalUploads: job.totalUploads,
        });
        if (!shouldRetryUploadError(err, attempt)) {
          failures.push({ server, error: err?.message || String(err) });
          break;
        }
        if (attempt >= ORIGINLESS_BG_MAX_ATTEMPTS) {
          failures.push({ server, error: err?.message || String(err) });
        }
      }
    }
  }

  const ordered = job.ranked
    .map((server) => successes.find((result) => result.server === server))
    .filter(Boolean);
  job.resolveCompleted({
    servers: (ordered.length ? ordered : successes).map((s) => s.server),
    redundancyCount: successes.length,
    failures: failures.map((entry) => entry.error || String(entry.error || "upload failed")),
  });
}

function raceForeground(
  ranked,
  prepared,
  { timeoutMs, stallTimeoutMs, signal, totalUploads, emit },
) {
  return new Promise((resolve, reject) => {
    const pending = [...ranked];
    const active = new Map();
    let settled = false;
    let hedgeTimer = null;
    let lastError = null;
    let nextId = 0;

    function cleanup() {
      if (hedgeTimer) {
        clearTimeout(hedgeTimer);
        hedgeTimer = null;
      }
      signal?.removeEventListener("abort", onParentAbort);
    }

    function abortActive() {
      for (const controller of active.values()) {
        try {
          controller.abort();
        } catch {}
      }
      active.clear();
    }

    function onParentAbort() {
      if (settled) return;
      settled = true;
      cleanup();
      abortActive();
      reject(new DOMException("Upload aborted", "AbortError"));
    }

    function checkDone() {
      if (settled || active.size > 0 || pending.length > 0) return;
      settled = true;
      cleanup();
      reject(new Error(lastError || "Upload failed on all servers."));
    }

    let target = 1;
    function launchNext() {
      if (settled) return;
      while (active.size < target && pending.length) {
        launch(pending.shift());
      }
      checkDone();
    }

    function launch(server) {
      const uploadId = `originless-${nextId++}`;
      const controller = new AbortController();
      active.set(uploadId, controller);
      if (signal) {
        if (signal.aborted) {
          controller.abort(signal.reason);
        } else {
          signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
        }
      }
      const startedAt = Date.now();

      emit({
        phase: "uploading",
        uploadId,
        server,
        type: "originless",
        method: "POST",
        status: "started",
        attempt: 1,
        totalUploads,
      });

      uploadToOriginless(server, prepared, {
        signal: controller.signal,
        timeoutMs,
        stallTimeoutMs,
        onProgress(p) {
          if (settled) return;
          if (p.loaded != null) {
            emit({
              phase: "uploading",
              uploadId,
              server,
              type: "originless",
              method: "POST",
              status: "progress",
              loaded: p.loaded,
              total: p.total,
              percent: p.percent,
              retryCount: 0,
              maxRetries: 0,
              totalUploads,
            });
          }
        },
      }).then(
        (uploaded) => {
          active.delete(uploadId);
          if (settled) return;
          if (uploaded?.cid || uploaded?.url) {
            settled = true;
            cleanup();
            abortActive();
            recordOriginlessSuccess(server, Date.now() - startedAt);
            emit({
              phase: "uploading",
              uploadId,
              server,
              type: "originless",
              method: "POST",
              status: "done",
              percent: 100,
              retryCount: 0,
              maxRetries: 0,
              totalUploads,
            });
            resolve({ cid: uploaded.cid || "", url: uploaded.url || "", server });
          } else {
            lastError = "Response missing CID or URL";
            recordOriginlessFailure(server);
            emit({
              phase: "uploading",
              uploadId,
              server,
              type: "originless",
              method: "POST",
              status: "failed",
              error: lastError,
              retryCount: 0,
              maxRetries: 0,
              totalUploads,
            });
            launchNext();
          }
        },
        (err) => {
          active.delete(uploadId);
          if (settled) return;
          if (signal?.aborted) {
            settled = true;
            cleanup();
            abortActive();
            reject(
              err?.name === "AbortError" ? err : new DOMException("Upload aborted", "AbortError"),
            );
            return;
          }
          lastError = err?.message || "upload failed";
          if (err?.name !== "AbortError") recordOriginlessFailure(server);
          console.warn(`Originless upload failed for ${server}: ${lastError}`);
          emit({
            phase: "uploading",
            uploadId,
            server,
            type: "originless",
            method: "POST",
            status: "failed",
            error: lastError,
            retryCount: 0,
            maxRetries: 0,
            totalUploads,
          });
          launchNext();
        },
      );
    }

    signal?.addEventListener("abort", onParentAbort, { once: true });
    launchNext();
    if (pending.length && !settled) {
      hedgeTimer = setTimeout(() => {
        hedgeTimer = null;
        target = ORIGINLESS_FG_MAX_ACTIVE;
        launchNext();
      }, ORIGINLESS_FG_HEDGE_DELAY_MS);
    }
  });
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
  const ranked = rankOriginlessServers(shuffleTargets(originlessServers));
  const totalUploads = ranked.length;
  const emit = (update) => emitUploadProgress(options, update);

  const primary = await raceForeground(ranked, prepared, {
    timeoutMs,
    stallTimeoutMs: options?.stallTimeoutMs ?? STALL_TIMEOUT_MS,
    signal: options?.signal,
    totalUploads,
    emit,
  });

  const rest = ranked.filter((server) => server !== primary.server);
  const completed = rest.length
    ? enqueueBackgroundReplicate({
        prepared,
        primary,
        rest,
        ranked,
        baseTimeoutMs: timeoutMs,
        totalUploads,
        emit,
      })
    : Promise.resolve({
        servers: [primary.server],
        redundancyCount: 1,
        failures: [],
      });

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
