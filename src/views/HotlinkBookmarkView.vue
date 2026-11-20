<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Bookmark, Check, LoaderCircle, X } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { useIdentityStore } from "@/stores/identity";
import { saveBookmark, bookmarkHostname, normalizeBookmarkTags } from "@/lib/bookmarks";
import { addPendingBookmark } from "@/lib/bookmarkQueue";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();

const COUNTDOWN_START = 3;
const CIRC = 2 * Math.PI * 20;

const countdown = ref(COUNTDOWN_START);
const dashOffset = ref(0);
const status = ref("idle"); // 'idle' | 'saving' | 'saved' | 'queued' | 'error'
const error = ref("");
let rafId = null;
let rafEndAt = 0;

const url = computed(() => String(route.query.url || "").trim());
const pageTitle = computed(() => String(route.query.title || "").trim());
const tags = computed(() => {
  const raw = route.query.tags;
  const list = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
  return normalizeBookmarkTags(list);
});

const title = computed(() => {
  if (pageTitle.value) return pageTitle.value;
  return bookmarkHostname(url.value) || "Bookmark";
});

const displayUrl = computed(() => bookmarkHostname(url.value) || url.value);

const displayInitial = computed(() => (displayUrl.value ? displayUrl.value[0].toUpperCase() : "B"));

async function ensureIdentity(timeoutMs = 5000) {
  const start = Date.now();
  while (!identity.privkeyHex) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
  return true;
}

async function doSave() {
  if (status.value === "saving") return;
  status.value = "saving";
  error.value = "";
  try {
    await saveBookmark(identity.privkeyHex, identity.pubkeyHex, {
      title: title.value,
      url: url.value,
      ...(tags.value.length ? { tags: tags.value } : {}),
    });
    status.value = "saved";
    setTimeout(() => router.replace("/bookmarks"), 1800);
  } catch (err) {
    error.value = err?.message || "Failed to save bookmark.";
    status.value = "error";
  }
}

function frameLoop(now) {
  const remaining = Math.max(0, Math.min(1, (rafEndAt - now) / (COUNTDOWN_START * 1000)));
  countdown.value = Math.ceil(remaining * COUNTDOWN_START);
  dashOffset.value = CIRC * (1 - remaining);
  if (remaining > 0) {
    rafId = requestAnimationFrame(frameLoop);
  } else {
    rafId = null;
    void doSave();
  }
}

function startCountdown() {
  countdown.value = COUNTDOWN_START;
  dashOffset.value = 0;
  rafEndAt = performance.now() + COUNTDOWN_START * 1000;
  rafId = requestAnimationFrame(frameLoop);
}

function saveNow() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  void doSave();
}

function cancel() {
  router.replace("/bookmarks");
}

onMounted(async () => {
  if (!url.value) {
    router.replace("/bookmarks");
    return;
  }
  const ready = await ensureIdentity();
  if (ready && identity.isReady) {
    startCountdown();
    return;
  }

  // gupt-mark opens its own tab, which (with the account being session-only)
  // has no identity — and none is needed to remember the link. Queue it; the
  // Bookmarks view imports it into the encrypted stream on next sign-in.
  addPendingBookmark({ url: url.value, title: title.value, tags: tags.value });
  status.value = "queued";
});

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
});
</script>

