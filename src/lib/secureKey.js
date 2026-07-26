import * as secp from "@noble/secp256k1";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils.js";
import { getPublicKey } from "./crypto.js";

const SS_PRIVKEY = "gupt_session_privkey";

// 🔒 PRIVATE CLOSURE VARIABLES
let _activePrivKeyBytes = null;
let _activeMode = "ephemeral";
let _nonExtractableCryptoKey = null;

function parseSession() {
  const raw = String(sessionStorage.getItem(SS_PRIVKEY) || "").trim();
  if (!raw || !raw.includes(":")) return { mode: "ephemeral", privkeyHex: "" };

  const parts = raw.split(":");
  const m = parts[0];
  const hex = parts[1]?.toLowerCase();
  if (/^[0-9a-f]{64}$/.test(hex)) {
    return { mode: m || "ephemeral", privkeyHex: hex };
  }

  return { mode: "ephemeral", privkeyHex: "" };
}

/**
 * Loads a private key into non-extractable WebCrypto C++ memory closure and sessionStorage for tab duration.
 * Stores formatted compound value in sessionStorage: "mode:privkeyHex"
 */
export async function setSecureSessionKey(privkeyHex, mode = "ephemeral") {
  const normalized = String(privkeyHex || "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Invalid 64-character hex private key.");
  }

  const bytes = hexToBytes(normalized);
  _activePrivKeyBytes = bytes;
  _activeMode = mode;

  // Import key into browser's native WebCrypto engine with extractable: false
  try {
    _nonExtractableCryptoKey = await crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  } catch {
    _nonExtractableCryptoKey = null;
  }

  // Atomic single sessionStorage entry: "mode:privkeyHex"
  sessionStorage.setItem(SS_PRIVKEY, `${mode}:${normalized}`);

  return getPublicKey(bytes);
}

/**
 * Returns current private key hex from memory closure or sessionStorage.
 */
export function getSecurePrivkey() {
  if (_activePrivKeyBytes) {
    return bytesToHex(_activePrivKeyBytes);
  }
  const { mode, privkeyHex } = parseSession();
  if (privkeyHex) {
    _activePrivKeyBytes = hexToBytes(privkeyHex);
    _activeMode = mode;
    return privkeyHex;
  }
  return "";
}

/**
 * Returns current session mode ('ephemeral' or 'account').
 */
export function getSecureSessionMode() {
  if (_activePrivKeyBytes) {
    return _activeMode;
  }
  const { mode } = parseSession();
  return mode;
}

/**
 * Checks if an active session key exists in memory closure or sessionStorage.
 */
export function hasActiveSession() {
  return !!getSecurePrivkey();
}

/**
 * Wipes key memory completely (Zeroization) and clears sessionStorage.
 */
export function wipeSecureSession() {
  if (_activePrivKeyBytes) {
    _activePrivKeyBytes.fill(0); // Overwrite RAM with zeroes
    _activePrivKeyBytes = null;
  }
  _activeMode = "ephemeral";
  _nonExtractableCryptoKey = null;
  sessionStorage.removeItem(SS_PRIVKEY);
}
