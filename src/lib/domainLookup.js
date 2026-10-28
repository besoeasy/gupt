import { normalizeNostrPubkey } from "@/lib/crypto";

const RESOLVERS = [
  { name: "Cloudflare", url: "https://cloudflare-dns.com/dns-query" },
  { name: "Google", url: "https://dns.google/resolve" },
  { name: "Quad9", url: "https://dns.quad9.net:5053/dns-query" },
];

const DNS_CACHE_PREFIX = "gupt_domain_cache:";
const PIN_STORE_KEY = "gupt_domain_pins";
const LOOKUP_TIMEOUT_MS = 5000;
const MAX_TTL_MS = 10 * 60 * 1000;
const MIN_TTL_MS = 60 * 1000;

const HOSTNAME_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}?[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}?[a-z0-9])?)+$/i;

export function isDomainInput(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return false;
  if (/^npub1/i.test(trimmed)) return false;
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return false;
  if (/^(02|03)[0-9a-f]{64}$/i.test(trimmed)) return false;
  return trimmed.includes(".");
}

/**
 * Validate and normalize the domain a visitor typed. Throws a friendly
 * Error for malformed, unicode (non-Punycode), or otherwise invalid names.
 */
export function validateDomain(domain) {
  const trimmed = String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
  if (!trimmed) throw new Error("Enter a domain name.");
  if (/[^\x21-\x7e]/.test(trimmed)) {
    throw new Error("Enter the Punycode (xn--) form of unicode domains.");
  }
  if (trimmed.includes("..") || trimmed.length > 253 || !HOSTNAME_RE.test(trimmed)) {
    throw new Error("That doesn't look like a valid domain name.");
  }
  return trimmed;
}

/**
 * DoH JSON presents TXT values as `"chunk1" "chunk2" """` when the record is
 * split into 255-byte chunks. Join quoted chunks back into one string and
 * unescape RFC 1035 escapes used in the presentation format.
 */
export function joinTxtChunks(data) {
  const raw = String(data || "");
  const chunks = raw.match(/"(?:[^"\\]|\\.)*"/g);
  const unescape = (chunk) =>
    chunk
      .replace(/\\([0-9]{3})/g, (_, digits) => String.fromCharCode(parseInt(digits, 8)))
      .replace(/\\(.)/g, "$1");
  if (chunks && chunks.length) {
    return chunks.map((chunk) => unescape(chunk.slice(1, -1))).join("");
  }
  return unescape(raw.replace(/^"|"$/g, ""));
}

/**
 * TXT payload forms:
 * - bare key: 64-char hex, 02/03-prefixed compressed hex
 * - "v=gupt1 k=<hex>; r=<relay>" — optional relay hint, extensible via fields
 */
export function parseTxtPayload(raw) {
  const value = joinTxtChunks(raw).trim();
  const bare = normalizeNostrPubkey(value);
  if (bare) return { pubkey: bare, relay: "" };

  if (/^v\s*=/.test(value)) {
    const fields = {};
    // Handles both `v=gupt1;k=<hex>` and space-separated `v=gupt1 k=<hex>`.
    const fieldRe = /([a-z][a-z0-9_]{0,14})\s*=\s*([^\s;]+)/gi;
    let match;
    while ((match = fieldRe.exec(value)) !== null) {
      fields[match[1].toLowerCase()] = match[2];
    }
    const key = normalizeNostrPubkey(fields.k || "");
    if (String(fields.v || "").toLowerCase() === "gupt1" && key) {
      const relay = fields.r && /^wss?:\/\//i.test(fields.r) ? fields.r : "";
      return { pubkey: key, relay };
    }
  }
  return null;
}

// --- Pins: remember the first key seen per domain, warn when it changes ------

function readPins() {
  try {
    return JSON.parse(localStorage.getItem(PIN_STORE_KEY)) || {};
  } catch {
    return {};
  }
}

function writePins(pins) {
  try {
    localStorage.setItem(PIN_STORE_KEY, JSON.stringify(pins));
  } catch {
    // storage full — ignore
  }
}

export function getPin(domain) {
  return readPins()[String(domain || "").toLowerCase()] || null;
}

export function pinDomain(domain, pubkey) {
  const normalized = String(domain || "").toLowerCase();
  if (!normalized || !pubkey) return;
  const pins = readPins();
  const existing = pins[normalized];
  if (existing && existing.pubkey !== pubkey) {
    pins[normalized] = { ...existing, pubkey, lastSeenAt: Date.now(), changedAt: Date.now() };
  } else if (existing) {
    pins[normalized] = { ...existing, lastSeenAt: Date.now() };
  } else {
    pins[normalized] = { pubkey, firstAt: Date.now(), lastSeenAt: Date.now() };
  }
  writePins(pins);
}

export function clearPin(domain) {
  const pins = readPins();
  delete pins[String(domain || "").toLowerCase()];
  writePins(pins);
}

// --- Cache & lookup ----------------------------------------------------------

