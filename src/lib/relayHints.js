// Public relay hints: one signed event per (author, relay) in
// `gupt/relay/hints`. A hint is only ever a suggestion — nothing here touches
// the configured relay list. The URL is the identity of the hint, so the whole
// pipeline is normalize → verify → collapse → rank.
import { collectBotBeacons } from "./bots.js";
import { deleteRelayHints, listRelayHints, listRoomMeta, putRelayHints } from "./idb.js";
import { queryEvents, verifyEvent } from "./rabta/index.js";
import { getKnownRelays } from "./relay/selection.js";
import { probeRabtaNode } from "./relay/verify.js";

export const RELAY_HINTS_COLLECTION = "gupt/relay/hints";
export const RELAY_HINT_TTL_SECONDS = 90 * 24 * 60 * 60;
export const RELAY_HINT_TTL_MS = RELAY_HINT_TTL_SECONDS * 1000;
/** How long one fetch + verification pass is reused before refetching. */
export const RELAY_HINT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const RELAY_HINT_PAGE_LIMIT = 100;
export const RELAY_HINT_MAX_PAGES = 5;
export const RELAY_HINT_MAX_NOTE = 140;
export const RELAY_HINT_MAX_SUGGESTIONS = 10;
export const RELAY_HINT_VERIFY_CONCURRENCY = 4;
export const RELAY_HINT_IGNORED_KEY = "gupt:relay-hint-ignored:v1";

const PUBKEY_RE = /^[0-9a-f]{64}$/;
const NODE_ID_RE = /^[0-9a-f]{64}$/;
const RESERVED_TLDS = new Set(["local", "localhost", "internal", "lan", "home", "test", "invalid"]);
const RESERVED_DOMAINS = new Set(["example", "example.com", "example.net", "example.org"]);

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizePubkey(value) {
  const hex = String(value ?? "")
    .replace(/^ed25519:/i, "")
    .trim()
    .toLowerCase();
  return PUBKEY_RE.test(hex) ? hex : "";
}

/**
 * Hints carry one relay origin. Anything that a relay operator could use to
 * fingerprint a path, or that points back inside the local network, is dropped
 * rather than repaired.
 */
export function normalizeHintUrl(value) {
  const raw = cleanText(value, 300);
  if (!raw) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return "";
  }

  if (url.protocol !== "https:") return "";
  if (url.username || url.password) return "";
  if (url.search || url.hash) return "";
  if (url.pathname !== "/" && url.pathname !== "") return "";

  const host = url.hostname.toLowerCase();
  if (!host || host.startsWith("[") || /^[0-9.]+$/.test(host)) return "";
  // Single-label names only resolve inside a LAN.
  if (!host.includes(".")) return "";
  if (RESERVED_DOMAINS.has(host)) return "";
  const tld = host.split(".").pop();
  if (RESERVED_TLDS.has(tld)) return "";

  return `https://${host}${url.port && url.port !== "443" ? `:${url.port}` : ""}`;
}

/** Hostname (with port) as shown in the UI. */
export function relayHintLabel(url) {
  const normalized = normalizeHintUrl(url);
  if (!normalized) return "";
  return normalized.replace(/^https:\/\//i, "");
}

/** Validate one relay event into a hint row; anything malformed returns null. */
export function parseRelayHint(event) {
  if (!event || event.collection !== RELAY_HINTS_COLLECTION) return null;
  if (!verifyEvent(event)) return null;

  const data = event.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.v !== undefined && Number(data.v) !== 1) return null;

  const url = normalizeHintUrl(data.url);
  if (!url) return null;

  const pubkey = normalizePubkey(event.owner);
  if (!pubkey) return null;

  const createdAt = Math.floor(Number(event.created_at) || 0) * 1000;
  const expiresAt = Math.floor(Number(event.expires_at) || 0) * 1000;
  if (!createdAt || !expiresAt || expiresAt <= createdAt) return null;

  const nodeId = String(data.node_id ?? "")
    .trim()
    .toLowerCase();

  return {
    url,
    pubkey,
    note: cleanText(data.note, RELAY_HINT_MAX_NOTE),
    nodeId: NODE_ID_RE.test(nodeId) ? nodeId : "",
    createdAt,
    expiresAt,
    eventId: String(event.id || ""),
  };
}

/**
 * One hint per (author, relay): the newest signed event wins. Then aggregate per
 * relay URL so a suggestion knows how many distinct people vouch for it and how
 * many of them are already in the user's chats.
 */
