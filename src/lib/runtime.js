const target = typeof __BUILD_TARGET__ === "string" ? __BUILD_TARGET__ : "web";

export const runtime = Object.freeze({
  target,
  isWeb: target === "web",
  isFlatpak: target === "flatpak",
  hasUpdater: false,
});

export const PUBLIC_APP_ORIGIN = "https://gupt.app";

function isLocalDevHost(hostname = "") {
  const host = String(hostname).toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".localhost")
  );
}

/** Base URL for user-facing share links — gupt.app when running on local dev. */
export function publicAppBaseUrl() {
  if (typeof window === "undefined") return PUBLIC_APP_ORIGIN;
  if (isLocalDevHost(window.location.hostname)) return PUBLIC_APP_ORIGIN;
  const base = `${window.location.origin}${window.location.pathname}`;
  return base.replace(/\/$/, "") || window.location.origin;
}
