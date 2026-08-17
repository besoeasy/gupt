import { sha256 } from "@noble/hashes/sha2.js";

export const SAS_EMOJIS = [
  "🐶",
  "🐱",
  "🦊",
  "🐻",
  "🐼",
  "🦁",
  "🦄",
  "🐝",
  "🦋",
  "🌺",
  "🌻",
  "🌲",
  "🍎",
  "🍓",
  "🍕",
  "🍔",
  "⚽",
  "🏀",
  "🚗",
  "🚀",
  "⛵",
  "✈️",
  "💡",
  "🔒",
  "🔑",
  "💎",
  "⚡",
  "🔥",
  "🌈",
  "☀️",
  "🌙",
  "⭐",
  "🎵",
  "🎨",
  "🏆",
  "👑",
  "⚓",
  "🛸",
  "🎸",
  "🎯",
  "🎲",
  "🔮",
  "🎩",
  "🍪",
  "🍩",
  "🍿",
  "🥑",
  "🍉",
  "🌴",
  "🌵",
  "🍁",
  "🍄",
  "🐬",
  "🦉",
  "🐢",
  "🐘",
  "🚴",
  "⛷️",
  "🏄",
  "🏹",
  "🔔",
  "🎁",
  "🔭",
  "🛡️",
];

/**
 * Extract normalized SHA-256 fingerprint string from WebRTC SDP.
 * e.g. "a=fingerprint:sha-256 3B:7D:9A:..." -> "sha-256:3b:7d:9a:..."
 */
export function extractSdpFingerprint(sdp) {
  if (!sdp || typeof sdp !== "string") return "";
  const match = sdp.match(/a=fingerprint:(sha-256\s+[0-9A-Fa-f:]+)/i);
  if (!match) return "";
  return match[1].toLowerCase().replace(/\s+/g, ":");
}

/**
 * Compute symmetric Short Authentication String (SAS) for a call session.
 * Produces 4 verification emojis and a 4-digit code.
 *
 * @param {string} localSdp - Local session description SDP
 * @param {string} remoteSdp - Remote session description SDP
 * @param {string} callId - Call session identifier
 * @returns {{ emojis: string[], code: string, rawHashHex: string } | null}
 */
export function computeCallSas(localSdp, remoteSdp, callId = "") {
  const fp1 = extractSdpFingerprint(localSdp);
  const fp2 = extractSdpFingerprint(remoteSdp);
  if (!fp1 || !fp2) return null;

  const sorted = [fp1, fp2].sort().join("|") + `|${String(callId || "").trim()}`;
  const digest = sha256(new TextEncoder().encode(sorted));

  const emojis = [
    SAS_EMOJIS[digest[0] % SAS_EMOJIS.length],
    SAS_EMOJIS[digest[1] % SAS_EMOJIS.length],
    SAS_EMOJIS[digest[2] % SAS_EMOJIS.length],
    SAS_EMOJIS[digest[3] % SAS_EMOJIS.length],
  ];

  const num = ((digest[4] << 8) | digest[5]) % 10000;
  const code = String(num).padStart(4, "0");

  let rawHashHex = "";
  for (let i = 0; i < 4; i++) {
    rawHashHex += digest[i].toString(16).padStart(2, "0");
  }

  return { emojis, code, rawHashHex };
}
