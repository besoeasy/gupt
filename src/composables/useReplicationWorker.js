import { useReplicationStore } from "@/stores/replication";

// Deprecated — use useReplicationStore() from "@/stores/replication" directly.
export function useReplicationWorker() {
  const store = useReplicationStore();
  return {
    startWorker: store.startWorker,
    stopWorker: store.stopWorker,
    triggerReplicationTick: store.triggerReplicationTick,
  };
}

export function triggerReplicationTick() {
  return useReplicationStore().triggerReplicationTick();
}
