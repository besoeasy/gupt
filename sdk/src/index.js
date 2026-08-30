import { IngestionPipeline, RECENCY_WINDOW_MS } from "./ingestion.js";
import {
  createMediaPayload,
  downloadMediaPayload,
  MAX_MEDIA_BYTES,
  parseMediaPayload,
} from "./media.js";
import { RelayPool } from "./pool.js";
import { SendQueue } from "./queue.js";
import { normalizeRelayUrl, RelayBook } from "./relayBook.js";
import {
  buildDirectMessageEvent,
  buildPublicBotEvent,
  getPublicKey,
  normalizePubkey,
  normalizePublicBotProfile,
  normalizeSecretHex,
} from "./wire.js";

export const DEFAULT_ORIGINLESS_SERVERS = Object.freeze(["https://originless.gupt.app"]);
export const MAX_TEXT_LENGTH = 8_000;
export const DEFAULT_SENDER_COOLDOWN_MS = 1_000;
export const DEFAULT_REPLY_COOLDOWN_MS = 1_000;
export const DEFAULT_MAX_REPLIES_PER_MINUTE = 20;
export const DEFAULT_MAX_HANDLER_BACKLOG = 100;
export const PUBLIC_BOT_ANNOUNCE_MS = 3 * 60 * 60 * 1000;

function normalizeOriginlessUrl(value, allowPrivate) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) return null;
    url.pathname = url.pathname.replace(/\/upload\/?$/i, "").replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function normalizeAllowlist(values) {
  if (values == null) return null;
  if (!Array.isArray(values) && !(values instanceof Set)) {
    throw new TypeError("allowlist must be an array or Set of public keys");
  }
  return new Set([...values].map(normalizePubkey));
}

export class GuptBot {
  constructor({
    secretHex,
    relays,
    originless = DEFAULT_ORIGINLESS_SERVERS,
    allowlist = null,
    senderCooldownMs = DEFAULT_SENDER_COOLDOWN_MS,
    replyCooldownMs = DEFAULT_REPLY_COOLDOWN_MS,
    maxRepliesPerMinute = DEFAULT_MAX_REPLIES_PER_MINUTE,
    maxHandlerBacklog = DEFAULT_MAX_HANDLER_BACKLOG,
    acceptBotMessages = false,
    allowPrivateRelays = false,
    publicBot = null,
    WebSocketImpl = globalThis.WebSocket,
    onDrop = null,
    logger = console,
    mediaOptions = {},
    poolOptions = {},
    queueOptions = {},
  } = {}) {
    this.secretHex = normalizeSecretHex(secretHex);
    this.pubkey = getPublicKey(this.secretHex);
    this.allowPrivateRelays = Boolean(allowPrivateRelays);

    if (!Array.isArray(relays)) throw new TypeError("relays must be an array");
    const normalizedRelays = relays.map((relay) => {
      const normalized = normalizeRelayUrl(relay, {
        allowInsecure: this.allowPrivateRelays,
        allowPrivate: this.allowPrivateRelays,
      });
      if (!normalized) throw new TypeError(`Invalid relay URL: ${String(relay)}`);
      return normalized;
    });
    this.relays = [...new Set(normalizedRelays)];
    if (this.relays.length < 2) throw new TypeError("At least 2 distinct relays are required");

    const originlessValues = Array.isArray(originless) ? originless : [originless];
    this.originlessServers = [
      ...new Set(
        originlessValues.map((server) => {
          const normalized = normalizeOriginlessUrl(server, this.allowPrivateRelays);
          if (!normalized) throw new TypeError(`Invalid Originless server URL: ${String(server)}`);
          return normalized;
        }),
      ),
    ];
    if (!this.originlessServers.length) {
      throw new TypeError("At least 1 Originless server is required");
    }

    this.allowlist = normalizeAllowlist(allowlist);
    this.senderCooldownMs = Math.max(0, Number(senderCooldownMs) || 0);
    this.replyCooldownMs = Math.max(0, Number(replyCooldownMs) || 0);
    this.maxRepliesPerMinute = Math.max(1, Number(maxRepliesPerMinute) || 1);
    this.maxHandlerBacklog = Math.max(1, Number(maxHandlerBacklog) || 1);
    this.acceptBotMessages = Boolean(acceptBotMessages);
    this.publicBot = normalizePublicBotProfile(publicBot);
    this.publicBotAnnounceTimer = null;
    this.logger = logger;
    this.mediaOptions = {
      fetchImpl: mediaOptions.fetchImpl || globalThis.fetch,
      gateways: mediaOptions.gateways,
      maxBytes: Math.max(1, Number(mediaOptions.maxBytes) || MAX_MEDIA_BYTES),
      uploadTimeoutMs: mediaOptions.uploadTimeoutMs,
      downloadTimeoutMs: mediaOptions.downloadTimeoutMs,
    };
    this.status = "idle";
    this.handlers = new Set();
    this.errorHandlers = new Set();
    this.handlerChains = new Map();
    this.handlerBacklogs = new Map();
    this.lastHandledAt = new Map();
    this.replyWindows = new Map();

    this.relayBook = new RelayBook(this.relays, { allowPrivateRelays: this.allowPrivateRelays });
    this.ingestion = new IngestionPipeline({
      secretHex: this.secretHex,
      pubkey: this.pubkey,
      onDrop,
    });
    this.queue = new SendQueue(queueOptions);
    this.pool = new RelayPool({
      ...poolOptions,
      WebSocketImpl,
      allowPrivateRelays: this.allowPrivateRelays,
      onEvent: (event, relayUrl) => this.receiveEvent(event, relayUrl),
      onRelayError: (error, relayUrl) => this.emitError(error, { relayUrl }),
    });
  }

