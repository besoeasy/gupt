import { defineStore } from "pinia";
import { ref } from "vue";
import {
  ICE_BATCH_MS,
  STATS_POLL_INTERVAL_MS,
  checkCallConnectivity,
  collectConnectionStats,
  createDirectCallSession,
  formatCallEventText,
  isCallSignalType,
} from "@/lib/calls";
import { api } from "@/lib/api";
import { dmRoomId, normalizeNostrPubkey } from "@/lib/crypto";
import { messenger } from "@/stores/messenger";
import { useIdentityStore } from "@/stores/identity";

export { isCallSignalType };

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
  const callQuality = ref(null);
  const connectivityWarning = ref("");
  const switchingCamera = ref(false);
  let currentFacingMode = "user"; // tracks which camera is active

  const seenSignalIds = new Set();

  let ringtoneContext = null;
  let ringtoneTimer = null;
  let iceBatch = [];
  let iceBatchTimer = null;
  let iceBatchCallId = "";
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

      console.info("[gupt-call-ringtone] start incoming ringtone");
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
    console.info("[gupt-call-ringtone] stop incoming ringtone");
    const context = ringtoneContext;
    ringtoneContext = null;
    void context.close().catch(() => {});
  }

  function clearIceBatchTimer() {
    if (iceBatchTimer) clearTimeout(iceBatchTimer);
    iceBatchTimer = null;
  }

  async function sendCallSignalImmediate(payload) {
    if (!activePeerPubkey.value) return;
    const identity = useIdentityStore();
    if (!identity.privkeyHex) return;
    try {
      console.info(`[gupt-call-signal ${payload.callId || "pending"}] sending ${payload.type}`, {
        to: activePeerPubkey.value,
        hasSdp: Boolean(payload.sdp),
        hasCandidate: Boolean(payload.candidate),
        batchSize: Array.isArray(payload.candidates) ? payload.candidates.length : 0,
      });
      await api.postDirectMessage(identity.privkeyHex, activePeerPubkey.value, {
        ...payload,
        ts: Date.now(),
      });
      console.info(`[gupt-call-signal ${payload.callId || "pending"}] sent ${payload.type}`);
    } catch (e) {
      callError.value = e.message || "Unable to send call signal.";
      throw e;
    }
  }

  async function flushIceBatch() {
    clearIceBatchTimer();
    if (!iceBatch.length || !iceBatchCallId) {
      iceBatch = [];
      iceBatchCallId = "";
      return;
    }

    const candidates = iceBatch.splice(0);
    const callId = iceBatchCallId;
    iceBatchCallId = "";

    if (candidates.length === 1) {
      await sendCallSignalImmediate({
        type: "call-ice",
        callId,
        candidate: candidates[0],
      });
      return;
    }

    await sendCallSignalImmediate({
      type: "call-ice-batch",
      callId,
      candidates,
    });
  }

  async function sendCallSignal(payload) {
    if (payload?.type === "call-ice" && payload.candidate) {
      if (!iceBatchCallId) iceBatchCallId = payload.callId || "";
      iceBatch.push(payload.candidate);
      clearIceBatchTimer();
      iceBatchTimer = setTimeout(() => {
        void flushIceBatch().catch(() => {});
      }, ICE_BATCH_MS);
      return;
    }

    await flushIceBatch();
    await sendCallSignalImmediate(payload);
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
      void flushIceBatch();
      void recordCallEvent(meta);
      incomingCall.value = null;
      localHasVideo.value = false;
      remoteHasVideo.value = false;
      micMuted.value = false;
      cameraOff.value = false;
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
    if (!isCallSignalType(row?.type) || row.mine) return;
    if (seenSignalIds.has(row.id)) return;
    seenSignalIds.add(row.id);
    if (seenSignalIds.size > 500) {
      const keep = [...seenSignalIds].slice(-250);
      seenSignalIds.clear();
      for (const id of keep) seenSignalIds.add(id);
    }

    const now = Date.now();
    const snapshot = callSession.getSnapshot();
    const isRelevant = snapshot.state !== "idle" || now - Number(row.created_at || 0) < 30000;
    if (!isRelevant) return;

    if (row.type === "call-offer" && row.peerPubkey) {
      activePeerPubkey.value = row.peerPubkey;
    }

    try {
      console.info(`[gupt-call-signal ${row.callId || row.id}] received ${row.type}`, {
        from: row.sender,
        hasSdp: Boolean(row.sdp),
        hasCandidate: Boolean(row.candidate),
        batchSize: Array.isArray(row.candidates) ? row.candidates.length : 0,
      });
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
    if (devices.length < 2) return; // nothing to switch to

    switchingCamera.value = true;
    try {
      // Toggle facing mode between front and back
      const nextFacingMode = currentFacingMode === "user" ? "environment" : "user";

      const newStream = await navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: { exact: nextFacingMode } },
          audio: false,
        })
        .catch(() =>
          // Fallback: cycle by deviceId if facingMode constraint fails
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

      // Replace in local stream
      const oldTracks = localCallStream.value.getVideoTracks();
      for (const old of oldTracks) {
        localCallStream.value.removeTrack(old);
        old.stop();
      }
      localCallStream.value.addTrack(newVideoTrack);

      // Replace in the peer connection so the remote side gets the new feed
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
    switchingCamera,
    callQuality,
    connectivityWarning,
    handleSignalRow,
    runConnectivityCheck,
    startAudioCall,
    startVideoCall,
    acceptIncomingCall,
    declineIncomingCall,
    hangup,
    toggleMic,
    toggleCamera,
    switchCamera,
    getSnapshot,
  };
});
