import { createApp } from "vue";
import { createPinia } from "pinia";

import "./index.css";
import App from "./App.vue";
import router from "./router";
import { initRelays } from "./lib/api.js";
import { purgeExpiredCache, startCacheMaintenance } from "./lib/idb.js";
import { setupCacheBroadcast } from "./stores/messenger.js";
import { resetPersistedStateForPwaUpdate } from "./lib/appReset.js";
import { logStartup } from "./lib/startupMetrics.js";
import { registerSW } from "virtual:pwa-register";
import { useTheme } from "./lib/theme.js";
import { runtime } from "./lib/runtime.js";

let pwaResetInFlight = false;

async function handlePwaUpdate() {
  if (pwaResetInFlight) return;
  pwaResetInFlight = true;
  await resetPersistedStateForPwaUpdate();
  window.location.reload();
}

if (runtime.isWeb) {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
        return;
      }

      // Reload only when the new SW has fully activated and taken control.
      // controllerchange is the correct signal — it fires after activation,
      // not during the intermediate "installed" state where the old SW may
      // still be serving the page (e.g. when other tabs are open).
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        void handlePwaUpdate();
      });
    },
  });
}

logStartup("boot:start", { path: window.location.pathname });

// Apply saved theme before first paint to avoid flash
useTheme();
logStartup("theme:ready");

startCacheMaintenance();
setupCacheBroadcast();
logStartup("cache-maintenance:started");
const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount("#app");
logStartup("vue:mounted");

logStartup("cache-purge:start");
void purgeExpiredCache()
  .then(() => {
    logStartup("cache-purge:done");
  })
  .catch((error) => {
    console.warn("[gupt-cache] startup purge failed", error);
  });

logStartup("relays:init:start");
void initRelays()
  .then(() => {
    logStartup("relays:init:done");
  })
  .catch((error) => {
    console.warn("[gupt-relays] initial relay bootstrap failed", error);
  });
