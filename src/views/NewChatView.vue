<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Link2,
  MessageCircle,
  RefreshCw,
  Users,
} from "lucide-vue-next";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import HomeCreatePanel from "@/components/home/HomeCreatePanel.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { dmRoomId, shortId } from "@/lib/crypto";
import { resolveRecipientInput } from "@/lib/domainLookup";
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

const activeModeMeta = computed(() => modes.find((item) => item.id === mode.value) || modes[0]);

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
  <main class="chat-shell min-h-dvh overflow-y-auto lg:h-full">
    <div class="app-page-shell mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <header class="space-y-4 border-b border-white/8 pb-6">
          <router-link
            to="/messages"
            class="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-white"
          >
            <ArrowLeft class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
            Messages
          </router-link>
          <div class="space-y-2">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-success)">
              New conversation
            </p>
            <div class="space-y-1.5">
              <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{{ title }}</h1>
              <p class="text-sm leading-6 text-zinc-500">{{ activeModeMeta.description }}</p>
            </div>
          </div>
        </header>

        <section class="space-y-6">
          <div class="grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-white/[0.02] p-1">
            <button
              v-for="item in modes"
              :key="item.id"
              type="button"
              class="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all"
              :class="
                mode === item.id
                  ? 'bg-(--app-primary)/15 text-(--app-primary) ring-1 ring-(--app-primary)/30'
                  : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
              "
              @click="setMode(item.id)"
            >
              <component
                :is="item.icon"
                class="h-4 w-4 shrink-0"
                :stroke-width="1.9"
                aria-hidden="true"
              />
              <span class="hidden sm:inline">{{ item.label }}</span>
              <span class="sm:hidden">{{ item.shortLabel }}</span>
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

        <section
          v-if="mode === 'dm' && identity.pubkeyHex"
          class="space-y-8 border-t border-white/8 pt-8"
        >
          <div class="space-y-1.5">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Or connect
            </p>
            <h2 class="text-lg font-semibold tracking-tight">Share an invite instead</h2>
            <p class="max-w-lg text-sm leading-6 text-zinc-500">
              Generate a temporary link for WhatsApp, Signal, or email. Your public key stays
              hidden, the link expires, and it works once.
            </p>
          </div>

          <div class="space-y-4">
            <div>
              <label class="mb-2 block text-sm font-medium text-zinc-300">Link lifetime</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="option in INVITE_TTL_OPTIONS"
                  :key="option.id"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all"
                  :class="
                    selectedTtlId === option.id
                      ? 'border-(--app-primary)/40 bg-(--app-primary)/15 text-(--app-primary)'
                      : 'border-white/8 bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:text-white'
                  "
                  @click="selectedTtlId = option.id"
                >
                  <Clock class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
                  {{ option.label }}
                </button>
              </div>
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

            <div
              v-if="activeInvite"
              class="space-y-3 rounded-2xl border border-(--app-primary)/20 bg-(--app-primary)/5 p-4"
            >
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Invite link
                </p>
                <p class="mt-2 break-all font-mono text-xs leading-relaxed text-zinc-300">
                  {{ activeInvite.inviteUrl }}
                </p>
                <p class="mt-2 text-xs text-zinc-500">
                  Expires in {{ formatInviteExpiry(activeInvite.expiresAt) }}
                </p>
              </div>

              <button
                type="button"
                class="ui-button ui-button-primary inline-flex w-full items-center justify-center gap-2"
                :class="inviteCopied ? '!bg-emerald-500/15 !text-emerald-300' : ''"
                @click="copyInviteLink"
              >
                <Check v-if="inviteCopied" class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
                <Link2 v-else class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                {{ inviteCopied ? "Link copied" : "Copy invite link" }}
              </button>
            </div>
          </div>

          <div class="space-y-3 border-t border-white/8 pt-8">
            <div class="flex items-start justify-between gap-4">
              <div class="space-y-2">
                <h3 class="text-sm font-semibold text-zinc-300">Let people reach you</h3>
                <p class="max-w-md text-xs leading-relaxed text-zinc-500">
                  Share your public key with people on Gupt or other Nostr clients who want to add
                  you directly.
                </p>
                <p class="max-w-md text-xs leading-relaxed text-zinc-500">
                  Or publish a DNS TXT record at
                  <span class="font-mono text-zinc-400">gupt.yourdomain.com</span>
                  with this key as the value. Then anyone can enter
                  <span class="font-mono text-zinc-400">yourdomain.com</span>
                  above to start an encrypted chat — great for anonymous website support.
                  <router-link
                    to="/me?tab=identity"
                    class="text-(--app-primary) hover:underline"
                  >
                    Get your TXT record
                  </router-link>
                </p>
              </div>
              <button
                type="button"
                class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                :class="
                  copied
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-white/8 bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:text-white'
                "
                @click="copyPubkey"
              >
                <Check v-if="copied" class="h-3.5 w-3.5" :stroke-width="2.5" aria-hidden="true" />
                <Copy v-else class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
                {{ copied ? "Copied" : "Copy" }}
              </button>
            </div>

            <div class="space-y-1.5">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Your public key
              </p>
              <p
                class="rounded-xl border border-white/8 bg-black/20 px-3 py-3 font-mono text-[11px] leading-5 text-zinc-400 break-all select-all"
              >
                {{ identity.pubkeyHex }}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
