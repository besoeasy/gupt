<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { Check, Copy, KeyRound, Link2 } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppSkeleton from "@/components/AppSkeleton.vue";
import PageBackHeader from "@/components/PageBackHeader.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { buildRelayInviteUrl, selectTopRelays } from "@/lib/relayInvite";
import { useIdentityStore } from "@/stores/identity";

const identity = useIdentityStore();
const loading = ref(true);
const error = ref("");
const inviteUrl = ref("");
const copied = ref("");
let copiedTimer = null;

async function loadInvite() {
  loading.value = true;
  error.value = "";
  try {
    await identity.init();
    if (!identity.pubkeyHex) {
      error.value = "No identity is loaded on this device.";
      return;
    }
    const relays = await selectTopRelays();
    inviteUrl.value = buildRelayInviteUrl(identity.pubkeyHex, relays);
    if (!inviteUrl.value) error.value = "Could not build your invite link.";
  } catch (e) {
    error.value = e.message || "Could not build your invite link.";
  } finally {
    loading.value = false;
  }
}

async function copyValue(value, key) {
  if (!value) return;
  await copyToClipboard(value);
  copied.value = key;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copied.value = ""), 2000);
}

onMounted(loadInvite);

onUnmounted(() => clearTimeout(copiedTimer));
</script>

<template>
  <div class="h-full w-full min-w-0 overflow-y-auto bg-black text-zinc-100 pb-16">
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-5">
      <PageBackHeader
        back-to="/chat"
        back-label="Chat"
        eyebrow="Share"
        title="Invite"
        eyebrow-class="text-zinc-500"
      >
        <p class="text-sm leading-6 text-zinc-500">
          Send a link that carries your profile ID and the relays where friends can reach you.
        </p>
      </PageBackHeader>

      <AppAlertBanner v-if="error" :message="error" />

      <div v-if="loading" class="space-y-5" role="status">
        <span class="sr-only">Building your invite…</span>
        <div
          class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 shadow-xs sm:p-5"
          aria-hidden="true"
        >
          <AppSkeleton class="h-4 w-24" />
          <AppSkeleton class="mt-2 h-3 w-64 max-w-full" />
          <AppSkeleton class="mt-4 h-10 w-full rounded-lg" />
        </div>
        <div
          class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 shadow-xs sm:p-5"
          aria-hidden="true"
        >
          <AppSkeleton class="h-4 w-24" />
          <AppSkeleton class="mt-2 h-3 w-56 max-w-full" />
          <AppSkeleton class="mt-4 h-12 w-full rounded-lg" />
        </div>
      </div>

      <template v-else-if="!error">
        <section
          class="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 shadow-xs sm:p-5"
        >
          <div class="space-y-1">
            <h2 class="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-white">
              <Link2 class="h-4 w-4 text-zinc-400" :stroke-width="2" aria-hidden="true" />
              Invite link
            </h2>
            <p class="text-xs leading-relaxed text-zinc-500">
              Anyone with this link can open a chat with you. It never includes your private keys.
            </p>
          </div>

          <div class="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <p
              class="min-w-0 flex-1 break-all rounded-lg border border-zinc-800 bg-black/40 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-300 select-all"
            >
              {{ inviteUrl }}
            </p>
            <button
              type="button"
              class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 shadow-xs transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95 cursor-pointer"
              :title="copied === 'url' ? 'Invite link copied!' : 'Copy invite link'"
              @click="copyValue(inviteUrl, 'url')"
            >
              <Check
                v-if="copied === 'url'"
                class="h-3.5 w-3.5 text-emerald-400"
                :stroke-width="2.5"
              />
              <Copy v-else class="h-3.5 w-3.5" :stroke-width="2" />
              <span>{{ copied === "url" ? "Copied" : "Copy" }}</span>
            </button>
          </div>
        </section>

        <section class="space-y-3">
          <div class="px-1">
            <h2 class="text-sm font-semibold tracking-tight text-white">Profile ID</h2>
            <p class="mt-0.5 text-xs leading-relaxed text-zinc-500">
              Your public key. Click to copy it for someone who prefers to add you directly.
            </p>
          </div>

          <button
            type="button"
            class="group flex w-full items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900/50 sm:p-3.5 cursor-pointer"
            :title="copied === 'id' ? 'Profile ID copied!' : 'Copy your profile ID'"
            @click="copyValue(identity.pubkeyHex, 'id')"
          >
            <span
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 sm:h-11 sm:w-11"
            >
              <KeyRound class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-xs font-semibold tracking-tight text-zinc-200">
                {{ copied === "id" ? "Copied to clipboard" : "Public key" }}
              </span>
              <span
                class="mt-1 block break-all font-mono text-[11px] leading-relaxed text-zinc-400"
              >
                {{ identity.pubkeyHex }}
              </span>
            </span>
            <Check
              v-if="copied === 'id'"
              class="h-4 w-4 shrink-0 text-emerald-400"
              :stroke-width="2.5"
              aria-hidden="true"
            />
            <Copy
              v-else
              class="h-4 w-4 shrink-0 text-zinc-500 transition-colors group-hover:text-zinc-300"
              :stroke-width="2"
              aria-hidden="true"
            />
          </button>
        </section>
      </template>
    </div>
  </div>
</template>
