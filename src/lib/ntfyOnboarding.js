import { WRITER_VERSION } from "./writerVersion.js";

const STORAGE_KEY = "gupt:ntfy-onboarding:v1";
const ONBOARDING_VERSION = 1;
const SHOW_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

export const NTFY_LINKS = {
  website: "https://ntfy.sh",
  ios: "https://apps.apple.com/us/app/ntfy/id1625396347",
  android: "https://play.google.com/store/apps/details?id=io.heckel.ntfy",
};

/**
 * `{ v, w, dismissedAt }` — the header is what lets a later release add state
 * without renaming the key and resetting the dismissal.
 */
export function shouldShowNtfyOnboarding() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    if (Number(parsed?.v) !== ONBOARDING_VERSION || parsed?.w !== WRITER_VERSION) {
      // Read-repair: rewrite in the current shape, keeping the dismissal.
      if (Number.isFinite(Number(parsed?.dismissedAt))) {
        persist(Number(parsed.dismissedAt));
      }
    }
    return Date.now() - Number(parsed?.dismissedAt || 0) >= SHOW_INTERVAL_MS;
  } catch {
    return true;
  }
}

export function dismissNtfyOnboarding() {
  persist(Date.now());
}

function persist(dismissedAt) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: ONBOARDING_VERSION, w: WRITER_VERSION, dismissedAt }),
    );
  } catch {}
}
