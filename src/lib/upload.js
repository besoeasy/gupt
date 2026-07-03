
import {
  buildOriginlessUploadUrl,
  readConfiguredOriginlessServers,
  BLOSSOM_FALLBACK_SERVER,
} from "@/config/servers";
import { uploadToBlossomFallback } from "@/lib/fallback_upload";


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

  // ── Originless: race up to PROPAGATION_TARGETS servers, first CID wins ────
  const originlessPromise =
    targets.length > 0
      ? (() => {
          const attempts = targets.map((server) => {
            const controller =
              typeof AbortController !== "undefined" ? new AbortController() : null;
            const signal = controller?.signal;
            const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

            emitUploadProgress(options, {
              phase: "uploading",
              server,
              type: "originless",
              method: "POST",
              parallel: targets.length > 1,
            });

            return uploadToOriginless(server, file, { signal })
              .then((uploaded) => {
                if (timeoutId) clearTimeout(timeoutId);
                return uploaded?.cid ? { cid: uploaded.cid, server } : null;
              })
              .catch((err) => {
                if (timeoutId) clearTimeout(timeoutId);
                console.warn(`Originless upload failed for ${server}: ${err?.message}`);
                return null;
              });
          });

          // Resolve with the first non-null CID result; remaining keep seeding in background.
          return new Promise((resolve) => {
            let settled = 0;
            let resolved = false;
            for (const p of attempts) {
              p.then((result) => {
                settled += 1;
                if (result && !resolved) {
                  resolved = true;
                  resolve(result);
                } else if (settled === attempts.length && !resolved) {
                  resolve(null);
                }
              });
            }
          });
        })()
      : Promise.resolve(null);

  // ── Blossom: always upload in parallel ────────────────────────────────────
  const blossomPromise = (() => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const signal = controller?.signal;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    emitUploadProgress(options, {
      phase: "uploading",
      server: BLOSSOM_FALLBACK_SERVER,
      type: "blossom",
      method: "PUT",
    });

    return uploadToBlossomFallback(file, { signal })
      .then((url) => {
        if (timeoutId) clearTimeout(timeoutId);
        return url || null;
      })
      .catch((err) => {
        if (timeoutId) clearTimeout(timeoutId);
        console.warn(`Blossom upload failed: ${err?.message}`);
        return null;
      });
  })();

  // ── Wait for both, then build unified result ───────────────────────────────
  const [originlessResult, blossomUrl] = await Promise.all([originlessPromise, blossomPromise]);

  if (!originlessResult && !blossomUrl) {
    throw new Error("Upload failed on all servers.");
  }

  return {
    type: "media",
    cid: originlessResult?.cid || "",
    server: originlessResult?.server || "",
    fallback: blossomUrl || "",
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
