import { uploadBlobToOriginless } from "@/lib/upload";
import { fetchCidFromGateways } from "@/lib/gatewayFetch";
import { readConfiguredIpfsGateways } from "@/config/servers";

// Anything at or above this round-trip time rates 0. Linear 100 → 1 below it.
export const ORIGINLESS_RATING_WINDOW_MS = 200_000;
export const ORIGINLESS_RATING_BYTES = 8 * 1024;

// Floor for a single gateway probe, so a nearly exhausted window still yields
// one usable attempt instead of a 0ms timeout that always loses the race.
const MIN_GATEWAY_PROBE_MS = 5_000;

const RATING_STORAGE_KEY = "gupt_originless_rating_v1";

const TEXT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomTextBytes(size) {
  const indices = crypto.getRandomValues(new Uint8Array(size));
  const chars = new Array(size);
  for (let i = 0; i < size; i += 1) chars[i] = TEXT_ALPHABET[indices[i] % TEXT_ALPHABET.length];
  return new TextEncoder().encode(chars.join(""));
}

function bytesEqual(a, b) {
  if (a?.length !== b?.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function ratingForElapsedMs(elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  if (elapsedMs >= ORIGINLESS_RATING_WINDOW_MS) return 0;
  return Math.max(1, Math.round(100 * (1 - elapsedMs / ORIGINLESS_RATING_WINDOW_MS)));
}

export function getLastOriginlessRating() {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(RATING_STORAGE_KEY));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistRating(result) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(RATING_STORAGE_KEY, JSON.stringify(result));
  } catch {}
}

export async function rateOriginlessServer(server, { signal, onPhase } = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) throw signal.reason || new DOMException("Rating aborted", "AbortError");
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new Error(`Rating timed out after ${ORIGINLESS_RATING_WINDOW_MS}ms`));
  }, ORIGINLESS_RATING_WINDOW_MS);

  try {
    const bytes = randomTextBytes(ORIGINLESS_RATING_BYTES);
    const file = new File([bytes], `gupt-rating-${Date.now()}.txt`, { type: "text/plain" });

    const uploadStartedAt = Date.now();
    onPhase?.({ phase: "upload" });
    const uploaded = await uploadBlobToOriginless(server, file, {
      signal: controller.signal,
      timeoutMs: ORIGINLESS_RATING_WINDOW_MS,
    });
    const uploadMs = Date.now() - uploadStartedAt;
    if (!uploaded?.cid) throw new Error("Server returned no CID");

    const fetchStartedAt = Date.now();
    onPhase?.({ phase: "fetch", uploadMs: Date.now() - uploadStartedAt });

    // This probe measures a round-trip time, so backoff is actively harmful
    // here: a retry both inflates the very latency we rate on and can outlive
    // the rating window (the shared defaults sleep ~300s per gateway against a
    // 200s budget). Probe each configured gateway once instead and let the
    // fall-through in fetchCidFromGateways do the trying, splitting what is
    // left of the window evenly so one dead gateway cannot starve the rest.
    const gateways = readConfiguredIpfsGateways();
    const remainingMs = Math.max(0, ORIGINLESS_RATING_WINDOW_MS - (Date.now() - startedAt));
    const perGatewayMs = Math.max(
      MIN_GATEWAY_PROBE_MS,
      Math.floor(remainingMs / Math.max(1, gateways.length)),
    );
    const fetched = await fetchCidFromGateways(uploaded.cid, {
      gateways,
      signal: controller.signal,
      timeoutMs: perGatewayMs,
      retries: 0,
    });
    const fetchMs = Date.now() - fetchStartedAt;
    if (!bytesEqual(bytes, new Uint8Array(fetched.bytes))) {
      throw new Error("Fetched bytes do not match upload");
    }

    const totalMs = Date.now() - startedAt;
    const result = {
      ok: true,
      server,
      rating: ratingForElapsedMs(totalMs),
      uploadMs,
      fetchMs,
      totalMs,
      cid: uploaded.cid,
      gateway: fetched.gateway,
      at: Date.now(),
      error: null,
    };
    persistRating(result);
    return result;
  } catch (err) {
    if (signal?.aborted) throw err;
    const result = {
      ok: false,
      server,
      rating: 0,
      uploadMs: null,
      fetchMs: null,
      totalMs: Date.now() - startedAt,
      cid: "",
      at: Date.now(),
      error: err?.message || String(err),
    };
    persistRating(result);
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
