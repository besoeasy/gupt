export const DEFAULT_RELAYS = Object.freeze([
  "wss://relay.damus.io",
  "wss://nostr.oxtr.dev",
  "wss://nostr-02.yakihonne.com",
  "wss://purplerelay.com",
  "wss://nostr.xmr.rocks",
  "wss://nostr.lopp.social",
  "wss://relay.illuminodes.com",
  "wss://relay.seq1.net",
  "wss://chadf.nostr1.com",
]);

export const DEFAULT_ORIGINLESS_SERVERS = Object.freeze(["https://originless.gupt.app"]);

const USER_RELAYS_STORAGE_KEY = "gupt_configured_relays";
const USER_ORIGINLESS_STORAGE_KEY = "gupt_configured_originless_servers";

export const DEFAULT_ICE_SERVERS = Object.freeze([
  Object.freeze({
    urls: Object.freeze([
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun.twt.it:3478",
      "stun:stun.sip.us:3478",
    ]),
  }),
]);

export function readConfiguredIceServers(env = import.meta.env) {
  const turnUrls = splitCsv(env?.VITE_TURN_URL);
  if (!turnUrls.length) return [...DEFAULT_ICE_SERVERS];

  const turnServer = { urls: turnUrls };
  if (typeof env?.VITE_TURN_USERNAME === "string" && env.VITE_TURN_USERNAME.trim()) {
    turnServer.username = env.VITE_TURN_USERNAME.trim();
  }
  if (typeof env?.VITE_TURN_CREDENTIAL === "string" && env.VITE_TURN_CREDENTIAL) {
    turnServer.credential = env.VITE_TURN_CREDENTIAL;
  }
  return [...DEFAULT_ICE_SERVERS, Object.freeze(turnServer)];
}

function splitCsv(value) {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
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
    return dedupe(parsed.map(normalizeValue).filter(Boolean));
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
  if (!/^wss?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

export function normalizeHttpUrl(url) {
  if (typeof url !== "string") return null;
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

export function normalizeOriginlessServerUrl(url) {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) return null;
  return normalized.replace(/\/upload$/i, "");
}

export function buildOriginlessUploadUrl(serverUrl) {
  const normalized = normalizeOriginlessServerUrl(serverUrl);
  if (!normalized) return null;
  return `${normalized}/upload`;
}

export function readConfiguredRelays() {
  return readStoredList(USER_RELAYS_STORAGE_KEY, DEFAULT_RELAYS, normalizeRelayUrl);
}

export function saveConfiguredRelays(relays) {
  return writeStoredList(USER_RELAYS_STORAGE_KEY, relays, normalizeRelayUrl);
}

export function readConfiguredOriginlessServers(env = import.meta.env) {
  const envServers = splitCsv(env?.VITE_UPLOAD_URL)
    .map(normalizeOriginlessServerUrl)
    .filter(Boolean);
  const fallback = dedupe([...envServers, ...DEFAULT_ORIGINLESS_SERVERS]);
  return readStoredList(USER_ORIGINLESS_STORAGE_KEY, fallback, normalizeOriginlessServerUrl);
}

export function saveConfiguredOriginlessServers(servers) {
  return writeStoredList(USER_ORIGINLESS_STORAGE_KEY, servers, normalizeOriginlessServerUrl);
}

export function readConfiguredUploadUrl(env = import.meta.env) {
  const servers = readConfiguredOriginlessServers(env);
  return buildOriginlessUploadUrl(servers[0]) || `${DEFAULT_ORIGINLESS_SERVERS[0]}/upload`;
}

export const SERVER_DEFAULTS = Object.freeze({
  relays: DEFAULT_RELAYS,
  originlessServers: DEFAULT_ORIGINLESS_SERVERS,
});
