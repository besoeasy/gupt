import { normalizeNostrPubkey } from "@/lib/crypto.js";
import { normalizeRelayUrl } from "@/config/servers.js";
import { collectPeerRelayHints as idbCollectPeerRelayHints } from "@/lib/idb.js";
import { addHintRelay } from "./selection.js";

export async function storePeerRelayHint(peerPubkey, relayHint) {
  const peer = normalizeNostrPubkey(peerPubkey);
  const url = normalizeRelayUrl(relayHint);
  if (!peer || !url) return;
  addHintRelay(url);
  await idbCollectPeerRelayHints(peer, [{ sender: peer, relayHint: url, ts: Date.now() }]);
}

export async function collectPeerHintsFromHistory(peerPubkey, messages) {
  const peer = normalizeNostrPubkey(peerPubkey);
  if (!peer) return;
  await idbCollectPeerRelayHints(peer, messages);
}
