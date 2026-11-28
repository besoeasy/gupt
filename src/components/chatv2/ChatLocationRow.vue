<script setup>
import { computed } from "vue";
import { ExternalLink, MapPin } from "@/icons";
import { formatAccuracy, formatCoords, osmMapUrl } from "@/lib/location";

const props = defineProps({
  message: { type: Object, required: true },
});

const locationLabel = computed(() => String(props.message?.label || "").trim());
const locationAccuracy = computed(() => formatAccuracy(props.message?.accuracy));
const locationCoords = computed(() => {
  const coords = formatCoords(props.message?.lat, props.message?.lon);
  if (!coords) return "Position unavailable";
  // Accuracy is dropped in the approximate case on the way out, so this only
  // ever renders for an exact fix.
  return locationAccuracy.value ? `${coords} · ${locationAccuracy.value}` : coords;
});
const locationMapUrl = computed(() => osmMapUrl(props.message?.lat, props.message?.lon));
const approximate = computed(() => Boolean(props.message?.approximate));
</script>

<template>
  <!-- Keyed on row type rather than valid coordinates: a location message
       with unusable coords still renders instead of an empty bubble. -->
  <div class="chat-message-bubble__location">
    <div class="chat-message-bubble__location-main">
      <MapPin class="chat-message-bubble__map-pin" :stroke-width="1.8" />
      <div class="chat-message-bubble__location-text">
        <p v-if="locationLabel" class="chat-message-bubble__location-label">
          {{ locationLabel }}
        </p>
        <p class="chat-message-bubble__location-coords">{{ locationCoords }}</p>
        <p v-if="approximate" class="chat-message-bubble__location-approx">
          Approximate · ~1km
        </p>
      </div>
    </div>
    <!-- Deliberately inert until tapped. An embedded map would tell a tile
         server the reader's IP and that they care about this coordinate;
         the link only fires on an explicit click. -->
    <a
      v-if="locationMapUrl"
      :href="locationMapUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="chat-message-bubble__link-opens-openstreetmap"
      title="Opens OpenStreetMap in a new tab"
    >
      <ExternalLink class="chat-message-bubble__external-link" :stroke-width="1.8" />
      Open map
    </a>
  </div>
</template>

<style scoped>
.chat-message-bubble__location {
  max-width: 15rem;
  min-width: 0;
}
.chat-message-bubble__location > :not(:last-child) {
  margin-block-start: 0;
  margin-block-end: 0.375rem;
}
.chat-message-bubble__location-main {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}
.chat-message-bubble__location-text {
  min-width: 0;
  flex: 1;
}
.chat-message-bubble__map-pin {
  margin-top: 0.125rem;
  height: 0.875rem;
  width: 0.875rem;
  flex-shrink: 0;
  color: var(--app-success);
}
.chat-message-bubble__location-label {
  line-height: 1.375;
  overflow-wrap: break-word;
  color: var(--app-text);
}
.chat-message-bubble__location-coords {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text-soft);
}
.chat-message-bubble__location-approx {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: color-mix(in oklab,var(--app-warning) 90%,transparent);
}
.chat-message-bubble__link-opens-openstreetmap {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text-soft);
  text-decoration-line: underline;
  text-underline-offset: 2px;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-message-bubble__external-link {
  height: 0.75rem;
  width: 0.75rem;
}

@media (hover: hover) {
  .chat-message-bubble__link-opens-openstreetmap:hover {
    color: var(--app-text);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-message-bubble__link-opens-openstreetmap {
    transition: none;
  }
}
</style>
