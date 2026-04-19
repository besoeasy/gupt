const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gupt", {
  isElectron: true,
  isFlatpak: !!process.env.FLATPAK_ID,
  platform: process.platform,
  focusWindow: () => ipcRenderer.invoke("gupt:window:show"),
  autostart: {
    get: () => ipcRenderer.invoke("gupt:autostart:get"),
    set: (enabled) => ipcRenderer.invoke("gupt:autostart:set", !!enabled),
  },
});
