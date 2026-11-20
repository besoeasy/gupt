import { ref, watch } from "vue";
import { defineStore } from "pinia";
import { WRITER_VERSION } from "@/lib/writerVersion";

const STORAGE_KEY = "gupt:settings:v1";
// Payload version, independent of the `:v1` in the key. The key version marks
// an incompatible namespace; this one lets a payload gain fields in place.
const SETTINGS_VERSION = 1;

const DEFAULTS = {
  soundEnabled: true,
};

function loadPersisted() {
  if (typeof localStorage === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    if (typeof parsed?.soundEnabled !== "boolean") return { ...DEFAULTS };
    const state = { soundEnabled: parsed.soundEnabled };
    // Read-repair: an older payload is rewritten in the current shape as soon
    // as it is loaded, not on the next settings change (see AGENTS.md).
    if (Number(parsed.v) !== SETTINGS_VERSION || parsed.w !== WRITER_VERSION) {
      persist(state);
    }
    return state;
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(state) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: SETTINGS_VERSION, w: WRITER_VERSION, ...state }),
    );
  } catch {}
}

export const useSettingsStore = defineStore("settings", () => {
  const initial = loadPersisted();
  const soundEnabled = ref(initial.soundEnabled);

  watch(
    [soundEnabled],
    () =>
      persist({
        soundEnabled: soundEnabled.value,
      }),
    { flush: "post" },
  );

  return { soundEnabled };
});
