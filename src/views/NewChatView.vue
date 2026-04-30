<script setup>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { MessageCircle, Users } from "lucide-vue-next";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import HomeCreatePanel from "@/components/home/HomeCreatePanel.vue";
import { dmRoomId, normalizeNostrPubkey, shortId } from "@/lib/crypto";
import { groupsApi } from "@/lib/groups";
import { putRoomMeta } from "@/lib/idb";
import { startAppSync, syncGroups } from "@/lib/sync";
import { useIdentityStore } from "@/stores/identity";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();

const mode = computed(() => (route.query.type === "group" ? "group" : "dm"));
const dmPubkey = ref("");
const openingDm = ref(false);
const saving = ref(false);
const error = ref("");
const name = ref("");
const description = ref("");

const initPromise = identity.init().then(() => {
  void startAppSync(identity);
});

const modes = [
  { id: "dm", label: "Message", icon: MessageCircle },
  { id: "group", label: "Group", icon: Users },
];

const eyebrow = computed(() => (mode.value === "group" ? "Create Group" : "New Message"));
const title = computed(() => (mode.value === "group" ? "Start a private group" : "Start a direct chat"));
const subtitle = computed(() =>
  mode.value === "group"
    ? "Create a group room now. You can invite people after it opens."
    : "Paste a 64-char x-only or 66-char compressed public key to open an encrypted conversation.",
);

watch(
  () => route.query.type,
  (type) => {
    mode.value = type === "group" ? "group" : "dm";
    error.value = "";
  },
);

function setMode(nextMode) {
  if (mode.value === nextMode) return;
  error.value = "";
  router.replace({ path: "/new", query: nextMode === "group" ? { type: "group" } : {} });
}

async function createGroup() {
  await initPromise;
  error.value = "";
  if (!name.value.trim()) {
    error.value = "Enter a group name.";
    return;
  }

  saving.value = true;
  try {
    const group = await groupsApi.createGroup(identity, {
      name: name.value.trim(),
      description: description.value.trim(),
    });
    name.value = "";
    description.value = "";
    void syncGroups(identity);
    router.push(`/groups/${group.groupId}`);
  } catch (e) {
    error.value = e.message || "Unable to create group.";
  } finally {
    saving.value = false;
  }
}

async function createDM() {
  await initPromise;
  error.value = "";
  const peerPubkey = normalizeNostrPubkey(dmPubkey.value);
  if (!peerPubkey) {
    error.value =
      "Enter a valid public key. Both 64-char x-only and 66-char compressed keys are accepted.";
    return;
  }
  if (peerPubkey === identity.pubkeyHex) {
    error.value = "Use a different public key for the conversation.";
    return;
  }

  openingDm.value = true;
  try {
    const roomId = await dmRoomId(identity.pubkeyHex, peerPubkey);
    await putRoomMeta(roomId, {
      peerPubkey,
      name: `DM · ${shortId(peerPubkey)}`,
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
</script>

<template>
  <main class="chat-shell min-h-dvh lg:h-full text-white overflow-y-auto">
    <div class="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6 sm:px-6 lg:min-h-full lg:justify-center lg:py-10">
      <section class="space-y-5">
        <div class="space-y-2">
          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-success)">
            {{ eyebrow }}
          </p>
          <div class="space-y-2">
            <h1 class="text-2xl font-bold tracking-tight text-white sm:text-3xl">{{ title }}</h1>
            <p class="max-w-xl text-sm leading-6 text-zinc-500">{{ subtitle }}</p>
          </div>
        </div>

        <div class="ui-surface inline-flex rounded-2xl p-1">
          <button
            v-for="item in modes"
            :key="item.id"
            class="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
            :class="
              mode === item.id
                ? 'bg-(--app-primary-soft) text-white ring-1 ring-(--app-border-strong)'
                : 'text-zinc-500 hover:text-zinc-300'
            "
            @click="setMode(item.id)"
          >
            <component :is="item.icon" class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
            {{ item.label }}
          </button>
        </div>

        <AppAlertBanner v-if="error" :message="error" />

        <HomeCreatePanel
          :active-panel="mode"
          :dm-pubkey="dmPubkey"
          :name="name"
          :description="description"
          :opening-dm="openingDm"
          :saving="saving"
          @update:dm-pubkey="dmPubkey = $event"
          @update:name="name = $event"
          @update:description="description = $event"
          @create-dm="createDM"
          @create-group="createGroup"
        />
      </section>
    </div>
  </main>
</template>