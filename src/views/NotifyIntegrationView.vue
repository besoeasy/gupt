<script setup>
import { computed, onMounted, ref } from "vue";
import { Check, Copy, KeyRound, RefreshCw, Send, Terminal } from "@lucide/vue";

import PageBackHeader from "@/components/PageBackHeader.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
import { useIdentityStore } from "@/stores/identity";
import {
  NotifyGupt,
  NOTIFY_RELAY,
  clearNotifyDeviceKey,
  getNotifyDeviceKey,
  setNotifyDefaults,
} from "@/lib/notify";
import notifySource from "@/lib/notify.js?raw";

const identity = useIdentityStore();
const deviceKey = ref(null);
const sendState = ref("idle"); // idle | sending | sent | error
const sendResult = ref(null);
const keyCopied = ref(false);
const snippetCopied = ref(false);
const sourceCopied = ref(false);
let copyTimer = null;

// The in-gupt default target is the signed-in account: NotifyGupt() with no
// arguments sends to this account's inbox from this browser's device key.
const targetPubkey = computed(() => identity.pubkeyHex || "");

// Copy-paste brief for a coding agent instead of a bare snippet: it explains
// setup, the three-argument call format, and the rules, with this page's
// relay and target key pre-filled.
const usageSnippet = computed(() => {
  const target = targetPubkey.value || "<your gupt public key>";
  return [
    "Add NotifyGupt to this web app: one function that encrypts a log line to",
    "my gupt public key and posts it through a Rabta relay, so it lands in my",
    "gupt inbox end-to-end encrypted.",
    "",
    "Setup:",
    "1. Create src/lib/notify.js from the full source I provide below (also",
    "   shown at the bottom of the gupt integrations page).",
    "2. Run: npm i @noble/curves @noble/hashes @noble/ciphers",
    "3. Where the app should notify me, call:",
    '   import { NotifyGupt } from "./notify.js";',
    "   await NotifyGupt(relay, target, text);",
    "",
    "Format — exactly three arguments, in this order:",
    `1. relay: use exactly "${NOTIFY_RELAY}"`,
    "2. target: my gupt public key, 64-char lowercase hex (the log is",
    `   encrypted to my inbox): ${target}`,
    '3. text: one human-readable line, always prefixed with a short app tag',
    '   so I can tell the source in my inbox, e.g. "[myapp] booted".',
    "",
    "Rules:",
    "- Wire it into existing error/log paths (boot, unhandled errors, auth",
    "  lifecycle) — one call per event, no batching or queueing.",
    "- Never log secrets, tokens or personal data.",
    "- Catch and swallow notify failures so logging never breaks the app.",
  ].join("\n");
});

onMounted(async () => {
  try {
    await identity.init();
  } catch {
    // The page still renders; the values fill in when the key is ready.
  }
  setNotifyDefaults({ relay: NOTIFY_RELAY, pubkey: identity.pubkeyHex });
  deviceKey.value = getNotifyDeviceKey();
});

function flashCopied(state) {
  state.value = true;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    state.value = false;
  }, 2000);
}

async function copyText(value, state) {
  try {
    await navigator.clipboard.writeText(value);
    flashCopied(state);
  } catch {
    // Clipboard blocked; the text stays selectable.
  }
}

function resetDeviceKey() {
  clearNotifyDeviceKey();
  deviceKey.value = getNotifyDeviceKey();
}

