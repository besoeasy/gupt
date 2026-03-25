import { ref, watch } from 'vue'

const isDark = ref(
  typeof localStorage !== 'undefined' ? localStorage.getItem('gupt-theme') !== 'light' : true,
)

function apply(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  localStorage.setItem('gupt-theme', dark ? 'dark' : 'light')
}

// Apply immediately when this module first loads
apply(isDark.value)

// Keep in sync whenever toggled
watch(isDark, apply)

export function useTheme() {
  return {
    isDark,
    toggle: () => {
      isDark.value = !isDark.value
    },
  }
}
