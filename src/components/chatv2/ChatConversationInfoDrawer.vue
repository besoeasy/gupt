<script setup>
import { computed, ref } from "vue";
import {
  X,
  ShieldCheck,
  Radio,
  Server,
  Activity,
  Copy,
  Check,
  ExternalLink,
  Users,
  Database,
  RefreshCw,
} from "@lucide/vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { shortId } from "@/lib/crypto";
import { copyToClipboard } from "@/lib/clipboard";
import { formatTimeAgo } from "@/lib/lastSeen";

const props = defineProps({
  open: { type: Boolean, default: false },
  isGroup: { type: Boolean, default: false },
  title: { type: String, default: "" },
  peerPubkey: { type: String, default: "" },
  peerAvatar: { type: String, default: "" },
  groupAvatar: { type: String, default: "" },
  group: { type: Object, default: () => ({}) },
  displayName: { type: Function, required: true },
  lastSeenLabel: { type: String, default: "" },
  lastActivitySec: { type: Number, default: null },
  peerBio: { type: String, default: "" },
  peerWebsite: { type: String, default: "" },
  relayEventCount: { type: Number, default: null },
  relayLatencyMs: { type: Number, default: null },
  relayNodeId: { type: String, default: "" },
  syncParity: { type: String, default: "synced" },
  syncParityLabel: { type: String, default: "" },
  loadingEnrichment: { type: Boolean, default: false },
  memberSeenAt: { type: Map, default: () => new Map() },
  selfPubkey: { type: String, default: "" },
});

const emit = defineEmits(["close", "refresh"]);

const copiedKey = ref(false);

async function handleCopyKey(key) {
  if (!key) return;
  await copyToClipboard(key);
  copiedKey.value = true;
  setTimeout(() => {
    copiedKey.value = false;
  }, 2000);
}

