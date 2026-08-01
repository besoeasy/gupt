import { defineStore } from "pinia";
import { ref } from "vue";
import {
  STATS_POLL_INTERVAL_MS,
  checkCallConnectivity,
  collectConnectionStats,
  createDirectCallSession,
  formatCallEventText,
  isCallSignalType,
} from "@/lib/webrtc";
import { api } from "@/lib/api";
import { dmRoomId, normalizeNostrPubkey } from "@/lib/crypto";
import { messenger } from "@/stores/messenger";
import { useIdentityStore } from "@/stores/identity";

export const useCallStore = defineStore("calls", () => {
  const callState = ref("idle");
  const callDirection = ref("");
  const callMedia = ref({ audio: true, video: false });
  const incomingCall = ref(null);
  const callError = ref("");
  const localCallStream = ref(null);
  const remoteCallStream = ref(null);
  const localHasVideo = ref(false);
  const remoteHasVideo = ref(false);
  const activePeerPubkey = ref("");
  const micMuted = ref(false);
  const cameraOff = ref(false);
  const isScreenSharing = ref(false);
  let savedCameraTrack = null;
  let savedCameraOff = false;
  const callQuality = ref(null);
  const connectivityWarning = ref("");
  const switchingCamera = ref(false);
  const callRequestState = ref(null); // null | { peerPubkey, media, requestId, status: 'pending'|'accepted'|'declined' }
  let currentFacingMode = "user";

  const seenSignalIds = new Set();

  let ringtoneContext = null;
  let ringtoneTimer = null;
  let statsTimer = null;
  let lastRecordedCallId = "";

  function playRingPulse(context, startAt) {
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, startAt);

    for (const [index, frequency] of [880, 660].entries()) {
      const oscillator = context.createOscillator();
      const toneStart = startAt + index * 0.32;
      const toneEnd = toneStart + 0.18;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, toneStart);
      oscillator.connect(gain);

      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(0.08, toneStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);

      oscillator.start(toneStart);
      oscillator.stop(toneEnd + 0.02);
    }
  }

  async function startIncomingRingtone() {
    if (ringtoneContext || typeof window === "undefined") return;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      ringtoneContext = new AudioContextCtor();
      if (ringtoneContext.state === "suspended") {
        await ringtoneContext.resume();
      }

      playRingPulse(ringtoneContext, ringtoneContext.currentTime + 0.05);
      ringtoneTimer = setInterval(() => {
        if (!ringtoneContext) return;
        playRingPulse(ringtoneContext, ringtoneContext.currentTime + 0.05);
      }, 2200);
    } catch {
      stopIncomingRingtone();
    }
  }

  function stopIncomingRingtone() {
    if (ringtoneTimer) clearInterval(ringtoneTimer);
    ringtoneTimer = null;

    if (!ringtoneContext) return;
    const context = ringtoneContext;
    ringtoneContext = null;
    void context.close().catch(() => {});
  }

  async function sendCallSignal(payload) {
    if (!activePeerPubkey.value) return;
    const identity = useIdentityStore();
    if (!identity.privkeyHex) return;
    try {
      await api.postDirectMessage(identity.privkeyHex, activePeerPubkey.value, {
        ...payload,
        ts: Date.now(),
      });
    } catch (e) {
      callError.value = e.message || "Unable to send call signal.";
      throw e;
    }
  }

  function stopStatsPolling() {
    if (statsTimer) clearInterval(statsTimer);
    statsTimer = null;
    callQuality.value = null;
  }

  function startStatsPolling() {
    stopStatsPolling();
    statsTimer = setInterval(() => {
      const pc = callSession.getPeerConnection();
      if (!pc || callState.value !== "connected") return;
      void collectConnectionStats(pc)
        .then((stats) => {
          if (stats) callQuality.value = stats;
        })
        .catch(() => {});
    }, STATS_POLL_INTERVAL_MS);
  }

  async function recordCallEvent(meta) {
    const callId = meta?.callId;
    const outcome = meta?.outcome;
    if (!callId || !outcome || callId === lastRecordedCallId) return;

    const peer = normalizeNostrPubkey(activePeerPubkey.value);
    const identity = useIdentityStore();
    const self = normalizeNostrPubkey(identity.pubkeyHex);
    if (!peer || !self) return;

    lastRecordedCallId = callId;
    const eventMedia = {
      audio: meta.media?.audio !== false,
      video: Boolean(meta.media?.video),
    };
    const ts = Date.now();
    const row = {
      id: `call-${callId}-${outcome}-${ts}`,
      type: "call-event",
      callId,
      outcome,
      media: eventMedia,
      durationSec: Number(meta.durationSec || 0),
      text: formatCallEventText(outcome, eventMedia, Number(meta.durationSec || 0)),
      sender: self,
      mine: true,
      ts,
      created_at: ts,
      peerPubkey: peer,
    };

    try {
      const roomId = await dmRoomId(self, peer);
      await messenger.ingestRoomRow(roomId, peer, row);
      void api
        .postDirectMessage(identity.privkeyHex, peer, {
          type: "call-event",
          callId,
          outcome,
          media: eventMedia,
          durationSec: Number(meta.durationSec || 0),
          ts,
        })
        .catch(() => {});
    } catch (e) {
      console.warn("[gupt-call] failed to record call event", e);
    }
  }

  const callSession = createDirectCallSession({
    onSignal: sendCallSignal,
    onIncoming(offer) {
      incomingCall.value = offer;
      callError.value = "";
      void startIncomingRingtone();
    },
    onStateChange(meta) {
      callState.value = meta.state;
      callDirection.value = meta.direction || "";
      callMedia.value = { audio: meta.media?.audio !== false, video: Boolean(meta.media?.video) };
      if (meta.state !== "incoming") incomingCall.value = null;
      if (meta.state === "idle" && meta.isError && meta.reason) {
        callError.value = meta.reason;
      } else if (meta.state !== "idle") {
        callError.value = "";
      }
      if (meta.state !== "incoming") stopIncomingRingtone();
      if (meta.state === "connected") startStatsPolling();
      else if (meta.state === "idle") stopStatsPolling();
    },
    onLocalStream(stream) {
      localCallStream.value = stream;
      localHasVideo.value = Boolean(stream?.getVideoTracks?.().length);
    },
    onRemoteStream(stream) {
      remoteCallStream.value = stream;
      remoteHasVideo.value = Boolean(stream?.getVideoTracks?.().length);
    },
    onEnded(meta) {
      void recordCallEvent(meta);
      incomingCall.value = null;
      localHasVideo.value = false;
      remoteHasVideo.value = false;
      micMuted.value = false;
      cameraOff.value = false;
      isScreenSharing.value = false;
      savedCameraTrack = null;
      savedCameraOff = false;
      stopIncomingRingtone();
      stopStatsPolling();
      seenSignalIds.clear();
    },
  });

  async function runConnectivityCheck() {
    connectivityWarning.value = "";
    const result = await checkCallConnectivity();
    if (result.warning) connectivityWarning.value = result.warning;
    return result;
  }

  async function handleSignalRow(row) {
    if (!isCallSignalType(row?.type) || row.mine) {
      return;
    }
    if (seenSignalIds.has(row.id)) {
      return;
    }
    seenSignalIds.add(row.id);
    if (seenSignalIds.size > 500) {
      const keep = [...seenSignalIds].slice(-250);
      seenSignalIds.clear();
      for (const id of keep) seenSignalIds.add(id);
    }

    const now = Date.now();
    const snapshot = callSession.getSnapshot();
    const isRelevant = snapshot.state !== "idle" || now - Number(row.created_at || 0) < 30000;
    if (!isRelevant) {
      console.warn(
        `[gupt-call-store] DROPPED stale signal: ${row.type} age=${Math.round((now - Number(row.created_at || 0)) / 1000)}s`,
      );
      return;
    }

    if (row.type === "call-offer" && row.sender) {
      activePeerPubkey.value = row.sender;
    }

    if (row.type === "call-accept") {
      callRequestState.value = { ...callRequestState.value, status: "accepted" };
    }

    if (row.type === "call-decline") {
      callRequestState.value = { ...callRequestState.value, status: "declined" };
    }

    try {
      await callSession.handleSignal(row);
    } catch (e) {
      callError.value = e.message || "Unable to process the call update.";
    }
  }

  async function startAudioCall(peerPubkey) {
    activePeerPubkey.value = peerPubkey;
    callError.value = "";
    lastRecordedCallId = "";
    await callSession.startOutgoingCall({ audio: true, video: false });
  }

  async function startVideoCall(peerPubkey) {
    activePeerPubkey.value = peerPubkey;
    callError.value = "";
    lastRecordedCallId = "";
    await callSession.startOutgoingCall({ audio: true, video: true });
  }

  async function sendCallRequest(peerPubkey, media = { audio: true, video: false }) {
    activePeerPubkey.value = peerPubkey;
    callError.value = "";
    const identity = useIdentityStore();
    if (!identity.privkeyHex) throw new Error("Identity not ready.");

    const requestId = `call-req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    callRequestState.value = {
      peerPubkey,
      media,
      requestId,
      status: "pending",
    };

    callSession.setPendingCallMedia(media);

    try {
      await api.postDirectMessage(identity.privkeyHex, peerPubkey, {
        type: "call-request",
        media,
        requestId,
        ts: Date.now(),
      });
    } catch (e) {
      callRequestState.value = null;
      throw e;
    }
  }

  function acceptCallRequest(row) {
    if (!row?.sender) return;
    const peer = normalizeNostrPubkey(row.sender);
    if (!peer) return;

    activePeerPubkey.value = peer;
    callError.value = "";
    lastRecordedCallId = "";

    // Send ephemeral accept signal — caller will create the offer upon receiving this
    void sendCallSignal({
      type: "call-accept",
      callId: row.requestId || "",
      ts: Date.now(),
    }).catch(() => {});

    // Mark peer so incoming offer from caller is auto-accepted
    callSession.setPendingRequestPeer(peer);
  }

  function declineCallRequest(row, reason = "declined") {
    if (!row?.sender) return;
    const peer = normalizeNostrPubkey(row.sender);
    if (!peer) return;

    void sendCallSignal({
      type: "call-decline",
      callId: row.requestId || "",
      reason,
      ts: Date.now(),
    }).catch(() => {});
  }

  async function acceptIncomingCall() {
    callError.value = "";
    lastRecordedCallId = "";
    await callSession.acceptIncomingCall();
  }

  function declineIncomingCall() {
    callSession.declineIncomingCall();
  }

  function hangup(reason = "hangup") {
    if (callState.value === "idle") {
      callError.value = "";
      return;
    }
    callSession.hangup(reason);
  }

  function toggleMic() {
    micMuted.value = !micMuted.value;
    for (const track of localCallStream.value?.getAudioTracks?.() || []) {
      track.enabled = !micMuted.value;
    }
  }

  function toggleCamera() {
    cameraOff.value = !cameraOff.value;
    for (const track of localCallStream.value?.getVideoTracks?.() || []) {
      track.enabled = !cameraOff.value;
    }
    localHasVideo.value =
      !cameraOff.value && Boolean(localCallStream.value?.getVideoTracks?.().length);
  }

  async function switchCamera() {
    if (switchingCamera.value || !localCallStream.value) return;

    // Enumerate available video-input devices
    let devices = [];
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      devices = all.filter((d) => d.kind === "videoinput");
    } catch {
      return;
    }
    if (devices.length < 2) return;

    switchingCamera.value = true;
    try {
      const nextFacingMode = currentFacingMode === "user" ? "environment" : "user";

      const newStream = await navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: { exact: nextFacingMode } },
          audio: false,
        })
        .catch(() =>
          (async () => {
            const currentTracks = localCallStream.value?.getVideoTracks?.() || [];
            const currentDeviceId = currentTracks[0]?.getSettings?.().deviceId;
            const currentIndex = devices.findIndex((d) => d.deviceId === currentDeviceId);
            const nextIndex = (currentIndex + 1) % devices.length;
            return navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: devices[nextIndex].deviceId } },
              audio: false,
            });
          })(),
        );

      const [newVideoTrack] = newStream.getVideoTracks();
      if (!newVideoTrack) return;

      const oldTracks = localCallStream.value.getVideoTracks();
      for (const old of oldTracks) {
        localCallStream.value.removeTrack(old);
        old.stop();
      }
      localCallStream.value.addTrack(newVideoTrack);

      const pc = callSession.getPeerConnection();
      if (pc) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(newVideoTrack);
      }

      currentFacingMode = nextFacingMode;
      localHasVideo.value = !cameraOff.value;
    } catch (e) {
      console.warn("[gupt-call] switchCamera failed", e);
    } finally {
      switchingCamera.value = false;
    }
  }

  async function startScreenShare() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      callError.value = "Screen sharing is not supported on this device/browser.";
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: false,
      });

      const [screenTrack] = screenStream.getVideoTracks();
      if (!screenTrack) return;

      const currentVideoTracks = localCallStream.value?.getVideoTracks?.() || [];
      if (currentVideoTracks.length && !isScreenSharing.value) {
        savedCameraTrack = currentVideoTracks[0];
        savedCameraOff = cameraOff.value;
      }

      const pc = callSession.getPeerConnection();
      if (pc) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === "video");
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, localCallStream.value || new MediaStream());
        }
      }

      if (localCallStream.value) {
        for (const t of localCallStream.value.getVideoTracks()) {
          localCallStream.value.removeTrack(t);
        }
        localCallStream.value.addTrack(screenTrack);
      } else {
        localCallStream.value = new MediaStream([screenTrack]);
      }

      localHasVideo.value = true;
      cameraOff.value = false;
      isScreenSharing.value = true;

      screenTrack.onended = () => {
        void stopScreenShare();
      };
    } catch (err) {
      if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
        console.warn("[gupt-call] Screen sharing failed:", err);
        callError.value = err?.message || "Unable to start screen sharing.";
      }
    }
  }

  async function stopScreenShare() {
    if (!isScreenSharing.value) return;
    isScreenSharing.value = false;

    const currentVideoTracks = localCallStream.value?.getVideoTracks?.() || [];
    for (const track of currentVideoTracks) {
      track.stop();
      if (localCallStream.value) localCallStream.value.removeTrack(track);
    }

    let restoredTrack = null;
    if (savedCameraTrack && savedCameraTrack.readyState === "live") {
      restoredTrack = savedCameraTrack;
    } else if (!savedCameraOff && callMedia.value?.video) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        [restoredTrack] = camStream.getVideoTracks();
      } catch {}
    }

    const pc = callSession.getPeerConnection();
    if (restoredTrack) {
      if (localCallStream.value) localCallStream.value.addTrack(restoredTrack);
      if (pc) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(restoredTrack);
      }
      cameraOff.value = savedCameraOff;
      localHasVideo.value = !savedCameraOff;
    } else {
      if (pc) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(null);
      }
      cameraOff.value = true;
      localHasVideo.value = false;
    }

    savedCameraTrack = null;
  }

  async function toggleScreenShare() {
    if (isScreenSharing.value) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  }

  function getSnapshot() {
    return callSession.getSnapshot();
  }

  return {
    callState,
    callDirection,
    callMedia,
    incomingCall,
    callError,
    localCallStream,
    remoteCallStream,
    localHasVideo,
    remoteHasVideo,
    activePeerPubkey,
    micMuted,
    cameraOff,
    isScreenSharing,
    switchingCamera,
    callQuality,
    connectivityWarning,
    callRequestState,
    handleSignalRow,
    runConnectivityCheck,
    startAudioCall,
    startVideoCall,
    sendCallRequest,
    acceptCallRequest,
    declineCallRequest,
    acceptIncomingCall,
    declineIncomingCall,
    hangup,
    toggleMic,
    toggleCamera,
    switchCamera,
    toggleScreenShare,
  };
});
