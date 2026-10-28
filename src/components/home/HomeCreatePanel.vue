<script setup>
import { computed } from "vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { KeyRound, Plus, X, Hash, ShieldCheck, Check, TriangleAlert, RotateCcw } from "@lucide/vue";

const props = defineProps({
  activePanel: { type: String, default: "" },
  dmPubkey: { type: String, default: "" },
  name: { type: String, default: "" },
  memberInput: { type: String, default: "" },
  members: { type: Array, default: () => [] },
  trustedContacts: { type: Array, default: () => [] },
  openingDm: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  resolution: { type: Object, default: null },
  resolving: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:dmPubkey",
  "update:name",
  "update:memberInput",
  "add-member",
  "remove-member",
  "toggle-trusted-member",
  "create-dm",
  "create-group",
  "open-resolution",
  "cancel-resolution",
  "retry-lookup",
]);

function isSelected(pubkey) {
  return props.members.some((m) => m.pubkey === pubkey);
}

const extraMembers = computed(() => {
  const trusted = new Set(props.trustedContacts.map((c) => c.pubkey));
  return props.members.filter((m) => !trusted.has(m.pubkey));
});

// --- Domain resolution card -------------------------------------------------

const statusPill = computed(() => {
  if (props.resolution?.pinStatus === "changed")
    return { text: "Key changed", class: "bg-red-500/10 text-(--app-danger)" };
  if (props.resolution?.pinStatus === "match")
    return { text: "Key match ✓", class: "bg-(--app-success-soft) text-(--app-success)" };
  return { text: "First contact", class: "bg-(--app-primary-soft) text-(--app-primary)" };
});

const openLabel = computed(() => {
  if (props.resolution?.pinStatus === "changed") return "Update pin & open chat";
  if (props.resolution?.pinStatus === "first") return "Pin & open chat";
  return "Open conversation";
});

const cacheAge = computed(() => {
  const res = props.resolution;
  if (!res?.cached || !Number.isFinite(res.ts)) return "";
  const mins = Math.max(1, Math.round((Date.now() - res.ts) / 60000));
  return mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;
});

function fp(hex) {
  if (!hex || hex.length < 20) return hex || "";
  return `${hex.slice(0, 10)}…${hex.slice(-6)}`;
}
</script>

