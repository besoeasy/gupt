/**
 * Replication — re-publishes a small sample of stored events to relays every
 * tick so data stays alive across many relays. Events are selected by
 * lastReplicatedAt (oldest first) with expiry as tiebreaker.
 */
import { sampleRawEvents, markReplicated } from "./idb";
import { getKnownRelays, publishToRelays } from "./relay";

const SAMPLE_SIZE = 5;
const SAMPLE_SIZE_DATA_SAVER = 3;
const RELAY_SAMPLE = 50;
const RELAY_SAMPLE_DATA_SAVER = 10;
const PUBLISH_MAX_WAIT = 6000;
const AGE_WINDOW_MS = 100 * 24 * 60 * 60 * 1000;
const REPLICATABLE_KINDS = [1, 4];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Run one replication tick: pick kind-1/4 events not replicated recently
 * (oldest lastReplicatedAt first, soonest-expiring as tiebreaker), publish
 * each to a random relay set. Relays dedupe by event id so repeated ticks
 * are no-ops once events are established.
 *
 * @returns {Promise<{ published: number, errors: number, sampled: number }>}
 */
export async function replicationTick() {
  const cutoff = Date.now() - AGE_WINDOW_MS;
  const candidates = await sampleRawEvents({
    kinds: REPLICATABLE_KINDS,
    minCreatedAt: cutoff,
    limit: 50,
  });
  if (!candidates.length) return { published: 0, errors: 0, sampled: 0 };

  const dataSaver =
    typeof navigator !== "undefined" && navigator.connection && navigator.connection.saveData;
  const sampleSize = dataSaver ? SAMPLE_SIZE_DATA_SAVER : SAMPLE_SIZE;
  const relayCount = dataSaver ? RELAY_SAMPLE_DATA_SAVER : RELAY_SAMPLE;

  const sample = candidates.slice(0, Math.min(sampleSize, candidates.length));

  const allRelays = getKnownRelays();
  if (!allRelays.length) return { published: 0, errors: 0, sampled: sample.length };
  const relays = shuffle(allRelays).slice(0, Math.min(relayCount, allRelays.length));

  let published = 0;
  let errors = 0;
  const publishedIds = [];

  for (const row of sample) {
    try {
      const res = await publishToRelays(relays, row.event, PUBLISH_MAX_WAIT, true);
      const ok = Object.values(res).filter((r) => r.ok).length;
      published += ok;
      errors += relays.length - ok;
      if (ok > 0) publishedIds.push(row.id);
    } catch {
      errors += relays.length;
    }
  }

  if (publishedIds.length) {
    markReplicated(publishedIds).catch(() => {});
  }

  return { published, errors, sampled: sample.length };
}
