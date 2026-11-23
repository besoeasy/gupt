<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { MessageCircle, Users } from "@/icons";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PageHeader from "@/components/PageHeader.vue";
import UiTabBar from "@/components/UiTabBar.vue";
import HomeCreatePanel from "@/components/home/HomeCreatePanel.vue";
import QrScanSheet from "@/components/QrScanSheet.vue";
import { normalizePubkey, shortId } from "@/lib/crypto";
import { isDomainInput, pinDomain, resolveRecipientInput } from "@/lib/domainLookup";
import { GROUP_MAX_MEMBERS } from "@/lib/groupIdentity";
import { groupsApi } from "@/lib/groups";
import { parseQrPayload } from "@/lib/qr/payload";
import { startAppSync, reconcileFromCache } from "@/lib/sync";
import { useIdentityStore } from "@/stores/identity";
import { messenger } from "@/stores/messenger";
import { useOpenConversation } from "@/composables/useOpenConversation";
import { useProfileStore } from "@/stores/profiles";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const { openDmWith } = useOpenConversation();
const { displayName, profilePicture, prefetch } = useProfileStore();

const TRUSTED_SENT = 7;

const mode = ref("dm");
const dmPubkey = ref("");
const openingDm = ref(false);
const saving = ref(false);
const error = ref("");
const memberInput = ref("");
const members = ref([]);
const resolution = ref(null);
const resolving = ref(false);
const scannerOpen = ref(false);

const initPromise = identity.init().then(() => {
  void startAppSync(identity);
});

const modes = [
  {
    id: "dm",
    label: "Direct message",
    shortLabel: "Message",
    icon: MessageCircle,
    description: "Open a 1:1 encrypted chat with a public key, domain, or match lobby code.",
  },
  {
    id: "group",
    label: "Private group",
    shortLabel: "Group",
    icon: Users,
    description:
      "Create an encrypted group with up to 8 members. Membership is fixed — to change it, create a new group.",
  },
];

const title = computed(() =>
  mode.value === "group" ? "Start a private group" : "Start a direct chat",
);

const activeModeMeta = computed(() => modes.find((item) => item.id === mode.value) || modes[0]);

function setMode(nextMode) {
  if (mode.value === nextMode) return;
  error.value = "";
  mode.value = nextMode;
}

async function createGroup() {
  await initPromise;
  error.value = "";
  if (!members.value.length) {
    error.value = "Add at least one member.";
    return;
  }
  if (members.value.length + 1 > GROUP_MAX_MEMBERS) {
    error.value = `A group can have at most ${GROUP_MAX_MEMBERS} members including you.`;
    return;
  }

  saving.value = true;
  try {
    const group = await groupsApi.createGroup(identity, {
      memberPubkeys: members.value.map((m) => m.pubkey),
    });
    members.value = [];
    void reconcileFromCache(identity);
    messenger.refreshGroupSubscriptions();
    router.push(`/chat/group:${group.groupId}`);
  } catch (e) {
    error.value = e.message || "Unable to create group.";
  } finally {
    saving.value = false;
  }
}

async function addMember() {
  error.value = "";
  const input = memberInput.value.trim();
  if (!input) return;
  if (members.value.length >= GROUP_MAX_MEMBERS - 1) {
    error.value = `A group can have at most ${GROUP_MAX_MEMBERS} members including you.`;
    return;
  }
  try {
    const resolved = await resolveRecipientInput(input);
    const pubkey = resolved.pubkey;
    if (pubkey === identity.pubkeyHex) {
      error.value = "You are already in the group.";
      return;
    }
    if (members.value.some((m) => m.pubkey === pubkey)) {
      error.value = "That member is already added.";
      return;
    }
    members.value.push({
      pubkey,
      label:
        resolved.source === "domain"
          ? resolved.domain
          : resolved.source === "invite" && resolved.name
            ? resolved.name
            : shortId(pubkey),
    });
    memberInput.value = "";
  } catch (e) {
    error.value = e.message || "Unable to add member.";
  }
}

