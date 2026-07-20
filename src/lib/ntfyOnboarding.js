const STORAGE_KEY = "gupt:ntfy-onboarding:v1";
const SHOW_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

export const NTFY_LINKS = {
  website: "https://ntfy.sh",
  ios: "https://apps.apple.com/us/app/ntfy/id1625396347",
  android: "https://play.google.com/store/apps/details?id=io.heckel.ntfy",
};

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

export function dismissNtfyOnboarding() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dismissedAt: Date.now() }));
  } catch {}
}
