<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Bookmark, Check, Loader2, X, KeyRound } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { useIdentityStore } from "@/stores/identity";
import { saveBookmark, bookmarkHostname, normalizeBookmarkTags } from "@/lib/bookmarks";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();

const COUNTDOWN_START = 3;
const CIRC = 2 * Math.PI * 20;

const countdown = ref(COUNTDOWN_START);
const dashOffset = ref(0);
const status = ref("idle"); // 'idle' | 'saving' | 'saved' | 'locked' | 'error'
const error = ref("");
let rafId = null;
let rafEndAt = 0;

const url = computed(() => String(route.query.url || "").trim());
const pageTitle = computed(() => String(route.query.title || "").trim());
const tags = computed(() =>
  normalizeBookmarkTags(
    String(route.query.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  ),
);

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
  if (!ready || !identity.privkeyHex || identity.mode !== "account") {
    status.value = "locked";
    return;
  }
  startCountdown();
});

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
});
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="mx-auto max-w-xl space-y-6">
        <div
          v-if="status === 'saved'"
          class="flex flex-col items-center rounded-3xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] px-6 py-16 text-center shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
        >
          <div
            class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--app-success)/10 text-(--app-success)"
          >
            <Check class="h-7 w-7" />
          </div>
          <h1 class="text-lg font-semibold">Bookmark saved</h1>
          <p class="mt-1 text-sm text-(--app-muted)">Added to your encrypted bookmarks.</p>
          <button
            type="button"
            class="mt-6 inline-flex items-center gap-2 rounded-xl bg-(--app-primary) px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-(--app-primary-strong)"
            @click="router.replace('/bookmarks')"
          >
            Open bookmarks
          </button>
        </div>

        <div
          v-else-if="status === 'locked'"
          class="flex flex-col items-center rounded-3xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] px-6 py-16 text-center shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
        >
          <div
            class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-400/25"
          >
            <KeyRound class="h-7 w-7" />
          </div>
          <h1 class="text-lg font-semibold">Sign in to save</h1>
          <p class="mt-1 max-w-sm text-sm text-(--app-muted)">
            Open gupt and restore your account so bookmarks are saved privately.
          </p>
          <button
            type="button"
            class="mt-6 inline-flex items-center gap-2 rounded-xl bg-(--app-primary) px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-(--app-primary-strong)"
            @click="router.push('/me')"
          >
            Open gupt
          </button>
        </div>

        <div
          v-else
          class="overflow-hidden rounded-3xl border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
        >
          <div
            class="h-1 w-full bg-linear-to-r from-(--app-primary) via-(--app-accent-share) to-(--app-success)"
          />

          <div class="p-6 sm:p-8">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-(--app-success)">
                <Bookmark class="h-4 w-4" />
                <span class="text-[11px] font-semibold uppercase tracking-[0.16em]">
                  New bookmark
                </span>
              </div>
              <button
                type="button"
                class="rounded-xl p-1.5 text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                title="Cancel"
                @click="cancel"
              >
                <X class="h-4 w-4" />
              </button>
            </div>

            <div
              class="mt-5 flex items-start gap-3 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4"
            >
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sm font-bold text-sky-300 ring-1 ring-inset ring-sky-400/25"
              >
                {{ displayInitial }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold">{{ title }}</p>
                <p class="truncate text-xs text-(--app-muted)">{{ displayUrl }}</p>
                <p v-if="tags.length" class="mt-1 truncate text-xs text-(--app-primary)">
                  {{ tags.join(" · ") }}
                </p>
              </div>
            </div>

            <div class="mt-6 flex flex-col items-center gap-2">
              <template v-if="status === 'saving'">
                <Loader2 class="h-8 w-8 animate-spin text-(--app-primary)" />
                <p class="text-xs text-(--app-muted)">Encrypting and publishing…</p>
              </template>
              <template v-else>
                <div class="relative flex h-14 w-14 items-center justify-center">
                  <svg class="absolute inset-0 -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
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
                  <span class="text-lg font-bold tabular-nums">{{ countdown }}</span>
                </div>
                <p class="text-xs text-(--app-muted)">Saving automatically…</p>
              </template>
            </div>

            <AppAlertBanner v-if="status === 'error'" :message="error" class="mt-4" />

            <div class="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                :disabled="status === 'saving'"
                class="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-(--app-muted) transition-colors hover:text-(--app-text) disabled:opacity-50"
                @click="cancel"
              >
                <X class="h-4 w-4" />
                Cancel
              </button>
              <button
                type="button"
                :disabled="status === 'saving'"
                class="inline-flex items-center justify-center gap-2 rounded-xl bg-(--app-primary) px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-(--app-primary-strong) disabled:cursor-not-allowed disabled:opacity-50"
                @click="saveNow"
              >
                <Bookmark class="h-4 w-4" />
                Save now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
