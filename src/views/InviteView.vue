<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { LoaderCircle, MessageCircle } from "@lucide/vue";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import {
  resolveTempInvite,
  openInviteDm,
  formatInviteExpiry,
  decodeInviteRelays,
} from "@/lib/invites";
import { useIdentityStore } from "@/stores/identity";
import { useProfileCache } from "@/composables/useProfileCache";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const { displayName, profilePicture, prefetch } = useProfileCache();

const loading = ref(true);
const openingDm = ref(false);
const error = ref("");
const invite = ref(null);

const inviteToken = computed(() => decodeURIComponent(String(route.params.code || "").trim()));
const inviteRelays = computed(() => decodeInviteRelays(route.query.r));
const peerLabel = computed(() => {
  if (!invite.value?.pubkeyHex) return "";
  return invite.value.displayName || displayName(invite.value.pubkeyHex);
});

const expiryLabel = computed(() => {
  if (!invite.value?.expiresAt) return "";
  return formatInviteExpiry(invite.value.expiresAt);
});

async function openDm() {
  if (openingDm.value) return;
  await identity.init();
  openingDm.value = true;
  error.value = "";
  try {
    const { roomId } = await openInviteDm(identity, inviteToken.value, inviteRelays.value);
    router.replace(`/room/${roomId}`);
  } catch (e) {
    error.value = e.message || "Unable to open conversation.";
  } finally {
    openingDm.value = false;
  }
}

onMounted(async () => {
  loading.value = true;
  error.value = "";
  invite.value = null;

  try {
    await identity.init();
    if (!inviteToken.value) throw new Error("Invite link is missing its code.");
    invite.value = await resolveTempInvite(inviteToken.value, inviteRelays.value);
    if (invite.value.pubkeyHex) void prefetch([invite.value.pubkeyHex]);
  } catch (e) {
    error.value = e.message || "Unable to load invite.";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main
    class="min-h-dvh lg:h-full overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text)"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div
        class="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-lg flex-col justify-center py-6 sm:py-10"
      >
        <div v-if="loading" class="flex flex-col items-center gap-4 py-16 text-center">
          <LoaderCircle
            class="h-8 w-8 animate-spin text-(--app-muted)"
            :stroke-width="2"
            aria-hidden="true"
          />
          <p class="text-sm text-(--app-muted) leading-relaxed">Checking invite…</p>
        </div>

        <section
          v-else-if="invite"
          class="border border-(--app-border) bg-(--app-surface) shadow-sm space-y-5 rounded-2xl p-5"
        >
          <div class="space-y-2 text-center">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-success)">
              Temporary invite
            </p>
            <h1 class="text-2xl font-bold tracking-tight">Start a private chat</h1>
            <p class="text-sm text-(--app-muted) leading-relaxed">
              Someone shared a short-lived GUPT invite with you. Your public key is not exposed in
              the link they sent.
            </p>
          </div>

          <div class="flex flex-col items-center gap-3">
            <RoboAvatar
              :pubkey="invite.pubkeyHex"
              :src="profilePicture(invite.pubkeyHex)"
              size="xxl"
              :hoverable="false"
              :alt="peerLabel"
            />
            <div class="text-center">
              <p class="text-lg font-semibold">{{ peerLabel }}</p>
              <p class="mt-1 text-xs text-(--app-muted)">End-to-end encrypted direct message</p>
              <p v-if="expiryLabel" class="mt-1 text-xs text-(--app-muted)">
                Expires in {{ expiryLabel }}
              </p>
            </div>
          </div>

          <AppAlertBanner v-if="error" :message="error" />

          <PrimaryButton :loading="openingDm" @click="openDm">
            <MessageCircle class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
            {{ openingDm ? "Opening…" : "Open conversation" }}
          </PrimaryButton>
        </section>

        <section
          v-else
          class="border border-(--app-border) bg-(--app-surface) shadow-sm space-y-4 rounded-2xl p-5 text-center"
        >
          <h1 class="text-xl font-bold tracking-tight">Invite unavailable</h1>
          <AppAlertBanner v-if="error" :message="error" />
          <p class="text-sm text-(--app-muted) leading-relaxed">
            The link may have expired, already been used, or never reached a relay. Ask the sender
            for a fresh invite from GUPT.
          </p>
          <PrimaryButton class="!w-auto !px-6 mx-auto" @click="router.push('/invite/new')">
            Share a new invite
          </PrimaryButton>
        </section>
      </div>
    </div>
  </main>
</template>
