import { getReplicationCandidates, markEventsReplicated } from "./idb.js";
import { readRelays } from "./relay/selection.js";
import { replicateEventToRelays } from "./rabta/index.js";

const BATCH_SIZE = 5;

export { replicateEventToRelays };

/**
 * One tick of background replication:
 * 1. Reads candidate events from IndexedDB rawEvents.
 * 2. Checks each configured Rabta relay to see if it already has the event.
 * 3. Only uploads to relays where the event is missing.
 * 4. Advances lastReplicatedAt on the processed events.
 */
export async function replicationTick() {
  const candidates = await getReplicationCandidates({ limit: BATCH_SIZE });
  if (!candidates.length) {
    return { published: 0, checked: 0, skipped: 0, errors: 0 };
  }

  const relays = await readRelays();
  if (!relays.length) {
    return { published: 0, checked: candidates.length, skipped: 0, errors: 0 };
  }

  let published = 0;
  let skipped = 0;
  let errors = 0;
  const processedIds = [];

  for (const row of candidates) {
    const event = row.event;
    if (!event || !event.id) {
      processedIds.push(row.id);
      continue;
    }

    const result = await replicateEventToRelays(event, relays);
    published += result.uploaded.length;
    skipped += result.skipped.length;
    errors += result.failed.length;
    processedIds.push(row.id);
  }

  if (processedIds.length) {
    await markEventsReplicated(processedIds).catch(() => {});
  }

  return { published, checked: candidates.length, skipped, errors };
}
