<script setup>
import { computed } from "vue";
import { Download, Mic, Pause, Play } from "@/icons";
import { formatDuration } from "@/lib/chatUtils";
import { useAudioPlayback } from "@/composables/useAudioPlayback";

const props = defineProps({
  /** Audio source URL (decrypted blob). When empty, a fallback slot renders. */
  src: { type: String, default: null },
  /** Seed for the deterministic waveform + duration hint. */
  message: { type: Object, default: () => ({}) },
  /** "voice" = voice note chrome; "audio" = audio-attachment chrome. */
  variant: { type: String, default: "audio" },
  durationMs: { type: Number, default: 0 },
  /** Disable the save/download affordances while media is still decrypting. */
  isMediaBusy: { type: Boolean, default: false },
  /** Render the in-player save button (voice notes have it; audio files don't). */
  showSave: { type: Boolean, default: null },
});

const emit = defineEmits(["download"]);

const isVoice = computed(() => props.variant === "voice");
const saveShown = computed(() => (props.showSave === null ? isVoice.value : props.showSave));

const {
  audioEl,
  waveformRef,
  playing,
  progress,
  currentSecs,
  totalSecs,
  playbackSpeed,
  hoverProgress,
  waveformBars,
  togglePlay,
  cyclePlaybackSpeed,
  onTimeUpdate,
  onEnded,
  seekAtEvent,
  onWaveformPointerDown,
  onLoadedMetadata,
  onDurationChange,
} = useAudioPlayback({
  src: () => props.src,
  durationMs: () => props.durationMs || props.message?.durationMs,
  seed: () => props.message?.id || props.message?.ts,
});

function onWaveformClick(e) {
  // Voice scrub: original had a broken `@click="seek"`.
  seekAtEvent(e, e.currentTarget);
}

function onHover(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  hoverProgress.value = ((e.clientX - rect.left) / rect.width) * 100;
}

function clearHover() {
  hoverProgress.value = null;
}
</script>

<template>
  <!-- Voice note -->
  <div v-if="isVoice" class="chat-message-bubble__voice">
    <audio
      ref="audioEl"
      :src="src"
      preload="metadata"
      class="chat-message-bubble__audio-el"
      hidden
      @timeupdate="onTimeUpdate"
      @ended="onEnded"
      @loadedmetadata="onLoadedMetadata"
      @durationchange="onDurationChange"
    />
    <div class="chat-message-bubble__voice-controls">
      <button
        type="button"
        @click="togglePlay"
        class="chat-message-bubble__voice-play"
        :aria-label="playing ? 'Pause' : 'Play'"
      >
        <Play v-if="!playing" class="chat-message-bubble__play" :stroke-width="1.8" />
        <Pause v-else class="chat-message-bubble__pause" :stroke-width="1.8" />
      </button>
      <div class="chat-message-bubble__voice-waveform" @click="onWaveformClick">
        <div
          v-for="(bar, idx) in waveformBars"
          :key="idx"
          class="chat-message-bubble__voice-bar"
          :class="
            (idx / waveformBars.length) * 100 <= progress
              ? 'chat-message-bubble__voice-bar--played'
              : 'chat-message-bubble__voice-bar--idle'
          "
          :style="{ height: bar + '%' }"
        />
      </div>
      <button
        v-if="saveShown"
        type="button"
        @click="emit('download')"
        :disabled="isMediaBusy"
        class="chat-message-bubble__button-save-voice"
        aria-label="Save voice note to device"
      >
        <Download class="chat-message-bubble__download-2" :stroke-width="1.8" />
      </button>
    </div>
    <div class="chat-message-bubble__voice-time">
      <span>{{ formatDuration(currentSecs) }}</span>
      <span>{{ formatDuration(totalSecs) }}</span>
    </div>
  </div>

  <!-- Audio attachment -->
  <div v-else>
    <audio
      ref="audioEl"
      :src="src"
      preload="metadata"
      class="chat-message-bubble__audio-el"
      hidden
      @timeupdate="onTimeUpdate"
      @ended="onEnded"
      @loadedmetadata="onLoadedMetadata"
      @durationchange="onDurationChange"
    />
    <div class="chat-message-bubble__audio">
      <div class="chat-message-bubble__audio-controls">
        <button
          type="button"
          @click="togglePlay"
          class="chat-message-bubble__audio-play"
          :aria-label="playing ? 'Pause' : 'Play'"
        >
          <Play v-if="!playing" class="chat-message-bubble__play-2" :stroke-width="1.8" />
          <Pause v-else class="chat-message-bubble__pause-2" :stroke-width="1.8" />
        </button>

        <div
          ref="waveformRef"
          class="chat-message-bubble__audio-waveform"
          @pointerdown="onWaveformPointerDown"
          @mousemove="onHover"
          @mouseleave="clearHover"
        >
          <div
            v-for="(bar, idx) in waveformBars"
            :key="idx"
            class="chat-message-bubble__audio-bar"
            :class="[
              (idx / waveformBars.length) * 100 <= progress
                ? 'chat-message-bubble__audio-bar--played'
                : hoverProgress !== null && (idx / waveformBars.length) * 100 <= hoverProgress
                  ? 'chat-message-bubble__audio-bar--hover'
                  : 'chat-message-bubble__audio-bar--idle',
            ]"
            :style="{ height: bar + '%' }"
          />
        </div>

        <button
          type="button"
          @click.stop="cyclePlaybackSpeed"
          class="chat-message-bubble__button-x"
          :title="`Playback speed: ${playbackSpeed}x`"
        >
          {{ playbackSpeed }}x
        </button>
      </div>
      <div class="chat-message-bubble__audio-time">
        <span>{{ formatDuration(currentSecs) }}</span>
        <span>{{ formatDuration(totalSecs) }}</span>
      </div>
    </div>
  </div>

  <!-- Voice fallback when no source yet (kept in parent slot when needed) -->