function removeMember(pubkey) {
  members.value = members.value.filter((m) => m.pubkey !== pubkey);
}

function toggleTrustedMember(contact) {
  error.value = "";
  if (!contact?.pubkey) return;
  if (contact.pubkey === identity.pubkeyHex) {
    error.value = "You are already in the group.";
    return;
  }
  if (members.value.some((m) => m.pubkey === contact.pubkey)) {
    removeMember(contact.pubkey);
    return;
  }
  if (members.value.length >= GROUP_MAX_MEMBERS - 1) {
    error.value = `A group can have at most ${GROUP_MAX_MEMBERS} members including you.`;
    return;
  }
  members.value.push({
    pubkey: contact.pubkey,
    label: contact.label || shortId(contact.pubkey),
  });
}

const trustedContacts = computed(() => {
  const self = identity.pubkeyHex;
  const seen = new Set();
  const out = [];
  for (const room of Object.values(messenger.roomMeta)) {
    const pk = room?.peerPubkey;
    if (!pk || pk === self || seen.has(pk)) continue;
    const msgs = messenger.roomMessages[room.roomId] || [];
    let sent = 0;
    for (const m of msgs) {
      if (m.mine) sent++;
      if (sent >= TRUSTED_SENT) break;
    }
    if (sent < TRUSTED_SENT) continue;
    seen.add(pk);
    out.push({
      pubkey: pk,
      label: displayName(pk) || shortId(pk),
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
});

watch(
  [() => messenger.hydratedInbox.value, mode],
  ([ready, currentMode]) => {
    if (!ready || currentMode !== "group") return;
    const pubkeys = [];
    for (const room of Object.values(messenger.roomMeta)) {
      if (room?.roomId && room.peerPubkey) {
        void messenger.hydrateRoom(room.roomId);
        pubkeys.push(room.peerPubkey);
      }
    }
    if (pubkeys.length) void prefetch(pubkeys);
  },
  { immediate: true },
);

async function openResolved(resolved) {
  const peerPubkey = resolved.pubkey;
  if (peerPubkey === identity.pubkeyHex) {
    error.value = "Use a different contact for the conversation.";
    return;
  }
  const label =
    resolved.source === "domain"
      ? `DM · ${resolved.domain}`
      : resolved.source === "invite" && resolved.name
        ? resolved.name
        : "";
  dmPubkey.value = "";
  resolution.value = null;
  await openDmWith(identity, peerPubkey, { label });
}

async function createDM() {
  await initPromise;
  if (openingDm.value) return;
  error.value = "";

  openingDm.value = true;
  try {
    const resolved = await resolveRecipientInput(dmPubkey.value);

    // Raw pubkey — nothing to confirm, keep the one-tap flow.
    if (resolved.source !== "domain") {
      await openResolved(resolved);
      return;
    }

    // Returning visitor whose pinned key still matches — fast path.
    if (resolved.pinStatus === "match" && !resolved.stale) {
      await openResolved(resolved);
      return;
    }

    // First contact, changed key, or stale cache — show the confirm card.
    resolution.value = resolved;
  } catch (e) {
    error.value = e.message || "Unable to open conversation.";
  } finally {
    openingDm.value = false;
  }
}

async function openResolution() {
  const resolved = resolution.value;
  if (!resolved || resolved.source !== "domain") return;
  openingDm.value = true;
  try {
    pinDomain(resolved.domain, resolved.pubkey);
    await openResolved(resolved);
  } catch (e) {
    error.value = e.message || "Unable to open conversation.";
  } finally {
    openingDm.value = false;
  }
}

function cancelResolution() {
  resolution.value = null;
  error.value = "";
}

async function retryLookup() {
  const resolved = resolution.value;
  if (!resolved?.domain) return;
  resolving.value = true;
  error.value = "";
  try {
    const next = await resolveRecipientInput(resolved.domain, { force: true });
    if (next.pinStatus === "match" && !next.stale) {
      await openResolved(next);
    } else {
      resolution.value = next;
    }
  } catch (e) {
    error.value = e.message || "Unable to look up this domain.";
  } finally {
    resolving.value = false;
  }
}

function setDmInput(value) {
  dmPubkey.value = value;
  if (resolution.value) resolution.value = null;
  if (error.value) error.value = "";
}

function openScanner() {
  error.value = "";
  scannerOpen.value = true;
}

// A scan is the same as pasting the code: it fills the field and takes the
// one-tap path. Nothing is sent, and an unknown or foreign code changes nothing.
function onScanned(raw) {
  scannerOpen.value = false;
  const payload = parseQrPayload(raw, window.location.origin);
  if (!payload) {
    error.value = "That code is not a Gupt invite. Ask for a fresh one.";
    return;
  }
  if (mode.value !== "dm") setMode("dm");
  if (payload.kind === "domain") {
    setDmInput(payload.domain);
    void preResolve(payload.domain);
    return;
  }
  setDmInput(payload.kind === "lobby" ? payload.code : payload.key);
  void createDM();
}

onMounted(async () => {
  const domain = String(route.query.domain || "").trim();
  const key = String(route.query.key || "").trim();
  if (domain) {
    dmPubkey.value = domain;
  } else if (key && normalizePubkey(key)) {
    dmPubkey.value = key;
  }
  await initPromise;
  if (domain) void preResolve(domain);
});

// Deep-linked domains resolve immediately so the confirm card shows who you
// are about to chat with — no extra typing for the visitor.
async function preResolve(domain) {
  if (!isDomainInput(domain)) return;
  resolving.value = true;
  try {
    const resolved = await resolveRecipientInput(domain);
    if (resolved.source === "domain" && dmPubkey.value === resolved.domain) {
      resolution.value = resolved;
    }
  } catch (e) {
    error.value = e.message || "";
  } finally {
    resolving.value = false;
  }
}
</script>

<template>
  <main class="chat-new">
    <div class="chat-new__inner">
      <PageHeader eyebrow="Start chat" :title="title">
        <p class="chat-new__lede">{{ activeModeMeta.description }}</p>
      </PageHeader>

      <section class="chat-new__panel">
        <UiTabBar
          :model-value="mode"
          :tabs="modes"
          variant="surface"
          id-prefix="new-chat"
          @update:model-value="setMode"
        />

        <AppAlertBanner v-if="error" :message="error" />

        <HomeCreatePanel
          :active-panel="mode"
          :dm-pubkey="dmPubkey"
          :member-input="memberInput"
          :members="members"
          :trusted-contacts="trustedContacts"
          :opening-dm="openingDm"
          :saving="saving"
          :resolution="resolution"
          :resolving="resolving"
          @update:dm-pubkey="setDmInput"
          @update:member-input="memberInput = $event"
          @add-member="addMember"
          @remove-member="removeMember"
          @toggle-trusted-member="toggleTrustedMember"
          @create-dm="createDM"
          @create-group="createGroup"
          @open-resolution="openResolution"
          @cancel-resolution="cancelResolution"
          @retry-lookup="retryLookup"
          @scan-qr="openScanner"
        />
      </section>
    </div>

    <QrScanSheet
      :open="scannerOpen"
      @close="scannerOpen = false"
      @detected="onScanned"
    />
  </main>
</template>

<style scoped>
/* Ledger pass: start a chat from one quiet composition. */

.chat-new {
  min-height: 100dvh;
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 240ms var(--app-ease-standard) both;
}

.chat-new__inner {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  width: 100%;
  max-width: 720px;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4) var(--app-space-8);
}

.chat-new__lede {
  max-width: 58ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.chat-new__panel {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  animation: ledger-rise 440ms var(--app-ease-emphasized) 50ms both;
}

@media (min-width: 40rem) {
  .chat-new__inner {
    padding-inline: var(--app-space-6);
  }
}

@media (min-width: 64rem) {
  .chat-new {
    height: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-new,
  .chat-new__panel {
    animation: none;
  }
}
</style>
