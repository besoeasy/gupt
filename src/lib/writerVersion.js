/**
 * Writer stamp: every stored thing carries the build that wrote it.
 *
 * `WRITER_VERSION` is the CalVer release (`2026.1120.1`) baked in at build
 * time. `stampWriter()` adds it as `w` to vault records and event `data`;
 * readers use `isWrittenBefore()` to pick a migration path. The stamp is
 * metadata only — it never decides whether something is readable. The
 * protocol integers (`v`, `RABTA_VERSION`, vault `v`) are the sole
 * readability gates, so this module can never strand an old client.
 *
 * Under node --test there is no vite define, so an explicit dev fallback
 * keeps pure-function tests hermetic instead of throwing ReferenceError.
 */
const DECLARED =
  typeof __APP_VERSION__ !== "undefined" && typeof __APP_VERSION__ === "string"
    ? __APP_VERSION__
    : "";

export const WRITER_VERSION = DECLARED || "0.0.0-dev";

/** Numeric per-part compare that understands CalVer (`2026.1120.10` > `2026.1120.9`). */
export function compareVersions(a, b) {
  const pa = String(a || "").split(".");
  const pb = String(b || "").split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    const va = Number.isFinite(na) ? na : -1;
    const vb = Number.isFinite(nb) ? nb : -1;
    if (va !== vb) return va < vb ? -1 : 1;
  }
  return 0;
}

/** Returns a copy of `obj` stamped with the writing build. Never mutates. */
export function stampWriter(obj) {
  return { ...(obj || {}), w: WRITER_VERSION };
}

/** The stamp on a stored record or event, or null for pre-stamp items. */
export function readWriterVersion(record) {
  const w = record?.w ?? record?.data?.w;
  return typeof w === "string" && w ? w : null;
}

/**
 * True when `record` predates `version`. A missing stamp means pre-stamp era,
 * so it counts as older than anything — the safe default when choosing
 * whether a migration path applies.
 */
export function isWrittenBefore(record, version) {
  const w = readWriterVersion(record);
  if (!w) return true;
  return compareVersions(w, version) < 0;
}
