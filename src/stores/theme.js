import { ref, watch } from "vue";
import { defineStore } from "pinia";

const isDark = ref(
  typeof localStorage !== "undefined" ? localStorage.getItem("gupt-theme") !== "light" : true,
);

function apply(dark) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  localStorage.setItem("gupt-theme", dark ? "dark" : "light");
}

apply(isDark.value);

watch(isDark, apply);

export const useThemeStore = defineStore("theme", () => {
  function toggle() {
    isDark.value = !isDark.value;
  }

  return { isDark, toggle };
});
