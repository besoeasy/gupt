import { ref, watch } from "vue";

const isDark = ref(
  typeof localStorage !== "undefined" ? localStorage.getItem("gupt-theme") !== "light" : true,
);

const appTheme = ref(
  typeof localStorage !== "undefined"
    ? localStorage.getItem("gupt-app-theme") || "default"
    : "default",
);

function applyDark(dark) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  localStorage.setItem("gupt-theme", dark ? "dark" : "light");
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-app-theme", theme);
  localStorage.setItem("gupt-app-theme", theme);
}

// Apply immediately when this module first loads
applyDark(isDark.value);
applyTheme(appTheme.value);

// Keep in sync whenever toggled
watch(isDark, applyDark);
watch(appTheme, applyTheme);

export function useTheme() {
  return {
    isDark,
    appTheme,
    toggle: () => {
      isDark.value = !isDark.value;
    },
    setTheme: (theme) => {
      appTheme.value = theme;
    },
  };
}
