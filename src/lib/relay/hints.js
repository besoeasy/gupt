/**
 * Peer relay hint management.
 * Thin wrappers around IDB functions for storing and collecting
 * per-peer relay hints from message history.
 */

import { normalizeNostrPubkey } from "@/lib/crypto.js";
import { normalizeRelayUrl } from "@/config/servers.js";
import { collectPeerRelayHints as idbCollectPeerRelayHints } from "@/lib/idb.js";

function isValidRelayUrl(url) {
  return Boolean(normalizeRelayUrl(url));
}

/**
 * Store a single relay hint for a given peer in the per-peer hint store.
 * Validates the URL before persisting.
 */
export async function storePeerRelayHint(peerPubkey, relayHint) {
  const peer = normalizeNostrPubkey(peerPubkey);
  if (!peer || !relayHint || !isValidRelayUrl(relayHint)) return;
  await idbCollectPeerRelayHints(peer, [{ sender: peer, relayHint, ts: Date.now() }]);
}

/**
 * Collect relay hints from cached messages for a given peer.
 * Called during room hydration to build the initial per-peer hint store.
 */
export async function collectPeerHintsFromHistory(peerPubkey, messages) {
  const peer = normalizeNostrPubkey(peerPubkey);
  if (!peer) return;
  await idbCollectPeerRelayHints(peer, messages);
}
