<script setup>
import { computed, onUnmounted, ref } from "vue";
import { Check, Container, Copy } from "@/icons";
import { copyToClipboard } from "@/lib/clipboard";
import { useIdentityStore } from "@/stores/identity";

const identityStore = useIdentityStore();
const engine = ref("docker");
const storageCap = ref("Off"); // "Off" = rabta evicts at its 20GB default
const copied = ref(false);
let copiedTimer = null;

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
  ];
  if (storageCap.value !== "Off") {
    lines.push(`  -e STORAGE=${storageCap.value} \\`);
  }
  lines.push(`  -e 'POLICY=${protection.value}' \\`);
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
  <section class="node">
    <header class="node__head">
      <div class="node__intro">
        <div class="node__titleline">
          <h2 class="node__title">Local backup node</h2>
          <span class="node__badge">Optional</span>
        </div>
        <p class="node__lede">
          This browser already keeps a 1:1 copy of your account, so gupt never needs a Rabta node to
          stay available. Run one in Docker or Podman for an off-device copy.
        </p>
      </div>
      <span class="node__mark" aria-hidden="true">
        <Container class="node__mark-icon" :stroke-width="1.8" />
      </span>
    </header>

    <div v-if="!identityStore.pubkeyHex" class="node__wait">
      Your account is still loading. The command appears once your key is ready.
    </div>

    <template v-else>
      <div class="node__controls">
        <div class="node__segment" role="group" aria-label="Container engine">
          <button
            v-for="option in ['docker', 'podman']"
            :key="option"
            type="button"
            class="node__engine"
            :class="{ 'node__engine--on': engine === option }"
            :aria-pressed="engine === option"
            @click="engine = option"
          >
            {{ option }}
          </button>
        </div>

        <button type="button" class="node__copy" @click="copyCommand">
          <Check v-if="copied" class="node__copy-icon node__copy-icon--success" :stroke-width="2" aria-hidden="true" />
          <Copy v-else class="node__copy-icon" :stroke-width="1.9" aria-hidden="true" />
          {{ copied ? "Copied" : "Copy command" }}
        </button>
      </div>

      <div class="node__storage">
        <span class="node__storage-label">Pin storage</span>
        <div class="node__chips" role="group" aria-label="Storage cap">
          <button
            v-for="option in ['Off', '5GB', '20GB', '50GB']"
            :key="option"
            type="button"
            class="node__chip"
            :class="{ 'node__chip--on': storageCap === option }"
            :aria-pressed="storageCap === option"
            @click="storageCap = option"
          >
            {{ option }}
          </button>
        </div>
      </div>

      <div class="node__code">
        <div class="node__code-head">
          <span class="node__code-label">Command</span>
          <span class="node__code-engine">{{ engine }}</span>
        </div>
        <pre class="node__pre"><code>{{ command }}</code></pre>
      </div>

      <p class="node__note">
        The policy exempts your records from pressure eviction, but they still expire over time.
        Rabta evicts under disk pressure at 20GB by default; pin a different cap to override it.
      </p>
      <p class="node__note">
        Bound to this host only. To write to it directly, change the mapping to
        <code class="node__inline-code">-p 3232:3232</code> and add
        <code class="node__inline-code">http://&lt;host&gt;:3232</code> in Settings → Relays.
      </p>
    </template>
  </section>
</template>

<style scoped>
/* Ledger pass: a self-hosting record with an engine switch and a code block. */

.node {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  animation: ledger-rise 440ms var(--app-ease-emphasized) both;
}

.node__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--app-space-3);
  padding-bottom: var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
}

.node__intro {
  min-width: 0;
}

.node__titleline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.node__title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text);
}

.node__badge {
  padding: 1px 5px;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.node__lede {
  max-width: 58ch;
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--app-muted);
}

.node__mark {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  color: var(--app-muted-2);
}

.node__mark-icon {
  width: 14px;
  height: 14px;
}

.node__wait {
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-size: 11px;
  line-height: 1.6;
  color: var(--app-muted);
}

.node__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
}

.node__segment {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
}

.node__engine {
  min-height: 28px;
  padding-inline: 12px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.node__engine--on {
  background: var(--app-text);
  color: var(--app-bg);
}

.node__copy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding-inline: 11px;
  border: 1px solid var(--app-text);
  border-radius: var(--app-radius-sm);
  background: var(--app-text);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-bg);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.node__copy:active {
  transform: translateY(1px);
}

.node__copy-icon {
  width: 11px;
  height: 11px;
}

.node__copy-icon--success {
  color: var(--app-success);
}

.node__storage {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.node__storage-label {
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.node__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.node__chip {
  min-height: 26px;
  padding-inline: 8px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.03em;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.node__chip--on {
  border-color: var(--app-border-strong);
  background: var(--app-surface-soft);
  color: var(--app-text);
}

/* ---- Code ---- */

.node__code {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  overflow: hidden;
}

.node__code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-2);
  padding: 7px 11px;
  border-bottom: 1px solid var(--app-border);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
}

.node__code-label {
  color: var(--app-muted-2);
}

.node__code-engine {
  color: var(--app-success);
}

.node__pre {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.8;
  color: var(--app-text-soft);
  tab-size: 2;
}

.node__note {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.65;
  color: var(--app-muted-2);
}

.node__inline-code {
  padding: 1px 4px;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  background: var(--app-surface-soft);
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--app-text-soft);
}

@media (min-width: 40rem) {
  .node {
    padding: var(--app-space-6);
  }
}

@media (hover: hover) {
  .node__engine:not(.node__engine--on):hover {
    color: var(--app-text);
  }

  .node__chip:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .node__copy:hover {
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
  }
}

@media (pointer: coarse) {
  .node__engine,
  .node__chip,
  .node__copy {
    min-height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .node {
    animation: none;
  }

  .node__engine,
  .node__chip,
  .node__copy {
    transition: none;
  }
}
</style>
