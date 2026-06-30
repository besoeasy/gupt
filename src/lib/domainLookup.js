import { decode as decodeNip19 } from "nostr-tools/nip19";

import { normalizeNostrPubkey } from "@/lib/crypto";

const CACHE_KEY = "gupt_domain_lookup_v1";
const CACHE_TTL_MS = 60 * 60 * 1000;
const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

const DOMAIN_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function readCache() {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCache(map) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CACHE_KEY, JSON.stringify(map));
}

function getCachedLookup(lookupHost) {
  const entry = readCache()[lookupHost];
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
  return entry;
}

function cacheLookup(lookupHost, payload) {
  const map = readCache();
  map[lookupHost] = { ...payload, cachedAt: Date.now() };
  writeCache(map);
}

export function normalizeDomainInput(input) {
  let value = String(input || "")
    .trim()
    .toLowerCase();
  if (!value) return null;

  value = value.replace(/^https?:\/\//, "");
  value = value.split("/")[0].split("?")[0].split("#")[0];
  value = value.replace(/\.$/, "");
  value = value.replace(/:\d+$/, "");

  if (!value || /\s/.test(value)) return null;

  if (value.startsWith("gupt.")) {
    const domain = value.slice(5);
    if (!DOMAIN_RE.test(domain)) return null;
    return { domain, lookupHost: value };
  }

  const domain = value.startsWith("www.") ? value.slice(4) : value;
  if (!DOMAIN_RE.test(domain)) return null;

  return { domain, lookupHost: `gupt.${domain}` };
}

export function isDomainInput(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed || normalizeNostrPubkey(trimmed)) return false;
  if (trimmed.startsWith("npub1")) return false;
  return Boolean(normalizeDomainInput(trimmed));
}

function decodeTxtAnswer(data) {
  const raw = String(data || "").trim();
  if (!raw) return "";
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
  return raw;
}

export function parsePubkeyFromTxtRecords(records) {
  for (const record of records) {
    const value = String(record || "").trim();
    if (!value) continue;

    const hex = normalizeNostrPubkey(value);
    if (hex) return hex;

    if (value.startsWith("npub1")) {
      try {
        const decoded = decodeNip19(value);
        if (decoded?.type === "npub") {
          const pubkey = normalizeNostrPubkey(decoded.data);
          if (pubkey) return pubkey;
        }
      } catch {
        // try next record
      }
    }
  }
  return null;
}

async function fetchTxtRecords(host) {
  const url = new URL(DOH_ENDPOINT);
  url.searchParams.set("name", host);
  url.searchParams.set("type", "TXT");

  const response = await fetch(url, {
    headers: { Accept: "application/dns-json" },
  });

  if (!response.ok) {
    throw new Error(`DNS lookup failed (${response.status}).`);
  }

  const payload = await response.json();
  const answers = Array.isArray(payload?.Answer) ? payload.Answer : [];
  return answers.filter((entry) => entry?.type === 16).map((entry) => decodeTxtAnswer(entry.data));
}

export async function resolveDomainToPubkey(input) {
  const normalized = normalizeDomainInput(input);
  if (!normalized) {
    throw new Error("Enter a valid domain like example.com.");
  }

  const { domain, lookupHost } = normalized;
  const cached = getCachedLookup(lookupHost);
  if (cached?.pubkey) {
    return { domain, lookupHost, pubkey: cached.pubkey };
  }

  let records = [];
  try {
    records = await fetchTxtRecords(lookupHost);
  } catch (error) {
    throw new Error(error.message || `Could not resolve ${lookupHost}.`);
  }

  if (!records.length) {
    throw new Error(`No GUPT contact found at ${lookupHost}.`);
  }

  const pubkey = parsePubkeyFromTxtRecords(records);
  if (!pubkey) {
    throw new Error(`Invalid public key in DNS record at ${lookupHost}.`);
  }

  cacheLookup(lookupHost, { domain, pubkey });
  return { domain, lookupHost, pubkey };
}

export async function resolveRecipientInput(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("Enter a public key or domain.");
  }

  const hex = normalizeNostrPubkey(trimmed);
  if (hex) {
    return { pubkey: hex, source: "pubkey" };
  }

  if (trimmed.startsWith("npub1")) {
    try {
      const decoded = decodeNip19(trimmed);
      if (decoded?.type === "npub") {
        const pubkey = normalizeNostrPubkey(decoded.data);
        if (pubkey) return { pubkey, source: "npub" };
      }
    } catch {
      // fall through
    }
  }

  if (isDomainInput(trimmed)) {
    const resolved = await resolveDomainToPubkey(trimmed);
    return {
      pubkey: resolved.pubkey,
      source: "domain",
      domain: resolved.domain,
      lookupHost: resolved.lookupHost,
    };
  }

  throw new Error("Enter a valid public key (hex or npub) or a domain like example.com.");
}
