<script setup>
import { Phone, Video, Link2, X, AlertCircle } from "lucide-vue-next";

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
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="show"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <div
        class="ui-panel w-full max-w-md scale-100 transform overflow-hidden rounded-3xl p-5 shadow-2xl transition-all sm:p-6"
      >
        <!-- Header -->
        <div class="flex items-center justify-between pb-4">
          <h2 class="text-xl font-bold tracking-tight">Start a Call</h2>
          <button
            @click="emit('close')"
            class="ui-icon-button h-8 w-8 flex rounded-full"
            title="Close"
          >
            <X class="w-4 h-4" :stroke-width="2" />
          </button>
        </div>

        <div class="space-y-4">
          <!-- P2P Native Calls (DMs only) -->
          <div v-if="!isGroup" class="space-y-2">
            <div class="flex items-center justify-between gap-3 mb-2">
              <span class="text-xs font-bold uppercase tracking-wider text-zinc-500"
                >Native P2P Call</span
              >
              <div class="group relative flex items-center">
                <AlertCircle class="w-4 h-4 text-orange-400/80" />
                <div
                  class="absolute right-0 bottom-full mb-2 hidden w-48 rounded-xl ui-surface p-2 text-[11px] leading-tight text-zinc-300 shadow-xl group-hover:block"
                >
                  Direct peer-to-peer. May fail on strict networks or corporate firewalls due to NAT
                  blocking.
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <button
                @click="handleAudio"
                class="flex flex-col items-center gap-2 rounded-2xl ui-surface px-4 py-4 transition-all hover:scale-[1.02] hover:border-white/20 hover:bg-white/5 active:scale-95"
              >
                <div
                  class="flex h-12 w-12 items-center justify-center rounded-full bg-(--app-primary-soft) text-(--app-primary)"
                >
                  <Phone class="w-5 h-5" :stroke-width="2" />
                </div>
                <span class="text-sm font-semibold">Audio</span>
              </button>
              <button
                @click="handleVideo"
                class="flex flex-col items-center gap-2 rounded-2xl ui-surface px-4 py-4 transition-all hover:scale-[1.02] hover:border-white/20 hover:bg-white/5 active:scale-95"
              >
                <div
                  class="flex h-12 w-12 items-center justify-center rounded-full bg-(--app-primary-soft) text-(--app-primary)"
                >
                  <Video class="w-5 h-5" :stroke-width="2" />
                </div>
                <span class="text-sm font-semibold">Video</span>
              </button>
            </div>
          </div>

          <!-- Relayed Fallback -->
          <div class="space-y-2 pt-2">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-xs font-bold uppercase tracking-wider text-zinc-500"
                >Relayed Fallback</span
              >
            </div>
            <button
              @click="handleTalky"
              class="flex w-full items-center gap-4 rounded-2xl ui-surface px-4 py-4 transition-all hover:scale-[1.01] hover:border-white/20 hover:bg-white/5 active:scale-95"
            >
              <div
                class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-400"
              >
                <Link2 class="w-5 h-5" :stroke-width="2" />
              </div>
              <div class="flex-1 text-left">
                <p class="text-sm font-semibold text-(--app-text)">Talky Meeting</p>
                <p class="mt-0.5 text-xs text-zinc-400 leading-snug">
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
