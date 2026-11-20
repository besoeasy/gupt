import { normalizePubkey } from "../crypto.js";

/**
 * QR payloads are transport, not a new format: a permanent invite is the same
 * `#/chat/new?key=` link the app already deep-links, and a temporary invite is
 * the `match:lobby:` string the user would otherwise paste. Nothing here may
 * grow a field a camera-less client cannot read.
 */

export const CHAT_NEW_PATH = "#/chat/new";
const MAX_PAYLOAD_LENGTH = 2048;

/** The link a system camera can open; it lands on the new-chat screen. */
export function permanentInviteUrl(origin, pubkey) {
  const key = normalizePubkey(pubkey);
  if (!key) throw new Error("A public key is required to draw this QR code.");
  const base = String(origin || "").replace(/\/+$/, "");
  return `${base}/#/chat/new?key=${key}`;
}

/** The string a temporary lobby shows as a QR code. */
export function lobbyQrPayload(code) {
  const text = String(code || "").trim();
  return text.startsWith("match:lobby:") ? text : "";
}

/**
 * Read a scanned code. Only the three shapes this app writes are accepted:
 * a match lobby, a bare public key, or a same-origin link to the new-chat
 * screen. A QR code from a poster must not be able to send the app anywhere.
 *
 * @param {string} raw
 * @param {string} [origin] this deployment's origin, usually `location.origin`
 * @returns {{kind: "lobby", code: string}
 *   | {kind: "key", key: string, url?: string}
 *   | {kind: "domain", domain: string, url?: string}
 *   | null}
 */
export function parseQrPayload(raw, origin = "") {
  const text = String(raw || "").trim();
  if (!text || text.length > MAX_PAYLOAD_LENGTH) return null;

  if (text.toLowerCase().startsWith("match:lobby:")) {
    return { kind: "lobby", code: text };
  }

  const key = normalizePubkey(text);
  if (key) return { kind: "key", key };

  if (!/^https?:\/\//i.test(text)) return null;

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!origin || url.origin !== origin) return null;

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : "";
  const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const hashPath = hash.split("?")[0].replace(/\/+$/, "");
  if (hashPath === "/chat/new" || hashPath === "chat/new") {
    const params = new URLSearchParams(hashQuery);
    const hashKey = normalizePubkey(params.get("key") || "");
    if (hashKey) return { kind: "key", key: hashKey, url: text };
    const hashDomain = (params.get("domain") || "").trim().toLowerCase();
    if (hashDomain) return { kind: "domain", domain: hashDomain, url: text };
  }

  if (/^\/chat\/new\/?$/.test(url.pathname)) {
    const queryKey = normalizePubkey(url.searchParams.get("key") || "");
    if (queryKey) return { kind: "key", key: queryKey, url: text };
    const queryDomain = (url.searchParams.get("domain") || "").trim().toLowerCase();
    if (queryDomain) return { kind: "domain", domain: queryDomain, url: text };
  }

  return null;
}
