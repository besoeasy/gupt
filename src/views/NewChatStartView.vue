<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { MessageCircle, Users } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PageBackHeader from "@/components/PageBackHeader.vue";
import UiTabBar from "@/components/UiTabBar.vue";
import HomeCreatePanel from "@/components/home/HomeCreatePanel.vue";
import { dmRoomId, shortId } from "@/lib/crypto";
import { resolveRecipientInput } from "@/lib/domainLookup";
import { groupsApi } from "@/lib/groups";
import { putRoomMeta } from "@/lib/idb";
import { startAppSync, reconcileFromRelays } from "@/lib/sync";
import { useIdentityStore } from "@/stores/identity";
import { messenger } from "@/stores/messenger";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();

const mode = computed(() => (route.query.type === "group" ? "group" : "dm"));
const dmPubkey = ref("");
const openingDm = ref(false);
const saving = ref(false);
const error = ref("");
const code = ref("");
const memberInput = ref("");
const members = ref([]);

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
    description: "Create a room and invite people after it opens.",
  },
];

const title = computed(() =>
  mode.value === "group" ? "Start a private group" : "Start a direct chat",
);

const activeModeMeta = computed(() => modes.find((item) => item.id === mode.value) || modes[0]);

function setMode(nextMode) {
  if (mode.value === nextMode) return;
  error.value = "";
  router.replace({
    path: "/new/start",
    query: nextMode === "group" ? { type: "group" } : {},
  });
}

async function createGroup() {
  await initPromise;
  error.value = "";
  if (!code.value.trim()) {
    error.value = "Enter a group code (letters and numbers).";
    return;
  }

  saving.value = true;
  try {
    const group = await groupsApi.createGroup(identity, {
      code: code.value.trim(),
      memberPubkeys: members.value.map((m) => m.pubkey),
    });
    code.value = "";
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

async function createDM() {
  await initPromise;
  error.value = "";

  openingDm.value = true;
  try {
    const resolved = await resolveRecipientInput(dmPubkey.value);
    const peerPubkey = resolved.pubkey;

    if (peerPubkey === identity.pubkeyHex) {
      error.value = "Use a different contact for the conversation.";
      return;
    }

    const roomLabel =
      resolved.source === "domain" ? `DM · ${resolved.domain}` : `DM · ${shortId(peerPubkey)}`;

    const roomId = await dmRoomId(identity.pubkeyHex, peerPubkey);
    await putRoomMeta(roomId, {
      peerPubkey,
      name: roomLabel,
      type: "dm",
    });
    dmPubkey.value = "";
    router.push(`/room/${roomId}`);
  } catch (e) {
    error.value = e.message || "Unable to open conversation.";
  } finally {
    openingDm.value = false;
  }
}

onMounted(async () => {
  const domain = String(route.query.domain || "").trim();
  if (domain) {
    dmPubkey.value = domain;
  }
  await initPromise;
});
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-[80rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <PageBackHeader
          back-to="/new"
          back-label="New conversation"
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
            :code="code"
            :member-input="memberInput"
            :members="members"
            :opening-dm="openingDm"
            :saving="saving"
            @update:dm-pubkey="dmPubkey = $event"
            @update:code="code = $event"
            @update:member-input="memberInput = $event"
            @add-member="addMember"
            @remove-member="removeMember"
            @create-dm="createDM"
            @create-group="createGroup"
          />
        </section>
      </div>
    </div>
  </main>
</template>