<template>
  <form v-if="activePanel === 'dm'" class="space-y-5" @submit.prevent="emit('create-dm')">
    <div>
      <label class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-(--app-text)">
        <KeyRound class="h-4 w-4 text-(--app-muted)" aria-hidden="true" />
        Public key or domain
      </label>
      <input
        :value="dmPubkey"
        placeholder="example.com, or 64-char hex key"
        class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-sm leading-[1.5] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--app-primary)_50%,transparent),0_0_0_4px_color-mix(in_srgb,var(--app-primary)_12%,transparent)]"
        :class="dmPubkey.includes('.') ? '' : 'font-mono'"
        autocomplete="off"
        spellcheck="false"
        @input="emit('update:dmPubkey', $event.target.value)"
      />
      <p class="mt-2 text-xs leading-relaxed text-(--app-muted)">
        Paste a public key, or enter a domain to look up its
        <span class="font-mono text-(--app-text-soft)">gupt.</span> TXT record.
      </p>
    </div>

    <div
      v-if="resolution"
      class="space-y-3 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4"
      :class="
        resolution.pinStatus === 'changed' || resolution.stale ? 'border-(--app-warning)/40' : ''
      "
    >
      <div class="flex items-center gap-3">
        <RoboAvatar :pubkey="resolution.pubkey" size="md" rounded="xl" />
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2">
            <span class="truncate text-sm font-bold">{{ resolution.domain }}</span>
            <span
              class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold"
              :class="statusPill.class"
            >
              {{ statusPill.text }}
            </span>
          </div>
          <p class="truncate font-mono text-xs text-(--app-muted)" :title="resolution.pubkey">
            &rarr; {{ fp(resolution.pubkey) }}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap gap-1.5">
        <span
          v-if="resolution.dnssec"
          class="inline-flex items-center gap-1 rounded-full bg-(--app-success-soft) px-2 py-0.5 text-[10.5px] font-bold text-(--app-success)"
        >
          <ShieldCheck class="h-3 w-3" aria-hidden="true" /> DNSSEC signed
        </span>
        <span
          v-if="resolution.resolver"
          class="inline-flex items-center rounded-full bg-(--app-surface-hover) px-2 py-0.5 text-[10.5px] font-semibold text-(--app-muted)"
          :title="resolution.stale ? 'Resolvers unreachable — using expired cache' : null"
        >
          via {{ resolution.resolver }}{{ resolution.stale ? " · stale" : "" }}
        </span>
        <span
          v-if="resolution.relay"
          class="inline-flex max-w-full items-center truncate rounded-full bg-(--app-surface-hover) px-2 py-0.5 font-mono text-[10.5px] text-(--app-muted)"
          :title="resolution.relay"
        >
          relay {{ resolution.relay }}
        </span>
      </div>

      <div
        v-if="resolution.pinStatus === 'changed'"
        class="flex items-start gap-2 rounded-xl bg-red-500/10 px-3 py-2.5 text-xs leading-relaxed text-(--app-danger)"
      >
        <TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          This domain's key changed since your last chat.
          <span class="block font-mono"
            >old {{ fp(resolution.pinnedKey) }} → new {{ fp(resolution.pubkey) }}</span
          >
        </span>
      </div>
      <div
        v-else-if="resolution.pinStatus === 'first'"
        class="flex items-start gap-2 rounded-xl bg-(--app-primary-soft) px-3 py-2.5 text-xs leading-relaxed text-(--app-primary)"
      >
        <ShieldCheck class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>First contact — this key will be pinned to this device to catch future changes.</span>
      </div>
      <div
        v-if="resolution.stale"
        class="flex items-start gap-2 rounded-xl bg-[rgba(243,187,88,0.12)] px-3 py-2.5 text-xs leading-relaxed text-(--app-warning)"
      >
        <TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Every resolver is unreachable right now — this key came from your local cache{{
            cacheAge ? `, fetched ${cacheAge}` : ""
          }}.
        </span>
      </div>

      <div class="flex gap-2">
        <PrimaryButton
          class="flex-1"
          type="button"
          :loading="openingDm"
          @click="emit('open-resolution')"
        >
          {{ openLabel }}
        </PrimaryButton>
        <button
          type="button"
          @click="emit('cancel-resolution')"
          class="inline-flex shrink-0 items-center justify-center rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 text-sm font-semibold text-(--app-text-soft) transition-all hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) active:scale-95"
        >
          Cancel
        </button>
        <button
          v-if="resolution.stale"
          type="button"
          :disabled="resolving"
          @click="emit('retry-lookup')"
          class="inline-flex shrink-0 items-center justify-center rounded-2xl border border-(--app-warning)/40 bg-transparent px-3.5 text-sm font-semibold text-(--app-warning) transition-all hover:bg-[rgba(243,187,88,0.1)] active:scale-95 disabled:opacity-50"
        >
          <RotateCcw class="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Retry
        </button>
      </div>
    </div>

    <PrimaryButton v-else type="submit" :loading="openingDm">
      {{ openingDm ? "Opening…" : "Open conversation" }}
    </PrimaryButton>
  </form>

  <form
    v-else-if="activePanel === 'group'"
    class="space-y-5"
    @submit.prevent="emit('create-group')"
  >
    <div>
      <label class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-(--app-text)">
        <Hash class="h-4 w-4 text-(--app-muted)" aria-hidden="true" />
        Name
      </label>
      <input
        :value="name"
        placeholder="e.g. crew, family2024"
        class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-sm leading-[1.5] font-mono text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--app-primary)_50%,transparent),0_0_0_4px_color-mix(in_srgb,var(--app-primary)_12%,transparent)]"
        autocomplete="off"
        spellcheck="false"
        @input="emit('update:name', $event.target.value)"
      />
      <p class="mt-2 text-xs leading-relaxed text-(--app-muted)">
        Letters and numbers — this is the group id, and it stays the same when members join or
        leave.
      </p>
    </div>

    <div>
      <label class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-(--app-text)">
        <Plus class="h-4 w-4 text-(--app-muted)" aria-hidden="true" />
        Members
      </label>
      <div v-if="trustedContacts.length" class="mb-3 flex flex-wrap gap-2">
        <button
          v-for="c in trustedContacts"
          :key="c.pubkey"
          type="button"
          class="inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-all active:scale-95"
          :class="
            isSelected(c.pubkey)
              ? 'border-(--app-primary) bg-(--app-primary-soft) text-(--app-text)'
              : 'border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
          "
          :title="c.label"
          :aria-pressed="isSelected(c.pubkey)"
          @click="emit('toggle-trusted-member', c)"
        >
          <RoboAvatar :pubkey="c.pubkey" :src="c.picture" size="sm" rounded="xl" />
          <span class="min-w-0 truncate text-xs font-semibold">{{ c.label }}</span>
          <ShieldCheck class="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
          <Check
            v-if="isSelected(c.pubkey)"
            class="h-3.5 w-3.5 shrink-0 text-(--app-primary)"
            aria-hidden="true"
          />
        </button>
      </div>
      <div class="flex gap-2">
        <input
          :value="memberInput"
          placeholder="example.com or 64-char hex key"
          class="block min-w-0 flex-1 rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-[1.125rem] py-[0.875rem] text-sm leading-[1.5] font-mono text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--app-primary)_50%,transparent),0_0_0_4px_color-mix(in_srgb,var(--app-primary)_12%,transparent)]"
          autocomplete="off"
          spellcheck="false"
          @input="emit('update:memberInput', $event.target.value)"
          @keydown.enter.prevent="emit('add-member')"
        />
        <button
          type="button"
          @click="emit('add-member')"
          class="inline-flex shrink-0 items-center justify-center rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-3.5 text-sm font-semibold text-(--app-text-soft) transition-all hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) active:scale-95"
        >
          Add
        </button>
      </div>
      <ul v-if="extraMembers.length" class="mt-3 space-y-2">
        <li
          v-for="m in extraMembers"
          :key="m.pubkey"
          class="flex items-center justify-between gap-2 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2"
        >
          <span class="min-w-0 truncate font-mono text-xs text-(--app-text-soft)">
            {{ m.label || m.pubkey }}
          </span>
          <button
            type="button"
            @click="emit('remove-member', m.pubkey)"
            class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-(--app-muted) transition-all hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            :aria-label="'Remove ' + (m.label || m.pubkey)"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </li>
      </ul>
      <p class="mt-2 text-xs leading-relaxed text-(--app-muted)">
        Tap a trusted contact, or paste a public key or domain. They will see the group when you
        send the first message.
      </p>
    </div>

    <PrimaryButton type="submit" :loading="saving">
      {{ saving ? "Creating…" : "Create group" }}
    </PrimaryButton>
  </form>
</template>
