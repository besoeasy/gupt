/**
 * Where a forced sign-in should send the user back to.
 *
 * Shared links — invites, profiles, deep links — can land on a device with no
 * account. The router gate heads them to /welcome, but the `?next=` query
 * does not survive the welcome chooser's method links. The destination lives
 * here instead, one hop outside the query chain: written when access needs an
 * account, consumed exactly once after the first successful sign-in. A TTL
 * keeps a long-abandoned path from generating a surprising redirect much later.
 */
const KEY = "gupt.pendingRoute";
const TTL_MS = 3 * 24 * 60 * 60 * 1000;

function validTarget(path) {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/welcome")
  );
}

export function rememberPendingRoute(fullPath) {
  const path = String(fullPath || "");
  if (!validTarget(path)) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, ts: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** Returns the remembered path and clears it — single use. */
export function takePendingRoute() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return "";
    localStorage.removeItem(KEY);
    const entry = JSON.parse(raw);
    if (!Number.isFinite(entry?.ts) || Date.now() - entry.ts > TTL_MS) return "";
    return validTarget(entry.path) ? entry.path : "";
  } catch {
    return "";
  }
}
