---
name: gupt-sdk
description: >-
  Builds end-to-end encrypted GUPT bots with gupt-sdk (GuptBot). Use when
  creating a GUPT bot, sending encrypted notifications to a GUPT account,
  replacing ntfy.sh, handling inbound DMs/files, or messaging a 64-character
  GUPT public key.
---

# GUPT bot framework

[`gupt-sdk`](https://www.npmjs.com/package/gupt-sdk) is a full bot framework, not
a webhook wrapper. A bot is a dedicated secp256k1 keypair that sends and
receives Kind-4 encrypted DMs over user-chosen `wss://` relays. Relays see
ciphertext only. There is no Telegram/WhatsApp Bot API server.

Install: `npm i gupt-sdk` (Node `>=22.12`). Docs: [`sdk/README.md`](./sdk/README.md).
Examples: https://github.com/t3nklabs/gupt-bots

## When to use

- Build a bot that answers people in GUPT chat (`onMessage` → `ctx.reply`)
- Push CI / backup / deploy / agent status to a user's GUPT account (ntfy replacement)
- Echo or transform files (`ctx.file`, `ctx.downloadFile`, `ctx.replyFile`)

Do not use this for OS wake-up while GUPT is fully closed. That is the separate
ntfy PING path. This skill is the encrypted message body.

## Identity

| Env                          | What                                                          |
| ---------------------------- | ------------------------------------------------------------- |
| `GUPT_BOT_KEY` or `GUPT_KEY` | 64-char hex **bot** secret. Never a personal GUPT identity.   |
| `GUPT_USER_PUBKEY`           | Recipient pubkey when pushing a notification (Me → copy key). |

Need **at least two** distinct `wss://` relays the recipient also uses (or have
them DM the bot once so it can learn a relay hint). Default Originless pin node
is `https://originless.gupt.app`.

After `start()`, `bot.pubkey` is the public key people message.

## Listen and reply

```js
import { GuptBot } from "gupt-sdk";

const bot = new GuptBot({
  secretHex: process.env.GUPT_BOT_KEY,
  relays: ["wss://relay.damus.io", "wss://nos.lol"],
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
  else await ctx.reply(ctx.text);
});

bot.onError((error) => console.error(error.message));
await bot.start();
```

`ctx` fields: `id`, `senderPubkey`, `type` (`text` | `media` | `voice`), `text`,
`file` (metadata only — no download), `relayUrl`, `receivedAt`, `reply`,
`replyFile`, `downloadFile`.

Inbound messages are serialized per sender. Defaults: 1s sender cooldown, 1s
reply cooldown, 20 replies/minute/peer. Restrict with `allowlist` or
`bot.allow(pubkey)`. SDK outbound payloads set `bot: true`; other SDK bots
ignore them unless `acceptBotMessages: true`.

Call `bot.stop()` on shutdown. A stopped instance cannot be restarted.

## Public bots

To appear in GUPT under **Talk to bot** (next to New Chat):

```js
const bot = new GuptBot({
  secretHex: process.env.GUPT_BOT_KEY,
  relays: ["wss://relay.damus.io", "wss://nos.lol"],
  publicBot: {
    name: "Echo",
    about: "Repeats your message back.",
    owner: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    website: "https://example.com",
    bitcoin: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
  },
});
```

`name` and `about` are required. `owner` (64-char pubkey), `website` (http/https), and `bitcoin` (mainnet on-chain address) are optional.
The bot publishes a public Kind-1 `gupt-bot` listing on start and every 3 hours. Private notifiers
omit `publicBot`. Sample bots: https://github.com/t3nklabs/gupt-bots

## Push a notification (no inbound message)

`reply()` / `replyFile()` work with only the recipient pubkey — no prior DM.

```js
await bot.start();
await bot.reply(process.env.GUPT_USER_PUBKEY, "Backup completed successfully");
await bot.replyFile(process.env.GUPT_USER_PUBKEY, "./report.txt", {
  mime: "text/plain",
});
await bot.stop();
```

Unlike ntfy.sh, there is no public topic. Only that pubkey can decrypt the DM.
Events expire after ~100 days. This is not OS push while the app is closed.

## Files

`ctx.replyFile` / `bot.replyFile` accept a path, `Blob`, `Buffer`, `Uint8Array`,
or `ArrayBuffer`. Bytes are AES-256-GCM encrypted, then pinned via Originless.
Default cap 100 MiB (`mediaOptions.maxBytes`). Text cap is 8000 characters.

```js
await ctx.replyFile("./report.pdf", {
  name: "report.pdf",
  mime: "application/pdf",
});
```

## Live sample bots

See [t3nklabs/gupt-bots](https://github.com/t3nklabs/gupt-bots). Public bots appear in GUPT
under **Talk to bot** (next to New Chat) when they set `publicBot: { name, about }`.

## Rules

- One dedicated bot keypair per bot. Never reuse a user's secret. Never log secrets.
- Share at least one relay with the recipient, or have them message the bot first.
- Keep replies short. Do not treat this as ntfy topic wake-up on a locked phone.
