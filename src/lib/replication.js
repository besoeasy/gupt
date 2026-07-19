/**
 * Replication — re-publishes a small random sample of stored events to random
 * relays every tick so data stays alive across many relays.
 */
import { sampleRawEvents } from "./idb";
import { getKnownRelays, publishToRelays } from "./relay";

const SAMPLE_SIZE = 5;
const RELAY_SAMPLE = 5;
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
 * Run one replication tick: sample 5 random kind-1/4 events newer than the
 * age window, pick 5 random relays, and re-publish each event to that relay
 * set. Relays dedupe by event id, so re-publishing the same event to the same
 * relay over multiple ticks is a no-op there.
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

  const sample = shuffle(candidates).slice(0, Math.min(SAMPLE_SIZE, candidates.length));

  const allRelays = getKnownRelays();
  if (!allRelays.length) return { published: 0, errors: 0, sampled: sample.length };
  const relays = shuffle(allRelays).slice(0, Math.min(RELAY_SAMPLE, allRelays.length));

  let published = 0;
  let errors = 0;
  for (const row of sample) {
    try {
      const res = await publishToRelays(relays, row.event, PUBLISH_MAX_WAIT);
      const ok = Object.values(res).filter((r) => r.ok).length;
      published += ok;
      errors += relays.length - ok;
    } catch {
      errors += relays.length;
    }
  }

  return { published, errors, sampled: sample.length };
}
