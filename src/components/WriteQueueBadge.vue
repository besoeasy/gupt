<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { pendingCount, getSendQueueSnapshot } from "@/lib/sendQueue";

const router = useRouter();

/**
 * Break down the pending count by kind so the bar gives context.
 * Reads the snapshot lazily — only when pendingCount > 0.
 */
const summary = computed(() => {
  if (pendingCount.value === 0) return null;

  const snap = getSendQueueSnapshot();
  const counts = {};
  for (const task of snap.tasks) {
    const k = task.kind || "message";
    counts[k] = (counts[k] || 0) + 1;
  }

  const parts = [];
  if (counts.dm || counts.group) parts.push(`${(counts.dm || 0) + (counts.group || 0)} msg`);
  if (counts.receipt) parts.push(`${counts.receipt} receipt`);
  if (counts.reaction) parts.push(`${counts.reaction} reaction`);
  if (counts.edit) parts.push(`${counts.edit} edit`);
  if (counts.profile) parts.push(`${counts.profile} profile`);
  if (counts["group-admin"]) parts.push(`${counts["group-admin"]} invite`);

  return parts.length ? parts.join(" · ") : `${pendingCount.value} pending`;
});
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="translate-y-full opacity-0"
    leave-active-class="transition-all duration-200 ease-in"
    leave-to-class="translate-y-full opacity-0"
  >
    <div
      v-if="pendingCount > 0"
      class="fixed bottom-0 inset-x-0 z-50 flex items-center justify-center pb-[env(safe-area-inset-bottom)]"
      aria-live="polite"
    >
      <button
        class="mb-3 flex items-center gap-2 rounded-full border border-(--app-border) bg-(--app-surface)/90 px-4 py-2 text-xs font-medium text-(--app-text-soft) shadow-lg backdrop-blur-md hover:bg-(--app-surface) transition-colors cursor-pointer"
        @click="router.push('/queue')"
        :title="`${pendingCount} pending — tap to view`"
      >
        <!-- Pulsing dot -->
        <span class="relative flex h-2 w-2 shrink-0">
          <span
            class="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--app-primary) opacity-60"
          />
          <span class="relative inline-flex h-2 w-2 rounded-full bg-(--app-primary)" />
        </span>

        <span>Sending — {{ summary }}</span>
      </button>
    </div>
  </Transition>
</template>
