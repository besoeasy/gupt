import { defineStore } from "pinia";
import { ref, computed, onScopeDispose } from "vue";
import { hexToBytes } from "@noble/hashes/utils.js";
import {
  getPublicKey,
  shortId,
  derivePrivkeyFromBrainFactors,
  derivePrivkeyFromSecret,
} from "@/lib/crypto";
import { clearAllCaches } from "@/lib/idb";
import { api } from "@/lib/api";
import { enqueueSend } from "@/lib/sendQueue";
import {
  setSecureSessionKey,
  getSecurePrivkey,
  getSecureSessionMode,
  onSecureSessionChange,
  wipeSecureSession,
} from "@/lib/secureKey";

const SS_PROFILE_NAME = "gupt_profile_name";
const SS_PROFILE_ABOUT = "gupt_profile_about";
const SS_PROFILE_PICTURE = "gupt_profile_picture";
const SS_PROFILE_WEBSITE = "gupt_profile_website";
const SS_PROFILE_STATUS = "gupt_profile_status";

function getSS(key) {
  if (typeof sessionStorage === "undefined") return "";
  return sessionStorage.getItem(key) ?? "";
}

function setSS(key, value) {
  if (typeof sessionStorage === "undefined") return;
  if (value) sessionStorage.setItem(key, value);
  else sessionStorage.removeItem(key);
}

