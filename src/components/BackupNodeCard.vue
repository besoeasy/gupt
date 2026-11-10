<script setup>
import { computed, onUnmounted, ref } from "vue";
import { Check, Container, Copy } from "@lucide/vue";
import { readConfiguredRelays } from "@/config/servers";
import { copyToClipboard } from "@/lib/clipboard";
import { useIdentityStore } from "@/stores/identity";

const identityStore = useIdentityStore();
const engine = ref("docker");
const copied = ref(false);
let copiedTimer = null;

const relays = computed(() => readConfiguredRelays());
const syncRelays = computed(() => relays.value.slice(0, 4));

const protection = computed(() => {
  const pubkey = identityStore.pubkeyHex;
  return JSON.stringify({
    rules: [{ owner: [`ed25519:${pubkey}`] }, { labels: [pubkey] }],
  });
});

const command = computed(() => {
  const lines = [
    `${engine.value} run -d \\`,
    "  --name gupt-backup \\",
    "  -p 127.0.0.1:3232:3232 \\",
    "  -v gupt-backup:/data \\",
    "  --restart unless-stopped \\",
    "  -e STORAGE_LIMIT=20GB \\",
    `  -e 'PROTECTION=${protection.value}' \\`,
  ];
  if (syncRelays.value.length) {
    lines.push(`  -e SYNC=${syncRelays.value.join(",")} \\`);
  }
  lines.push("  ghcr.io/rabta-protocol/rabta:latest");
  return lines.join("\n");
});

function copyCommand() {
  copied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copied.value = false), 2000);
  void copyToClipboard(command.value).catch(() => {
    copied.value = false;
  });
}

onUnmounted(() => clearTimeout(copiedTimer));
</script>

<template>
  <div class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5 space-y-3 shadow-xs">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-sm font-semibold tracking-tight text-white">Local backup node</h2>
          <span
            class="rounded-full border border-zinc-800 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500"
          >
            Optional
          </span>
        </div>
        <p class="text-xs text-zinc-500 leading-relaxed">
          This browser already keeps a 1:1 copy of your account, so gupt never needs a Rabta node to
          stay available. Run one in Docker or Podman for an off-device copy, or as a sync point
          when several devices use the same account.
        </p>
      </div>
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400"
      >
        <Container class="h-4 w-4" />
      </div>
    </div>

    <div
      v-if="!identityStore.pubkeyHex"
      class="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-500"
    >
      Your account is still loading. The command appears once your key is ready.
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5">
          <button
            v-for="option in ['docker', 'podman']"
            :key="option"
            type="button"
            class="cursor-pointer rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors"
            :class="
              engine === option ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
            "
            @click="engine = option"
          >
            {{ option }}
          </button>
        </div>

        <button
          type="button"
          class="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
          @click="copyCommand"
        >
          <Check v-if="copied" class="h-3.5 w-3.5 text-emerald-400" />
          <Copy v-else class="h-3.5 w-3.5" />
          {{ copied ? "Copied" : "Copy command" }}
        </button>
      </div>

      <pre
        class="overflow-x-auto rounded-lg border border-zinc-800/80 bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-zinc-300"
      ><code>{{ command }}</code></pre>

      <p class="text-[11px] leading-relaxed text-zinc-500">
        Syncs with {{ syncRelays.length }} of {{ relays.length }} configured relays (Rabta accepts
        up to 4). Protection pins your records against eviction, but events still expire.
      </p>
      <p v-if="relays.length > 4" class="text-[11px] leading-relaxed text-yellow-500/80">
        Only the first 4 relays fit in Rabta's SYNC list.
      </p>
      <p class="text-[11px] leading-relaxed text-zinc-500">
        Bound to this host only. To write to it directly, change the mapping to
        <code class="font-mono text-zinc-400">-p 3232:3232</code> and add
        <code class="font-mono text-zinc-400">http://&lt;host&gt;:3232</code> in Settings → Relays.
      </p>
    </template>
  </div>
</template>