function memberActivity(pk) {
  if (pk === props.selfPubkey) return "You";
  const ts = props.memberSeenAt.get(pk);
  if (!ts) return "Offline";
  return `Seen ${formatTimeAgo(Math.floor(ts / 1000))}`;
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="translate-x-full opacity-0"
    enter-to-class="translate-x-0 opacity-100"
    leave-active-class="transition-all duration-150 ease-in"
    leave-from-class="translate-x-0 opacity-100"
    leave-to-class="translate-x-full opacity-0"
  >
    <aside
      v-if="open"
      class="w-full sm:w-[320px] bg-zinc-950/95 backdrop-blur-md border-l border-zinc-800/80 overflow-y-auto shrink-0 p-4 space-y-4 z-20 flex flex-col shadow-2xl"
    >
      <!-- Header with Close button -->
      <div class="flex items-center justify-between border-b border-zinc-800/60 pb-3">
        <div class="flex items-center gap-2">
          <Activity class="h-4 w-4 text-emerald-400" />
          <h3 class="text-xs font-mono uppercase tracking-wider text-zinc-300">
            {{ isGroup ? "Group Details" : "Contact Details" }}
          </h3>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            @click="emit('refresh')"
            :disabled="loadingEnrichment"
            class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh live relay data"
            aria-label="Refresh live relay data"
          >
            <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loadingEnrichment }" />
          </button>
          <button
            type="button"
            @click="emit('close')"
            class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer"
            title="Close details"
            aria-label="Close details"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- Identity Profile Card -->
      <div
        class="flex flex-col items-center text-center p-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 space-y-2"
      >
        <div class="overflow-hidden rounded-2xl border border-zinc-700/80 shadow-md">
          <RoboAvatar :src="isGroup ? groupAvatar : peerAvatar" size="lg" :alt="title" />
        </div>
        <div class="min-w-0 max-w-full">
          <h4 class="text-sm font-semibold text-white truncate">{{ title || "Conversation" }}</h4>
          <p v-if="!isGroup && peerPubkey" class="font-mono text-[10px] text-zinc-400 truncate">
            {{ shortId(peerPubkey) }}
          </p>
        </div>

        <p v-if="peerBio" class="text-xs text-zinc-300 leading-relaxed max-w-full break-words">
          {{ peerBio }}
        </p>

        <a
          v-if="peerWebsite"
          :href="peerWebsite.startsWith('http') ? peerWebsite : 'https://' + peerWebsite"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline min-h-[44px]"
        >
          <span>{{ peerWebsite }}</span>
          <ExternalLink class="h-3 w-3" />
        </a>

        <!-- Public Key Copy button -->
        <button
          v-if="!isGroup && peerPubkey"
          type="button"
          @click="handleCopyKey(peerPubkey)"
          class="min-h-[44px] w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 text-[11px] font-mono text-zinc-300 hover:border-zinc-700 hover:text-white transition-all cursor-pointer select-none"
        >
          <Copy v-if="!copiedKey" class="h-3.5 w-3.5 text-zinc-400" />
          <Check v-else class="h-3.5 w-3.5 text-emerald-400" />
          <span>{{ copiedKey ? "Public key copied!" : "Copy Ed25519 Pubkey" }}</span>
        </button>
      </div>

      <!-- Live Rabta Relay Telemetry Card -->
      <div class="space-y-2">
        <h4 class="font-mono text-[10px] uppercase tracking-wider text-zinc-400 px-1">
          Live Relay Telemetry
        </h4>
        <div class="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3 space-y-2.5 text-xs">
          <!-- Live Activity / Status -->
          <div class="flex items-center justify-between">
            <span class="text-zinc-400 flex items-center gap-1.5">
              <Radio class="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              Activity
            </span>
            <span class="font-mono text-zinc-200 font-medium">
              {{ lastSeenLabel || "Checking…" }}
            </span>
          </div>

          <!-- Live Relay Events Count -->
          <div class="flex items-center justify-between">
            <span class="text-zinc-400 flex items-center gap-1.5">
              <Database class="h-3.5 w-3.5 text-sky-400 shrink-0" />
              Relay Events
            </span>
            <span class="font-mono text-zinc-200 tabular-nums">
              {{ relayEventCount !== null ? `${relayEventCount} events` : "Querying…" }}
            </span>
          </div>

          <!-- Sync Parity -->
          <div class="flex items-center justify-between">
            <span class="text-zinc-400 flex items-center gap-1.5">
              <ShieldCheck class="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              Sync State
            </span>
            <span
              class="font-mono text-[11px] px-2 py-0.5 rounded-full"
              :class="
                syncParity === 'synced'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              "
            >
              {{ syncParityLabel }}
            </span>
          </div>

          <!-- Node Latency & Gateway -->
          <div v-if="relayLatencyMs" class="flex items-center justify-between">
            <span class="text-zinc-400 flex items-center gap-1.5">
              <Server class="h-3.5 w-3.5 text-purple-400 shrink-0" />
              Relay Latency
            </span>
            <span class="font-mono text-zinc-300 tabular-nums">{{ relayLatencyMs }} ms</span>
          </div>
        </div>
      </div>

      <!-- Group Members (for Groups) -->
      <div v-if="isGroup" class="space-y-2">
        <div class="flex items-center justify-between px-1">
          <h4 class="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
            Members ({{ group?.members?.length || 0 }})
          </h4>
        </div>

        <div class="space-y-1">
          <div
            v-for="pubkey in group?.members || []"
            :key="pubkey"
            class="flex items-center gap-2.5 p-2 rounded-lg border border-transparent hover:border-zinc-800/80 hover:bg-zinc-900/40 transition-colors"
          >
            <RoboAvatar :src="pubkey" size="sm" rounded="md" class="shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-xs font-medium text-zinc-200 truncate">
                {{ displayName(pubkey) }}
              </p>
              <p class="font-mono text-[10px] text-zinc-500 truncate">
                {{ memberActivity(pubkey) }}
              </p>
            </div>
            <span
              v-if="pubkey === selfPubkey"
              class="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400"
            >
              You
            </span>
          </div>
        </div>
      </div>
    </aside>
  </Transition>
</template>
