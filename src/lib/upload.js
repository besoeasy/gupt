import { readConfiguredRelays } from "@/config/servers";
import { sealBlob } from "@/lib/rabta";

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

async function readUploadFailure(response) {
  let text = "";
  try {
    text = await response.text();
  } catch {}
  const status = response?.status || 0;
  const snippet = text ? text.slice(0, 200).trim() : "";
  return new Error(`Upload failed (${status})${snippet ? `: ${snippet}` : ""}`);
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
    // Only a URL the server itself advertised. Synthesising one from a
    // hardcoded gateway here would bypass the user's configured gateway list
    // and skip backoff entirely, so retrieval stays with lib/gatewayFetch.js.
    url: pickUploadUrl(payload) || "",
    raw: payload,
  };
}

export function uploadBlobToOriginless(server, fileOrPrepared, options = {}) {
  return uploadToOriginless(server, fileOrPrepared, options);
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

export async function uploadFile(file, options = {}) {
  const relays = readConfiguredRelays();
  const server = relays[0] || "https://rabta.t3nk.com";
  const timeoutMs = calcTimeoutMs(file, options?.timeoutMs);

  if (options?.signal?.aborted) {
    throw new DOMException("Upload aborted", "AbortError");
  }

  const prepared = await prepareBlobUpload(file);
  const emit = (update) => emitUploadProgress(options, update);
  const uploadId = "rabta-blob-0";

  emit({
    phase: "uploading",
    uploadId,
    server,
    type: "rabta",
    method: "PUT",
    status: "started",
    attempt: 1,
    totalUploads: 1,
  });

  // Ensure body is RABTA1 container format
  let rawBytes = prepared.rawBytes;
  if (!rawBytes && prepared instanceof File) {
    rawBytes = new Uint8Array(await prepared.arrayBuffer());
  }
  let bodyBytes = rawBytes;
  const magic = new TextDecoder().decode(rawBytes.subarray(0, 6));
  if (magic !== "RABTA1") {
    const tempSecret = crypto.getRandomValues(new Uint8Array(32));
    bodyBytes = sealBlob(rawBytes, tempSecret);
  }

  try {
    let lastError = null;
    let uploaded = null;

    for (const targetRelay of relays) {
      try {
        const url = `${targetRelay.replace(/\/+$/, "")}/api/v1/blobs`;
        const res = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: bodyBytes,
          signal: options?.signal,
        });

        if (res.ok) {
          const data = await res.json();
          uploaded = {
            cid: data.hash,
            hash: data.hash,
            url: data.url,
            server: targetRelay,
          };
          break;
        } else {
          const errData = await res.json().catch(() => ({}));
          lastError = new Error(errData.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (!uploaded) {
      throw lastError || new Error("Failed to upload blob to any Rabta relay.");
    }

    emit({
      phase: "uploading",
      uploadId,
      server: uploaded.server,
      type: "rabta",
      method: "PUT",
      status: "done",
      percent: 100,
      retryCount: 0,
      maxRetries: 0,
      totalUploads: 1,
    });

    return {
      type: "media",
      cid: uploaded.cid || "",
      hash: uploaded.cid || "",
      url: uploaded.url || "",
      server: uploaded.server,
    };
  } catch (err) {
    emit({
      phase: "uploading",
      uploadId,
      server,
      type: "rabta",
      method: "PUT",
      status: "failed",
      error: err?.message || String(err),
      retryCount: 0,
      maxRetries: 0,
      totalUploads: 1,
    });
    throw err;
  }
}
}
