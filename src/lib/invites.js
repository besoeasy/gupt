import { normalizeNostrPubkey } from "@/lib/crypto";
import { publicAppBaseUrl } from "@/lib/runtime";

export const INVITE_TTL_OPTIONS = [
  { id: "1h", label: "1 hour", hours: 1 },
  { id: "24h", label: "24 hours", hours: 24 },
  { id: "7d", label: "7 days", hours: 24 * 7 },
];

function toUrlSafeBlob(value) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromUrlSafeBlob(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(normalized + pad);
}

export function buildInviteUrl(inviteToken) {
  return `${publicAppBaseUrl()}/#/invite/${encodeURIComponent(inviteToken)}`;
}

export function formatInviteExpiry(expiresAtSec) {
  return "never"; // No longer expires
}

export async function createTempInvite(identity, { displayName = "" } = {}) {
  const payload = JSON.stringify({
    p: identity.pubkeyHex,
    n: displayName || identity.profileName || "Unknown",
  });

  const token = toUrlSafeBlob(payload);

  return {
    inviteToken: token,
    inviteUrl: buildInviteUrl(token),
    expiresAt: null,
  };
}

export async function resolveTempInvite(rawToken) {
  try {
    const json = fromUrlSafeBlob(decodeURIComponent(rawToken));
    const payload = JSON.parse(json);
    if (!payload.p) throw new Error();
    return {
      pubkeyHex: normalizeNostrPubkey(payload.p),
      displayName: payload.n || "Unknown",
    };
  } catch {
    // fallback if the token is just a raw hex pubkey
    const trimmed = String(rawToken || "").trim();
    const hex = normalizeNostrPubkey(trimmed);
    if (hex) {
      return { pubkeyHex: hex, displayName: "Unknown" };
    }
    throw new Error("Invalid invite link.");
  }
}

export async function revokeTempInvite(identity, eventId) {
  // No-op since we don't publish invite events anymore
}
