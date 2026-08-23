# gupt-sdk

Node.js SDK for running end-to-end encrypted GUPT bots over user-selected relays.

The SDK supports one-to-one text, file, and voice-note messages. Use a dedicated bot identity;
never reuse a personal GUPT key.

```js
import { GuptBot } from "gupt-sdk";

const bot = new GuptBot({
  secretHex: process.env.GUPT_KEY,
  relays: ["wss://relay-a.example", "wss://relay-b.example"],
});

bot.onMessage(async (ctx) => {
  if (ctx.file) {
    const downloaded = await ctx.downloadFile();
    await ctx.replyFile(downloaded.data, {
      name: downloaded.name,
      mime: downloaded.mime,
    });
    return;
  }
  if (ctx.text.startsWith("/echo ")) await ctx.reply(ctx.text.slice(6));
});

bot.onError((error) => console.error(error.message));
await bot.start();
```

At least two distinct `wss://` bootstrap relays are required. The default Originless server is
`https://originless.gupt.app`; pass `originless` as a URL or URL array to override it.

File contents use a separate AES-256-GCM key and nonce that remain inside the encrypted DM payload.
`ctx.file` exposes safe metadata without downloading anything. `ctx.downloadFile()` fetches the CID
through the configured Originless/IPFS gateways, enforces the advertised size, and returns a
`Uint8Array`. `ctx.replyFile()` accepts a file path, `Blob`, `Buffer`, `Uint8Array`, or
`ArrayBuffer`. The default per-file limit is 100 MiB and can be changed with
`mediaOptions.maxBytes`.

```js
await ctx.replyFile("./report.pdf", {
  name: "report.pdf",
  mime: "application/pdf",
  onProgress(update) {
    console.log(update.phase, update.status);
  },
});
```

## Encrypted ntfy.sh-style notifications

A bot can initiate a message using only the recipient's GUPT public key; `reply()` and `replyFile()`
do not require a preceding inbound message. This makes `gupt-sdk` useful as an end-to-end encrypted,
self-hosted alternative to ntfy.sh for monitoring jobs, backups, CI, and server alerts.

```js
import { GuptBot } from "gupt-sdk";

const bot = new GuptBot({
  secretHex: process.env.GUPT_BOT_KEY,
  relays: ["wss://relay-a.example", "wss://relay-b.example"],
});

await bot.start();

await bot.reply(process.env.GUPT_USER_PUBKEY, "Backup completed successfully");
await bot.replyFile(process.env.GUPT_USER_PUBKEY, "./backup-report.txt", {
  mime: "text/plain",
});
```

Unlike a public notification topic, the recipient public key identifies who can decrypt the
notification. Events remain encrypted on relays and carry GUPT's standard 100-day expiration.

Public keys do not contain relay addresses. For reliable delivery, configure at least one relay
that the recipient also uses, or have the recipient message the bot first so it can learn their
signed relay hint. Learned hints are currently memory-only and are rediscovered after a bot
restart. GUPT retrieves stored notifications when it reconnects, but this is not an operating-system
push wake-up mechanism while the app is fully closed.

Inbound messages teach the bot both the ingress relay and the sender relay hint carried in the
signed `p` tag. Learned hints are bounded and obvious local/private addresses are rejected. Replies
try the ingress relay first, then the peer's learned relays and the configured bootstrap relays.

By default, handlers accept all human senders with a one-second per-sender cooldown. Supply an
`allowlist`, call `bot.allow(pubkey)`, or tune `senderCooldownMs` as needed. SDK-generated messages
carry `bot: true` and are ignored by other SDK bots unless `acceptBotMessages` is enabled.

Call `bot.stop()` during shutdown to close relay connections and cancel queued sends.
