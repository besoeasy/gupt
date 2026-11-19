import { getKnownRelays, dedupeRelays, addCustomRelay } from "./relay/index.js";
import { verifyRabtaNode } from "./relay/verify.js";

export function encodeInviteRelays(relays) {
  const hosts = dedupeRelays(relays)
    .map((relay) => relay.replace(/^https?:\/\//i, "").replace(/^wss?:\/\//i, ""))
    .join(",");
  if (!hosts) return "";
  return btoa(hosts).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeInviteRelays(raw) {
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const hosts = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    try {
      const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
      const decoded = atob(padded);
      hosts.push(
        ...decoded
          .split(",")
          .map((host) => (/^https?:\/\//i.test(host) ? host : `https://${host}`)),
      );
    } catch {}
  }
  return dedupeRelays(hosts);
}

/**
 * Adds an invite's relays only after verifying they are actually
 * reachable Rabta nodes. Verified relays enter the custom relay set.
 *
 * @param {string[]} relays - relay endpoints carried by the invite
 * @returns {Promise<string[]>} relays that were newly added
 */
export async function seedVerifiedInviteRelays(relays) {
  const candidates = dedupeRelays(relays);
  if (!candidates.length) return [];

  const known = new Set(getKnownRelays());
  const unknown = candidates.filter((relay) => !known.has(relay));
  if (!unknown.length) return [];

  const verified = (
    await Promise.all(unknown.map(async (relay) => ((await verifyRabtaNode(relay)) ? relay : null)))
  ).filter(Boolean);
  return verified.filter((relay) => addCustomRelay(relay));
}