function readCache(domain) {
  try {
    const cached = JSON.parse(localStorage.getItem(DNS_CACHE_PREFIX + domain));
    if (cached?.pubkey && Number.isFinite(cached.ts)) return cached;
  } catch {
    // ignore corrupt cache
  }
  return null;
}

function writeCache(domain, entry) {
  try {
    localStorage.setItem(DNS_CACHE_PREFIX + domain, JSON.stringify(entry));
  } catch {
    // storage full — ignore
  }
}

async function lookupWithResolver(resolver, dnsName) {
  const url = `${resolver.url}?name=${encodeURIComponent(dnsName)}&type=TXT`;
  const res = await fetch(url, {
    headers: { Accept: "application/dns-json" },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = new Error(`${resolver.name} responded ${res.status}.`);
    err.transient = true;
    throw err;
  }

  const data = await res.json();
  if (data?.Status === 3) {
    return { missing: true, resolver: resolver.name };
  }

  const answers = (data?.Answer || []).filter((r) => r.type === 16);
  for (const answer of answers) {
    const parsed = parseTxtPayload(answer.data);
    if (parsed) {
      const ttlMs = Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, (Number(answer.TTL) || 300) * 1000));
      return {
        ...parsed,
        ttl: ttlMs,
        dnssec: data?.AD === true,
        resolver: resolver.name,
        ts: Date.now(),
      };
    }
  }

  return { parsed: null, resolver: resolver.name };
}

/**
 * Resolve gupt.<domain> TXT to a key. Resolution is cached for the record's
 * TTL, and if every resolver is unreachable an expired cache entry can still
 * be used (flagged `stale`) so the visitor can keep chatting.
 */
async function resolveDomain(domain, { force = false } = {}) {
  const normalized = validateDomain(domain);

  if (!force) {
    const cached = readCache(normalized);
    if (cached) {
      const fresh = Date.now() - cached.ts < cached.ttl;
      if (fresh) {
        return { ...cached, domain: normalized, cached: true, stale: false };
      }
      // Only a resolvable network outage reuses the expired entry.
      try {
        const freshLookup = await networkResolve(normalized, cached);
        return freshLookup;
      } catch {
        return { ...cached, domain: normalized, cached: true, stale: true };
      }
    }
  }

  return networkResolve(normalized, null);
}

async function networkResolve(normalized, previous) {
  let noRecordError = null;
  let invalidError = null;

  for (const resolver of RESOLVERS) {
    let result;
    try {
      result = await lookupWithResolver(resolver, `gupt.${normalized}`);
    } catch (e) {
      if (e?.name === "TimeoutError") continue;
      if (e?.transient) continue;
      throw e;
    }

    if (result?.missing && previous?.pubkey) {
      // Record removed while the visitor is offline from resolvers; fall back.
      return { ...previous, domain: normalized, cached: true, stale: !checkFresh(previous) };
    }
    if (result?.missing) {
      noRecordError = new Error(
        `No gupt. TXT record found for ${normalized}. Ask them to publish one in their DNS.`,
      );
      continue;
    }
    if (result && result.pubkey) {
      const entry = {
        ts: result.ts,
        ttl: result.ttl,
        pubkey: result.pubkey,
        relay: result.relay || "",
        dnssec: result.dnssec,
        resolver: result.resolver,
      };
      writeCache(normalized, entry);
      return { ...entry, domain: normalized, cached: false, stale: false };
    }
    if (result?.parsed === null) {
      invalidError = new Error(`TXT records for ${normalized} don't contain a valid public key.`);
    }
  }

  if (noRecordError) throw noRecordError;
  if (invalidError) throw invalidError;
  throw new Error("DNS lookup failed on every resolver.");
}

function checkFresh(entry) {
  return Date.now() - entry.ts < entry.ttl;
}

/**
 * Resolve user input to a pubkey. Accepts:
 *  - raw 64-char hex pubkey
 *  - 02/03-prefixed compressed key
 *  - domain name (looks up gupt.<domain> TXT record)
 *
 * Domain results additionally carry:
 *  - `relay`     — optional relay hint from the TXT record
 *  - `dnssec`    — the DoH response's DNSSEC validation flag
 *  - `resolver`  — resolver that answered
 *  - `cached`/`stale`/`cachedFor` — cache state
 *  - `pinStatus` — "first" | "match" | "changed" vs the locally pinned key
 *  - `pinnedKey` — the previously pinned key when status is "changed"
 */
export async function resolveRecipientInput(input, { force = false } = {}) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("Enter a public key or domain name.");
  }

  const hex = normalizeNostrPubkey(trimmed);
  if (hex) {
    return { pubkey: hex, source: "pubkey" };
  }

  if (isDomainInput(trimmed)) {
    const resolution = await resolveDomain(trimmed, { force });
    const pin = getPin(resolution.domain);
    let pinStatus = "first";
    if (pin && pin.pubkey !== resolution.pubkey) pinStatus = "changed";
    else if (pin) pinStatus = "match";
    return {
      ...resolution,
      source: "domain",
      domain: resolution.domain,
      pinStatus,
      pinnedKey: pin?.pubkey || "",
    };
  }

  throw new Error("Enter a valid public key (64-char hex) or domain name.");
}
