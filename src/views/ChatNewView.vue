<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { MessageCircle, Users } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PageBackHeader from "@/components/PageBackHeader.vue";
import UiTabBar from "@/components/UiTabBar.vue";
import HomeCreatePanel from "@/components/home/HomeCreatePanel.vue";
import { normalizeNostrPubkey, shortId } from "@/lib/crypto";
import { isDomainInput, pinDomain, resolveRecipientInput } from "@/lib/domainLookup";
import { groupsApi } from "@/lib/groups";
import { startAppSync, reconcileFromRelays } from "@/lib/sync";
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
const name = ref("");
const memberInput = ref("");
const members = ref([]);
const resolution = ref(null);
const resolving = ref(false);

const initPromise = identity.init().then(() => {
  void startAppSync(identity);
});

const modes = [
  {
    id: "dm",
    label: "Direct message",
    shortLabel: "Message",
    icon: MessageCircle,
    description: "Open a 1:1 encrypted chat with a public key or domain.",
  },
  {
    id: "group",
    label: "Private group",
    shortLabel: "Group",
    icon: Users,
    description: "Create a room locally. Members see it when you send the first message.",
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
  if (!name.value.trim()) {
    error.value = "Enter a group name (letters and numbers).";
    return;
  }

  saving.value = true;
  try {
    const group = await groupsApi.createGroup(identity, {
      name: name.value.trim(),
      memberPubkeys: members.value.map((m) => m.pubkey),
    });
    name.value = "";
    members.value = [];
    void reconcileFromRelays(identity);
    messenger.refreshGroupSubscriptions();
    router.push(`/groups/${group.groupId}`);
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
      label: resolved.source === "domain" ? resolved.domain : shortId(pubkey),
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
      picture: profilePicture(pk),
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
  const label = resolved.source === "domain" ? `DM · ${resolved.domain}` : "";
  dmPubkey.value = "";
  resolution.value = null;
  await openDmWith(identity, peerPubkey, { label });
}

async function createDM() {
  await initPromise;
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

onMounted(async () => {
  const domain = String(route.query.domain || "").trim();
  const key = String(route.query.key || "").trim();
  if (domain) {
    dmPubkey.value = domain;
  } else if (key && normalizeNostrPubkey(key)) {
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
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <PageBackHeader
          back-to="/messages"
          back-label="Messages"
          eyebrow="Start chat"
          :title="title"
        >
          <p class="text-sm leading-6 text-(--app-muted)">{{ activeModeMeta.description }}</p>
        </PageBackHeader>

        <section class="space-y-6">
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
            :name="name"
            :member-input="memberInput"
            :members="members"
            :trusted-contacts="trustedContacts"
            :opening-dm="openingDm"
            :saving="saving"
            :resolution="resolution"
            :resolving="resolving"
            @update:dm-pubkey="setDmInput"
            @update:name="name = $event"
            @update:member-input="memberInput = $event"
            @add-member="addMember"
            @remove-member="removeMember"
            @toggle-trusted-member="toggleTrustedMember"
            @create-dm="createDM"
            @create-group="createGroup"
            @open-resolution="openResolution"
            @cancel-resolution="cancelResolution"
            @retry-lookup="retryLookup"
          />
        </section>
      </div>
    </div>
  </main>
</template>
