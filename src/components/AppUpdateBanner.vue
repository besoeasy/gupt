<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { RefreshCw } from "lucide-vue-next";

const downloaded = ref(false);
const newVersion = ref("");

function handleDownloaded(info) {
  downloaded.value = true;
  newVersion.value = info?.version ?? "";
}

function restart() {
  window.gupt?.updater?.quitAndInstall();
}

onMounted(() => {
  if (!window.gupt?.updater) return;
  window.gupt.updater.onUpdateDownloaded(handleDownloaded);
});
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 -translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-2"
  >
    <div
      v-if="downloaded"
      class="flex items-center justify-between gap-3 px-4 py-2.5 bg-indigo-500/15 text-indigo-300 text-sm rounded-2xl"
    >
      <span>
        Update<template v-if="newVersion"> v{{ newVersion }}</template> ready to install.
      </span>
      <button
        @click="restart"
        class="flex items-center gap-1.5 shrink-0 font-medium hover:text-indigo-100 transition-colors"
      >
        <RefreshCw class="w-3.5 h-3.5" :stroke-width="2.5" aria-hidden="true" />
        Restart &amp; Update
      </button>
    </div>
  </Transition>
</template>
