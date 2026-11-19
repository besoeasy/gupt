const STORAGE_KEY = "gupt:relay-nudge:v1";

/** Advisory floor: below this many relays, Settings shows a nudge. */
export const RELAY_RECOMMENDED_MIN = 5;

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { countAtDismiss: null };
    const parsed = JSON.parse(raw);
    const countAtDismiss = Number(parsed?.countAtDismiss);
    return {
      countAtDismiss: Number.isFinite(countAtDismiss) ? Math.max(0, countAtDismiss) : null,
    };
  } catch {
    return null;
  }
}

/**
 * True when the configured relay count is below the recommended floor and the
 * user has not already dismissed the nudge at this count or a lower one. A
 * dismissal only expires if the setup gets worse, so this never nags.
 */
export function shouldShowRelayNudge(count) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  if (total >= RELAY_RECOMMENDED_MIN) return false;

  let state;
  try {
    state = readState();
  } catch {
    return false;
  }
  if (!state) return false;
  if (state.countAtDismiss === null) return true;
  return total < state.countAtDismiss;
}

/** Remember the count the user dismissed the nudge at. */
export function dismissRelayNudge(count) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ countAtDismiss: total, dismissedAt: Date.now() }),
    );
    return true;
  } catch {
    return false;
  }
}

export function readRelayNudgeState() {
  const state = readState();
  return state || null;
}
