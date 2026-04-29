import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

// Injected by VitePWA at build time
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Notification click ──────────────────────────────────────────────────────
// Required so tapping a notification on Android/mobile focuses (or opens) the app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // If a window is already open, focus it
        for (const client of windowClients) {
          if ("focus" in client) return client.focus();
        }
        // Otherwise open a new window
        if (clients.openWindow) return clients.openWindow("/");
      }),
  );
});
