// gupt-mark's offline queue. The bookmarklet can save a link from any page in
// a brand-new tab, where (since the account went session-only) there is no
// identity and also none needed: we pile raw links into localStorage and the
// Bookmarks view imports them into the encrypted stream next time an account
// is loaded. Nothing here is a secret, and guest tabs must be able to write it.
const QUEUE_KEY = "guptmark_queue";

// Hard cap so a runaway prompt loop cannot fill storage.
const QUEUE_MAX = 50;

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((row) => row && typeof row.url === "string") : [];
  } catch {
    return [];
  }
}

function writeQueue(rows) {
  try {
    if (rows.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(rows));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    // storage full — drop oldest and retry once
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(rows.slice(-Math.ceil(QUEUE_MAX / 2))));
    } catch {}
  }
}

export function listPendingBookmarks() {
  return readQueue();
}

/**
 * Adds a link to the offline queue. Dedupes by URL so double-tapping the
 * bookmarklet on the same page does not stack duplicates; caps the queue so a
 * prompt loop cannot fill storage.
 */
export function addPendingBookmark({ url, title = "", tags = [] }) {
  const trimmedUrl = String(url || "").trim();
  if (!trimmedUrl) return;
  const rows = readQueue().filter((row) => row.url !== trimmedUrl);
  rows.push({
    url: trimmedUrl,
    title: String(title || "").trim(),
    tags: (Array.isArray(tags) ? tags : []).map((t) => String(t).trim()).filter(Boolean),
    at: Date.now(),
  });
  writeQueue(rows.slice(-QUEUE_MAX));
}

/** Removes one entry (by URL) after it has been published successfully. */
export function removePendingBookmark(url) {
  writeQueue(readQueue().filter((row) => row.url !== url));
}
