import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import { APP_NAME } from "./constants.js";

const LINUX_DESKTOP_FILE = path.join(os.homedir(), ".config/autostart/gupt.desktop");

function linuxDesktopEntry() {
  const execPath = process.env.APPIMAGE || app.getPath("exe");
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${APP_NAME}`,
    `Exec="${execPath}" --hidden`,
    "Terminal=false",
    "Icon=gupt",
    "X-GNOME-Autostart-enabled=true",
    "Comment=Anonymous E2E encrypted chat over Nostr",
    "",
  ].join("\n");
}

export async function getAutostart() {
  if (process.platform === "linux") {
    try {
      await fs.access(LINUX_DESKTOP_FILE);
      return true;
    } catch {
      return false;
    }
  }
  return app.getLoginItemSettings().openAtLogin;
}

export async function setAutostart(enabled) {
  if (process.platform === "linux") {
    if (enabled) {
      await fs.mkdir(path.dirname(LINUX_DESKTOP_FILE), { recursive: true });
      await fs.writeFile(LINUX_DESKTOP_FILE, linuxDesktopEntry(), "utf8");
    } else {
      await fs.rm(LINUX_DESKTOP_FILE, { force: true });
    }
    return true;
  }
  app.setLoginItemSettings({ openAtLogin: !!enabled, openAsHidden: true });
  return true;
}
