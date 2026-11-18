<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Lock, MessageSquare, Phone, X } from "@lucide/vue";

const CALL_TARGET = 7;

const props = defineProps({
  open: { type: Boolean, default: false },
  sentCount: { type: Number, default: 0 },
  title: { type: String, default: "" },
});

const emit = defineEmits(["close"]);

const sent = computed(() => Math.min(Math.max(Number(props.sentCount) || 0, 0), CALL_TARGET));
const remaining = computed(() => Math.max(CALL_TARGET - sent.value, 0));
const panelRef = ref(null);

function onKeydown(event) {
  if (event.key === "Escape") emit("close");
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      window.addEventListener("keydown", onKeydown);
      await nextTick();
      // Focus the sheet itself, not a button, so the close control does not
      // render as a pre-selected action.
      panelRef.value?.focus();
    } else {
      window.removeEventListener("keydown", onKeydown);
    }
  },
);

onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="app-modal-enter-active"
      enter-from-class="app-modal-enter-from"
      leave-active-class="app-modal-leave-active"
      leave-to-class="app-modal-leave-to"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      >
        <div class="absolute inset-0 bg-black/70 backdrop-blur-xs" @click="emit('close')" />

        <div
          ref="panelRef"
          tabindex="-1"
          class="app-modal-panel relative z-10 w-full max-w-sm overflow-hidden rounded-t-3xl border border-(--app-border) bg-(--app-surface) shadow-[0_24px_64px_rgba(0,0,0,0.4)] outline-none sm:rounded-3xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="call-unlock-title"
        >
          <!-- Mobile grab handle -->
          <div class="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
            <span class="h-1 w-9 rounded-full bg-(--app-border-strong)" />
          </div>

          <div class="flex items-start gap-3 px-5 pt-4 sm:pt-5">
            <span
              class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-(--app-primary-soft) text-(--app-primary)"
              aria-hidden="true"
            >
              <Lock class="h-5 w-5" :stroke-width="1.9" />
            </span>
            <div class="min-w-0 flex-1">
              <h2
                id="call-unlock-title"
                class="text-base leading-6 font-bold tracking-tight text-(--app-text)"
              >
                Calls unlock at 7 messages
              </h2>
              <p class="mt-1 text-sm leading-5 text-(--app-muted)">
                {{
                  sent === 0
                    ? "Audio and video stay locked until you have sent 7 messages here."
                    : remaining > 0
                      ? `${remaining} more message${remaining === 1 ? "" : "s"} and calls open up.`
                      : "Calls are unlocked — the buttons in the header are live."
                }}
              </p>
              <p v-if="title" class="mt-1 truncate font-mono text-[10px] text-(--app-muted-2)">
                with {{ title }}
              </p>
            </div>
            <button
              type="button"
              class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-(--app-muted) transition-colors duration-200 hover:bg-(--app-surface-hover) hover:text-(--app-text) focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_55%,transparent)] focus-visible:outline-none active:scale-95"
              title="Close"
              aria-label="Close"
              @click="emit('close')"
            >
              <X class="h-5 w-5" :stroke-width="1.9" aria-hidden="true" />
            </button>
          </div>

          <div class="px-5 pt-4">
            <div class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-3.5">
              <div class="flex items-baseline justify-between gap-3">
                <span class="text-xs font-semibold text-(--app-text-soft)">Messages you sent</span>
                <span class="font-mono text-xs font-semibold text-(--app-text)">
                  {{ sent }} / {{ CALL_TARGET }}
                </span>
              </div>
              <div
                class="mt-2.5 flex gap-1.5"
                role="progressbar"
                :aria-valuenow="sent"
                aria-valuemin="0"
                :aria-valuemax="CALL_TARGET"
                :aria-valuetext="`${sent} of ${CALL_TARGET} messages sent`"
              >
                <span
                  v-for="i in CALL_TARGET"
                  :key="i"
                  class="h-1.5 flex-1 rounded-full transition-colors duration-300 ease-out"
                  :class="i <= sent ? 'bg-(--app-primary)' : 'bg-(--app-surface-hover)'"
                />
              </div>
              <p class="mt-2 flex items-center gap-1.5 text-xs text-(--app-muted)">
                <MessageSquare
                  class="h-3.5 w-3.5 shrink-0"
                  :stroke-width="1.9"
                  aria-hidden="true"
                />
                {{
                  remaining > 0
                    ? `${remaining} more to go — only messages you send are counted.`
                    : "Enough messages sent — calls are unlocked."
                }}
              </p>
            </div>
          </div>

          <div class="px-5 pt-3">
            <p class="text-[11px] leading-4 text-(--app-muted-2)">
              The lock is a local rule computed on this device to keep cold callers out. It is not
              uploaded and your contact never sees it.
            </p>
          </div>

          <div class="px-5 pt-4 pb-[max(3rem,calc(env(safe-area-inset-bottom)+2.75rem))] sm:pb-5">
            <button
              type="button"
              class="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--app-primary)_45%,transparent)] bg-(--app-primary-soft) px-4 text-sm font-semibold text-(--app-primary) transition-all duration-200 hover:border-[color-mix(in_srgb,var(--app-primary)_65%,transparent)] hover:bg-[color-mix(in_srgb,var(--app-primary)_22%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_55%,transparent)] focus-visible:outline-none active:scale-[0.98]"
              @click="emit('close')"
            >
              <Phone
                v-if="remaining === 0"
                class="h-4 w-4"
                :stroke-width="1.9"
                aria-hidden="true"
              />
              Got it
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
