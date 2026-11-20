<script setup>
defineProps({
  eyebrow: { type: String, default: "" },
  title: { type: String, default: "" },
  eyebrowClass: { type: String, default: "page-header__variant-1" },
});
</script>

<template>
  <header class="page-header__header">
    <div class="page-header__block">
      <p
        v-if="eyebrow"
        class="page-header__text"
        :class="eyebrowClass"
      >
        {{ eyebrow }}
      </p>
      <h1 v-if="title" class="page-header__title">
        {{ title }}
      </h1>
      <slot />
    </div>
  </header>
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {
@media (min-width:40rem) {
.page-header__title {
  font-size: var(--text-3xl);
  line-height: var(--leading,var(--text-3xl--line-height));
}
}

@layer gupt-components {
:where(.page-header__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
.page-header__header {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.page-header__header {
  border-color: var(--app-border);
}
.page-header__header {
  padding-bottom: calc(var(--spacing) * 6);
}
.page-header__title {
  font-size: var(--text-2xl);
  line-height: var(--leading,var(--text-2xl--line-height));
}
.page-header__text {
  font-size: 11px;
}
.page-header__title {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.page-header__text {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.page-header__text {
  --tracking: .16em;
  letter-spacing: .16em;
}
.page-header__title {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.page-header__variant-1 {
  color: var(--app-success);
}
.page-header__text {
  text-transform: uppercase;
}
}
}
</style>