export function collapseRelayHints(events, { now = Date.now(), contactPubkeys = new Set() } = {}) {
  const contacts = contactPubkeys instanceof Set ? contactPubkeys : new Set(contactPubkeys || []);
  const newest = new Map();

  for (const event of events || []) {
    const hint = parseRelayHint(event);
    if (!hint) continue;
    if (hint.expiresAt <= now) continue;

    const key = `${hint.url}\n${hint.pubkey}`;
    const prev = newest.get(key);
    if (
      !prev ||
      hint.createdAt > prev.createdAt ||
      (hint.createdAt === prev.createdAt && hint.eventId > prev.eventId)
    ) {
      newest.set(key, hint);
    }
  }

  const byUrl = new Map();
  for (const hint of newest.values()) {
    let row = byUrl.get(hint.url);
    if (!row) {
      row = {
        url: hint.url,
        label: relayHintLabel(hint.url),
        authors: [],
        contactAuthors: [],
        nodeIds: [],
        note: "",
        noteAt: 0,
        lastSeenAt: 0,
        expiresAt: 0,
      };
      byUrl.set(hint.url, row);
    }

    if (!row.authors.includes(hint.pubkey)) row.authors.push(hint.pubkey);
    if (contacts.has(hint.pubkey) && !row.contactAuthors.includes(hint.pubkey)) {
      row.contactAuthors.push(hint.pubkey);
    }
    if (hint.nodeId && !row.nodeIds.includes(hint.nodeId)) row.nodeIds.push(hint.nodeId);
    if (hint.note && hint.createdAt >= row.noteAt) {
      row.note = hint.note;
      row.noteAt = hint.createdAt;
    }
    row.lastSeenAt = Math.max(row.lastSeenAt, hint.createdAt);
    row.expiresAt = Math.max(row.expiresAt, hint.expiresAt);
  }

  return [...byUrl.values()].map((row) => {
    const { noteAt, ...rest } = row;
    return {
      ...rest,
      authorCount: rest.authors.length,
      contactCount: rest.contactAuthors.length,
      nodeId: rest.nodeIds.length === 1 ? rest.nodeIds[0] : "",
    };
  });
}

/** Contact vouch beats raw author count; latency only breaks ties. */
export function rankRelayHints(rows) {
  return [...(rows || [])].sort((a, b) => {
    const contacts = (b.contactCount || 0) - (a.contactCount || 0);
    if (contacts) return contacts;
    const authors = (b.authorCount || 0) - (a.authorCount || 0);
    if (authors) return authors;
    const latency = (a.latencyMs || Infinity) - (b.latencyMs || Infinity);
    if (Number.isFinite(latency) && latency !== 0) return latency;
    const seen = (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
    return seen || String(a.url).localeCompare(String(b.url));
  });
}

/**
 * Pure: decide which verified hints are worth showing. Configured, ignored,
 * unreachable, read-only and node-id-mismatched relays are excluded; two hints
 * that resolve to the same node collapse to the better-ranked one.
 */
export function selectRelaySuggestions(
  rows,
  { knownRelays = [], ignoredUrls = [], limit = RELAY_HINT_MAX_SUGGESTIONS } = {},
) {
  const known = new Set(knownRelays);
  const ignored = new Set(ignoredUrls);

  const candidates = (rows || []).filter((row) => {
    if (!row?.url || known.has(row.url) || ignored.has(row.url)) return false;
    if (!row.reachable || !row.nodeId) return false;
    if (row.mode === "read_only") return false;
    if (row.nodeMismatch) return false;
    return true;
  });

  const byNode = new Map();
  for (const row of rankRelayHints(candidates)) {
    if (!byNode.has(row.nodeId)) byNode.set(row.nodeId, row);
  }

  return [...byNode.values()].slice(0, Math.max(0, limit));
}

function readStoredIgnored() {
  try {
    if (typeof localStorage === "undefined") return [];
    const parsed = JSON.parse(localStorage.getItem(RELAY_HINT_IGNORED_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeHintUrl).filter(Boolean);
  } catch {
    return [];
  }
}

export function readIgnoredHintUrls() {
  return readStoredIgnored();
}

/** Hide a suggestion locally; ignored relays survive a cache wipe. */
export function ignoreRelayHint(url) {
  const normalized = normalizeHintUrl(url);
  if (!normalized) return [];
  const next = [...new Set([...readStoredIgnored(), normalized])];
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(RELAY_HINT_IGNORED_KEY, JSON.stringify(next));
    }
  } catch {}
  return next;
}

export function restoreIgnoredRelayHint(url) {
  const normalized = normalizeHintUrl(url);
  if (!normalized) return readStoredIgnored();
  const next = readStoredIgnored().filter((entry) => entry !== normalized);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(RELAY_HINT_IGNORED_KEY, JSON.stringify(next));
    }
  } catch {}
  return next;
}

async function listContactPubkeys() {
  try {
    const rows = await listRoomMeta();
    return new Set(rows.map((row) => normalizePubkey(row?.peerPubkey)).filter(Boolean));
  } catch {
    return new Set();
  }
}

/**
 * Fetch hints from the configured relays directly (they never pass through the
 * engine) and aggregate them. Returns [] when no relay answers.
 */
