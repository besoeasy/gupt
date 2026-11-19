import { hexToBytes, bytesToHex } from "@noble/hashes/utils.js";
import { getPublicKey } from "./crypto.js";

/**
 * The unlocked account key, held in memory only.
 *
 * Nothing is persisted here: `src/lib/keyVault.js` owns the one copy at rest,
 * wrapped by a non-extractable browser key, and this module holds the plaintext
 * bytes for as long as the page lives. That split is deliberate — the old
 * per-tab session mirror was a second, plaintext copy on disk, and it survived
 * more than "the tab session" (browser session restore brings it back), so it
 * never matched the promise the UI made.
 *
 * The key is module-scope on purpose, which also makes it invisible to Vue: a
 * `computed(() => getSecurePrivkey())` registers no reactive dependency, so Vue
 * caches the first value forever. Anything that needs to observe the key
 * subscribes through `onSecureSessionChange` and mirrors it into its own state.
 * Kept dependency-free so this module stays plain JS.
 */

// 🔒 PRIVATE CLOSURE VARIABLES
let _activePrivKeyBytes = null;

const sessionListeners = new Set();

/** Subscribe to session key changes. Returns an unsubscribe function. */
export function onSecureSessionChange(listener) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function notifySessionChange() {
  for (const listener of [...sessionListeners]) {
    try {
      listener(getSecurePrivkey());
    } catch {
      // A failing subscriber must never break key handling.
    }
  }
}

/**
 * Puts a validated private key into memory for the life of this page and
 * returns the derived public key.
 */
export async function setSecureSessionKey(privkeyHex) {
  const normalized = String(privkeyHex || "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Invalid 64-character hex private key.");
  }

  const bytes = hexToBytes(normalized);
  if (_activePrivKeyBytes) _activePrivKeyBytes.fill(0);
  _activePrivKeyBytes = bytes;

  notifySessionChange();

  return getPublicKey(bytes);
}

/** Current private key hex, or "" when this page holds no account. */
export function getSecurePrivkey() {
  if (!_activePrivKeyBytes) return "";
  return bytesToHex(_activePrivKeyBytes);
}

/** True when a key is loaded in this page's memory. */
export function hasActiveSession() {
  return Boolean(_activePrivKeyBytes);
}

/**
 * Wipes the key from memory (zeroization). The vault at rest is deleted
 * separately, by `keyVault.forget()`, so a locked page does not decide the
 * fate of the remembered device.
 */
export function wipeSecureSession() {
  if (_activePrivKeyBytes) {
    _activePrivKeyBytes.fill(0); // Overwrite RAM with zeroes
    _activePrivKeyBytes = null;
  }
  notifySessionChange();
}
