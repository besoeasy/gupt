import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";

import {
  normalizeNostrPubkey,
  generateKeypair,
  aesEncrypt,
  aesDecrypt,
  finalizeEvent,
} from "@/lib/crypto";
import { publicAppBaseUrl } from "@/lib/runtime";
import { openDmRoom } from "@/lib/chatUtils";
import {
  publishToRelays,
  queryMany,
  getKnownRelays,
  dedupeRelays,
  addHintRelay,
  ensureConnectedRelays,
  QUERY_TIMEOUT_MS,
} from "@/lib/relay";
import { putRawEvent, getRelayRanking, seedRelayScores } from "@/lib/idb";

export const INVITE_TTL_OPTIONS = [
  { id: "1h", label: "1 hour", hours: 1 },
  { id: "24h", label: "24 hours", hours: 24 },
  { id: "7d", label: "7 days", hours: 24 * 7 },
];

const INVITE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const INVITE_TOKEN_LENGTH = 20;
const TOKEN_RE = /^[A-Za-z0-9]{8,24}$/;
const KEY_CONTEXT = "gupt-invite-v1";
const REVOKE_TAG = "gupt_invite_revoked";
const MAX_INVITE_RELAY_HINTS = 5;
const INVITE_RELAY_SEED_SCORE = 0.9;

export function encodeInviteRelays(relays) {
  const hosts = dedupeRelays(relays)
    .map((relay) => relay.replace(/^wss?:\/\//, ""))
    .join(",");
  if (!hosts) return "";
  return btoa(hosts).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeInviteRelays(raw) {
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const hosts = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    try {
      const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
      const decoded = atob(padded);
      hosts.push(...decoded.split(",").map((host) => `wss://${host}`));
    } catch {}
  }
  return dedupeRelays(hosts);
}

export function buildInviteUrl(inviteToken, inviteRelays = []) {
  const relays = dedupeRelays(inviteRelays).slice(0, MAX_INVITE_RELAY_HINTS);
  const base = `${publicAppBaseUrl()}/#/invite/${encodeURIComponent(inviteToken)}`;
  const encoded = encodeInviteRelays(relays);
  if (!encoded) return base;
  return `${base}/${encoded}`;
}

/**
 * Picks the top relays from an acked set, ranked by current score. Dead or
 * unreachable relays never enter the URL because they would also weaken the
 * resolver's ability to find the invite event.
 *
 * @param {string[]} ackedRelays - relays that acked the invite publish
 * @param {Array<{relay: string, score: number}>} ranking - ranked relay stats
 * @param {number} [max] - max relays to keep
 * @returns {string[]} highest-scoring acked relays, capped at `max`
 */
export function rankInviteRelays(ackedRelays, ranking, max = MAX_INVITE_RELAY_HINTS) {
  const rankMap = new Map((ranking || []).map((r) => [r.relay, r.score ?? 0]));
  return [...ackedRelays]
    .sort((a, b) => (rankMap.get(b) ?? 0) - (rankMap.get(a) ?? 0))
    .slice(0, max);
}

export function formatInviteExpiry(expiresAtSec) {
  if (!expiresAtSec) return "never";
  const ms = expiresAtSec * 1000;
  const diff = ms - Date.now();
  if (diff <= 0) return "expired";

  const hours = Math.round(diff / 1000 / 3600);
  if (hours > 24) {
    return `${Math.round(hours / 24)} days`;
  }
  return `${Math.max(1, hours)} hours`;
}

export function generateInviteToken(length = INVITE_TOKEN_LENGTH) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let token = "";
  for (const b of bytes) token += INVITE_ALPHABET[b % INVITE_ALPHABET.length];
  return token;
}

function inviteKey(token) {
  return sha256(new TextEncoder().encode(`${KEY_CONTEXT}:${token}`));
}

/**
 * Adds the invite's relay hints only after verifying they are actually
 * reachable, then seeds the verified ones at a bootstrap score so both
 * parties end up on overlapping relays. Reachability filtering prevents a
 * crafted invite URL from injecting arbitrary relays into the active set.
 */
async function seedVerifiedInviteRelays(relays) {
  const candidates = dedupeRelays(relays);
  if (!candidates.length) return;

  const verified = await ensureConnectedRelays(candidates).catch(() => []);
  for (const relay of verified) addHintRelay(relay);
  if (verified.length) await seedRelayScores(verified, INVITE_RELAY_SEED_SCORE);
}

export async function createTempInvite(identity, { displayName = "", ttlHours = 24 * 7 } = {}) {
  const token = generateInviteToken();

  const payload = JSON.stringify({
    v: 1,
    p: identity.pubkeyHex,
    n: displayName || identity.profileName || "Unknown",
  });

  const ciphertext = await aesEncrypt(inviteKey(token), payload);

  const expiresAt = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  const eventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["expiration", String(expiresAt)],
      ["t", `gupt_invite_${token}`],
      ["gupt_invite", ciphertext],
    ],
    content:
      "This private invite was securely shared end-to-end encrypted using Gupt. Protect your privacy at https://github.com/besoeasy/gupt",
  };

  // The ephemeral key is used to sign the event only and is then discarded, so
  // nobody — not even the URL holder — can sign new events as this identity.
  const ephemeral = generateKeypair();
  const event = finalizeEvent(eventTemplate, hexToBytes(ephemeral.privkeyHex));

  // Record which relays ack the publish so the invite URL can carry them; the
  // resolver then finds the event even on relays it has not configured. The
  // acked set is ranked by current score so the URL advertises the inviter's
  // best relays — a relay-exchange bootstrap for the person accepting.
  const targets = getKnownRelays();
  const response = await publishToRelays(targets, event);
  const acked = Object.keys(response).filter((url) => response[url]?.ok);
  const ranking = await getRelayRanking();
  const relays = rankInviteRelays(acked, ranking);

  return {
    inviteToken: token,
    inviteUrl: buildInviteUrl(token, relays),
    relays,
    expiresAt: expiresAt,
  };
}

