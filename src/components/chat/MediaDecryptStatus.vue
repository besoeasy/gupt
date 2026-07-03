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
      class="status-card"
      :class="{ 'is-active': isActive, 'is-success': isSuccess, 'is-failed': isFailed }"
    >
      <!-- Animated sweep while active -->
      <div v-if="isActive" class="status-sweep" />

      <div class="p-3">
        <!-- ── Step track ─────────────────────────────── -->
        <div v-if="isActive || isSuccess" class="step-track">
          <template v-for="(step, i) in steps" :key="step.id">
            <div class="step-item">
              <div
                class="step-dot"
                :class="{
                  'step-done': step.done,
                  'step-active': step.active,
                  'step-failed': step.failed,
                  'step-idle': !step.done && !step.active && !step.failed,
                }"
              >
                <span v-if="step.active" class="step-ping" />
                <component
                  :is="step.done ? CheckCircle2 : step.failed ? XCircle : step.icon"
                  class="step-icon"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </div>
              <span
                class="step-label"
                :class="{
                  'step-label-done': step.done,
                  'step-label-active': step.active,
                  'step-label-failed': step.failed,
                }"
              >
                {{ step.label }}
              </span>
            </div>

            <div
              v-if="i < steps.length - 1"
              class="step-connector"
              :class="{ 'step-connector-lit': steps[i + 1].done || steps[i + 1].active }"
            />
          </template>
        </div>

        <!-- ── Headline row ───────────────────────────── -->
        <div class="flex items-start gap-2">
          <component
            :is="isFailed ? XCircle : isSuccess ? CheckCircle2 : isFetching ? Wifi : Lock"
            class="status-lead-icon"
            :class="{
              'lead-failed': isFailed,
              'lead-success': isSuccess,
              'lead-active': isActive,
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
            class="mirrors-toggle"
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
        <div v-if="isActive || isFailed" class="progress-row">
          <div class="progress-track">
            <div
              class="progress-fill"
              :class="{
                'fill-failed': isFailed,
                'fill-success': isSuccess,
                'fill-active': !isFailed && !isSuccess,
              }"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>
          <span class="progress-pct">{{ Math.round(progressPercent) }}%</span>
        </div>
      </div>

      <!-- ── Expanded mirrors ───────────────────────── -->
      <div v-if="expanded && sources.length" class="mirrors-panel">
        <ul class="space-y-1.5">
          <li v-for="source in sources" :key="source.id" class="mirror-row">
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
                  class="mirror-badge"
                  :class="{
                    'badge-ipfs': source.type === 'ipfs',
                    'badge-blossom': source.type === 'blossom',
                    'badge-default': source.type !== 'ipfs' && source.type !== 'blossom',
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
                'mirror-trying': source.status === SOURCE_STATUS.TRYING,
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

<style scoped>
/* ── Card shell ─────────────────────────────────────────── */
.status-card {
  position: relative;
  overflow: hidden;
  border-radius: var(--app-radius-md);
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  transition:
    border-color 0.4s ease,
    background 0.4s ease;
}
.status-card.is-active {
  border-color: color-mix(in srgb, var(--app-primary) 30%, transparent);
  background: color-mix(in srgb, var(--app-primary-soft) 35%, var(--app-surface));
}
.status-card.is-success {
  border-color: color-mix(in srgb, var(--app-success) 30%, transparent);
  background: color-mix(in srgb, var(--app-success-soft) 40%, var(--app-surface));
}
.status-card.is-failed {
  border-color: color-mix(in srgb, var(--app-danger) 25%, transparent);
  background: color-mix(in srgb, var(--app-danger) 6%, var(--app-surface));
}

/* ── Sweep shimmer ──────────────────────────────────────── */
.status-sweep {
  pointer-events: none;
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 30%,
    color-mix(in srgb, var(--app-primary) 12%, transparent) 50%,
    transparent 70%
  );
  animation: sweep 2.4s linear infinite;
  transform: translateX(-100%);
}
@keyframes sweep {
  to {
    transform: translateX(200%);
  }
}

/* ── Step track ─────────────────────────────────────────── */
.step-track {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 10px;
}
.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.step-connector {
  flex: 1;
  height: 1px;
  margin-bottom: 14px;
  background: var(--app-border);
  transition: background 0.6s ease;
}
.step-connector-lit {
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--app-success) 50%, transparent),
    color-mix(in srgb, var(--app-primary) 50%, transparent)
  );
}

