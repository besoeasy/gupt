import { useReplicationStore } from "@/stores/replication";

// Deprecated — use useReplicationStore() from "@/stores/replication" directly.
//
// startWorker and triggerReplicationTick take the identity store as a required
// argument with no default, so these forward the caller's argument untouched
// rather than looking the store up behind their back.
export function useReplicationWorker() {
  const store = useReplicationStore();
  return {
    startWorker: store.startWorker,
    stopWorker: store.stopWorker,
    triggerReplicationTick: store.triggerReplicationTick,
  };
}

export function triggerReplicationTick(identity) {
  return useReplicationStore().triggerReplicationTick(identity);
}