function normalizePrivateKey(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

/**
 * The one saved account for this tab, read straight from sessionStorage so the
 * router can ask before Pinia exists. `sessionStorage` is the single source of
 * truth and `secureKey.js` owns the key's format: `mode:privkeyHex`. Only the
 * "account" mode counts here; an `ephemeral` mode key is a pre-account guest
 * and is never adopted as an identity.
 */
export function readStoredPrivkey() {
  try {
    const hex = getSecurePrivkey();
    return getSecureSessionMode() === "account" ? normalizePrivateKey(hex) : null;
  } catch {
    return null;
  }
}

/** Synchronous gate used by the router: is this tab allowed to chat? */
export function hasStoredAccount() {
  return Boolean(readStoredPrivkey());
}

function clearProfileSessionFields() {
  setSS(SS_PROFILE_NAME, "");
  setSS(SS_PROFILE_ABOUT, "");
  setSS(SS_PROFILE_PICTURE, "");
  setSS(SS_PROFILE_WEBSITE, "");
  setSS(SS_PROFILE_STATUS, "");
}

export const useIdentityStore = defineStore("identity", () => {
  const pubkeyHex = ref("");

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
   * store (appReset.js), so this ref cannot drift from the real session.
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
  const mode = computed(() => (isReady.value ? "account" : "none"));

  const profileName = ref(getSS(SS_PROFILE_NAME));
  const profileAbout = ref(getSS(SS_PROFILE_ABOUT));
  const profilePicture = ref(getSS(SS_PROFILE_PICTURE));
  const profileWebsite = ref(getSS(SS_PROFILE_WEBSITE));
  const profileStatus = ref(getSS(SS_PROFILE_STATUS));
  const fingerprint = computed(() => (pubkeyHex.value ? shortId(pubkeyHex.value) : "—"));

  async function persistIdentity(nextPrivkeyHex) {
    const normalized = normalizePrivateKey(nextPrivkeyHex);
    if (!normalized) throw new Error("Enter a valid 64-character hex private key.");

    const currentPrivkey = getSecurePrivkey();
    const isSwitch = Boolean(currentPrivkey) && currentPrivkey !== normalized;

    if (isSwitch) {
      // Clear all cached data belonging to the previous identity.
      await clearAllCaches();
      profileName.value = "";
      profileAbout.value = "";
      profilePicture.value = "";
      profileWebsite.value = "";
      profileStatus.value = "";
      clearProfileSessionFields();
    }

    // The session write inside setSecureSessionKey is synchronous, so a tab
    // closed mid-load still has the key this tab is allowed to resume.

    // Mirror into this tab's session + memory so reloads skip the KDF work.
    const derivedPubkey = await setSecureSessionKey(normalized, "account");
    pubkeyHex.value = derivedPubkey;

    return { privkeyHex: normalized, pubkeyHex: derivedPubkey };
  }

  /** One-time cleanup: pre-session-only builds kept the key in localStorage. */
  function discardLegacyStoredPrivkey() {
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem("gupt_privkey");
    } catch {}
  }

  let initPromise = null;

  async function runInit() {
    discardLegacyStoredPrivkey();

    const stored = readStoredPrivkey();
    if (!stored) {
      // No account in this tab. Anything in localStorage belongs to nothing:
      // the account is session-only now, so re-entry needs memory anchors or a
      // pasted secret.
      pubkeyHex.value = "";
      return;
    }

    if (getSecurePrivkey() === stored) {
      // The memory closure already holds this tab's key; skip re-persisting.
      pubkeyHex.value = getPublicKey(hexToBytes(stored));
      return;
    }

    await persistIdentity(stored);
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
   * User-facing entry point on /welcome: anything they type is hashed once.
   * There is no raw-key path — Gupt never exports keys, so nothing pasted here
   * can be assumed to already be one.
   */
  async function createFromSecret(secret) {
    if (!String(secret || "").trim()) {
      throw new Error("Paste a secret first.");
    }
    return persistIdentity(derivePrivkeyFromSecret(secret));
  }

  /**
   * Re-pin the key this browser already holds. Never hashes — it must land on
   * the exact same account, which is what "clear cache, keep my keys" needs.
   */
  async function repinAccount(privkeyHex) {
    return persistIdentity(privkeyHex);
  }

  async function deriveIdentity(factors) {
    return persistIdentity(derivePrivkeyFromBrainFactors(factors));
  }

  /** Drop the account from this browser entirely and return to /welcome. */
  function forgetAccount() {
    wipeSecureSession();
    initPromise = null;
    pubkeyHex.value = "";
    profileName.value = "";
    profileAbout.value = "";
    profilePicture.value = "";
    profileWebsite.value = "";
    profileStatus.value = "";
    clearProfileSessionFields();
  }

  async function loadProfile() {
    if (!pubkeyHex.value) return;
    try {
      const profile = await api.fetchProfile(pubkeyHex.value);
      if (!profile) return;
      if (typeof profile.name === "string" && profile.name.trim()) {
        profileName.value = profile.name.trim();
        setSS(SS_PROFILE_NAME, profileName.value);
      }
      if (typeof profile.about === "string") {
        profileAbout.value = profile.about.trim();
        setSS(SS_PROFILE_ABOUT, profileAbout.value);
      }
      if (typeof profile.picture === "string") {
        profilePicture.value = profile.picture.trim();
        setSS(SS_PROFILE_PICTURE, profilePicture.value);
      }
      if (typeof profile.website === "string") {
        profileWebsite.value = profile.website.trim();
        setSS(SS_PROFILE_WEBSITE, profileWebsite.value);
      }
      if (typeof profile.status === "string") {
        profileStatus.value = profile.status.trim();
        setSS(SS_PROFILE_STATUS, profileStatus.value);
      }
    } catch {}
  }

  function assertReady() {
    if (!isReady.value) throw new Error("No account is loaded. Open /welcome to restore one.");
  }

  async function saveProfile({ name, about, picture, website } = {}) {
    assertReady();
    const fields = {};
    if (typeof name === "string") {
      const n = name.trim();
      if (!n) throw new Error("Name cannot be empty.");
      fields.name = n;
    }
    if (typeof about === "string") fields.about = about.trim();
    if (typeof picture === "string") fields.picture = picture.trim();
    if (typeof website === "string") fields.website = website.trim();

    if (fields.name !== undefined) {
      profileName.value = fields.name;
      setSS(SS_PROFILE_NAME, fields.name);
    }
    if (fields.about !== undefined) {
      profileAbout.value = fields.about;
      setSS(SS_PROFILE_ABOUT, fields.about);
    }
    if (fields.picture !== undefined) {
      profilePicture.value = fields.picture;
      setSS(SS_PROFILE_PICTURE, fields.picture);
    }
    if (fields.website !== undefined) {
      profileWebsite.value = fields.website;
      setSS(SS_PROFILE_WEBSITE, fields.website);
    }

    const privkey = getSecurePrivkey();
    const pubkey = pubkeyHex.value;
    const snapshot = { ...fields };
    enqueueSend({
      id: `profile:${pubkey}:${Date.now()}`,
      meta: { kind: "profile", conversationId: `profile:${pubkey}` },
      fn: () => api.publishProfile(privkey, snapshot),
      onFailed() {},
    });
  }

  async function saveStatus(statusText) {
    assertReady();
    const text = String(statusText ?? "")
      .trim()
      .slice(0, 150);
    profileStatus.value = text;
    setSS(SS_PROFILE_STATUS, text);

    const privkey = getSecurePrivkey();
    const pubkey = pubkeyHex.value;
    const snapshot = {
      name: profileName.value,
      about: profileAbout.value,
      picture: profilePicture.value,
      website: profileWebsite.value,
      status: text,
    };
    enqueueSend({
      id: `profile:${pubkey}:status:${Date.now()}`,
      meta: { kind: "profile", conversationId: `profile:${pubkey}` },
      fn: () => api.publishProfile(privkey, snapshot),
      onFailed() {},
    });
  }

  return {
    privkeyHex,
    pubkeyHex,
    isReady,
    mode,
    profileName,
    profileAbout,
    profilePicture,
    profileWebsite,
    profileStatus,
    fingerprint,
    init,
    createFromSecret,
    repinAccount,
    deriveIdentity,
    forgetAccount,
    loadProfile,
    saveProfile,
    saveStatus,
  };
});
