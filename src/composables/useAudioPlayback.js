import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { finiteDurationSeconds } from "@/lib/chatUtils";

/**
 * Shared <audio> playback for chat voice notes and audio attachments.
 * Owns the element refs, playing/progress state, speed, scrubbing and a
 * deterministic waveform. Caller renders markup + calls exposed handlers.
 *
 * @param {object} opts
 * @param {() => string|null} opts.src        reactive source URL
 * @param {() => number} opts.durationMs      hint from the message
 * @param {() => string} opts.seed            stable id for waveform generation
 */
export function useAudioPlayback({ src, durationMs, seed }) {
  const audioEl = ref(null);
  const waveformRef = ref(null);
  const playing = ref(false);
  const progress = ref(0);
  const currentSecs = ref(0);
  const playbackSpeed = ref(1);
  const isScrubbing = ref(false);
  const hoverProgress = ref(null);
  const totalSecs = ref(durationFromMessage());

  function durationFromMessage() {
    const ms = Number(durationMs?.() || 0);
    return ms > 0 ? Math.round(ms / 1000) : 0;
  }

  function syncPlaybackRate() {
    if (audioEl.value) audioEl.value.playbackRate = playbackSpeed.value;
  }

  function cyclePlaybackSpeed() {
    if (playbackSpeed.value === 1) playbackSpeed.value = 1.5;
    else if (playbackSpeed.value === 1.5) playbackSpeed.value = 2;
    else playbackSpeed.value = 1;
    syncPlaybackRate();
  }

  function playbackDuration(el) {
    const fromElement = finiteDurationSeconds(el?.duration);
    if (fromElement !== null && fromElement > 0) return fromElement;
    if (totalSecs.value > 0) return totalSecs.value;
    return null;
  }

  function syncTotalDuration(el) {
    const fromElement = finiteDurationSeconds(el?.duration);
    if (fromElement !== null && fromElement > 0) {
      totalSecs.value = fromElement;
      return;
    }
    const fromMessage = durationFromMessage();
    if (fromMessage > 0) totalSecs.value = fromMessage;
  }

  function togglePlay() {
    const el = audioEl.value;
    if (!el) return;
    syncPlaybackRate();
    if (el.paused) {
      el.play();
      playing.value = true;
    } else {
      el.pause();
      playing.value = false;
    }
  }

  function onTimeUpdate() {
    const el = audioEl.value;
    if (!el || isScrubbing.value) return;
    currentSecs.value = finiteDurationSeconds(el.currentTime) ?? 0;
    const duration = playbackDuration(el);
    if (duration) progress.value = (el.currentTime / duration) * 100;
    syncTotalDuration(el);
  }

  function onEnded() {
    const el = audioEl.value;
    if (el) {
      const played = finiteDurationSeconds(el.currentTime);
      if (played !== null && played > 0 && !playbackDuration(el)) totalSecs.value = played;
    }
    playing.value = false;
    progress.value = 0;
    currentSecs.value = 0;
  }

  function seekAtEvent(e, barEl = waveformRef.value) {
    const el = audioEl.value;
    const duration = playbackDuration(el);
    if (!el || !barEl || !duration) return;
    const rect = barEl.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? rect.left;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
    progress.value = ratio * 100;
    currentSecs.value = Math.round(ratio * duration);
  }

  let activeScrubCleanup = null;

  function onWaveformPointerDown(e) {
    if (activeScrubCleanup) activeScrubCleanup();
    isScrubbing.value = true;
    seekAtEvent(e);
    const onPointerMove = (ev) => {
      if (!isScrubbing.value) return;
      seekAtEvent(ev);
    };
    const onPointerUp = () => {
      isScrubbing.value = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("touchend", onPointerUp);
      activeScrubCleanup = null;
    };
    activeScrubCleanup = () => {
      isScrubbing.value = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("touchend", onPointerUp);
      activeScrubCleanup = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("touchmove", onPointerMove, { passive: false });
    window.addEventListener("touchend", onPointerUp);
  }

  function onLoadedMetadata() {
    syncTotalDuration(audioEl.value);
    syncPlaybackRate();
  }

  function onDurationChange() {
    syncTotalDuration(audioEl.value);
    syncPlaybackRate();
  }

  const WAVE_BARS = 36;
  const waveformBars = computed(() => {
    const key = String(seed?.() || 0);
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0x7fffffff;
    return Array.from({ length: WAVE_BARS }, () => {
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      return 18 + (h % 75);
    });
  });

  // Source changes reset playback, matching previous in-parent watch.
  watch(
    () => src?.(),
    (url) => {
      if (!url) return;
      playing.value = false;
      progress.value = 0;
      currentSecs.value = 0;
      totalSecs.value = durationFromMessage();
    },
  );

  // A better duration hint can arrive after mount.
  watch(
    () => durationMs?.(),
    () => {
      const fromMessage = durationFromMessage();
      if (fromMessage > 0) totalSecs.value = fromMessage;
    },
  );

  onMounted(() => syncPlaybackRate());
  onBeforeUnmount(() => {
    if (activeScrubCleanup) activeScrubCleanup();
  });

  return {
    audioEl,
    waveformRef,
    playing,
    progress,
    currentSecs,
    totalSecs,
    playbackSpeed,
    isScrubbing,
    hoverProgress,
    waveformBars,
    togglePlay,
    cyclePlaybackSpeed,
    onTimeUpdate,
    onEnded,
    seekAtEvent,
    onWaveformPointerDown,
    onLoadedMetadata,
    onDurationChange,
  };
}
