export const DEFAULT_RELAYS = Object.freeze([
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://relay.primal.net",
  "wss://cfrelay.haorendashu.workers.dev",
  "wss://relay.emre.xyz",
  "wss://relay.cocu.la",
]);

export const DEFAULT_ORIGINLESS_SERVER = "https://originless.gupt.app";

// Originless stores content but does not serve it, so attachment links are
// resolved through a public IPFS gateway.
export const IPFS_GATEWAY = "https://inbrowser.link/ipfs/";

// Recursive gateways for @helia/verified-fetch fallback (base URLs only,
// no /ipfs/ suffix). Content stays hash-verified against the CID.
export const DEFAULT_IPFS_GATEWAYS = Object.freeze([
  "https://gateway.pinata.cloud",
  "https://dweb.link",
  "https://ipfs.io",
  "https://trustless-gateway.link",
]);

const USER_RELAYS_STORAGE_KEY = "gupt_configured_relays";
const USER_ORIGINLESS_SERVERS_STORAGE_KEY = "gupt_configured_originless_servers";
const USER_ORIGINLESS_SERVER_STORAGE_KEY = "gupt_configured_originless_server";
const USER_IPFS_GATEWAYS_STORAGE_KEY = "gupt_configured_ipfs_gateways";

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
  return normalized.replace(/\/(events|blob|up|upf|ipfs|down)$/i, "");
}

export function normalizeIpfsGatewayUrl(url) {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) return null;
  return normalized.replace(/\/ipfs(\/.*)?$/i, "") || null;
}

export function buildOriginlessUploadUrl(serverUrl) {
  const normalized = normalizeOriginlessServerUrl(serverUrl);
  if (!normalized) return null;
  return `${normalized}/up`;
}

export function buildOriginlessDownloadUrl(cid) {
  if (typeof cid !== "string" || !cid.trim()) return null;
  return `${IPFS_GATEWAY}${encodeURIComponent(cid.trim())}`;
}

export function readConfiguredRelays() {
  return readStoredList(USER_RELAYS_STORAGE_KEY, DEFAULT_RELAYS, normalizeRelayUrl);
}

export function saveConfiguredRelays(relays) {
  return writeStoredList(USER_RELAYS_STORAGE_KEY, relays, normalizeRelayUrl);
}

export function readConfiguredOriginlessServer(env = import.meta.env) {
  const envServers = splitCsv(env?.VITE_UPLOAD_URL)
    .map(normalizeOriginlessServerUrl)
    .filter(Boolean);
  if (envServers.length) return envServers[0];

  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(USER_ORIGINLESS_SERVER_STORAGE_KEY);
      const single = normalizeOriginlessServerUrl(JSON.parse(raw));
      if (single) return single;
    } catch {}
    try {
      const legacy = JSON.parse(localStorage.getItem(USER_ORIGINLESS_SERVERS_STORAGE_KEY));
      if (Array.isArray(legacy)) {
        const migrated = legacy.map(normalizeOriginlessServerUrl).filter(Boolean);
        if (migrated.length) return migrated[0];
      }
    } catch {}
  }

  return DEFAULT_ORIGINLESS_SERVER;
}

export function saveConfiguredOriginlessServer(server) {
  const normalized = normalizeOriginlessServerUrl(server);
  if (typeof localStorage !== "undefined") {
    try {
      if (normalized) {
        localStorage.setItem(USER_ORIGINLESS_SERVER_STORAGE_KEY, JSON.stringify(normalized));
      } else {
        localStorage.removeItem(USER_ORIGINLESS_SERVER_STORAGE_KEY);
      }
    } catch {}
  }
  return normalized || DEFAULT_ORIGINLESS_SERVER;
}

export function readConfiguredIpfsGateways() {
  return readStoredList(
    USER_IPFS_GATEWAYS_STORAGE_KEY,
    DEFAULT_IPFS_GATEWAYS,
    normalizeIpfsGatewayUrl,
  );
}

export function saveConfiguredIpfsGateways(gateways) {
  return writeStoredList(USER_IPFS_GATEWAYS_STORAGE_KEY, gateways, normalizeIpfsGatewayUrl);
}
