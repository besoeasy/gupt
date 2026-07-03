<script setup>
import { computed, ref, watch } from "vue";
import {
  CheckCircle2,
  ChevronDown,
  Cloud,
  Globe,
  Lock,
  Server,
  ShieldCheck,
  Wifi,
  XCircle,
} from "lucide-vue-next";
import { MEDIA_PHASE, SOURCE_STATUS } from "@/lib/mediaDecrypt";

const props = defineProps({
  progress: { type: Object, default: null },
  compact: { type: Boolean, default: false },
});

const expanded = ref(false);

const phase = computed(() => props.progress?.phase || MEDIA_PHASE.IDLE);
const sources = computed(() => props.progress?.sources || []);

const isActive = computed(
  () => phase.value === MEDIA_PHASE.FETCH || phase.value === MEDIA_PHASE.DECRYPT,
);
const isSuccess = computed(
  () => phase.value === MEDIA_PHASE.DONE || phase.value === MEDIA_PHASE.CACHED,
);
const isFailed = computed(() => phase.value === MEDIA_PHASE.FAILED);
const isFetching = computed(() => phase.value === MEDIA_PHASE.FETCH);
const isDecrypting = computed(() => phase.value === MEDIA_PHASE.DECRYPT);

const tryingSources = computed(() =>
  sources.value.filter((source) => source.status === SOURCE_STATUS.TRYING),
);
const settledCount = computed(
  () =>
    sources.value.filter((source) =>
      [SOURCE_STATUS.OK, SOURCE_STATUS.FAILED, SOURCE_STATUS.SKIPPED].includes(source.status),
    ).length,
);
const progressPercent = computed(() => {
  if (!sources.value.length) return isActive.value ? 12 : 0;
  const base = (settledCount.value / sources.value.length) * 100;
  if (phase.value === MEDIA_PHASE.DECRYPT) return Math.max(base, 88);
  if (isSuccess.value) return 100;
  if (isActive.value)
    return Math.max(8, Math.min(base + (tryingSources.value.length ? 14 : 0), 92));
  return base;
});

const headline = computed(() => {
  if (phase.value === MEDIA_PHASE.CACHED) return "Already on your device";
  if (phase.value === MEDIA_PHASE.DONE) {
    const winner = sources.value.find((source) => source.id === props.progress?.winnerId);
    return winner ? `Ready · via ${winner.label}` : "Decrypted & ready";
  }
  if (phase.value === MEDIA_PHASE.DECRYPT) return "Unlocking just for you…";
  if (phase.value === MEDIA_PHASE.FETCH) {
    if (tryingSources.value.length > 1) {
      return `Checking ${tryingSources.value.length} mirrors`;
    }
    if (tryingSources.value.length === 1) {
      return `Pulling from ${tryingSources.value[0].label}`;
    }
    return "Hunting for a mirror…";
  }
  if (isFailed.value) {
    return props.progress?.errorKind === "decrypt"
      ? "Couldn't unlock the file"
      : "All mirrors went dark";
  }
  return "Getting things ready…";
});

const subline = computed(() => {
  if (isFailed.value) return props.progress?.error || "Tap Decrypt to give it another go.";
  if (isSuccess.value) return "Decrypted privately on this device — nobody else saw it.";
  if (phase.value === MEDIA_PHASE.DECRYPT) return "Your key never leaves this browser.";
  if (phase.value === MEDIA_PHASE.FETCH && sources.value.length > 1) {
    return `${settledCount.value} of ${sources.value.length} mirrors checked`;
  }
  return "Fetching the encrypted blob over IPFS";
});

watch(
  isActive,
  (active) => {
    if (active) expanded.value = true;
  },
  { immediate: true },
);

function typeIcon(type) {
  const value = String(type || "").toLowerCase();
  if (value === "blossom") return Cloud;
  if (value === "ipfs") return Globe;
  return Server;
}

