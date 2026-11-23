// Per-message send diagnostics. Keyed by event id; each entry is what the
// user asked for: exactly what is happening during sending and which relay
// responded. Kept in memory only — relays are the source of truth, so a
// reload re-derives the state from the outbox instead of caching it.
import { reactive } from "vue";
import { getOutboxEntry } from "../idb.js";

export const SEND_VISIBLE_TIMEOUT_MS = 60_000;
export const SEND_REPORT_MAX = 128;

export const sendReports = reactive(new Map());

function shortHost(relay) {
  try {
    return new URL(relay).host || String(relay || "");
  } catch {
    return String(relay || "");
  }
}

function ensureReport(eventId) {
  const key = String(eventId || "").toLowerCase();
  if (!key) return null;
  let report = sendReports.get(key);
  if (!report) {
    report = {
      id: key,
      startedAt: Date.now(),
      state: "queued",
      relays: {},
      attempts: 0,
      nextRetryAt: 0,
      error: null,
      updatedAt: Date.now(),
    };
    sendReports.set(key, report);
    if (sendReports.size > SEND_REPORT_MAX) {
      const oldest = sendReports.keys().next().value;
      if (oldest) sendReports.delete(oldest);
    }
  }
  return report;
}

function errorRank(error) {
  const message = String(error || "").toLowerCase();
  if (!message) return 0;
  if (/exceed|storage|budget|limit|quota|too large|413/.test(message)) return 3;
  if (/read-only|read only|battery_empty|sync_disabled|429|rate/.test(message)) return 2;
  return 1;
}

export function trackSend(eventId) {
  const report = ensureReport(eventId);
  if (report && report.state === "complete") {
    report.state = "queued";
    report.error = null;
  }
  if (report) {
    report.startedAt = report.startedAt || Date.now();
    report.updatedAt = Date.now();
  }
  return report;
}

/**
 * Feed one worker send event into the report. States:
 * trying (a relay attempt started), ok/error (one relay answered), skipped
 * (relay cannot take this send), partial (one relay has it, mirroring rest),
 * queued (nothing accepted yet, retry scheduled), complete (every relay or at
 * least one ack — the bubble shows sent from the first ack).
 */
export function applySendReport(input) {
  if (!input) return null;
  const eventId = String(input.eventId || input.id || "").toLowerCase();
  if (!eventId) return null;
  const report = ensureReport(eventId);
  const now = Date.now();

  if (input.relay) {
    const relay = String(input.relay);
    const entry = report.relays[relay] || {
      relay,
      host: shortHost(relay),
      state: "queued",
      attempts: 0,
      latencyMs: 0,
      error: null,
      at: 0,
    };
    if (input.state === "trying") {
      entry.state = "trying";
      entry.attempts += 1;
      entry.at = Number(input.at) || now;
      entry.error = null;
      report.state = report.state === "complete" ? "complete" : "sending";
      report.attempts = Math.max(report.attempts, Number(input.attempt) || 0);
    } else if (input.state === "ok" || input.state === "error") {
      entry.state = input.state;
      entry.latencyMs = Number(input.latencyMs) || 0;
      entry.at = Number(input.at) || now;
      entry.error =
        input.state === "ok" ? null : String(input.error || "Relay failed") || "Relay failed";
      if (input.state === "ok") {
        report.state = report.state === "complete" ? "complete" : "sending";
        report.error = null;
      } else if (!report.error || errorRank(entry.error) >= errorRank(report.error)) {
        report.error = entry.error;
      }
    } else if (input.state === "skipped") {
      entry.state = "skipped";
      entry.error = String(input.reason || "Relay cannot take this send");
      entry.at = now;
      if (!report.error || errorRank(entry.error) >= errorRank(report.error)) {
        report.error = entry.error;
      }
    }
    report.relays[relay] = entry;
  } else if (input.state === "complete") {
    report.state = "complete";
    report.error = null;
  } else if (input.state === "partial") {
    if (report.state !== "complete") report.state = "sending";
    report.nextRetryAt = Number(input.nextRetryAt) || 0;
  } else if (input.state === "queued") {
    if (report.state !== "complete") report.state = "sending";
    report.nextRetryAt = Number(input.nextRetryAt) || 0;
    if (input.error && (!report.error || errorRank(input.error) >= errorRank(report.error))) {
      report.error = String(input.error);
    }
  }
  report.updatedAt = now;
  return report;
}

/** Foreground timeout: the bubble stops claiming "sending" after a minute. */
export function markSendTimedOut(eventId, error = "No relay responded in time") {
  const report = ensureReport(eventId);
  if (!report || report.state === "complete") return report;
  report.state = "timedOut";
  report.error = String(error || "No relay responded in time");
  report.updatedAt = Date.now();
  return report;
}

export function markSendComplete(eventId) {
  const report = ensureReport(eventId);
  if (!report) return report;
  report.state = "complete";
  report.error = null;
  report.updatedAt = Date.now();
  return report;
}

export function getSendReport(eventId) {
  return sendReports.get(String(eventId || "").toLowerCase()) || null;
}

/** Message Info detail: relays in the order they were tried. */
export function relayAttemptsOf(report) {
  return Object.values(report?.relays || {}).sort((a, b) => (a.at || 0) - (b.at || 0));
}

/**
 * Hydrate a report for Message Info after a reload: the queue row carries the
 * attempt count, the last error and the next retry, but no per-relay history.
 */
export async function hydrateSendReport(eventId) {
  const key = String(eventId || "").toLowerCase();
  if (!key) return null;
  const existing = sendReports.get(key);
  if (existing && Object.keys(existing.relays || {}).length) return existing;
  let row = null;
  try {
    row = await getOutboxEntry(key);
  } catch {
    row = null;
  }
  if (!row) return existing || null;
  const report = ensureReport(key);
  report.attempts = Number(row.attempts) || 0;
  report.nextRetryAt = Number(row.nextDue) || 0;
  if (row.lastSyncError) report.error = String(row.lastSyncError);
  if (report.state !== "complete") report.state = "sending";
  report.updatedAt = Date.now();
  return report;
}

export function forgetSendReport(eventId) {
  sendReports.delete(String(eventId || "").toLowerCase());
}
