import { isIP } from "node:net";

import { normalizePubkey } from "./wire.js";

export const MAX_LEARNED_RELAYS = 50;
export const MAX_PEER_RELAYS = 10;
export const MAX_REPLY_RELAYS = 5;

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return (
    normalized === "::" ||
    normalized === "::1" ||
    (mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false) ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  );
}

export function isPrivateRelayHostname(hostname) {
  const normalized = String(hostname || "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }
  const family = isIP(normalized);
  if (family === 4) return isPrivateIpv4(normalized);
  if (family === 6) return isPrivateIpv6(normalized);
  return false;
}

export function normalizeRelayUrl(value, { allowInsecure = false, allowPrivate = false } = {}) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== "wss:" && !(allowInsecure && url.protocol === "ws:")) return null;
    if (!allowPrivate && isPrivateRelayHostname(url.hostname)) return null;
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export class RelayBook {
  constructor(
    bootstrapRelays,
    {
      maxLearnedRelays = MAX_LEARNED_RELAYS,
      maxPeerRelays = MAX_PEER_RELAYS,
      maxReplyRelays = MAX_REPLY_RELAYS,
      allowPrivateRelays = false,
      clock = Date.now,
    } = {},
  ) {
    this.allowPrivateRelays = allowPrivateRelays;
    this.clock = clock;
    this.maxLearnedRelays = maxLearnedRelays;
    this.maxPeerRelays = maxPeerRelays;
    this.maxReplyRelays = maxReplyRelays;
    this.bootstrapRelays = [...new Set(bootstrapRelays)];
    this.bootstrapSet = new Set(this.bootstrapRelays);
    this.peers = new Map();
    this.learned = new Map();
  }

  learn(peerPubkey, { sourceRelay = null, hintedRelay = null } = {}, now = this.clock()) {
    const peer = normalizePubkey(peerPubkey);
    const source = normalizeRelayUrl(sourceRelay, {
      allowInsecure: this.allowPrivateRelays,
      allowPrivate: this.allowPrivateRelays,
    });
    const hint = normalizeRelayUrl(hintedRelay, {
      allowInsecure: false,
      allowPrivate: this.allowPrivateRelays,
    });
    const discovered = [];

    if (source) this.rememberPeerRelay(peer, source, now);
    if (hint) {
      this.rememberPeerRelay(peer, hint, now);
      if (!this.bootstrapSet.has(hint)) {
        const isNew = !this.learned.has(hint);
        this.learned.delete(hint);
        this.learned.set(hint, now);
        if (isNew) discovered.push(hint);
      }
    }

    this.enforceGlobalLimit();
    return discovered.filter((relay) => this.learned.has(relay));
  }

  rememberPeerRelay(peer, relay, now) {
    if (!this.peers.has(peer)) this.peers.set(peer, new Map());
    const peerRelays = this.peers.get(peer);
    peerRelays.delete(relay);
    peerRelays.set(relay, now);
    while (peerRelays.size > this.maxPeerRelays) {
      peerRelays.delete(peerRelays.keys().next().value);
    }
  }

  enforceGlobalLimit() {
    while (this.learned.size > this.maxLearnedRelays) {
      const evicted = this.learned.keys().next().value;
      this.learned.delete(evicted);
      for (const peerRelays of this.peers.values()) peerRelays.delete(evicted);
    }
  }

  replyRelays(peerPubkey, ingressRelay = null) {
    const peer = normalizePubkey(peerPubkey);
    const ingress = normalizeRelayUrl(ingressRelay, {
      allowInsecure: this.allowPrivateRelays,
      allowPrivate: this.allowPrivateRelays,
    });
    const peerRelays = [...(this.peers.get(peer)?.entries() || [])]
      .sort((left, right) => right[1] - left[1])
      .map(([relay]) => relay);
    return [...new Set([ingress, ...peerRelays, ...this.bootstrapRelays].filter(Boolean))].slice(
      0,
      this.maxReplyRelays,
    );
  }

  learnedRelays() {
    return [...this.learned.keys()];
  }

  snapshot() {
    return {
      bootstrapRelays: [...this.bootstrapRelays],
      learnedRelays: this.learnedRelays(),
      peers: Object.fromEntries(
        [...this.peers].map(([peer, relays]) => [
          peer,
          [...relays.entries()]
            .sort((left, right) => right[1] - left[1])
            .map(([relay, lastSeenAt]) => ({ relay, lastSeenAt })),
        ]),
      ),
    };
  }
}
