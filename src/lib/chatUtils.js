import { dmRoomId, normalizeNostrPubkey } from "@/lib/crypto";
import { putRoomMeta } from "@/lib/idb";

/**
 * Practical soft cap for a single DM text body.
 *
 * Nostr event `content` is the encrypted payload: JSON-wrapped, AES-GCM sealed
 * (16-byte auth tag), then base64 (~1.33x expansion) with a `v1:nonce:` prefix.
 * Relays typically accept up to ~64KB of content, so the raw text limit is
 * comfortably in the tens of thousands of chars — but a message that long is
 * bad UX and risks relay-specific rejection. 8K is a generous "please split"
 * nudge that no real conversation hits.
 */
export const MAX_DM_TEXT_CHARS = 8000;

export async function openDmRoom(identity, peerPubkey, label = "") {
  const normalized = normalizeNostrPubkey(peerPubkey);
  if (!normalized) throw new Error("Invalid public key");
  const roomId = await dmRoomId(identity.pubkeyHex, normalized);
  const patch = { peerPubkey: normalized };
  if (label) patch.name = label;
  await putRoomMeta(roomId, patch);
  return { roomId };
}

export function formatTime(ts) {
  const time = Number(ts);
  if (!Number.isFinite(time) || time <= 0) return "";
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function finiteDurationSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.floor(seconds);
}

export function formatDuration(totalSeconds) {
  const seconds = finiteDurationSeconds(totalSeconds);
  if (seconds === null) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

export function bytesToBase64(bytes) {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return btoa(out);
}

export function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export function isImage(mime) {
  return typeof mime === "string" && mime.startsWith("image/");
}

export function isVideo(mime) {
  return typeof mime === "string" && mime.startsWith("video/");
}

export function isAudio(mime) {
  return typeof mime === "string" && mime.startsWith("audio/");
}

export function getFileLabel(message) {
  return (
    message?.media?.name || message.text || (message.type === "voice" ? "Voice note" : "Attachment")
  );
}

export function buildReplyMeta(replyingTo) {
  if (!replyingTo) return {};
  return {
    replyTo: replyingTo.id,
    replyExcerpt: getFileLabel(replyingTo) || replyingTo.text?.slice(0, 40) || "",
  };
}

/**
 * Returns true for any message that carries an encrypted media attachment.
 * Use this instead of sprinkling `type === "media"` checks everywhere.
 *
 * IPFS (cid) shares type "media",
 * always together in the same unified message object.
 *
 * @param {{ type?: string } | null | undefined} row
 * @returns {boolean}
 */
export function isMediaMessage(row) {
  return row?.type === "media";
}

export function isVoiceOrMedia(row) {
  return row?.type === "voice" || isMediaMessage(row);
}
