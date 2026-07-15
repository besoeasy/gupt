import { DEFAULT_ICE_SERVERS } from "@/config/servers";

export const OUTGOING_RING_TIMEOUT_MS = 45_000;
export const ICE_BATCH_MS = 1500;
export const DISCONNECTED_RECOVERY_MS = 8_000;
export const MAX_ICE_RESTARTS = 2;
export const CONNECTIVITY_CHECK_TIMEOUT_MS = 5_000;
export const STATS_POLL_INTERVAL_MS = 3_000;

export const CALL_SIGNAL_TYPES = Object.freeze([
  "call-offer",
  "call-answer",
  "call-ice",
  "call-ice-batch",
  "call-restart",
  "call-reject",
  "call-hangup",
]);

export const CALL_EVENT_OUTCOMES = Object.freeze([
  "ended",
  "no-answer",
  "declined",
  "cancelled",
  "busy",
  "missed",
  "failed",
]);

export function isCallSignalType(type) {
  return CALL_SIGNAL_TYPES.includes(type);
}

const DEFAULT_MEDIA = Object.freeze({ audio: true, video: false });

function normalizeMedia(media) {
  return {
    audio: media?.audio !== false,
    video: Boolean(media?.video),
  };
}

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

async function getUserMediaWithFallback(requestedMedia, log) {
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

function randomCallId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toRtcIceCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  return new RTCIceCandidate(candidate);
}

function toRtcSessionDescription(type, sdp) {
  return new RTCSessionDescription({ type, sdp });
}

function serializeIceCandidate(candidate) {
  if (!candidate) return null;
  if (typeof candidate.toJSON === "function") return candidate.toJSON();

  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment,
  };
}

function summarizeCandidate(candidate) {
  if (!candidate?.candidate || typeof candidate.candidate !== "string") return "unknown";

  const parts = candidate.candidate.trim().split(/\s+/);
  const typeIndex = parts.findIndex((part) => part === "typ");
  const protocol = parts[2] || "unknown";
  const candidateType = typeIndex !== -1 ? parts[typeIndex + 1] || "unknown" : "unknown";
  const address = parts[4] || "unknown";
  const port = parts[5] || "unknown";
  return `${candidateType}/${protocol} ${address}:${port}`;
}

function candidateTypeOf(candidate) {
  const summary = summarizeCandidate(candidate);
  return summary.split("/")[0] || "unknown";
}

function describeIceServers(servers) {
  return servers.flatMap((server) =>
    (Array.isArray(server?.urls) ? server.urls : [server?.urls]).filter(Boolean),
  );
}

function setupTransceivers(connection, wantsVideo) {
  const existing = connection.getTransceivers?.() || [];
  if (existing.length) return;
  connection.addTransceiver("audio", { direction: "sendrecv" });
  if (wantsVideo) connection.addTransceiver("video", { direction: "sendrecv" });
}

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

