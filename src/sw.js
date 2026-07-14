import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";

// Injected by VitePWA at build time
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Instantly take over so the app reloads immediately on update
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const MEDIA_CACHE = "gupt-media-runtime-v1";
const MEDIA_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const MEDIA_MAX_ENTRIES = 200;

function isMediaRequest(url) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const path = url.pathname.toLowerCase();
  return (
    path.includes("/ipfs/") ||
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
