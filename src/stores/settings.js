import { ref, watch } from "vue";
import { defineStore } from "pinia";

const STORAGE_KEY = "gupt:settings:v1";

const DEFAULTS = {
  soundEnabled: true,
};

function loadPersisted() {
  if (typeof localStorage === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(state) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export const useSettingsStore = defineStore("settings", () => {
  const initial = loadPersisted();
  const soundEnabled = ref(initial.soundEnabled);

  watch(soundEnabled, (value) => persist({ soundEnabled: value }), { flush: "post" });

  return { soundEnabled };
});
