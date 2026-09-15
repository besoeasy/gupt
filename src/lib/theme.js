import { useThemeStore } from "@/stores/theme";

// Deprecated — use useThemeStore() from "@/stores/theme" directly.
export function useTheme() {
  const store = useThemeStore();
  return {
    isDark: store.isDark,
    toggle: store.toggle,
  };
}
