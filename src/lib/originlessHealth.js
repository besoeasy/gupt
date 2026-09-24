const STORAGE_KEY = "gupt_originless_health_v1";

export const ORIGINLESS_BAN_MS = 5 * 60 * 1000;
export const ORIGINLESS_BG_MAX_ATTEMPTS = 3;
export const ORIGINLESS_BG_BACKOFF_MS = Object.freeze([2000, 8000, 20000]);
export const ORIGINLESS_BG_TIMEOUT_CAP_MS = 12 * 60 * 1000;
export const ORIGINLESS_BG_STALL_MS = 10_000;
export const ORIGINLESS_FG_HEDGE_DELAY_MS = 1500;
export const ORIGINLESS_FG_MAX_ACTIVE = 2;
export const ORIGINLESS_UNKNOWN_LATENCY_MS = 1500;

const memory = new Map();

function readStored() {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStored(entries) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

function readEntry(server) {
  if (memory.has(server)) return memory.get(server);
  const stored = readStored()[server];
  const entry = {
    ok: Number(stored?.ok) || 0,
    fail: Number(stored?.fail) || 0,
    latencyMs: Number.isFinite(Number(stored?.latencyMs)) ? Number(stored.latencyMs) : null,
    bannedUntil: Number(stored?.bannedUntil) || 0,
  };
  memory.set(server, entry);
  return entry;
}

function persistEntry(server, entry) {
  memory.set(server, entry);
  if (typeof localStorage === "undefined") return;
  try {
    const all = readStored();
    all[server] = entry;
    const keys = Object.keys(all).slice(-50);
    const trimmed = {};
    for (const key of keys) trimmed[key] = all[key];
    writeStored(trimmed);
  } catch {}
}

export function isOriginlessBanned(server, now = Date.now()) {
  return readEntry(server).bannedUntil > now;
}

export function rankOriginlessServers(servers, now = Date.now()) {
  const list = [...(servers || [])];
  return list
    .map((server, index) => ({ server, index, entry: readEntry(server) }))
    .sort((a, b) => {
      const aBanned = a.entry.bannedUntil > now ? 1 : 0;
      const bBanned = b.entry.bannedUntil > now ? 1 : 0;
      if (aBanned !== bBanned) return aBanned - bBanned;
      if (a.entry.fail !== b.entry.fail) return a.entry.fail - b.entry.fail;
      const aLatency = a.entry.latencyMs ?? ORIGINLESS_UNKNOWN_LATENCY_MS;
      const bLatency = b.entry.latencyMs ?? ORIGINLESS_UNKNOWN_LATENCY_MS;
      if (aLatency !== bLatency) return aLatency - bLatency;
      return a.index - b.index;
    })
    .map((item) => item.server);
}

export function recordOriginlessSuccess(server, latencyMs) {
  if (!server) return;
  const entry = readEntry(server);
  const latency = Number(latencyMs);
  persistEntry(server, {
    ok: entry.ok + 1,
    fail: 0,
    latencyMs: Number.isFinite(latency) && latency >= 0 ? Math.round(latency) : entry.latencyMs,
    bannedUntil: 0,
  });
}

export function recordOriginlessFailure(server, now = Date.now()) {
  if (!server) return;
  const entry = readEntry(server);
  persistEntry(server, {
    ok: entry.ok,
    fail: entry.fail + 1,
    latencyMs: entry.latencyMs,
    bannedUntil: now + ORIGINLESS_BAN_MS,
  });
}

export function clearOriginlessHealth() {
  memory.clear();
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

const PERMANENT_MESSAGE_RE = /invalid|missing cid|did not contain a cid|cid mismatch/i;

export function isTransientUploadError(error) {
  if (!error) return false;
  if (error?.name === "AbortError") return false;
  const message = error instanceof Error ? error.message : String(error || "");
  if (PERMANENT_MESSAGE_RE.test(message)) return false;
  const match = message.match(/Upload failed \((\d+)\)|Media (?:upload|fetch) failed \((\d+)\)/);
  const status = Number(match?.[1] || match?.[2] || 0);
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
  return true;
}

export function backoffDelayMs(attemptIndex) {
  return ORIGINLESS_BG_BACKOFF_MS[attemptIndex] ?? 20_000;
}

export function shouldRetryUploadError(
  error,
  attemptsDone,
  maxAttempts = ORIGINLESS_BG_MAX_ATTEMPTS,
) {
  return attemptsDone < maxAttempts && isTransientUploadError(error);
}
