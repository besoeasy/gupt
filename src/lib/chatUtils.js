

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
