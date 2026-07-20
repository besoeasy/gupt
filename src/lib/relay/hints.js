
import { normalizeNostrPubkey } from "@/lib/crypto.js";
import { normalizeRelayUrl } from "@/config/servers.js";
import { collectPeerRelayHints as idbCollectPeerRelayHints } from "@/lib/idb.js";
import { addHintRelay } from "./selection.js";

import { WsPool } from "./pool.js";
import { DEFAULT_RELAYS } from "@/config/servers.js";

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

const _fetchCache = new Map();

export async function fetchAndStorePeerRelayList(peerPubkey) {
  const pk = normalizeNostrPubkey(peerPubkey);
  if (!pk) return;

  const now = Date.now();
  if (_fetchCache.has(pk) && now - _fetchCache.get(pk) < 60 * 60 * 1000) return; 
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
    
  } finally {
    pool.close([...DEFAULT_RELAYS]);
  }
}
