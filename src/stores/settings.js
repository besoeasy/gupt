import { ref, watch } from "vue";
import { defineStore } from "pinia";

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

function isElectron() {
  return typeof window !== "undefined" && window.gupt?.isElectron === true;
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
    if (!isElectron()) return;
    try {
      autostartEnabled.value = await window.gupt.autostart.get();
    } catch (err) {
      console.warn("[gupt-settings] autostart hydrate failed", err);
    }
  }

  async function setAutostartEnabled(enabled) {
    const next = !!enabled;
    if (isElectron()) {
      try {
        await window.gupt.autostart.set(next);
      } catch (err) {
        console.warn("[gupt-settings] autostart set failed", err);
        return;
      }
    }
    autostartEnabled.value = next;
  }

  return {
    notificationsEnabled,
    soundEnabled,
    autostartEnabled,
    hydrateAutostart,
    setAutostartEnabled,
    isElectron: isElectron(),
  };
});
