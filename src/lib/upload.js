import { readConfiguredRelays, DEFAULT_RELAYS } from "@/config/servers";
import { sealBlob } from "@/lib/rabta";

async function prepareBlobUpload(fileOrPrepared) {
  if (fileOrPrepared && fileOrPrepared.rawBytes) {
    return fileOrPrepared;
  }

  const name = fileOrPrepared.name || "gupt.bin";
  const buffer = await fileOrPrepared.arrayBuffer();
  const rawBytes = new Uint8Array(buffer);

  return { rawBytes, name, fileSize: rawBytes.byteLength };
}

function emitUploadProgress(options, update) {
  options?.onProgress?.(update);
}

const BASE_TIMEOUT_MS = 30_000;
const MIN_UPLOAD_BYTES_PER_SEC = 50_000;
const STALL_TIMEOUT_MS = 5000;

export function calcTimeoutMs(file, overrideMs) {
  if (overrideMs) return Number(overrideMs);
  const sizeBytes = file?.size ?? file?.fileSize ?? 0;
  return Math.max(BASE_TIMEOUT_MS, Math.ceil((sizeBytes / MIN_UPLOAD_BYTES_PER_SEC) * 1000));
}

function uploadBlobViaXhr(
  url,
  bodyBytes,
  { signal, timeoutMs, stallTimeoutMs = STALL_TIMEOUT_MS, onProgress } = {},
) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
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
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
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

    const blobPayload = new Blob([bodyBytes], { type: "application/octet-stream" });
    xhr.send(blobPayload);
  });
}

export async function uploadFile(file, options = {}) {
  const configuredRelays = readConfiguredRelays();
  const relays = configuredRelays.length ? configuredRelays : [...DEFAULT_RELAYS];
  const timeoutMs = calcTimeoutMs(file, options?.timeoutMs);

  if (options?.signal?.aborted) {
    throw new DOMException("Upload aborted", "AbortError");
  }

  const prepared = await prepareBlobUpload(file);
  const emit = (update) => emitUploadProgress(options, update);

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

  const totalUploads = relays.length;

  try {
    const successes = [];
    const errors = [];

    // Upload to ALL available Rabta relays in parallel
    const settled = await Promise.allSettled(
      relays.map(async (targetRelay, i) => {
        const uploadId = `rabta-blob-${i}`;
        emit({
          phase: "uploading",
          uploadId,
          server: targetRelay,
          type: "rabta",
          method: "PUT",
          status: "started",
          attempt: i + 1,
          totalUploads,
          percent: 0,
        });

        const url = `${targetRelay.replace(/\/+$/, "")}/api/v1/blobs`;
        let data;

        if (typeof XMLHttpRequest !== "undefined") {
          data = await uploadBlobViaXhr(url, bodyBytes, {
            signal: options?.signal,
            timeoutMs,
            onProgress(prog) {
              emit({
                phase: "uploading",
                uploadId,
                server: targetRelay,
                type: "rabta",
                method: "PUT",
                status: "uploading",
                attempt: i + 1,
                totalUploads,
                percent: prog.percent,
                loaded: prog.loaded,
                total: prog.total,
              });
            },
          });
        } else {
          const res = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: new Blob([bodyBytes], { type: "application/octet-stream" }),
            signal: options?.signal,
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${res.status}`);
          }
          data = await res.json();
        }

        const hash = data?.hash || data?.cid;
        if (!hash) {
          throw new Error("Invalid response from Rabta blob upload.");
        }

        const directUrl = data.url?.startsWith("http")
          ? data.url
          : `${targetRelay.replace(/\/+$/, "")}${data.url?.startsWith("/") ? "" : "/"}${data.url || `api/v1/blobs/${hash}`}`;

        const result = {
          hash,
          url: directUrl,
          server: targetRelay,
        };

        emit({
          phase: "uploading",
          uploadId,
          server: targetRelay,
          type: "rabta",
          method: "PUT",
          status: "done",
          percent: 100,
          retryCount: 0,
          maxRetries: 0,
          totalUploads,
        });

        return result;
      }),
    );

    for (let i = 0; i < settled.length; i++) {
      const res = settled[i];
      if (res.status === "fulfilled") {
        successes.push(res.value);
      } else {
        errors.push(res.reason);
        emit({
          phase: "uploading",
          uploadId: `rabta-blob-${i}`,
          server: relays[i],
          type: "rabta",
          method: "PUT",
          status: "failed",
          error: res.reason?.message || String(res.reason),
          retryCount: 0,
          maxRetries: 0,
          totalUploads,
        });
      }
    }

    if (!successes.length) {
      throw errors[0] || new Error("Failed to upload blob to any Rabta relay.");
    }

    const primary = successes[0];
    return {
      type: "media",
      hash: primary.hash,
      url: primary.url || "",
      server: primary.server,
      relays: successes.map((s) => s.server),
    };
  } catch (err) {
    emit({
      phase: "uploading",
      uploadId: "rabta-blob-overall",
      server: relays[0] || "",
      type: "rabta",
      method: "PUT",
      status: "failed",
      error: err?.message || String(err),
      retryCount: 0,
      maxRetries: 0,
      totalUploads,
    });
    throw err;
  }
}
