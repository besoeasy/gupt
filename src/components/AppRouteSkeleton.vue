<script setup>
defineProps({
  kind: { type: String, default: "list" },
});
</script>

<template>
  <div v-if="kind === 'inbox'" aria-hidden="true" class="sk-page">
    <div class="sk-line sk-line--title" />
    <div class="sk-line sk-line--search" />

    <div class="sk-sheet">
      <div v-for="n in 6" :key="n" class="sk-row sk-row--inbox">
        <div class="skeleton-shimmer sk-avatar" />
        <div class="sk-row__body">
          <div class="skeleton-shimmer sk-line sk-line--name" />
          <div class="skeleton-shimmer sk-line sk-line--meta" />
        </div>
        <div class="skeleton-shimmer sk-stamp" />
      </div>
    </div>
  </div>

  <div v-else-if="kind === 'conversation'" aria-hidden="true" class="sk-page sk-page--chat">
    <div class="sk-bar">
      <div class="skeleton-shimmer sk-avatar" />
      <div class="sk-bar__body">
        <div class="skeleton-shimmer sk-line sk-line--name" />
        <div class="skeleton-shimmer sk-line sk-line--meta" />
      </div>
      <div class="skeleton-shimmer sk-icon" />
      <div class="skeleton-shimmer sk-icon" />
    </div>

    <div class="sk-thread">
      <div v-for="n in 5" :key="n" class="sk-bubble" :class="n % 2 ? 'sk-bubble--mine' : ''">
        <div class="skeleton-shimmer sk-bubble__line" />
        <div class="skeleton-shimmer sk-bubble__line sk-bubble__line--short" />
      </div>
    </div>

    <div class="sk-compose">
      <div class="skeleton-shimmer sk-compose__field" />
      <div class="skeleton-shimmer sk-icon" />
    </div>
  </div>

  <div v-else-if="kind === 'detail'" aria-hidden="true" class="sk-page">
    <div class="sk-head">
      <div class="skeleton-shimmer sk-line sk-line--eyebrow" />
      <div class="skeleton-shimmer sk-line sk-line--display" />
      <div class="skeleton-shimmer sk-line sk-line--meta" />
    </div>

    <div class="sk-sheet">
      <div class="sk-row">
        <div class="skeleton-shimmer sk-line sk-line--label" />
        <div class="skeleton-shimmer sk-line sk-line--value" />
      </div>
      <div class="sk-row">
        <div class="skeleton-shimmer sk-line sk-line--label" />
        <div class="skeleton-shimmer sk-line sk-line--value" />
      </div>
      <div class="sk-row">
        <div class="skeleton-shimmer sk-line sk-line--label" />
        <div class="skeleton-shimmer sk-line sk-line--block" />
      </div>
    </div>
  </div>

  <div v-else-if="kind === 'full'" aria-hidden="true" class="sk-page sk-page--full">
    <div class="skeleton-shimmer sk-line sk-line--display" />
    <div class="skeleton-shimmer sk-line sk-line--meta" />
    <div class="skeleton-shimmer sk-block" />
    <div class="skeleton-shimmer sk-block sk-block--tall" />
  </div>

  <div v-else aria-hidden="true" class="sk-page">
    <div class="sk-head">
      <div class="skeleton-shimmer sk-line sk-line--eyebrow" />
      <div class="skeleton-shimmer sk-line sk-line--display" />
    </div>

    <div class="skeleton-shimmer sk-line sk-line--search" />

    <div class="sk-sheet">
      <div v-for="n in 5" :key="n" class="sk-row sk-row--list">
        <div class="skeleton-shimmer sk-line sk-line--name" />
        <div class="skeleton-shimmer sk-line sk-line--value" />
        <div class="skeleton-shimmer sk-line sk-line--meta" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ledger pass: skeletons are hairline sheets with shimmering rules. */

.sk-page {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  width: 100%;
  max-width: 720px;
  min-height: 100%;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.sk-page--chat,
.sk-page--full {
  max-width: none;
  height: 100%;
  min-height: 0;
  padding: 0;
}

.sk-line {
  display: block;
  height: 10px;
  border-radius: 3px;
}

.sk-line--eyebrow {
  width: 84px;
  height: 7px;
}

.sk-line--display {
  width: 46%;
  height: 22px;
  border-radius: 4px;
}

.sk-line--title {
  width: 34%;
  height: 20px;
  border-radius: 4px;
}

.sk-line--meta {
  width: 62%;
}

.sk-line--search {
  width: 100%;
  height: 40px;
  border-radius: var(--app-radius-sm);
}

.sk-line--name {
  width: 42%;
  height: 11px;
}

.sk-line--label {
  width: 72px;
  height: 7px;
}

.sk-line--value {
  width: 74%;
}

.sk-line--block {
  width: 100%;
  height: 46px;
  border-radius: var(--app-radius-sm);
}

.sk-block {
  width: 100%;
  height: 72px;
  border-radius: var(--app-radius-sm);
}

.sk-block--tall {
  flex: 1;
  height: auto;
  min-height: 160px;
}

/* ---- Header ---- */

.sk-head {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-bottom: var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
}

/* ---- Sheet ---- */

.sk-sheet {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
}

.sk-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px var(--app-space-4);
}

.sk-row + .sk-row {
  border-top: 1px solid var(--app-border);
}

.sk-row--inbox,
.sk-row--list {
  flex-direction: row;
  align-items: center;
  gap: 11px;
}

.sk-row--list {
  align-items: stretch;
}

.sk-row__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.sk-avatar {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 10px;
}

.sk-stamp {
  flex-shrink: 0;
  width: 32px;
  height: 8px;
  border-radius: 3px;
}

.sk-icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: var(--app-radius-sm);
}

/* ---- Chat ---- */

.sk-bar {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
}

.sk-bar__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.sk-thread {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  padding: var(--app-space-5) var(--app-space-4);
  overflow: hidden;
}

.sk-bubble {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: min(64%, 320px);
  padding: 11px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
}

.sk-bubble--mine {
  align-self: flex-end;
  background: var(--app-surface-soft);
}

.sk-bubble__line {
  width: 100%;
  height: 9px;
  border-radius: 3px;
}

.sk-bubble__line--short {
  width: 54%;
}

.sk-compose {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px var(--app-space-4) calc(11px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--app-border);
}

.sk-compose__field {
  flex: 1;
  height: 40px;
  border-radius: var(--app-radius-sm);
}

@media (min-width: 40rem) {
  .sk-page {
    padding-inline: var(--app-space-6);
  }

  .sk-bar,
  .sk-thread,
  .sk-compose {
    padding-inline: var(--app-space-6);
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer {
    animation: none;
  }
}
</style>
