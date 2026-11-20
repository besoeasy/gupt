<script setup>
import { computed } from "vue";

const props = defineProps({
  name: { type: String, default: "" },
  size: { type: [Number, String], default: 24 },
  color: { type: String, default: "currentColor" },
  strokeWidth: { type: [Number, String], default: 2 },
  absoluteStrokeWidth: { type: [Boolean, String], default: false },
});

const toCamelCase = (s) =>
  s.replace(/^([A-Z])|[\s-_]+(\w)/g, (m, p1, p2) => (p2 ? p2.toUpperCase() : p1.toLowerCase()));
const toPascalCase = (s) => {
  const camel = toCamelCase(s);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
};
const toKebabCase = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const iconClass = computed(() => {
  if (!props.name) return ["lucide", "lucide-icon"];
  const kebab = toKebabCase(props.name);
  return ["lucide", `lucide-${toKebabCase(toPascalCase(props.name))}-icon`, `lucide-${kebab}`];
});

const resolvedStrokeWidth = computed(() => {
  const raw = props.absoluteStrokeWidth;
  const isAbsolute = raw === "" || raw === true || raw === "true";
  if (!isAbsolute) return props.strokeWidth;
  const size = Number(props.size) || 24;
  return (Number(props.strokeWidth) * 24) / size;
});
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    :stroke="color"
    :stroke-width="resolvedStrokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    :class="iconClass"
  >
    <slot />
  </svg>
</template>
