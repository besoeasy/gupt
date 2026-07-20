<script setup>
import { computed, ref, watch } from "vue";
import { roboHashUrl, roboHashGroupUrl } from "@/lib/crypto";

const props = defineProps({
  pubkey: { type: String, default: "" },
  groupId: { type: String, default: "" },
  src: { type: String, default: "" },
  alt: { type: String, default: "" },
  size: { type: String, default: "lg" }, 
  rounded: { type: String, default: "2xl" }, 
  hoverable: { type: Boolean, default: false },
});

const imgError = ref(false);
watch(
  () => props.src,
  () => {
    imgError.value = false;
  },
);
function onImgError() {
  imgError.value = true;
}

const imgSrc = computed(() => {
  if (!imgError.value && props.src) return props.src;
  if (props.groupId) return roboHashGroupUrl(props.groupId);
  return roboHashUrl(props.pubkey);
});

const sizeClass = computed(
  () =>
    ({
      sm: "w-7 h-7",
      md: "w-10 h-10",
      lg: "w-12 h-12",
      xl: "w-16 h-16",
      xxl: "w-20 h-20",
      hero: "w-32 h-32",
    })[props.size] ?? "w-12 h-12",
);

const roundedClass = computed(
  () =>
    ({
      xl: "rounded-xl",
      "2xl": "rounded-2xl",
      "3xl": "rounded-3xl",
    })[props.rounded] ?? "rounded-2xl",
);
</script>

<template>
  <img
    :src="imgSrc"
    :alt="alt"
    :class="[
      sizeClass,
      roundedClass,
      hoverable ? 'transition-transform duration-200 hover:scale-105 cursor-pointer' : '',
    ]"
    class="avatar-img object-cover shrink-0 border border-(--app-border)"
    loading="lazy"
    @error="onImgError"
  />
</template>
