<script setup>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Check, Clock, Copy, Link2, MessageCircle, RefreshCw, Users } from "lucide-vue-next";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import HomeCreatePanel from "@/components/home/HomeCreatePanel.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { dmRoomId, normalizeNostrPubkey, shortId } from "@/lib/crypto";
import { INVITE_TTL_OPTIONS, createTempInvite, formatInviteExpiry } from "@/lib/invites";
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
const title = computed(() =>
  mode.value === "group" ? "Start a private group" : "Start a direct chat",
);
const subtitle = computed(() =>
  mode.value === "group"
    ? "Create a group room now. You can invite people after it opens."
    : "Paste a 64-char x-only or 66-char compressed public key to open an encrypted conversation.",
);

const copied = ref(false);
const inviteCopied = ref(false);
const inviteBusy = ref(false);
const inviteError = ref("");
const selectedTtlId = ref("24h");
const activeInvite = ref(null);

const selectedTtl = computed(
  () =>
    INVITE_TTL_OPTIONS.find((option) => option.id === selectedTtlId.value) || INVITE_TTL_OPTIONS[1],
);

function flashCopied(state) {
  state.value = true;
  setTimeout(() => (state.value = false), 1500);
}

async function copyPubkey() {
  await copyToClipboard(identity.pubkeyHex);
  flashCopied(copied);
}

async function copyInviteLink() {
  if (!activeInvite.value?.inviteUrl) return;
  await copyToClipboard(activeInvite.value.inviteUrl);
  flashCopied(inviteCopied);
}

async function generateInvite() {
  await initPromise;
  inviteError.value = "";
  inviteBusy.value = true;
  try {
    activeInvite.value = await createTempInvite(identity, {
      ttlHours: selectedTtl.value.hours,
      displayName: identity.profileName,
    });
    inviteCopied.value = false;
  } catch (e) {
    inviteError.value = e.message || "Unable to create invite.";
  } finally {
    inviteBusy.value = false;
  }
}

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
  <main class="chat-shell min-h-dvh lg:h-full overflow-y-auto">
    <div
      class="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6 sm:px-6 lg:min-h-full lg:justify-center lg:py-10"
    >
      <section class="space-y-5">
        <div class="space-y-2">
          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-success)">
            {{ eyebrow }}
          </p>
          <div class="space-y-2">
            <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{{ title }}</h1>
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
                ? 'bg-(--app-primary-soft) ring-1 ring-(--app-border-strong)'
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

        <!-- Share options — only shown in DM mode -->
        <template v-if="mode === 'dm' && identity.pubkeyHex">
          <div class="flex items-center gap-3">
            <span class="h-px flex-1 bg-white/8" />
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600"
              >or share</span
            >
            <span class="h-px flex-1 bg-white/8" />
          </div>

          <div class="ui-panel rounded-2xl px-4 py-4 space-y-4">
            <div class="space-y-1">
              <div class="flex items-center gap-1.5">
                <span class="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
                  >Temporary invite</span
                >
                <span class="h-px flex-1 bg-white/5" />
              </div>
              <p class="text-xs text-zinc-600 leading-5">
                Safe for WhatsApp and group chats. The link hides your public key, expires
                automatically, and stops working after it is used once.
              </p>
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in INVITE_TTL_OPTIONS"
                :key="option.id"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                :class="
                  selectedTtlId === option.id
                    ? 'bg-(--app-primary-soft) ring-1 ring-(--app-border-strong)'
                    : 'ui-surface ui-muted hover:ui-soft-text'
                "
                @click="selectedTtlId = option.id"
              >
                <Clock class="h-3 w-3" :stroke-width="2" aria-hidden="true" />
                {{ option.label }}
              </button>
            </div>

            <AppAlertBanner v-if="inviteError" :message="inviteError" />

            <PrimaryButton :loading="inviteBusy" @click="generateInvite">
              <RefreshCw
                class="h-4 w-4"
                :class="inviteBusy ? 'animate-spin' : ''"
                :stroke-width="2"
                aria-hidden="true"
              />
              {{ activeInvite ? "Generate new invite" : "Generate invite link" }}
            </PrimaryButton>

            <div v-if="activeInvite" class="space-y-2">
              <div
                class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2.5"
              >
                <p class="text-[10px] font-semibold uppercase tracking-[0.14em] ui-muted">
                  Share this link
                </p>
                <p class="mt-1 break-all font-mono text-[11px] ui-soft-text">
                  {{ activeInvite.inviteUrl }}
                </p>
                <p class="mt-2 text-[11px] ui-muted">
                  Expires in {{ formatInviteExpiry(activeInvite.expiresAt) }}
                </p>
              </div>

              <button
                type="button"
                class="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/7 bg-white/3 px-3 py-2 text-[11px] font-medium text-zinc-400 transition-all hover:bg-white/6 hover:text-zinc-200 hover:border-white/12 active:scale-95"
                :class="
                  inviteCopied ? '!text-emerald-400 !border-emerald-500/30 !bg-emerald-500/8' : ''
                "
                :aria-label="inviteCopied ? 'Link copied!' : 'Copy temporary invite link'"
                @click="copyInviteLink"
              >
                <Check
                  v-if="inviteCopied"
                  class="h-3 w-3 shrink-0"
                  :stroke-width="2.5"
                  aria-hidden="true"
                />
                <Link2 v-else class="h-3 w-3 shrink-0" :stroke-width="2" aria-hidden="true" />
                {{ inviteCopied ? "Link copied!" : "Copy temporary invite link" }}
              </button>
            </div>
          </div>

          <div class="ui-panel rounded-2xl p-4 space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-semibold text-zinc-300">Public key</p>
                <p class="mt-0.5 text-[11px] text-zinc-500 leading-relaxed max-w-[260px]">
                  Share your full public key for direct adding in Gupt or other Nostr clients.
                </p>
              </div>
              <button
                type="button"
                class="ui-icon-button inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.05em] px-2.5 py-1 rounded-full transition-colors shrink-0"
                :class="
                  copied
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                "
                @click="copyPubkey"
              >
                <Check v-if="copied" class="h-3 w-3" :stroke-width="2.5" aria-hidden="true" />
                <Copy v-else class="h-3 w-3" :stroke-width="2" aria-hidden="true" />
                {{ copied ? "Copied" : "Copy" }}
              </button>
            </div>

            <p
              class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2.5 font-mono text-[11px] leading-5 ui-soft-text break-all select-all transition-colors hover:border-(--app-border-strong)"
            >
              {{ identity.pubkeyHex }}
            </p>
          </div>
        </template>
      </section>
    </div>
  </main>
</template>
