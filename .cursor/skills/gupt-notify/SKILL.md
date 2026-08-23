---
name: gupt-notify
description: >-
  Sends end-to-end encrypted notifications and status updates to a GUPT account
  with gupt-sdk. Use when replacing ntfy.sh, posting CI/backup/deploy/agent
  alerts, or messaging a 64-character GUPT public key.
---

# Notify a GUPT account

GUPT is an encrypted-DM alternative to ntfy.sh. There is no public topic. The
payload is a Kind-4 DM that only the recipient pubkey can decrypt. It lands in
their GUPT chat when they come online.

## When to use

- CI finished, deploy shipped, backup succeeded/failed
- An agent needs to push a status line or a small file to the user
- The user asked to "send this to my GUPT" / "notify me on GUPT"

Do not use this for OS wake-up while GUPT is fully closed. That is still the
separate ntfy PING path. This skill is for the encrypted message body.

## Required secrets

| Env | What |
|---|---|
| `GUPT_BOT_KEY` | 64-char hex **bot** secret. Never a personal GUPT identity. |
| `GUPT_USER_PUBKEY` | 64-char hex recipient public key (Me → copy key in GUPT). |

Need at least two `wss://` relays the recipient also uses (or have them DM the
bot once so it can learn a relay hint).

```js
import { GuptBot } from "gupt-sdk";

const bot = new GuptBot({
  secretHex: process.env.GUPT_BOT_KEY,
  relays: ["wss://relay.damus.io", "wss://nos.lol"],
});

await bot.start();
await bot.reply(process.env.GUPT_USER_PUBKEY, "Backup completed successfully");
await bot.stop();
```

```js
await bot.replyFile(process.env.GUPT_USER_PUBKEY, "./report.txt", {
  mime: "text/plain",
});
```

Install: `npm i gupt-sdk`. Docs: `sdk/README.md`. Example bots:
https://github.com/t3nklabs/gupt-bots

## Rules

- One dedicated bot keypair per notifier. Never reuse the user's secret.
- Keep messages short. Text cap is 8000 characters.
- Do not log secrets, plaintext dumps of private keys, or full env files.
- If relays reject or the user never receives the DM, they must share a relay
  with the bot or message the bot first.
- This is not a substitute for ntfy topic wake-up on a locked phone.
