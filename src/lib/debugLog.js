const FLAG_KEY = "gupt_debug";
let enabled = null;
const LOG_PREFIX = "[gupt:beep]";

function isEnabled() {
  if (typeof localStorage === "undefined") return false;
  if (enabled === null) {
    try {
      enabled = ["1", "true", "beep"].includes(String(localStorage.getItem(FLAG_KEY) || ""));
    } catch {
      enabled = false;
    }
  }
  return enabled;
}

/**
 * Message-sound / realtime-delivery debugger. Enable with:
 *   localStorage.setItem("gupt_debug", "1")
 * then reload. Disable with localStorage.removeItem("gupt_debug").
 */
export function debugLog(...args) {
  if (!isEnabled()) return;
  console.debug(LOG_PREFIX, ...args);
}