async function sendTestLog() {
  sendState.value = "sending";
  sendResult.value = null;
  try {
    const result = await NotifyGupt(
      undefined,
      undefined,
      "Hello from the gupt integrations page — NotifyGupt test log",
    );
    if (result.ok) {
      sendResult.value = result;
      sendState.value = "sent";
    } else {
      sendResult.value = result;
      sendState.value = "error";
    }
  } catch (err) {
    sendResult.value = { ok: false, error: err?.message || "Send failed" };
    sendState.value = "error";
  }
}
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <PageBackHeader
          back-to="/integrations"
          back-label="Integrations"
          eyebrow="Developer logging"
          title="NotifyGupt"
        >
          <p class="text-sm leading-6 text-(--app-muted)">
            One function, any web app: it encrypts a log line to a gupt public key, signs it with a
            per-browser device key, and posts it to a Rabta relay. The log lands in your gupt inbox
            like a normal end-to-end encrypted message — no server, no log vendor.
          </p>
        </PageBackHeader>

        <section
          class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 sm:p-5 space-y-4"
        >
          <p class="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-300">
            <KeyRound class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
            Your values
          </p>
          <div class="space-y-2">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Relay (pre-filled)
            </p>
            <p
              class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2.5 text-xs font-mono text-zinc-300 break-all"
            >
              {{ NOTIFY_RELAY }}
            </p>
            <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Target inbox (your current account)
            </p>
            <p
              v-if="targetPubkey"
              class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2.5 text-xs font-mono text-zinc-300 break-all select-all"
            >
              {{ targetPubkey }}
            </p>
            <AppSkeleton v-else as="span" class="block h-9 w-full max-w-md rounded-xl" />
          </div>

          <div class="space-y-2">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              This browser's device key
            </p>
            <p
              v-if="deviceKey"
              class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2.5 text-xs font-mono text-zinc-300 break-all select-all"
            >
              {{ deviceKey.pubkeyHex }}
            </p>
            <AppSkeleton v-else as="span" class="block h-9 w-full max-w-md rounded-xl" />
            <p class="text-[11px] text-(--app-muted) leading-relaxed">
              Generated once and kept in localStorage, so every log from this browser is signed by
              the same identity. In gupt it appears as a separate contact.
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                v-if="deviceKey"
                type="button"
                class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-medium text-(--app-text-soft) transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                @click="copyText(deviceKey.pubkeyHex, keyCopied)"
              >
                <Check
                  v-if="keyCopied"
                  class="h-3.5 w-3.5 text-emerald-400"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <Copy v-else class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
                Copy device key
              </button>
              <button
                type="button"
                class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-medium text-(--app-text-soft) transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                @click="resetDeviceKey"
              >
                <RefreshCw class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
                Regenerate
              </button>
            </div>
          </div>
        </section>

        <section
          class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 sm:p-5 space-y-4"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-300">
              <Terminal class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
              Hand it to your AI agent
            </p>
            <button
              type="button"
              class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-(--app-border) bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 transition-all hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
              @click="copyText(usageSnippet, snippetCopied)"
            >
              <Check v-if="snippetCopied" class="h-3.5 w-3.5 text-emerald-400" />
              <Copy v-else class="h-3.5 w-3.5" />
              {{ snippetCopied ? "Copied" : "Copy instruction" }}
            </button>
          </div>
          <pre
            class="overflow-x-auto rounded-lg border border-(--app-border)/80 bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-zinc-300"
          ><code>{{ usageSnippet }}</code></pre>
          <p class="text-[11px] text-(--app-muted) leading-relaxed">
            A copy-paste brief for a coding agent — relay and target key are already filled in,
            and the
            <code class="font-mono text-zinc-400">notify.js</code> source below is the file it
            asks for.
          </p>
        </section>

        <section
          class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 sm:p-5 space-y-3"
        >
          <p class="text-sm font-semibold text-zinc-300">Try it now</p>
          <p class="text-[11px] text-(--app-muted) leading-relaxed">
            Sends a test log to your own inbox from this browser's device key. Open Chat to see it
            arrive.
          </p>
          <div class="flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-(--app-primary) px-4 text-sm font-semibold text-(--app-primary-foreground) transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="sendState === 'sending' || !targetPubkey"
              @click="sendTestLog"
            >
              <Send class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
              {{ sendState === "sending" ? "Sending…" : "Send test log" }}
            </button>
            <p v-if="sendState === 'sent'" class="text-xs text-emerald-400">
              Delivered — event <span class="font-mono">{{ sendResult?.id?.slice(0, 12) }}…</span>
            </p>
            <p v-else-if="sendState === 'error'" class="text-xs text-red-400">
              {{ sendResult?.error || "Send failed" }}
            </p>
          </div>
        </section>

        <section
          class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl p-4 sm:p-5 space-y-3"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-semibold text-zinc-300">notify.js — full source</p>
            <button
              type="button"
              class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-(--app-border) bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 transition-all hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
              @click="copyText(notifySource, sourceCopied)"
            >
              <Check v-if="sourceCopied" class="h-3.5 w-3.5 text-emerald-400" />
              <Copy v-else class="h-3.5 w-3.5" />
              {{ sourceCopied ? "Copied" : "Copy source" }}
            </button>
          </div>
          <pre
            class="max-h-96 overflow-y-auto overflow-x-auto rounded-lg border border-(--app-border)/80 bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-zinc-300"
          ><code>{{ notifySource }}</code></pre>
        </section>
      </div>
    </div>
  </main>
</template>
