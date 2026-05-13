const target = typeof __BUILD_TARGET__ === "string" ? __BUILD_TARGET__ : "web";

export const runtime = Object.freeze({
  target,
  isWeb: target === "web",
  isFlatpak: target === "flatpak",
  hasUpdater: false,
  supportsAutostart: false,
});