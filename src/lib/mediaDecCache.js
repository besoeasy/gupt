/**
 * Reading the decrypted-media cache.
 *
 * The cache is a shortcut: a file that was decrypted once should come back
 * without touching the relays again. It is only a shortcut while the bytes it
 * holds are real — a zero-length entry would be handed to an <img> and render
 * as a broken picture, with the retry card never shown because a blob URL
 * exists.
 */

/** The cache key for one message's decrypted file. */
export function decCachedKey(messageId) {
  return `dec:${String(messageId || "")}`;
}

/**
 * Normalize a stored cache row into usable bytes, or null when it holds
 * nothing worth rendering. `previewable: false` means the browser could not
 * decode the file when it was cached, so it can be saved but not drawn.
 */
export function usableDecCachedRow(row) {
  if (!row?.buf) return null;
  const buf = row.buf instanceof Uint8Array ? row.buf : new Uint8Array(row.buf);
  if (!buf.byteLength) return null;
  return {
    buf,
    mime: typeof row.mime === "string" ? row.mime : "",
    previewable: row.previewable !== false,
  };
}
