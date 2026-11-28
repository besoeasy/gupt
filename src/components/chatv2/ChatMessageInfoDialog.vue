<script setup>
import { computed, ref, watch } from "vue";
import { Check, Copy, X } from "@/icons";
import { copyToClipboard } from "@/lib/clipboard";
import { RABTA_EVENT_ID_RE } from "@/lib/rabta";
import { hydrateSendReport } from "@/lib/engine/sendReport.js";
import RelayEventLink from "@/components/RelayEventLink.vue";

const REACT_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];

const props = defineProps({
  open: { type: Boolean, default: false },
  message: { type: Object, required: true },
  mine: { type: Boolean, default: false },
  /** Full event/message id shown + copied. */
  eventId: { type: String, default: "—" },
  isGroupMessage: { type: Boolean, default: false },
  copyableMessageText: { type: String, default: "" },
  statusLabel: { type: String, default: "" },
  statusColorClass: { type: String, default: "" },
  sendError: { type: String, default: "" },
  nextRetryLabel: { type: String, default: "" },
  sendAttempts: { type: Array, default: () => [] },
  readByNames: { type: Array, default: () => [] },
  unreadByNames: { type: Array, default: () => [] },
  unknownByNames: { type: Array, default: () => [] },
  fullTimestamp: { type: String, default: "—" },
});

const emit = defineEmits(["close", "react", "retry-send"]);

const idCopied = ref(false);
const textCopied = ref(false);

// Hydrate the send report once the dialog opens, mirroring the previous
// in-parent watch on `showMessageInfo`.
const sendKey = computed(() => String(props.eventId || "").toLowerCase());
watch(
  () => props.open,
  (open) => {
    if (open) {
      idCopied.value = false;
      if (RABTA_EVENT_ID_RE.test(sendKey.value)) void hydrateSendReport(sendKey.value);
    }
  },
  { flush: "post" },
);

function close() {
  emit("close");
}

function onReact(emoji) {
  emit("react", emoji);
  close();
}

function sendAttemptLabel(entry) {
  if (!entry) return "";
  if (entry.state === "ok") {
    const ms = Math.max(0, Math.round(Number(entry.latencyMs) || 0));
    return `stored · ${ms}ms`;
  }
  if (entry.state === "skipped") return "skipped";
  if (entry.state === "trying") return "trying…";
  return "failed";
}

const failedAttempts = computed(() =>
  props.sendAttempts.filter((e) => e.state !== "ok" && e.error),
);

async function copyEventId() {
  const id = props.eventId;
  if (!id || id === "—") return;
  try {
    await copyToClipboard(id);
    idCopied.value = true;
    setTimeout(() => (idCopied.value = false), 1500);
  } catch {}
}

async function copyMessageText() {
  const text = props.copyableMessageText;
  if (!text) return;
  try {
    await copyToClipboard(text);
    textCopied.value = true;
    setTimeout(() => (textCopied.value = false), 1500);
  } catch {}
}

