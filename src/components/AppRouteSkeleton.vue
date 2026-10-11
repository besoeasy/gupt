<script setup>
const props = defineProps({
  kind: { type: String, default: "list" },
});
</script>

<template>
  <div
    v-if="props.kind === 'inbox'"
    aria-hidden="true"
    class="h-full w-full min-w-0 overflow-hidden bg-black text-zinc-100"
  >
    <div class="mx-auto flex h-full w-full max-w-6xl min-w-0 flex-col overflow-hidden">
      <div class="h-full w-full min-w-0 overflow-y-auto pb-16">
        <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-5">
          <div
            class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-5"
          >
            <div class="skeleton-shimmer h-8 w-36 rounded-lg" />
            <div class="flex items-center gap-2">
              <div class="skeleton-shimmer h-8 w-24 rounded-lg" />
              <div class="skeleton-shimmer h-8 w-24 rounded-lg" />
            </div>
          </div>
          <div class="skeleton-shimmer h-10 w-full rounded-xl" />
          <div class="space-y-2">
            <div
              v-for="n in 6"
              :key="n"
              class="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 sm:gap-3.5 sm:p-3.5"
            >
              <div class="skeleton-shimmer h-10 w-10 shrink-0 rounded-xl sm:h-11 sm:w-11" />
              <div class="min-w-0 flex-1 space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <div class="skeleton-shimmer h-3.5 w-28 rounded sm:w-36" />
                  <div class="skeleton-shimmer h-3 w-10 shrink-0 rounded sm:w-12" />
                </div>
                <div class="skeleton-shimmer h-3 w-48 rounded sm:w-72" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div
    v-else-if="props.kind === 'conversation'"
    aria-hidden="true"
    class="relative h-full w-full min-w-0 overflow-hidden bg-black text-zinc-100"
  >
    <div class="mx-auto flex h-full w-full max-w-6xl min-w-0 flex-col overflow-hidden">
      <div class="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-800/80 px-4">
        <div class="skeleton-shimmer h-8 w-8 rounded-lg" />
        <div class="skeleton-shimmer h-10 w-10 rounded-xl" />
        <div class="min-w-0 flex-1 space-y-1.5">
          <div class="skeleton-shimmer h-3.5 w-32 rounded" />
          <div class="skeleton-shimmer h-3 w-20 rounded" />
        </div>
        <div class="skeleton-shimmer h-8 w-8 rounded-lg" />
      </div>
      <div class="min-h-0 flex-1 space-y-3 overflow-hidden px-4 py-5">
        <div class="flex justify-start">
          <div class="skeleton-shimmer h-12 w-2/3 rounded-xl" />
        </div>
        <div class="flex justify-end">
          <div class="skeleton-shimmer h-10 w-1/2 rounded-xl" />
        </div>
        <div class="flex justify-start">
          <div class="skeleton-shimmer h-16 w-3/5 rounded-xl" />
        </div>
        <div class="flex justify-end">
          <div class="skeleton-shimmer h-10 w-2/5 rounded-xl" />
        </div>
        <div class="flex justify-start">
          <div class="skeleton-shimmer h-10 w-1/2 rounded-xl" />
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2 border-t border-zinc-800/80 px-4 py-3">
        <div class="skeleton-shimmer h-10 flex-1 rounded-xl" />
        <div class="skeleton-shimmer h-10 w-10 shrink-0 rounded-xl" />
      </div>
    </div>
  </div>

  <div
    v-else-if="props.kind === 'detail'"
    aria-hidden="true"
    class="min-h-screen bg-black text-zinc-100 pb-16"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-5">
        <div class="space-y-2">
          <div class="skeleton-shimmer h-4 w-24 rounded-md" />
          <div class="skeleton-shimmer h-6 w-48 rounded-md" />
          <div class="skeleton-shimmer h-4 w-full max-w-md rounded-md" />
        </div>
        <div class="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-6 space-y-4">
          <div class="skeleton-shimmer h-10 w-full rounded-xl" />
          <div class="skeleton-shimmer h-40 w-full rounded-xl" />
          <div class="flex items-center gap-2">
            <div class="skeleton-shimmer h-9 w-28 rounded-lg" />
            <div class="skeleton-shimmer h-9 w-24 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <div
    v-else-if="props.kind === 'full'"
    aria-hidden="true"
    class="flex h-full min-h-[60dvh] w-full flex-col items-center justify-center bg-black px-6 py-16 text-center text-zinc-100"
  >
    <div class="skeleton-shimmer h-20 w-20 rounded-full" />
    <div class="mt-4 skeleton-shimmer h-5 w-40 rounded-md" />
    <div class="mt-2 skeleton-shimmer h-3 w-28 rounded-md" />
    <div class="mt-6 flex items-center gap-3">
      <div class="skeleton-shimmer h-11 w-11 rounded-xl" />
      <div class="skeleton-shimmer h-11 w-11 rounded-xl" />
      <div class="skeleton-shimmer h-11 w-11 rounded-xl" />
    </div>
  </div>

  <div v-else aria-hidden="true" class="min-h-screen bg-black text-zinc-100 pb-16">
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-5">
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-5"
      >
        <div class="space-y-2">
          <div class="skeleton-shimmer h-6 w-40 rounded-md" />
          <div class="skeleton-shimmer h-4 w-64 max-w-full rounded-md" />
        </div>
        <div class="flex items-center gap-2">
          <div class="skeleton-shimmer h-8 w-20 rounded-lg" />
          <div class="skeleton-shimmer h-8 w-28 rounded-lg" />
        </div>
      </div>
      <div class="skeleton-shimmer h-10 w-full rounded-xl" />
      <div class="space-y-3">
        <div
          v-for="n in 5"
          :key="n"
          class="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4 space-y-2"
        >
          <div class="skeleton-shimmer h-4 w-48 rounded-md" />
          <div class="skeleton-shimmer h-3 w-full rounded-md" />
          <div class="skeleton-shimmer h-3 w-3/4 rounded-md" />
        </div>
      </div>
    </div>
  </div>
</template>
