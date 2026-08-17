import { ref, readonly, watch, unref, onMounted, onUnmounted, getCurrentInstance } from "vue";
import { fetchLastSeenTimestamp, formatTimeAgo } from "@/lib/lastSeen";

export function useLastSeen(pubkeyHex, relays) {
  const lastSeenTs = ref(null);
  const lastSeenLabel = ref("…");
  const loading = ref(false);

  function getPubkey() {
    return typeof pubkeyHex === "object" && pubkeyHex !== null
      ? String(pubkeyHex.value || "").trim()
      : String(pubkeyHex || "").trim();
  }

  function reformat() {
    lastSeenLabel.value = lastSeenTs.value != null ? formatTimeAgo(lastSeenTs.value) : "unknown";
  }

  async function refresh() {
    const pk = getPubkey();
    if (!pk) {
      lastSeenLabel.value = "unknown";
      return;
    }

    loading.value = true;
    try {
      const ts = await fetchLastSeenTimestamp(pk, relays);
      lastSeenTs.value = ts;
      reformat();
    } finally {
      loading.value = false;
    }
  }

  let _intervalId = null;

  function startTicker() {
    if (_intervalId != null) return;
    _intervalId = setInterval(() => {
      reformat();
    }, 60_000);
  }

  function stopTicker() {
    if (_intervalId != null) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
  }

  function stop() {
    stopTicker();
  }

  if (getCurrentInstance()) {
    watch(
      () => unref(pubkeyHex),
      (pk) => {
        if (pk) void refresh();
        else lastSeenLabel.value = "unknown";
      },
      { immediate: true },
    );
    onMounted(() => {
      startTicker();
    });
    onUnmounted(() => {
      stopTicker();
    });
  } else {
    void refresh();
    startTicker();
  }

  return {
    lastSeenLabel: readonly(lastSeenLabel),
    lastSeenTs: readonly(lastSeenTs),
    loading: readonly(loading),
    refresh,
    stop,
  };
}
