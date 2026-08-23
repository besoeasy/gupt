# @gupt/sdk

Node.js SDK for running end-to-end encrypted GUPT bots over user-selected relays.

The SDK currently supports one-to-one text messages. Use a dedicated bot identity; never reuse a
personal GUPT key.

```js
import { GuptBot } from "@gupt/sdk";

const bot = new GuptBot({
  secretHex: process.env.GUPT_KEY,
  relays: ["wss://relay-a.example", "wss://relay-b.example"],
});

bot.onMessage(async (ctx) => {
  if (ctx.text.startsWith("/echo ")) await ctx.reply(ctx.text.slice(6));
});

bot.onError((error) => console.error(error.message));
await bot.start();
```

At least two distinct `wss://` bootstrap relays are required. The default Originless server is
`https://originless.gupt.app`; pass `originless` as a URL or URL array to override it.

Inbound messages teach the bot both the ingress relay and the sender relay hint carried in the
signed `p` tag. Learned hints are bounded and obvious local/private addresses are rejected. Replies
try the ingress relay first, then the peer's learned relays and the configured bootstrap relays.

By default, handlers accept all human senders with a one-second per-sender cooldown. Supply an
`allowlist`, call `bot.allow(pubkey)`, or tune `senderCooldownMs` as needed. SDK-generated messages
carry `bot: true` and are ignored by other SDK bots unless `acceptBotMessages` is enabled.

Call `bot.stop()` during shutdown to close relay connections and cancel queued sends.
