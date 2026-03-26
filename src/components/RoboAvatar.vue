<script setup>
import { computed, ref, watch } from "vue";
import { roboHashUrl, roboHashGroupUrl } from "@/lib/crypto";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const props = defineProps({
  pubkey: { type: String, default: "" },
  groupId: { type: String, default: "" },
  src: { type: String, default: "" },
  alt: { type: String, default: "" },
  size: { type: String, default: "lg" }, // sm|md|lg|xl|xxl|hero
  rounded: { type: String, default: "2xl" }, // xl|2xl|3xl (ignored for shadcn)
  storyRing: { type: Boolean, default: false },
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
</script>

<template>
  <div
    v-if="storyRing"
    class="rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 p-0.5"
    :class="hoverable ? 'transition-transform duration-200 hover:scale-105 cursor-pointer' : ''"
  >
    <Avatar :class="sizeClass" class="border-2 border-background">
      <AvatarImage :src="imgSrc" :alt="alt" class="object-cover" @error="onImgError" />
      <AvatarFallback>{{ alt?.slice(0, 2) || "?" }}</AvatarFallback>
    </Avatar>
  </div>
  <Avatar
    v-else
    :class="[
      sizeClass,
      hoverable ? 'transition-transform duration-200 hover:scale-105 cursor-pointer' : '',
    ]"
  >
    <AvatarImage :src="imgSrc" :alt="alt" class="object-cover" @error="onImgError" />
    <AvatarFallback>{{ alt?.slice(0, 2) || "?" }}</AvatarFallback>
  </Avatar>
</template>
