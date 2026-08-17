import { readConfiguredIceServers } from "@/config/servers";
import {
  DISCONNECTED_RECOVERY_MS,
  ICE_BATCH_MS,
  MAX_ICE_RESTARTS,
  OUTGOING_RING_TIMEOUT_MS,
} from "./constants.js";
import {
  createCandidateQueue,
  createIceBatcher,
  getUserMediaWithFallback,
  toRtcSessionDescription,
} from "./peers.js";
import {
  DEFAULT_MEDIA,
  describeIceServers,
  formatMediaError,
  inferCallOutcome,
  normalizeMedia,
  randomCallId,
  serializeIceCandidate,
  summarizeCandidate,
} from "./utils.js";
import { computeCallSas } from "./sas.js";

export function createDirectCallSession(handlers = {}, options = {}) {
  const { onSignal, onStateChange, onIncoming, onLocalStream, onRemoteStream, onEnded } = handlers;
  const iceServers = options.iceServers || readConfiguredIceServers();

  let peerConnection = null;
  let localStream = null;
  let remoteStream = null;
  let currentCallId = "";
  let currentState = "idle";
  let direction = null;
  let media = { ...DEFAULT_MEDIA };
  let pendingOffer = null;
  let candidateQueue = null;
  let outgoingIceBuffer = [];
  let peerAnswered = false;
  let ringTimeout = null;
  let disconnectRecoveryTimer = null;
  let iceRestartAttempts = 0;
  let wasConnected = false;
  let connectedAt = 0;
  let pendingHangupReason = "";
  let pendingRequestPeer = null;
  let pendingCallMedia = { ...DEFAULT_MEDIA };
  let renegotiating = false;

  // Local ICE candidates are coalesced into batches before hitting the DM
  // channel — one message per candidate floods relays for no benefit.
  const iceBatcher = createIceBatcher((candidates) => emitIceCandidates(candidates), ICE_BATCH_MS);

  function log(level, message, extra) {
    if (level === "info") return;
    const logger = console[level] || console.warn;
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

  function getCallSas() {
    if (!peerConnection) return null;
    return computeCallSas(
      peerConnection.localDescription?.sdp,
      peerConnection.remoteDescription?.sdp,
      currentCallId,
    );
  }

  function emitState(state, extra = {}) {
    currentState = state;
    const sas = state === "connected" ? extra.sas || getCallSas() : null;
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
      sas,
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
      return Promise.resolve(
        onSignal?.({ type: "call-ice", callId: currentCallId, candidate: candidates[0] }),
      );
    }
    return Promise.resolve(
      onSignal?.({ type: "call-ice-batch", callId: currentCallId, candidates }),
    );
  }

  function resetSession(reason = "", extra = {}) {
    if (reason) log("warn", `reset session: ${reason}`);

    clearRingTimeout();
    clearDisconnectRecoveryTimer();
    iceBatcher.clear();

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

    candidateQueue = null;

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
    outgoingIceBuffer = [];
    peerAnswered = false;
    iceRestartAttempts = 0;
    pendingHangupReason = "";
    pendingRequestPeer = null;
    pendingCallMedia = { ...DEFAULT_MEDIA };

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

  /**
   * Renegotiate the established connection (e.g. screen share added a track to
   * an audio-only call). Reuses the call-restart/answer signaling path, so the
   * remote applies the offer and answers with a fresh call-answer.
   */
  async function renegotiate() {
    if (!peerConnection || peerConnection.signalingState === "closed") return false;
    if (renegotiating) return false;
    if (currentState !== "connected" && currentState !== "connecting") return false;

    renegotiating = true;
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await Promise.resolve(
        onSignal?.({
          type: "call-restart",
          callId: currentCallId,
          sdp: peerConnection.localDescription?.sdp || offer.sdp,
        }),
      );
      return true;
    } catch (error) {
      log("error", "renegotiation failed", error);
      return false;
    } finally {
      renegotiating = false;
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

    log("info", "creating RTCPeerConnection", { iceServers: describeIceServers(iceServers) });
    const nextConnection = new RTCPeerConnection({ iceServers });
    const nextRemoteStream = new MediaStream();
    updateRemoteStream(nextRemoteStream);
    candidateQueue = createCandidateQueue(nextConnection);

    nextConnection.onicecandidate = (event) => {
      if (!event.candidate || !currentCallId) return;
      const serialized = serializeIceCandidate(event.candidate);
      log("info", "local ICE candidate", { summary: summarizeCandidate(event.candidate) });

      if (direction === "outgoing" && !peerAnswered) {
        outgoingIceBuffer.push(serialized);
        return;
      }
      iceBatcher.push(serialized);
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

    nextConnection.onnegotiationneeded = () => {
      void renegotiate();
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

  function queueIncomingOffer(signal, { autoAccept = false } = {}) {
    if (!signal?.callId || !signal?.sdp) {
      log("warn", "ignoring call-offer: missing callId or sdp", {
        callId: signal?.callId,
        hasSdp: Boolean(signal?.sdp),
      });
      return false;
    }

    if (currentState !== "idle") {
      log("warn", `rejecting incoming call-offer: already in state "${currentState}" (busy)`, {
        callId: signal.callId,
      });
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

    if (autoAccept) {
      log("info", "auto-accepting offer (pending call request)");
      void acceptIncomingCall().catch((error) => {
        log("error", "failed to auto-accept incoming call", error);
      });
      return true;
    }

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
      await candidateQueue?.flush();
      const answer = await peerConnection.createAnswer();
      log("info", "created local answer", { sdpLength: answer.sdp?.length || 0 });
      await peerConnection.setLocalDescription(answer);

      await iceBatcher.flush();
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
      const shouldAutoAccept = pendingRequestPeer != null;
      if (shouldAutoAccept) pendingRequestPeer = null;
      return queueIncomingOffer(signal, { autoAccept: shouldAutoAccept });
    }

    if (signal.type === "call-accept") {
      log("info", "peer accepted call request — starting outgoing call");
      pendingRequestPeer = null;
      const mediaForCall = { ...pendingCallMedia };
      pendingCallMedia = { ...DEFAULT_MEDIA };
      void startOutgoingCall(mediaForCall).catch((error) => {
        log("error", "failed to start outgoing call after accept", error);
        resetSession(formatMediaError(error), { isError: true, outcome: "failed" });
      });
      return true;
    }

    if (signal.type === "call-decline") {
      log("warn", "peer declined call request", { reason: signal.reason || "declined" });
      pendingRequestPeer = null;
      const outcome = signal.reason === "busy" ? "busy" : "declined";
      resetSession(signal.reason === "busy" ? "Peer is busy." : "Call declined.", { outcome });
      return true;
    }

    const signalCallId = signal.callId;
    const pendingCallId = pendingOffer?.callId || "";
    if (!signalCallId || (signalCallId !== currentCallId && signalCallId !== pendingCallId))
      return false;

    if (signal.type === "call-answer" || signal.type === "call-restart") {
      if (!peerConnection || !signal.sdp) return false;
      const descriptionType = signal.type === "call-restart" ? "offer" : "answer";
      const wasPeerAnswered = peerAnswered;
      log("info", `applying remote ${descriptionType}`, { sdpLength: signal.sdp?.length || 0 });
      await peerConnection.setRemoteDescription(
        toRtcSessionDescription(descriptionType, signal.sdp),
      );
      await candidateQueue?.flush();

      if (signal.type === "call-restart") {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await iceBatcher.flush();
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
      void emitIceCandidates(outgoingIceBuffer.splice(0)).catch(() => {});
      if (wasPeerAnswered && wasConnected) {
        emitState("connected");
      } else {
        emitState("connecting");
      }
      return true;
    }

    if (signal.type === "call-ice") {
      if (!signal.candidate || !candidateQueue) return false;
      await candidateQueue.add([signal.candidate]);
      return true;
    }

    if (signal.type === "call-ice-batch") {
      if (!candidateQueue) return false;
      await candidateQueue.add(signal.candidates || []);
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
      pendingRequestPeer,
    };
  }

  function getPeerConnection() {
    return peerConnection;
  }

  function setPendingRequestPeer(peer) {
    pendingRequestPeer = peer;
  }

  function clearPendingRequestPeer() {
    pendingRequestPeer = null;
  }

  function setPendingCallMedia(m) {
    pendingCallMedia = normalizeMedia(m);
  }

  function clearPendingCallMedia() {
    pendingCallMedia = { ...DEFAULT_MEDIA };
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
    getCallSas,
    setPendingRequestPeer,
    clearPendingRequestPeer,
    setPendingCallMedia,
    clearPendingCallMedia,
  };
}
