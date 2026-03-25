// Retention is hardcoded: 100 days or 20 GB, whichever comes first.
export const RETENTION_DAYS = 100;
export const RETENTION_MAX_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB

export function readConfiguredRetentionDays() {
  return RETENTION_DAYS;
}

export function readConfiguredRetentionMs() {
  return RETENTION_DAYS * 24 * 60 * 60 * 1000;
}