export function createDirectCallSession(handlers = {}) {
  const { onSignal, onStateChange, onIncoming, onLocalStream, onRemoteStream, onEnded } = handlers;

  let peerConnection = null;
  let localStream = null;
  let remoteStream = null;
  let currentCallId = "";
  let currentState = "idle";
  let direction = null;
  let media = { ...DEFAULT_MEDIA };
  let pendingOffer = null;
  let queuedCandidates = [];
  let outgoingIceBuffer = [];
  let peerAnswered = false;
  let ringTimeout = null;
  let disconnectRecoveryTimer = null;
  let iceRestartAttempts = 0;
  let wasConnected = false;
  let connectedAt = 0;
  let pendingHangupReason = "";

  function log(level, message, extra) {
    const logger = console[level] || console.log;
    const callId = currentCallId || pendingOffer?.callId || "pending";
    const prefix = `[gupt-call ${callId}] ${message}`;

    if (typeof extra === "undefined") {
      logger(prefix);
      return;
    }

    logger(prefix, extra);
  }

  function clearRingTimeout() {
    if (ringTimeout) clearTimeout(ringTimeout);
    ringTimeout = null;
  }

  function clearDisconnectRecoveryTimer() {
    if (disconnectRecoveryTimer) clearTimeout(disconnectRecoveryTimer);
    disconnectRecoveryTimer = null;
  }

  function getDurationSec() {
    if (!wasConnected || !connectedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - connectedAt) / 1000));
  }

  function emitState(state, extra = {}) {
    currentState = state;
    log("info", `state -> ${state}`, {
      direction,
      media,
      ...extra,
    });
    onStateChange?.({
      state,
      callId: currentCallId || pendingOffer?.callId || "",
      direction,
      media: { ...media },
      ...extra,
    });

    if (state === "outgoing") startRingTimeout();
    else clearRingTimeout();
  }

  function startRingTimeout() {
    clearRingTimeout();
    ringTimeout = setTimeout(() => {
      if (currentState !== "outgoing") return;
      log("warn", "outgoing ring timeout");
      pendingHangupReason = "no-answer";
      hangup("no-answer");
    }, OUTGOING_RING_TIMEOUT_MS);
  }

  function updateLocalStream(stream) {
    localStream = stream;
    onLocalStream?.(stream);
  }

  function updateRemoteStream(stream) {
    remoteStream = stream;
    onRemoteStream?.(stream);
  }

  function stopStream(stream) {
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
  }

  function emitIceCandidates(candidates) {
    if (!candidates.length || !currentCallId) return;
    if (candidates.length === 1) {
      onSignal?.({ type: "call-ice", callId: currentCallId, candidate: candidates[0] });
      return;
    }
    onSignal?.({ type: "call-ice-batch", callId: currentCallId, candidates });
  }

  function resetSession(reason = "", extra = {}) {
    if (reason) log("warn", `reset session: ${reason}`);

    clearRingTimeout();
    clearDisconnectRecoveryTimer();

    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.onicecandidateerror = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.onicegatheringstatechange = null;
      peerConnection.onsignalingstatechange = null;
      peerConnection.close();
      peerConnection = null;
    }

    stopStream(localStream);
    stopStream(remoteStream);
    updateLocalStream(null);
    updateRemoteStream(null);

    const finishedCallId = currentCallId || pendingOffer?.callId || "";
    const durationSec = getDurationSec();
    const hangupReason = extra.hangupReason || pendingHangupReason || "";
    const outcome = inferCallOutcome(reason, { ...extra, hangupReason });
    const savedDirection = direction;
    const savedMedia = { ...media };

    currentCallId = "";
    direction = null;
    media = { ...DEFAULT_MEDIA };
    pendingOffer = null;
    queuedCandidates = [];
    outgoingIceBuffer = [];
    peerAnswered = false;
    iceRestartAttempts = 0;
    pendingHangupReason = "";

    const wasEverConnected = wasConnected;
    wasConnected = false;
    connectedAt = 0;

    emitState("idle", { reason, callId: finishedCallId, ...extra });
    if (finishedCallId || reason) {
      onEnded?.({
        callId: finishedCallId,
        reason,
        direction: savedDirection,
        media: savedMedia,
        durationSec,
        outcome,
        wasConnected: wasEverConnected,
        hangupReason,
      });
    }
  }

  async function attemptIceRestart() {
    if (!peerConnection || iceRestartAttempts >= MAX_ICE_RESTARTS) return false;
    if (peerConnection.signalingState === "closed") return false;

    iceRestartAttempts += 1;
    log("info", `attempting ICE restart (${iceRestartAttempts}/${MAX_ICE_RESTARTS})`);

    try {
      const offer = await peerConnection.createOffer({ iceRestart: true });
      await peerConnection.setLocalDescription(offer);
      await Promise.resolve(
        onSignal?.({
          type: "call-restart",
          callId: currentCallId,
          sdp: peerConnection.localDescription?.sdp || offer.sdp,
        }),
      );
      emitState("connecting", { recovering: true });
      return true;
    } catch (error) {
      log("error", "ICE restart failed", error);
      return false;
    }
  }

  function scheduleDisconnectRecovery() {
    clearDisconnectRecoveryTimer();
    if (!wasConnected || iceRestartAttempts >= MAX_ICE_RESTARTS) return;

    disconnectRecoveryTimer = setTimeout(() => {
      if (!peerConnection) return;
      const state = peerConnection.connectionState;
      if (state !== "disconnected" && state !== "failed") return;
      void attemptIceRestart().then((ok) => {
        if (!ok && peerConnection?.connectionState !== "connected") {
          resetSession("Connection lost.", { isError: true, outcome: "failed" });
        }
      });
    }, DISCONNECTED_RECOVERY_MS);
  }

  function createPeerConnection() {
    if (peerConnection) return peerConnection;

    const iceServers = DEFAULT_ICE_SERVERS;
    log("info", "creating RTCPeerConnection", { iceServers: describeIceServers(iceServers) });
    const nextConnection = new RTCPeerConnection({ iceServers });
    const nextRemoteStream = new MediaStream();
    updateRemoteStream(nextRemoteStream);

    nextConnection.onicecandidate = (event) => {
      if (!event.candidate || !currentCallId) return;
      const serialized = serializeIceCandidate(event.candidate);
      log("info", "local ICE candidate", { summary: summarizeCandidate(event.candidate) });
      if (direction === "outgoing" && !peerAnswered) {
        outgoingIceBuffer.push(serialized);
        return;
      }
      emitIceCandidates([serialized]);
    };

    nextConnection.onicecandidateerror = (event) => {
      log("error", "ICE candidate error", {
        address: event.address,
        port: event.port,
        url: event.url,
        errorCode: event.errorCode,
        errorText: event.errorText,
      });
    };

    nextConnection.ontrack = (event) => {
      log("info", "remote track received", {
        kind: event.track?.kind,
        streams: event.streams?.map((stream) => stream.id) || [],
      });
      const tracks = event.streams?.[0]?.getTracks?.() || [event.track];
      for (const track of tracks) {
        if (nextRemoteStream.getTracks().some((entry) => entry.id === track.id)) continue;
        nextRemoteStream.addTrack(track);
      }
      updateRemoteStream(nextRemoteStream);
    };

    nextConnection.onconnectionstatechange = () => {
      const state = nextConnection.connectionState;
      log("info", `peer connection state -> ${state}`);

      if (state === "connected") {
        clearDisconnectRecoveryTimer();
        wasConnected = true;
        connectedAt = Date.now();
        iceRestartAttempts = 0;
        emitState("connected");
        return;
      }

      if (state === "connecting") {
        emitState("connecting");
        return;
      }

      if (state === "disconnected") {
        scheduleDisconnectRecovery();
        return;
      }

      if (state === "failed") {
        if (wasConnected && iceRestartAttempts < MAX_ICE_RESTARTS) {
          void attemptIceRestart().then((ok) => {
            if (!ok) resetSession("Connection lost.", { isError: true, outcome: "failed" });
          });
        } else {
          resetSession("Connection lost.", { isError: true, outcome: "failed" });
        }
      }
    };

    nextConnection.oniceconnectionstatechange = () => {
      log("info", `ice connection state -> ${nextConnection.iceConnectionState}`);
    };

    nextConnection.onicegatheringstatechange = () => {
      log("info", `ice gathering state -> ${nextConnection.iceGatheringState}`);
    };

    nextConnection.onsignalingstatechange = () => {
      log("info", `signaling state -> ${nextConnection.signalingState}`);
    };

    peerConnection = nextConnection;
    return nextConnection;
  }

  async function ensureLocalMedia(nextMedia) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support audio/video calls.");
    }

    log("info", "requesting local media", nextMedia);

    const { stream, media: resolvedMedia } = await getUserMediaWithFallback(nextMedia, log);
    media = resolvedMedia;
    if (resolvedMedia.video !== Boolean(nextMedia.video)) {
      log("warn", "video unavailable, continuing with audio only");
    }

    log("info", "local media ready", {
      audioTracks: stream.getAudioTracks().map((track) => track.label || track.id),
      videoTracks: stream.getVideoTracks().map((track) => track.label || track.id),
    });
    updateLocalStream(stream);
    const connection = createPeerConnection();
    for (const track of stream.getTracks()) {
      log("info", "adding local track", { kind: track.kind, id: track.id, label: track.label });
      connection.addTrack(track, stream);
    }
    return stream;
  }

  async function addRemoteCandidates(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) return;

    if (!peerConnection?.remoteDescription) {
      queuedCandidates.push(...candidates);
      log(
        "info",
        `queueing ${candidates.length} remote ICE candidate(s) until remote description is ready`,
      );
      return;
    }

    for (const candidate of candidates) {
      const rtcCandidate = toRtcIceCandidate(candidate);
      if (!rtcCandidate) continue;
      log("info", "adding remote ICE candidate", { summary: summarizeCandidate(candidate) });
      await peerConnection.addIceCandidate(rtcCandidate);
    }
  }

  async function flushQueuedCandidates() {
    if (!peerConnection?.remoteDescription) return;

    const pending = [...queuedCandidates];
    queuedCandidates = [];
    if (pending.length) log("info", `flushing queued ICE candidates: ${pending.length}`);
    await addRemoteCandidates(pending);
  }

  async function startOutgoingCall(nextMedia = DEFAULT_MEDIA) {
    if (currentState !== "idle") throw new Error("A call is already in progress.");

    media = normalizeMedia(nextMedia);
    direction = "outgoing";
    currentCallId = randomCallId();
    log("info", "starting outgoing call", { media });
    emitState("requesting-media");

    try {
      createPeerConnection();
      await ensureLocalMedia(media);
      const offer = await peerConnection.createOffer();
      log("info", "created local offer", { sdpLength: offer.sdp?.length || 0 });
      await peerConnection.setLocalDescription(offer);
      emitState("outgoing");
      await Promise.resolve(
        onSignal?.({
          type: "call-offer",
          callId: currentCallId,
          media: { ...media },
          sdp: peerConnection.localDescription?.sdp || offer.sdp,
        }),
      );
      log("info", "sent call offer");
    } catch (error) {
      log("error", "failed to start outgoing call", error);
      resetSession(formatMediaError(error), { isError: true, outcome: "failed" });
      throw error;
    }
  }

  function queueIncomingOffer(signal) {
    if (!signal?.callId || !signal?.sdp) {
      log("warn", "ignoring call-offer: missing callId or sdp", { callId: signal?.callId, hasSdp: Boolean(signal?.sdp) });
      return false;
    }

    if (currentState !== "idle") {
      log("warn", `rejecting incoming call-offer: already in state "${currentState}" (busy)`, { callId: signal.callId });
      void Promise.resolve(
        onSignal?.({ type: "call-reject", callId: signal.callId, reason: "busy" }),
      ).catch(() => {});
      return false;
    }

    pendingOffer = {
      callId: signal.callId,
      sdp: signal.sdp,
      media: normalizeMedia(signal.media),
    };
    log("info", "queued incoming offer", {
      callId: signal.callId,
      media: pendingOffer.media,
      sdpLength: signal.sdp?.length || 0,
    });
    media = { ...pendingOffer.media };
    direction = "incoming";
    emitState("incoming");
    onIncoming?.({ ...pendingOffer });
    return true;
  }

  async function acceptIncomingCall() {
    if (!pendingOffer) throw new Error("There is no incoming call to answer.");

    currentCallId = pendingOffer.callId;
    media = normalizeMedia(pendingOffer.media);
    direction = "incoming";
    log("info", "accepting incoming call", { media, callId: currentCallId });
    emitState("requesting-media");

    try {
      createPeerConnection();
      log("info", "applying remote offer", { sdpLength: pendingOffer.sdp?.length || 0 });
      await peerConnection.setRemoteDescription(toRtcSessionDescription("offer", pendingOffer.sdp));
      await ensureLocalMedia(media);
      await flushQueuedCandidates();
      const answer = await peerConnection.createAnswer();
      log("info", "created local answer", { sdpLength: answer.sdp?.length || 0 });
      await peerConnection.setLocalDescription(answer);
      await Promise.resolve(
        onSignal?.({
          type: "call-answer",
          callId: currentCallId,
          sdp: peerConnection.localDescription?.sdp || answer.sdp,
        }),
      );
      log("info", "sent call answer");
      pendingOffer = null;
      emitState("connecting");
    } catch (error) {
      log("error", "failed to accept incoming call", error);
      void Promise.resolve(
        onSignal?.({ type: "call-reject", callId: currentCallId, reason: "unavailable" }),
      ).catch(() => {});
      resetSession(formatMediaError(error), { isError: true, outcome: "failed" });
      throw error;
    }
  }

  function declineIncomingCall(reason = "declined") {
    if (!pendingOffer) return;
    const rejectedCallId = pendingOffer.callId;
    log("warn", "declining incoming call", { callId: rejectedCallId, reason });
    void Promise.resolve(onSignal?.({ type: "call-reject", callId: rejectedCallId, reason })).catch(
      () => {},
    );
    const message = reason === "busy" ? "Other call in progress." : "Call declined.";
    resetSession(message, { outcome: reason === "busy" ? "busy" : "declined" });
  }

  async function handleSignal(signal) {
    if (!signal || typeof signal !== "object" || !signal.type) return false;

    log("info", `received signal ${signal.type}`, {
      callId: signal.callId || "",
      hasSdp: Boolean(signal.sdp),
      hasCandidate: Boolean(signal.candidate),
      batchSize: Array.isArray(signal.candidates) ? signal.candidates.length : 0,
    });

    if (signal.type === "call-offer") {
      return queueIncomingOffer(signal);
    }

    const signalCallId = signal.callId;
    const pendingCallId = pendingOffer?.callId || "";
    if (!signalCallId || (signalCallId !== currentCallId && signalCallId !== pendingCallId))
      return false;

    if (signal.type === "call-answer" || signal.type === "call-restart") {
      if (!peerConnection || !signal.sdp) return false;
      const descriptionType = signal.type === "call-restart" ? "offer" : "answer";
      log("info", `applying remote ${descriptionType}`, { sdpLength: signal.sdp?.length || 0 });
      await peerConnection.setRemoteDescription(
        toRtcSessionDescription(descriptionType, signal.sdp),
      );
      await flushQueuedCandidates();

      if (signal.type === "call-restart") {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await Promise.resolve(
          onSignal?.({
            type: "call-answer",
            callId: currentCallId,
            sdp: peerConnection.localDescription?.sdp || answer.sdp,
          }),
        );
        emitState("connecting", { recovering: true });
        return true;
      }

      peerAnswered = true;
      emitIceCandidates(outgoingIceBuffer.splice(0));
      emitState("connecting");
      return true;
    }

    if (signal.type === "call-ice") {
      if (!signal.candidate) return false;
      await addRemoteCandidates([signal.candidate]);
      return true;
    }

    if (signal.type === "call-ice-batch") {
      await addRemoteCandidates(signal.candidates || []);
      return true;
    }

    if (signal.type === "call-reject") {
      log("warn", "peer rejected call", { reason: signal.reason || "declined" });
      const outcome = signal.reason === "busy" ? "busy" : "declined";
      resetSession(signal.reason === "busy" ? "Peer is busy." : "Call declined.", { outcome });
      return true;
    }

    if (signal.type === "call-hangup") {
      log("info", "peer ended call", { reason: signal.reason || "hangup" });
      let outcome = wasConnected ? "ended" : "cancelled";
      if (signal.reason === "no-answer") {
        outcome = currentState === "incoming" || pendingOffer ? "missed" : "no-answer";
      }
      resetSession("Call ended.", { outcome, hangupReason: signal.reason || "hangup" });
      return true;
    }

    return false;
  }

  function hangup(reason = "hangup") {
    const activeCallId = currentCallId || pendingOffer?.callId;
    pendingHangupReason = reason;

    if (activeCallId) {
      log("info", "ending local call", { callId: activeCallId, reason });
      void Promise.resolve(onSignal?.({ type: "call-hangup", callId: activeCallId, reason })).catch(
        () => {},
      );
    }

    let message = "Call ended.";
    let outcome = wasConnected ? "ended" : "cancelled";
    if (reason === "no-answer") {
      message = "No answer.";
      outcome = "no-answer";
    } else if (reason === "cancelled") {
      message = "Call cancelled.";
      outcome = "cancelled";
    }

    resetSession(message, { hangupReason: reason, outcome });
  }

  function dispose() {
    resetSession("");
  }

  function getSnapshot() {
    return {
      state: currentState,
      callId: currentCallId || pendingOffer?.callId || "",
      direction,
      media: { ...media },
      hasIncomingOffer: Boolean(pendingOffer),
      wasConnected,
      durationSec: getDurationSec(),
    };
  }

  function getPeerConnection() {
    return peerConnection;
  }

  return {
    startOutgoingCall,
    acceptIncomingCall,
    declineIncomingCall,
    handleSignal,
    hangup,
    dispose,
    getSnapshot,
    getPeerConnection,
  };
}
