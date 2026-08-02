import { sampleRawEvents, markReplicated } from "./idb";
import { getKnownRelays, readRelays, publishToRelays, ensureConnectedRelays } from "./relay";

const SAMPLE_SIZE = 5;
const SAMPLE_SIZE_DATA_SAVER = 3;
const RELAY_SAMPLE = 10;
const RELAY_SAMPLE_DATA_SAVER = 5;
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

  // Prefer the health-ranked relay set (top-ranked exploit + explore slots),
  // falling back to a shuffled sample of all known relays if ranking is unavailable.
  let relays;
  try {
    const ranked = await readRelays();
    relays = ranked.slice(0, Math.min(relayCount, ranked.length));
  } catch {
    const allRelays = getKnownRelays();
    relays = shuffle(allRelays).slice(0, Math.min(relayCount, allRelays.length));
  }
  if (!relays.length) return { published: 0, errors: 0, sampled: sample.length };

  // Connect to the target relays once at the beginning of the replication tick
  let connectedRelays;
  try {
    connectedRelays = await ensureConnectedRelays(relays);
  } catch (err) {
    return { published: 0, errors: relays.length * sample.length, sampled: sample.length };
  }

  let published = 0;
  let errors = 0;
  const publishedIds = [];

  const results = await Promise.all(
    sample.map(async (row) => {
      try {
        const res = await publishToRelays(connectedRelays, row.event, PUBLISH_MAX_WAIT, true);
        const ok = Object.values(res).filter((r) => r.ok).length;
        return { id: row.id, ok, failed: connectedRelays.length - ok };
      } catch {
        return { id: row.id, ok: 0, failed: connectedRelays.length };
      }
    }),
  );

  for (const r of results) {
    published += r.ok;
    errors += r.failed;
    if (r.ok > 0) publishedIds.push(r.id);
  }

  if (publishedIds.length) {
    markReplicated(publishedIds).catch(() => {});
  }

  return { published, errors, sampled: sample.length };
}
