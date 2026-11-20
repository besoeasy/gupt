<script setup>
import { computed, ref } from "vue";
import {
  FingerprintPattern,
  FolderOpen,
  KeyRound,
  TriangleAlert,
} from "@lucide/vue";
import PinStrengthMeter from "@/components/PinStrengthMeter.vue";
import {
  hashSecretFile,
  isLongEnoughSecret,
  isWeakSecret,
  MAX_SECRET_FILE_BYTES,
  SECRET_MIN_CHARS,
  secretEntropyBits,
} from "@/lib/crypto";

const props = defineProps({
  method: { type: String, default: "secret" },
  secret: { type: String, default: "" },
  file: { type: Object, default: null },
  allowShort: { type: Boolean, default: false },
});

const emit = defineEmits(["update:method", "update:secret", "update:allowShort", "update:file"]);

const fileInput = ref(null);
const hashing = ref(false);
const fileError = ref("");

const secretModel = computed({
  get: () => props.secret,
  set: (value) => emit("update:secret", value),
});

const secretBits = computed(() => secretEntropyBits(props.secret));
const secretWeak = computed(() => isWeakSecret(props.secret));
const secretLongEnough = computed(() => isLongEnoughSecret(props.secret));
const secretTyped = computed(() => props.secret.trim().length);

const fileSizeLabel = computed(() => {
  const bytes = props.file?.size || 0;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
});

function pick(method) {
  emit("update:method", method);
}

async function onFileChange(event) {
  const picked = event.target.files?.[0];
  fileError.value = "";
  if (!picked) {
    emit("update:file", null);
    return;
  }

  hashing.value = true;
  try {
    const hash = await hashSecretFile(picked);
    emit("update:file", { name: picked.name, size: picked.size, hash });
  } catch (error) {
    emit("update:file", null);
    fileError.value = error.message || "Could not read that file.";
  } finally {
    hashing.value = false;
    if (fileInput.value) fileInput.value.value = "";
  }
}

function clearFile() {
  fileError.value = "";
  emit("update:file", null);
}
</script>

<template>
  <div class="method-step">
    <div class="method-step__tabs" role="tablist" aria-label="How to sign in">
      <button
        type="button"
        role="tab"
        id="method-tab-secret"
        aria-controls="method-panel-secret"
        class="method-step__tab"
        :class="{ 'method-step__tab--on': method === 'secret' }"
        :aria-selected="method === 'secret'"
        @click="pick('secret')"
      >
        <KeyRound class="method-step__tab-icon" aria-hidden="true" />
        Secret phrase
      </button>
      <button
        type="button"
        role="tab"
        id="method-tab-file"
        aria-controls="method-panel-file"
        class="method-step__tab"
        :class="{ 'method-step__tab--on': method === 'file' }"
        :aria-selected="method === 'file'"
        @click="pick('file')"
      >
        <FingerprintPattern class="method-step__tab-icon" aria-hidden="true" />
        Secret file
      </button>
    </div>

    <div
      v-if="method === 'secret'"
      id="method-panel-secret"
      role="tabpanel"
      aria-labelledby="method-tab-secret"
      class="method-step__panel"
    >
      <label class="method-step__label" for="welcome-secret">
        Your secret
        <span class="method-step__label-hint">— any text you can reproduce</span>
      </label>
      <textarea
        id="welcome-secret"
        v-model="secretModel"
        rows="5"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        placeholder="e.g. a sentence only you would write…"
        class="method-step__input method-step__input--area"
        :class="{ 'method-step__input--weak': secretWeak }"
      />

      <div class="method-step__meta">
        <span>Spacing and case matter.</span>
        <span v-if="secretTyped" class="method-step__count">{{ secretTyped }}</span>
      </div>

      <PinStrengthMeter :bits="secretBits" />

      <Transition name="method-step-fade">
        <p v-if="secretWeak && secretLongEnough" class="method-step__warn">
          <TriangleAlert class="method-step__warn-icon" aria-hidden="true" />
          Easy to guess. A longer passphrase or a full sentence is much safer.
        </p>
      </Transition>

      <Transition name="method-step-fade">
        <p v-if="secretTyped && !secretLongEnough" class="method-step__short">
          <TriangleAlert class="method-step__warn-icon" aria-hidden="true" />
          {{ secretTyped }} of {{ SECRET_MIN_CHARS }} characters — too short to continue.
          <button
            type="button"
            class="method-step__link"
            @click="$emit('update:allowShort', true)"
          >Use it anyway</button>
        </p>
      </Transition>

      <p v-if="allowShort && secretTyped && !secretLongEnough" class="method-step__short method-step__short--override">
        Short secrets are easier to guess. This one will still open your account.
      </p>
    </div>

    <div v-else id="method-panel-file" role="tabpanel" aria-labelledby="method-tab-file" class="method-step__panel">
      <input
        ref="fileInput"
        type="file"
        class="method-step__file-input"
        @change="onFileChange"
      />

      <button
        v-if="!file"
        type="button"
        class="method-step__pick"
        :disabled="hashing"
        @click="fileInput?.click()"
      >
        <FolderOpen class="method-step__pick-icon" aria-hidden="true" />
        <span class="method-step__pick-title">{{ hashing ? "Hashing…" : "Choose a file" }}</span>
        <span class="method-step__pick-hint">
          An old photo or keepsake — up to {{ Math.round(MAX_SECRET_FILE_BYTES / (1024 * 1024)) }} MB. Never uploaded.
        </span>
      </button>

      <div v-else class="method-step__file">
        <span class="method-step__file-icon">
          <FingerprintPattern aria-hidden="true" />
        </span>
        <div class="method-step__file-body">
          <p class="method-step__file-name">{{ file.name }}</p>
          <p class="method-step__file-meta">
            {{ fileSizeLabel }} · {{ file.hash.slice(0, 16) }}…
          </p>
        </div>
        <button type="button" class="method-step__link" @click="clearFile">Clear</button>
      </div>

      <p v-if="file" class="method-step__meta">
        This exact file, plus your PIN, is your account. Re-saving or re-compressing it changes
        its hash.
      </p>

      <p v-if="fileError" class="method-step__short">
        <TriangleAlert class="method-step__warn-icon" aria-hidden="true" />
        {{ fileError }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.method-step {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.method-step__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
  padding: 0.3rem;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xl);
  background-color: var(--app-surface-inset, var(--app-surface-soft));
}

