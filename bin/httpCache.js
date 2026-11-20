import path from "node:path";

/**
 * Files whose URL is stable but whose content is the deploy itself. A browser
 * that pins either for a year keeps an old service worker or an old manifest,
 * so both revalidate on every load.
 */
const REVALIDATE_BASENAMES = new Set(["sw.js", "manifest.webmanifest"]);

/**
 * Cache-Control for a file served out of dist/. Keep in sync with the Caddyfile,
 * which applies the same policy through the Docker image.
 */
export function cacheControlFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html" || ext === "") return "no-store";
  if (REVALIDATE_BASENAMES.has(path.basename(filePath).toLowerCase())) return "no-cache";
  return "public, max-age=31536000, immutable";
}
