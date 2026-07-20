export const RETENTION_DAYS = 100;
export const RETENTION_MAX_BYTES = 10 * 1024 * 1024 * 1024;

export function readConfiguredRetentionDays() {
  return RETENTION_DAYS;
}

export function readConfiguredRetentionMs() {
  return RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

export function getRetentionCutoffMs() {
  return Date.now() - readConfiguredRetentionMs();
}

export function getRetentionCutoffSec() {
  return Math.floor(getRetentionCutoffMs() / 1000);
}

export function getExpiryTimestampSec() {
  return Math.floor(Date.now() / 1000) + RETENTION_DAYS * 24 * 60 * 60;
}
