<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Bookmark, Check, LoaderCircle, X } from "@/icons";
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
  <main class="hotlink">
    <div class="hotlink__inner">
      <!-- Saved -->
      <section v-if="status === 'saved'" class="hotlink-card hotlink-card--done">
        <span class="hotlink-card__mark hotlink-card__mark--success" aria-hidden="true">
          <Check class="hotlink-card__mark-icon" :stroke-width="2.2" />
        </span>
        <p class="hotlink-card__eyebrow">gupt-mark</p>
        <h1 class="hotlink-card__title">Bookmark saved</h1>
        <p class="hotlink-card__lede">Added to your encrypted bookmarks.</p>
        <button type="button" class="hotlink-btn hotlink-btn--ink" @click="router.replace('/bookmarks')">
          Open bookmarks
        </button>
      </section>

      <!-- Queued -->
      <section v-else-if="status === 'queued'" class="hotlink-card">
        <span class="hotlink-card__mark" aria-hidden="true">
          <Bookmark class="hotlink-card__mark-icon" :stroke-width="1.8" />
        </span>
        <p class="hotlink-card__eyebrow">gupt-mark</p>
        <h1 class="hotlink-card__title">Link saved for later</h1>
        <p class="hotlink-card__lede">
          gupt-mark kept this link on this device. Next time you sign in and open Bookmarks, it
          gets encrypted and published automatically.
        </p>
        <button type="button" class="hotlink-btn hotlink-btn--ink" @click="router.replace('/bookmarks')">
          Open gupt
        </button>
      </section>

      <!-- Capturing -->
      <section v-else class="hotlink-card hotlink-card--capture">
        <header class="hotlink-card__head">
          <div class="hotlink-card__titleline">
            <span class="hotlink-card__badge">
              <Bookmark class="hotlink-card__badge-icon" :stroke-width="1.8" aria-hidden="true" />
              New bookmark
            </span>
          </div>
          <button type="button" class="hotlink-card__close" title="Cancel" @click="cancel">
            <X class="hotlink-card__close-icon" :stroke-width="2" aria-hidden="true" />
          </button>
        </header>

        <div class="hotlink-record">
          <span class="hotlink-record__initial" aria-hidden="true">{{ displayInitial }}</span>
          <div class="hotlink-record__body">
            <p class="hotlink-record__title">{{ title }}</p>
            <p class="hotlink-record__url">{{ displayUrl }}</p>
            <p v-if="tags.length" class="hotlink-record__tags">{{ tags.join(" · ") }}</p>
          </div>
        </div>

        <div class="hotlink-status">
          <template v-if="status === 'saving'">
            <LoaderCircle class="hotlink-status__spin" :stroke-width="1.9" aria-hidden="true" />
            <p class="hotlink-status__text">Encrypting and publishing…</p>
          </template>
          <template v-else>
            <div class="hotlink-status__ring">
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="20" fill="none" stroke="var(--app-border-strong)" stroke-width="2.5" />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="var(--app-primary)"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  :stroke-dasharray="CIRC"
                  :stroke-dashoffset="dashOffset"
                />
              </svg>
              <span class="hotlink-status__count">{{ countdown }}</span>
            </div>
            <p class="hotlink-status__text">Saving automatically…</p>
          </template>
        </div>

        <AppAlertBanner v-if="status === 'error'" :message="error" />

        <div class="hotlink-card__actions">
          <button type="button" :disabled="status === 'saving'" class="hotlink-btn" @click="cancel">
            <X class="hotlink-btn__icon" :stroke-width="1.9" aria-hidden="true" />
            Cancel
          </button>
          <button
            type="button"
            :disabled="status === 'saving'"
            class="hotlink-btn hotlink-btn--ink"
            @click="saveNow"
          >
            <Bookmark class="hotlink-btn__icon" :stroke-width="1.8" aria-hidden="true" />
            Save now
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
/* Ledger pass: a one-card capture sheet with a countdown dial. */

.hotlink {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: var(--app-space-6) var(--app-space-4);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 220ms var(--app-ease-standard) both;
}

.hotlink__inner {
  width: 100%;
  max-width: 26rem;
}

.hotlink-card {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}

.hotlink-card--done,
.hotlink-card--capture {
  align-items: stretch;
}

.hotlink-card__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  color: var(--app-muted);
}

.hotlink-card__mark--success {
  border-color: color-mix(in oklab, var(--app-success) 34%, var(--app-border));
  background: var(--app-success-soft);
  color: var(--app-success);
}

.hotlink-card__mark-icon {
  width: 15px;
  height: 15px;
}

.hotlink-card__eyebrow {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.hotlink-card__title {
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

.hotlink-card__lede {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--app-muted);
}

/* ---- Capture head ---- */

.hotlink-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-2);
  padding-bottom: var(--app-space-3);
  border-bottom: 1px solid var(--app-border);
}

.hotlink-card__titleline {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hotlink-card__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.hotlink-card__badge-icon {
  width: 11px;
  height: 11px;
}

.hotlink-card__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.hotlink-card__close-icon {
  width: 12px;
  height: 12px;
}

/* ---- Record ---- */

.hotlink-record {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
}

.hotlink-record__initial {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-soft);
}

.hotlink-record__body {
  min-width: 0;
}

.hotlink-record__title {
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.hotlink-record__url {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
  overflow-wrap: anywhere;
}

.hotlink-record__tags {
  margin: 5px 0 0;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.03em;
  color: var(--app-muted-2);
}

/* ---- Countdown ---- */

.hotlink-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-2);
  padding-block: var(--app-space-3);
}

.hotlink-status__ring {
  position: relative;
  width: 52px;
  height: 52px;
}

.hotlink-status__ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.hotlink-status__count {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 500;
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}

.hotlink-status__spin {
  width: 18px;
  height: 18px;
  color: var(--app-muted);
  animation: var(--animate-spin);
}

.hotlink-status__text {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

/* ---- Actions ---- */

.hotlink-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: var(--app-space-3);
  border-top: 1px solid var(--app-border);
}

.hotlink-card__actions .hotlink-btn {
  flex: 1;
}

.hotlink-card--done .hotlink-btn,
.hotlink-card--queued .hotlink-btn {
  align-self: flex-start;
}

.hotlink-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding-inline: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.hotlink-btn:active {
  transform: translateY(1px);
}

.hotlink-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.hotlink-btn__icon {
  width: 11px;
  height: 11px;
}

.hotlink-btn--ink {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

@media (min-width: 40rem) {
  .hotlink-card {
    padding: var(--app-space-6);
  }
}

@media (hover: hover) {
  .hotlink-btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .hotlink-btn--ink:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .hotlink-card__close:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .hotlink-btn,
  .hotlink-card__close {
    min-height: var(--app-touch-h);
  }

  .hotlink-card__close {
    min-width: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hotlink,
  .hotlink-card {
    animation: none;
  }

  .hotlink-btn,
  .hotlink-card__close {
    transition: none;
  }
}
</style>
