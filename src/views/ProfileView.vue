<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Check, Copy, ExternalLink, Loader, MessageCircle } from "lucide-vue-next";

import RoboAvatar from "@/components/RoboAvatar.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { fetchProfileDetails } from "@/composables/useProfileCache";
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
// For own profile, prefer the locally stored picture so it's visible immediately
// even before the relay round-trip completes.
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
  await navigator.clipboard.writeText(pubkey.value);
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
  <div class="w-full max-w-3xl mx-auto flex-1 flex flex-col relative">
    <!-- Loading skeleton -->
    <div
      v-if="loading"
      class="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-12 animate-pulse"
    >
      <div class="w-28 h-28 rounded-3xl bg-muted"></div>
      <div class="h-5 w-40 rounded-full bg-muted"></div>
      <div class="h-3 w-56 rounded-full bg-muted/60"></div>
    </div>

    <!-- Profile card -->
    <div v-else class="flex-1 flex flex-col">
      <!-- Hero section -->
      <div class="flex flex-col items-center gap-4 px-6 pt-10 pb-8">
        <RoboAvatar
          :pubkey="pubkey"
          :src="avatarSrc"
          size="hero"
          rounded="3xl"
          :story-ring="!!avatarSrc"
          alt="Profile avatar"
        />
        <div class="text-center space-y-1">
          <h1 class="text-xl font-bold tracking-tight">{{ displayedName }}</h1>
          <p v-if="isOwnProfile" class="text-xs text-muted-foreground">This is you</p>
        </div>
      </div>

      <!-- Detail card -->
      <div
        class="mx-4 mb-4 rounded-2xl border border-border bg-background divide-y divide-white/7 overflow-hidden"
      >
        <!-- Bio -->
        <div v-if="profile?.about" class="px-5 py-4">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            About
          </p>
          <p class="text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
            {{ profile.about }}
          </p>
        </div>

        <!-- Status -->
        <div v-if="profile?.status" class="px-5 py-4">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Status
          </p>
          <p class="text-sm text-zinc-200 leading-relaxed">{{ profile.status }}</p>
        </div>

        <!-- Website -->
        <div v-if="safeWebsite" class="px-5 py-4 flex items-center gap-3">
          <div class="flex flex-col gap-0.5 min-w-0 flex-1">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Website
            </p>
            <a
              :href="safeWebsite"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1.5 truncate"
            >
              <span class="truncate">{{ websiteLabel }}</span>
              <ExternalLink class="w-3.5 h-3.5 shrink-0" :stroke-width="2" />
            </a>
          </div>
        </div>

        <!-- Public key -->
        <div class="px-5 py-4 flex items-center gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Public Key
            </p>
            <p class="text-xs font-mono text-muted-foreground truncate">{{ pubkey }}</p>
          </div>
          <button
            @click="copyPubkey"
            class="shrink-0 h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/15 transition-colors"
            :class="copied ? 'text-emerald-400' : 'text-muted-foreground'"
            :title="copied ? 'Copied!' : 'Copy ID'"
          >
            <Check v-if="copied" class="w-4 h-4 motion-safe:animate-pulse" :stroke-width="2.5" />
            <Copy v-else class="w-4 h-4" :stroke-width="1.8" />
          </button>
        </div>
      </div>

      <!-- Send DM button -->
      <div v-if="!isOwnProfile" class="mx-4 mb-6">
        <PrimaryButton @click="openDm" :loading="openingDm">
          <MessageCircle v-if="!openingDm" class="w-4.5 h-4.5" :stroke-width="2" />
          <span>{{ openingDm ? "Opening…" : "Send Message" }}</span>
        </PrimaryButton>
      </div>

      <!-- Own profile shortcut -->
      <div v-if="isOwnProfile" class="mx-4 mb-6">
        <button
          @click="router.push('/identity')"
          class="w-full py-3.5 rounded-2xl border border-border bg-background hover:bg-muted active:bg-muted transition-all duration-200 flex items-center justify-center gap-2.5 text-sm font-semibold hover:-translate-y-0.5 active:translate-y-0"
        >
          Edit Profile
        </button>
      </div>
    </div>
  </div>
</template>
