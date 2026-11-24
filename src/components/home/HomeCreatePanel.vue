<script setup>
import { computed } from "vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { KeyRound, Plus, QrCode, X, ShieldCheck, Check, TriangleAlert, RotateCcw } from "@/icons";
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
  "scan-qr",
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
    return { text: "Key changed", class: "home-create-panel__tone-danger" };
  if (props.resolution?.pinStatus === "match")
    return { text: "Key match ✓", class: "home-create-panel__tone-success" };
  return { text: "First contact", class: "home-create-panel__tone-primary" };
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
      <div class="home-create-panel__field-row">
        <input
          :value="dmPubkey"
          placeholder="example.com, 64-char key, or match:lobby:..."
          class="home-create-panel__input"
          :class="dmPubkey.includes('.') && !dmPubkey.startsWith('match:lobby:') ? '' : 'home-create-panel__input--mono'"
          autocomplete="off"
          spellcheck="false"
          @input="emit('update:dmPubkey', $event.target.value)"
        />
        <button
          type="button"
          class="home-create-panel__scan"
          title="Scan a QR code"
          aria-label="Scan a QR code"
          @click="emit('scan-qr')"
        >
          <QrCode class="home-create-panel__scan-icon" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
      <p class="home-create-panel__dm-hint">
        Paste a public key, match lobby code, or enter a domain to look up its
        <span class="home-create-panel__text-gupt">gupt.</span> TXT record.
      </p>
    </div>

    <div
      v-if="resolution"
      class="home-create-panel__result"
      :class="
        resolution.pinStatus === 'changed' || resolution.stale ? 'home-create-panel__result--warning' : ''
      "
    >
      <div class="home-create-panel__result-head">
        <RoboAvatar :pubkey="resolution.pubkey" size="md" rounded="xl" />
        <div class="home-create-panel__result-body">
          <div class="home-create-panel__result-name">
            <span class="home-create-panel__result-domain">{{ resolution.domain }}</span>
            <span
              class="home-create-panel__result-badge"
              :class="statusPill.class"
            >
              {{ statusPill.text }}
            </span>
          </div>
          <p class="home-create-panel__result-key" :title="resolution.pubkey">
            &rarr; {{ fp(resolution.pubkey) }}
          </p>
        </div>
      </div>

      <div class="home-create-panel__result-badges">
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
        class="home-create-panel__result-danger"
      >
        <TriangleAlert class="home-create-panel__triangle-alert" aria-hidden="true" />
        <span>
          This domain's key changed since your last chat.
          <span class="home-create-panel__result-warning-text"
            >old {{ fp(resolution.pinnedKey) }} → new {{ fp(resolution.pubkey) }}</span
          >
        </span>
      </div>
      <div
        v-else-if="resolution.pinStatus === 'first'"
        class="home-create-panel__result-primary"
      >
        <ShieldCheck class="home-create-panel__shield-check-2" aria-hidden="true" />
        <span>First contact — this key will be pinned to this device to catch future changes.</span>
      </div>
      <div
        v-if="resolution.stale"
        class="home-create-panel__result-warning-box"
      >
        <TriangleAlert class="home-create-panel__triangle-alert-2" aria-hidden="true" />
        <span>
          Every resolver is unreachable right now — this key came from your local cache{{
            cacheAge ? `, fetched ${cacheAge}` : ""
          }}.
        </span>
      </div>

      <div class="home-create-panel__result-actions">
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
      class="home-create-panel__loading"
      role="status"
    >
      <span class="home-create-panel__visually-hidden">Looking up this domain…</span>
      <div class="home-create-panel__skeleton-head" aria-hidden="true">
        <AppSkeleton class="home-create-panel__skeleton-avatar" />
        <div class="home-create-panel__skeleton-body">
          <AppSkeleton class="home-create-panel__skeleton-name" />
          <AppSkeleton class="home-create-panel__skeleton-key" />
        </div>
      </div>
      <div class="home-create-panel__skeleton-badges" aria-hidden="true">
        <AppSkeleton class="home-create-panel__skeleton-badge--wide" />
        <AppSkeleton class="home-create-panel__skeleton-badge" />
      </div>
    </div>

    <PrimaryButton v-else type="submit" :loading="openingDm">
      {{ openingDm ? "Opening…" : "Open conversation" }}
    </PrimaryButton>
  </form>

  <form
    v-else-if="activePanel === 'group'"
    class="home-create-panel__member-form"
    @submit.prevent="emit('create-group')"
  >
    <div>
      <label class="home-create-panel__label-members">
        <Plus class="home-create-panel__plus" aria-hidden="true" />
        Members
        <span class="home-create-panel__members-count">
          {{ members.length + 1 }}/{{ GROUP_MAX_MEMBERS }} with you
        </span>
      </label>
      <div v-if="trustedContacts.length" class="home-create-panel__contacts">
        <button
          v-for="c in trustedContacts"
          :key="c.pubkey"
          type="button"
          class="home-create-panel__contact"
          :class="
            isSelected(c.pubkey)
              ? 'home-create-panel__contact--selected'
              : 'home-create-panel__contact--idle'
          "
          :title="c.label"
          :aria-pressed="isSelected(c.pubkey)"
          @click="emit('toggle-trusted-member', c)"
        >
          <RoboAvatar :pubkey="c.pubkey" size="sm" rounded="xl" />
          <span class="home-create-panel__contact-label">{{ c.label }}</span>
          <ShieldCheck class="home-create-panel__shield-check-3" aria-hidden="true" />
          <Check
            v-if="isSelected(c.pubkey)"
            class="home-create-panel__check"
            aria-hidden="true"
          />
        </button>
      </div>
      <div class="home-create-panel__member-row">
        <input
          :value="memberInput"
          :disabled="groupFull"
          placeholder="example.com, 64-char key, or match:lobby:..."
          class="home-create-panel__member-input"
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
          <span class="home-create-panel__member-label">
            {{ m.label || m.pubkey }}
          </span>
          <button
            type="button"
            @click="emit('remove-member', m.pubkey)"
            class="home-create-panel__remove"
            :aria-label="'Remove ' + (m.label || m.pubkey)"
          >
            <X class="home-create-panel__x" />
          </button>
        </li>
      </ul>
      <p class="home-create-panel__group-hint">
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
@media (hover: hover) {
  .home-create-panel__button-cancel:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-hover);
    color: var(--app-text);
  }
  .home-create-panel__contact--idle:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-hover);
    color: var(--app-text);
  }
  .home-create-panel__button-add:hover {
    border-color: var(--app-border-strong);
    background-color: var(--app-surface-hover);
    color: var(--app-text);
  }
  .home-create-panel__remove:hover {
    background-color: var(--app-surface-hover);
    color: var(--app-text);
  }
  .home-create-panel__button-retry:hover {
    background-color: color-mix(in oklab, var(--app-warning) 10%, transparent);
  }
}
.home-create-panel__visually-hidden {
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
  margin-top: 0.125rem;
  height: 0.875rem;
  width: 0.875rem;
  flex-shrink: 0;
}
.home-create-panel__shield-check-2 {
  margin-top: 0.125rem;
  height: 0.875rem;
  width: 0.875rem;
  flex-shrink: 0;
}
.home-create-panel__triangle-alert-2 {
  margin-top: 0.125rem;
  height: 0.875rem;
  width: 0.875rem;
  flex-shrink: 0;
}
.home-create-panel__dm-hint {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  line-height: 1.625;
  color: var(--app-muted);
}
.home-create-panel__group-hint {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  line-height: 1.625;
  color: var(--app-muted);
}
.home-create-panel__list {
  margin-top: 0.75rem;
}
.home-create-panel__rotate-ccw {
  margin-right: 0.25rem;
  height: 0.875rem;
  width: 0.875rem;
}
.home-create-panel__label {
  margin-bottom: 0.375rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 10.5px;
  line-height: 1.5;
  font-weight: 500;
  font-family: var(--font-mono);
  color: var(--app-muted);
}
.home-create-panel__label-members {
  margin-bottom: 0.375rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--app-text);
}
.home-create-panel__contacts {
  margin-bottom: 0.75rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.home-create-panel__members-count {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 400;
  color: var(--app-muted);
}
.home-create-panel__input {
  display: block;
  width: 100%;
  border-radius: var(--app-radius-md);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border);
  background-color: var(--app-surface-soft);
  padding-inline: 1rem;
  padding-block: 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--app-text);
  box-shadow: none;
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .2s;
}
.home-create-panel__result-warning-text {
  display: block;
  font-family: var(--font-mono);
}
.home-create-panel__member-input {
  display: block;
  min-width: 0;
  flex: 1;
  border-radius: 14px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border);
  background-color: var(--app-surface-soft);
  padding-inline: 1.125rem;
  padding-block: .875rem;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--app-text);
  box-shadow: inset 0 2px 8px color-mix(in oklab, var(--app-text) 6%, transparent);
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: .2s;
}
.home-create-panel__result-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.home-create-panel__result-name {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
}
.home-create-panel__result-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.home-create-panel__result-danger {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  border-radius: 18px;
  background-color: var(--app-danger-soft);
  padding-inline: 0.75rem;
  padding-block: 0.625rem;
  font-size: 0.75rem;
  line-height: 1.625;
  color: var(--app-danger);
}
.home-create-panel__result-primary {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  border-radius: 18px;
  background-color: var(--app-primary-soft);
  padding-inline: 0.75rem;
  padding-block: 0.625rem;
  font-size: 0.75rem;
  line-height: 1.625;
  color: var(--app-primary);
}
.home-create-panel__result-warning-box {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  border-radius: 18px;
  background-color: color-mix(in oklab, var(--app-warning) 12%, transparent);
  padding-inline: 0.75rem;
  padding-block: 0.625rem;
  font-size: 0.75rem;
  line-height: 1.625;
  color: var(--app-warning);
}
.home-create-panel__result-actions {
  display: flex;
  gap: 0.5rem;
}
.home-create-panel__skeleton-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.home-create-panel__skeleton-badges {
  display: flex;
  gap: 0.375rem;
}
.home-create-panel__member-row {
  display: flex;
  gap: 0.5rem;
}
.home-create-panel__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border);
  background-color: var(--app-surface-soft);
  padding-inline: 0.75rem;
  padding-block: 0.5rem;
}
.home-create-panel__result-badge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  border-radius: 9999px;
  padding-inline: 0.5rem;
  padding-block: 0.125rem;
  font-size: 10.5px;
  font-weight: 700;
}
.home-create-panel__text-dnssec-signed {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 9999px;
  background-color: var(--app-success-soft);
  padding-inline: 0.5rem;
  padding-block: 0.125rem;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--app-success);
}
.home-create-panel__text-via {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  background-color: var(--app-surface-hover);
  padding-inline: 0.5rem;
  padding-block: 0.125rem;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--app-muted);
}
.home-create-panel__text-relay {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  border-radius: 9999px;
  background-color: var(--app-surface-hover);
  padding-inline: 0.5rem;
  padding-block: 0.125rem;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--app-muted);
}
.home-create-panel__button-cancel {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-md);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border);
  background-color: var(--app-surface-soft);
  padding-inline: 0.875rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  font-weight: 600;
  color: var(--app-text-soft);
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.home-create-panel__button-retry {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-md);
  border-style: solid;
  border-width: 1px;
  background-color: transparent;
  padding-inline: 0.875rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  font-weight: 600;
  color: var(--app-warning);
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
  border-color: color-mix(in oklab,var(--app-warning) 40%,transparent);
}
.home-create-panel__contact {
  display: inline-flex;
  min-height: 2.75rem;
  max-width: 100%;
  align-items: center;
  gap: 0.5rem;
  border-radius: 18px;
  border-style: solid;
  border-width: 1px;
  padding-inline: 0.625rem;
  padding-block: 0.375rem;
  text-align: left;
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.home-create-panel__button-add {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border);
  background-color: var(--app-surface-soft);
  padding-inline: 0.875rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  font-weight: 600;
  color: var(--app-text-soft);
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.home-create-panel__remove {
  display: inline-flex;
  height: 1.5rem;
  width: 1.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-lg);
  color: var(--app-muted);
  transition-property: all;
  transition-timing-function: var(--app-ease-standard);
  transition-duration: var(--app-dur-fast);
}
.home-create-panel__shield-check {
  height: 0.75rem;
  width: 0.75rem;
}
.home-create-panel__skeleton-key {
  height: 0.75rem;
  width: 12rem;
  max-width: 100%;
}
.home-create-panel__skeleton-name {
  height: 0.875rem;
  width: 9rem;
  max-width: 100%;
}
.home-create-panel__shield-check-3 {
  height: 0.875rem;
  width: 0.875rem;
  flex-shrink: 0;
  color: var(--app-success);
}
.home-create-panel__check {
  height: 0.875rem;
  width: 0.875rem;
  flex-shrink: 0;
  color: var(--app-primary);
}
.home-create-panel__x {
  height: 0.875rem;
  width: 0.875rem;
}
.home-create-panel__key-round {
  height: 1rem;
  width: 1rem;
  color: var(--app-muted);
}
.home-create-panel__plus {
  height: 1rem;
  width: 1rem;
  color: var(--app-muted);
}
.home-create-panel__skeleton-badge--wide {
  height: 1.25rem;
  width: 6rem;
  border-radius: 9999px;
}
.home-create-panel__skeleton-badge {
  height: 1.25rem;
  width: 5rem;
  border-radius: 9999px;
}
.home-create-panel__skeleton-avatar {
  height: 2.5rem;
  width: 2.5rem;
  flex-shrink: 0;
  border-radius: 18px;
}
.home-create-panel__result-body {
  min-width: 0;
  flex: 1;
}
.home-create-panel__skeleton-body {
  min-width: 0;
  flex: 1;
}
.home-create-panel__contact-label {
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  font-size: 0.75rem;
  line-height: 1.5;
  font-weight: 600;
}
.home-create-panel__member-label {
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--app-text-soft);
}
.home-create-panel__primary-button {
  flex: 1;
}
:where(.home-create-panel__skeleton-body>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.5rem;
}
:where(.home-create-panel__list>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.5rem;
}
:where(.home-create-panel__result>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.75rem;
}
:where(.home-create-panel__loading>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 0.75rem;
}
:where(.home-create-panel__form>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 1.25rem;
}
:where(.home-create-panel__member-form>:not(:last-child)) {
  margin-block-start: 0;
  margin-block-end: 1.25rem;
}
.home-create-panel__result-domain {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  font-size: 0.8125rem;
  line-height: 1.5;
  font-weight: 700;
}
.home-create-panel__result-key {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--app-muted);
}
.home-create-panel__result {
  border-radius: var(--app-radius-md);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border);
  background-color: var(--app-surface-soft);
  padding: 1rem;
}
.home-create-panel__loading {
  border-radius: var(--app-radius-md);
  border-style: solid;
  border-width: 1px;
  border-color: var(--app-border);
  background-color: var(--app-surface-soft);
  padding: 1rem;
}
.home-create-panel__contact--idle {
  border-color: var(--app-border);
  background-color: var(--app-surface-soft);
  color: var(--app-text-soft);
}
.home-create-panel__contact--selected {
  border-color: var(--app-primary);
  background-color: var(--app-primary-soft);
  color: var(--app-text);
}
.home-create-panel__result--warning {
  border-color: color-mix(in oklab,var(--app-warning) 40%,transparent);
}
.home-create-panel__tone-primary {
  background-color: var(--app-primary-soft);
  color: var(--app-primary);
}
.home-create-panel__tone-success {
  background-color: var(--app-success-soft);
  color: var(--app-success);
}
.home-create-panel__tone-danger {
  background-color: var(--app-danger-soft);
  color: var(--app-danger);
}
.home-create-panel__input--mono {
  font-family: var(--font-mono);
}
.home-create-panel__text-gupt {
  font-family: var(--font-mono);
  color: var(--app-text-soft);
}
.home-create-panel__input::placeholder {
  color: var(--app-muted-2);
}
.home-create-panel__member-input::placeholder {
  color: var(--app-muted-2);
}
.home-create-panel__input:focus {
  box-shadow: var(--app-focus-ring);
  outline-style: none;
  border-color: color-mix(in srgb,var(--app-primary) 62%,var(--app-border));
  background-color: color-mix(in srgb,var(--app-surface-soft) 80%,var(--app-primary-soft));
}
.home-create-panel__member-input:focus {
  box-shadow: var(--app-focus-ring);
  outline-style: none;
  border-color: color-mix(in srgb,var(--app-primary) 62%,var(--app-border));
  background-color: color-mix(in srgb,var(--app-surface-soft) 80%,var(--app-primary-soft));
}
.home-create-panel__input:focus-visible {
  box-shadow: 0 0 0 2px currentcolor;
  outline: none;
}
.home-create-panel__member-input:focus-visible {
  box-shadow: 0 0 0 2px currentcolor;
}
.home-create-panel__button-cancel:active {
  scale: 95% 95%;
}
.home-create-panel__button-retry:active {
  scale: 95% 95%;
}
.home-create-panel__contact:active {
  scale: 95% 95%;
}
.home-create-panel__button-add:active {
  scale: 95% 95%;
}
.home-create-panel__button-add:disabled {
  cursor: not-allowed;
  opacity: .5;
}
.home-create-panel__button-retry:disabled {
  opacity: .5;
}
.home-create-panel__member-input:disabled {
  opacity: .5;
}
.home-create-panel__field-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.home-create-panel__field-row .home-create-panel__input {
  flex: 1;
  min-width: 0;
}
.home-create-panel__scan {
  display: grid;
  flex: 0 0 auto;
  width: 44px;
  min-height: 44px;
  place-items: center;
  color: var(--app-text-soft);
  background: var(--app-surface-soft);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  transition: color var(--app-dur-fast) var(--app-ease-standard), background-color var(--app-dur-fast) var(--app-ease-standard), border-color var(--app-dur-fast) var(--app-ease-standard), transform var(--app-dur-fast) var(--app-ease-standard);
}
.home-create-panel__scan:active {
  transform: scale(0.95);
}
.home-create-panel__scan-icon {
  width: 20px;
  height: 20px;
}
@media (hover: hover) {
  .home-create-panel__scan:hover {
    color: var(--app-text);
    background: var(--app-surface-hover);
    border-color: var(--app-border-strong);
  }
}
.home-create-panel__label svg {
  width: 12px;
  height: 12px;
}
.home-create-panel__input:focus-within, .home-create-panel__input:focus {
  box-shadow: var(--app-focus-ring);
}
@media (prefers-reduced-motion: reduce) {
  .home-create-panel__input, .home-create-panel__button-cancel, .home-create-panel__button-retry {
    transition: none;
  }
}
</style>