  onMessage(handler) {
    if (typeof handler !== "function") throw new TypeError("Message handler must be a function");
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onError(handler) {
    if (typeof handler !== "function") throw new TypeError("Error handler must be a function");
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  allow(pubkey) {
    if (!this.allowlist) this.allowlist = new Set();
    this.allowlist.add(normalizePubkey(pubkey));
    return this;
  }

  disallow(pubkey) {
    this.allowlist?.delete(normalizePubkey(pubkey));
    return this;
  }

  async start() {
    if (this.status === "running") return this;
    if (this.status !== "idle") throw new Error("A stopped GuptBot instance cannot be restarted");
    this.status = "starting";
    try {
      await this.pool.start(this.relays, () => ({
        kinds: [4],
        "#p": [this.pubkey],
        since: Math.floor((Date.now() - RECENCY_WINDOW_MS) / 1000),
        limit: 200,
      }));
      this.status = "running";
      if (this.publicBot) {
        await this.announcePublicBot();
        this.publicBotAnnounceTimer = setInterval(() => {
          void this.announcePublicBot();
        }, PUBLIC_BOT_ANNOUNCE_MS);
        this.publicBotAnnounceTimer.unref?.();
      }
      return this;
    } catch (error) {
      this.status = "idle";
      throw error;
    }
  }

  stop() {
    if (this.status === "stopped") return;
    this.status = "stopped";
    if (this.publicBotAnnounceTimer) {
      clearInterval(this.publicBotAnnounceTimer);
      this.publicBotAnnounceTimer = null;
    }
    this.pool.stop();
    this.queue.stop();
    this.ingestion.close();
    this.handlerChains.clear();
    this.handlerBacklogs.clear();
  }

  receiveEvent(event, relayUrl) {
    const message = this.ingestion.ingest(event, { relayUrl });
    if (!message) return;

    const discovered = this.relayBook.learn(
      message.senderPubkey,
      { sourceRelay: relayUrl, hintedRelay: message.relayHint },
      message.receivedAt,
    );
    for (const relay of discovered) {
      this.pool.addRelay(relay).catch((error) => this.emitError(error, { relayUrl: relay }));
    }

    const { payload, senderPubkey } = message;
    let attachment = null;
    if (payload.type === "text") {
      if (typeof payload.text !== "string") return;
      if (!payload.text.trim() || payload.text.length > MAX_TEXT_LENGTH) return;
    } else if (payload.type === "media" || payload.type === "voice") {
      try {
        attachment = parseMediaPayload(payload, { maxBytes: this.mediaOptions.maxBytes });
      } catch {
        return;
      }
    } else {
      return;
    }
    if (payload.bot === true && !this.acceptBotMessages) return;
    if (this.allowlist && !this.allowlist.has(senderPubkey)) return;

    const lastHandledAt = this.lastHandledAt.get(senderPubkey) || 0;
    if (message.receivedAt - lastHandledAt < this.senderCooldownMs) return;
    this.lastHandledAt.set(senderPubkey, message.receivedAt);

    const backlog = this.handlerBacklogs.get(senderPubkey) || 0;
    if (backlog >= this.maxHandlerBacklog) {
      this.emitError(new Error("Handler backlog limit reached"), {
        eventId: event.id,
        senderPubkey,
      });
      return;
    }

    this.handlerBacklogs.set(senderPubkey, backlog + 1);
    const previous = this.handlerChains.get(senderPubkey) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => this.dispatchMessage(message, attachment))
      .catch((error) =>
        this.emitError(error, { eventId: message.event.id, senderPubkey: message.senderPubkey }),
      )
      .finally(() => {
        const remaining = Math.max(0, (this.handlerBacklogs.get(senderPubkey) || 1) - 1);
        if (remaining) this.handlerBacklogs.set(senderPubkey, remaining);
        else {
          this.handlerBacklogs.delete(senderPubkey);
          if (this.handlerChains.get(senderPubkey) === next)
            this.handlerChains.delete(senderPubkey);
        }
      });
    this.handlerChains.set(senderPubkey, next);
  }

  async dispatchMessage(message, attachment = null) {
    const payload = Object.freeze({
      ...message.payload,
      ...(message.payload.media ? { media: Object.freeze({ ...message.payload.media }) } : {}),
    });
    const file = attachment
      ? Object.freeze({
          type: attachment.type,
          name: attachment.name,
          mime: attachment.mime,
          size: attachment.size,
          cid: attachment.cid,
          durationMs: attachment.durationMs,
        })
      : null;
    const context = Object.freeze({
      id: message.event.id,
      senderPubkey: message.senderPubkey,
      type: message.payload.type,
      text: message.payload.text || "",
      payload,
      file,
      relayUrl: message.relayUrl,
      receivedAt: message.receivedAt,
      reply: (text) => this.reply(message.senderPubkey, text, message.relayUrl),
      replyFile: (input, options) =>
        this.replyFile(message.senderPubkey, input, options, message.relayUrl),
      downloadFile: (options) => this.downloadFile(message.payload, options),
    });
    for (const handler of this.handlers) await handler(context);
  }

  async reply(peerPubkey, text, ingressRelay = null) {
    if (this.status !== "running") throw new Error("Bot is not running");
    const peer = normalizePubkey(peerPubkey);
    const replyText = String(text || "").trim();
    if (!replyText) throw new TypeError("Reply text is required");
    if (replyText.length > MAX_TEXT_LENGTH) {
      throw new TypeError(`Reply text cannot exceed ${MAX_TEXT_LENGTH} characters`);
    }
    this.reserveReply(peer);

    return this.sendPayload(
      peer,
      {
        type: "text",
        text: replyText,
        ts: Date.now(),
        bot: true,
      },
      ingressRelay,
    );
  }

  async replyFile(peerPubkey, input, options = {}, ingressRelay = null) {
    if (this.status !== "running") throw new Error("Bot is not running");
    const peer = normalizePubkey(peerPubkey);
    this.reserveReply(peer);
    const payload = await createMediaPayload(input, {
      fetchImpl: this.mediaOptions.fetchImpl,
      maxBytes: this.mediaOptions.maxBytes,
      timeoutMs: this.mediaOptions.uploadTimeoutMs,
      ...options,
      originlessServers: this.originlessServers,
      allowPrivateServers: this.allowPrivateRelays,
    });
    return this.sendPayload(
      peer,
      {
        ...payload,
        ts: Date.now(),
        bot: true,
      },
      ingressRelay,
    );
  }

  downloadFile(payload, options = {}) {
    return downloadMediaPayload(payload, {
      fetchImpl: this.mediaOptions.fetchImpl,
      gateways: this.mediaOptions.gateways,
      maxBytes: this.mediaOptions.maxBytes,
      timeoutMs: this.mediaOptions.downloadTimeoutMs,
      ...options,
      originlessServers: this.originlessServers,
      allowPrivateServers: this.allowPrivateRelays,
    });
  }

  async announcePublicBot() {
    if (this.status !== "running" || !this.publicBot) return;
    try {
      const event = buildPublicBotEvent({
        secretHex: this.secretHex,
        ...this.publicBot,
        relays: this.relays,
      });
      await this.queue.enqueue({
        id: event.id,
        lane: "__public-bot__",
        fn: () => this.pool.publish(this.relays, event),
      });
    } catch (error) {
      this.emitError(error, { kind: "public-bot" });
    }
  }

  sendPayload(peer, payload, ingressRelay) {
    const event = buildDirectMessageEvent({
      secretHex: this.secretHex,
      recipientPubkey: peer,
      payload,
    });
    const targets = this.relayBook.replyRelays(peer, ingressRelay);
    return this.queue.enqueue({
      id: event.id,
      lane: peer,
      fn: () => this.pool.publish(targets, event),
    });
  }

  reserveReply(peer, now = Date.now()) {
    const cutoff = now - 60_000;
    const window = (this.replyWindows.get(peer) || []).filter((timestamp) => timestamp > cutoff);
    const previous = window.at(-1) || 0;
    if (now - previous < this.replyCooldownMs) {
      throw new Error("Reply cooldown is active for this sender");
    }
    if (window.length >= this.maxRepliesPerMinute) {
      throw new Error("Per-sender reply rate limit reached");
    }
    window.push(now);
    this.replyWindows.set(peer, window);
  }

  emitError(error, context = {}) {
    if (this.errorHandlers.size) {
      for (const handler of this.errorHandlers) handler(error, context);
      return;
    }
    this.logger?.error?.("[gupt-bot]", error?.message || String(error), context);
  }

  snapshot() {
    return {
      status: this.status,
      pubkey: this.pubkey,
      relays: [...this.relays],
      originlessServers: [...this.originlessServers],
      publicBot: this.publicBot ? { ...this.publicBot } : null,
      relayBook: this.relayBook.snapshot(),
      relayPool: this.pool.snapshot(),
      sendQueue: this.queue.snapshot(),
    };
  }
}

export * from "./bitcoin.js";
export * from "./ingestion.js";
export * from "./media.js";
export * from "./queue.js";
export * from "./relayBook.js";
export * from "./wire.js";