.method-step__tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 44px;
  padding: 0.5rem 0.6rem;
  border: 0;
  border-radius: calc(var(--radius-xl) - 4px);
  background: transparent;
  color: var(--app-muted);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.method-step__tab:hover {
  color: var(--app-text);
}

.method-step__tab--on {
  background-color: var(--app-surface);
  color: var(--app-text);
  box-shadow: 0 1px 3px rgb(0 0 0 / 18%);
}

.method-step__tab:focus-visible {
  outline: 2px solid var(--app-primary);
  outline-offset: 1px;
}

.method-step__tab-icon {
  width: 16px;
  height: 16px;
}

.method-step__panel {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  animation: method-step-in 0.25s ease both;
}

.method-step__label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--app-text);
}

.method-step__label-hint {
  font-weight: 400;
  color: var(--app-muted);
}

.method-step__input {
  width: 100%;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background-color: var(--app-surface-soft);
  color: var(--app-text);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.5;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.method-step__input--area {
  padding: 0.875rem 1.125rem;
  resize: vertical;
}

.method-step__input::placeholder {
  color: var(--app-muted-2);
}

.method-step__input:focus {
  outline: none;
  border-color: var(--app-primary);
  background-color: var(--app-surface-hover);
}

.method-step__input--weak {
  border-color: var(--app-warning, #f59e0b);
}

.method-step__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 11px;
  color: var(--app-muted-2);
}

.method-step__count {
  font-family: var(--font-mono);
}

.method-step__warn,
.method-step__short {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.5rem;
  margin: 0;
  padding: 0.6rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--app-warning, #f59e0b) 35%, transparent);
  border-radius: var(--radius-lg);
  background-color: color-mix(in srgb, var(--app-warning, #f59e0b) 10%, transparent);
  font-size: 0.72rem;
  line-height: 1.45;
  color: var(--app-text);
}

.method-step__short--override {
  border-color: var(--app-border);
  background-color: var(--app-surface-soft);
  color: var(--app-muted);
}

.method-step__warn-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--app-warning, #f59e0b);
}

.method-step__link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--app-primary);
  font-size: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.method-step__link:focus-visible {
  outline: 2px solid var(--app-primary);
  outline-offset: 2px;
  border-radius: 4px;
}

.method-step__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.method-step__pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  min-height: 132px;
  padding: 1.25rem 1rem;
  border: 1px dashed var(--app-border-strong, var(--app-border));
  border-radius: var(--radius-xl);
  background-color: var(--app-surface-soft);
  color: var(--app-text);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    transform 0.15s ease;
}

.method-step__pick:hover {
  border-color: var(--app-primary);
  background-color: var(--app-surface-hover);
}

.method-step__pick:active {
  transform: scale(0.995);
}

.method-step__pick:disabled {
  opacity: 0.6;
  cursor: progress;
}

.method-step__pick:focus-visible {
  outline: 2px solid var(--app-primary);
  outline-offset: 2px;
}

.method-step__pick-icon {
  width: 26px;
  height: 26px;
  color: var(--app-primary);
}

.method-step__pick-title {
  font-size: 0.85rem;
  font-weight: 600;
}

.method-step__pick-hint {
  max-width: 30ch;
  text-align: center;
  font-size: 0.72rem;
  line-height: 1.45;
  color: var(--app-muted);
}

.method-step__file {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xl);
  background-color: var(--app-surface-soft);
}

.method-step__file-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 999px;
  background-color: color-mix(in srgb, var(--app-primary) 12%, transparent);
  color: var(--app-primary);
}

.method-step__file-icon svg {
  width: 18px;
  height: 18px;
}

.method-step__file-body {
  flex: 1;
  min-width: 0;
}

.method-step__file-name {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--app-text);
}

.method-step__file-meta {
  margin: 0.15rem 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--app-muted);
}

.method-step-fade-enter-active,
.method-step-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.method-step-fade-enter-from,
.method-step-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes method-step-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

[data-theme="light"] .method-step__tab--on {
  box-shadow: 0 1px 2px rgb(15 23 42 / 12%);
}

@media (prefers-reduced-motion: reduce) {
  .method-step__panel,
  .method-step-fade-enter-active,
  .method-step-fade-leave-active {
    animation: none;
    transition: none;
  }
}
</style>
