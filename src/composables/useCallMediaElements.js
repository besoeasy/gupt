import { toValue, watch } from "vue";

function syncMedia(element, stream, muted = false) {
  if (!element) return;
  if (element.srcObject !== (stream || null)) element.srcObject = stream || null;
  if ("muted" in element) element.muted = muted;
}

export function useCallMediaElements({
  localVideoEl,
  remoteVideoEl,
  remoteAudioEl,
  localCallStream,
  remoteCallStream,
}) {
  if (localVideoEl && localCallStream) {
    watch(
      () => [toValue(localVideoEl), toValue(localCallStream)],
      ([el, stream]) => syncMedia(el, stream, true),
      { immediate: true },
    );
  }

  if (remoteVideoEl && remoteCallStream) {
    watch(
      () => [toValue(remoteVideoEl), toValue(remoteCallStream)],
      ([el, stream]) => syncMedia(el, stream, false),
      { immediate: true },
    );
  }

  if (remoteAudioEl && remoteCallStream) {
    watch(
      () => [toValue(remoteAudioEl), toValue(remoteCallStream)],
      ([el, stream]) => syncMedia(el, stream, false),
      { immediate: true },
    );
  }
}
