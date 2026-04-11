import { readConfiguredIceServers } from "@/config/servers";

export const CALL_SIGNAL_TYPES = Object.freeze([
  "call-offer",
  "call-answer",
  "call-ice",
  "call-reject",
  "call-hangup",
]);

export function isCallSignalType(type) {
  return CALL_SIGNAL_TYPES.includes(type);
}

const DEFAULT_MEDIA = Object.freeze({ audio: true, video: false });

function readIceServers() {
  return readConfiguredIceServers();
}

function normalizeMedia(media) {
  return {
    audio: media?.audio !== false,
    video: Boolean(media?.video),
  };
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

function describeIceServers(servers) {
  return servers.flatMap((server) =>
    (Array.isArray(server?.urls) ? server.urls : [server?.urls]).filter(Boolean),
  );
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
  let relayFallbackAttempted = false;
  let outgoingIceBuffer = [];
  let peerAnswered = false;

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

  function resetSession(reason = "") {
    if (reason) log("warn", `reset session: ${reason}`);
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
    currentCallId = "";
    direction = null;
    media = { ...DEFAULT_MEDIA };
    pendingOffer = null;
    queuedCandidates = [];
    relayFallbackAttempted = false;
    outgoingIceBuffer = [];
    peerAnswered = false;
    emitState("idle", { reason, callId: finishedCallId });
    if (finishedCallId || reason) onEnded?.({ callId: finishedCallId, reason });
  }

  function createPeerConnection() {
    if (peerConnection) return peerConnection;

    const iceServers = readIceServers();
    log("info", "creating RTCPeerConnection", { iceServers: describeIceServers(iceServers) });
    const nextConnection = new RTCPeerConnection({ iceServers });
    const nextRemoteStream = new MediaStream();
    updateRemoteStream(nextRemoteStream);

    nextConnection.onicecandidate = (event) => {
      if (!event.candidate || !currentCallId) return;
      log("info", "local ICE candidate", { summary: summarizeCandidate(event.candidate) });
      if (direction === "outgoing" && !peerAnswered) {
        outgoingIceBuffer.push(serializeIceCandidate(event.candidate));
        return;
      }
      onSignal?.({
        type: "call-ice",
        callId: currentCallId,
        candidate: serializeIceCandidate(event.candidate),
      });
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
        emitState("connected");
        return;
      }

      if (state === "connecting") {
        emitState("connecting");
        return;
      }

      if (state === "disconnected" || state === "failed") {
        // On first failure, attempt an ICE restart so the relay (TURN) candidates are tried.
        // This helps on restrictive networks like JIO CGNAT where STUN cannot establish
        // a direct peer-to-peer path but a TURN relay can.
        if (state === "failed" && !relayFallbackAttempted && currentCallId) {
          relayFallbackAttempted = true;
          log("warn", "connection failed — attempting ICE restart via relay fallback");
          emitState("connecting", { relay: true });
          try {
            nextConnection.restartIce();
            nextConnection.createOffer({ iceRestart: true }).then((offer) => {
              return nextConnection.setLocalDescription(offer).then(() => {
                onSignal?.({
                  type: "call-offer",
                  callId: currentCallId,
                  media: { ...media },
                  sdp: nextConnection.localDescription?.sdp || offer.sdp,
                  iceRestart: true,
                });
              });
            }).catch((err) => {
              log("error", "ICE restart failed", err);
              resetSession("Connection lost.");
            });
          } catch (err) {
            log("error", "ICE restart error", err);
            resetSession("Connection lost.");
          }
          return;
        }
        resetSession("Connection lost.");
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

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: nextMedia.audio !== false,
      video: Boolean(nextMedia.video),
    });

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

  async function flushQueuedCandidates() {
    if (!peerConnection?.remoteDescription) return;

    const pending = [...queuedCandidates];
    queuedCandidates = [];
    if (pending.length) log("info", `flushing queued ICE candidates: ${pending.length}`);

    for (const candidate of pending) {
      const rtcCandidate = toRtcIceCandidate(candidate);
      if (!rtcCandidate) continue;
      log("info", "adding queued remote ICE candidate", { summary: summarizeCandidate(candidate) });
      await peerConnection.addIceCandidate(rtcCandidate);
    }
  }

  async function startOutgoingCall(nextMedia = DEFAULT_MEDIA) {
    if (currentState !== "idle") throw new Error("A call is already in progress.");

    media = normalizeMedia(nextMedia);
    direction = "outgoing";
    currentCallId = randomCallId();
    log("info", "starting outgoing call", { media });
    emitState("requesting-media");

    try {
      const connection = createPeerConnection();
      await ensureLocalMedia(media);
      const offer = await connection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: media.video,
      });
      log("info", "created local offer", { sdpLength: offer.sdp?.length || 0 });
      await connection.setLocalDescription(offer);
      emitState("outgoing");
      await Promise.resolve(
        onSignal?.({
          type: "call-offer",
          callId: currentCallId,
          media: { ...media },
          sdp: connection.localDescription?.sdp || offer.sdp,
        }),
      );
      log("info", "sent call offer");
    } catch (error) {
      log("error", "failed to start outgoing call", error);
      resetSession(error instanceof Error ? error.message : "Unable to start the call.");
      throw error;
    }
  }

  function queueIncomingOffer(signal) {
    if (!signal?.callId || !signal?.sdp) return false;

    if (currentState !== "idle") {
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
      const connection = createPeerConnection();
      await ensureLocalMedia(media);
      log("info", "applying remote offer", { sdpLength: pendingOffer.sdp?.length || 0 });
      await connection.setRemoteDescription(toRtcSessionDescription("offer", pendingOffer.sdp));
      await flushQueuedCandidates();
      const answer = await connection.createAnswer();
      log("info", "created local answer", { sdpLength: answer.sdp?.length || 0 });
      await connection.setLocalDescription(answer);
      await Promise.resolve(
        onSignal?.({
          type: "call-answer",
          callId: currentCallId,
          sdp: connection.localDescription?.sdp || answer.sdp,
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
      resetSession(error instanceof Error ? error.message : "Unable to answer the call.");
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
    resetSession(reason === "busy" ? "Other call in progress." : "Call declined.");
  }

  async function handleSignal(signal) {
    if (!signal || typeof signal !== "object" || !signal.type) return false;

    log("info", `received signal ${signal.type}`, {
      callId: signal.callId || "",
      hasSdp: Boolean(signal.sdp),
      hasCandidate: Boolean(signal.candidate),
    });

    if (signal.type === "call-offer") {
      // ICE restart re-offer from the caller side: apply new remote description and re-answer.
      if (signal.iceRestart && peerConnection && currentCallId === signal.callId) {
        log("info", "applying ICE restart offer from peer", { sdpLength: signal.sdp?.length || 0 });
        try {
          await peerConnection.setRemoteDescription(toRtcSessionDescription("offer", signal.sdp));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          onSignal?.({
            type: "call-answer",
            callId: currentCallId,
            sdp: peerConnection.localDescription?.sdp || answer.sdp,
          });
        } catch (err) {
          log("error", "failed to handle ICE restart offer", err);
        }
        return true;
      }
      return queueIncomingOffer(signal);
    }

    const signalCallId = signal.callId;
    const pendingCallId = pendingOffer?.callId || "";
    if (!signalCallId || (signalCallId !== currentCallId && signalCallId !== pendingCallId))
      return false;

    if (signal.type === "call-answer") {
      if (!peerConnection || !signal.sdp) return false;
      log("info", "applying remote answer", { sdpLength: signal.sdp?.length || 0 });
      await peerConnection.setRemoteDescription(toRtcSessionDescription("answer", signal.sdp));
      await flushQueuedCandidates();
      peerAnswered = true;
      const buffered = outgoingIceBuffer.splice(0);
      for (const candidate of buffered) {
        onSignal?.({ type: "call-ice", callId: currentCallId, candidate });
      }
      emitState("connecting");
      return true;
    }

    if (signal.type === "call-ice") {
      if (!signal.candidate) return false;

      if (!peerConnection?.remoteDescription) {
        log("info", "queueing remote ICE candidate until remote description is ready", {
          summary: summarizeCandidate(signal.candidate),
        });
        queuedCandidates.push(signal.candidate);
        return true;
      }

      const rtcCandidate = toRtcIceCandidate(signal.candidate);
      if (!rtcCandidate) return false;
      log("info", "adding remote ICE candidate", { summary: summarizeCandidate(signal.candidate) });
      await peerConnection.addIceCandidate(rtcCandidate);
      return true;
    }

    if (signal.type === "call-reject") {
      log("warn", "peer rejected call", { reason: signal.reason || "declined" });
      resetSession(signal.reason === "busy" ? "Peer is busy." : "Call declined.");
      return true;
    }

    if (signal.type === "call-hangup") {
      log("info", "peer ended call", { reason: signal.reason || "hangup" });
      resetSession("Call ended.");
      return true;
    }

    return false;
  }

  function hangup(reason = "hangup") {
    const activeCallId = currentCallId || pendingOffer?.callId;
    if (activeCallId) {
      log("info", "ending local call", { callId: activeCallId, reason });
      void Promise.resolve(onSignal?.({ type: "call-hangup", callId: activeCallId, reason })).catch(
        () => {},
      );
    }
    resetSession(reason === "cancelled" ? "Call cancelled." : "Call ended.");
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
    };
  }

  return {
    startOutgoingCall,
    acceptIncomingCall,
    declineIncomingCall,
    handleSignal,
    hangup,
    dispose,
    getSnapshot,
  };
}
