import { existsSync } from "node:fs";
import path from "node:path";
import { BrowserWindow, Notification, app } from "electron";
import { APP_NAME, isDev } from "./constants.js";

function hasUpdateFeed() {
  const candidates = [
    path.join(process.resourcesPath || "", "app-update.yml"),
    path.join(app.getAppPath(), "app-update.yml"),
  ];
  return candidates.some((p) => p && existsSync(p));
}

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

export async function setupAutoUpdate() {
  if (isDev) return;
  if (process.env.FLATPAK_ID) {
    console.info("[gupt-updater] running inside Flatpak — OS handles updates");
    return;
  }
  if (!hasUpdateFeed()) {
    console.info("[gupt-updater] no update feed configured — skipping");
    return;
  }

  const { default: electronUpdater } = await import("electron-updater");
  const { autoUpdater } = electronUpdater;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (err) => {
    console.warn("[gupt-updater]", err?.message || err);
  });

  autoUpdater.on("update-available", (info) => {
    broadcast("gupt:update-available", { version: info.version });
  });

  autoUpdater.on("update-downloaded", (info) => {
    broadcast("gupt:update-downloaded", { version: info.version });
    if (Notification.isSupported()) {
      new Notification({
        title: APP_NAME,
        body: `v${info.version} is ready — click "Restart & Update" in the app to install.`,
      }).show();
    }
  });

  const check = () => autoUpdater.checkForUpdates().catch((err) => {
    console.warn("[gupt-updater] check failed:", err?.message || err);
  });

  // Initial check after 10 s, then every hour.
  setTimeout(check, 10_000);
  setInterval(check, 60 * 60 * 1_000);
}

export function quitAndInstallUpdate() {
  autoUpdater.quitAndInstall();
}
