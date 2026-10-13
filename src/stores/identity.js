import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { hexToBytes } from "@noble/hashes/utils.js";
import {
  getPublicKey,
  shortId,
  derivePrivkeyFromBrainFactors,
  derivePrivkeyFromSecret,
  classifyPastedIdentitySecret,
} from "@/lib/crypto";
import { clearAllCaches } from "@/lib/idb";
import { api } from "@/lib/api";
import { enqueueSend } from "@/lib/sendQueue";
import {
  setSecureSessionKey,
  getSecurePrivkey,
  hasActiveSession,
  wipeSecureSession,
} from "@/lib/secureKey";

const LS_PRIVKEY = "gupt_privkey";

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
 * The one saved account, read straight from localStorage so the router can ask
 * before Pinia exists. `localStorage` is the single source of truth: a key that
 * only lives in `sessionStorage` belongs to one tab and must never be adopted,
 * otherwise every tab, window and PWA launch looks like a different account.
 */
export function readStoredPrivkey() {
  try {
    if (typeof localStorage === "undefined") return null;
    return normalizePrivateKey(localStorage.getItem(LS_PRIVKEY));
  } catch {
    return null;
  }
}

/** Synchronous gate used by the router: is this browser allowed to chat? */
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

  // Reads the in-memory/session copy at access time; not a reactive source.
  const privkeyHex = computed(() => getSecurePrivkey());

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

    // Persist before awaiting anything, so a tab closed mid-load still has it.
    localStorage.setItem(LS_PRIVKEY, normalized);

    // Mirror into this tab's session + memory so reloads skip the KDF work.
    const derivedPubkey = await setSecureSessionKey(normalized, "account");
    pubkeyHex.value = derivedPubkey;

    return { privkeyHex: normalized, pubkeyHex: derivedPubkey };
  }

  let initPromise = null;

  async function runInit() {
    const stored = readStoredPrivkey();
    if (!stored) {
      // No account on this browser. A leftover session-only key (pre-account
      // guest) is deliberately left on disk so it can be recovered by pasting
      // it, but it is never adopted as the active identity.
      pubkeyHex.value = "";
      return;
    }

    if (hasActiveSession() && getSecurePrivkey() === stored) {
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

  function exportBackup() {
    if (!isReady.value) throw new Error("No account is loaded.");
    return {
      version: 1,
      app: "gupt",
      createdAt: new Date().toISOString(),
      privkeyHex: getSecurePrivkey(),
      pubkeyHex: pubkeyHex.value,
    };
  }

  async function restorePrivateKey(value) {
    const classified = classifyPastedIdentitySecret(value);
    if (classified.kind === "empty") {
      throw new Error("Paste a private key, backup, or any secret first.");
    }
    if (classified.kind === "invalid-backup") {
      throw new Error(
        "Backup must be a 64-character hex private key or a valid Gupt backup JSON file.",
      );
    }
    if (classified.kind === "hex") {
      return persistIdentity(classified.value);
    }
    return persistIdentity(derivePrivkeyFromSecret(classified.value));
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
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(LS_PRIVKEY);
    } catch {}
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
    exportBackup,
    restorePrivateKey,
    deriveIdentity,
    forgetAccount,
    loadProfile,
    saveProfile,
    saveStatus,
  };
});
