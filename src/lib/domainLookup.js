import { normalizeNostrPubkey } from "@/lib/crypto";

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
const DNS_CACHE_PREFIX = "gupt_domain_cache:";
const DNS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Detect whether the input looks like a domain name (contains a dot,
 * no hex chars that would make it a pubkey, not an npub1... bech32 string).
 */
export function isDomainInput(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return false;
  if (/^npub1/i.test(trimmed)) return false;
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return false;
  if (/^(02|03)[0-9a-f]{64}$/i.test(trimmed)) return false;
  return trimmed.includes(".");
}

/**
 * Resolve a domain name to a pubkey by looking up the gupt.<domain> TXT record
 * via DNS-over-HTTPS (Cloudflare). Caches results for 5 minutes.
 */
async function resolveDomain(domain) {
  const normalized = domain.trim().toLowerCase().replace(/\.+$/, "");
  if (!normalized) throw new Error("Enter a domain name.");

  const cacheKey = DNS_CACHE_PREFIX + normalized;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { ts, pubkey } = JSON.parse(cached);
      if (Date.now() - ts < DNS_CACHE_TTL_MS && pubkey) return pubkey;
    }
  } catch {
    // ignore corrupt cache
  }

  const dnsName = `gupt.${normalized}`;
  const res = await fetch(`${DOH_ENDPOINT}?name=${encodeURIComponent(dnsName)}&type=TXT`, {
    headers: { Accept: "application/dns-json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error("DNS lookup failed.");

  const data = await res.json();
  const txtRecord = data?.Answer?.find((r) => r.type === 16)?.data ?? "";
  const raw = txtRecord.replace(/^"|"$/g, "").trim();
  if (!raw) {
    throw new Error(
      `No gupt. TXT record found for ${normalized}. Ask them to publish one in their DNS.`,
    );
  }

  const pubkey = normalizeNostrPubkey(raw);
  if (!pubkey) {
    throw new Error(`TXT record for ${normalized} does not contain a valid public key.`);
  }

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), pubkey }));
  } catch {
    // storage full — ignore
  }

  return pubkey;
}

/**
 * Resolve user input to a pubkey. Accepts:
 *  - raw 64-char hex pubkey
 *  - 02/03-prefixed compressed key
 *  - domain name (looked up via gupt.<domain> TXT record)
 */
export async function resolveRecipientInput(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("Enter a public key or domain name.");
  }

  const hex = normalizeNostrPubkey(trimmed);
  if (hex) {
    return { pubkey: hex, source: "pubkey" };
  }

  if (isDomainInput(trimmed)) {
    const pubkey = await resolveDomain(trimmed);
    return { pubkey, source: "domain", domain: trimmed };
  }

  throw new Error("Enter a valid public key (64-char hex) or domain name.");
}
