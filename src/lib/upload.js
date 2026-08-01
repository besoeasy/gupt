import { buildOriginlessUploadUrl, readConfiguredOriginlessServers } from "@/config/servers";

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
        cid: primary.cid || "",
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
          const ok = Boolean(uploaded?.cid || uploaded?.url);
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
              cid: uploaded.cid || "",
              url: uploaded.url || "",
              server,
            });
          } else {
            failures.push({ server, error: "Response missing CID or URL" });
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
