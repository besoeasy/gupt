<script setup>
import { computed, ref, watch } from "vue";
import { createAvatar } from "@dicebear/core";
import * as adventurer from "@dicebear/adventurer";
import { botttsNeutral } from "@dicebear/collection";
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

function avatarToDataUri(avatarOrString) {
  const svg = typeof avatarOrString === "string" ? avatarOrString : avatarOrString.toString();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const imgSrc = computed(() => {
  if (!imgError.value && props.src) return props.src;

  const seed = props.groupId || props.pubkey || "anonymous";

  if (props.groupId) {
    try {
      const avatar = createAvatar(botttsNeutral, { seed, backgroundColor: ["transparent"] });
      return avatarToDataUri(avatar);
    } catch (err) {
      return `https://api.dicebear.com/6.x/botttsNeutral/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;
    }
  }

  try {
    const avatar = createAvatar(adventurer, { seed, backgroundColor: ["transparent"] });
    return avatarToDataUri(avatar);
  } catch (err) {
    return `https://api.dicebear.com/6.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;
  }
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
    class="rounded-sm bg-transparent"
    :class="hoverable ? 'transition-transform duration-200 hover:scale-105 cursor-pointer' : ''"
  >
    <Avatar :class="sizeClass" class="bg-transparent">
      <AvatarImage :src="imgSrc" :alt="alt" class="object-cover" @error="onImgError" />
      <AvatarFallback class="bg-transparent">{{ alt?.slice(0, 2) || "?" }}</AvatarFallback>
    </Avatar>
  </div>
  <Avatar
    v-else
    :class="[
      sizeClass,
      'bg-transparent',
      hoverable ? 'transition-transform duration-200 hover:scale-105 cursor-pointer' : '',
    ]"
  >
    <AvatarImage :src="imgSrc" :alt="alt" class="object-cover" @error="onImgError" />
    <AvatarFallback class="bg-transparent">{{ alt?.slice(0, 2) || "?" }}</AvatarFallback>
  </Avatar>
</template>
