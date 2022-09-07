const STORAGE_KEY = "gupt:ntfy-onboarding:v1";
const SHOW_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const NTFY_LINKS = {
  website: "https://ntfy.sh",
  ios: "https://apps.apple.com/us/app/ntfy/id1625396347",
  android: "https://play.google.com/store/apps/details?id=io.heckel.ntfy",
};

/** True when the notifications setup page should be shown (every 24 hours after last show/dismiss). */
export function shouldShowNtfyOnboarding() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const { dismissedAt } = JSON.parse(raw);
    return Date.now() - Number(dismissedAt || 0) >= SHOW_INTERVAL_MS;
  } catch {
    return true;
  }
}

/** Snooze the setup page until the 24-hour interval elapses. */
export function dismissNtfyOnboarding() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dismissedAt: Date.now() }));
  } catch {
    // ignore quota errors
  }
}
