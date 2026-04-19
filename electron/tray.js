import { Menu, Tray, nativeImage } from "electron";
import { APP_NAME, ICON_PATH } from "./constants.js";

export function createTray({ onOpen, onQuit, onToggle }) {
  const icon = nativeImage.createFromPath(ICON_PATH);
  if (icon.isEmpty()) return null;

  const tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Open ${APP_NAME}`, click: onOpen },
      { type: "separator" },
      { label: "Quit", click: onQuit },
    ]),
  );
  tray.on("click", onToggle);
  return tray;
}
