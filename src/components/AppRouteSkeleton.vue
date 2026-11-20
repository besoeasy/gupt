<script setup>
const props = defineProps({
  kind: { type: String, default: "list" },
});
</script>

<template>
  <div
    v-if="props.kind === 'inbox'"
    aria-hidden="true"
    class="app-route-skeleton__block"
  >
    <div class="app-route-skeleton__block-2">
      <div class="app-route-skeleton__block-3">
        <div class="app-route-skeleton__block-4">
          <div
            class="app-route-skeleton__block-5"
          >
            <div class="skeleton-shimmer app-route-skeleton__block-6" />
            <div class="app-route-skeleton__block-7">
              <div class="skeleton-shimmer app-route-skeleton__block-8" />
              <div class="skeleton-shimmer app-route-skeleton__block-9" />
            </div>
          </div>
          <div class="skeleton-shimmer app-route-skeleton__block-10" />
          <div class="app-route-skeleton__block-11">
            <div
              v-for="n in 6"
              :key="n"
              class="app-route-skeleton__block-12"
            >
              <div class="skeleton-shimmer app-route-skeleton__block-13" />
              <div class="app-route-skeleton__block-14">
                <div class="app-route-skeleton__block-15">
                  <div class="skeleton-shimmer app-route-skeleton__block-16" />
                  <div class="skeleton-shimmer app-route-skeleton__block-17" />
                </div>
                <div class="skeleton-shimmer app-route-skeleton__block-18" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div
    v-else-if="props.kind === 'conversation'"
    aria-hidden="true"
    class="app-route-skeleton__block-19"
  >
    <div class="app-route-skeleton__block-20">
      <div class="app-route-skeleton__block-21">
        <div class="skeleton-shimmer app-route-skeleton__block-22" />
        <div class="skeleton-shimmer app-route-skeleton__block-23" />
        <div class="app-route-skeleton__block-24">
          <div class="skeleton-shimmer app-route-skeleton__block-25" />
          <div class="skeleton-shimmer app-route-skeleton__block-26" />
        </div>
        <div class="skeleton-shimmer app-route-skeleton__block-27" />
      </div>
      <div class="app-route-skeleton__block-28">
        <div class="app-route-skeleton__block-29">
          <div class="skeleton-shimmer app-route-skeleton__block-30" />
        </div>
        <div class="app-route-skeleton__block-31">
          <div class="skeleton-shimmer app-route-skeleton__block-32" />
        </div>
        <div class="app-route-skeleton__block-33">
          <div class="skeleton-shimmer app-route-skeleton__block-34" />
        </div>
        <div class="app-route-skeleton__block-35">
          <div class="skeleton-shimmer app-route-skeleton__block-36" />
        </div>
        <div class="app-route-skeleton__block-37">
          <div class="skeleton-shimmer app-route-skeleton__block-38" />
        </div>
      </div>
      <div class="app-route-skeleton__block-39">
        <div class="skeleton-shimmer app-route-skeleton__block-40" />
        <div class="skeleton-shimmer app-route-skeleton__block-41" />
      </div>
    </div>
  </div>

  <div
    v-else-if="props.kind === 'detail'"
    aria-hidden="true"
    class="app-route-skeleton__block-42"
  >
    <div class="app-route-skeleton__block-43">
      <div class="app-route-skeleton__block-44">
        <div class="app-route-skeleton__block-45">
          <div class="skeleton-shimmer app-route-skeleton__block-46" />
          <div class="skeleton-shimmer app-route-skeleton__block-47" />
          <div class="skeleton-shimmer app-route-skeleton__block-48" />
        </div>
        <div class="app-route-skeleton__block-49">
          <div class="skeleton-shimmer app-route-skeleton__block-50" />
          <div class="skeleton-shimmer app-route-skeleton__block-51" />
          <div class="app-route-skeleton__block-52">
            <div class="skeleton-shimmer app-route-skeleton__block-53" />
            <div class="skeleton-shimmer app-route-skeleton__block-54" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <div
    v-else-if="props.kind === 'full'"
    aria-hidden="true"
    class="app-route-skeleton__block-55"
  >
    <div class="skeleton-shimmer app-route-skeleton__block-56" />
    <div class="skeleton-shimmer app-route-skeleton__block-57" />
    <div class="skeleton-shimmer app-route-skeleton__block-58" />
    <div class="app-route-skeleton__block-59">
      <div class="skeleton-shimmer app-route-skeleton__block-60" />
      <div class="skeleton-shimmer app-route-skeleton__block-61" />
      <div class="skeleton-shimmer app-route-skeleton__block-62" />
    </div>
  </div>

  <div v-else aria-hidden="true" class="app-route-skeleton__block-63">
    <div class="app-route-skeleton__block-64">
      <div
        class="app-route-skeleton__block-65"
      >
        <div class="app-route-skeleton__block-66">
          <div class="skeleton-shimmer app-route-skeleton__block-67" />
          <div class="skeleton-shimmer app-route-skeleton__block-68" />
        </div>
        <div class="app-route-skeleton__block-69">
          <div class="skeleton-shimmer app-route-skeleton__block-70" />
          <div class="skeleton-shimmer app-route-skeleton__block-71" />
        </div>
      </div>
      <div class="skeleton-shimmer app-route-skeleton__block-72" />
      <div class="app-route-skeleton__block-73">
        <div
          v-for="n in 5"
          :key="n"
          class="app-route-skeleton__block-74"
        >
          <div class="skeleton-shimmer app-route-skeleton__block-75" />
          <div class="skeleton-shimmer app-route-skeleton__block-76" />
          <div class="skeleton-shimmer app-route-skeleton__block-77" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

