<script setup>
import { Phone, Video, Link2, X, AlertCircle } from "@lucide/vue";

const props = defineProps({
  show: { type: Boolean, required: true },
  isGroup: { type: Boolean, default: false },
});

const emit = defineEmits(["close", "audio", "video", "talky"]);

function handleAudio() {
  emit("audio");
  emit("close");
}

function handleVideo() {
  emit("video");
  emit("close");
}

function handleTalky() {
  emit("talky");
  emit("close");
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-100 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="show"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
      @click.self="emit('close')"
    >
      <div
        class="border border-zinc-800 bg-zinc-950 shadow-2xl w-full max-w-md rounded-xl p-5 transition-all sm:p-6"
      >
        <!-- Header -->
        <div class="flex items-center justify-between pb-4">
          <h2 class="text-sm font-medium tracking-tight text-white">Start a Call</h2>
          <button
            @click="emit('close')"
            class="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X class="w-4 h-4" :stroke-width="1.8" />
          </button>
        </div>

        <div class="space-y-4">
          <!-- P2P Native Calls (DMs only) -->
          <div v-if="!isGroup" class="space-y-2">
            <div class="flex items-center justify-between gap-3 mb-2">
              <span class="text-[10px] font-mono uppercase tracking-wider text-zinc-500"
                >Native P2P Call</span
              >
              <div class="group relative flex items-center">
                <AlertCircle class="w-3.5 h-3.5 text-zinc-500" />
                <div
                  class="absolute right-0 bottom-full mb-2 hidden w-48 rounded-lg border border-zinc-800 bg-zinc-900 p-2 font-mono text-[10px] leading-tight text-zinc-300 shadow-xl group-hover:block"
                >
                  Direct peer-to-peer. May fail on strict networks or corporate firewalls due to NAT
                  blocking.
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <button
                @click="handleAudio"
                class="flex flex-col items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900 cursor-pointer"
              >
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200"
                >
                  <Phone class="w-4 h-4" :stroke-width="1.8" />
                </div>
                <span class="text-xs font-medium text-zinc-200">Audio Call</span>
              </button>
              <button
                @click="handleVideo"
                class="flex flex-col items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900 cursor-pointer"
              >
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200"
                >
                  <Video class="w-4 h-4" :stroke-width="1.8" />
                </div>
                <span class="text-xs font-medium text-zinc-200">Video Call</span>
              </button>
            </div>
          </div>

          <!-- Relayed Fallback -->
          <div class="space-y-2 pt-2">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-[10px] font-mono uppercase tracking-wider text-zinc-500"
                >Relayed Fallback</span
              >
            </div>
            <button
              @click="handleTalky"
              class="flex w-full items-center gap-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 transition-colors hover:border-zinc-700 hover:bg-zinc-900 cursor-pointer text-left"
            >
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200"
              >
                <Link2 class="w-4 h-4" :stroke-width="1.8" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-medium text-zinc-200">Talky Meeting</p>
                <p class="mt-0.5 text-[11px] text-zinc-400 leading-snug">
                  Free relayed video call. Works globally. Good fallback if native P2P fails.
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
