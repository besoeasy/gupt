import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  generateKeypair,
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
  getSecureSessionMode,
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

export const useIdentityStore = defineStore("identity", () => {
  const pubkeyHex = ref("");
  const mode = ref("ephemeral"); // 'ephemeral' or 'account'

  // Computed getter to access the active key from memory/session closure
  const privkeyHex = computed(() => getSecurePrivkey());

  const profileName = ref(getSS(SS_PROFILE_NAME));
  const profileAbout = ref(getSS(SS_PROFILE_ABOUT));
  const profilePicture = ref(getSS(SS_PROFILE_PICTURE));
  const profileWebsite = ref(getSS(SS_PROFILE_WEBSITE));
  const profileStatus = ref(getSS(SS_PROFILE_STATUS));
  const fingerprint = computed(() => (pubkeyHex.value ? shortId(pubkeyHex.value) : "—"));

  async function persistIdentity(nextPrivkeyHex, targetMode = "account") {
    const normalized = normalizePrivateKey(nextPrivkeyHex);
    if (!normalized) throw new Error("Enter a valid 64-character hex private key.");

    const currentPrivkey = getSecurePrivkey();
    const isSwitch = currentPrivkey && currentPrivkey !== normalized;

    if (isSwitch) {
      // Clear all cached data belonging to the previous identity.
      await clearAllCaches();
      profileName.value = "";
      profileAbout.value = "";
      profilePicture.value = "";
      profileWebsite.value = "";
      profileStatus.value = "";
      setSS(SS_PROFILE_NAME, "");
      setSS(SS_PROFILE_ABOUT, "");
      setSS(SS_PROFILE_PICTURE, "");
      setSS(SS_PROFILE_WEBSITE, "");
      setSS(SS_PROFILE_STATUS, "");
    }

    // Load key into WebCrypto memory & sessionStorage for active tab
    const derivedPubkey = await setSecureSessionKey(normalized, targetMode);
    pubkeyHex.value = derivedPubkey;
    mode.value = targetMode;

    if (targetMode === "account") {
      // Permanent Account: Save ONLY the private key to localStorage for seamless auto-login
      localStorage.setItem(LS_PRIVKEY, normalized);
    } else {
      // Ephemeral Guest: Keep ONLY in sessionStorage (cleared on tab/browser close)
      localStorage.removeItem(LS_PRIVKEY);
    }

    return { privkeyHex: normalized, pubkeyHex: derivedPubkey };
  }

  async function init() {
    // 1. Check for active session key in sessionStorage (e.g. page refresh F5)
    if (hasActiveSession()) {
      const activeKey = getSecurePrivkey();
      const activeMode = getSecureSessionMode();
      await setSecureSessionKey(activeKey, activeMode);
      pubkeyHex.value = (await import("@/lib/crypto")).getPublicKey(
        (await import("@noble/hashes/utils.js")).hexToBytes(activeKey),
      );
      mode.value = activeMode;
      return;
    }

    // 2. Check for saved permanent account in localStorage
    const savedAccountKey = localStorage.getItem(LS_PRIVKEY);
    if (savedAccountKey && normalizePrivateKey(savedAccountKey)) {
      await persistIdentity(savedAccountKey, "account");
      return;
    }

    // 3. Brand new tab / window with no account -> Create Ephemeral Guest Session (Zero disk footprint)
    const kp = generateKeypair();
    await persistIdentity(kp.privkeyHex, "ephemeral");
  }

  function exportBackup() {
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
      return persistIdentity(classified.value, "account");
    }
    return persistIdentity(derivePrivkeyFromSecret(classified.value), "account");
  }

  async function deriveIdentity(factors) {
    return persistIdentity(derivePrivkeyFromBrainFactors(factors), "account");
  }

  function lockSession() {
    wipeSecureSession();
    mode.value = "ephemeral";
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

  async function saveProfile({ name, about, picture, website } = {}) {
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
    lockSession,
    loadProfile,
    saveProfile,
    saveStatus,
  };
});