export async function fetchRelayHints({ now = Date.now(), timeout = 5000 } = {}) {
  const relays = getKnownRelays();
  if (!relays.length) return [];

  const since = Math.floor((now - RELAY_HINT_TTL_MS) / 1000);
  const events = await collectBotBeacons(
    ({ limit, cursor }) =>
      queryEvents({ collection: RELAY_HINTS_COLLECTION, limit, cursor, since }, relays, timeout),
    { limit: RELAY_HINT_PAGE_LIMIT, maxPages: RELAY_HINT_MAX_PAGES },
  );
  const contactPubkeys = await listContactPubkeys();
  return collapseRelayHints(events, { now, contactPubkeys });
}

/** Keep a recent verification instead of probing the same URL every load. */
function mergeVerification(freshRows, cachedRows, { now, cacheTtlMs }) {
  const cached = new Map((cachedRows || []).map((row) => [row.url, row]));
  return (freshRows || []).map((row) => {
    const prev = cached.get(row.url);
    if (!prev || !(now - Number(prev.verifiedAt || 0) < cacheTtlMs) || !prev.reachable) {
      return { ...row, verifiedAt: 0, reachable: false, nodeMismatch: false };
    }
    return {
      ...row,
      reachable: true,
      nodeId: prev.nodeId || row.nodeId || "",
      latencyMs: Number(prev.latencyMs) || 0,
      mode: prev.mode || null,
      verifiedAt: Number(prev.verifiedAt) || 0,
      verificationError: prev.verificationError || "",
      nodeMismatch: Boolean(prev.nodeMismatch),
    };
  });
}

async function verifyRows(rows, { now, timeoutMs }) {
  const pairs = rows.map((row) => ({ row, probe: null }));
  let cursor = 0;

  async function worker() {
    while (cursor < pairs.length) {
      const index = cursor++;
      const pair = pairs[index];
      if (pair.row.reachable && pair.row.verifiedAt) continue;
      pair.probe = await probeRabtaNode(pair.row.url, { timeoutMs });
    }
  }

  const workers = Array.from(
    { length: Math.min(RELAY_HINT_VERIFY_CONCURRENCY, pairs.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return pairs.map(({ row, probe }) => {
    if (!probe) return row;
    const hintedNodeId = row.nodeId || "";
    return {
      ...row,
      verifiedAt: now,
      reachable: Boolean(probe.ok),
      latencyMs: Number(probe.latencyMs) || 0,
      mode: probe.mode || null,
      verificationError: probe.ok ? "" : String(probe.error || "unreachable"),
      // The URL used to serve a different node than the hint names: someone
      // else's domain now, so treat it as poisoned.
      nodeMismatch: Boolean(hintedNodeId && probe.nodeId && hintedNodeId !== probe.nodeId),
      nodeId: probe.nodeId || hintedNodeId,
    };
  });
}

/**
 * Cached suggestions only, no network. Settings paints these immediately and
 * then asks for a fresh pass.
 */
export async function readCachedRelaySuggestions() {
  const cached = await listRelayHints().catch(() => []);
  return selectRelaySuggestions(cached, {
    knownRelays: getKnownRelays(),
    ignoredUrls: readIgnoredHintUrls(),
    limit: RELAY_HINT_MAX_SUGGESTIONS,
  });
}

/**
 * Cached suggestions if a recent pass exists and `force` is false; otherwise
 * fetch, verify and cache. A network failure still falls back to whatever is
 * cached, so Settings never empties on a bad connection.
 */
export async function loadRelaySuggestions({ force = false, now = Date.now() } = {}) {
  const knownRelays = getKnownRelays();
  const ignoredUrls = readIgnoredHintUrls();
  const cached = await listRelayHints().catch(() => []);
  const cachedAt = cached.reduce((max, row) => Math.max(max, Number(row.updatedAt) || 0), 0);
  const cacheFresh = cached.length > 0 && now - cachedAt < RELAY_HINT_CACHE_TTL_MS;

  if (cacheFresh && !force) {
    return selectRelaySuggestions(cached, {
      knownRelays,
      ignoredUrls,
      limit: RELAY_HINT_MAX_SUGGESTIONS,
    });
  }

  let rows = cached;
  try {
    const fetched = await fetchRelayHints({ now });
    rows = mergeVerification(fetched, cached, { now, cacheTtlMs: RELAY_HINT_CACHE_TTL_MS });
  } catch {
    return selectRelaySuggestions(cached, {
      knownRelays,
      ignoredUrls,
      limit: RELAY_HINT_MAX_SUGGESTIONS,
    });
  }

  const verified = await verifyRows(rows, { now, timeoutMs: 5000 });
  const stamps = verified.map((row) => ({
    ...row,
    updatedAt: now,
    expiresAt: Math.min(row.expiresAt || 0, now + RELAY_HINT_TTL_MS),
  }));

  if (stamps.length) await putRelayHints(stamps).catch(() => {});
  const liveUrls = new Set(stamps.map((row) => row.url));
  const staleUrls = cached.map((row) => row.url).filter((url) => !liveUrls.has(url));
  if (staleUrls.length) await deleteRelayHints(staleUrls).catch(() => {});

  return selectRelaySuggestions(stamps, {
    knownRelays,
    ignoredUrls,
    limit: RELAY_HINT_MAX_SUGGESTIONS,
  });
}
