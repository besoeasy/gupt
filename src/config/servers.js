export const DEFAULT_RELAYS = Object.freeze([
  "wss://relay.damus.io",
  "wss://nostr.oxtr.dev",
  "wss://nostr-02.yakihonne.com",
  "wss://purplerelay.com",
  "wss://relay.snort.social",
  "wss://purplepag.es",
  "wss://nos.lol",
  "wss://nostr.snowbla.de",
  "wss://relay.nuts.cash",
  "wss://nostr.xmr.rocks",
  "wss://nostr.lopp.social",
  "wss://relay.illuminodes.com",
  "wss://relay.seq1.net",
]);

export const DEFAULT_ORIGINLESS_SERVERS = Object.freeze(["https://originless.gupt.app"]);

const USER_ORIGINLESS_STORAGE_KEY = "gupt-user-originless-servers";

export const DEFAULT_ICE_SERVERS = Object.freeze([
  Object.freeze({
    urls: Object.freeze(["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.services.mozilla.com:3478", "stun:stun.ideasip.com:3478"]),
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

function readStoredList(storageKey, normalizeValue) {
  if (typeof localStorage === "undefined") return [];

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupe(parsed.map(normalizeValue).filter(Boolean));
  } catch {
    return [];
  }
}

function writeStoredList(storageKey, values, normalizeValue) {
  const normalized = dedupe((Array.isArray(values) ? values : []).map(normalizeValue).filter(Boolean));
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

export function readUserOriginlessServers() {
  return readStoredList(USER_ORIGINLESS_STORAGE_KEY, normalizeOriginlessServerUrl);
}

export function saveUserOriginlessServers(servers) {
  return writeStoredList(USER_ORIGINLESS_STORAGE_KEY, servers, normalizeOriginlessServerUrl);
}

export function readConfiguredRelays() {
  return [...DEFAULT_RELAYS];
}

export function readConfiguredOriginlessServers(env = import.meta.env) {
  const userServers = readUserOriginlessServers();
  const envServers = splitCsv(env.VITE_UPLOAD_URL).map(normalizeOriginlessServerUrl).filter(Boolean);
  return dedupe([...userServers, ...envServers, ...DEFAULT_ORIGINLESS_SERVERS]);
}

export function readConfiguredUploadUrl(env = import.meta.env) {
  return buildOriginlessUploadUrl(readConfiguredOriginlessServers(env)[0]) || `${DEFAULT_ORIGINLESS_SERVERS[0]}/upload`;
}

export const SERVER_DEFAULTS = Object.freeze({
  relays: DEFAULT_RELAYS,
  originlessServers: DEFAULT_ORIGINLESS_SERVERS,
});
