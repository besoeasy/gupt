/**
 * Peer relay hint management.
 * Hints have one job: expand our knowledge of which relays a peer uses
 * so publish() can reach them. They do NOT touch scores.
 */

import { normalizeNostrPubkey } from "@/lib/crypto.js";
import { normalizeRelayUrl } from "@/config/servers.js";
import { collectPeerRelayHints as idbCollectPeerRelayHints } from "@/lib/idb.js";
import { addHintRelay } from "./selection.js";

import { WsPool } from "./pool.js";
import { DEFAULT_RELAYS } from "@/config/servers.js";

/**
 * Store a relay URL learned from a peer's message tag.
 * Adds it to the in-memory known set so readRelays() can use it.
 */
export async function storePeerRelayHint(peerPubkey, relayHint) {
  const peer = normalizeNostrPubkey(peerPubkey);
  const url = normalizeRelayUrl(relayHint);
  if (!peer || !url) return;
  addHintRelay(url);
  await idbCollectPeerRelayHints(peer, [{ sender: peer, relayHint: url, ts: Date.now() }]);
}

/**
 * Collect relay hints from cached messages for a given peer.
 * Called during room hydration to populate the per-peer hint store.
 */
export async function collectPeerHintsFromHistory(peerPubkey, messages) {
  const peer = normalizeNostrPubkey(peerPubkey);
  if (!peer) return;
  await idbCollectPeerRelayHints(peer, messages);
}

const _fetchCache = new Map();

/**
 * Fetch Kind 10002 (Relay List Metadata) for a peer and store their relays as hints.
 * Solves the disjoint-relay problem: two users who share no relays can still
 * reach each other once we know where the peer publishes.
 */
export async function fetchAndStorePeerRelayList(peerPubkey) {
  const pk = normalizeNostrPubkey(peerPubkey);
  if (!pk) return;

  const now = Date.now();
  if (_fetchCache.has(pk) && now - _fetchCache.get(pk) < 60 * 60 * 1000) return; // 1h cache
  _fetchCache.set(pk, now);

  const pool = new WsPool();
  try {
    const events = await pool.querySync(
      [...DEFAULT_RELAYS],
      { kinds: [10002], authors: [pk], limit: 1 },
      { maxWait: 4000 },
    );

    if (!events.length) return;
    const latest = events.reduce((best, e) => (e.created_at > best.created_at ? e : best));

    const relays = latest.tags
      .filter((t) => t[0] === "r" && (t[2] === "read" || !t[2]))
      .map((t) => normalizeRelayUrl(t[1]))
      .filter(Boolean);

    for (const url of relays) {
      await storePeerRelayHint(pk, url);
    }
  } catch {
    // ignore — hints are best-effort
  } finally {
    pool.close([...DEFAULT_RELAYS]);
  }
}
