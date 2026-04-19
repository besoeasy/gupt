const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gupt", {
  isElectron: true,
  platform: process.platform,
  autostart: {
    get: () => ipcRenderer.invoke("gupt:autostart:get"),
    set: (enabled) => ipcRenderer.invoke("gupt:autostart:set", !!enabled),
  },
});
