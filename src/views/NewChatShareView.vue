<script setup>
import { computed, onMounted, ref } from "vue";
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Globe,
  Link2,
  RefreshCw,
} from "lucide-vue-next";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { INVITE_TTL_OPTIONS, createTempInvite, formatInviteExpiry } from "@/lib/invites";
import { startAppSync } from "@/lib/sync";
import { useIdentityStore } from "@/stores/identity";

const identity = useIdentityStore();

const pubkeyCopied = ref(false);
const inviteCopied = ref(false);
const inviteBusy = ref(false);
const inviteError = ref("");
const selectedTtlId = ref("24h");
const activeInvite = ref(null);

const initPromise = identity.init().then(() => {
  void startAppSync(identity);
});

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
  flashCopied(pubkeyCopied);
}

async function copyInviteLink() {
  if (!activeInvite.value?.inviteUrl) return;
  await copyToClipboard(activeInvite.value.inviteUrl);
  flashCopied(inviteCopied);
}

onMounted(() => {
  void initPromise;
});

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
</script>

<template>
  <main class="chat-shell min-h-dvh overflow-y-auto lg:h-full">
    <div class="app-page-shell mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <header class="space-y-4 border-b border-white/8 pb-6">
          <router-link
            to="/new"
            class="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-white"
          >
            <ArrowLeft class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
            New conversation
          </router-link>
          <div class="space-y-1.5">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-success)">
              Share invite
            </p>
            <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Let someone reach you</h1>
            <p class="text-sm leading-6 ui-muted">
              Share a temporary link for WhatsApp, Signal, or email. Your public key stays hidden,
              the link expires, and it works once.
            </p>
          </div>
        </header>

        <section v-if="identity.pubkeyHex" class="space-y-4">
          <div class="ui-panel rounded-2xl p-4 sm:p-5 space-y-4">
            <div class="space-y-1">
              <p class="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-300">
                <Link2 class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                Temporary invite link
              </p>
              <p class="text-[11px] ui-muted leading-relaxed">
                Best for one-off intros in chat apps where your public key would stay in history.
              </p>
            </div>

            <div class="space-y-2">
              <label class="text-xs text-zinc-300">Link lifetime</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="option in INVITE_TTL_OPTIONS"
                  :key="option.id"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all"
                  :class="
                    selectedTtlId === option.id
                      ? 'border-(--app-primary)/40 bg-(--app-primary)/15 text-(--app-primary)'
                      : 'border-(--app-border) bg-(--app-surface-soft) text-zinc-400 hover:border-(--app-border-strong) hover:text-zinc-200'
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
              class="space-y-3 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-4"
            >
              <div class="space-y-1">
                <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Invite link
                </p>
                <p class="break-all font-mono text-xs leading-relaxed text-zinc-300">
                  {{ activeInvite.inviteUrl }}
                </p>
                <p class="text-[11px] ui-muted">
                  Expires in {{ formatInviteExpiry(activeInvite.expiresAt) }}
                </p>
              </div>

              <button
                type="button"
                class="ui-icon-button inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors"
                :class="
                  inviteCopied
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'text-zinc-300'
                "
                @click="copyInviteLink"
              >
                <Check v-if="inviteCopied" class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
                <Link2 v-else class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                {{ inviteCopied ? "Link copied" : "Copy invite link" }}
              </button>
            </div>
          </div>

          <div class="ui-panel rounded-2xl p-4 sm:p-5 space-y-4">
            <div class="space-y-1">
              <p class="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-300">
                <Globe class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                Domain contact
              </p>
              <p class="text-[11px] ui-muted leading-relaxed">
                For a permanent contact point, publish a TXT record at
                <span class="font-mono text-zinc-400">gupt.yourdomain.com</span>
                with your public key. Visitors enter
                <span class="font-mono text-zinc-400">yourdomain.com</span>
                on Start chat — ideal for anonymous website support.
              </p>
            </div>

            <router-link
              to="/me?tab=identity"
              class="inline-flex w-full items-center justify-center rounded-2xl bg-(--app-primary)/10 px-4 py-3 text-sm font-semibold text-(--app-primary) transition-colors hover:bg-(--app-primary)/15"
            >
              Get your TXT record
            </router-link>

            <div class="h-px bg-white/8" />

            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <p class="text-xs font-semibold text-zinc-300">Public key</p>
                <p class="text-[11px] ui-muted">For direct adds in Gupt or other Nostr clients.</p>
              </div>
              <button
                type="button"
                class="ui-icon-button inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs transition-colors"
                :class="pubkeyCopied ? 'text-emerald-400' : 'text-zinc-400'"
                @click="copyPubkey"
              >
                <Copy
                  v-if="!pubkeyCopied"
                  class="h-3.5 w-3.5"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <Check v-else class="h-3.5 w-3.5" :stroke-width="2.5" aria-hidden="true" />
                {{ pubkeyCopied ? "Copied" : "Copy" }}
              </button>
            </div>

            <p
              class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2.5 text-xs font-mono text-zinc-300 break-all leading-relaxed select-all"
            >
              {{ identity.pubkeyHex }}
            </p>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>