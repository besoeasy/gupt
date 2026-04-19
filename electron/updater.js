import { existsSync } from "node:fs";
import path from "node:path";
import { Notification, app } from "electron";
import electronUpdater from "electron-updater";
import { APP_NAME, isDev } from "./constants.js";

const { autoUpdater } = electronUpdater;

function hasUpdateFeed() {
  const candidates = [
    path.join(process.resourcesPath || "", "app-update.yml"),
    path.join(app.getAppPath(), "app-update.yml"),
  ];
  return candidates.some((p) => p && existsSync(p));
}

export function setupAutoUpdate() {
  if (isDev) return;
  if (!hasUpdateFeed()) {
    console.info("[gupt-updater] no update feed configured — skipping");
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (err) => {
    console.warn("[gupt-updater]", err?.message || err);
  });

  autoUpdater.on("update-downloaded", () => {
    if (Notification.isSupported()) {
      new Notification({
        title: APP_NAME,
        body: "An update is ready — it will install on quit.",
      }).show();
    }
  });

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }, 10_000);
}
