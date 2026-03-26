// parallel-race downloader: fetch from all mirrors in parallel
// Resolve with the first successful download and abort others.

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(digest));
}

export async function downloadFromMirrors(mirrors, options = {}) {
  if (!Array.isArray(mirrors) || mirrors.length === 0) {
    throw new Error("No mirrors provided");
  }

  // Default per-mirror timeout: 15 minutes (900000 ms).
  // Use nullish coalescing so callers can pass 0 to explicitly disable the timer.
  const timeoutMs = Number(options?.timeoutMs ?? 15 * 60 * 1000);
  const expectedSha256 = options?.expectedSha256 || options?.expectedHash || null;
  const path = options?.path || "";
  const userSignal = options?.signal;

  let finished = false;
  const controllers = [];
  const timers = [];
  const errors = [];
  let remaining = mirrors.length;

  return new Promise((resolve, reject) => {
    const abortAll = () => {
      for (const c of controllers) {
        try {
          c.abort();
        } catch (e) {
          // ignore
        }
      }
      for (const t of timers) {
        clearTimeout(t);
      }
    };

    if (userSignal) {
      if (userSignal.aborted) {
        return reject(new Error("aborted"));
      }
      userSignal.addEventListener(
        "abort",
        () => {
          if (!finished) {
            finished = true;
            abortAll();
            reject(new Error("aborted"));
          }
        },
        { once: true },
      );
    }

    for (const base of mirrors) {
      const controller = new AbortController();
      controllers.push(controller);
      const url = path ? new URL(path, base).toString() : String(base);
      let timer = null;
      if (timeoutMs > 0) {
        timer = setTimeout(() => controller.abort(), timeoutMs);
        timers.push(timer);
      }

      fetch(url, { signal: controller.signal, redirect: "follow" })
        .then(async (res) => {
          if (timer) clearTimeout(timer);
          if (!res.ok) throw new Error(`HTTP ${res.status} from ${base}`);
          const buf = await res.arrayBuffer();
          const blob = new Blob([buf]);
          let actualSha = "";
          if (expectedSha256) {
            actualSha = await sha256Hex(blob);
            if (actualSha !== String(expectedSha256).toLowerCase()) {
              throw new Error(`hash mismatch from ${base}`);
            }
          } else {
            actualSha = await sha256Hex(blob);
          }

          if (!finished) {
            finished = true;
            abortAll();
            resolve({
              ok: true,
              url,
              mirror: base,
              blob,
              size: buf.byteLength,
              sha256: actualSha,
            });
          }
        })
        .catch((err) => {
          if (timer) clearTimeout(timer);
          if (finished) return;
          errors.push({ mirror: base, error: err instanceof Error ? err.message : String(err) });
          remaining -= 1;
          if (!finished && remaining === 0) {
            finished = true;
            reject(
              new Error(
                `all mirrors failed: ${errors.map((e) => `${e.mirror}: ${e.error}`).join("; ")}`,
              ),
            );
          }
        });
    }
  });
}
