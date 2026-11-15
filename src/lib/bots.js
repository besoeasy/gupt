import { verifyEvent } from "./rabta/index.js";
import { query } from "./relay/index.js";

export const BOT_COLLECTION = "gupt/bot/beacon";
export const BOT_BEACON_TTL_SECONDS = 30 * 60 * 60;
export const BOT_LIST_LIMIT = 100;
export const BOT_MAX_NAME = 64;
export const BOT_MAX_DESCRIPTION = 280;
export const BOT_MAX_OWNER = 80;
export const BOT_MAX_WEBSITE = 300;
export const BOT_ESTABLISHED_DAYS = 30;

const PUBKEY_RE = /^[0-9a-f]{64}$/;

/** Strip control characters, collapse runs of whitespace, clamp to `max`. */
export function cleanBotText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Beacons are public and anyone can publish one, so the directory treats every
 * field as hostile input: only http(s) survives, and a bare host gets https.
 */
export function normalizeBotWebsite(value) {
  const raw = cleanBotText(value, BOT_MAX_WEBSITE);
  if (!raw) return { website: "", websiteHost: "" };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { website: "", websiteHost: "" };
    }
    if (!url.hostname) return { website: "", websiteHost: "" };
    return {
      website: url.href,
      websiteHost: url.hostname.replace(/^www\./i, ""),
    };
  } catch {
    return { website: "", websiteHost: "" };
  }
}

export function botPubkey(event) {
  const hex = String(event?.owner || "")
    .replace(/^ed25519:/i, "")
    .toLowerCase();
  return PUBKEY_RE.test(hex) ? hex : "";
}

/**
 * Validate one relay event into the shape the directory renders. Anything
 * malformed, unsigned, or from another collection returns null.
 */
export function parseBotBeacon(event) {
  if (!event || event.collection !== BOT_COLLECTION) return null;
  if (!verifyEvent(event)) return null;

  const data = event.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.v !== undefined && Number(data.v) !== 1) return null;

  const pubkey = botPubkey(event);
  if (!pubkey) return null;

  const name = cleanBotText(data.name, BOT_MAX_NAME);
  if (!name) return null;

  const createdAt = Math.floor(Number(event.created_at) || 0) * 1000;
  if (!createdAt) return null;

  const { website, websiteHost } = normalizeBotWebsite(data.website);

  return {
    pubkey,
    name,
    description: cleanBotText(data.description, BOT_MAX_DESCRIPTION),
    owner: cleanBotText(data.owner, BOT_MAX_OWNER),
    website,
    websiteHost,
    createdAt,
    expiresAt: Math.floor(Number(event.expires_at) || 0) * 1000,
    eventId: event.id,
  };
}

/** One card per bot key; the newest beacon wins, then sort by name. */
export function collapseBots(events) {
  const byPubkey = new Map();
  for (const event of events || []) {
    const bot = parseBotBeacon(event);
    if (!bot) continue;
    const prev = byPubkey.get(bot.pubkey);
    if (!prev || bot.createdAt > prev.createdAt) byPubkey.set(bot.pubkey, bot);
    else if (bot.createdAt === prev.createdAt && bot.eventId > prev.eventId) {
      byPubkey.set(bot.pubkey, bot);
    }
  }
  return [...byPubkey.values()].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    return byName || a.pubkey.localeCompare(b.pubkey);
  });
}

/** Query the user's relays directly; beacons never pass through the engine. */
export async function fetchBots({ limit = BOT_LIST_LIMIT, timeout = 5000 } = {}) {
  const events = await query([{ collection: BOT_COLLECTION, limit }], timeout);
  return collapseBots(events);
}

export function shortBotPubkey(pubkey) {
  const hex = String(pubkey || "");
  if (hex.length < 20) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
}
