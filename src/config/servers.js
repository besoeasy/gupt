export const DEFAULT_RELAYS = Object.freeze(["https://rabta.t3nk.com", "https://1.rabta.space"]);

const USER_RELAYS_STORAGE_KEY = "gupt_configured_relays";

export const DEFAULT_ICE_SERVERS = Object.freeze([
  Object.freeze({
    urls: Object.freeze([
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun.twt.it:3478",
      "stun:stun.sip.us:3478",
      "stun:stun.cloudflare.com:3478",
      "stun:stun.nextcloud.com:443",
      "stun:stun.ekiga.net:3478",
      "stun:stun.antisip.com:3478",
      "stun:stun.freeswitch.org:3478",
      "stun:stun.voip.blackberry.com:3478",
    ]),
  }),
]);

export function readConfiguredIceServers() {
  return [...DEFAULT_ICE_SERVERS];
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function readStoredList(storageKey, defaultFallback, normalizeValue) {
  if (typeof localStorage === "undefined") return [...defaultFallback];

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [...defaultFallback];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return [...defaultFallback];
    const normalized = dedupe(parsed.map(normalizeValue).filter(Boolean));
    return normalized.length ? normalized : [...defaultFallback];
  } catch {
    return [...defaultFallback];
  }
}

function writeStoredList(storageKey, values, normalizeValue) {
  const normalized = dedupe(
    (Array.isArray(values) ? values : []).map(normalizeValue).filter(Boolean),
  );
  if (typeof localStorage === "undefined") return normalized;

  try {
    if (normalized.length) {
      localStorage.setItem(storageKey, JSON.stringify(normalized));
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch {}

  return normalized;
}

export function normalizeRelayUrl(relay) {
  if (typeof relay !== "string") return null;
  const trimmed = relay.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

export function readConfiguredRelays() {
  const relays = readStoredList(USER_RELAYS_STORAGE_KEY, DEFAULT_RELAYS, normalizeRelayUrl);
  return relays.length ? relays : [...DEFAULT_RELAYS];
}

export function saveConfiguredRelays(relays) {
  return writeStoredList(USER_RELAYS_STORAGE_KEY, relays, normalizeRelayUrl);
}
