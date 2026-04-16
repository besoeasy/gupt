<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Camera, KeyRound, LoaderCircle, Radio, User } from "lucide-vue-next";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { pubkeyName } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";
import { api } from "@/lib/api";

const identity = useIdentityStore();
const router = useRouter();

const message = ref("");
const error = ref("");

const editingName = ref("");
const editingAbout = ref("");
const editingPicture = ref("");
const editingWebsite = ref("");
const editingStatus = ref("");
const profileBusy = ref(false);
const uploadBusy = ref(false);
const pictureFileInput = ref(null);
const canSaveProfile = computed(() => editingName.value.trim().length > 0 && !profileBusy.value);

async function handlePictureUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    error.value = "Please select an image file.";
    return;
  }
  uploadBusy.value = true;
  error.value = "";
  try {
    const { cid, url } = await api.uploadFile(file);
    editingPicture.value = cid ? `https://ipfs.io/ipfs/${cid}` : url || "";
  } catch (e) {
    error.value = e.message || "Upload failed.";
  } finally {
    uploadBusy.value = false;
    if (pictureFileInput.value) pictureFileInput.value.value = "";
  }
}

async function saveProfile() {
  message.value = "";
  error.value = "";
  profileBusy.value = true;
  try {
    await identity.saveProfile({
      name: editingName.value,
      about: editingAbout.value,
      picture: editingPicture.value,
      website: editingWebsite.value,
      status: editingStatus.value,
    });
    message.value = "Profile published.";
    setTimeout(() => (message.value = ""), 3000);
  } catch (e) {
    error.value = e.message || "Failed to publish profile.";
  } finally {
    profileBusy.value = false;
  }
}

function seedEditingFields() {
  editingName.value = identity.profileName;
  editingAbout.value = identity.profileAbout;
  editingPicture.value = identity.profilePicture;
  editingWebsite.value = identity.profileWebsite;
  editingStatus.value = identity.profileStatus;
}

onMounted(() => {
  identity.init().then(() => {
    seedEditingFields();
    identity.loadProfile().then(seedEditingFields);
  });
});
</script>