.step-dot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--app-border);
  background: var(--app-surface-raised);
  transition:
    border-color 0.4s ease,
    background 0.4s ease;
}
.step-dot.step-done {
  border-color: color-mix(in srgb, var(--app-success) 50%, transparent);
  background: color-mix(in srgb, var(--app-success) 14%, transparent);
  color: var(--app-success);
}
.step-dot.step-active {
  border-color: color-mix(in srgb, var(--app-primary) 60%, transparent);
  background: color-mix(in srgb, var(--app-primary) 14%, transparent);
  color: var(--app-primary);
  animation: dot-breathe 1.6s ease-in-out infinite;
}
.step-dot.step-failed {
  border-color: color-mix(in srgb, var(--app-danger) 50%, transparent);
  background: color-mix(in srgb, var(--app-danger) 12%, transparent);
  color: var(--app-danger);
}
.step-dot.step-idle {
  color: var(--app-muted-2);
}

@keyframes dot-breathe {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--app-primary) 40%, transparent);
  }
  50% {
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--app-primary) 0%, transparent);
  }
}

/* pulsing outer ring */
.step-ping {
  position: absolute;
  inset: -1px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-primary) 25%, transparent);
  animation: ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
}
@keyframes ping {
  75%,
  100% {
    transform: scale(1.9);
    opacity: 0;
  }
}

.step-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  position: relative; /* sit above the ping */
}
.step-label {
  margin-top: 4px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--app-muted-2);
  transition: color 0.3s ease;
}
.step-label-done {
  color: var(--app-success);
}
.step-label-active {
  color: var(--app-primary);
}
.step-label-failed {
  color: var(--app-danger);
}

/* ── Lead icon ──────────────────────────────────────────── */
.status-lead-icon {
  margin-top: 2px;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--app-muted);
  transition: color 0.3s ease;
}
.lead-active {
  color: var(--app-primary);
  animation: icon-pulse 1.8s ease-in-out infinite;
}
.lead-success {
  color: var(--app-success);
}
.lead-failed {
  color: var(--app-danger);
}

@keyframes icon-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* ── Progress bar ───────────────────────────────────────── */
.progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.progress-track {
  flex: 1;
  height: 4px;
  overflow: hidden;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.07);
}
.progress-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.7s var(--app-ease-standard);
}
.fill-active {
  background: linear-gradient(90deg, var(--app-primary-strong), var(--app-primary));
  box-shadow: 0 0 8px color-mix(in srgb, var(--app-primary) 60%, transparent);
  animation: bar-glow 1.6s ease-in-out infinite;
}
.fill-success {
  background: linear-gradient(
    90deg,
    var(--app-success),
    color-mix(in srgb, var(--app-success) 70%, var(--app-primary))
  );
}
.fill-failed {
  background: var(--app-danger);
}
@keyframes bar-glow {
  0%,
  100% {
    box-shadow: 0 0 6px color-mix(in srgb, var(--app-primary) 55%, transparent);
  }
  50% {
    box-shadow: 0 0 14px color-mix(in srgb, var(--app-primary) 80%, transparent);
  }
}

.progress-pct {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--app-muted);
}

/* ── Mirrors toggle ─────────────────────────────────────── */
.mirrors-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  color: var(--app-muted);
  transition:
    background 0.2s ease,
    color 0.2s ease;
}
.mirrors-toggle:hover {
  background: var(--app-surface-hover);
  color: var(--app-text-soft);
}

/* ── Mirrors panel ──────────────────────────────────────── */
.mirrors-panel {
  border-top: 1px solid var(--app-border);
  background: rgba(0, 0, 0, 0.18);
  padding: 8px 12px;
}
.mirror-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 0;
}
.mirror-badge {
  flex-shrink: 0;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.badge-ipfs {
  background: color-mix(in srgb, var(--app-primary) 16%, transparent);
  color: var(--app-primary);
}
.badge-blossom {
  background: color-mix(in srgb, var(--app-accent-share) 16%, transparent);
  color: var(--app-accent-share);
}
.badge-default {
  background: var(--app-surface-soft);
  color: var(--app-muted);
}
.mirror-trying {
  color: var(--app-primary);
  animation: icon-pulse 1.4s ease-in-out infinite;
}
</style>
