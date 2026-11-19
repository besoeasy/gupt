<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Check, LoaderCircle, Plus, RefreshCw, ShieldCheck, Users } from "@lucide/vue";

import { addCustomRelay } from "@/lib/relay";
import {
  ignoreRelayHint,
  loadRelaySuggestions,
  readCachedRelaySuggestions,
} from "@/lib/relayHints";

const rows = ref([]);
const loading = ref(true);
const refreshing = ref(false);
const failed = ref(false);
const addedLabel = ref("");
let addedTimer = null;

const countLabel = computed(() =>
  rows.value.length === 1 ? "1 relay" : `${rows.value.length} relays`,
);

function flashAdded(label) {
  addedLabel.value = `${label} added`;
  if (addedTimer) clearTimeout(addedTimer);
  addedTimer = setTimeout(() => {
    addedLabel.value = "";
    addedTimer = null;
  }, 4000);
}

function apply(next) {
  rows.value = Array.isArray(next) ? next : [];
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("gupt:relay-hints-changed"));
  }
}

async function load({ force = false } = {}) {
  failed.value = false;
  if (force) refreshing.value = true;
  try {
    apply(await loadRelaySuggestions({ force }));
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

onMounted(async () => {
  // Cached rows paint instantly; the verification pass follows.
  try {
    const cached = await readCachedRelaySuggestions();
    if (cached.length) {
      apply(cached);
      loading.value = false;
    }
  } catch {
    // keep the skeleton until the network pass answers
  }
  await load();
});

function handleAdd(row) {
  const added = addCustomRelay(row.url);
  rows.value = rows.value.filter((entry) => entry.url !== row.url);
  if (added) flashAdded(row.label);
}

function handleIgnore(row) {
  ignoreRelayHint(row.url);
  rows.value = rows.value.filter((entry) => entry.url !== row.url);
  // The summary and status strip read the hints cache, so tell them the
  // suggestion is gone.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("gupt:relay-hints-changed"));
  }
}

function trustLabel(row) {
  if (row.contactCount > 0) {
    return row.contactCount === 1 ? "Known contact" : `${row.contactCount} known contacts`;
  }
  return row.authorCount === 1 ? "1 author" : `${row.authorCount} authors`;
}

onUnmounted(() => {
  if (addedTimer) clearTimeout(addedTimer);
});
</script>

<template>
  <div class="space-y-2 border-t border-zinc-800/60 pt-4">
    <div class="flex flex-wrap items-center justify-between gap-2 px-1">
      <div class="min-w-0">
        <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600 tabular-nums">
          Suggested relays
          <template v-if="rows.length">
            <span class="text-zinc-700">·</span>
            <span class="text-zinc-500">{{ countLabel }}</span>
          </template>
        </p>
        <p class="mt-1 text-[10px] leading-relaxed text-zinc-600">
          Shared by people on the relays you already use. Only verified nodes appear here.
        </p>
      </div>

      <button
        type="button"
        class="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 font-mono text-[10px] text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300 active:scale-[0.98] sm:min-h-8"
        :disabled="refreshing"
        title="Fetch and verify suggestions again"
        @click="load({ force: true })"
      >
        <RefreshCw
          class="h-3 w-3"
          :class="refreshing ? 'animate-spin' : ''"
          :stroke-width="2"
          aria-hidden="true"
        />
        Refresh
      </button>
    </div>

    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
    >
      <p
        v-if="addedLabel"
        class="px-1 font-mono text-[10px] text-emerald-400"
        role="status"
        aria-live="polite"
      >
        {{ addedLabel }}
      </p>
    </Transition>

    <div v-if="loading" class="space-y-2" aria-hidden="true">
      <div
        v-for="index in 2"
        :key="index"
        class="h-16 animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/40"
      />
    </div>

    <div v-else-if="rows.length" class="space-y-2">
      <div
        v-for="row in rows"
        :key="row.url"
        class="group rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-2.5 transition-colors duration-200 hover:border-zinc-700/80"
      >
        <div class="flex items-start gap-2.5">
          <span
            class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400"
            title="Verified Rabta v1 node"
          >
            <ShieldCheck class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
          </span>

          <div class="min-w-0 flex-1">
            <p class="truncate font-mono text-xs text-zinc-200" :title="row.url">
              {{ row.label }}
            </p>

            <div
              class="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tabular-nums"
            >
              <span
                class="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
                :class="
                  row.contactCount > 0
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-zinc-800/70 text-zinc-400'
                "
              >
                <Users class="h-2.5 w-2.5" :stroke-width="2.5" aria-hidden="true" />
                {{ trustLabel(row) }}
              </span>
              <span class="rounded bg-zinc-800/70 px-1.5 py-0.5 text-zinc-400">Verified</span>
              <span
                v-if="row.mode === 'sync_disabled'"
                class="rounded bg-yellow-500/10 px-1.5 py-0.5 text-yellow-400"
                title="This relay paused peer sync until its battery regenerates"
              >
                sync-off
              </span>
              <span v-if="row.latencyMs > 0" class="text-zinc-500">{{ row.latencyMs }}ms</span>
              <span v-if="row.nodeId" class="truncate text-zinc-600" :title="row.nodeId">
                node {{ row.nodeId.slice(0, 8) }}
              </span>
            </div>

            <p
              v-if="row.note"
              class="mt-1 line-clamp-2 text-[10px] leading-relaxed text-zinc-500"
              :title="row.note"
            >
              “{{ row.note }}”
            </p>
            <p
              v-if="row.contactCount === 0"
              class="mt-1 text-[10px] leading-relaxed text-amber-500/70"
            >
              No one you know vouches for this node — adding it shares your IP with its operator.
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-1">
            <button
              type="button"
              class="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 font-mono text-[10px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25 active:scale-[0.98] sm:min-h-8"
              :aria-label="`Add relay ${row.label}`"
              @click="handleAdd(row)"
            >
              <Plus class="h-3 w-3" :stroke-width="2.5" aria-hidden="true" />
              Add
            </button>
            <button
              type="button"
              class="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 font-mono text-[10px] text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300 active:scale-[0.98] sm:min-h-8"
              :aria-label="`Ignore relay ${row.label}`"
              @click="handleIgnore(row)"
            >
              Ignore
            </button>
          </div>
        </div>
      </div>
    </div>

    <p
      v-else-if="failed"
      class="flex items-center gap-1.5 px-1 py-3 font-mono text-[10px] text-zinc-600"
    >
      <LoaderCircle class="h-3 w-3" :stroke-width="2" aria-hidden="true" />
      Couldn't reach your relays for suggestions. They'll retry on Refresh.
    </p>

    <div v-else class="flex items-center gap-2 px-1 py-3">
      <Check class="h-3 w-3 shrink-0 text-zinc-700" :stroke-width="2" aria-hidden="true" />
      <p class="font-mono text-[10px] leading-relaxed text-zinc-600">
        No relay suggestions yet. Hints appear here when people on your relays share one.
      </p>
    </div>
  </div>
</template>
