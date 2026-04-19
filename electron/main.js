import { BrowserWindow, app, ipcMain } from "electron";
import { APP_ID, APP_NAME } from "./constants.js";
import { createMainWindow } from "./window.js";
import { createTray } from "./tray.js";
import { setupAutoUpdate } from "./updater.js";
import { getAutostart, setAutostart } from "./autostart.js";

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);

const startHidden = process.argv.includes("--hidden");
let mainWindow = null;
let tray = null;
let isQuitting = false;

function ensureWindow() {
  if (mainWindow) return mainWindow;
  mainWindow = createMainWindow({ onClose: () => isQuitting });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  return mainWindow;
}

function showMainWindow() {
  const win = ensureWindow();
  if (!win.isVisible()) win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
}

function toggleMainWindow() {
  if (!mainWindow) return showMainWindow();
  if (mainWindow.isVisible()) mainWindow.hide();
  else showMainWindow();
}

function quit() {
  isQuitting = true;
  app.quit();
}

function registerIpc() {
  ipcMain.handle("gupt:window:show", () => showMainWindow());
  ipcMain.handle("gupt:autostart:get", () => getAutostart());
  ipcMain.handle("gupt:autostart:set", (_event, enabled) => setAutostart(!!enabled));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);

  app.whenReady().then(() => {
    registerIpc();
    if (startHidden) ensureWindow();
    else showMainWindow();
    tray = createTray({ onOpen: showMainWindow, onQuit: quit, onToggle: toggleMainWindow });
    setupAutoUpdate();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) showMainWindow();
      else mainWindow?.show();
    });
  });

  app.on("before-quit", () => {
    isQuitting = true;
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && isQuitting) app.quit();
  });
}
