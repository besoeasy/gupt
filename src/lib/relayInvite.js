import { normalizeNostrPubkey } from "@/lib/crypto";
import { getRelayRanking } from "@/lib/idb";
import { publicAppBaseUrl } from "@/lib/runtime";
import { getKnownRelays, dedupeRelays, addCustomRelay, ensureConnectedRelays } from "@/lib/relay";

export const MAX_INVITE_RELAY_COUNT = 20;

const RELAY_INVITE_PATH = "/add";

function encodeInviteRelays(relays) {
  const hosts = dedupeRelays(relays)
    .map((relay) => relay.replace(/^https?:\/\//i, "").replace(/^wss?:\/\//i, ""))
    .join(",");
  if (!hosts) return "";
  return btoa(hosts).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeInviteRelays(raw) {
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

  const verified = await ensureConnectedRelays(unknown).catch(() => []);
  return verified.filter((relay) => addCustomRelay(relay));
}

/**
 * Picks the relays to advertise in an invite: highest-scoring first, then
 * padded from the known set.
 *
 * @param {number} [max] - max relays to keep
 * @returns {Promise<string[]>} best-known relay URLs, capped at `max`
 */
export async function selectTopRelays(max = MAX_INVITE_RELAY_COUNT) {
  const ranking = await getRelayRanking().catch(() => []);
  const top = (ranking || []).map((r) => r.relay);
  return dedupeRelays([...top, ...getKnownRelays()]).slice(0, max);
}

export function buildRelayInviteUrl(pubkey, relays = []) {
  const normalized = normalizeNostrPubkey(pubkey);
  if (!normalized) return "";

  const capped = dedupeRelays(relays).slice(0, MAX_INVITE_RELAY_COUNT);
  const base = `${publicAppBaseUrl()}/#${RELAY_INVITE_PATH}/${normalized}`;
  const encoded = encodeInviteRelays(capped);
  return encoded ? `${base}/${encoded}` : base;
}

/**
 * Parses a relay invite URL.
 *
 * @param {string} rawPubkey - `:pubkey` route param
 * @param {string} [rawRelays] - `:relays` route param (base64url relay hosts)
 * @returns {{ pubkeyHex: string, relays: string[] }}
 */
export function parseRelayInvite(rawPubkey, rawRelays) {
  const pubkeyHex = normalizeNostrPubkey(rawPubkey);
  if (!pubkeyHex) throw new Error("This invite link is missing a valid public key.");

  const relays = decodeInviteRelays(rawRelays).slice(0, MAX_INVITE_RELAY_COUNT);
  return { pubkeyHex, relays };
}

/**
 * Route guard for `/add/:pubkey/:relays?`. Seeds the incoming
 * relays and always redirects to the profile.
 *
 * @param {object} to - vue-router route location
 * @returns {Promise<string>} the profile route to redirect to
 */
export async function relayInviteGuard(to) {
  let invite;
  try {
    invite = parseRelayInvite(to.params.pubkey, to.params.relays);
  } catch {
    return "/chat";
  }

  void seedVerifiedInviteRelays(invite.relays).catch(() => {});
  return `/profile/${invite.pubkeyHex}`;
}
