<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Camera, KeyRound, LoaderCircle, User, Check, Copy, Eye, EyeOff } from "lucide-vue-next";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { pubkeyName, npubFromPubkey } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";
import { api } from "@/lib/api";

// Shadcn UI components
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";

const identity = useIdentityStore();
const router = useRouter();

const message = ref("");
const error = ref("");

// ── profile + status editing ──────────────────────────────────
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

// ── keys logic ─────────────────────────────────────────────────
const npub = computed(() => npubFromPubkey(identity.pubkeyHex) || "");

const npubCopied = ref(false);
async function copyNpub() {
  if (!npub.value) return;
  await navigator.clipboard.writeText(npub.value);
  npubCopied.value = true;
  setTimeout(() => (npubCopied.value = false), 2000);
}

const copied = ref(false);
async function copyPubkey() {
  await navigator.clipboard.writeText(identity.pubkeyHex);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

const showPrivkey = ref(false);
const privkeyCopied = ref(false);
async function copyPrivkey() {
  await navigator.clipboard.writeText(identity.privkeyHex);
  privkeyCopied.value = true;
  setTimeout(() => (privkeyCopied.value = false), 2000);
}

const rawKey = ref("");
const restoreBusy = ref(false);
const canRestoreKey = computed(() => rawKey.value.trim().length > 0 && !restoreBusy.value);
async function loadFromKey() {
  error.value = "";
  message.value = "";
  restoreBusy.value = true;
  try {
    await identity.restorePrivateKey(rawKey.value.trim());
    rawKey.value = "";
    message.value = "Identity restored. Redirecting…";
    setTimeout(() => window.location.assign("/"), 350);
  } catch (e) {
    error.value = e.message || "Failed to restore identity.";
  } finally {
    restoreBusy.value = false;
  }
}

const passphrase = ref("");
const pin = ref("");
const busy = ref(false);
const passphraseOk = computed(() => passphrase.value.length >= 8);
const canSubmit = computed(() => passphraseOk.value && pin.value.trim().length > 0 && !busy.value);
async function loadAccount() {
  error.value = "";
  message.value = "";
  busy.value = true;
  try {
    await identity.deriveIdentity(passphrase.value, pin.value);
    passphrase.value = "";
    pin.value = "";
    message.value = "Identity loaded. Redirecting…";
    setTimeout(() => window.location.assign("/"), 350);
  } catch (e) {
    error.value = e.message || "Failed to derive identity.";
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  identity.init().then(() => {
    seedEditingFields();
    identity.loadProfile().then(seedEditingFields);
  });
});
</script>

<template>
  <div class="flex-1 flex flex-col">
    <main class="w-full max-w-3xl mx-auto px-4 py-8 space-y-8">
      <!-- Avatar & Name Header -->
      <div class="flex flex-col items-center gap-4">
        <div
          class="relative group/avatar cursor-pointer rounded-full"
          @click="pictureFileInput?.click()"
          :title="uploadBusy ? 'Uploading…' : 'Tap to change photo'"
        >
          <div
            class="rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 p-1 transition-transform duration-300 group-hover/avatar:scale-105"
          >
            <RoboAvatar
              :pubkey="identity.pubkeyHex"
              :src="editingPicture"
              size="hero"
              alt="Your avatar"
            />
          </div>
          <div
            class="absolute inset-0 flex items-center justify-center rounded-full bg-background/55 opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-200 pointer-events-none"
          >
            <Camera v-if="!uploadBusy" class="w-8 h-8 text-foreground drop-shadow" />
            <LoaderCircle v-else class="w-8 h-8 text-foreground animate-spin" />
          </div>
        </div>
        <input
          ref="pictureFileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handlePictureUpload"
        />
        <h1 class="text-2xl font-bold tracking-tight">
          {{ identity.profileName || pubkeyName(identity.pubkeyHex) }}
        </h1>
      </div>

      <AppAlertBanner v-if="message" :message="message" variant="success" />
      <AppAlertBanner v-if="error" :message="error" />

      <div class="space-y-6" v-if="identity.pubkeyHex">
        <Accordion type="multiple" class="w-full space-y-4" :default-value="['profile']">
          <!-- Profile Details Card/Accordion -->
          <Card class="overflow-hidden p-0 gap-0 py-0">
            <AccordionItem value="profile" class="border-none">
              <AccordionTrigger
                class="px-6 py-5 hover:bg-muted/50 transition-colors hover:no-underline [&[data-state=open]>div>svg]:text-primary"
              >
                <div class="flex items-center gap-2">
                  <User class="w-5 h-5 text-muted-foreground transition-colors" />
                  <CardTitle class="text-lg">Profile Details</CardTitle>
                </div>
              </AccordionTrigger>
              <AccordionContent class="px-6 pb-6 pt-0">
                <div class="grid gap-6 sm:grid-cols-2 pt-2">
                  <div class="space-y-2">
                    <Label for="displayName"
                      >Display name <span class="text-destructive">*</span></Label
                    >
                    <Input
                      id="displayName"
                      v-model="editingName"
                      placeholder="e.g. Alice"
                      maxlength="100"
                      @keydown.enter="canSaveProfile && saveProfile()"
                    />
                  </div>

                  <div class="space-y-2">
                    <Label for="website">Website</Label>
                    <Input
                      id="website"
                      v-model="editingWebsite"
                      type="url"
                      placeholder="https://your-site.example"
                      maxlength="200"
                    />
                  </div>

                  <div class="space-y-2 sm:col-span-2">
                    <div class="flex items-center justify-between">
                      <Label for="pictureUrl">Profile picture URL</Label>
                      <Button
                        variant="secondary"
                        size="sm"
                        @click="pictureFileInput?.click()"
                        :disabled="uploadBusy"
                      >
                        <LoaderCircle v-if="uploadBusy" class="w-4 h-4 mr-2 animate-spin" />
                        <Camera v-else class="w-4 h-4 mr-2" />
                        {{ uploadBusy ? "Uploading…" : "Upload image" }}
                      </Button>
                    </div>
                    <Input
                      id="pictureUrl"
                      v-model="editingPicture"
                      type="url"
                      placeholder="https://ipfs.io/ipfs/Qm… or any image URL"
                      maxlength="2000"
                    />
                  </div>

                  <div class="space-y-2 sm:col-span-2">
                    <Label for="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      v-model="editingAbout"
                      rows="3"
                      maxlength="500"
                      placeholder="Tell people a bit about yourself…"
                      class="resize-none"
                    />
                    <div class="text-xs text-muted-foreground text-right">
                      {{ editingAbout.length }}/500
                    </div>
                  </div>

                  <div class="space-y-2 sm:col-span-2">
                    <Label for="status">Status</Label>
                    <Input
                      id="status"
                      v-model="editingStatus"
                      placeholder="e.g. Building something cool…"
                      maxlength="150"
                      @keydown.enter="canSaveProfile && saveProfile()"
                    />
                    <div class="text-xs text-muted-foreground text-right">
                      {{ editingStatus.length }}/150
                    </div>
                  </div>
                </div>
                <div class="flex flex-col items-start gap-2 pt-6 border-t mt-6">
                  <Button
                    @click="saveProfile"
                    :disabled="!canSaveProfile"
                    class="w-full sm:w-auto mt-4"
                  >
                    <LoaderCircle v-if="profileBusy" class="w-4 h-4 mr-2 animate-spin" />
                    {{ profileBusy ? "Publishing…" : "Publish Profile" }}
                  </Button>
                  <p class="text-xs text-muted-foreground">
                    Published to the network and readable by any compatible client.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Card>

          <!-- Keys & Account Card/Accordion -->
          <Card class="overflow-hidden p-0 gap-0 py-0">
            <AccordionItem value="keys" class="border-none">
              <AccordionTrigger
                class="px-6 py-5 hover:bg-muted/50 transition-colors hover:no-underline [&[data-state=open]>div>svg]:text-primary"
              >
                <div class="flex items-center gap-2">
                  <KeyRound class="w-5 h-5 text-muted-foreground transition-colors" />
                  <CardTitle class="text-lg">Keys & Account</CardTitle>
                </div>
              </AccordionTrigger>
              <AccordionContent class="px-6 pb-6 pt-0">
                <div class="space-y-6 pt-2">
                  <div class="space-y-4">
                    <h3 class="text-sm font-medium leading-none">Your Identity Keys</h3>

                    <div v-if="npub" class="rounded-lg border bg-muted/50 p-4 space-y-2">
                      <div class="flex items-center justify-between">
                        <Label
                          class="text-xs font-semibold uppercase text-muted-foreground tracking-wider"
                          >Nostr npub</Label
                        >
                        <Button
                          variant="ghost"
                          size="sm"
                          @click="copyNpub"
                          :class="npubCopied ? 'text-emerald-500' : ''"
                        >
                          <Check v-if="npubCopied" class="w-4 h-4 mr-2" />
                          <Copy v-else class="w-4 h-4 mr-2" />
                          {{ npubCopied ? "Copied" : "Copy npub" }}
                        </Button>
                      </div>
                      <p class="text-xs font-mono break-all text-foreground select-all">
                        {{ npub }}
                      </p>
                    </div>

                    <div
                      v-if="identity.pubkeyHex"
                      class="rounded-lg border bg-muted/50 p-4 space-y-2"
                    >
                      <div class="flex items-center justify-between">
                        <Label
                          class="text-xs font-semibold uppercase text-muted-foreground tracking-wider"
                          >Raw public key</Label
                        >
                        <Button
                          variant="ghost"
                          size="sm"
                          @click="copyPubkey"
                          :class="copied ? 'text-emerald-500' : ''"
                        >
                          <Check v-if="copied" class="w-4 h-4 mr-2" />
                          <Copy v-else class="w-4 h-4 mr-2" />
                          {{ copied ? "Copied" : "Copy" }}
                        </Button>
                      </div>
                      <p class="text-xs font-mono break-all text-foreground">
                        {{ identity.pubkeyHex }}
                      </p>
                    </div>

                    <div
                      v-if="identity.privkeyHex"
                      class="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-3"
                    >
                      <div class="flex items-center justify-between">
                        <Label
                          class="text-xs font-semibold uppercase text-destructive tracking-wider"
                          >Private Key</Label
                        >
                        <Button variant="outline" size="sm" @click="showPrivkey = !showPrivkey">
                          <EyeOff v-if="showPrivkey" class="w-4 h-4 mr-2" />
                          <Eye v-else class="w-4 h-4 mr-2" />
                          {{ showPrivkey ? "Hide" : "Reveal" }}
                        </Button>
                      </div>
                      <div v-if="showPrivkey" class="space-y-2">
                        <p
                          class="text-xs font-mono break-all text-foreground select-all bg-background p-2 rounded-md border"
                        >
                          {{ identity.privkeyHex }}
                        </p>
                        <p class="text-xs font-medium text-destructive">
                          Never share this with anyone. Anyone with this key controls your account.
                        </p>
                        <Button variant="destructive" class="w-full mt-2" @click="copyPrivkey">
                          <Check v-if="privkeyCopied" class="w-4 h-4 mr-2" />
                          <KeyRound v-else class="w-4 h-4 mr-2" />
                          {{ privkeyCopied ? "Copied!" : "Copy Private Key" }}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div class="space-y-4">
                    <h3 class="text-sm font-medium leading-none">Restore Account</h3>

                    <div class="grid grid-cols-1 gap-6">
                      <!-- Option 1 -->
                      <div class="space-y-3">
                        <Label>From private key or backup file</Label>
                        <Textarea
                          v-model="rawKey"
                          rows="3"
                          placeholder="Paste your 64-character hex private key or backup JSON here…"
                          class="font-mono text-xs resize-none"
                        />
                        <Button
                          @click="loadFromKey"
                          :disabled="!canRestoreKey"
                          variant="secondary"
                          class="w-full"
                        >
                          <LoaderCircle v-if="restoreBusy" class="w-4 h-4 mr-2 animate-spin" />
                          {{ restoreBusy ? "Restoring…" : "Restore from key" }}
                        </Button>
                      </div>

                      <!-- Option 2 -->
                      <div class="space-y-3">
                        <div>
                          <Label>From passphrase + PIN</Label>
                          <p class="text-xs text-muted-foreground mt-1">
                            Same passphrase + PIN always unlocks the same account.
                          </p>
                        </div>
                        <div class="space-y-1">
                          <Input
                            v-model="passphrase"
                            type="password"
                            placeholder="Passphrase (min 8 characters)"
                            :class="
                              passphrase.length > 0 && !passphraseOk ? 'border-destructive' : ''
                            "
                          />
                          <p
                            v-if="passphrase.length > 0 && !passphraseOk"
                            class="text-[10px] text-destructive"
                          >
                            At least 8 characters required ({{ passphrase.length }}/8)
                          </p>
                        </div>
                        <Input
                          v-model="pin"
                          type="text"
                          inputmode="numeric"
                          pattern="[0-9]*"
                          placeholder="PIN (numeric, e.g. 2847)"
                          class="font-mono tracking-widest"
                          @keydown.enter="canSubmit && loadAccount()"
                        />
                        <Button
                          @click="loadAccount"
                          :disabled="!canSubmit"
                          variant="secondary"
                          class="w-full"
                        >
                          <LoaderCircle v-if="busy" class="w-4 h-4 mr-2 animate-spin" />
                          {{ busy ? "Loading…" : "Load Account" }}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Card>
        </Accordion>
      </div>
    </main>
  </div>
</template>
