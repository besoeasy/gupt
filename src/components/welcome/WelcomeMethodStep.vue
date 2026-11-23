<script setup>
import { computed, ref } from "vue";
import {
  FingerprintPattern,
  FolderOpen,
  KeyRound,
  TriangleAlert,
} from "@/icons";
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
/* Ledger pass: a two-tab rail over a plain-text field and file record. */

.method-step {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.method-step__tabs {
  display: flex;
  gap: var(--app-space-5);
  border-bottom: 1px solid var(--app-border);
}

.method-step__tab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  margin-bottom: -1px;
  padding: 0 1px 9px;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

.method-step__tab--on {
  border-bottom-color: var(--app-text);
  color: var(--app-text);
}

.method-step__tab:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
  border-radius: 3px;
}

.method-step__tab-icon {
  width: 13px;
  height: 13px;
}

/* ---- Secret panel ---- */

.method-step__panel {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.method-step__label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

.method-step__label-hint {
  font-weight: 400;
  letter-spacing: 0.02em;
  text-transform: none;
  color: var(--app-muted-2);
}

.method-step__input {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-family: var(--font-sans);
  font-size: var(--app-text-body);
  line-height: 1.6;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.method-step__input--area {
  min-height: 132px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 12px;
}

.method-step__input::placeholder {
  color: var(--app-muted-2);
}

.method-step__input:focus {
  outline: none;
  border-color: var(--app-border-strong);
  background: var(--app-surface);
  box-shadow: var(--app-focus-ring);
}

.method-step__input--weak:not(:focus) {
  border-color: color-mix(in oklab, var(--app-warning) 38%, var(--app-border));
}

.method-step__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
}

.method-step__count {
  font-variant-numeric: tabular-nums;
  color: var(--app-muted);
}

.method-step__warn,
.method-step__short {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid color-mix(in oklab, var(--app-warning) 30%, var(--app-border));
  border-radius: var(--app-radius-sm);
  background: var(--app-warning-soft);
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--app-warning);
}

.method-step__short--override {
  border-color: color-mix(in oklab, var(--app-danger) 26%, var(--app-border));
  background: var(--app-danger-soft);
  color: var(--app-danger);
}

.method-step__warn-icon {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
}

.method-step__link {
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-text);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  cursor: pointer;
}

.method-step__link:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
  border-radius: 2px;
}

/* ---- File panel ---- */

.method-step__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.method-step__pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: var(--app-space-5) var(--app-space-4);
  border: 1px dashed var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  text-align: center;
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard);
}

.method-step__pick:active {
  transform: translateY(1px);
}

.method-step__pick:disabled {
  opacity: 0.5;
  cursor: default;
}

.method-step__pick:focus-visible {
  outline: none;
  box-shadow: var(--app-focus-ring);
}

.method-step__pick-icon {
  width: 18px;
  height: 18px;
  color: var(--app-muted-2);
}

.method-step__pick-title {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-text);
}

.method-step__pick-hint {
  max-width: 36ch;
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--app-muted-2);
}

.method-step__file {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
}

.method-step__file-icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface);
  color: var(--app-muted);
}

.method-step__file-icon svg {
  width: 13px;
  height: 13px;
}

.method-step__file-body {
  flex: 1;
  min-width: 0;
}

.method-step__file-name {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.method-step__file-meta {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
}

.method-step-fade-enter-active,
.method-step-fade-leave-active {
  transition:
    opacity var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.method-step-fade-enter-from,
.method-step-fade-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

@media (hover: hover) {
  .method-step__tab:hover {
    color: var(--app-text);
  }

  .method-step__pick:hover:not(:disabled) {
    border-color: var(--app-text);
    background: var(--app-surface);
  }

  .method-step__link:hover {
    color: var(--app-muted);
  }
}

@media (pointer: coarse) {
  .method-step__link {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .method-step__panel,
  .method-step-fade-enter-active,
  .method-step-fade-leave-active {
    animation: none;
    transition: none;
  }

  .method-step__tab,
  .method-step__input,
  .method-step__pick {
    transition: none;
  }
}
</style>