function typeBadge(type) {
  const value = String(type || "").toLowerCase();
  if (value === "blossom") return "Blossom";
  if (value === "originless") return "Originless";
  if (value === "ipfs") return "IPFS";
  return value ? value : "Mirror";
}

function statusLabel(status) {
  if (status === SOURCE_STATUS.OK) return "Got it ✓";
  if (status === SOURCE_STATUS.TRYING) return "Trying…";
  if (status === SOURCE_STATUS.FAILED) return "No luck";
  if (status === SOURCE_STATUS.SKIPPED) return "Skipped";
  return "Waiting";
}

// Step-based state for the humanized stepper
const steps = computed(() => [
  {
    id: "fetch",
    label: "Fetching",
    sublabel: "Pulling encrypted file from IPFS",
    icon: Wifi,
    done: isDecrypting.value || isSuccess.value,
    active: isFetching.value,
    failed: isFailed.value && !isDecrypting.value,
  },
  {
    id: "decrypt",
    label: "Decrypting",
    sublabel: "Opening with your private key",
    icon: Lock,
    done: isSuccess.value,
    active: isDecrypting.value,
    failed: isFailed.value && props.progress?.errorKind === "decrypt",
  },
  {
    id: "ready",
    label: "Ready",
    sublabel: "File is yours to use",
    icon: ShieldCheck,
    done: isSuccess.value,
    active: false,
    failed: false,
  },
]);
</script>

