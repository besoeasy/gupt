import { GuptBot } from "gupt-sdk";

const relays = (process.env.GUPT_RELAYS || "")
  .split(",")
  .map((relay) => relay.trim())
  .filter(Boolean);

const bot = new GuptBot({
  secretHex: process.env.GUPT_KEY,
  relays,
});

bot.onMessage(async (ctx) => {
  if (ctx.text.startsWith("/echo ")) await ctx.reply(ctx.text.slice(6));
});

bot.onError((error, context) => {
  console.error(error.message, context);
});

await bot.start();
console.log(`GUPT echo bot ${bot.pubkey} is listening on ${relays.length} relays`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    bot.stop();
    process.exit(0);
  });
}
