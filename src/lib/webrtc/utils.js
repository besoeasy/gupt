/**
 * WebRTC module — pure helpers.
 *
 * Formatting, normalization, and (de)serialization helpers. Nothing in here
 * touches RTC globals, so this file stays importable outside the browser
 * (e.g. from Node tests).
 */

export const DEFAULT_MEDIA = Object.freeze({ audio: true, video: false });

export function normalizeMedia(media) {
  return {
    audio: media?.audio !== false,
    video: Boolean(media?.video),
  };
}

export function randomCallId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Call event text
// ---------------------------------------------------------------------------

export function formatMediaError(error) {
  if (!(error instanceof Error)) {
    const text = String(error || "").trim();
    return text || "Unable to access microphone or camera.";
  }

  const name = error.name || "";
  const message = error.message || "";

  if (name === "NotFoundError" || message.includes("Requested device not found")) {
    return "No microphone or camera was found. Connect a device or check that it is not in use by another app.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone or camera access was denied. Allow access in your browser settings and try again.";
  }
  if (name === "NotReadableError") {
    return "Your microphone or camera is in use by another application.";
  }
  if (name === "SecurityError") {
    return "Microphone and camera access requires a secure connection (HTTPS).";
  }

  return message || "Unable to access microphone or camera.";
}

export function formatCallEventText(outcome, media = DEFAULT_MEDIA, durationSec = 0) {
  const kind = media?.video ? "Video call" : "Voice call";
  switch (outcome) {
    case "ended":
      return durationSec > 0
        ? `${kind} · ${formatCallDurationShort(durationSec)}`
        : `${kind} ended`;
    case "no-answer":
      return `${kind} · No answer`;
    case "declined":
      return `${kind} · Declined`;
    case "cancelled":
      return `${kind} · Cancelled`;
    case "busy":
      return `${kind} · Busy`;
    case "missed":
      return `${kind} · Missed`;
    case "failed":
      return `${kind} · Connection failed`;
    default:
      return kind;
  }
}

function formatCallDurationShort(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function inferCallOutcome(reason = "", extra = {}) {
  if (extra.outcome) return extra.outcome;
  const text = String(reason || "").toLowerCase();
  if (text.includes("no answer") || extra.hangupReason === "no-answer") return "no-answer";
  if (text.includes("declined")) return "declined";
  if (text.includes("busy")) return "busy";
  if (text.includes("cancelled")) return "cancelled";
  if (text.includes("connection lost") || text.includes("failed")) return "failed";
  if (text.includes("call ended") || text.includes("ended")) return "ended";
  if (text.includes("missed")) return "missed";
  return "ended";
}

// ---------------------------------------------------------------------------
// ICE candidate helpers
// ---------------------------------------------------------------------------

export function serializeIceCandidate(candidate) {
  if (!candidate) return null;
  if (typeof candidate.toJSON === "function") return candidate.toJSON();

  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment,
  };
}

export function summarizeCandidate(candidate) {
  if (!candidate?.candidate || typeof candidate.candidate !== "string") return "unknown";

  const parts = candidate.candidate.trim().split(/\s+/);
  const typeIndex = parts.findIndex((part) => part === "typ");
  const protocol = parts[2] || "unknown";
  const candidateType = typeIndex !== -1 ? parts[typeIndex + 1] || "unknown" : "unknown";
  const address = parts[4] || "unknown";
  const port = parts[5] || "unknown";
  return `${candidateType}/${protocol} ${address}:${port}`;
}

export function candidateTypeOf(candidate) {
  const summary = summarizeCandidate(candidate);
  return summary.split("/")[0] || "unknown";
}

export function describeIceServers(servers) {
  return servers.flatMap((server) =>
    (Array.isArray(server?.urls) ? server.urls : [server?.urls]).filter(Boolean),
  );
}
