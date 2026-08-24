export const PUBLIC_BOT_KIND = 1;
export const PUBLIC_BOT_TAG = "gupt-bot";

const HEX_64 = /^[0-9a-f]{64}$/;

function isExpiredEvent(event, now = Date.now()) {
  const expiration = event?.tags?.find((tag) => tag[0] === "expiration")?.[1];
  if (expiration == null) return false;
  const expiresAt = Number(expiration);
  return !Number.isFinite(expiresAt) || expiresAt <= Math.floor(now / 1000);
}

export function parsePublicBotEvent(event, now = Date.now()) {
  if (!event || event.kind !== PUBLIC_BOT_KIND) return null;
  if (!HEX_64.test(event.pubkey || "")) return null;
  if (!Array.isArray(event.tags)) return null;
  if (!event.tags.some((tag) => tag[0] === "t" && tag[1] === PUBLIC_BOT_TAG)) return null;
  if (isExpiredEvent(event, now)) return null;

  const listing = event.tags.find((tag) => tag[0] === PUBLIC_BOT_TAG && typeof tag[1] === "string");
  if (!listing) return null;

  let profile;
  try {
    profile = JSON.parse(listing[1]);
  } catch {
    return null;
  }
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;

  const name = String(profile.name || "").trim();
  const about = String(profile.about || "").trim();
  if (!name || !about) return null;

  let owner = "";
  const ownerRaw = String(profile.owner || "")
    .trim()
    .toLowerCase();
  if (HEX_64.test(ownerRaw)) owner = ownerRaw;

  let website = "";
  const websiteRaw = String(profile.website || "").trim();
  if (websiteRaw) {
    try {
      const parsed = new URL(websiteRaw);
      if (
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        !parsed.username &&
        !parsed.password
      ) {
        parsed.hash = "";
        website = parsed.toString();
      }
    } catch {
      website = "";
    }
  }

  const relays = [
    ...new Set(
      event.tags
        .filter(
          (tag) => tag[0] === "r" && typeof tag[1] === "string" && tag[1].startsWith("wss://"),
        )
        .map((tag) => tag[1]),
    ),
  ];

  return {
    pubkey: event.pubkey,
    name,
    about,
    owner,
    website,
    relays,
    createdAt: Number(event.created_at) || 0,
    eventId: event.id || "",
  };
}

export function reducePublicBots(events, now = Date.now()) {
  const byPubkey = new Map();
  for (const event of events || []) {
    const bot = parsePublicBotEvent(event, now);
    if (!bot) continue;
    const previous = byPubkey.get(bot.pubkey);
    if (!previous || bot.createdAt >= previous.createdAt) byPubkey.set(bot.pubkey, bot);
  }
  return [...byPubkey.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.pubkey.localeCompare(b.pubkey),
  );
}

export function shufflePublicBots(bots) {
  const next = [...(bots || [])];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export async function fetchPublicBots() {
  const { queryMany } = await import("./relay");
  const events = await queryMany([{ kinds: [PUBLIC_BOT_KIND], "#t": [PUBLIC_BOT_TAG], limit: 50 }]);
  return shufflePublicBots(reducePublicBots(events));
}
