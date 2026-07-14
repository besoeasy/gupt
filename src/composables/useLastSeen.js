import { ref, readonly, onMounted, onUnmounted, getCurrentInstance } from "vue";
import { fetchLastSeenTimestamp, formatTimeAgo, invalidateLastSeen } from "@/lib/lastSeen";

/**
 * useLastSeen — Vue composable for displaying a user's last-active time.
 *
 * Usage (inside a component's <script setup>)
 * -------------------------------------------
 *   const { lastSeenLabel, lastSeenTs, loading, refresh } = useLastSeen(pubkeyHex);
 *
 *   // With a specific relay list:
 *   const { lastSeenLabel } = useLastSeen(pubkeyHex, ["wss://relay.damus.io"]);
 *
 *   // Reactive pubkey (Ref<string>):
 *   const peer = ref("abc123...");
 *   const { lastSeenLabel } = useLastSeen(peer);
 *
 * What it does
 * ------------
 *  1. Kicks off a non-blocking relay query the moment the host component mounts.
 *  2. Exposes `lastSeenLabel` – a reactive "just now / 3 h ago / 5 days ago" string.
 *  3. Exposes `lastSeenTs` – raw Unix-second timestamp (null until resolved).
 *  4. Re-formats the label every minute so it naturally advances without a relay round-trip.
 *  5. `refresh(force?)` triggers a new relay fetch; pass `true` to skip the cache.
 *
 * When called **outside** a component setup (store / test / node script) the
 * ticker starts immediately and the caller is responsible for calling `stop()`.
 *
 * @param {string | import('vue').Ref<string>} pubkeyHex – hex pubkey or a Ref<string>
 * @param {string[]}                           [relays]  – optional relay override
 */
export function useLastSeen(pubkeyHex, relays) {
  /** Raw Unix-second timestamp; null while loading or not found. */
  const lastSeenTs = ref(null);

  /** Human-readable "time ago" label. */
  const lastSeenLabel = ref("…");

  /** True while a relay fetch is in-flight. */
  const loading = ref(false);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getPubkey() {
    return typeof pubkeyHex === "object" && pubkeyHex !== null
      ? String(pubkeyHex.value || "").trim()
      : String(pubkeyHex || "").trim();
  }

  function reformat() {
    lastSeenLabel.value = lastSeenTs.value != null ? formatTimeAgo(lastSeenTs.value) : "unknown";
  }

  // ── Relay fetch ───────────────────────────────────────────────────────────

  /**
   * Fetch the latest event timestamp from Nostr relays.
   *
   * @param {boolean} [force=false] – when true, bypass the in-memory cache
   */
  async function refresh(force = false) {
    const pk = getPubkey();
    if (!pk) {
      lastSeenLabel.value = "unknown";
      return;
    }

    if (force) invalidateLastSeen(pk);

    loading.value = true;
    try {
      const ts = await fetchLastSeenTimestamp(pk, relays);
      lastSeenTs.value = ts;
      reformat();
    } finally {
      loading.value = false;
    }
  }

  // ── Auto-advance ticker ───────────────────────────────────────────────────
  // Re-formats the label every 60 s so "1 min ago" becomes "2 min ago" etc.
  // without needing a fresh relay query.

  let _intervalId = null;

  function startTicker() {
    if (_intervalId != null) return;
    _intervalId = setInterval(reformat, 60_000);
  }

  function stopTicker() {
    if (_intervalId != null) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
  }

  /** Stop the ticker (only needed when useLastSeen is called outside a component). */
  function stop() {
    stopTicker();
  }

  // ── Lifecycle wiring ──────────────────────────────────────────────────────

  if (getCurrentInstance()) {
    // Inside a Vue component setup — hook into the component lifecycle.
    onMounted(() => {
      refresh();
      startTicker();
    });
    onUnmounted(() => {
      stopTicker();
    });
  } else {
    // Outside a component (e.g. store, test, script). Start immediately.
    refresh();
    startTicker();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    /**
     * Reactive human-readable label.
     * Examples: "just now", "2 min ago", "3 h ago", "5 days ago", "2 mo ago"
     */
    lastSeenLabel: readonly(lastSeenLabel),

    /**
     * Reactive raw Unix-second timestamp.
     * null = not yet fetched, not found, or pubkey is empty.
     */
    lastSeenTs: readonly(lastSeenTs),

    /** True while the relay query is in-flight. */
    loading: readonly(loading),

    /**
     * Trigger a fresh relay fetch.
     * @param {boolean} [force=false] – pass true to bypass the module-level cache
     */
    refresh,

    /**
     * Stop the background label-refresh ticker.
     * Only needed when useLastSeen is called outside a Vue component context.
     */
    stop,
  };
}
