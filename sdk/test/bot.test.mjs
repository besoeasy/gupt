import assert from "node:assert/strict";
import test from "node:test";

import { GuptBot } from "../src/index.js";
import { decryptAttachmentBytes, encryptAttachmentBytes, parseMediaPayload } from "../src/media.js";
import { buildDirectMessageEvent, decryptDirectMessage, getPublicKey } from "../src/wire.js";

class UnusedWebSocket {
  static OPEN = 1;
}

const BOT_SECRET = "5".padStart(64, "0");
const SENDER_SECRET = "6".padStart(64, "0");
const SENDER_PUBKEY = getPublicKey(SENDER_SECRET);
const RELAYS = ["wss://bootstrap-a.example", "wss://bootstrap-b.example"];
const MEDIA_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3pteauxm5ymf7r2zq";

test("validates bot initialization requirements eagerly", () => {
  assert.throws(
    () =>
      new GuptBot({
        secretHex: BOT_SECRET,
        relays: [RELAYS[0]],
        WebSocketImpl: UnusedWebSocket,
      }),
    /At least 2 distinct relays/,
  );
  assert.throws(
    () =>
      new GuptBot({
        secretHex: BOT_SECRET,
        relays: RELAYS,
        originless: [],
        WebSocketImpl: UnusedWebSocket,
      }),
    /At least 1 Originless/,
  );
});

test("learns the signed sender hint and routes encrypted replies", async () => {
  const bot = new GuptBot({
    secretHex: BOT_SECRET,
    relays: RELAYS,
    senderCooldownMs: 0,
    replyCooldownMs: 0,
    WebSocketImpl: UnusedWebSocket,
    queueOptions: { throttleMs: 0 },
  });
  const learned = [];
  const publishes = [];
  bot.pool.addRelay = async (relay) => learned.push(relay);
  bot.pool.publish = async (relays, event) => {
    publishes.push({ relays, event });
    return { relay: relays[0], id: event.id };
  };
  bot.status = "running";

  let context;
  bot.onMessage(async (ctx) => {
    context = ctx;
    await ctx.reply(`echo: ${ctx.text}`);
  });

  const now = Date.now();
  const inbound = buildDirectMessageEvent({
    secretHex: SENDER_SECRET,
    recipientPubkey: bot.pubkey,
    payload: { type: "text", text: "hello", ts: now },
    relayHint: "wss://sender-relay.example",
    now,
  });
  bot.receiveEvent(inbound, RELAYS[0]);
  await bot.handlerChains.get(SENDER_PUBKEY);

  assert.equal(context.senderPubkey, SENDER_PUBKEY);
  assert.equal(context.relayUrl, RELAYS[0]);
  assert.deepEqual(learned, ["wss://sender-relay.example"]);
  assert.deepEqual(publishes[0].relays, [RELAYS[0], "wss://sender-relay.example", RELAYS[1]]);
  const reply = decryptDirectMessage(publishes[0].event, SENDER_SECRET, SENDER_PUBKEY);
  assert.equal(reply.type, "text");
  assert.equal(reply.text, "echo: hello");
  assert.equal(reply.bot, true);
  assert.equal(typeof reply.ts, "number");
  bot.stop();
});

test("allowlists senders and ignores SDK bot messages by default", async () => {
  const bot = new GuptBot({
    secretHex: BOT_SECRET,
    relays: RELAYS,
    allowlist: ["7".repeat(64)],
    senderCooldownMs: 0,
    WebSocketImpl: UnusedWebSocket,
  });
  bot.pool.addRelay = async () => {};
  bot.status = "running";
  let calls = 0;
  bot.onMessage(() => calls++);

  bot.receiveEvent(
    buildDirectMessageEvent({
      secretHex: SENDER_SECRET,
      recipientPubkey: bot.pubkey,
      payload: { type: "text", text: "not allowed", ts: Date.now() },
    }),
    RELAYS[0],
  );
  bot.allow(SENDER_PUBKEY);
  bot.receiveEvent(
    buildDirectMessageEvent({
      secretHex: SENDER_SECRET,
      recipientPubkey: bot.pubkey,
      payload: { type: "text", text: "from bot", ts: Date.now(), bot: true },
    }),
    RELAYS[0],
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 0);
  bot.stop();
});

test("parses, downloads, and replies with encrypted files", async () => {
  const inboundPlain = Buffer.from("file from user");
  const inboundKey = Uint8Array.from({ length: 32 }, (_, index) => index);
  const inboundNonce = Uint8Array.from({ length: 12 }, (_, index) => index + 32);
  const { encrypted: inboundEncrypted } = encryptAttachmentBytes(inboundPlain, {
    key: inboundKey,
    nonce: inboundNonce,
  });
  let uploadedReply;
  const fetchImpl = async (url, init = {}) => {
    if (init.method === "POST") {
      uploadedReply = Buffer.from(await init.body.get("file").arrayBuffer());
      return Response.json({ cid: MEDIA_CID });
    }
    return new Response(inboundEncrypted);
  };
  const bot = new GuptBot({
    secretHex: BOT_SECRET,
    relays: RELAYS,
    senderCooldownMs: 0,
    replyCooldownMs: 0,
    WebSocketImpl: UnusedWebSocket,
    mediaOptions: { fetchImpl },
    queueOptions: { throttleMs: 0 },
  });
  const publishes = [];
  bot.pool.publish = async (relays, event) => {
    publishes.push({ relays, event });
    return { relay: relays[0], id: event.id };
  };
  bot.status = "running";

  let context;
  let downloaded;
  bot.onMessage(async (ctx) => {
    context = ctx;
    downloaded = await ctx.downloadFile();
    await ctx.replyFile(Buffer.from("file from bot"), {
      name: "bot-response.txt",
      mime: "text/plain",
    });
  });

  const inbound = buildDirectMessageEvent({
    secretHex: SENDER_SECRET,
    recipientPubkey: bot.pubkey,
    payload: {
      type: "media",
      text: "user-file.txt",
      media: {
        key: Buffer.from(inboundKey).toString("base64"),
        nonce: Buffer.from(inboundNonce).toString("base64"),
        mime: "text/plain",
        name: "user-file.txt",
        size: inboundPlain.byteLength,
        cid: MEDIA_CID,
      },
    },
  });
  bot.receiveEvent(inbound, RELAYS[0]);
  await bot.handlerChains.get(SENDER_PUBKEY);

  assert.equal(context.type, "media");
  assert.deepEqual(context.file, {
    type: "media",
    name: "user-file.txt",
    mime: "text/plain",
    size: inboundPlain.byteLength,
    cid: MEDIA_CID,
    durationMs: 0,
  });
  assert.deepEqual(Buffer.from(downloaded.data), inboundPlain);

  const outbound = decryptDirectMessage(publishes[0].event, SENDER_SECRET, SENDER_PUBKEY);
  const outboundMedia = parseMediaPayload(outbound);
  assert.equal(outbound.type, "media");
  assert.equal(outbound.media.name, "bot-response.txt");
  assert.equal(outbound.bot, true);
  assert.deepEqual(
    Buffer.from(decryptAttachmentBytes(uploadedReply, outboundMedia.key, outboundMedia.nonce)),
    Buffer.from("file from bot"),
  );
  bot.stop();
});
