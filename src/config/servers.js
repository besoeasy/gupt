export const DEFAULT_RELAYS = Object.freeze([
  "wss://relay.snort.social",
  "wss://nostr.overpay.com",
  "wss://relay.wisp.talk",
  "wss://relay.peer.ooo",
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
]);

export const DEFAULT_ORIGINLESS_SERVERS = Object.freeze(["https://originless.gupt.app"]);
export const DEFAULT_BLOSSOM_SERVERS = Object.freeze(["https://blossom.primal.net", "https://24242.io"]);
export const DEFAULT_IPFS_GATEWAYS = Object.freeze(["https://ipfs.io/ipfs", "https://dweb.link/ipfs"]);

const USER_ORIGINLESS_STORAGE_KEY = "gupt-user-originless-servers";
const USER_BLOSSOM_STORAGE_KEY = "gupt-user-blossom-servers";

export const DEFAULT_ICE_SERVERS = Object.freeze([
  Object.freeze({
    urls: Object.freeze([
      // Google — most reliable globally
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",

      // 0xchat — India-friendly
      "stun:rtc1.0xchat.com:3478",
      "stun:rtc3.0xchat.com:3478",

      // Additional public STUN servers
      "stun:stun.services.mozilla.com:3478",
      "stun:stun.ideasip.com:3478",
      "stun:stun.sipgate.net:3478",
      "stun:stun.ekiga.net:3478",
    ]),
  }),
]);

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
  } catch {
    // Ignore storage failures and continue with the in-memory value.
  }

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

export function readUserBlossomServers() {
  return readStoredList(USER_BLOSSOM_STORAGE_KEY, normalizeOriginlessServerUrl);
}

export function saveUserBlossomServers(servers) {
  return writeStoredList(USER_BLOSSOM_STORAGE_KEY, servers, normalizeOriginlessServerUrl);
}

export function readConfiguredRelays() {
  return [...DEFAULT_RELAYS];
}

export function readConfiguredOriginlessServers(env = import.meta.env) {
  const userServers = readUserOriginlessServers();
  const envServers = splitCsv(env.VITE_UPLOAD_URL).map(normalizeOriginlessServerUrl).filter(Boolean);
  return dedupe([...userServers, ...envServers, ...DEFAULT_ORIGINLESS_SERVERS]);
}

export function readConfiguredBlossomServers(env = import.meta.env) {
  const userServers = readUserBlossomServers();
  const envServers = splitCsv(env.VITE_BLOSSOM_SERVERS || env.VITE_BLOSSOM_SERVER)
    .map(normalizeOriginlessServerUrl)
    .filter(Boolean);
  return dedupe([...userServers, ...envServers, ...DEFAULT_BLOSSOM_SERVERS]);
}

export function readConfiguredUploadUrl(env = import.meta.env) {
  return buildOriginlessUploadUrl(readConfiguredOriginlessServers(env)[0]) || `${DEFAULT_ORIGINLESS_SERVERS[0]}/upload`;
}

export function readConfiguredIpfsGateways(env = import.meta.env) {
  const envGateways = splitCsv(env.VITE_IPFS_GATEWAY).map(normalizeHttpUrl).filter(Boolean);
  return dedupe([...envGateways, ...DEFAULT_IPFS_GATEWAYS]);
}

export const SERVER_DEFAULTS = Object.freeze({
  relays: DEFAULT_RELAYS,
  blossomServers: DEFAULT_BLOSSOM_SERVERS,
  originlessServers: DEFAULT_ORIGINLESS_SERVERS,
  ipfsGateways: DEFAULT_IPFS_GATEWAYS,
});
