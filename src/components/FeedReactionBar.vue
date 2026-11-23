<script setup>
import { FEED_REACTIONS } from "@/lib/feed";

defineProps({
  counts: { type: Object, default: () => ({}) },
  myReaction: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["react"]);
</script>

<template>
  <div class="reaction-bar" @click.stop>
    <button
      v-for="emoji in FEED_REACTIONS"
      :key="emoji"
      type="button"
      :disabled="disabled"
      class="reaction-bar__chip"
      :class="{ 'reaction-bar__chip--active': myReaction === emoji }"
      :title="myReaction === emoji ? 'Tap to remove' : 'React'"
      :aria-pressed="myReaction === emoji"
      @click="emit('react', emoji)"
    >
      <span class="reaction-bar__glyph">{{ emoji }}</span>
      <span v-if="counts?.[emoji]" class="reaction-bar__count">{{ counts[emoji] }}</span>
    </button>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Ledger reactions: quiet hairline chips; the one you chose is filled ink. */

.reaction-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--app-space-2);
}

.reaction-bar__chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: var(--app-touch-h);
  min-height: var(--app-touch-h);
  padding: 0 var(--app-space-2);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background-color: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-swift);
}

.reaction-bar__chip:active {
  transform: scale(0.94);
}

.reaction-bar__chip:disabled {
  opacity: 0.45;
  cursor: default;
}

.reaction-bar__chip--active {
  border-color: var(--app-text);
  background-color: var(--app-text);
  color: var(--app-bg);
}

.reaction-bar__chip:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 70%, transparent);
  outline-offset: 2px;
}

.reaction-bar__glyph {
  font-size: 14px;
  line-height: 1;
}

.reaction-bar__count {
  font-family: var(--font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: inherit;
}

@media (hover: hover) {
  .reaction-bar__chip:not(.reaction-bar__chip--active, :disabled):hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-soft);
    color: var(--app-text);
    transform: translateY(-1px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reaction-bar__chip {
    transition: none;
  }

  .reaction-bar__chip:active {
    transform: none;
  }
}
</style>
