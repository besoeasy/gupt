export const RETENTION_DAYS = 100;
export const RETENTION_MAX_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

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