@layer gupt-components {

@media (min-width:40rem) {
.app-route-skeleton__block-13 {
  height: calc(var(--spacing) * 11);
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-13 {
  width: calc(var(--spacing) * 11);
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-17 {
  width: calc(var(--spacing) * 12);
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-16 {
  width: calc(var(--spacing) * 36);
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-18 {
  width: calc(var(--spacing) * 72);
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-5 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-65 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-5 {
  align-items: center;
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-65 {
  align-items: center;
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-5 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-65 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-12 {
  gap: calc(var(--spacing) * 3.5);
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-12 {
  padding: calc(var(--spacing) * 3.5);
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-4 {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-43 {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.app-route-skeleton__block-64 {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.app-route-skeleton__block-4 {
  padding-inline: calc(var(--spacing) * 8);
}
}

@media (min-width:64rem) {
.app-route-skeleton__block-43 {
  padding-inline: calc(var(--spacing) * 8);
}
}

@media (min-width:64rem) {
.app-route-skeleton__block-64 {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.app-route-skeleton__block-19 {
  position: relative;
}
.app-route-skeleton__block-2 {
  margin-inline: auto;
}
.app-route-skeleton__block-4 {
  margin-inline: auto;
}
.app-route-skeleton__block-20 {
  margin-inline: auto;
}
.app-route-skeleton__block-43 {
  margin-inline: auto;
}
.app-route-skeleton__block-44 {
  margin-inline: auto;
}
.app-route-skeleton__block-64 {
  margin-inline: auto;
}
.app-route-skeleton__block-58 {
  margin-top: calc(var(--spacing) * 2);
}
.app-route-skeleton__block-57 {
  margin-top: calc(var(--spacing) * 4);
}
.app-route-skeleton__block-59 {
  margin-top: calc(var(--spacing) * 6);
}
.app-route-skeleton__block-2 {
  display: flex;
}
.app-route-skeleton__block-5 {
  display: flex;
}
.app-route-skeleton__block-7 {
  display: flex;
}
.app-route-skeleton__block-12 {
  display: flex;
}
.app-route-skeleton__block-15 {
  display: flex;
}
.app-route-skeleton__block-20 {
  display: flex;
}
.app-route-skeleton__block-21 {
  display: flex;
}
.app-route-skeleton__block-29 {
  display: flex;
}
.app-route-skeleton__block-31 {
  display: flex;
}
.app-route-skeleton__block-33 {
  display: flex;
}
.app-route-skeleton__block-35 {
  display: flex;
}
.app-route-skeleton__block-37 {
  display: flex;
}
.app-route-skeleton__block-39 {
  display: flex;
}
.app-route-skeleton__block-52 {
  display: flex;
}
.app-route-skeleton__block-55 {
  display: flex;
}
.app-route-skeleton__block-59 {
  display: flex;
}
.app-route-skeleton__block-65 {
  display: flex;
}
.app-route-skeleton__block-69 {
  display: flex;
}
.app-route-skeleton__block-17 {
  height: calc(var(--spacing) * 3);
}
.app-route-skeleton__block-18 {
  height: calc(var(--spacing) * 3);
}
.app-route-skeleton__block-26 {
  height: calc(var(--spacing) * 3);
}
.app-route-skeleton__block-58 {
  height: calc(var(--spacing) * 3);
}
.app-route-skeleton__block-76 {
  height: calc(var(--spacing) * 3);
}
.app-route-skeleton__block-77 {
  height: calc(var(--spacing) * 3);
}
.app-route-skeleton__block-16 {
  height: calc(var(--spacing) * 3.5);
}
.app-route-skeleton__block-25 {
  height: calc(var(--spacing) * 3.5);
}
.app-route-skeleton__block-46 {
  height: calc(var(--spacing) * 4);
}
.app-route-skeleton__block-48 {
  height: calc(var(--spacing) * 4);
}
.app-route-skeleton__block-68 {
  height: calc(var(--spacing) * 4);
}
.app-route-skeleton__block-75 {
  height: calc(var(--spacing) * 4);
}
.app-route-skeleton__block-57 {
  height: calc(var(--spacing) * 5);
}
.app-route-skeleton__block-47 {
  height: calc(var(--spacing) * 6);
}
.app-route-skeleton__block-67 {
  height: calc(var(--spacing) * 6);
}
.app-route-skeleton__block-6 {
  height: calc(var(--spacing) * 8);
}
.app-route-skeleton__block-8 {
  height: calc(var(--spacing) * 8);
}
.app-route-skeleton__block-9 {
  height: calc(var(--spacing) * 8);
}
.app-route-skeleton__block-22 {
  height: calc(var(--spacing) * 8);
}
.app-route-skeleton__block-27 {
  height: calc(var(--spacing) * 8);
}
.app-route-skeleton__block-70 {
  height: calc(var(--spacing) * 8);
}
.app-route-skeleton__block-71 {
  height: calc(var(--spacing) * 8);
}
.app-route-skeleton__block-53 {
  height: calc(var(--spacing) * 9);
}
.app-route-skeleton__block-54 {
  height: calc(var(--spacing) * 9);
}
.app-route-skeleton__block-10 {
  height: calc(var(--spacing) * 10);
}
.app-route-skeleton__block-13 {
  height: calc(var(--spacing) * 10);
}
.app-route-skeleton__block-23 {
  height: calc(var(--spacing) * 10);
}
.app-route-skeleton__block-32 {
  height: calc(var(--spacing) * 10);
}
.app-route-skeleton__block-36 {
  height: calc(var(--spacing) * 10);
}
.app-route-skeleton__block-38 {
  height: calc(var(--spacing) * 10);
}
.app-route-skeleton__block-40 {
  height: calc(var(--spacing) * 10);
}
.app-route-skeleton__block-41 {
  height: calc(var(--spacing) * 10);
}
.app-route-skeleton__block-50 {
  height: calc(var(--spacing) * 10);
}
.app-route-skeleton__block-72 {
  height: calc(var(--spacing) * 10);
}
.app-route-skeleton__block-60 {
  height: calc(var(--spacing) * 11);
}
.app-route-skeleton__block-61 {
  height: calc(var(--spacing) * 11);
}
.app-route-skeleton__block-62 {
  height: calc(var(--spacing) * 11);
}
.app-route-skeleton__block-30 {
  height: calc(var(--spacing) * 12);
}
.app-route-skeleton__block-21 {
  height: calc(var(--spacing) * 16);
}
.app-route-skeleton__block-34 {
  height: calc(var(--spacing) * 16);
}
.app-route-skeleton__block-56 {
  height: calc(var(--spacing) * 20);
}
.app-route-skeleton__block-51 {
  height: calc(var(--spacing) * 40);
}
.app-route-skeleton__block {
  height: 100%;
}
.app-route-skeleton__block-2 {
  height: 100%;
}
.app-route-skeleton__block-3 {
  height: 100%;
}
.app-route-skeleton__block-19 {
  height: 100%;
}
.app-route-skeleton__block-20 {
  height: 100%;
}
.app-route-skeleton__block-55 {
  height: 100%;
}
.app-route-skeleton__block-28 {
  min-height: 0;
}
.app-route-skeleton__block-55 {
  min-height: 60dvh;
}
.app-route-skeleton__block-42 {
  min-height: 100vh;
}
.app-route-skeleton__block-63 {
  min-height: 100vh;
}
.app-route-skeleton__block-32 {
  width: 50%;
}
.app-route-skeleton__block-38 {
  width: 50%;
}
.app-route-skeleton__block-30 {
  width: 66.6667%;
}
.app-route-skeleton__block-36 {
  width: 40%;
}
.app-route-skeleton__block-77 {
  width: 75%;
}
.app-route-skeleton__block-34 {
  width: 60%;
}
.app-route-skeleton__block-22 {
  width: calc(var(--spacing) * 8);
}
.app-route-skeleton__block-27 {
  width: calc(var(--spacing) * 8);
}
.app-route-skeleton__block-13 {
  width: calc(var(--spacing) * 10);
}
.app-route-skeleton__block-17 {
  width: calc(var(--spacing) * 10);
}
.app-route-skeleton__block-23 {
  width: calc(var(--spacing) * 10);
}
.app-route-skeleton__block-41 {
  width: calc(var(--spacing) * 10);
}
.app-route-skeleton__block-60 {
  width: calc(var(--spacing) * 11);
}
.app-route-skeleton__block-61 {
  width: calc(var(--spacing) * 11);
}
.app-route-skeleton__block-62 {
  width: calc(var(--spacing) * 11);
}
.app-route-skeleton__block-26 {
  width: calc(var(--spacing) * 20);
}
.app-route-skeleton__block-56 {
  width: calc(var(--spacing) * 20);
}
.app-route-skeleton__block-70 {
  width: calc(var(--spacing) * 20);
}
.app-route-skeleton__block-8 {
  width: calc(var(--spacing) * 24);
}
.app-route-skeleton__block-9 {
  width: calc(var(--spacing) * 24);
}
.app-route-skeleton__block-46 {
  width: calc(var(--spacing) * 24);
}
.app-route-skeleton__block-54 {
  width: calc(var(--spacing) * 24);
}
.app-route-skeleton__block-16 {
  width: calc(var(--spacing) * 28);
}
.app-route-skeleton__block-53 {
  width: calc(var(--spacing) * 28);
}
.app-route-skeleton__block-58 {
  width: calc(var(--spacing) * 28);
}
.app-route-skeleton__block-71 {
  width: calc(var(--spacing) * 28);
}
.app-route-skeleton__block-25 {
  width: calc(var(--spacing) * 32);
}
.app-route-skeleton__block-6 {
  width: calc(var(--spacing) * 36);
}
.app-route-skeleton__block-57 {
  width: calc(var(--spacing) * 40);
}
.app-route-skeleton__block-67 {
  width: calc(var(--spacing) * 40);
}
.app-route-skeleton__block-18 {
  width: calc(var(--spacing) * 48);
}
.app-route-skeleton__block-47 {
  width: calc(var(--spacing) * 48);
}
.app-route-skeleton__block-75 {
  width: calc(var(--spacing) * 48);
}
.app-route-skeleton__block-68 {
  width: calc(var(--spacing) * 64);
}
.app-route-skeleton__block {
  width: 100%;
}
.app-route-skeleton__block-2 {
  width: 100%;
}
.app-route-skeleton__block-3 {
  width: 100%;
}
.app-route-skeleton__block-4 {
  width: 100%;
}
.app-route-skeleton__block-10 {
  width: 100%;
}
.app-route-skeleton__block-19 {
  width: 100%;
}
.app-route-skeleton__block-20 {
  width: 100%;
}
.app-route-skeleton__block-43 {
  width: 100%;
}
.app-route-skeleton__block-48 {
  width: 100%;
}
.app-route-skeleton__block-50 {
  width: 100%;
}
.app-route-skeleton__block-51 {
  width: 100%;
}
.app-route-skeleton__block-55 {
  width: 100%;
}
.app-route-skeleton__block-64 {
  width: 100%;
}
.app-route-skeleton__block-72 {
  width: 100%;
}
.app-route-skeleton__block-76 {
  width: 100%;
}
.app-route-skeleton__block-44 {
  max-width: var(--container-2xl);
}
.app-route-skeleton__block-2 {
  max-width: var(--container-6xl);
}
.app-route-skeleton__block-4 {
  max-width: var(--container-6xl);
}
.app-route-skeleton__block-20 {
  max-width: var(--container-6xl);
}
.app-route-skeleton__block-43 {
  max-width: var(--container-6xl);
}
.app-route-skeleton__block-64 {
  max-width: var(--container-6xl);
}
.app-route-skeleton__block-68 {
  max-width: 100%;
}
.app-route-skeleton__block-48 {
  max-width: var(--container-md);
}
.app-route-skeleton__block {
  min-width: 0;
}
.app-route-skeleton__block-2 {
  min-width: 0;
}
.app-route-skeleton__block-3 {
  min-width: 0;
}
.app-route-skeleton__block-14 {
  min-width: 0;
}
.app-route-skeleton__block-19 {
  min-width: 0;
}
.app-route-skeleton__block-20 {
  min-width: 0;
}
.app-route-skeleton__block-24 {
  min-width: 0;
}
.app-route-skeleton__block-14 {
  flex: 1;
}
.app-route-skeleton__block-24 {
  flex: 1;
}
.app-route-skeleton__block-28 {
  flex: 1;
}
.app-route-skeleton__block-40 {
  flex: 1;
}
.app-route-skeleton__block-13 {
  flex-shrink: 0;
}
.app-route-skeleton__block-17 {
  flex-shrink: 0;
}
.app-route-skeleton__block-21 {
  flex-shrink: 0;
}
.app-route-skeleton__block-39 {
  flex-shrink: 0;
}
.app-route-skeleton__block-41 {
  flex-shrink: 0;
}
.app-route-skeleton__block-2 {
  flex-direction: column;
}
.app-route-skeleton__block-5 {
  flex-direction: column;
}
.app-route-skeleton__block-20 {
  flex-direction: column;
}
.app-route-skeleton__block-55 {
  flex-direction: column;
}
.app-route-skeleton__block-65 {
  flex-direction: column;
}
.app-route-skeleton__block-7 {
  align-items: center;
}
.app-route-skeleton__block-12 {
  align-items: center;
}
.app-route-skeleton__block-15 {
  align-items: center;
}
.app-route-skeleton__block-21 {
  align-items: center;
}
.app-route-skeleton__block-39 {
  align-items: center;
}
.app-route-skeleton__block-52 {
  align-items: center;
}
.app-route-skeleton__block-55 {
  align-items: center;
}
.app-route-skeleton__block-59 {
  align-items: center;
}
.app-route-skeleton__block-69 {
  align-items: center;
}
.app-route-skeleton__block-15 {
  justify-content: space-between;
}
.app-route-skeleton__block-55 {
  justify-content: center;
}
.app-route-skeleton__block-31 {
  justify-content: flex-end;
}
.app-route-skeleton__block-35 {
  justify-content: flex-end;
}
.app-route-skeleton__block-29 {
  justify-content: flex-start;
}
.app-route-skeleton__block-33 {
  justify-content: flex-start;
}
.app-route-skeleton__block-37 {
  justify-content: flex-start;
}
.app-route-skeleton__block-7 {
  gap: calc(var(--spacing) * 2);
}
.app-route-skeleton__block-15 {
  gap: calc(var(--spacing) * 2);
}
.app-route-skeleton__block-39 {
  gap: calc(var(--spacing) * 2);
}
.app-route-skeleton__block-52 {
  gap: calc(var(--spacing) * 2);
}
.app-route-skeleton__block-69 {
  gap: calc(var(--spacing) * 2);
}
.app-route-skeleton__block-12 {
  gap: calc(var(--spacing) * 3);
}
.app-route-skeleton__block-21 {
  gap: calc(var(--spacing) * 3);
}
.app-route-skeleton__block-59 {
  gap: calc(var(--spacing) * 3);
}
.app-route-skeleton__block-5 {
  gap: calc(var(--spacing) * 4);
}
.app-route-skeleton__block-65 {
  gap: calc(var(--spacing) * 4);
}
:where(.app-route-skeleton__block-24>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.app-route-skeleton__block-11>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.app-route-skeleton__block-14>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.app-route-skeleton__block-45>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.app-route-skeleton__block-66>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.app-route-skeleton__block-74>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.app-route-skeleton__block-28>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.app-route-skeleton__block-73>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.app-route-skeleton__block-49>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 4) * 0);
  margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - 0));
}
:where(.app-route-skeleton__block-4>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.app-route-skeleton__block-44>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.app-route-skeleton__block-64>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
.app-route-skeleton__block {
  overflow: hidden;
}
.app-route-skeleton__block-2 {
  overflow: hidden;
}
.app-route-skeleton__block-19 {
  overflow: hidden;
}
.app-route-skeleton__block-20 {
  overflow: hidden;
}
.app-route-skeleton__block-28 {
  overflow: hidden;
}
.app-route-skeleton__block-3 {
  overflow-y: auto;
}
.app-route-skeleton__block-16 {
  border-radius: .25rem;
}
.app-route-skeleton__block-17 {
  border-radius: .25rem;
}
.app-route-skeleton__block-18 {
  border-radius: .25rem;
}
.app-route-skeleton__block-25 {
  border-radius: .25rem;
}
.app-route-skeleton__block-26 {
  border-radius: .25rem;
}
.app-route-skeleton__block-56 {
  border-radius: 3.40282e38px;
}
.app-route-skeleton__block-6 {
  border-radius: var(--radius-lg);
}
.app-route-skeleton__block-8 {
  border-radius: var(--radius-lg);
}
.app-route-skeleton__block-9 {
  border-radius: var(--radius-lg);
}
.app-route-skeleton__block-22 {
  border-radius: var(--radius-lg);
}
.app-route-skeleton__block-27 {
  border-radius: var(--radius-lg);
}
.app-route-skeleton__block-53 {
  border-radius: var(--radius-lg);
}
.app-route-skeleton__block-54 {
  border-radius: var(--radius-lg);
}
.app-route-skeleton__block-70 {
  border-radius: var(--radius-lg);
}
.app-route-skeleton__block-71 {
  border-radius: var(--radius-lg);
}
.app-route-skeleton__block-46 {
  border-radius: var(--radius-md);
}
.app-route-skeleton__block-47 {
  border-radius: var(--radius-md);
}
.app-route-skeleton__block-48 {
  border-radius: var(--radius-md);
}
.app-route-skeleton__block-57 {
  border-radius: var(--radius-md);
}
.app-route-skeleton__block-58 {
  border-radius: var(--radius-md);
}
.app-route-skeleton__block-67 {
  border-radius: var(--radius-md);
}
.app-route-skeleton__block-68 {
  border-radius: var(--radius-md);
}
.app-route-skeleton__block-75 {
  border-radius: var(--radius-md);
}
.app-route-skeleton__block-76 {
  border-radius: var(--radius-md);
}
.app-route-skeleton__block-77 {
  border-radius: var(--radius-md);
}
.app-route-skeleton__block-10 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-12 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-13 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-23 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-30 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-32 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-34 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-36 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-38 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-40 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-41 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-49 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-50 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-51 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-60 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-61 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-62 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-72 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-74 {
  border-radius: var(--radius-xl);
}
.app-route-skeleton__block-12 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.app-route-skeleton__block-49 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.app-route-skeleton__block-74 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.app-route-skeleton__block-39 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.app-route-skeleton__block-5 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.app-route-skeleton__block-21 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.app-route-skeleton__block-65 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.app-route-skeleton__block-5 {
  border-color: var(--app-border-quiet);
}
.app-route-skeleton__block-12 {
  border-color: var(--app-border-quiet);
}
.app-route-skeleton__block-21 {
  border-color: var(--app-border-quiet);
}
.app-route-skeleton__block-39 {
  border-color: var(--app-border-quiet);
}
.app-route-skeleton__block-49 {
  border-color: var(--app-border-quiet);
}
.app-route-skeleton__block-65 {
  border-color: var(--app-border-quiet);
}
.app-route-skeleton__block-74 {
  border-color: var(--app-border-quiet);
}
.app-route-skeleton__block {
  background-color: var(--ui-black);
}
.app-route-skeleton__block-19 {
  background-color: var(--ui-black);
}
.app-route-skeleton__block-42 {
  background-color: var(--ui-black);
}
.app-route-skeleton__block-55 {
  background-color: var(--ui-black);
}
.app-route-skeleton__block-63 {
  background-color: var(--ui-black);
}
.app-route-skeleton__block-12 {
  background-color: var(--app-surface-inset);
}
.app-route-skeleton__block-49 {
  background-color: var(--app-surface-inset);
}
.app-route-skeleton__block-74 {
  background-color: var(--app-surface-inset);
}
.app-route-skeleton__block-12 {
  padding: calc(var(--spacing) * 3);
}
.app-route-skeleton__block-74 {
  padding: calc(var(--spacing) * 4);
}
.app-route-skeleton__block-49 {
  padding: calc(var(--spacing) * 6);
}
.app-route-skeleton__block-4 {
  padding-inline: calc(var(--spacing) * 4);
}
.app-route-skeleton__block-21 {
  padding-inline: calc(var(--spacing) * 4);
}
.app-route-skeleton__block-28 {
  padding-inline: calc(var(--spacing) * 4);
}
.app-route-skeleton__block-39 {
  padding-inline: calc(var(--spacing) * 4);
}
.app-route-skeleton__block-43 {
  padding-inline: calc(var(--spacing) * 4);
}
.app-route-skeleton__block-64 {
  padding-inline: calc(var(--spacing) * 4);
}
.app-route-skeleton__block-55 {
  padding-inline: calc(var(--spacing) * 6);
}
.app-route-skeleton__block-39 {
  padding-block: calc(var(--spacing) * 3);
}
.app-route-skeleton__block-28 {
  padding-block: calc(var(--spacing) * 5);
}
.app-route-skeleton__block-4 {
  padding-block: calc(var(--spacing) * 6);
}
.app-route-skeleton__block-43 {
  padding-block: calc(var(--spacing) * 6);
}
.app-route-skeleton__block-64 {
  padding-block: calc(var(--spacing) * 6);
}
.app-route-skeleton__block-55 {
  padding-block: calc(var(--spacing) * 16);
}
.app-route-skeleton__block-5 {
  padding-bottom: calc(var(--spacing) * 5);
}
.app-route-skeleton__block-65 {
  padding-bottom: calc(var(--spacing) * 5);
}
.app-route-skeleton__block-3 {
  padding-bottom: calc(var(--spacing) * 16);
}
.app-route-skeleton__block-42 {
  padding-bottom: calc(var(--spacing) * 16);
}
.app-route-skeleton__block-63 {
  padding-bottom: calc(var(--spacing) * 16);
}
.app-route-skeleton__block-55 {
  text-align: center;
}
.app-route-skeleton__block {
  color: var(--ui-zinc-100);
}
.app-route-skeleton__block-19 {
  color: var(--ui-zinc-100);
}
.app-route-skeleton__block-42 {
  color: var(--ui-zinc-100);
}
.app-route-skeleton__block-55 {
  color: var(--ui-zinc-100);
}
.app-route-skeleton__block-63 {
  color: var(--ui-zinc-100);
}
}
}
</style>
