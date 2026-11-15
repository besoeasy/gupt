import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const MEDIA_CACHE = "gupt-media-runtime-v1";
const MEDIA_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const MEDIA_MAX_ENTRIES = 200;

// Relay blobs are content-addressed (hash = SHA-256 of the body) and served
// with strong immutable ETags, so a repeat GET can never return different
// bytes for the same URL. Ciphertext only; decryption stays client-side.
const RELAY_BLOB_CACHE = "gupt-relay-blobs-v1";
const RELAY_BLOB_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const RELAY_BLOB_MAX_ENTRIES = 300;

function isRelayBlobRequest(url) {
  return /\/api\/v1\/blobs\/[0-9a-f]{64}$/i.test(url.pathname);
}

registerRoute(
  ({ url, request }) => request.method === "GET" && isRelayBlobRequest(url),
  new CacheFirst({
    cacheName: RELAY_BLOB_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: RELAY_BLOB_MAX_ENTRIES,
        maxAgeSeconds: RELAY_BLOB_MAX_AGE_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

function isMediaRequest(url) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const path = url.pathname.toLowerCase();
  return (
    path.includes("/down/") ||
    path.includes("/api/file/") ||
    path.includes("/files/") ||
    path.includes("/blob/") ||
    /\.(jpe?g|png|gif|webp|mp4|webm|mp3|ogg|wav|m4a)(\?|$)/.test(path)
  );
}

registerRoute(
  ({ url, request }) => request.method === "GET" && isMediaRequest(url),
  new CacheFirst({
    cacheName: MEDIA_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: MEDIA_MAX_ENTRIES,
        maxAgeSeconds: MEDIA_MAX_AGE_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);
