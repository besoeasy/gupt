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
    if (tryingSources.value.length > 1) return `Checking ${tryingSources.value.length} mirrors`;
    if (tryingSources.value.length === 1) return `Pulling from ${tryingSources.value[0].label}`;
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
  if (value === "ipfs") return Globe;
  return Server;
}

function typeBadge(type) {
  const value = String(type || "").toLowerCase();
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

const steps = computed(() => [
  {
    id: "fetch",
    label: "Fetching",
    icon: Wifi,
    done: isDecrypting.value || isSuccess.value,
    active: isFetching.value,
    failed: isFailed.value && !isDecrypting.value,
  },
  {
    id: "decrypt",
    label: "Decrypting",
    icon: Lock,
    done: isSuccess.value,
    active: isDecrypting.value,
    failed: isFailed.value && props.progress?.errorKind === "decrypt",
  },
  {
    id: "ready",
    label: "Ready",
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
    class="ipfs-status w-full min-w-0"
    :class="compact ? 'text-[11px]' : 'text-xs'"
  >
    <div
      class="relative overflow-hidden rounded-[14px] border border-(--app-border) bg-(--app-surface) transition-colors duration-400"
      :class="{
        '!border-[color-mix(in_srgb,var(--app-primary)_30%,transparent)] !bg-[color-mix(in_srgb,var(--app-primary-soft)_35%,var(--app-surface))]':
          isActive,
        '!border-[color-mix(in_srgb,var(--app-success)_30%,transparent)] !bg-[color-mix(in_srgb,var(--app-success-soft)_40%,var(--app-surface))]':
          isSuccess,
        '!border-[color-mix(in_srgb,var(--app-danger)_25%,transparent)] !bg-[color-mix(in_srgb,var(--app-danger)_6%,var(--app-surface))]':
          isFailed,
      }"
    >
      <!-- Animated sweep while active -->
      <div
        v-if="isActive"
        class="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_30%,color-mix(in_srgb,var(--app-primary)_12%,transparent)_50%,transparent_70%)] -translate-x-full animate-[sweep_2.4s_linear_infinite]"
      />

      <div class="p-3">
        <!-- ── Step track ─────────────────────────────── -->
        <div v-if="isActive || isSuccess" class="flex items-center gap-0 mb-[10px]">
          <template v-for="(step, i) in steps" :key="step.id">
            <div class="flex flex-col items-center">
              <div
                class="relative flex items-center justify-center w-[28px] h-[28px] rounded-full border border-(--app-border) bg-(--app-surface-raised) transition-colors duration-400"
                :class="{
                  '!border-[color-mix(in_srgb,var(--app-success)_50%,transparent)] !bg-[color-mix(in_srgb,var(--app-success)_14%,transparent)] !text-(--app-success)':
                    step.done,
                  '!border-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] !bg-[color-mix(in_srgb,var(--app-primary)_14%,transparent)] !text-(--app-primary) animate-[dot-breathe_1.6s_ease-in-out_infinite]':
                    step.active,
                  '!border-[color-mix(in_srgb,var(--app-danger)_50%,transparent)] !bg-[color-mix(in_srgb,var(--app-danger)_12%,transparent)] !text-(--app-danger)':
                    step.failed,
                  '!text-(--app-muted-2)': !step.done && !step.active && !step.failed,
                }"
              >
                <span
                  v-if="step.active"
                  class="absolute -inset-px rounded-full bg-[color-mix(in_srgb,var(--app-primary)_25%,transparent)] animate-[ping_1.4s_cubic-bezier(0,0,0.2,1)_infinite]"
                />
                <component
                  :is="step.done ? CheckCircle2 : step.failed ? XCircle : step.icon"
                  class="w-[14px] h-[14px] shrink-0 relative"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </div>
              <span
                class="mt-1 text-[9px] font-bold tracking-[0.08em] uppercase text-(--app-muted-2) transition-colors duration-300"
                :class="{
                  '!text-(--app-success)': step.done,
                  '!text-(--app-primary)': step.active,
                  '!text-(--app-danger)': step.failed,
                }"
              >
                {{ step.label }}
              </span>
            </div>

            <div
              v-if="i < steps.length - 1"
              class="flex-1 h-px mb-[14px] bg-(--app-border) transition-colors duration-500"
              :class="{
                '!bg-[linear-gradient(to_right,color-mix(in_srgb,var(--app-success)_50%,transparent),color-mix(in_srgb,var(--app-primary)_50%,transparent))]':
                  steps[i + 1].done || steps[i + 1].active,
              }"
            />
          </template>
        </div>

        <!-- ── Headline row ───────────────────────────── -->
        <div class="flex items-start gap-2">
          <component
            :is="isFailed ? XCircle : isSuccess ? CheckCircle2 : isFetching ? Wifi : Lock"
            class="mt-[2px] w-[14px] h-[14px] shrink-0 text-(--app-muted) transition-colors duration-300"
            :class="{
              '!text-(--app-danger)': isFailed,
              '!text-(--app-success)': isSuccess,
              '!text-(--app-primary) animate-[icon-pulse_1.8s_ease-in-out_infinite]': isActive,
            }"
            :stroke-width="2"
            aria-hidden="true"
          />

          <div class="min-w-0 flex-1">
            <p
              class="font-semibold leading-snug transition-colors duration-300"
              :class="{
                'text-[--app-danger]': isFailed,
                'text-[--app-success]': isSuccess,
                'text-[--app-primary]': isActive,
                'text-zinc-200': !isFailed && !isSuccess && !isActive,
              }"
            >
              {{ headline }}
            </p>
            <p class="mt-0.5 leading-snug text-zinc-500">{{ subline }}</p>
          </div>

          <button
            v-if="sources.length"
            type="button"
            class="inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-semibold text-(--app-muted) transition-colors duration-200 hover:bg-(--app-surface-hover) hover:text-(--app-text-soft)"
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

        <!-- ── Progress bar ───────────────────────────── -->
        <div v-if="isActive || isFailed" class="flex items-center gap-2 mt-[10px]">
          <div class="flex-1 h-1 overflow-hidden rounded-full bg-white/7">
            <div
              class="h-full rounded-full transition-all duration-700 ease-[var(--app-ease-standard)]"
              :class="{
                '!bg-(--app-danger)': isFailed,
                '!bg-[linear-gradient(90deg,var(--app-success),color-mix(in_srgb,var(--app-success)_70%,var(--app-primary)))]':
                  isSuccess,
                '!bg-[linear-gradient(90deg,var(--app-primary-strong),var(--app-primary))] !shadow-[0_0_8px_color-mix(in_srgb,var(--app-primary)_60%,transparent)] animate-[bar-glow_1.6s_ease-in-out_infinite]':
                  !isFailed && !isSuccess,
              }"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>
          <span class="shrink-0 text-[10px] font-semibold tabular-nums text-(--app-muted)"
            >{{ Math.round(progressPercent) }}%</span
          >
        </div>
      </div>

      <!-- ── Expanded mirrors ───────────────────────── -->
      <div
        v-if="expanded && sources.length"
        class="border-t border-(--app-border) bg-black/18 px-3 py-2"
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
                  class="shrink-0 rounded px-[5px] py-[1px] text-[9px] font-bold uppercase tracking-[0.06em]"
                  :class="{
                    '!bg-[color-mix(in_srgb,var(--app-primary)_16%,transparent)] !text-(--app-primary)':
                      source.type === 'ipfs',
                    '!bg-(--app-surface-soft) !text-(--app-muted)':
                      source.type !== 'ipfs',
                  }"
                >
                  {{ typeBadge(source.type) }}
                </span>
              </div>
              <p v-if="source.error" class="truncate text-[10px] text-[--app-danger]/80">
                {{ source.error }}
              </p>
            </div>
            <span
              class="shrink-0 text-[10px] font-semibold transition-colors duration-300"
              :class="{
                'text-[--app-success]': source.status === SOURCE_STATUS.OK,
                '!text-(--app-primary) animate-[icon-pulse_1.4s_ease-in-out_infinite]':
                  source.status === SOURCE_STATUS.TRYING,
                'text-[--app-danger]': source.status === SOURCE_STATUS.FAILED,
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
