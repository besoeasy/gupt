/**
 * WebRTC module — shared peer connection helpers.
 *
 * Everything that touches RTC globals (RTCPeerConnection, RTCIceCandidate,
 * getUserMedia) lives here so the call session and the blob transfer share
 * one implementation of ICE batching, media acquisition, connectivity
 * preflight, and stats collection.
 */

import { DEFAULT_ICE_SERVERS } from "@/config/servers";
import { ICE_BATCH_MS, CONNECTIVITY_CHECK_TIMEOUT_MS } from "./constants.js";
import { candidateTypeOf, normalizeMedia } from "./utils.js";

export function toRtcIceCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  return new RTCIceCandidate(candidate);
}

export function toRtcSessionDescription(type, sdp) {
  return new RTCSessionDescription({ type, sdp });
}

/**
 * Coalesce ICE candidates into time-windowed batches. `send` receives an
 * array of serialized candidates; call `clear()` when the session ends so a
 * pending flush never fires after teardown.
 */
export function createIceBatcher(send, windowMs = ICE_BATCH_MS) {
  let batch = [];
  let timer = null;

  function clear() {
    if (timer) clearTimeout(timer);
    timer = null;
    batch = [];
  }

  async function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!batch.length) return;
    const candidates = batch;
    batch = [];
    await send(candidates);
  }

  function push(candidate) {
    if (!candidate) return;
    batch.push(candidate);
    if (!timer) {
      timer = setTimeout(() => {
        void flush().catch(() => {});
      }, windowMs);
    }
  }

  return { push, flush, clear };
}

/**
 * Queue remote ICE candidates until the remote description is set, then
 * apply them in order. Candidates arriving early would otherwise be
 * dropped (addIceCandidate throws without a remote description).
 */
export function createCandidateQueue(peerConnection) {
  let queued = [];

  async function apply(candidates) {
    for (const candidate of candidates) {
      const rtcCandidate = toRtcIceCandidate(candidate);
      if (!rtcCandidate) continue;
      await peerConnection.addIceCandidate(rtcCandidate);
    }
  }

  async function add(candidates) {
    const list = (Array.isArray(candidates) ? candidates : [candidates]).filter(Boolean);
    if (!list.length) return;
    if (!peerConnection.remoteDescription) {
      queued.push(...list);
      return;
    }
    await apply(list);
  }

  async function flush() {
    if (!peerConnection.remoteDescription) return;
    const pending = queued;
    queued = [];
    await apply(pending);
  }

  function clear() {
    queued = [];
  }

  return { add, flush, clear };
}

/**
 * Acquire local media, degrading gracefully (video+audio → audio-only →
 * any audio) when devices are missing or over-constrained.
 */
export async function getUserMediaWithFallback(requestedMedia, log) {
  const wantsAudio = requestedMedia.audio !== false;
  const wantsVideo = Boolean(requestedMedia.video);

  const attempts = [];
  if (wantsVideo) {
    attempts.push({ audio: wantsAudio, video: true });
    if (wantsAudio) attempts.push({ audio: true, video: false });
  } else if (wantsAudio) {
    attempts.push({ audio: true, video: false });
    attempts.push({ audio: {} });
  } else {
    throw new Error("At least audio or video is required for a call.");
  }

  let lastError = null;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return { stream, media: normalizeMedia(constraints) };
    } catch (error) {
      lastError = error;
      const retryable =
        error?.name === "NotFoundError" ||
        error?.name === "OverconstrainedError" ||
        error?.name === "ConstraintNotSatisfiedError";
      if (!retryable) throw error;
      log?.("warn", "getUserMedia failed, trying fallback", {
        constraints,
        error: error.message,
      });
    }
  }

  throw lastError || new Error("Unable to access microphone or camera.");
}

/**
 * Preflight check: gather ICE candidates on a throwaway connection to
 * detect whether host/srflx/relay candidates are available at all.
 */
export async function checkCallConnectivity(
  iceServers = DEFAULT_ICE_SERVERS,
  timeoutMs = CONNECTIVITY_CHECK_TIMEOUT_MS,
) {
  if (typeof RTCPeerConnection === "undefined") {
    return {
      ok: false,
      reason: "WebRTC not supported",
      warning: "This browser does not support calls.",
    };
  }

  const pc = new RTCPeerConnection({ iceServers });
  const gathered = [];

  try {
    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        pc.close();
        resolve(buildConnectivityResult(gathered, "timeout"));
      }, timeoutMs);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          gathered.push(event.candidate);
          return;
        }
        clearTimeout(timer);
        pc.close();
        resolve(buildConnectivityResult(gathered, "complete"));
      };

      pc.createDataChannel("gupt-probe");
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch((error) => {
          clearTimeout(timer);
          pc.close();
          resolve({
            ok: false,
            reason: error.message || "offer-failed",
            warning: "Network check failed. Calls may not connect.",
            types: [],
            candidateCount: 0,
            gatherState: "error",
          });
        });
    });
  } catch (error) {
    pc.close();
    return {
      ok: false,
      reason: error.message || "check-failed",
      warning: "Network check failed. Calls may not connect.",
      types: [],
      candidateCount: 0,
      gatherState: "error",
    };
  }
}

function buildConnectivityResult(candidates, gatherState) {
  const types = new Set(candidates.map((entry) => candidateTypeOf(entry)));
  const hasHost = types.has("host");
  const hasSrflx = types.has("srflx");
  const hasRelay = types.has("relay");
  const ok = hasHost || hasSrflx || hasRelay;

  let warning = null;
  if (!ok) {
    warning = "Could not gather network candidates. Calls may not connect.";
  } else if (!hasSrflx && !hasRelay) {
    warning = "Limited NAT traversal detected — calls may fail across different networks.";
  }

  return {
    ok,
    warning,
    types: [...types],
    candidateCount: candidates.length,
    gatherState,
  };
}

/**
 * Snapshot of connection quality: RTT, packet loss, jitter, and the
 * candidate types of the active pair (host/srflx/relay).
 */
export async function collectConnectionStats(peerConnection) {
  if (!peerConnection?.getStats) return null;

  const report = await peerConnection.getStats();
  const candidates = new Map();

  for (const stat of report.values()) {
    if (stat.type === "local-candidate" || stat.type === "remote-candidate") {
      candidates.set(stat.id, stat);
    }
  }

  let rtt = null;
  let packetLoss = null;
  let jitter = null;
  let localType = null;
  let remoteType = null;
  let quality = "good";

  for (const stat of report.values()) {
    if (stat.type === "candidate-pair" && stat.state === "succeeded") {
      if (stat.currentRoundTripTime != null) {
        rtt = Math.round(stat.currentRoundTripTime * 1000);
      }
      const local = candidates.get(stat.localCandidateId);
      const remote = candidates.get(stat.remoteCandidateId);
      localType = local?.candidateType || localType;
      remoteType = remote?.candidateType || remoteType;
    }

    if (stat.type === "inbound-rtp" && stat.kind === "audio") {
      if (stat.jitter != null) jitter = Math.round(stat.jitter * 1000);
      const lost = Number(stat.packetsLost || 0);
      const received = Number(stat.packetsReceived || 0);
      if (received + lost > 0) {
        packetLoss = Math.round((lost / (received + lost)) * 100);
      }
    }
  }

  if (packetLoss != null && packetLoss > 8) quality = "poor";
  else if ((rtt != null && rtt > 400) || (packetLoss != null && packetLoss > 3)) quality = "fair";

  return { rtt, packetLoss, jitter, localType, remoteType, quality };
}
