import { recordRelayOutcomes } from "@/lib/idb.js";

export function recordOutcomes(operation, outcomes) {
  if (!Array.isArray(outcomes) || !outcomes.length) return;
  void recordRelayOutcomes(operation, outcomes).catch(() => {});
}
