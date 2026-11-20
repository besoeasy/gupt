<script setup>
import { computed, onUnmounted, ref } from "vue";
import { Check, Container, Copy } from "@lucide/vue";
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
  <div class="backup-node-card__block">
    <div class="backup-node-card__block-2">
      <div class="backup-node-card__block-3">
        <div class="backup-node-card__block-4">
          <h2 class="backup-node-card__subtitle-local-backup">Local backup node</h2>
          <span
            class="backup-node-card__text-optional"
          >
            Optional
          </span>
        </div>
        <p class="backup-node-card__text">
          This browser already keeps a 1:1 copy of your account, so gupt never needs a Rabta node to
          stay available. Run one in Docker or Podman for an off-device copy.
        </p>
      </div>
      <div
        class="backup-node-card__block-5"
      >
        <Container class="backup-node-card__container" />
      </div>
    </div>

    <div
      v-if="!identityStore.pubkeyHex"
      class="backup-node-card__block-6"
    >
      Your account is still loading. The command appears once your key is ready.
    </div>

    <template v-else>
      <div class="backup-node-card__block-7">
        <div class="backup-node-card__block-8">
          <button
            v-for="option in ['docker', 'podman']"
            :key="option"
            type="button"
            class="backup-node-card__button"
            :class="
              engine === option ? 'backup-node-card__button--selected' : 'backup-node-card__button--muted'
            "
            @click="engine = option"
          >
            {{ option }}
          </button>
        </div>

        <button
          type="button"
          class="backup-node-card__button-2"
          @click="copyCommand"
        >
          <Check v-if="copied" class="backup-node-card__check" />
          <Copy v-else class="backup-node-card__copy" />
          {{ copied ? "Copied" : "Copy command" }}
        </button>
      </div>

      <div class="backup-node-card__block-9">
        <span class="backup-node-card__text-pin-storage">Pin storage</span>
        <div class="backup-node-card__block-10">
          <button
            v-for="option in ['Off', '5GB', '20GB', '50GB']"
            :key="option"
            type="button"
            class="backup-node-card__button-3"
            :class="
              storageCap === option
                ? 'backup-node-card__button--selected-2'
                : 'backup-node-card__button--muted-2'
            "
            :aria-pressed="storageCap === option"
            @click="storageCap = option"
          >
            {{ option }}
          </button>
        </div>
      </div>

      <pre
        class="backup-node-card__code-block"
      ><code>{{ command }}</code></pre>

      <p class="backup-node-card__text-2">
        The policy exempts your records from pressure eviction, but they still expire over time.
        Rabta evicts under disk pressure at 20GB by default; pin a different cap to override it.
      </p>
      <p class="backup-node-card__text-3">
        Bound to this host only. To write to it directly, change the mapping to
        <code class="backup-node-card__code-p-3232">-p 3232:3232</code> and add
        <code class="backup-node-card__code">http://&lt;host&gt;:3232</code> in Settings → Relays.
      </p>
    </template>
  </div>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.backup-node-card__block-6 {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.backup-node-card__code-block {
  border-color: color-mix(in oklab,var(--ui-zinc-800) 80%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.backup-node-card__code-block {
  background-color: color-mix(in oklab,var(--ui-black) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.backup-node-card__block-6 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.backup-node-card__block-8 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.backup-node-card__button-2 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.backup-node-card__block-10 {
  background-color: color-mix(in oklab,var(--ui-zinc-900) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.backup-node-card__block {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 60%,transparent);
}
}

@media (hover:hover) {
.backup-node-card__button-2:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.backup-node-card__button-2:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.backup-node-card__button-2:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.backup-node-card__button--muted:hover {
  color: var(--ui-zinc-300);
}
}

@media (hover:hover) {
.backup-node-card__button--muted-2:hover {
  color: var(--ui-zinc-300);
}
}

@media (min-width:40rem) {
.backup-node-card__block {
  padding: calc(var(--spacing) * 5);
}
}

@layer gupt-components {
.backup-node-card__block-2 {
  display: flex;
}
.backup-node-card__block-4 {
  display: flex;
}
.backup-node-card__block-5 {
  display: flex;
}
.backup-node-card__block-7 {
  display: flex;
}
.backup-node-card__block-9 {
  display: flex;
}
.backup-node-card__block-8 {
  display: inline-flex;
}
.backup-node-card__button-2 {
  display: inline-flex;
}
.backup-node-card__block-10 {
  display: inline-flex;
}
.backup-node-card__check {
  height: calc(var(--spacing) * 3.5);
}
.backup-node-card__copy {
  height: calc(var(--spacing) * 3.5);
}
.backup-node-card__container {
  height: calc(var(--spacing) * 4);
}
.backup-node-card__button-2 {
  height: calc(var(--spacing) * 8);
}
.backup-node-card__block-5 {
  height: calc(var(--spacing) * 9);
}
.backup-node-card__check {
  width: calc(var(--spacing) * 3.5);
}
.backup-node-card__copy {
  width: calc(var(--spacing) * 3.5);
}
.backup-node-card__container {
  width: calc(var(--spacing) * 4);
}
.backup-node-card__block-5 {
  width: calc(var(--spacing) * 9);
}
.backup-node-card__block-3 {
  min-width: 0;
}
.backup-node-card__block-5 {
  flex-shrink: 0;
}
.backup-node-card__button {
  cursor: pointer;
}
.backup-node-card__button-2 {
  cursor: pointer;
}
.backup-node-card__button-3 {
  cursor: pointer;
}
.backup-node-card__block-4 {
  flex-wrap: wrap;
}
.backup-node-card__block-7 {
  flex-wrap: wrap;
}
.backup-node-card__block-9 {
  flex-wrap: wrap;
}
.backup-node-card__block-4 {
  align-items: center;
}
.backup-node-card__block-5 {
  align-items: center;
}
.backup-node-card__block-7 {
  align-items: center;
}
.backup-node-card__button-2 {
  align-items: center;
}
.backup-node-card__block-9 {
  align-items: center;
}
.backup-node-card__block-2 {
  align-items: flex-start;
}
.backup-node-card__block-2 {
  justify-content: space-between;
}
.backup-node-card__block-7 {
  justify-content: space-between;
}
.backup-node-card__block-9 {
  justify-content: space-between;
}
.backup-node-card__block-5 {
  justify-content: center;
}
.backup-node-card__button-2 {
  justify-content: center;
}
.backup-node-card__button-2 {
  gap: calc(var(--spacing) * 1.5);
}
.backup-node-card__block-4 {
  gap: calc(var(--spacing) * 2);
}
.backup-node-card__block-7 {
  gap: calc(var(--spacing) * 2);
}
.backup-node-card__block-9 {
  gap: calc(var(--spacing) * 2);
}
.backup-node-card__block-2 {
  gap: calc(var(--spacing) * 3);
}
:where(.backup-node-card__block-3>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(var(--spacing) * 0);
  margin-block-end: calc(var(--spacing) * calc(1 - 0));
}
:where(.backup-node-card__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
.backup-node-card__code-block {
  overflow-x: auto;
}
.backup-node-card__text-optional {
  border-radius: 3.40282e38px;
}
.backup-node-card__block-6 {
  border-radius: var(--radius-lg);
}
.backup-node-card__block-8 {
  border-radius: var(--radius-lg);
}
.backup-node-card__button-2 {
  border-radius: var(--radius-lg);
}
.backup-node-card__block-10 {
  border-radius: var(--radius-lg);
}
.backup-node-card__code-block {
  border-radius: var(--radius-lg);
}
.backup-node-card__button {
  border-radius: var(--radius-md);
}
.backup-node-card__button-3 {
  border-radius: var(--radius-md);
}
.backup-node-card__block {
  border-radius: var(--radius-xl);
}
.backup-node-card__block-5 {
  border-radius: var(--radius-xl);
}
.backup-node-card__block {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.backup-node-card__text-optional {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.backup-node-card__block-5 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.backup-node-card__block-6 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.backup-node-card__block-8 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.backup-node-card__button-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.backup-node-card__block-10 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.backup-node-card__code-block {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.backup-node-card__block {
  border-color: var(--ui-zinc-800);
}
.backup-node-card__text-optional {
  border-color: var(--ui-zinc-800);
}
.backup-node-card__block-5 {
  border-color: var(--ui-zinc-800);
}
.backup-node-card__block-8 {
  border-color: var(--ui-zinc-800);
}
.backup-node-card__button-2 {
  border-color: var(--ui-zinc-800);
}
.backup-node-card__block-10 {
  border-color: var(--ui-zinc-800);
}
.backup-node-card__block-6 {
  border-color: var(--ui-zinc-800);
}
.backup-node-card__code-block {
  border-color: var(--ui-zinc-800);
}
.backup-node-card__code-block {
  background-color: var(--ui-black);
}
.backup-node-card__button--selected {
  background-color: var(--ui-zinc-800);
}
.backup-node-card__button--selected-2 {
  background-color: var(--ui-zinc-800);
}
.backup-node-card__block-5 {
  background-color: var(--ui-zinc-900);
}
.backup-node-card__block-6 {
  background-color: var(--ui-zinc-900);
}
.backup-node-card__block-8 {
  background-color: var(--ui-zinc-900);
}
.backup-node-card__button-2 {
  background-color: var(--ui-zinc-900);
}
.backup-node-card__block-10 {
  background-color: var(--ui-zinc-900);
}
.backup-node-card__block {
  background-color: var(--ui-zinc-950);
}
.backup-node-card__block-8 {
  padding: calc(var(--spacing) * .5);
}
.backup-node-card__block-10 {
  padding: calc(var(--spacing) * .5);
}
.backup-node-card__code-block {
  padding: calc(var(--spacing) * 3);
}
.backup-node-card__block {
  padding: calc(var(--spacing) * 4);
}
.backup-node-card__text-optional {
  padding-inline: calc(var(--spacing) * 2);
}
.backup-node-card__button {
  padding-inline: calc(var(--spacing) * 2.5);
}
.backup-node-card__button-3 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.backup-node-card__block-6 {
  padding-inline: calc(var(--spacing) * 3);
}
.backup-node-card__button-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.backup-node-card__text-optional {
  padding-block: calc(var(--spacing) * .5);
}
.backup-node-card__button {
  padding-block: var(--spacing);
}
.backup-node-card__button-3 {
  padding-block: var(--spacing);
}
.backup-node-card__block-6 {
  padding-block: calc(var(--spacing) * 2);
}
.backup-node-card__text-optional {
  font-family: var(--font-mono);
}
.backup-node-card__button {
  font-family: var(--font-mono);
}
.backup-node-card__button-3 {
  font-family: var(--font-mono);
}
.backup-node-card__code-block {
  font-family: var(--font-mono);
}
.backup-node-card__code-p-3232 {
  font-family: var(--font-mono);
}
.backup-node-card__code {
  font-family: var(--font-mono);
}
.backup-node-card__subtitle-local-backup {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.backup-node-card__text {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.backup-node-card__block-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.backup-node-card__button-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.backup-node-card__text-optional {
  font-size: 9px;
}
.backup-node-card__button {
  font-size: 10px;
}
.backup-node-card__button-3 {
  font-size: 10px;
}
.backup-node-card__text-pin-storage {
  font-size: 11px;
}
.backup-node-card__code-block {
  font-size: 11px;
}
.backup-node-card__text-2 {
  font-size: 11px;
}
.backup-node-card__text-3 {
  font-size: 11px;
}
.backup-node-card__text {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.backup-node-card__code-block {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.backup-node-card__text-2 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.backup-node-card__text-3 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.backup-node-card__button-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.backup-node-card__text-pin-storage {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.backup-node-card__subtitle-local-backup {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.backup-node-card__subtitle-local-backup {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.backup-node-card__text-optional {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.backup-node-card__button {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.backup-node-card__button-3 {
  --tracking: var(--tracking-wider);
  letter-spacing: var(--tracking-wider);
}
.backup-node-card__check {
  color: var(--color-emerald-400);
}
.backup-node-card__subtitle-local-backup {
  color: var(--color-white);
}
.backup-node-card__button--selected {
  color: var(--color-white);
}
.backup-node-card__button--selected-2 {
  color: var(--color-white);
}
.backup-node-card__button-2 {
  color: var(--ui-zinc-300);
}
.backup-node-card__code-block {
  color: var(--ui-zinc-300);
}
.backup-node-card__block-5 {
  color: var(--ui-zinc-400);
}
.backup-node-card__code-p-3232 {
  color: var(--ui-zinc-400);
}
.backup-node-card__code {
  color: var(--ui-zinc-400);
}
.backup-node-card__text-optional {
  color: var(--ui-zinc-500);
}
.backup-node-card__text {
  color: var(--ui-zinc-500);
}
.backup-node-card__block-6 {
  color: var(--ui-zinc-500);
}
.backup-node-card__button--muted {
  color: var(--ui-zinc-500);
}
.backup-node-card__text-pin-storage {
  color: var(--ui-zinc-500);
}
.backup-node-card__button--muted-2 {
  color: var(--ui-zinc-500);
}
.backup-node-card__text-2 {
  color: var(--ui-zinc-500);
}
.backup-node-card__text-3 {
  color: var(--ui-zinc-500);
}
.backup-node-card__text-optional {
  text-transform: uppercase;
}
.backup-node-card__button {
  text-transform: uppercase;
}
.backup-node-card__button-3 {
  text-transform: uppercase;
}
.backup-node-card__block {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.backup-node-card__button-2 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.backup-node-card__button-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.backup-node-card__button {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.backup-node-card__button-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
[data-theme="light"] .backup-node-card__check {
  color: var(--app-success);
}
[data-theme="light"] .backup-node-card__button-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .backup-node-card__code-block {
  color: var(--app-text-soft);
}
[data-theme="light"] .backup-node-card__block-5 {
  color: var(--app-muted);
}
[data-theme="light"] .backup-node-card__code-p-3232 {
  color: var(--app-muted);
}
[data-theme="light"] .backup-node-card__code {
  color: var(--app-muted);
}
[data-theme="light"] .backup-node-card__text-optional {
  color: var(--app-muted);
}
[data-theme="light"] .backup-node-card__text {
  color: var(--app-muted);
}
[data-theme="light"] .backup-node-card__block-6 {
  color: var(--app-muted);
}
[data-theme="light"] .backup-node-card__button--muted {
  color: var(--app-muted);
}
[data-theme="light"] .backup-node-card__text-pin-storage {
  color: var(--app-muted);
}
[data-theme="light"] .backup-node-card__button--muted-2 {
  color: var(--app-muted);
}
[data-theme="light"] .backup-node-card__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .backup-node-card__text-3 {
  color: var(--app-muted);
}
[data-theme="light"] .backup-node-card__button--muted:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .backup-node-card__button--muted-2:hover {
  color: var(--app-text) !important;
}
}
}
</style>