function retrySend() {
  emit("retry-send");
  close();
}
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
        class="chat-message-bubble__info-overlay"
        @click.self="close"
      >
        <div
          class="app-modal-panel chat-message-bubble__dialog"
          role="dialog"
          @click.stop
        >
          <div class="chat-message-bubble__info-head">
            <h3 class="chat-message-bubble__heading-message-info">Message Info</h3>
            <button
              type="button"
              @click="close"
              class="chat-message-bubble__info-close"
            >
              <X class="chat-message-bubble__x" :stroke-width="1.8" />
            </button>
          </div>

          <div class="chat-message-bubble__info-reactions">
            <button
              v-for="e in REACT_EMOJIS"
              :key="e"
              type="button"
              @click="onReact(e)"
              class="chat-message-bubble__info-emoji"
            >
              {{ e }}
            </button>
          </div>

          <div class="chat-message-bubble__info-body">
            <p v-if="isGroupMessage" class="chat-message-bubble__info-note">
              Group messages are sealed individually for each member inside a single relay event, so
              only group members can decrypt their own copy.
            </p>

            <div>
              <p class="chat-message-bubble__info-label">
                {{ isGroupMessage ? "Message ID" : "Event ID" }}
              </p>
              <button
                type="button"
                @click="copyEventId"
                class="chat-message-bubble__info-copy"
              >
                <span class="chat-message-bubble__info-id">{{ eventId }}</span>
                <Copy
                  v-if="!idCopied"
                  class="chat-message-bubble__copy-2"
                  :stroke-width="1.8"
                />
                <Check
                  v-else
                  class="chat-message-bubble__check-3"
                  :stroke-width="2"
                />
              </button>
            </div>

            <div>
              <p class="chat-message-bubble__text-status">
                Status
              </p>
              <p :class="statusColorClass" class="chat-message-bubble__info-status">{{ statusLabel }}</p>
              <p
                v-if="sendError && mine && message.status !== 'sent'"
                class="chat-message-bubble__text-send-detail"
              >
                {{ sendError }}<span v-if="nextRetryLabel"> · {{ nextRetryLabel }}</span>
              </p>
            </div>

            <div v-if="mine && sendAttempts.length">
              <p class="chat-message-bubble__text-status">
                Relays
              </p>
              <ul class="chat-message-bubble__send-attempts">
                <li
                  v-for="entry in sendAttempts"
                  :key="entry.relay"
                  class="chat-message-bubble__send-attempt"
                >
                  <span
                    class="chat-message-bubble__send-dot"
                    :class="{
                      'chat-message-bubble__send-dot--ok': entry.state === 'ok',
                      'chat-message-bubble__send-dot--trying': entry.state === 'trying',
                      'chat-message-bubble__send-dot--skipped': entry.state === 'skipped',
                    }"
                  />
                  <span class="chat-message-bubble__send-host">{{ entry.host }}</span>
                  <span class="chat-message-bubble__send-state">{{ sendAttemptLabel(entry) }}</span>
                </li>
              </ul>
              <p
                v-for="entry in failedAttempts"
                :key="`err-${entry.relay}`"
                class="chat-message-bubble__text-send-detail"
              >
                {{ entry.host }}: {{ entry.error }}
              </p>
            </div>

            <div
              v-if="
                isGroupMessage &&
                (readByNames.length || unreadByNames.length || unknownByNames.length)
              "
            >
              <p class="chat-message-bubble__text-seen-by">
                Seen by
              </p>
              <p class="chat-message-bubble__info-seen">
                {{ readByNames.length ? readByNames.join(", ") : "Nobody yet" }}
              </p>
              <p v-if="unreadByNames.length" class="chat-message-bubble__text-waiting-on">
                Waiting on {{ unreadByNames.join(", ") }}
              </p>
              <p v-if="unknownByNames.length" class="chat-message-bubble__info-unknown">
                No record for {{ unknownByNames.join(", ") }} — read receipts expire after 30 days
              </p>
            </div>

            <div>
              <p class="chat-message-bubble__text-timestamp">
                Timestamp
              </p>
              <p class="chat-message-bubble__info-timestamp">{{ fullTimestamp }}</p>
            </div>
          </div>

          <div class="chat-message-bubble__info-actions">
            <button
              v-if="mine && message.status === 'failed'"
              type="button"
              @click="retrySend"
              class="chat-message-bubble__info-action"
            >
              Retry sending
            </button>

            <button
              v-if="copyableMessageText"
              type="button"
              @click="copyMessageText"
              class="chat-message-bubble__info-action"
            >
              <Copy v-if="!textCopied" class="chat-message-bubble__copy-3" :stroke-width="1.8" />
              <Check v-else class="chat-message-bubble__check-4" :stroke-width="2" />
              {{ textCopied ? "Copied!" : "Copy message text" }}
            </button>

            <RelayEventLink
              v-if="!isGroupMessage"
              :event-id="eventId"
              variant="button"
              placement="top"
              label="Inspect on Rabta relay"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.chat-message-bubble__info-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 1rem;
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  background-color: color-mix(in oklab,var(--app-bg) 80%,transparent);
}

.chat-message-bubble__dialog {
  width: 100%;
  max-width: 24rem;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-bg-soft);
  padding: 1.25rem;
  color: var(--app-text);
  box-shadow: var(--app-shadow);
}

@media (min-width: 40rem) {
  .chat-message-bubble__info-overlay {
    align-items: center;
  }
}

.chat-message-bubble__info-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.chat-message-bubble__heading-message-info {
  font-size: 0.8125rem;
  line-height: 1.5;
  font-weight: 500;
  letter-spacing: -0.025em;
  color: var(--app-text);
}

.chat-message-bubble__info-close {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface);
  padding: 0.375rem;
  color: var(--app-text-soft);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}

.chat-message-bubble__x {
  height: 1rem;
  width: 1rem;
}

.chat-message-bubble__info-reactions {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  padding-block: 0.25rem;
}

.chat-message-bubble__info-emoji {
  cursor: pointer;
  padding-inline: 0.25rem;
  font-size: 1.1875rem;
  line-height: 1.35;
  transition-property: transform,translate,scale,rotate;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}

.chat-message-bubble__info-body {
  font-size: 0.75rem;
  line-height: 1.5;
}

.chat-message-bubble__info-label {
  margin-bottom: 0.25rem;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--app-text-soft);
  text-transform: uppercase;
}