export async function revokeTempInvite(token, { expiresAt = 0, relays = [] } = {}) {
  const expiration = expiresAt || Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const eventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["expiration", String(expiration)],
      ["t", `gupt_invite_${token}`],
      [REVOKE_TAG, ""],
    ],
    content: "",
  };

  // The tombstone must land on the same relays the invite lives on, otherwise
  // the resolver's "newest wins" logic cannot reject it. Sign with a fresh
  // ephemeral key (then discarded) so the resolving party's identity stays
  // hidden on relays.
  const ephemeral = generateKeypair();
  const event = finalizeEvent(eventTemplate, hexToBytes(ephemeral.privkeyHex));

  await publishToRelays(dedupeRelays([...getKnownRelays(), ...relays]), event);
  return event;
}

export async function openInviteDm(identity, inviteToken, inviteRelays = []) {
  const invite = await resolveTempInvite(inviteToken, inviteRelays);
  if (invite.pubkeyHex === identity.pubkeyHex) {
    throw new Error("This is your own invite link.");
  }

  const { roomId } = await openDmRoom(identity, invite.pubkeyHex);

  void revokeTempInvite(inviteToken, { expiresAt: invite.expiresAt, relays: inviteRelays }).catch(
    () => {},
  );

  return { roomId, pubkeyHex: invite.pubkeyHex, displayName: invite.displayName };
}

export async function resolveTempInvite(rawToken, inviteRelays = []) {
  const token = String(rawToken || "").trim();
  const relays = decodeInviteRelays(inviteRelays);

  if (!token) throw new Error("Invite link is missing its code.");
  if (!TOKEN_RE.test(token)) throw new Error("Invalid invite link format.");
  return resolveTokenInvite(token, relays);
}

async function resolveTokenInvite(token, inviteRelays = []) {
  const events = await queryMany(
    [{ kinds: [1], "#t": [`gupt_invite_${token}`], limit: 10 }],
    QUERY_TIMEOUT_MS,
    inviteRelays,
  );

  const now = Math.floor(Date.now() / 1000);
  const valid = (events || [])
    .filter((e) => !e.tags?.some((t) => t[0] === "expiration" && Number(t[1]) < now))
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

  const event = valid[0];
  if (!event) throw new Error("Invite not found or has expired.");
  if (event.tags?.some((t) => t[0] === REVOKE_TAG)) {
    throw new Error("Invite has already been used.");
  }

  await seedVerifiedInviteRelays(inviteRelays);

  void putRawEvent(event, "invite").catch(() => {});
  try {
    const inviteTag = event.tags.find((t) => t[0] === "gupt_invite");
    if (!inviteTag) throw new Error("missing tag");

    const plaintext = await aesDecrypt(inviteKey(token), inviteTag[1]);
    const payload = JSON.parse(plaintext);

    const expiryTag = event.tags.find((t) => t[0] === "expiration");
    const expiresAt = expiryTag ? Number(expiryTag[1]) : null;

    return {
      pubkeyHex: normalizeNostrPubkey(payload.p),
      displayName: payload.n || "Unknown",
      eventId: event.id,
      expiresAt: expiresAt,
    };
  } catch (err) {
    throw new Error("Failed to decrypt invite.");
  }
}
