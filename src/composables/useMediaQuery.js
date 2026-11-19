import { onMounted, onUnmounted, ref } from "vue";

/**
 * Reactive `matchMedia`. Reads the initial value during setup so the first
 * paint already has the right answer, then follows viewport changes.
 */
export function useMediaQuery(query) {
  const matches = ref(
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  let mql = null;

  function update(event) {
    matches.value = event.matches;
  }

  onMounted(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    mql = window.matchMedia(query);
    matches.value = mql.matches;
    mql.addEventListener("change", update);
  });

  onUnmounted(() => {
    mql?.removeEventListener("change", update);
    mql = null;
  });

  return matches;
}