.chat-message-bubble__text-status {
  margin-bottom: 0.25rem;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--app-text-soft);
  text-transform: uppercase;
}

.chat-message-bubble__text-seen-by {
  margin-bottom: 0.25rem;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--app-text-soft);
  text-transform: uppercase;
}

.chat-message-bubble__text-timestamp {
  margin-bottom: 0.25rem;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--app-text-soft);
  text-transform: uppercase;
}

.chat-message-bubble__info-note {
  line-height: 1.625;
  color: var(--app-text-soft);
}

.chat-message-bubble__info-copy {
  display: flex;
  width: 100%;
  cursor: pointer;
  align-items: flex-start;
  gap: 0.5rem;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface-tint);
  padding-inline: 0.625rem;
  padding-block: 0.375rem;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 11px;
  word-break: break-all;
  color: var(--app-text);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}

.chat-message-bubble__info-id {
  min-width: 0;
  flex: 1;
}

.chat-message-bubble__copy-2 {
  margin-top: 0.125rem;
  height: 0.875rem;
  width: 0.875rem;
  flex-shrink: 0;
  color: var(--app-muted);
}
.chat-message-bubble__check-3 {
  margin-top: 0.125rem;
  height: 0.875rem;
  width: 0.875rem;
  flex-shrink: 0;
  color: var(--app-success);
}

.chat-message-bubble__info-status {
  font-weight: 500;
}

.chat-message-bubble__text-send-detail {
  color: var(--app-muted);
  margin-top: 0.125rem;
}

.chat-message-bubble__send-attempts {
  display: flex;
  flex-direction: column;
  gap: 0.1875rem;
  list-style: none;
  margin: 0;
  margin-top: 0.25rem;
  padding: 0;
}

.chat-message-bubble__send-attempt {
  align-items: center;
  display: flex;
  gap: 0.1875rem;
  min-height: 44px;
}

.chat-message-bubble__send-dot {
  background-color: var(--app-danger);
  border-radius: 999px;
  flex: none;
  height: 0.625rem;
  width: 0.625rem;
}
.chat-message-bubble__send-dot--ok {
  background-color: var(--app-success);
}
.chat-message-bubble__send-dot--trying {
  background-color: var(--app-warning);
}
.chat-message-bubble__send-dot--skipped {
  background-color: var(--app-muted);
}

.chat-message-bubble__send-host {
  color: var(--app-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-message-bubble__send-state {
  color: var(--app-muted);
  flex: none;
}

.chat-message-bubble__text-waiting-on {
  margin-top: 0.25rem;
  color: var(--app-muted);
}

.chat-message-bubble__info-unknown {
  margin-top: 0.25rem;
  color: var(--app-muted);
}

.chat-message-bubble__info-seen {
  color: var(--app-text);
}

.chat-message-bubble__info-timestamp {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--app-text);
}

.chat-message-bubble__info-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.25rem;
}

.chat-message-bubble__info-action {
  display: inline-flex;
  width: 100%;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: var(--app-radius-lg);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-surface-raised);
  background-color: var(--app-surface);
  padding-inline: 0.75rem;
  padding-block: 0.5rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--app-text);
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}

.chat-message-bubble__copy-3 {
  height: 0.875rem;
  width: 0.875rem;
}
.chat-message-bubble__check-4 {
  height: 0.875rem;
  width: 0.875rem;
  color: var(--app-success);
}

/* Status tones (statusColorClass) */
.chat-message-bubble__success {
  color: var(--app-success);
}
.chat-message-bubble__danger {
  color: var(--app-danger);
}
.chat-message-bubble__info {
  color: var(--app-info);
}
.chat-message-bubble__variant-5 {
  color: var(--app-text-soft);
}
.chat-message-bubble__muted {
  color: var(--app-text-soft);
}

/* Spacing parity with the previous in-parent rules */
:where(.chat-message-bubble__info-body>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.75rem;
}
:where(.chat-message-bubble__dialog>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 1rem;
}

@media (hover: hover) {
  .chat-message-bubble__info-close:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }
  .chat-message-bubble__info-emoji:hover {
    scale: 125% 125%;
  }
  .chat-message-bubble__info-copy:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface);
  }
  .chat-message-bubble__info-action:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-raised);
    color: var(--app-text);
  }
}

[data-theme="light"] .chat-message-bubble__info-close {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__info-note {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__info-label {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-status {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-seen-by {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__text-timestamp {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-bubble__muted {
  color: var(--app-muted);
}

@media (prefers-reduced-motion: reduce) {
  .chat-message-bubble__info-close,
  .chat-message-bubble__info-emoji,
  .chat-message-bubble__info-copy,
  .chat-message-bubble__info-action {
    transition: none;
  }
}
</style>
