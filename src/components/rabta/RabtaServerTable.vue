<script setup>
import { computed } from "vue";
import { Trash2, Lock, ShieldCheck, Activity, HardDrive } from "@lucide/vue";
import { DEFAULT_RELAYS } from "@/config/servers";

const props = defineProps({
  servers: {
    type: Array,
    default: () => [],
  },
  defaultRelays: {
    type: Array,
    default: () => [...DEFAULT_RELAYS],
  },
});

const emit = defineEmits(["remove"]);

const displayServers = computed(() => {
  if (props.servers && props.servers.length > 0) {
    return props.servers;
  }
  const fallback = props.defaultRelays && props.defaultRelays.length
    ? props.defaultRelays
    : DEFAULT_RELAYS;
  return fallback.map((url) => ({
    url,
    online: null,
    latencyMs: null,
    userEvents: null,
    storage: null,
  }));
});

function cleanUrl(url) {
  return String(url || "").replace(/^https?:\/\//i, "");
}

function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) return "Unlimited";
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${val} ${units[i]}`;
}

function latencyColorClass(server) {
  if (server.online === null) return "text-zinc-500";
  if (!server.online) return "text-red-400";
  const ms = server.latencyMs;
  if (ms == null) return "text-zinc-500";
  if (ms < 120) return "text-emerald-400 font-semibold";
  if (ms < 300) return "text-amber-400 font-semibold";
  return "text-red-400 font-semibold";
}

function isDefaultServer(url) {
  return props.defaultRelays.includes(url) || DEFAULT_RELAYS.includes(url);
}
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm transition-all duration-200">
    <div class="w-full">
      <table class="w-full table-fixed text-left font-mono text-xs">
        <colgroup>
          <col class="w-[45%] sm:w-[35%]" />
          <col class="w-[25%] sm:w-[20%]" />
          <col class="w-[30%] sm:w-[20%]" />
          <col class="hidden sm:table-column sm:w-[15%]" />
          <col class="w-[44px] sm:w-[10%]" />
        </colgroup>
        <thead>
          <tr class="border-b border-zinc-800/80 bg-zinc-950/50 text-[10px] uppercase tracking-wider text-zinc-500 select-none">
            <th scope="col" class="py-2.5 pl-3.5 pr-2 font-medium">Node</th>
            <th scope="col" class="px-2 py-2.5 font-medium">Latency</th>
            <th scope="col" class="px-2 py-2.5 font-medium text-right sm:text-left">Events</th>
            <th scope="col" class="hidden px-2 py-2.5 font-medium sm:table-cell">Headroom</th>
            <th scope="col" class="py-2.5 pl-1 pr-3 text-right font-medium">
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800/50">
          <tr
            v-for="server in displayServers"
            :key="server.url"
            class="group transition-colors duration-150 hover:bg-zinc-800/30"
          >
            <!-- Column 1: Node & Status Dot -->
            <td class="py-3 pl-3.5 pr-2 align-middle">
              <div class="flex items-center gap-2 min-w-0">
                <span class="relative flex h-2 w-2 shrink-0">
                  <span
                    v-if="server.online === true"
                    class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"
                  />
                  <span
                    class="relative inline-flex h-2 w-2 rounded-full"
                    :class="{
                      'bg-emerald-400': server.online === true,
                      'bg-red-400': server.online === false,
                      'bg-zinc-500 animate-pulse': server.online === null,
                    }"
                  />
                </span>
                <div class="min-w-0 truncate">
                  <div class="flex items-center gap-1.5 truncate">
                    <span
                      class="truncate font-mono text-xs font-semibold text-zinc-100"
                      :title="server.url"
                    >
                      {{ cleanUrl(server.url) }}
                    </span>
                    <span
                      v-if="server.battery?.backedOff"
                      class="shrink-0 rounded px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider font-medium border border-amber-500/25 bg-amber-500/10 text-amber-400"
                      :title="`Sync cadence backed off (${server.battery.multiplier}x) for ${server.battery.label}`"
                    >
                      {{ server.battery.label }}
                    </span>
                  </div>
                  <p
                    v-if="server.online === false && server.error"
                    class="truncate font-mono text-[10px] text-red-400/90"
                    :title="server.error"
                  >
                    {{ server.error }}
                  </p>
                  <p
                    v-else-if="server.nodeId"
                    class="truncate font-mono text-[10px] text-zinc-500"
                    :title="server.nodeId"
                  >
                    id: {{ server.nodeId.slice(0, 10) }}…
                  </p>
                </div>
              </div>
            </td>

            <!-- Column 2: Latency / Status -->
            <td class="px-2 py-3 align-middle">
              <div class="truncate tabular-nums">
                <span
                  class="font-mono text-xs"
                  :class="latencyColorClass(server)"
                >
                  <template v-if="server.online === null">Probing…</template>
                  <template v-else-if="!server.online">Offline</template>
                  <template v-else>{{ server.latencyMs != null ? `${server.latencyMs}ms` : '—' }}</template>
                </span>
              </div>
            </td>

            <!-- Column 3: Events on Node -->
            <td class="px-2 py-3 align-middle text-right sm:text-left">
              <div class="truncate tabular-nums">
                <span class="font-mono text-xs font-bold text-emerald-400">
                  {{ server.userEvents != null ? server.userEvents.toLocaleString() : '0' }}
                </span>
                <span
                  v-if="server.userOurs != null || server.userInbound != null"
                  class="block truncate font-mono text-[9px] text-zinc-500"
                  :title="`${server.userOurs || 0} sent · ${server.userInbound || 0} received (Relay total: ${server.liveEvents || 0})`"
                >
                  {{ server.userOurs || 0 }}s · {{ server.userInbound || 0 }}r
                </span>
              </div>
            </td>

            <!-- Column 4: Storage Headroom (Desktop / Tablet) -->
            <td class="hidden px-2 py-3 align-middle sm:table-cell">
              <div class="truncate tabular-nums font-mono text-xs text-zinc-300">
                <template v-if="server.storage?.writable === false">
                  <span class="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400 border border-amber-500/20">
                    Read-only
                  </span>
                </template>
                <template v-else-if="server.storage">
                  {{ formatBytes(server.storage.remainingBytes) }}
                </template>
                <template v-else>
                  <span class="text-zinc-600">—</span>
                </template>
              </div>
            </td>

            <!-- Column 5: Action (Touch target min 44px) -->
            <td class="py-1 pl-1 pr-3 align-middle text-right">
              <div class="flex items-center justify-end">
                <button
                  v-if="!isDefaultServer(server.url)"
                  type="button"
                  class="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400 active:scale-95"
                  title="Remove server node"
                  aria-label="Remove server node"
                  @click="emit('remove', server.url)"
                >
                  <Trash2 class="h-3.5 w-3.5" :stroke-width="1.8" />
                </button>
                <span
                  v-else
                  class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-zinc-600 select-none"
                  title="Default core mesh node"
                >
                  <span class="rounded bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                    core
                  </span>
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
