<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Check, Copy, ExternalLink, Loader, MessageCircle } from "lucide-vue-next";

import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { fetchProfileDetails } from "@/composables/useProfileCache";
import { copyToClipboard } from "@/lib/clipboard";
import { dmRoomId, shortId } from "@/lib/crypto";
import { putRoomMeta } from "@/lib/idb";
import { useIdentityStore } from "@/stores/identity";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();

const pubkey = computed(() => String(route.params.pubkey || "").trim());
const profile = ref(null);
const loading = ref(true);
const copied = ref(false);
const openingDm = ref(false);

onMounted(async () => {
  await identity.init();
  loading.value = true;
  profile.value = await fetchProfileDetails(pubkey.value);
  loading.value = false;
});

const displayedName = computed(() => profile.value?.name || shortId(pubkey.value));
const isOwnProfile = computed(
  () => pubkey.value && identity.pubkeyHex && pubkey.value === identity.pubkeyHex,
);
const avatarSrc = computed(
  () => profile.value?.picture || (isOwnProfile.value ? identity.profilePicture : "") || "",
);

const safeWebsite = computed(() => {
  const url = profile.value?.website;
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.href;
  } catch {
    return null;
  }
});

const websiteLabel = computed(() => {
  if (!safeWebsite.value) return "";
  try {
    return new URL(safeWebsite.value).hostname;
  } catch {
    return safeWebsite.value;
  }
});

async function copyPubkey() {
  await copyToClipboard(pubkey.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

async function openDm() {
  if (!pubkey.value || openingDm.value || isOwnProfile.value) return;
  openingDm.value = true;
  try {
    const roomId = await dmRoomId(identity.pubkeyHex, pubkey.value);
    await putRoomMeta(roomId, {
      peerPubkey: pubkey.value,
      name: `DM · ${shortId(pubkey.value)}`,
      type: "dm",
    });
    router.push(`/room/${roomId}`);
  } finally {
    openingDm.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen">
    <main class="mx-auto w-full max-w-[80rem] px-4 py-6 lg:px-8">
      <!-- Loading -->
      <div
        v-if="loading"
        class="flex flex-col items-center justify-center gap-4 py-16 animate-pulse"
      >
        <div class="w-28 h-28 rounded-3xl bg-white/8"></div>
        <div class="h-5 w-40 rounded-full bg-white/8"></div>
        <div class="h-3 w-56 rounded-full bg-white/4"></div>
      </div>

      <div v-else class="max-w-2xl mx-auto space-y-5">
        <!-- Hero -->
        <div class="flex flex-col items-center gap-4 pt-4 pb-2">
          <RoboAvatar
            :pubkey="pubkey"
            :src="avatarSrc"
            size="hero"
            rounded="3xl"
            alt="Profile avatar"
          />
          <div class="text-center space-y-1">
            <h1 class="text-xl font-bold tracking-tight">{{ displayedName }}</h1>
            <p v-if="isOwnProfile" class="text-xs text-zinc-500">This is you</p>
          </div>
        </div>

        <!-- Details -->
        <div
          class="border border-(--app-border) bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] shadow-[0_16px_48px_rgba(0,0,0,0.16)] rounded-2xl divide-y divide-white/8 overflow-hidden"
        >
          <div v-if="profile?.about" class="px-4 py-4">
            <p class="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
              About
            </p>
            <p class="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
              {{ profile.about }}
            </p>
          </div>
          <div v-if="profile?.status" class="px-4 py-4">
            <p class="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
              Status
            </p>
            <p class="text-sm text-zinc-300 leading-relaxed">{{ profile.status }}</p>
          </div>
          <div v-if="safeWebsite" class="px-4 py-4">
            <p class="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
              Website
            </p>
            <a
              :href="safeWebsite"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1.5"
            >
              <span class="truncate">{{ websiteLabel }}</span>
              <ExternalLink class="w-3.5 h-3.5 shrink-0" :stroke-width="2" />
            </a>
          </div>
          <div class="px-4 py-4 flex items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                Public Key
              </p>
              <p class="text-xs font-mono text-zinc-500 truncate">{{ pubkey }}</p>
            </div>
            <button
              @click="copyPubkey"
              class="inline-flex items-center justify-center shrink-0 h-9 w-9 rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
              :class="copied ? 'text-emerald-400' : 'text-zinc-400'"
            >
              <Check v-if="copied" class="w-4 h-4" :stroke-width="2.5" />
              <Copy v-else class="w-4 h-4" :stroke-width="1.8" />
            </button>
          </div>
        </div>

        <!-- Actions -->
        <div v-if="!isOwnProfile">
          <PrimaryButton @click="openDm" :disabled="openingDm" :loading="openingDm">
            <MessageCircle class="w-4 h-4" :stroke-width="2" />
            {{ openingDm ? "Opening…" : "Send Message" }}
          </PrimaryButton>
        </div>
        <div v-if="isOwnProfile">
          <button
            @click="router.push('/me')"
            class="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) px-4 py-3 text-sm font-semibold"
          >
            Edit Profile
          </button>
        </div>
      </div>
    </main>
  </div>
</template>
