<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Bookmark, Check, Loader2, X, KeyRound } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { useIdentityStore } from "@/stores/identity";
import { saveVaultItem } from "@/lib/vault";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();

const COUNTDOWN_START = 3;
const CIRC = 2 * Math.PI * 20;

const countdown = ref(COUNTDOWN_START);
const status = ref("idle"); // 'idle' | 'saving' | 'saved' | 'locked' | 'error'
const error = ref("");
let timer = null;

const url = computed(() => String(route.query.url || "").trim());
const pageTitle = computed(() => String(route.query.title || "").trim());
const note = computed(() => String(route.query.note || "").trim().slice(0, 400));

const title = computed(() => {
  if (pageTitle.value) return pageTitle.value;
  try {
    return new URL(url.value).hostname || "Bookmark";
  } catch {
    return "Bookmark";
  }
});

const displayUrl = computed(() => {
  try {
    return new URL(url.value).hostname.replace(/^www\./, "") || url.value;
  } catch {
    return url.value;
  }
});

const displayInitial = computed(() =>
  displayUrl.value ? displayUrl.value[0].toUpperCase() : "B",
);

const content = computed(() => {
  const lines = [];
  if (url.value) lines.push(`**URL:** ${url.value}`);
  if (pageTitle.value) lines.push(`**Description:** ${pageTitle.value}`);
  if (note.value) lines.push(`**Notes:** ${note.value}`);
  return lines.join("\n");
});

const dashOffset = computed(() => CIRC * (1 - countdown.value / COUNTDOWN_START));

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
    await saveVaultItem(
      identity.privkeyHex,
      identity.pubkeyHex,
      { title: title.value, content: content.value, tags: ["bookmark"] },
      0,
    );
    status.value = "saved";
    setTimeout(() => router.replace("/vault"), 1800);
  } catch (err) {
    error.value = err?.message || "Failed to save bookmark.";
    status.value = "error";
  }
}

function startCountdown() {
  countdown.value = COUNTDOWN_START;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      clearInterval(timer);
      timer = null;
      void doSave();
    }
  }, 1000);
}

function saveNow() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  void doSave();
}

function cancel() {
  router.replace("/vault");
}

onMounted(async () => {
  if (!url.value) {
    router.replace("/vault");
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
  if (timer) clearInterval(timer);
});
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="mx-auto max-w-xl space-y-6">
        <!-- Success -->
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
          <p class="mt-1 text-sm text-(--app-muted)">
            Added to your vault with the <span class="text-(--app-text-soft)">bookmark</span> tag.
          </p>
          <button
            type="button"
            class="mt-6 inline-flex items-center gap-2 rounded-xl bg-(--app-primary) px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-(--app-primary-strong)"
            @click="router.replace('/vault')"
          >
            Open vault
          </button>
        </div>

        <!-- Locked -->
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
            Open gupt and restore your account so bookmarks are saved to your encrypted vault.
          </p>
          <button
            type="button"
            class="mt-6 inline-flex items-center gap-2 rounded-xl bg-(--app-primary) px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-(--app-primary-strong)"
            @click="router.push('/me')"
          >
            Open gupt
          </button>
        </div>

        <!-- Capture card -->
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

            <!-- Preview -->
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
                <p
                  v-if="note"
                  class="mt-1.5 line-clamp-2 text-xs leading-relaxed text-(--app-muted)"
                >
                  {{ note }}
                </p>
              </div>
            </div>

            <!-- Countdown / saving -->
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

            <!-- Actions -->
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
