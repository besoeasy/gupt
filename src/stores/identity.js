import { defineStore } from "pinia";
import { ref, computed, onScopeDispose } from "vue";
import { shortId, derivePrivkeyFromSecretAndPin } from "@/lib/crypto";
import { ensureDbOwner } from "@/lib/idb";
import { api } from "@/lib/api";
import { requestEngineSync } from "@/lib/engine";
import { wipeAllCachesForFreshLogin } from "@/lib/cacheWipe";
import * as keyVault from "@/lib/keyVault";
import {
  setSecureSessionKey,
  getSecurePrivkey,
  hasActiveSession,
  onSecureSessionChange,
  wipeSecureSession,
} from "@/lib/secureKey";

function normalizePrivateKey(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

/**
 * Synchronous gate used by the router: is this page allowed to chat?
 *
 * The key is memory-only now, so this only answers after `init()` has resolved
 * — the router awaits it before asking. Anything that signs still checks the
 * store's `isReady`, which is the same fact plus the public key.
 */
export function hasStoredAccount() {
  return hasActiveSession();
}

export const useIdentityStore = defineStore("identity", () => {
  const pubkeyHex = ref("");
  // True once this page's account came from the device vault (or was saved to
  // it). Only then does the 30-hour window apply: a page that logged in on
  // plain HTTP has nothing stored to expire.
  const vaultBacked = ref(false);

  /**
   * The private key, mirrored into reactive state.
   *
   * This used to be `computed(() => getSecurePrivkey())`, which can never work:
   * the key lives in a module-scope closure, so the computed registered no
   * reactive dependency, Vue cached the first value it ever returned, and every
   * later sign-in or wipe was invisible. `isReady` stayed false and the navbar
   * kept offering "Account" until a reload recreated the store.
   *
   * The subscription below is the reactive half: it fires from every
   * setSecureSessionKey/wipeSecureSession, including the ones made outside this
   * store (appReset.js, the 30-hour expiry), so this ref cannot drift.
   */
  const privkeyHex = ref(getSecurePrivkey());
  // Pinia runs this setup in its own effect scope, so the subscription dies
  // with the store instead of piling up under HMR.
  onScopeDispose(
    onSecureSessionChange((hex) => {
      privkeyHex.value = hex;
    }),
  );

  /** True only when a real account is loaded. Every send path must check this. */
  const isReady = computed(() => Boolean(pubkeyHex.value && privkeyHex.value));

  const profileName = ref("");
  const profileAbout = ref("");
  const profileWebsite = ref("");
  const profileStatus = ref("");
  const fingerprint = computed(() => (pubkeyHex.value ? shortId(pubkeyHex.value) : "—"));

  function resetProfileFields() {
    profileName.value = "";
    profileAbout.value = "";
    profileWebsite.value = "";
    profileStatus.value = "";
  }

  async function persistIdentity(nextPrivkeyHex, { isLogin = false } = {}) {
    const normalized = normalizePrivateKey(nextPrivkeyHex);
    if (!normalized) throw new Error("Enter a valid 64-character hex private key.");

    const currentPrivkey = getSecurePrivkey();
    const isSwitch = Boolean(currentPrivkey) && currentPrivkey !== normalized;
    const isFresh = isLogin || isSwitch;

    if (isFresh) {
      // Completely wipe all caches (in-memory, IndexedDB, localStorage, browser cacheStorage)
      // to guarantee starting 100% fresh from decentralized Rabta relays on every login or account switch.
      await wipeAllCachesForFreshLogin();
      resetProfileFields();
    }

    // Mirror into this page's memory so reloads within the session skip the KDF work.
    const derivedPubkey = await setSecureSessionKey(normalized);
    await ensureDbOwner(derivedPubkey, { wipe: isFresh });
    pubkeyHex.value = derivedPubkey;

    // Remember this device where the platform allows an unextractable wrapper
    // key. Over plain HTTP `crypto.subtle` is missing, so this is a no-op and
    // the next load asks for the secret again — by design.
    vaultBacked.value = await keyVault.save(normalized, derivedPubkey);

    return { privkeyHex: normalized, pubkeyHex: derivedPubkey };
  }

  let initPromise = null;

  async function runInit() {
    // The vault is the account on this device. Nothing else can restore it:
    // secret/file + PIN is the only other path, and that is a user action.
    const restored = await keyVault.open();
    if (!restored) {
      pubkeyHex.value = "";
      vaultBacked.value = false;
      return;
    }

    const derivedPubkey = await setSecureSessionKey(restored.privkeyHex);
    restored.privkeyHex = "";

    if (derivedPubkey !== restored.pubkeyHex) {
      // Fail closed: a record that does not derive to its own public key is
      // not this account, so drop it instead of half-restoring an identity.
      await keyVault.forget();
      wipeSecureSession();
      pubkeyHex.value = "";
      vaultBacked.value = false;
      return;
    }

    pubkeyHex.value = derivedPubkey;
    vaultBacked.value = true;
    // Still enforce ownership: the database could predate the stamp or belong
    // to an identity that signed in during another session.
    await ensureDbOwner(derivedPubkey);
  }

  /** Idempotent: callers may await it from any view without racing each other. */
  function init() {
    if (!initPromise) {
      initPromise = runInit().catch((err) => {
        initPromise = null;
        throw err;
      });
    }
    return initPromise;
  }

  /**
   * User-facing entry point on /welcome: a pasted secret or a secret-file
   * hash, hardened with a PIN of at least 6 letters or digits. The PIN is
   * mandatory — without it a leaked secret alone would reproduce the key.
   * There is no raw-key path — Gupt never exports keys, so nothing entered
   * here can be assumed to already be one.
   */
  async function createFromSecret(secret, pin) {
    return persistIdentity(derivePrivkeyFromSecretAndPin(secret, pin), { isLogin: true });
  }

  /**
   * Re-pin the key this browser already holds. Never hashes — it must land on
   * the exact same account, which is what "clear cache, keep my keys" needs.
   */
  async function repinAccount(privkeyHex) {
    return persistIdentity(privkeyHex, { isLogin: false });
  }

  /** Drop the account from this browser entirely and return to /welcome. */
  async function forgetAccount() {
    wipeSecureSession();
    await keyVault.forget();
    vaultBacked.value = false;
    initPromise = null;
    pubkeyHex.value = "";
    resetProfileFields();
  }

  /**
   * Stops remembering this device without logging out: the vault and its
   * wrapped key are deleted, the page keeps working from memory, and the next
   * load asks for the secret again. The account is untouched on relays.
   */
  async function forgetDevice() {
    await keyVault.forget();
    vaultBacked.value = false;
  }

  /**
   * Refreshes the vault's inactivity timestamp. Called when the page is hidden,
   * so a browsed-then-backgrounded app is not treated as "not opened". The
   * write itself is throttled inside keyVault.
   */
  async function touchVault() {
    if (!vaultBacked.value) return;
    await keyVault.touch();
  }

  /**
   * Re-checks the 30-hour window when the app becomes visible again: a tab left
   * open for days is not an opened account. Returns false when this page must
   * go back to /welcome, after locking the key in memory.
   *
   * Note this is policy, not authentication — the system clock is the user's.
   */
  async function validateVault() {
    if (!vaultBacked.value || !keyVault.isSupported()) return true;

    const record = await keyVault.open();
    if (record && record.pubkeyHex === pubkeyHex.value) return true;

    // Expired, deleted, or a different account: lock this page only. The
    // account itself lives on relays and is recoverable with secret + PIN.
    wipeSecureSession();
    vaultBacked.value = false;
    initPromise = null;
    pubkeyHex.value = "";
    resetProfileFields();
    return false;
  }

  function applyProfile(profile) {
    if (!profile) return;
    if (typeof profile.name === "string" && profile.name.trim()) {
      profileName.value = profile.name.trim();
    }
    if (typeof profile.about === "string") {
      profileAbout.value = profile.about.trim();
    }
    if (typeof profile.website === "string") {
      profileWebsite.value = profile.website.trim();
    }
    if (typeof profile.status === "string") {
      profileStatus.value = profile.status.trim();
    }
  }

  async function loadProfile() {
    if (!pubkeyHex.value) return;
    try {
      let profile = await api.getLocalProfile(pubkeyHex.value);
      if (!profile) {
        await requestEngineSync({ timeoutMs: 6000 }).catch(() => false);
        profile = await api.getLocalProfile(pubkeyHex.value);
      }
      applyProfile(profile);
    } catch {}
  }

  function assertReady() {
    if (!isReady.value) throw new Error("No account is loaded. Open /welcome to restore one.");
  }

  async function saveProfile({ name, about, website } = {}) {
    assertReady();
    const fields = {};
    if (typeof name === "string") {
      const n = name.trim();
      if (!n) throw new Error("Name cannot be empty.");
      fields.name = n;
    }
    if (typeof about === "string") fields.about = about.trim();
    if (typeof website === "string") fields.website = website.trim();

    if (fields.name !== undefined) profileName.value = fields.name;
    if (fields.about !== undefined) profileAbout.value = fields.about;
    if (fields.website !== undefined) profileWebsite.value = fields.website;

    const privkey = getSecurePrivkey();
    await api.publishProfile(privkey, { ...fields });
  }

  async function saveStatus(statusText) {
    assertReady();
    const text = String(statusText ?? "")
      .trim()
      .slice(0, 150);
    profileStatus.value = text;

    const privkey = getSecurePrivkey();
    await api.publishProfile(privkey, {
      name: profileName.value,
      about: profileAbout.value,
      website: profileWebsite.value,
      status: text,
    });
  }

  return {
    privkeyHex,
    pubkeyHex,
    isReady,
    profileName,
    profileAbout,
    profileWebsite,
    profileStatus,
    fingerprint,
    init,
    createFromSecret,
    repinAccount,
    forgetAccount,
    forgetDevice,
    remembersDevice: computed(() => vaultBacked.value),
    touchVault,
    validateVault,
    loadProfile,
    saveProfile,
    saveStatus,
  };
});
