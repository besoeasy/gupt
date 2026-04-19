import { BrowserWindow, nativeImage, shell } from "electron";
import {
  APP_NAME,
  DEV_SERVER_URL,
  ICON_PATH,
  PRELOAD_PATH,
  RENDERER_INDEX,
  isDev,
} from "./constants.js";

function loadIcon() {
  const img = nativeImage.createFromPath(ICON_PATH);
  return img.isEmpty() ? undefined : img;
}

export function createMainWindow({ onClose } = {}) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: "#09090b",
    title: APP_NAME,
    icon: loadIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  if (isDev && DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(RENDERER_INDEX);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("close", (event) => {
    if (onClose?.(event) === false) {
      event.preventDefault();
      win.hide();
    }
  });

  return win;
}
