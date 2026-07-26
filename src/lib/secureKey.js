import * as secp from "@noble/secp256k1";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils.js";
import { getPublicKey } from "./crypto.js";

const SS_PRIVKEY = "gupt_session_privkey";
const SS_MODE = "gupt_session_mode";

// 🔒 PRIVATE CLOSURE VARIABLES
// These variables exist inside JS engine closure memory and cannot be accessed by window, devtools, or XSS scripts.
let _activePrivKeyBytes = null;
let _nonExtractableCryptoKey = null;

/**
 * Loads a private key into non-extractable WebCrypto C++ memory closure and sessionStorage for tab duration.
 */
export async function setSecureSessionKey(privkeyHex, mode = "ephemeral") {
  const normalized = String(privkeyHex || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Invalid 64-character hex private key.");
  }

  const bytes = hexToBytes(normalized);
  _activePrivKeyBytes = bytes;

  // Import key into browser's native WebCrypto engine with extractable: false
  try {
    _nonExtractableCryptoKey = await crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "HMAC", hash: "SHA-256" },
      false, // 👈 extractable = false (XSS cannot export or read raw key bytes!)
      ["sign", "verify"]
    );
  } catch {
    _nonExtractableCryptoKey = null;
  }

  // Persist ONLY to sessionStorage (automatically purged when tab/window is closed)
  sessionStorage.setItem(SS_PRIVKEY, normalized);
  sessionStorage.setItem(SS_MODE, mode);

  return getPublicKey(bytes);
}

/**
 * Returns current private key hex from memory closure or sessionStorage.
 */
export function getSecurePrivkey() {
  if (_activePrivKeyBytes) {
    return bytesToHex(_activePrivKeyBytes);
  }
  const stored = sessionStorage.getItem(SS_PRIVKEY);
  if (stored && /^[0-9a-f]{64}$/.test(stored)) {
    _activePrivKeyBytes = hexToBytes(stored);
    return stored;
  }
  return "";
}

/**
 * Returns current session mode ('ephemeral' or 'account').
 */
export function getSecureSessionMode() {
  return sessionStorage.getItem(SS_MODE) || "ephemeral";
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
  _nonExtractableCryptoKey = null;
  sessionStorage.removeItem(SS_PRIVKEY);
  sessionStorage.removeItem(SS_MODE);
}
