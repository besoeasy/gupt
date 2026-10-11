import { normalizeNostrPubkey } from "@/lib/crypto";
import { getRelayRanking } from "@/lib/idb";
import { publicAppBaseUrl } from "@/lib/runtime";
import { getKnownRelays, dedupeRelays } from "@/lib/relay";
import { encodeInviteRelays, decodeInviteRelays, seedVerifiedInviteRelays } from "@/lib/invites";

export const MAX_INVITE_RELAY_COUNT = 20;

const RELAY_INVITE_PATH = "/invite/relays";

/**
 * Picks the relays to advertise in a relay invite: highest-scoring first, then
 * padded from the known set so a fresh install (empty ranking) still ships its
 * defaults instead of a bare profile link.
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
 * Parses a relay invite URL. Both fields are public metadata, so nothing here
 * is trusted beyond shape — the caller must still verify relay reachability
 * before adding anything to the known set.
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
 * Route guard for `/invite/relays/:pubkey/:relays?`. Seeds the incoming
 * relays and always redirects to the profile, so the relay invite never
 * renders a view of its own.
 *
 * This must run as a navigation guard rather than a mounted component: a
 * view that calls `router.replace()` from `onMounted` races the app shell's
 * `<Transition mode="out-in">`, which then waits forever for a transitionend
 * that never fires and leaves the previous view stuck on screen.
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