<template>
  <main
    class="hotlink-bookmark-view__main"
  >
    <div class="hotlink-bookmark-view__block">
      <div class="hotlink-bookmark-view__block-2">
        <div
          v-if="status === 'saved'"
          class="hotlink-bookmark-view__block-3"
        >
          <div
            class="hotlink-bookmark-view__block-4"
          >
            <Check class="hotlink-bookmark-view__check" />
          </div>
          <h1 class="hotlink-bookmark-view__title-bookmark-saved">Bookmark saved</h1>
          <p class="hotlink-bookmark-view__text">Added to your encrypted bookmarks.</p>
          <button
            type="button"
            class="hotlink-bookmark-view__button-open-bookmarks"
            @click="router.replace('/bookmarks')"
          >
            Open bookmarks
          </button>
        </div>

        <div
          v-else-if="status === 'queued'"
          class="hotlink-bookmark-view__block-5"
        >
          <div
            class="hotlink-bookmark-view__block-6"
          >
            <Bookmark class="hotlink-bookmark-view__bookmark" />
          </div>
          <h1 class="hotlink-bookmark-view__title-link-saved">Link saved for later</h1>
          <p class="hotlink-bookmark-view__text-2">
            gupt-mark kept this link on this device. Next time you sign in and open Bookmarks, it
            gets encrypted and published automatically.
          </p>
          <button
            type="button"
            class="hotlink-bookmark-view__button-open-gupt"
            @click="router.replace('/bookmarks')"
          >
            Open gupt
          </button>
        </div>

        <div
          v-else
          class="hotlink-bookmark-view__block-7"
        >
          <div
            class="hotlink-bookmark-view__block-8"
          />

          <div class="hotlink-bookmark-view__block-9">
            <div class="hotlink-bookmark-view__block-10">
              <div class="hotlink-bookmark-view__block-11">
                <Bookmark class="hotlink-bookmark-view__bookmark-2" />
                <span class="hotlink-bookmark-view__text-new-bookmark">
                  New bookmark
                </span>
              </div>
              <button
                type="button"
                class="hotlink-bookmark-view__button-cancel"
                title="Cancel"
                @click="cancel"
              >
                <X class="hotlink-bookmark-view__x" />
              </button>
            </div>

            <div
              class="hotlink-bookmark-view__block-12"
            >
              <div
                class="hotlink-bookmark-view__block-13"
              >
                {{ displayInitial }}
              </div>
              <div class="hotlink-bookmark-view__block-14">
                <p class="hotlink-bookmark-view__text-3">{{ title }}</p>
                <p class="hotlink-bookmark-view__text-4">{{ displayUrl }}</p>
                <p v-if="tags.length" class="hotlink-bookmark-view__text-5">
                  {{ tags.join(" · ") }}
                </p>
              </div>
            </div>

            <div class="hotlink-bookmark-view__block-15">
              <template v-if="status === 'saving'">
                <LoaderCircle class="hotlink-bookmark-view__loader-circle" />
                <p class="hotlink-bookmark-view__text-6">Encrypting and publishing…</p>
              </template>
              <template v-else>
                <div class="hotlink-bookmark-view__block-16">
                  <svg class="hotlink-bookmark-view__icon" viewBox="0 0 48 48" aria-hidden="true">
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      fill="none"
                      stroke="var(--app-border-strong)"
                      stroke-width="4"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      fill="none"
                      stroke="var(--app-primary)"
                      stroke-width="4"
                      stroke-linecap="round"
                      :stroke-dasharray="CIRC"
                      :stroke-dashoffset="dashOffset"
                    />
                  </svg>
                  <span class="hotlink-bookmark-view__text-7">{{ countdown }}</span>
                </div>
                <p class="hotlink-bookmark-view__text-8">Saving automatically…</p>
              </template>
            </div>

            <AppAlertBanner v-if="status === 'error'" :message="error" class="hotlink-bookmark-view__app-alert-banner" />

            <div class="hotlink-bookmark-view__block-17">
              <button
                type="button"
                :disabled="status === 'saving'"
                class="hotlink-bookmark-view__button-cancel-2"
                @click="cancel"
              >
                <X class="hotlink-bookmark-view__x-2" />
                Cancel
              </button>
              <button
                type="button"
                :disabled="status === 'saving'"
                class="hotlink-bookmark-view__button-save-now"
                @click="saveNow"
              >
                <Bookmark class="hotlink-bookmark-view__bookmark-3" />
                Save now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.hotlink-bookmark-view__block-4 {
  background-color: color-mix(in oklab,var(--app-success) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.hotlink-bookmark-view__block-6 {
  background-color: color-mix(in oklab,var(--app-success) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.hotlink-bookmark-view__block-3 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.hotlink-bookmark-view__block-5 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.hotlink-bookmark-view__block-7 {
  background-color: color-mix(in srgb,var(--app-surface) 82%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.hotlink-bookmark-view__block-13 {
  background-color: color-mix(in oklab,var(--color-sky-500) 15%,transparent);
}
}

@supports (background-image:linear-gradient(in lab,red,red)) {
.hotlink-bookmark-view__block-8 {
  --gradient-position: to right in oklab;
}
}

@supports (color:color-mix(in lab,red,red)) {
.hotlink-bookmark-view__block-13 {
  --ring-color: color-mix(in oklab, var(--color-sky-400) 25%, transparent);
}
}

@media (hover:hover) {
.hotlink-bookmark-view__button-open-bookmarks:hover {
  background-color: var(--app-primary-strong);
}
}

@media (hover:hover) {
.hotlink-bookmark-view__button-open-gupt:hover {
  background-color: var(--app-primary-strong);
}
}

@media (hover:hover) {
.hotlink-bookmark-view__button-save-now:hover {
  background-color: var(--app-primary-strong);
}
}

@media (hover:hover) {
.hotlink-bookmark-view__button-cancel:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.hotlink-bookmark-view__button-cancel:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.hotlink-bookmark-view__button-cancel-2:hover {
  color: var(--app-text);
}
}

@media (min-width:40rem) {
.hotlink-bookmark-view__block-9 {
  padding: calc(var(--spacing) * 8);
}
}

@media (min-width:40rem) {
.hotlink-bookmark-view__block {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:64rem) {
.hotlink-bookmark-view__main {
  height: 100%;
}
}

@media (min-width:64rem) {
.hotlink-bookmark-view__block {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.hotlink-bookmark-view__icon {
  position: absolute;
}
.hotlink-bookmark-view__block-16 {
  position: relative;
}
.hotlink-bookmark-view__icon {
  inset: 0;
}
.hotlink-bookmark-view__block {
  margin-inline: auto;
}
.hotlink-bookmark-view__text {
  margin-top: var(--spacing);
}
.hotlink-bookmark-view__text-2 {
  margin-top: var(--spacing);
}
.hotlink-bookmark-view__text-5 {
  margin-top: var(--spacing);
}
.hotlink-bookmark-view__app-alert-banner {
  margin-top: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__block-12 {
  margin-top: calc(var(--spacing) * 5);
}
.hotlink-bookmark-view__button-open-bookmarks {
  margin-top: calc(var(--spacing) * 6);
}
.hotlink-bookmark-view__button-open-gupt {
  margin-top: calc(var(--spacing) * 6);
}
.hotlink-bookmark-view__block-15 {
  margin-top: calc(var(--spacing) * 6);
}
.hotlink-bookmark-view__block-17 {
  margin-top: calc(var(--spacing) * 6);
}
.hotlink-bookmark-view__block-4 {
  margin-bottom: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__block-6 {
  margin-bottom: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__block-3 {
  display: flex;
}
.hotlink-bookmark-view__block-4 {
  display: flex;
}
.hotlink-bookmark-view__block-5 {
  display: flex;
}
.hotlink-bookmark-view__block-6 {
  display: flex;
}
.hotlink-bookmark-view__block-10 {
  display: flex;
}
.hotlink-bookmark-view__block-11 {
  display: flex;
}
.hotlink-bookmark-view__block-12 {
  display: flex;
}
.hotlink-bookmark-view__block-13 {
  display: flex;
}
.hotlink-bookmark-view__block-15 {
  display: flex;
}
.hotlink-bookmark-view__block-16 {
  display: flex;
}
.hotlink-bookmark-view__block-17 {
  display: flex;
}
.hotlink-bookmark-view__button-open-bookmarks {
  display: inline-flex;
}
.hotlink-bookmark-view__button-open-gupt {
  display: inline-flex;
}
.hotlink-bookmark-view__button-cancel-2 {
  display: inline-flex;
}
.hotlink-bookmark-view__button-save-now {
  display: inline-flex;
}
.hotlink-bookmark-view__block-8 {
  height: var(--spacing);
}
.hotlink-bookmark-view__bookmark-2 {
  height: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__x {
  height: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__x-2 {
  height: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__bookmark-3 {
  height: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__check {
  height: calc(var(--spacing) * 7);
}
.hotlink-bookmark-view__bookmark {
  height: calc(var(--spacing) * 7);
}
.hotlink-bookmark-view__loader-circle {
  height: calc(var(--spacing) * 8);
}
.hotlink-bookmark-view__block-13 {
  height: calc(var(--spacing) * 10);
}
.hotlink-bookmark-view__block-4 {
  height: calc(var(--spacing) * 14);
}
.hotlink-bookmark-view__block-6 {
  height: calc(var(--spacing) * 14);
}
.hotlink-bookmark-view__block-16 {
  height: calc(var(--spacing) * 14);
}
.hotlink-bookmark-view__main {
  min-height: 100dvh;
}
.hotlink-bookmark-view__bookmark-2 {
  width: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__x {
  width: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__x-2 {
  width: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__bookmark-3 {
  width: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__check {
  width: calc(var(--spacing) * 7);
}
.hotlink-bookmark-view__bookmark {
  width: calc(var(--spacing) * 7);
}
.hotlink-bookmark-view__loader-circle {
  width: calc(var(--spacing) * 8);
}
.hotlink-bookmark-view__block-13 {
  width: calc(var(--spacing) * 10);
}
.hotlink-bookmark-view__block-4 {
  width: calc(var(--spacing) * 14);
}
.hotlink-bookmark-view__block-6 {
  width: calc(var(--spacing) * 14);
}
.hotlink-bookmark-view__block-16 {
  width: calc(var(--spacing) * 14);
}
.hotlink-bookmark-view__block {
  width: 100%;
}
.hotlink-bookmark-view__block-8 {
  width: 100%;
}
.hotlink-bookmark-view__block {
  max-width: var(--container-6xl);
}
.hotlink-bookmark-view__text-2 {
  max-width: var(--container-sm);
}
.hotlink-bookmark-view__block-14 {
  min-width: 0;
}
.hotlink-bookmark-view__block-14 {
  flex: 1;
}
.hotlink-bookmark-view__block-13 {
  flex-shrink: 0;
}
.hotlink-bookmark-view__icon {
  rotate: -90deg;
}
.hotlink-bookmark-view__loader-circle {
  animation: var(--animate-spin);
}
.hotlink-bookmark-view__block-3 {
  flex-direction: column;
}
.hotlink-bookmark-view__block-5 {
  flex-direction: column;
}
.hotlink-bookmark-view__block-15 {
  flex-direction: column;
}
.hotlink-bookmark-view__block-3 {
  align-items: center;
}
.hotlink-bookmark-view__block-4 {
  align-items: center;
}
.hotlink-bookmark-view__button-open-bookmarks {
  align-items: center;
}
.hotlink-bookmark-view__block-5 {
  align-items: center;
}
.hotlink-bookmark-view__block-6 {
  align-items: center;
}
.hotlink-bookmark-view__button-open-gupt {
  align-items: center;
}
.hotlink-bookmark-view__block-10 {
  align-items: center;
}
.hotlink-bookmark-view__block-11 {
  align-items: center;
}
.hotlink-bookmark-view__block-13 {
  align-items: center;
}
.hotlink-bookmark-view__block-15 {
  align-items: center;
}
.hotlink-bookmark-view__block-16 {
  align-items: center;
}
.hotlink-bookmark-view__block-17 {
  align-items: center;
}
.hotlink-bookmark-view__button-cancel-2 {
  align-items: center;
}
.hotlink-bookmark-view__button-save-now {
  align-items: center;
}
.hotlink-bookmark-view__block-12 {
  align-items: flex-start;
}
.hotlink-bookmark-view__block-10 {
  justify-content: space-between;
}
.hotlink-bookmark-view__block-4 {
  justify-content: center;
}
.hotlink-bookmark-view__block-6 {
  justify-content: center;
}
.hotlink-bookmark-view__block-13 {
  justify-content: center;
}
.hotlink-bookmark-view__block-16 {
  justify-content: center;
}
.hotlink-bookmark-view__button-cancel-2 {
  justify-content: center;
}
.hotlink-bookmark-view__button-save-now {
  justify-content: center;
}
.hotlink-bookmark-view__block-17 {
  justify-content: flex-end;
}
.hotlink-bookmark-view__button-open-bookmarks {
  gap: calc(var(--spacing) * 2);
}
.hotlink-bookmark-view__button-open-gupt {
  gap: calc(var(--spacing) * 2);
}
.hotlink-bookmark-view__block-11 {
  gap: calc(var(--spacing) * 2);
}
.hotlink-bookmark-view__block-15 {
  gap: calc(var(--spacing) * 2);
}
.hotlink-bookmark-view__block-17 {
  gap: calc(var(--spacing) * 2);
}
.hotlink-bookmark-view__button-cancel-2 {
  gap: calc(var(--spacing) * 2);
}
.hotlink-bookmark-view__button-save-now {
  gap: calc(var(--spacing) * 2);
}
.hotlink-bookmark-view__block-12 {
  gap: calc(var(--spacing) * 3);
}
:where(.hotlink-bookmark-view__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
:where(.hotlink-bookmark-view__block-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 6) * 0);
  margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - 0));
}
.hotlink-bookmark-view__text-3 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.hotlink-bookmark-view__text-4 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.hotlink-bookmark-view__text-5 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.hotlink-bookmark-view__block-7 {
  overflow: hidden;
}
.hotlink-bookmark-view__main {
  overflow-x: hidden;
}
.hotlink-bookmark-view__main {
  overflow-y: auto;
}
.hotlink-bookmark-view__block-4 {
  border-radius: var(--radius-2xl);
}
.hotlink-bookmark-view__block-6 {
  border-radius: var(--radius-2xl);
}
.hotlink-bookmark-view__block-12 {
  border-radius: var(--radius-2xl);
}
.hotlink-bookmark-view__block-3 {
  border-radius: var(--radius-3xl);
}
.hotlink-bookmark-view__block-5 {
  border-radius: var(--radius-3xl);
}
.hotlink-bookmark-view__block-7 {
  border-radius: var(--radius-3xl);
}
.hotlink-bookmark-view__button-open-bookmarks {
  border-radius: var(--radius-xl);
}
.hotlink-bookmark-view__button-open-gupt {
  border-radius: var(--radius-xl);
}
.hotlink-bookmark-view__button-cancel {
  border-radius: var(--radius-xl);
}
.hotlink-bookmark-view__block-13 {
  border-radius: var(--radius-xl);
}
.hotlink-bookmark-view__button-save-now {
  border-radius: var(--radius-xl);
}
.hotlink-bookmark-view__block-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.hotlink-bookmark-view__block-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.hotlink-bookmark-view__block-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.hotlink-bookmark-view__block-12 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.hotlink-bookmark-view__block-3 {
  border-color: var(--app-border);
}
.hotlink-bookmark-view__block-5 {
  border-color: var(--app-border);
}
.hotlink-bookmark-view__block-7 {
  border-color: var(--app-border);
}
.hotlink-bookmark-view__block-12 {
  border-color: var(--app-border);
}
.hotlink-bookmark-view__main {
  background-color: var(--app-bg);
}
.hotlink-bookmark-view__button-open-bookmarks {
  background-color: var(--app-primary);
}
.hotlink-bookmark-view__button-open-gupt {
  background-color: var(--app-primary);
}
.hotlink-bookmark-view__button-save-now {
  background-color: var(--app-primary);
}
.hotlink-bookmark-view__block-4 {
  background-color: var(--app-success);
}
.hotlink-bookmark-view__block-6 {
  background-color: var(--app-success);
}
.hotlink-bookmark-view__block-12 {
  background-color: var(--app-surface-soft);
}
.hotlink-bookmark-view__block-3 {
  background-color: var(--app-surface);
}
.hotlink-bookmark-view__block-5 {
  background-color: var(--app-surface);
}
.hotlink-bookmark-view__block-7 {
  background-color: var(--app-surface);
}
.hotlink-bookmark-view__block-13 {
  background-color: #00a5ef26;
}
.hotlink-bookmark-view__block-8 {
  --gradient-position: to right;
}
.hotlink-bookmark-view__block-8 {
  background-image: linear-gradient(var(--gradient-stops,));
}
.hotlink-bookmark-view__block-8 {
  --gradient-from: var(--app-primary);
  --gradient-stops: var(--gradient-via-stops,var(--gradient-position,), var(--app-primary) var(--gradient-from-position,0%), var(--gradient-to,#0000) var(--gradient-to-position,100%));
}
.hotlink-bookmark-view__block-8 {
  --gradient-via: var(--app-accent-share);
  --gradient-via-stops: var(--gradient-position,), var(--gradient-from,#0000) var(--gradient-from-position,0%), var(--app-accent-share) var(--gradient-via-position,50%), var(--gradient-to,#0000) var(--gradient-to-position,100%);
  --gradient-stops: var(--gradient-position,), var(--gradient-from,#0000) var(--gradient-from-position,0%), var(--app-accent-share) var(--gradient-via-position,50%), var(--gradient-to,#0000) var(--gradient-to-position,100%);
}
.hotlink-bookmark-view__block-8 {
  --gradient-to: var(--app-success);
  --gradient-stops: var(--gradient-via-stops,var(--gradient-position,), var(--gradient-from,#0000) var(--gradient-from-position,0%), var(--app-success) var(--gradient-to-position,100%));
}
.hotlink-bookmark-view__button-cancel {
  padding: calc(var(--spacing) * 1.5);
}
.hotlink-bookmark-view__block-12 {
  padding: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__block-9 {
  padding: calc(var(--spacing) * 6);
}
.hotlink-bookmark-view__block {
  padding-inline: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__button-open-bookmarks {
  padding-inline: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__button-open-gupt {
  padding-inline: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__button-cancel-2 {
  padding-inline: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__button-save-now {
  padding-inline: calc(var(--spacing) * 4);
}
.hotlink-bookmark-view__block-3 {
  padding-inline: calc(var(--spacing) * 6);
}
.hotlink-bookmark-view__block-5 {
  padding-inline: calc(var(--spacing) * 6);
}
.hotlink-bookmark-view__button-open-bookmarks {
  padding-block: calc(var(--spacing) * 2.5);
}
.hotlink-bookmark-view__button-open-gupt {
  padding-block: calc(var(--spacing) * 2.5);
}
.hotlink-bookmark-view__button-cancel-2 {
  padding-block: calc(var(--spacing) * 2.5);
}
.hotlink-bookmark-view__button-save-now {
  padding-block: calc(var(--spacing) * 2.5);
}
.hotlink-bookmark-view__block {
  padding-block: calc(var(--spacing) * 6);
}
.hotlink-bookmark-view__block-3 {
  padding-block: calc(var(--spacing) * 16);
}
.hotlink-bookmark-view__block-5 {
  padding-block: calc(var(--spacing) * 16);
}
.hotlink-bookmark-view__block-3 {
  text-align: center;
}
.hotlink-bookmark-view__block-5 {
  text-align: center;
}
.hotlink-bookmark-view__title-bookmark-saved {
  font-size: var(--text-lg);
  line-height: var(--leading,var(--text-lg--line-height));
}
.hotlink-bookmark-view__title-link-saved {
  font-size: var(--text-lg);
  line-height: var(--leading,var(--text-lg--line-height));
}
.hotlink-bookmark-view__text-7 {
  font-size: var(--text-lg);
  line-height: var(--leading,var(--text-lg--line-height));
}
.hotlink-bookmark-view__text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.hotlink-bookmark-view__button-open-bookmarks {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.hotlink-bookmark-view__text-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.hotlink-bookmark-view__button-open-gupt {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.hotlink-bookmark-view__block-13 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.hotlink-bookmark-view__text-3 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.hotlink-bookmark-view__button-cancel-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.hotlink-bookmark-view__button-save-now {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.hotlink-bookmark-view__text-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.hotlink-bookmark-view__text-5 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.hotlink-bookmark-view__text-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.hotlink-bookmark-view__text-8 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.hotlink-bookmark-view__text-new-bookmark {
  font-size: 11px;
}
.hotlink-bookmark-view__block-13 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.hotlink-bookmark-view__text-7 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.hotlink-bookmark-view__button-cancel-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.hotlink-bookmark-view__title-bookmark-saved {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.hotlink-bookmark-view__button-open-bookmarks {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.hotlink-bookmark-view__title-link-saved {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.hotlink-bookmark-view__button-open-gupt {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.hotlink-bookmark-view__text-new-bookmark {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.hotlink-bookmark-view__text-3 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.hotlink-bookmark-view__button-save-now {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.hotlink-bookmark-view__text-new-bookmark {
  --tracking: .16em;
  letter-spacing: .16em;
}
.hotlink-bookmark-view__text {
  color: var(--app-muted);
}
.hotlink-bookmark-view__text-2 {
  color: var(--app-muted);
}
.hotlink-bookmark-view__button-cancel {
  color: var(--app-muted);
}
.hotlink-bookmark-view__text-4 {
  color: var(--app-muted);
}
.hotlink-bookmark-view__text-6 {
  color: var(--app-muted);
}
.hotlink-bookmark-view__text-8 {
  color: var(--app-muted);
}
.hotlink-bookmark-view__button-cancel-2 {
  color: var(--app-muted);
}
.hotlink-bookmark-view__text-5 {
  color: var(--app-primary);
}
.hotlink-bookmark-view__loader-circle {
  color: var(--app-primary);
}
.hotlink-bookmark-view__block-4 {
  color: var(--app-success);
}
.hotlink-bookmark-view__block-6 {
  color: var(--app-success);
}
.hotlink-bookmark-view__block-11 {
  color: var(--app-success);
}
.hotlink-bookmark-view__main {
  color: var(--app-text);
}
.hotlink-bookmark-view__block-13 {
  color: var(--color-sky-300);
}
.hotlink-bookmark-view__button-open-bookmarks {
  color: var(--color-white);
}
.hotlink-bookmark-view__button-open-gupt {
  color: var(--color-white);
}
.hotlink-bookmark-view__button-save-now {
  color: var(--color-white);
}
.hotlink-bookmark-view__text-new-bookmark {
  text-transform: uppercase;
}
.hotlink-bookmark-view__text-7 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.hotlink-bookmark-view__block-3 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.hotlink-bookmark-view__block-5 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.hotlink-bookmark-view__block-7 {
  --shadow: 0 16px 48px var(--shadow-color,#00000029);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 16px 48px var(--shadow-color,#00000029);
}
.hotlink-bookmark-view__block-13 {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(1px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(1px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.hotlink-bookmark-view__block-13 {
  --ring-color: #00bcfe40;
}
.hotlink-bookmark-view__button-open-bookmarks {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.hotlink-bookmark-view__button-open-gupt {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.hotlink-bookmark-view__button-cancel {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.hotlink-bookmark-view__button-cancel-2 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.hotlink-bookmark-view__button-save-now {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.hotlink-bookmark-view__block-13 {
  --ring-inset: inset;
}
.hotlink-bookmark-view__button-save-now:disabled {
  cursor: not-allowed;
}
.hotlink-bookmark-view__button-cancel-2:disabled {
  opacity: .5;
}
.hotlink-bookmark-view__button-save-now:disabled {
  opacity: .5;
}
[data-theme="light"] .hotlink-bookmark-view__block-13 {
  color: #0369a1;
}
}
}
</style>