<template>
  <div class="min-h-screen bg-black text-white">
    <main class="app-page-shell mx-auto px-4 py-6 lg:px-8">
      <div class="max-w-2xl mx-auto space-y-5">
      <!-- Avatar -->
      <div class="flex flex-col items-center gap-3">
        <div
          class="relative group/avatar cursor-pointer"
          @click="pictureFileInput?.click()"
          :title="uploadBusy ? 'Uploading…' : 'Tap to change photo'"
        >
          <div class="transition-transform duration-300 group-hover/avatar:scale-105">
            <RoboAvatar
              :pubkey="identity.pubkeyHex"
              :src="editingPicture"
              size="hero"
              alt="Your avatar"
              :story-ring="false"
              :hoverable="true"
            />
          </div>
          <div
            class="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-200 pointer-events-none"
          >
            <Camera
              v-if="!uploadBusy"
              class="w-7 h-7 text-white drop-shadow"
              :stroke-width="1.8"
              aria-hidden="true"
            />
            <LoaderCircle
              v-else
              class="w-7 h-7 text-white animate-spin"
              :stroke-width="2"
              aria-hidden="true"
            />
          </div>
        </div>
        <input
          ref="pictureFileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handlePictureUpload"
        />
        <p class="text-base font-bold">
          {{ identity.profileName || pubkeyName(identity.pubkeyHex) }}
        </p>
      </div>

      <!-- Profile form -->
      <div v-if="identity.pubkeyHex" class="rounded-2xl bg-white/[0.04] p-4 space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-zinc-300">Profile</span>
          <User class="w-3.5 h-3.5 text-zinc-400" :stroke-width="2" aria-hidden="true" />
        </div>

        <!-- Display name -->
        <div class="space-y-1.5">
          <label class="text-xs text-zinc-300"
            >Display name <span class="text-red-500">*</span></label
          >
          <input
            v-model="editingName"
            type="text"
            placeholder="e.g. Alice"
            maxlength="100"
            autocomplete="off"
            class="w-full rounded-full bg-white/8 px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:bg-white/12 transition-colors"
            @keydown.enter="canSaveProfile && saveProfile()"
          />
        </div>

        <!-- Bio -->
        <div class="space-y-1.5">
          <label class="text-xs text-zinc-300">Bio</label>
          <textarea
            v-model="editingAbout"
            rows="3"
            maxlength="500"
            placeholder="Tell people a bit about yourself…"
            autocomplete="off"
            class="w-full rounded-2xl bg-white/8 px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:bg-white/12 resize-none leading-relaxed transition-colors"
          />
          <p class="text-[11px] text-zinc-400 text-right">{{ editingAbout.length }}/500</p>
        </div>

        <!-- Website -->
        <div class="space-y-1.5">
          <label class="text-xs text-zinc-300">Website</label>
          <input
            v-model="editingWebsite"
            type="url"
            placeholder="https://your-site.example"
            maxlength="200"
            autocomplete="off"
            class="w-full rounded-full bg-white/8 px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:bg-white/12 transition-colors"
          />
        </div>

        <!-- Picture URL -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <label class="text-xs text-zinc-300">Profile picture URL</label>
            <button
              @click="pictureFileInput?.click()"
              :disabled="uploadBusy"
              class="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-white/8 hover:bg-white/14 text-zinc-400 transition-colors disabled:opacity-50 shrink-0"
            >
              <LoaderCircle v-if="uploadBusy" class="w-3.5 h-3.5 animate-spin" :stroke-width="2" />
              <Camera v-else class="w-3.5 h-3.5" :stroke-width="1.8" />
              {{ uploadBusy ? "Uploading…" : "Upload" }}
            </button>
          </div>
          <input
            v-model="editingPicture"
            type="url"
            placeholder="https://ipfs.io/ipfs/Qm… or any image URL"
            maxlength="2000"
            autocomplete="off"
            class="w-full rounded-full bg-white/8 px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:bg-white/12 transition-colors"
          />
        </div>

        <div class="h-px bg-white/8" />

        <!-- Status -->
        <div class="space-y-1.5">
          <label class="flex items-center gap-1.5 text-xs text-zinc-300">
            <Radio class="w-3 h-3" :stroke-width="2" aria-hidden="true" />
            Status
          </label>
          <input
            v-model="editingStatus"
            type="text"
            placeholder="e.g. Building something cool…"
            maxlength="150"
            autocomplete="off"
            class="w-full rounded-full bg-white/8 px-4 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:bg-white/12 transition-colors"
            @keydown.enter="canSaveProfile && saveProfile()"
          />
          <p class="text-[11px] text-zinc-400 text-right">{{ editingStatus.length }}/150</p>
        </div>

        <PrimaryButton @click="saveProfile" :disabled="!canSaveProfile" :loading="profileBusy">
          {{ profileBusy ? "Publishing…" : "Publish Profile" }}
        </PrimaryButton>
        <p class="text-[11px] text-zinc-400">
          Published to the network and readable by any compatible client.
        </p>
      </div>

      <!-- Keys link -->
      <button
        @click="router.push('/keys')"
        class="w-full inline-flex items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3 transition-colors hover:bg-white/[0.07]"
      >
        <div class="flex items-center gap-3">
          <KeyRound class="w-4 h-4 text-zinc-300 shrink-0" :stroke-width="1.8" aria-hidden="true" />
          <div class="text-left">
            <p class="text-sm font-semibold text-white">Keys & Account</p>
            <p class="text-[11px] text-zinc-300 mt-0.5">
              Backup, restore, and manage your private key
            </p>
          </div>
        </div>
        <span class="text-zinc-300 text-lg leading-none">›</span>
      </button>

      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />
      </div>
    </main>
  </div>
</template>
