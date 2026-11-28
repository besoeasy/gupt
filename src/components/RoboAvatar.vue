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
      xs: "robo-avatar--sm",
      sm: "robo-avatar--sm",
      md: "robo-avatar--md",
      lg: "robo-avatar--lg",
      xl: "robo-avatar--xl",
      xxl: "robo-avatar--xxl",
      hero: "robo-avatar--hero",
    })[props.size] ?? "robo-avatar--lg",
);

const roundedClass = computed(
  () =>
    ({
      sm: "robo-avatar--round-sm",
      md: "robo-avatar--round-md",
      xl: "robo-avatar--round-md",
      "2xl": "robo-avatar--round-md",
      "3xl": "robo-avatar--round-lg",
    })[props.rounded] ?? "robo-avatar--round-md",
);
</script>

<template>
  <img
    :src="imgSrc"
    :alt="alt"
    :class="[sizeClass, roundedClass, hoverable ? 'robo-avatar--hoverable' : '']"
    class="avatar-img robo-avatar"
    loading="lazy"
    referrerpolicy="no-referrer"
    @error="onImgError"
  />
</template>

<style scoped>
/* Ledger pass: generated faces keep their own rounding, not the card radius. */

.robo-avatar {
  flex-shrink: 0;
  border: 1px solid var(--app-border);
  object-fit: cover;
  background: var(--app-surface-soft);
}

.robo-avatar--sm {
  width: 28px;
  height: 28px;
}

.robo-avatar--md {
  width: 40px;
  height: 40px;
}

.robo-avatar--lg {
  width: 48px;
  height: 48px;
}

.robo-avatar--xl {
  width: 64px;
  height: 64px;
}

.robo-avatar--xxl {
  width: 80px;
  height: 80px;
}

.robo-avatar--hero {
  width: 128px;
  height: 128px;
}

.robo-avatar--round-sm {
  border-radius: 6px;
}

.robo-avatar--round-md {
  border-radius: 10px;
}

.robo-avatar--round-lg {
  border-radius: 14px;
}

.robo-avatar--hoverable {
  cursor: pointer;
  transition:
    transform var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

@media (hover: hover) {
  .robo-avatar--hoverable:hover {
    border-color: var(--app-border-strong);
    transform: scale(1.05);
  }
}

@media (prefers-reduced-motion: reduce) {
  .robo-avatar--hoverable {
    transition: none;
  }
}
</style>
