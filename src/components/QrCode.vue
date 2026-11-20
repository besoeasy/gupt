<script setup>
import { computed } from "vue";
import { encodeQr, qrExtent, qrPath } from "@/lib/qr/encode";

const props = defineProps({
  text: { type: String, required: true },
  ecc: { type: String, default: "M" },
  size: { type: Number, default: 200 },
  margin: { type: Number, default: 4 },
  label: { type: String, default: "QR code" },
});

const code = computed(() => {
  const text = String(props.text || "").trim();
  if (!text) return null;
  try {
    const qr = encodeQr(text, { ecc: props.ecc });
    return {
      path: qrPath(qr),
      extent: qrExtent(qr, props.margin),
      version: qr.version,
    };
  } catch {
    return null;
  }
});

const style = computed(() => ({ "--qr-size": `${props.size}px` }));
</script>

<template>
  <svg
    v-if="code"
    class="qr-code"
    :style="style"
    :viewBox="`0 0 ${code.extent} ${code.extent}`"
    role="img"
    :aria-label="label"
    shape-rendering="crispEdges"
  >
    <title>{{ label }}</title>
    <rect class="qr-code__paper" :width="code.extent" :height="code.extent" />
    <path class="qr-code__ink" :d="code.path" :transform="`translate(${margin} ${margin})`" />
  </svg>
</template>

<style scoped>
.qr-code {
  display: block;
  width: 100%;
  max-width: var(--qr-size);
  height: auto;
  aspect-ratio: 1;
}

.qr-code__paper {
  fill: var(--app-qr-paper);
}

.qr-code__ink {
  fill: var(--app-qr-ink);
}
</style>
