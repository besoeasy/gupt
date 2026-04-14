// Hard retention limit: 200 days or 20 GB, whichever comes first.
// Content older than this is never fetched from relays, cached locally, or displayed.
export const RETENTION_MONTHS = 7;
export const RETENTION_DAYS = 200;
export const RETENTION_MAX_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB

export function readConfiguredRetentionDays() {
  return RETENTION_DAYS;
}

export function readConfiguredRetentionMs() {
  return RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

/** Unix timestamp (ms) before which all content is dropped. */
export function getRetentionCutoffMs() {
  return Date.now() - readConfiguredRetentionMs();
}

/** Unix timestamp (seconds) before which all content is dropped — for Nostr relay filters. */
export function getRetentionCutoffSec() {
  return Math.floor(getRetentionCutoffMs() / 1000);
}
