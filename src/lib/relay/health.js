import { getRelayHealthSummary } from "@/lib/idb.js";
import { classifyTraffic, tierDotClass } from "./constants.js";

export async function getHealthSummary() {
  const rows = await getRelayHealthSummary();

  return rows.map((row) => ({
    ...row,
    tier: classifyTraffic(
      row.publishSuccessRate,
      row.publishTotal,
      row.connectSuccessRate,
      row.connectTotal,
    ),
  }));
}

export { tierDotClass } from "./constants.js";
