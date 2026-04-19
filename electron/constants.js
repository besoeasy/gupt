import path from "node:path";
import { app } from "electron";

export const APP_NAME = "GUPT";
export const APP_ID = "com.besoeasy.gupt";

export const isDev = !app.isPackaged;
export const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "";

const APP_PATH = app.getAppPath();

export const ELECTRON_DIR = path.join(APP_PATH, "electron");
export const PRELOAD_PATH = path.join(ELECTRON_DIR, "preload.cjs");
export const RENDERER_INDEX = path.join(APP_PATH, "dist/index.html");

export const ICON_PATH = isDev
  ? path.join(APP_PATH, "build/icon.png")
  : path.join(process.resourcesPath, "icon.png");
