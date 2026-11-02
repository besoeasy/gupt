import { ref, watch } from "vue";
import { defineStore } from "pinia";

const isDark = ref(
  typeof localStorage !== "undefined" ? localStorage.getItem("gupt-theme") !== "light" : true,
);

let themeTransitionTimer = 0;

function apply(dark, { animate = false } = {}) {
  const root = document.documentElement;

  if (animate) {
    // Let the palette fade instead of snapping. The class is removed once
    // the shortest surface transition has finished.
    root.classList.add("theme-switching");
    // Force a style flush so the transition starts from the old palette.
    void root.offsetHeight;
    window.clearTimeout(themeTransitionTimer);
    themeTransitionTimer = window.setTimeout(() => root.classList.remove("theme-switching"), 260);
  }

  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  localStorage.setItem("gupt-theme", dark ? "dark" : "light");
}

apply(isDark.value);

watch(isDark, (dark) => apply(dark, { animate: true }));

export const useThemeStore = defineStore("theme", () => {
  function toggle() {
    isDark.value = !isDark.value;
  }

  return { isDark, toggle };
});