<template>
  <div
    v-if="progress && (isActive || isFailed || isSuccess || sources.length)"
    class="w-full min-w-0"
    :class="compact ? 'text-[11px]' : 'text-xs'"
  >
    <!-- ── Main card ─────────────────────────────────────── -->
    <div
      class="relative overflow-hidden rounded-2xl border transition-all duration-500"
      :class="[
        isFailed
          ? 'border-red-500/20 bg-red-950/20'
          : isSuccess
            ? 'border-emerald-500/20 bg-emerald-950/10'
            : 'border-white/8 bg-white/[0.03]',
      ]"
    >
      <!-- animated gradient shimmer while active -->
      <div
        v-if="isActive"
        class="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_2s_linear_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"
      />

      <div class="p-3">
        <!-- ── Humanized step track ──────────────────────── -->
        <div v-if="isActive || isSuccess" class="mb-3 flex items-center gap-0">
          <template v-for="(step, i) in steps" :key="step.id">
            <!-- Step dot -->
            <div class="flex flex-col items-center">
              <div
                class="flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-500"
                :class="[
                  step.done
                    ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-400'
                    : step.active
                      ? 'border-violet-500/50 bg-violet-500/15 text-violet-300'
                      : step.failed
                        ? 'border-red-500/50 bg-red-500/15 text-red-400'
                        : 'border-white/10 bg-white/[0.03] text-zinc-600',
                ]"
              >
                <!-- pulsing ring while active -->
                <span
                  v-if="step.active"
                  class="absolute h-7 w-7 animate-ping rounded-full bg-violet-500/20"
                />
                <component
                  :is="step.done ? CheckCircle2 : step.failed ? XCircle : step.icon"
                  class="h-3.5 w-3.5 shrink-0"
                  :class="step.active ? 'animate-pulse' : ''"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </div>
              <span
                class="mt-1 text-[9px] font-semibold uppercase tracking-wider transition-colors duration-300"
                :class="[
                  step.done
                    ? 'text-emerald-400'
                    : step.active
                      ? 'text-violet-300'
                      : step.failed
                        ? 'text-red-400'
                        : 'text-zinc-600',
                ]"
              >
                {{ step.label }}
              </span>
            </div>

            <!-- Connector line between steps -->
            <div
              v-if="i < steps.length - 1"
              class="mb-3.5 h-px flex-1 transition-all duration-700"
              :class="[
                steps[i + 1].done || steps[i + 1].active
                  ? 'bg-gradient-to-r from-emerald-500/40 to-violet-500/40'
                  : 'bg-white/8',
              ]"
            />
          </template>
        </div>

        <!-- ── Status line ───────────────────────────────── -->
        <div class="flex items-start gap-2">
          <component
            :is="
              isFailed
                ? XCircle
                : isSuccess
                  ? CheckCircle2
                  : isFetching
                    ? Wifi
                    : isDecrypting
                      ? Lock
                      : Wifi
            "
            class="mt-0.5 h-3.5 w-3.5 shrink-0"
            :class="[
              isFailed
                ? 'text-red-400'
                : isSuccess
                  ? 'text-emerald-400'
                  : 'text-violet-400 ' + (isActive ? 'animate-pulse' : ''),
            ]"
            :stroke-width="2"
            aria-hidden="true"
          />

          <div class="min-w-0 flex-1">
            <p
              class="font-semibold leading-snug transition-colors duration-300"
              :class="[
                isFailed
                  ? 'text-red-400'
                  : isSuccess
                    ? 'text-emerald-400'
                    : isActive
                      ? 'text-violet-300'
                      : 'text-zinc-200',
              ]"
            >
              {{ headline }}
            </p>
            <p class="mt-0.5 leading-snug text-zinc-500">{{ subline }}</p>
          </div>

          <!-- Mirrors toggle -->
          <button
            v-if="sources.length"
            type="button"
            class="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold text-zinc-500 transition-all hover:bg-white/5 hover:text-zinc-300"
            @click="expanded = !expanded"
          >
            {{ sources.length }} mirrors
            <ChevronDown
              class="h-3 w-3 transition-transform duration-200"
              :class="expanded ? 'rotate-180' : ''"
              :stroke-width="2"
              aria-hidden="true"
            />
          </button>
        </div>

        <!-- ── Progress bar ───────────────────────────────── -->
        <div v-if="isActive || isFailed" class="mt-3 flex items-center gap-2">
          <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
            <div
              class="h-full rounded-full transition-all duration-700 ease-out"
              :class="[
                isFailed
                  ? 'bg-red-400'
                  : isSuccess
                    ? 'bg-gradient-to-r from-emerald-400 to-teal-400'
                    : 'bg-gradient-to-r from-violet-500 to-fuchsia-400',
              ]"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>
          <span class="shrink-0 text-[10px] font-semibold tabular-nums text-zinc-500">
            {{ Math.round(progressPercent) }}%
          </span>
        </div>
      </div>

      <!-- ── Expanded mirrors list ───────────────────────── -->
      <div
        v-if="expanded && sources.length"
        class="border-t border-white/8 bg-black/20 px-3 py-2"
      >
        <ul class="space-y-1.5">
          <li v-for="source in sources" :key="source.id" class="flex items-start gap-2 py-0.5">
            <component
              :is="typeIcon(source.type)"
              class="mt-0.5 h-3 w-3 shrink-0 text-zinc-500"
              :stroke-width="2"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="truncate font-medium text-zinc-300">{{ source.label }}</span>
                <span
                  class="shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide"
                  :class="[
                    source.type === 'ipfs'
                      ? 'bg-violet-500/15 text-violet-400'
                      : source.type === 'blossom'
                        ? 'bg-sky-500/15 text-sky-400'
                        : 'bg-white/8 text-zinc-500',
                  ]"
                >
                  {{ typeBadge(source.type) }}
                </span>
              </div>
              <p v-if="source.error" class="truncate text-[10px] text-red-400/90">
                {{ source.error }}
              </p>
            </div>
            <span
              class="shrink-0 text-[10px] font-semibold transition-colors duration-300"
              :class="{
                'text-emerald-400': source.status === SOURCE_STATUS.OK,
                'animate-pulse text-violet-400': source.status === SOURCE_STATUS.TRYING,
                'text-red-400': source.status === SOURCE_STATUS.FAILED,
                'text-zinc-600': source.status === SOURCE_STATUS.SKIPPED,
                'text-zinc-500': source.status === SOURCE_STATUS.PENDING,
              }"
            >
              {{ statusLabel(source.status) }}
            </span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes shimmer {
  to {
    transform: translateX(200%);
  }
}
</style>
