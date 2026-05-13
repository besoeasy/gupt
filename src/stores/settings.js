import { ref, watch } from "vue";
import { defineStore } from "pinia";
import { runtime } from "@/lib/runtime";

const STORAGE_KEY = "gupt:settings:v1";

const DEFAULTS = {
  notificationsEnabled: true,
  soundEnabled: true,
  autostartEnabled: false,
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
  } catch {
    /* quota / private mode — silently ignore */
  }
}

export const useSettingsStore = defineStore("settings", () => {
  const initial = loadPersisted();

  const notificationsEnabled = ref(initial.notificationsEnabled);
  const soundEnabled = ref(initial.soundEnabled);
  const autostartEnabled = ref(initial.autostartEnabled);

  watch(
    [notificationsEnabled, soundEnabled, autostartEnabled],
    ([n, s, a]) => persist({ notificationsEnabled: n, soundEnabled: s, autostartEnabled: a }),
    { flush: "post" },
  );

  async function hydrateAutostart() {
    autostartEnabled.value = false;
  }

  async function setAutostartEnabled(enabled) {
    autostartEnabled.value = !!enabled && runtime.supportsAutostart;
  }

  return {
    notificationsEnabled,
    soundEnabled,
    autostartEnabled,
    hydrateAutostart,
    setAutostartEnabled,
    autostartSupported: runtime.supportsAutostart,
  };
});