</template>

<style scoped>
.chat-message-bubble__audio-el {
  display: none;
}

/* ---- Voice note ---- */
.chat-message-bubble__voice {
  display: flex;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 0.5rem;
  color: var(--app-text);
  -webkit-user-select: none;
  user-select: none;
}
.chat-message-bubble__voice-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.chat-message-bubble__voice-waveform {
  display: flex;
  height: 2rem;
  flex: 1;
  cursor: pointer;
  align-items: center;
  gap: 0.125rem;
}
.chat-message-bubble__voice-time {
  display: flex;
  justify-content: space-between;
  padding-inline: 0.25rem;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted);
  font-variant-numeric: tabular-nums;
}
.chat-message-bubble__voice-bar {
  flex: 1;
  border-radius: 9999px;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: 75ms;
}
.chat-message-bubble__voice-bar--played { background-color: var(--app-text); }
.chat-message-bubble__voice-bar--idle { background-color: var(--app-surface-raised); }

/* ---- Audio attachment ---- */
.chat-message-bubble__audio {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  color: var(--app-text);
  -webkit-user-select: none;
  user-select: none;
}
.chat-message-bubble__audio-controls {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}
.chat-message-bubble__audio-time {
  display: flex;
  justify-content: space-between;
  padding-inline: 0.25rem;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted);
  font-variant-numeric: tabular-nums;
}
.chat-message-bubble__audio-waveform {
  position: relative;
  display: flex;
  height: 2rem;
  flex: 1;
  cursor: pointer;
  align-items: center;
  gap: 0.125rem;
  padding-block: 0.25rem;
}
.chat-message-bubble__audio-bar {
  flex: 1;
  border-radius: 9999px;
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: 75ms;
}
.chat-message-bubble__audio-bar--played { background-color: var(--app-text); }
.chat-message-bubble__audio-bar--hover { background-color: var(--app-text-soft); }
.chat-message-bubble__audio-bar--idle { background-color: var(--app-surface-raised); }

/* ---- Buttons ---- */
.chat-message-bubble__voice-play,
.chat-message-bubble__audio-play {
  display: inline-flex;
  height: 2rem;
  width: 2rem;
  flex-shrink: 0;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-bg-soft);
  color: var(--app-text);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-message-bubble__button-save-voice {
  display: inline-flex;
  height: 2rem;
  width: 2rem;
  flex-shrink: 0;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-bg-soft);
  color: var(--app-text);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.chat-message-bubble__button-save-voice:disabled { opacity: .5; }
.chat-message-bubble__button-x {
  display: inline-flex;
  height: 1.5rem;
  flex-shrink: 0;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-md);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-bg-soft);
  padding-inline: 0.5rem;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-text-soft);
  font-variant-numeric: tabular-nums;
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  -webkit-user-select: none;
  user-select: none;
}

.chat-message-bubble__play,
.chat-message-bubble__play-2 {
  margin-left: 0.125rem;
  height: 0.875rem;
  width: 0.875rem;
  fill: currentColor;
}
.chat-message-bubble__pause,
.chat-message-bubble__pause-2 {
  height: 0.875rem;
  width: 0.875rem;
  fill: currentColor;
}
.chat-message-bubble__download-2 { height: 0.875rem; width: 0.875rem; }

@media (hover: hover) {
  .chat-message-bubble__voice-play:hover,
  .chat-message-bubble__audio-play:hover,
  .chat-message-bubble__button-save-voice:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
  .chat-message-bubble__button-x:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-message-bubble__voice-play,
  .chat-message-bubble__audio-play,
  .chat-message-bubble__button-save-voice,
  .chat-message-bubble__button-x,
  .chat-message-bubble__voice-bar,
  .chat-message-bubble__audio-bar {
    transition: none;
  }
}
</style>
