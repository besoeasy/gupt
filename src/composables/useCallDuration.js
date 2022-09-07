import { onBeforeUnmount, ref, watch } from "vue";

export function formatCallDuration(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function useCallDuration(callState) {
  const durationSeconds = ref(0);
  let durationInterval = null;

  function startTimer() {
    durationSeconds.value = 0;
    clearInterval(durationInterval);
    durationInterval = setInterval(() => {
      durationSeconds.value++;
    }, 1000);
  }

  function stopTimer() {
    clearInterval(durationInterval);
    durationInterval = null;
    durationSeconds.value = 0;
  }

  watch(
    callState,
    (state) => {
      if (state === "connected") startTimer();
      else stopTimer();
    },
    { immediate: true },
  );

  onBeforeUnmount(stopTimer);

  return { durationSeconds, formatCallDuration };
}
