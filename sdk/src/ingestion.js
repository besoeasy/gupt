import {
  assertDirectMessageEvent,
  decryptDirectMessage,
  getSenderRelayHint,
  isExpiredEvent,
  verifyEventSignature,
} from "./wire.js";

export const RECENCY_WINDOW_MS = 100_000;
export const FUTURE_SKEW_MS = 30_000;
export const SEEN_TTL_MS = 5 * 60_000;
export const MAX_SEEN_EVENTS = 10_000;

export class SeenEventTracker {
  constructor({
    ttlMs = SEEN_TTL_MS,
    maxEntries = MAX_SEEN_EVENTS,
    sweepIntervalMs = 60_000,
    clock = Date.now,
  } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.clock = clock;
    this.entries = new Map();
    this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
    this.sweepTimer.unref?.();
  }

  has(id, now = this.clock()) {
    const expiresAt = this.entries.get(id);
    if (expiresAt == null) return false;
    if (expiresAt <= now) {
      this.entries.delete(id);
      return false;
    }
    return true;
  }

  add(id, now = this.clock()) {
    this.sweep(now);
    this.entries.delete(id);
    this.entries.set(id, now + this.ttlMs);
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value);
    }
  }

  sweep(now = this.clock()) {
    for (const [id, expiresAt] of this.entries) {
      if (expiresAt <= now) this.entries.delete(id);
    }
  }

  close() {
    clearInterval(this.sweepTimer);
    this.entries.clear();
  }
}

export class IngestionPipeline {
  constructor({
    secretHex,
    pubkey,
    recencyWindowMs = RECENCY_WINDOW_MS,
    futureSkewMs = FUTURE_SKEW_MS,
    seenTracker = new SeenEventTracker(),
    clock = Date.now,
    onDrop = null,
  }) {
    this.secretHex = secretHex;
    this.pubkey = pubkey;
    this.recencyWindowMs = recencyWindowMs;
    this.futureSkewMs = futureSkewMs;
    this.seenTracker = seenTracker;
    this.clock = clock;
    this.onDrop = onDrop;
  }

  drop(reason, event, relayUrl) {
    this.onDrop?.({ reason, eventId: event?.id || null, relayUrl });
    return null;
  }

  ingest(event, { relayUrl = null, now = this.clock() } = {}) {
    try {
      assertDirectMessageEvent(event, this.pubkey);
    } catch {
      return this.drop("invalid-event", event, relayUrl);
    }

    const createdAt = event.created_at * 1000;
    if (createdAt < now - this.recencyWindowMs) {
      return this.drop("too-old", event, relayUrl);
    }
    if (createdAt > now + this.futureSkewMs) {
      return this.drop("from-future", event, relayUrl);
    }
    if (isExpiredEvent(event, now)) {
      return this.drop("expired", event, relayUrl);
    }
    if (this.seenTracker.has(event.id, now)) {
      return this.drop("duplicate", event, relayUrl);
    }
    if (!verifyEventSignature(event)) {
      return this.drop("invalid-signature", event, relayUrl);
    }

    this.seenTracker.add(event.id, now);

    try {
      return {
        event,
        payload: decryptDirectMessage(event, this.secretHex, this.pubkey),
        senderPubkey: event.pubkey,
        relayHint: getSenderRelayHint(event, this.pubkey),
        relayUrl,
        receivedAt: now,
      };
    } catch {
      return this.drop("invalid-ciphertext", event, relayUrl);
    }
  }

  close() {
    this.seenTracker.close();
  }
}
