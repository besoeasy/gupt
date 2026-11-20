<script setup>
import { computed } from "vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { KeyRound, Plus, X, ShieldCheck, Check, TriangleAlert, RotateCcw } from "@lucide/vue";
import { GROUP_MAX_MEMBERS } from "@/lib/groupIdentity";

const props = defineProps({
  activePanel: { type: String, default: "" },
  dmPubkey: { type: String, default: "" },
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

const groupFull = computed(() => props.members.length >= GROUP_MAX_MEMBERS - 1);

// --- Domain resolution card -------------------------------------------------

const statusPill = computed(() => {
  if (props.resolution?.pinStatus === "changed")
    return { text: "Key changed", class: "home-create-panel__danger" };
  if (props.resolution?.pinStatus === "match")
    return { text: "Key match ✓", class: "home-create-panel__variant-2" };
  return { text: "First contact", class: "home-create-panel__variant-3" };
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
  <form v-if="activePanel === 'dm'" class="home-create-panel__form" @submit.prevent="emit('create-dm')">
    <div>
      <label class="home-create-panel__label">
        <KeyRound class="home-create-panel__key-round" aria-hidden="true" />
        Public key, domain, or match lobby code
      </label>
      <input
        :value="dmPubkey"
        placeholder="example.com, 64-char key, or match:lobby:..."
        class="home-create-panel__field-example-com"
        :class="dmPubkey.includes('.') && !dmPubkey.startsWith('match:lobby:') ? '' : 'home-create-panel__field-example-com--variant-1'"
        autocomplete="off"
        spellcheck="false"
        @input="emit('update:dmPubkey', $event.target.value)"
      />
      <p class="home-create-panel__text">
        Paste a public key, match lobby code, or enter a domain to look up its
        <span class="home-create-panel__text-gupt">gupt.</span> TXT record.
      </p>
    </div>

    <div
      v-if="resolution"
      class="home-create-panel__block"
      :class="
        resolution.pinStatus === 'changed' || resolution.stale ? 'home-create-panel__block--variant-1' : ''
      "
    >
      <div class="home-create-panel__block-2">
        <RoboAvatar :pubkey="resolution.pubkey" size="md" rounded="xl" />
        <div class="home-create-panel__block-3">
          <div class="home-create-panel__block-4">
            <span class="home-create-panel__text-2">{{ resolution.domain }}</span>
            <span
              class="home-create-panel__text-3"
              :class="statusPill.class"
            >
              {{ statusPill.text }}
            </span>
          </div>
          <p class="home-create-panel__text-4" :title="resolution.pubkey">
            &rarr; {{ fp(resolution.pubkey) }}
          </p>
        </div>
      </div>

      <div class="home-create-panel__block-5">
        <span
          v-if="resolution.dnssec"
          class="home-create-panel__text-dnssec-signed"
        >
          <ShieldCheck class="home-create-panel__shield-check" aria-hidden="true" /> DNSSEC signed
        </span>
        <span
          v-if="resolution.resolver"
          class="home-create-panel__text-via"
          :title="resolution.stale ? 'Resolvers unreachable — using expired cache' : null"
        >
          via {{ resolution.resolver }}{{ resolution.stale ? " · stale" : "" }}
        </span>
        <span
          v-if="resolution.relay"
          class="home-create-panel__text-relay"
          :title="resolution.relay"
        >
          relay {{ resolution.relay }}
        </span>
      </div>

      <div
        v-if="resolution.pinStatus === 'changed'"
        class="home-create-panel__block-6"
      >
        <TriangleAlert class="home-create-panel__triangle-alert" aria-hidden="true" />
        <span>
          This domain's key changed since your last chat.
          <span class="home-create-panel__text-5"
            >old {{ fp(resolution.pinnedKey) }} → new {{ fp(resolution.pubkey) }}</span
          >
        </span>
      </div>
      <div
        v-else-if="resolution.pinStatus === 'first'"
        class="home-create-panel__block-7"
      >
        <ShieldCheck class="home-create-panel__shield-check-2" aria-hidden="true" />
        <span>First contact — this key will be pinned to this device to catch future changes.</span>
      </div>
      <div
        v-if="resolution.stale"
        class="home-create-panel__block-8"
      >
        <TriangleAlert class="home-create-panel__triangle-alert-2" aria-hidden="true" />
        <span>
          Every resolver is unreachable right now — this key came from your local cache{{
            cacheAge ? `, fetched ${cacheAge}` : ""
          }}.
        </span>
      </div>

      <div class="home-create-panel__block-9">
        <PrimaryButton
          class="home-create-panel__primary-button"
          type="button"
          :loading="openingDm"
          @click="emit('open-resolution')"
        >
          {{ openLabel }}
        </PrimaryButton>
        <button
          type="button"
          @click="emit('cancel-resolution')"
          class="home-create-panel__button-cancel"
        >
          Cancel
        </button>
        <button
          v-if="resolution.stale"
          type="button"
          :disabled="resolving"
          @click="emit('retry-lookup')"
          class="home-create-panel__button-retry"
        >
          <RotateCcw class="home-create-panel__rotate-ccw" aria-hidden="true" />
          Retry
        </button>
      </div>
    </div>

    <div
      v-else-if="resolving"
      class="home-create-panel__status"
      role="status"
    >
      <span class="home-create-panel__text-6">Looking up this domain…</span>
      <div class="home-create-panel__block-10" aria-hidden="true">
        <AppSkeleton class="home-create-panel__app-skeleton" />
        <div class="home-create-panel__block-11">
          <AppSkeleton class="home-create-panel__app-skeleton-2" />
          <AppSkeleton class="home-create-panel__app-skeleton-3" />
        </div>
      </div>
      <div class="home-create-panel__block-12" aria-hidden="true">
        <AppSkeleton class="home-create-panel__app-skeleton-4" />
        <AppSkeleton class="home-create-panel__app-skeleton-5" />
      </div>
    </div>

    <PrimaryButton v-else type="submit" :loading="openingDm">
      {{ openingDm ? "Opening…" : "Open conversation" }}
    </PrimaryButton>
  </form>

  <form
    v-else-if="activePanel === 'group'"
    class="home-create-panel__form-2"
    @submit.prevent="emit('create-group')"
  >
    <div>
      <label class="home-create-panel__label-members">
        <Plus class="home-create-panel__plus" aria-hidden="true" />
        Members
        <span class="home-create-panel__text-7">
          {{ members.length + 1 }}/{{ GROUP_MAX_MEMBERS }} with you
        </span>
      </label>
      <div v-if="trustedContacts.length" class="home-create-panel__block-13">
        <button
          v-for="c in trustedContacts"
          :key="c.pubkey"
          type="button"
          class="home-create-panel__button"
          :class="
            isSelected(c.pubkey)
              ? 'home-create-panel__button--variant-1'
              : 'home-create-panel__button--variant-2'
          "
          :title="c.label"
          :aria-pressed="isSelected(c.pubkey)"
          @click="emit('toggle-trusted-member', c)"
        >
          <RoboAvatar :pubkey="c.pubkey" size="sm" rounded="xl" />
          <span class="home-create-panel__text-8">{{ c.label }}</span>
          <ShieldCheck class="home-create-panel__shield-check-3" aria-hidden="true" />
          <Check
            v-if="isSelected(c.pubkey)"
            class="home-create-panel__check"
            aria-hidden="true"
          />
        </button>
      </div>
      <div class="home-create-panel__block-14">
        <input
          :value="memberInput"
          :disabled="groupFull"
          placeholder="example.com, 64-char key, or match:lobby:..."
          class="home-create-panel__field-example-com-2"
          autocomplete="off"
          spellcheck="false"
          @input="emit('update:memberInput', $event.target.value)"
          @keydown.enter.prevent="emit('add-member')"
        />
        <button
          type="button"
          :disabled="groupFull"
          @click="emit('add-member')"
          class="home-create-panel__button-add"
        >
          Add
        </button>
      </div>
      <ul v-if="extraMembers.length" class="home-create-panel__list">
        <li
          v-for="m in extraMembers"
          :key="m.pubkey"
          class="home-create-panel__item"
        >
          <span class="home-create-panel__text-9">
            {{ m.label || m.pubkey }}
          </span>
          <button
            type="button"
            @click="emit('remove-member', m.pubkey)"
            class="home-create-panel__button-2"
            :aria-label="'Remove ' + (m.label || m.pubkey)"
          >
            <X class="home-create-panel__x" />
          </button>
        </li>
      </ul>
      <p class="home-create-panel__text-10">
        Tap a trusted contact, or paste a public key, domain, or match lobby code. Membership is fixed —
        to change members, create a new group. They will see the group when you send the first
        message.
      </p>
    </div>

    <PrimaryButton type="submit" :loading="saving">
      {{ saving ? "Creating…" : "Create group" }}
    </PrimaryButton>
  </form>
</template>

<style scoped>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.home-create-panel__block--variant-1 {
  border-color: color-mix(in oklab,var(--app-warning) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.home-create-panel__button-retry {
  border-color: color-mix(in oklab,var(--app-warning) 40%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.home-create-panel__block-6 {
  background-color: color-mix(in oklab,var(--color-red-500) 10%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.home-create-panel__danger {
  background-color: color-mix(in oklab,var(--color-red-500) 10%,transparent);
}
}

@media (hover:hover) {
.home-create-panel__button-cancel:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.home-create-panel__button--variant-2:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.home-create-panel__button-add:hover {
  border-color: var(--app-border-strong);
}
}

@media (hover:hover) {
.home-create-panel__button-cancel:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.home-create-panel__button--variant-2:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.home-create-panel__button-add:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.home-create-panel__button-2:hover {
  background-color: var(--app-surface-hover);
}
}

@media (hover:hover) {
.home-create-panel__button-retry:hover {
  background-color: #f3bb581a;
}
}

@media (hover:hover) {
.home-create-panel__button-cancel:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.home-create-panel__button--variant-2:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.home-create-panel__button-add:hover {
  color: var(--app-text);
}
}

@media (hover:hover) {
.home-create-panel__button-2:hover {
  color: var(--app-text);
}
}

@supports (color:color-mix(in lab,red,red)) {
.home-create-panel__field-example-com:focus {
  border-color: color-mix(in srgb,var(--app-primary) 62%,var(--app-border));
}
}

@supports (color:color-mix(in lab,red,red)) {
.home-create-panel__field-example-com-2:focus {
  border-color: color-mix(in srgb,var(--app-primary) 62%,var(--app-border));
}
}

@supports (color:color-mix(in lab,red,red)) {
.home-create-panel__field-example-com:focus {
  background-color: color-mix(in srgb,var(--app-surface-soft) 80%,var(--app-primary-soft));
}
}

@supports (color:color-mix(in lab,red,red)) {
.home-create-panel__field-example-com-2:focus {
  background-color: color-mix(in srgb,var(--app-surface-soft) 80%,var(--app-primary-soft));
}
}

@supports (color:color-mix(in lab,red,red)) {
.home-create-panel__field-example-com:focus {
  --shadow: 0 0 0 1px var(--shadow-color,color-mix(in srgb,var(--app-primary) 50%,transparent)), 0 0 0 4px var(--shadow-color,color-mix(in srgb,var(--app-primary) 12%,transparent));
}
}

@supports (color:color-mix(in lab,red,red)) {
.home-create-panel__field-example-com-2:focus {
  --shadow: 0 0 0 1px var(--shadow-color,color-mix(in srgb,var(--app-primary) 50%,transparent)), 0 0 0 4px var(--shadow-color,color-mix(in srgb,var(--app-primary) 12%,transparent));
}
}

@supports (color:color-mix(in lab,red,red)) {
.home-create-panel__field-example-com:focus-visible {
  --ring-color: color-mix(in srgb,var(--app-primary) 60%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.home-create-panel__field-example-com-2:focus-visible {
  --ring-color: color-mix(in srgb,var(--app-primary) 60%,transparent);
}
}

@layer gupt-components {
.home-create-panel__text-6 {
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  position: absolute;
  overflow: hidden;
}
.home-create-panel__triangle-alert {
  margin-top: calc(var(--spacing) * .5);
}
.home-create-panel__shield-check-2 {
  margin-top: calc(var(--spacing) * .5);
}
.home-create-panel__triangle-alert-2 {
  margin-top: calc(var(--spacing) * .5);
}
.home-create-panel__text {
  margin-top: calc(var(--spacing) * 2);
}
.home-create-panel__text-10 {
  margin-top: calc(var(--spacing) * 2);
}
.home-create-panel__list {
  margin-top: calc(var(--spacing) * 3);
}
.home-create-panel__rotate-ccw {
  margin-right: var(--spacing);
}
.home-create-panel__label {
  margin-bottom: calc(var(--spacing) * 1.5);
}
.home-create-panel__label-members {
  margin-bottom: calc(var(--spacing) * 1.5);
}
.home-create-panel__block-13 {
  margin-bottom: calc(var(--spacing) * 3);
}
.home-create-panel__text-7 {
  margin-left: auto;
}
.home-create-panel__field-example-com {
  display: block;
}
.home-create-panel__text-5 {
  display: block;
}
.home-create-panel__field-example-com-2 {
  display: block;
}
.home-create-panel__label {
  display: flex;
}
.home-create-panel__block-2 {
  display: flex;
}
.home-create-panel__block-4 {
  display: flex;
}
.home-create-panel__block-5 {
  display: flex;
}
.home-create-panel__block-6 {
  display: flex;
}
.home-create-panel__block-7 {
  display: flex;
}
.home-create-panel__block-8 {
  display: flex;
}
.home-create-panel__block-9 {
  display: flex;
}
.home-create-panel__block-10 {
  display: flex;
}
.home-create-panel__block-12 {
  display: flex;
}
.home-create-panel__label-members {
  display: flex;
}
.home-create-panel__block-13 {
  display: flex;
}
.home-create-panel__block-14 {
  display: flex;
}
.home-create-panel__item {
  display: flex;
}
.home-create-panel__text-3 {
  display: inline-flex;
}
.home-create-panel__text-dnssec-signed {
  display: inline-flex;
}
.home-create-panel__text-via {
  display: inline-flex;
}
.home-create-panel__text-relay {
  display: inline-flex;
}
.home-create-panel__button-cancel {
  display: inline-flex;
}
.home-create-panel__button-retry {
  display: inline-flex;
}
.home-create-panel__button {
  display: inline-flex;
}
.home-create-panel__button-add {
  display: inline-flex;
}
.home-create-panel__button-2 {
  display: inline-flex;
}
.home-create-panel__shield-check {
  height: calc(var(--spacing) * 3);
}
.home-create-panel__app-skeleton-3 {
  height: calc(var(--spacing) * 3);
}
.home-create-panel__triangle-alert {
  height: calc(var(--spacing) * 3.5);
}
.home-create-panel__shield-check-2 {
  height: calc(var(--spacing) * 3.5);
}
.home-create-panel__triangle-alert-2 {
  height: calc(var(--spacing) * 3.5);
}
.home-create-panel__rotate-ccw {
  height: calc(var(--spacing) * 3.5);
}
.home-create-panel__app-skeleton-2 {
  height: calc(var(--spacing) * 3.5);
}
.home-create-panel__shield-check-3 {
  height: calc(var(--spacing) * 3.5);
}
.home-create-panel__check {
  height: calc(var(--spacing) * 3.5);
}
.home-create-panel__x {
  height: calc(var(--spacing) * 3.5);
}
.home-create-panel__key-round {
  height: calc(var(--spacing) * 4);
}
.home-create-panel__plus {
  height: calc(var(--spacing) * 4);
}
.home-create-panel__app-skeleton-4 {
  height: calc(var(--spacing) * 5);
}
.home-create-panel__app-skeleton-5 {
  height: calc(var(--spacing) * 5);
}
.home-create-panel__button-2 {
  height: calc(var(--spacing) * 6);
}
.home-create-panel__app-skeleton {
  height: calc(var(--spacing) * 10);
}
.home-create-panel__button {
  min-height: calc(var(--spacing) * 11);
}
.home-create-panel__shield-check {
  width: calc(var(--spacing) * 3);
}
.home-create-panel__triangle-alert {
  width: calc(var(--spacing) * 3.5);
}
.home-create-panel__shield-check-2 {
  width: calc(var(--spacing) * 3.5);
}
.home-create-panel__triangle-alert-2 {
  width: calc(var(--spacing) * 3.5);
}
.home-create-panel__rotate-ccw {
  width: calc(var(--spacing) * 3.5);
}
.home-create-panel__shield-check-3 {
  width: calc(var(--spacing) * 3.5);
}
.home-create-panel__check {
  width: calc(var(--spacing) * 3.5);
}
.home-create-panel__x {
  width: calc(var(--spacing) * 3.5);
}
.home-create-panel__key-round {
  width: calc(var(--spacing) * 4);
}
.home-create-panel__plus {
  width: calc(var(--spacing) * 4);
}
.home-create-panel__button-2 {
  width: calc(var(--spacing) * 6);
}
.home-create-panel__app-skeleton {
  width: calc(var(--spacing) * 10);
}
.home-create-panel__app-skeleton-5 {
  width: calc(var(--spacing) * 20);
}
.home-create-panel__app-skeleton-4 {
  width: calc(var(--spacing) * 24);
}
.home-create-panel__app-skeleton-2 {
  width: calc(var(--spacing) * 36);
}
.home-create-panel__app-skeleton-3 {
  width: calc(var(--spacing) * 48);
}
.home-create-panel__field-example-com {
  width: 100%;
}
.home-create-panel__text-relay {
  max-width: 100%;
}
.home-create-panel__app-skeleton-2 {
  max-width: 100%;
}
.home-create-panel__app-skeleton-3 {
  max-width: 100%;
}
.home-create-panel__button {
  max-width: 100%;
}
.home-create-panel__block-3 {
  min-width: 0;
}
.home-create-panel__block-4 {
  min-width: 0;
}
.home-create-panel__block-11 {
  min-width: 0;
}
.home-create-panel__text-8 {
  min-width: 0;
}
.home-create-panel__field-example-com-2 {
  min-width: 0;
}
.home-create-panel__text-9 {
  min-width: 0;
}
.home-create-panel__block-3 {
  flex: 1;
}
.home-create-panel__primary-button {
  flex: 1;
}
.home-create-panel__block-11 {
  flex: 1;
}
.home-create-panel__field-example-com-2 {
  flex: 1;
}
.home-create-panel__text-3 {
  flex-shrink: 0;
}
.home-create-panel__triangle-alert {
  flex-shrink: 0;
}
.home-create-panel__shield-check-2 {
  flex-shrink: 0;
}
.home-create-panel__triangle-alert-2 {
  flex-shrink: 0;
}
.home-create-panel__button-cancel {
  flex-shrink: 0;
}
.home-create-panel__button-retry {
  flex-shrink: 0;
}
.home-create-panel__app-skeleton {
  flex-shrink: 0;
}
.home-create-panel__shield-check-3 {
  flex-shrink: 0;
}
.home-create-panel__check {
  flex-shrink: 0;
}
.home-create-panel__button-add {
  flex-shrink: 0;
}
.home-create-panel__button-2 {
  flex-shrink: 0;
}
.home-create-panel__block-5 {
  flex-wrap: wrap;
}
.home-create-panel__block-13 {
  flex-wrap: wrap;
}
.home-create-panel__label {
  align-items: center;
}
.home-create-panel__block-2 {
  align-items: center;
}
.home-create-panel__block-4 {
  align-items: center;
}
.home-create-panel__text-3 {
  align-items: center;
}
.home-create-panel__text-dnssec-signed {
  align-items: center;
}
.home-create-panel__text-via {
  align-items: center;
}
.home-create-panel__text-relay {
  align-items: center;
}
.home-create-panel__button-cancel {
  align-items: center;
}
.home-create-panel__button-retry {
  align-items: center;
}
.home-create-panel__block-10 {
  align-items: center;
}
.home-create-panel__label-members {
  align-items: center;
}
.home-create-panel__button {
  align-items: center;
}
.home-create-panel__button-add {
  align-items: center;
}
.home-create-panel__item {
  align-items: center;
}
.home-create-panel__button-2 {
  align-items: center;
}
.home-create-panel__block-6 {
  align-items: flex-start;
}
.home-create-panel__block-7 {
  align-items: flex-start;
}
.home-create-panel__block-8 {
  align-items: flex-start;
}
.home-create-panel__item {
  justify-content: space-between;
}
.home-create-panel__button-cancel {
  justify-content: center;
}
.home-create-panel__button-retry {
  justify-content: center;
}
.home-create-panel__button-add {
  justify-content: center;
}
.home-create-panel__button-2 {
  justify-content: center;
}
.home-create-panel__text-dnssec-signed {
  gap: var(--spacing);
}
.home-create-panel__label {
  gap: calc(var(--spacing) * 1.5);
}
.home-create-panel__block-5 {
  gap: calc(var(--spacing) * 1.5);
}
.home-create-panel__block-12 {
  gap: calc(var(--spacing) * 1.5);
}
.home-create-panel__label-members {
  gap: calc(var(--spacing) * 1.5);
}
.home-create-panel__block-4 {
  gap: calc(var(--spacing) * 2);
}
.home-create-panel__block-6 {
  gap: calc(var(--spacing) * 2);
}
.home-create-panel__block-7 {
  gap: calc(var(--spacing) * 2);
}
.home-create-panel__block-8 {
  gap: calc(var(--spacing) * 2);
}
.home-create-panel__block-9 {
  gap: calc(var(--spacing) * 2);
}
.home-create-panel__block-13 {
  gap: calc(var(--spacing) * 2);
}
.home-create-panel__button {
  gap: calc(var(--spacing) * 2);
}
.home-create-panel__block-14 {
  gap: calc(var(--spacing) * 2);
}
.home-create-panel__item {
  gap: calc(var(--spacing) * 2);
}
.home-create-panel__block-2 {
  gap: calc(var(--spacing) * 3);
}
.home-create-panel__block-10 {
  gap: calc(var(--spacing) * 3);
}
:where(.home-create-panel__block-11>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.home-create-panel__list>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.home-create-panel__block>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.home-create-panel__status>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.home-create-panel__form>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
:where(.home-create-panel__form-2>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
.home-create-panel__text-2 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.home-create-panel__text-4 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.home-create-panel__text-relay {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.home-create-panel__text-8 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.home-create-panel__text-9 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.home-create-panel__block {
  border-radius: var(--radius-2xl);
}
.home-create-panel__button-cancel {
  border-radius: var(--radius-2xl);
}
.home-create-panel__button-retry {
  border-radius: var(--radius-2xl);
}
.home-create-panel__status {
  border-radius: var(--radius-2xl);
}
.home-create-panel__field-example-com {
  border-radius: 14px;
}
.home-create-panel__field-example-com-2 {
  border-radius: 14px;
}
.home-create-panel__button-add {
  border-radius: 14px;
}
.home-create-panel__text-3 {
  border-radius: 3.40282e38px;
}
.home-create-panel__text-dnssec-signed {
  border-radius: 3.40282e38px;
}
.home-create-panel__text-via {
  border-radius: 3.40282e38px;
}
.home-create-panel__text-relay {
  border-radius: 3.40282e38px;
}
.home-create-panel__app-skeleton-4 {
  border-radius: 3.40282e38px;
}
.home-create-panel__app-skeleton-5 {
  border-radius: 3.40282e38px;
}
.home-create-panel__button-2 {
  border-radius: var(--radius-lg);
}
.home-create-panel__block-6 {
  border-radius: var(--radius-xl);
}
.home-create-panel__block-7 {
  border-radius: var(--radius-xl);
}
.home-create-panel__block-8 {
  border-radius: var(--radius-xl);
}
.home-create-panel__app-skeleton {
  border-radius: var(--radius-xl);
}
.home-create-panel__button {
  border-radius: var(--radius-xl);
}
.home-create-panel__item {
  border-radius: var(--radius-xl);
}
.home-create-panel__field-example-com {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.home-create-panel__block {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.home-create-panel__button-cancel {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.home-create-panel__button-retry {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.home-create-panel__status {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.home-create-panel__button {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.home-create-panel__field-example-com-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.home-create-panel__button-add {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.home-create-panel__item {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.home-create-panel__field-example-com {
  border-color: var(--app-border);
}
.home-create-panel__block {
  border-color: var(--app-border);
}
.home-create-panel__button-cancel {
  border-color: var(--app-border);
}
.home-create-panel__status {
  border-color: var(--app-border);
}
.home-create-panel__button--variant-2 {
  border-color: var(--app-border);
}
.home-create-panel__field-example-com-2 {
  border-color: var(--app-border);
}
.home-create-panel__button-add {
  border-color: var(--app-border);
}
.home-create-panel__item {
  border-color: var(--app-border);
}
.home-create-panel__button--variant-1 {
  border-color: var(--app-primary);
}
.home-create-panel__block--variant-1 {
  border-color: var(--app-warning);
}
.home-create-panel__button-retry {
  border-color: var(--app-warning);
}
.home-create-panel__block-7 {
  background-color: var(--app-primary-soft);
}
.home-create-panel__button--variant-1 {
  background-color: var(--app-primary-soft);
}
.home-create-panel__variant-3 {
  background-color: var(--app-primary-soft);
}
.home-create-panel__text-dnssec-signed {
  background-color: var(--app-success-soft);
}
.home-create-panel__variant-2 {
  background-color: var(--app-success-soft);
}
.home-create-panel__text-via {
  background-color: var(--app-surface-hover);
}
.home-create-panel__text-relay {
  background-color: var(--app-surface-hover);
}
.home-create-panel__field-example-com {
  background-color: var(--app-surface-soft);
}
.home-create-panel__block {
  background-color: var(--app-surface-soft);
}
.home-create-panel__button-cancel {
  background-color: var(--app-surface-soft);
}
.home-create-panel__status {
  background-color: var(--app-surface-soft);
}
.home-create-panel__button--variant-2 {
  background-color: var(--app-surface-soft);
}
.home-create-panel__field-example-com-2 {
  background-color: var(--app-surface-soft);
}
.home-create-panel__button-add {
  background-color: var(--app-surface-soft);
}
.home-create-panel__item {
  background-color: var(--app-surface-soft);
}
.home-create-panel__block-8 {
  background-color: #f3bb581f;
}
.home-create-panel__block-6 {
  background-color: #fb2c361a;
}
.home-create-panel__danger {
  background-color: #fb2c361a;
}
.home-create-panel__button-retry {
  background-color: #0000;
}
.home-create-panel__block {
  padding: calc(var(--spacing) * 4);
}
.home-create-panel__status {
  padding: calc(var(--spacing) * 4);
}
.home-create-panel__text-3 {
  padding-inline: calc(var(--spacing) * 2);
}
.home-create-panel__text-dnssec-signed {
  padding-inline: calc(var(--spacing) * 2);
}
.home-create-panel__text-via {
  padding-inline: calc(var(--spacing) * 2);
}
.home-create-panel__text-relay {
  padding-inline: calc(var(--spacing) * 2);
}
.home-create-panel__button {
  padding-inline: calc(var(--spacing) * 2.5);
}
.home-create-panel__block-6 {
  padding-inline: calc(var(--spacing) * 3);
}
.home-create-panel__block-7 {
  padding-inline: calc(var(--spacing) * 3);
}
.home-create-panel__block-8 {
  padding-inline: calc(var(--spacing) * 3);
}
.home-create-panel__item {
  padding-inline: calc(var(--spacing) * 3);
}
.home-create-panel__button-cancel {
  padding-inline: calc(var(--spacing) * 3.5);
}
.home-create-panel__button-retry {
  padding-inline: calc(var(--spacing) * 3.5);
}
.home-create-panel__button-add {
  padding-inline: calc(var(--spacing) * 3.5);
}
.home-create-panel__field-example-com {
  padding-inline: 1.125rem;
}
.home-create-panel__field-example-com-2 {
  padding-inline: 1.125rem;
}
.home-create-panel__text-3 {
  padding-block: calc(var(--spacing) * .5);
}
.home-create-panel__text-dnssec-signed {
  padding-block: calc(var(--spacing) * .5);
}
.home-create-panel__text-via {
  padding-block: calc(var(--spacing) * .5);
}
.home-create-panel__text-relay {
  padding-block: calc(var(--spacing) * .5);
}
.home-create-panel__button {
  padding-block: calc(var(--spacing) * 1.5);
}
.home-create-panel__item {
  padding-block: calc(var(--spacing) * 2);
}
.home-create-panel__block-6 {
  padding-block: calc(var(--spacing) * 2.5);
}
.home-create-panel__block-7 {
  padding-block: calc(var(--spacing) * 2.5);
}
.home-create-panel__block-8 {
  padding-block: calc(var(--spacing) * 2.5);
}
.home-create-panel__field-example-com {
  padding-block: .875rem;
}
.home-create-panel__field-example-com-2 {
  padding-block: .875rem;
}
.home-create-panel__button {
  text-align: left;
}
.home-create-panel__field-example-com--variant-1 {
  font-family: var(--font-mono);
}
.home-create-panel__text-gupt {
  font-family: var(--font-mono);
}
.home-create-panel__text-4 {
  font-family: var(--font-mono);
}
.home-create-panel__text-relay {
  font-family: var(--font-mono);
}
.home-create-panel__text-5 {
  font-family: var(--font-mono);
}
.home-create-panel__text-7 {
  font-family: var(--font-mono);
}
.home-create-panel__field-example-com-2 {
  font-family: var(--font-mono);
}
.home-create-panel__text-9 {
  font-family: var(--font-mono);
}
.home-create-panel__label {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.home-create-panel__field-example-com {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.home-create-panel__text-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.home-create-panel__button-cancel {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.home-create-panel__button-retry {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.home-create-panel__label-members {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.home-create-panel__field-example-com-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.home-create-panel__button-add {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.home-create-panel__text {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.home-create-panel__text-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.home-create-panel__block-6 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.home-create-panel__block-7 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.home-create-panel__block-8 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.home-create-panel__text-8 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.home-create-panel__text-9 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.home-create-panel__text-10 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.home-create-panel__text-3 {
  font-size: 10.5px;
}
.home-create-panel__text-dnssec-signed {
  font-size: 10.5px;
}
.home-create-panel__text-via {
  font-size: 10.5px;
}
.home-create-panel__text-relay {
  font-size: 10.5px;
}
.home-create-panel__text-7 {
  font-size: 11px;
}
.home-create-panel__field-example-com {
  --leading: 1.5;
  line-height: 1.5;
}
.home-create-panel__field-example-com-2 {
  --leading: 1.5;
  line-height: 1.5;
}
.home-create-panel__text {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.home-create-panel__block-6 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.home-create-panel__block-7 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.home-create-panel__block-8 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.home-create-panel__text-10 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.home-create-panel__text-2 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.home-create-panel__text-3 {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.home-create-panel__text-dnssec-signed {
  --font-weight: var(--font-weight-bold);
  font-weight: var(--font-weight-bold);
}
.home-create-panel__label {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.home-create-panel__label-members {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.home-create-panel__text-7 {
  --font-weight: var(--font-weight-normal);
  font-weight: var(--font-weight-normal);
}
.home-create-panel__text-via {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.home-create-panel__button-cancel {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.home-create-panel__button-retry {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.home-create-panel__text-8 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.home-create-panel__button-add {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.home-create-panel__block-6 {
  color: var(--app-danger);
}
.home-create-panel__danger {
  color: var(--app-danger);
}
.home-create-panel__key-round {
  color: var(--app-muted);
}
.home-create-panel__text {
  color: var(--app-muted);
}
.home-create-panel__text-4 {
  color: var(--app-muted);
}
.home-create-panel__text-via {
  color: var(--app-muted);
}
.home-create-panel__text-relay {
  color: var(--app-muted);
}
.home-create-panel__plus {
  color: var(--app-muted);
}
.home-create-panel__text-7 {
  color: var(--app-muted);
}
.home-create-panel__button-2 {
  color: var(--app-muted);
}
.home-create-panel__text-10 {
  color: var(--app-muted);
}
.home-create-panel__block-7 {
  color: var(--app-primary);
}
.home-create-panel__check {
  color: var(--app-primary);
}
.home-create-panel__variant-3 {
  color: var(--app-primary);
}
.home-create-panel__text-dnssec-signed {
  color: var(--app-success);
}
.home-create-panel__variant-2 {
  color: var(--app-success);
}
.home-create-panel__label {
  color: var(--app-text);
}
.home-create-panel__field-example-com {
  color: var(--app-text);
}
.home-create-panel__label-members {
  color: var(--app-text);
}
.home-create-panel__button--variant-1 {
  color: var(--app-text);
}
.home-create-panel__field-example-com-2 {
  color: var(--app-text);
}
.home-create-panel__text-gupt {
  color: var(--app-text-soft);
}
.home-create-panel__button-cancel {
  color: var(--app-text-soft);
}
.home-create-panel__button--variant-2 {
  color: var(--app-text-soft);
}
.home-create-panel__button-add {
  color: var(--app-text-soft);
}
.home-create-panel__text-9 {
  color: var(--app-text-soft);
}
.home-create-panel__block-8 {
  color: var(--app-warning);
}
.home-create-panel__button-retry {
  color: var(--app-warning);
}
.home-create-panel__shield-check-3 {
  color: var(--color-emerald-400);
}
.home-create-panel__field-example-com {
  --shadow: inset 0 2px 8px var(--shadow-color,#0000000a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), inset 0 2px 8px var(--shadow-color,#0000000a);
}
.home-create-panel__field-example-com-2 {
  --shadow: inset 0 2px 8px var(--shadow-color,#0000000a);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), inset 0 2px 8px var(--shadow-color,#0000000a);
}
.home-create-panel__field-example-com {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.home-create-panel__button-cancel {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.home-create-panel__button-retry {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.home-create-panel__button {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.home-create-panel__field-example-com-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.home-create-panel__button-add {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.home-create-panel__button-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.home-create-panel__field-example-com {
  --duration: .2s;
  transition-duration: .2s;
}
.home-create-panel__field-example-com-2 {
  --duration: .2s;
  transition-duration: .2s;
}
.home-create-panel__field-example-com::placeholder {
  color: var(--app-muted-2);
}
.home-create-panel__field-example-com-2::placeholder {
  color: var(--app-muted-2);
}
.home-create-panel__field-example-com:focus {
  border-color: var(--app-primary);
}
.home-create-panel__field-example-com-2:focus {
  border-color: var(--app-primary);
}
.home-create-panel__field-example-com:focus {
  background-color: var(--app-surface-soft);
}
.home-create-panel__field-example-com-2:focus {
  background-color: var(--app-surface-soft);
}
.home-create-panel__field-example-com:focus {
  --shadow: 0 0 0 1px var(--shadow-color,var(--app-primary)), 0 0 0 4px var(--shadow-color,var(--app-primary));
}
.home-create-panel__field-example-com-2:focus {
  --shadow: 0 0 0 1px var(--shadow-color,var(--app-primary)), 0 0 0 4px var(--shadow-color,var(--app-primary));
}
.home-create-panel__field-example-com:focus {
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), var(--shadow,0 0 #0000);
}
.home-create-panel__field-example-com-2:focus {
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), var(--shadow,0 0 #0000);
}
.home-create-panel__field-example-com:focus {
  --outline-style: none;
  outline-style: none;
}
.home-create-panel__field-example-com-2:focus {
  --outline-style: none;
  outline-style: none;
}
.home-create-panel__field-example-com:focus-visible {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.home-create-panel__field-example-com-2:focus-visible {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(2px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.home-create-panel__field-example-com:focus-visible {
  --ring-color: var(--app-primary);
}
.home-create-panel__field-example-com-2:focus-visible {
  --ring-color: var(--app-primary);
}
.home-create-panel__button-cancel:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.home-create-panel__button-retry:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.home-create-panel__button:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.home-create-panel__button-add:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.home-create-panel__button-add:disabled {
  cursor: not-allowed;
}
.home-create-panel__button-retry:disabled {
  opacity: .5;
}
.home-create-panel__field-example-com-2:disabled {
  opacity: .5;
}
.home-create-panel__button-add:disabled {
  opacity: .5;
}
[data-theme="light"] .home-create-panel__shield-check-3 {
  color: var(--app-success);
}
}
}
</style>
