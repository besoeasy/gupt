import { createApp } from "vue";
import { createPinia } from "pinia";

import "./index.css";
import App from "./App.vue";
import router from "./router";
import { initRelays } from "./lib/api.js";
import { purgeExpiredCache, startCacheMaintenance } from "./lib/idb.js";
import { resetPersistedStateForPwaUpdate } from "./lib/appReset.js";
import { logStartup } from "./lib/startupMetrics.js";
import { useTheme } from "./lib/theme.js";
import { registerSW } from "virtual:pwa-register";

let pwaResetInFlight = false;

async function handlePwaUpdate() {
  if (pwaResetInFlight) return;
  pwaResetInFlight = true;
  await resetPersistedStateForPwaUpdate();
  window.location.reload();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    void handlePwaUpdate();
  });

  registerSW({
    onNeedRefresh() {
      if (navigator.serviceWorker.controller) {
        void handlePwaUpdate();
      }
    },
    onOfflineReady() {},
  });
}

logStartup("boot:start", { path: window.location.pathname });

// Apply saved theme before first paint to avoid flash
useTheme();
logStartup("theme:ready");

startCacheMaintenance();
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
  .then((primaryRelay) => {
    logStartup("relays:init:done", { primaryRelay: primaryRelay || "" });
  })
  .catch((error) => {
    console.warn("[gupt-relays] initial relay bootstrap failed", error);
  });
