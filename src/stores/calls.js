import { defineStore } from "pinia";
import { ref } from "vue";
import { createDirectCallSession, isCallSignalType } from "@/lib/calls";
import { api } from "@/lib/api";
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

  const seenSignalIds = new Set();

  let ringtoneContext = null;
  let ringtoneTimer = null;

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

  async function sendCallSignal(payload) {
    if (!activePeerPubkey.value) return;
    const identity = useIdentityStore();
    if (!identity.privkeyHex) return;
    try {
      console.info(`[gupt-call-signal ${payload.callId || "pending"}] sending ${payload.type}`, {
        to: activePeerPubkey.value,
        hasSdp: Boolean(payload.sdp),
        hasCandidate: Boolean(payload.candidate),
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
      if (meta.state !== "idle") callError.value = "";
      if (meta.state !== "incoming") stopIncomingRingtone();
    },
    onLocalStream(stream) {
      localCallStream.value = stream;
      localHasVideo.value = Boolean(stream?.getVideoTracks?.().length);
    },
    onRemoteStream(stream) {
      remoteCallStream.value = stream;
      remoteHasVideo.value = Boolean(stream?.getVideoTracks?.().length);
    },
    onEnded() {
      incomingCall.value = null;
      localHasVideo.value = false;
      remoteHasVideo.value = false;
      stopIncomingRingtone();
      seenSignalIds.clear();
    },
  });

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
    const isRelevant =
      snapshot.state !== "idle" || now - Number(row.created_at || 0) < 30000;
    if (!isRelevant) return;

    if (row.type === "call-offer" && row.peerPubkey) {
      activePeerPubkey.value = row.peerPubkey;
    }

    try {
      console.info(`[gupt-call-signal ${row.callId || row.id}] received ${row.type}`, {
        from: row.sender,
        hasSdp: Boolean(row.sdp),
        hasCandidate: Boolean(row.candidate),
      });
      await callSession.handleSignal(row);
    } catch (e) {
      callError.value = e.message || "Unable to process the call update.";
    }
  }

  async function startAudioCall(peerPubkey) {
    activePeerPubkey.value = peerPubkey;
    callError.value = "";
    await callSession.startOutgoingCall({ audio: true, video: false });
  }

  async function startVideoCall(peerPubkey) {
    activePeerPubkey.value = peerPubkey;
    callError.value = "";
    await callSession.startOutgoingCall({ audio: true, video: true });
  }

  async function acceptIncomingCall() {
    callError.value = "";
    await callSession.acceptIncomingCall();
  }

  function declineIncomingCall() {
    callSession.declineIncomingCall();
  }

  function hangup(reason = "hangup") {
    callSession.hangup(reason);
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
    handleSignalRow,
    startAudioCall,
    startVideoCall,
    acceptIncomingCall,
    declineIncomingCall,
    hangup,
    getSnapshot,
  };
});
