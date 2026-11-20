<script setup>
import { computed, ref, watch } from "vue";
import { avatarUrl, groupAvatarUrl } from "@/lib/avatar";

const props = defineProps({
  pubkey: { type: String, default: "" },
  groupId: { type: String, default: "" },
  src: { type: String, default: "" },
  alt: { type: String, default: "" },
  size: { type: String, default: "lg" },
  rounded: { type: String, default: "2xl" },
  hoverable: { type: Boolean, default: false },
});

const generatedSrc = computed(() => {
  if (props.groupId) return groupAvatarUrl(props.groupId);
  return avatarUrl(props.pubkey);
});

const pictureFailed = ref(false);
const imgSrc = computed(() =>
  props.src && !pictureFailed.value ? props.src : generatedSrc.value,
);

// A picture that will not load falls back to the generated face rather than a
// broken image icon.
function onImgError() {
  if (props.src && !pictureFailed.value) pictureFailed.value = true;
}

watch(
  () => props.src,
  () => {
    pictureFailed.value = false;
  },
);

const sizeClass = computed(
  () =>
    ({
      sm: "robo-avatar__variant-1",
      md: "robo-avatar__variant-2",
      lg: "robo-avatar__variant-3",
      xl: "robo-avatar__variant-4",
      xxl: "robo-avatar__variant-5",
      hero: "robo-avatar__variant-6",
    })[props.size] ?? "robo-avatar__variant-3",
);

const roundedClass = computed(
  () =>
    ({
      xl: "robo-avatar__variant-7",
      "2xl": "robo-avatar__variant-8",
      "3xl": "robo-avatar__variant-9",
    })[props.rounded] ?? "robo-avatar__variant-8",
);
</script>

<template>
  <img
    :src="imgSrc"
    :alt="alt"
    :class="[
      sizeClass,
      roundedClass,
      hoverable ? 'robo-avatar__image--variant-1' : '',
    ]"
    class="avatar-img robo-avatar__image"
    loading="lazy"
    referrerpolicy="no-referrer"
    @error="onImgError"
  />
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {
@media (hover:hover) {
.robo-avatar__image--variant-1:hover {
  --scale-x: 105%;
  --scale-y: 105%;
  --scale-z: 105%;
  scale: 105% 105%;
}
}

@layer gupt-components {
.robo-avatar__variant-1 {
  height: calc(var(--spacing) * 7);
}
.robo-avatar__variant-2 {
  height: calc(var(--spacing) * 10);
}
.robo-avatar__variant-3 {
  height: calc(var(--spacing) * 12);
}
.robo-avatar__variant-4 {
  height: calc(var(--spacing) * 16);
}
.robo-avatar__variant-5 {
  height: calc(var(--spacing) * 20);
}
.robo-avatar__variant-6 {
  height: calc(var(--spacing) * 32);
}
.robo-avatar__variant-1 {
  width: calc(var(--spacing) * 7);
}
.robo-avatar__variant-2 {
  width: calc(var(--spacing) * 10);
}
.robo-avatar__variant-3 {
  width: calc(var(--spacing) * 12);
}
.robo-avatar__variant-4 {
  width: calc(var(--spacing) * 16);
}
.robo-avatar__variant-5 {
  width: calc(var(--spacing) * 20);
}
.robo-avatar__variant-6 {
  width: calc(var(--spacing) * 32);
}
.robo-avatar__image {
  flex-shrink: 0;
}
.robo-avatar__image--variant-1 {
  cursor: pointer;
}
.robo-avatar__variant-8 {
  border-radius: var(--radius-2xl);
}
.robo-avatar__variant-9 {
  border-radius: var(--radius-3xl);
}
.robo-avatar__variant-7 {
  border-radius: var(--radius-xl);
}
.robo-avatar__image {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.robo-avatar__image {
  border-color: var(--app-border);
}
.robo-avatar__image {
  object-fit: cover;
}
.robo-avatar__image--variant-1 {
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.robo-avatar__image--variant-1 {
  --duration: .2s;
  transition-duration: .2s;
}
}
}
</style>
