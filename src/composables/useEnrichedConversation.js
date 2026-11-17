import { computed, ref, watch } from "vue";
import { countEvents } from "@/lib/rabta/index.js";
import { fetchLastSeenTimestamp, formatTimeAgo } from "@/lib/lastSeen.js";
import { api } from "@/lib/api.js";
import { checkRelayHealth } from "@/lib/rabta/index.js";
import { DEFAULT_RELAYS } from "@/config/servers.js";

/**
 * Composable that combines multiple Rabta API queries to enrich the active conversation
 * with live relay metrics, last-seen activity, profile bio, and sync telemetry.
 *
 * @param {import("vue").Ref<string>} targetId
 * @param {import("vue").Ref<boolean>} isGroup
 * @param {import("vue").Ref<string>} peerPubkey
 * @param {import("vue").Ref<number>} localMessageCount
 */
export function useEnrichedConversation(targetId, isGroup, peerPubkey, localMessageCount) {
  const loading = ref(false);
  const relayEventCount = ref(null);
  const lastActivitySec = ref(null);
  const lastSeenLabel = ref("");
  const peerBio = ref("");
  const peerWebsite = ref("");
  const relayLatencyMs = ref(null);
  const relayNodeId = ref("");
  const lastEnrichedAt = ref(null);

  const syncParity = computed(() => {
    if (relayEventCount.value == null) return "checking";
    const local = Number(localMessageCount.value || 0);
    const relay = Number(relayEventCount.value || 0);
    if (local >= relay) return "synced";
    return "relay-ahead";
  });

  const syncParityLabel = computed(() => {
    if (relayEventCount.value == null) return "Checking relay…";
    const local = Number(localMessageCount.value || 0);
    const relay = Number(relayEventCount.value || 0);
    if (local >= relay) return `${relay} events · in sync`;
    return `${relay - local} new on relay`;
  });

  let refreshTimer = null;
  let currentProbeToken = 0;

  async function pollEnrichedData() {
    const id = targetId.value;
    if (!id) {
      relayEventCount.value = null;
      lastActivitySec.value = null;
      lastSeenLabel.value = "";
      peerBio.value = "";
      peerWebsite.value = "";
      return;
    }

    const token = ++currentProbeToken;
    loading.value = true;

    try {
      const isGrp = isGroup.value;
      const pk = peerPubkey.value;

      // 1. Query live relay event count using Rabta /api/v1/events/count
      const countPromise = countEvents(
        isGrp
          ? { collection: "gupt/group", labels: [id] }
          : pk
            ? { collection: "gupt/dm", labels: [pk] }
            : { collection: "gupt/dm" },
        DEFAULT_RELAYS,
        4000,
      ).catch(() => ({ count: null }));

      // 2. Query peer live activity timestamp using GET /api/v1/events?owner=...&limit=1
      const lastSeenPromise =
        !isGrp && pk
          ? fetchLastSeenTimestamp(pk, DEFAULT_RELAYS).catch(() => null)
          : Promise.resolve(null);

      // 3. Query peer live profile from relay
      const profilePromise =
        !isGrp && pk
          ? api.fetchPeerProfile(pk, DEFAULT_RELAYS).catch(() => null)
          : Promise.resolve(null);

      // 4. Query relay health probe from GET /api/v1/health
      const healthPromise = checkRelayHealth(DEFAULT_RELAYS[0], { timeoutMs: 3000 }).catch(
        () => null,
      );

      const [countResult, lastSeenResult, profileResult, healthResult] = await Promise.all([
        countPromise,
        lastSeenPromise,
        profilePromise,
        healthPromise,
      ]);

      if (token !== currentProbeToken) return;

      if (countResult && typeof countResult.count === "number") {
        relayEventCount.value = countResult.count;
      }

      if (typeof lastSeenResult === "number") {
        lastActivitySec.value = lastSeenResult;
        lastSeenLabel.value = formatTimeAgo(lastSeenResult);
      } else if (!isGrp) {
        lastSeenLabel.value = "Encrypted Direct Message";
      }

      if (profileResult) {
        peerBio.value = profileResult.about || "";
        peerWebsite.value = profileResult.website || "";
      }

      if (healthResult && healthResult.ok) {
        relayLatencyMs.value = healthResult.latency || null;
        relayNodeId.value = healthResult.nodeId || "";
      }

      lastEnrichedAt.value = Date.now();
    } catch {
      // Keep existing data on transient network failure
    } finally {
      if (token === currentProbeToken) {
        loading.value = false;
      }
    }
  }

  watch(
    [targetId, isGroup, peerPubkey],
    () => {
      clearTimeout(refreshTimer);
      pollEnrichedData();
    },
    { immediate: true },
  );

  return {
    loading,
    relayEventCount,
    lastActivitySec,
    lastSeenLabel,
    peerBio,
    peerWebsite,
    relayLatencyMs,
    relayNodeId,
    lastEnrichedAt,
    syncParity,
    syncParityLabel,
    refreshEnrichedData: pollEnrichedData,
  };
}
