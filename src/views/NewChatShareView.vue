<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  Check,
  Clock,
  Copy,
  KeyRound,
  Link2,
  QrCode,
  RefreshCw,
  ScanLine,
  Sparkles,
} from "@lucide/vue";
import QRCode from "qrcode";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import PageBackHeader from "@/components/PageBackHeader.vue";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { copyToClipboard } from "@/lib/clipboard";
import { createTempInvite } from "@/lib/invites";
import { publicAppBaseUrl } from "@/lib/runtime";
import { startAppSync } from "@/lib/sync";
import { useIdentityStore } from "@/stores/identity";

const router = useRouter();
const identity = useIdentityStore();

const pubkeyCopied = ref(false);
const profileLinkCopied = ref(false);
const inviteCopied = ref(false);
const inviteBusy = ref(false);
const inviteError = ref("");
const activeInvite = ref(null);
const showInviteQr = ref(false);
const inviteQrCanvas = ref(null);

const initPromise = identity.init().then(() => {
  void startAppSync(identity);
});

const profileLink = computed(() =>
  identity.pubkeyHex ? `${publicAppBaseUrl()}/#/profile/${identity.pubkeyHex}` : "",
);

function flashCopied(state) {
  state.value = true;
  setTimeout(() => (state.value = false), 1500);
}

async function copyPubkey() {
  await copyToClipboard(identity.pubkeyHex);
  flashCopied(pubkeyCopied);
}

async function copyProfileLink() {
  if (!profileLink.value) return;
  await copyToClipboard(profileLink.value);
  flashCopied(profileLinkCopied);
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
      displayName: identity.profileName,
    });
    inviteCopied.value = false;
    showInviteQr.value = false;
  } catch (e) {
    inviteError.value = e.message || "Unable to create invite.";
  } finally {
    inviteBusy.value = false;
  }
}

async function renderInviteQr() {
  if (!activeInvite.value?.inviteUrl || !inviteQrCanvas.value) return;
  try {
    await QRCode.toCanvas(inviteQrCanvas.value, activeInvite.value.inviteUrl, {
      width: 220,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {}
}

async function toggleInviteQr() {
  showInviteQr.value = !showInviteQr.value;
  if (showInviteQr.value) {
    await nextTick();
    await renderInviteQr();
  }
}

watch(
  () => activeInvite.value?.inviteUrl,
  () => {
    if (showInviteQr.value) void renderInviteQr();
  },
);
</script>

<template>
  <main
    class="min-h-dvh overflow-y-auto overflow-x-hidden bg-(--app-bg) text-(--app-text) lg:h-full"
  >
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl space-y-8">
        <PageBackHeader
          back-to="/messages"
          back-label="Messages"
          eyebrow="Share invite"
          title="Share a private invite"
        >
          <p class="text-sm leading-6 text-(--app-muted)">
            Generate a link that hides your public key — safe to drop in WhatsApp, Telegram, or SMS.
          </p>
        </PageBackHeader>

        <section v-if="identity.pubkeyHex" class="space-y-4">
          <div
            class="relative overflow-hidden border border-(--app-border) bg-(--app-surface) shadow-sm rounded-2xl border-(--app-primary)/35 p-4 ring-1 ring-(--app-primary)/25 sm:p-5 space-y-4"
          >
            <div
              class="pointer-events-none absolute inset-x-0 top-0 h-24 bg-(--app-surface-soft)"
              aria-hidden="true"
            />

            <div class="relative space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <p class="inline-flex items-center gap-1.5 text-sm font-semibold text-(--app-text)">
                  <Link2
                    class="h-4 w-4 text-(--app-primary)"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  Invite link
                </p>
                <span
                  class="inline-flex items-center gap-1 rounded-full border border-(--app-primary)/35 bg-(--app-primary)/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-(--app-primary)"
                >
                  <Sparkles class="h-3 w-3" :stroke-width="2.2" aria-hidden="true" />
                  Recommended
                </span>
              </div>

              <div
                class="rounded-2xl border border-(--app-primary)/25 bg-(--app-primary)/10 px-4 py-3.5"
              >
                <p class="text-sm font-semibold leading-snug text-(--app-text)">
                  Best for one-off intros in chat apps where your public key would stay in history.
                </p>
                <p class="mt-2 text-xs leading-relaxed text-(--app-muted)">
                  WhatsApp, Telegram, and iMessage keep messages forever. An invite shares an opaque
                  link instead of your raw hex key.
                </p>
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
                <p class="text-[11px] font-semibold uppercase tracking-wider text-(--app-muted)">
                  Invite link
                </p>
                <p class="break-all font-mono text-xs leading-relaxed text-(--app-text)">
                  {{ activeInvite.inviteUrl }}
                </p>
              </div>

              <button
                type="button"
                class="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) px-4 py-3 text-sm font-semibold transition-colors"
                :class="
                  inviteCopied
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                    : 'text-(--app-text-soft)'
                "
                @click="copyInviteLink"
              >
                <Check v-if="inviteCopied" class="h-4 w-4" :stroke-width="2.5" aria-hidden="true" />
                <Link2 v-else class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                {{ inviteCopied ? "Link copied" : "Copy invite link" }}
              </button>

              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="inline-flex items-center justify-center gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3 text-sm font-semibold text-(--app-text-soft) transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                  @click="toggleInviteQr"
                >
                  <QrCode class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                  {{ showInviteQr ? "Hide QR" : "Show QR code" }}
                </button>
                <button
                  type="button"
                  class="inline-flex items-center justify-center gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3 text-sm font-semibold text-(--app-text-soft) transition-colors hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                  @click="router.push('/scan')"
                >
                  <ScanLine class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                  Scan QR
                </button>
              </div>

              <div v-if="showInviteQr" class="flex justify-center rounded-2xl bg-white p-4">
                <canvas
                  ref="inviteQrCanvas"
                  class="h-auto max-w-full"
                  aria-label="Invite QR code"
                />
              </div>
            </div>
          </div>

          <div
            class="border border-(--app-border) bg-(--app-surface) shadow-sm rounded-2xl p-4 sm:p-5 space-y-4"
          >
            <div class="space-y-1">
              <p class="inline-flex items-center gap-1.5 text-sm font-semibold text-(--app-text)">
                <KeyRound class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                Profile link
              </p>
              <p class="text-[11px] text-(--app-muted) leading-relaxed">
                For people already on Gupt — share this permanent link so they can open your profile
                and start an encrypted chat.
              </p>
            </div>

            <div class="space-y-2">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-(--app-muted)">
                Your profile link
              </p>
              <p
                class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2.5 text-xs text-(--app-text) break-all leading-relaxed select-all"
              >
                {{ profileLink }}
              </p>
              <button
                type="button"
                class="inline-flex items-center justify-center gap-1 rounded-full border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) px-3 py-1 text-xs transition-colors"
                :class="profileLinkCopied ? 'text-emerald-500' : 'text-(--app-muted)'"
                @click="copyProfileLink"
              >
                <Copy
                  v-if="!profileLinkCopied"
                  class="h-3.5 w-3.5"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <Check v-else class="h-3.5 w-3.5" :stroke-width="2.5" aria-hidden="true" />
                {{ profileLinkCopied ? "Copied" : "Copy profile link" }}
              </button>
            </div>

            <div class="h-px bg-(--app-border)" />

            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <p class="text-xs font-semibold text-(--app-text)">Public key</p>
                <p class="text-[11px] text-(--app-muted)">Or paste the raw key on Start chat.</p>
              </div>
              <button
                type="button"
                class="inline-flex shrink-0 items-center justify-center gap-1 rounded-full border border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text) px-3 py-1 text-xs transition-colors"
                :class="pubkeyCopied ? 'text-emerald-500' : 'text-(--app-muted)'"
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
              class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 py-2.5 text-xs font-mono text-(--app-text) break-all leading-relaxed select-all"
            >
              {{ identity.pubkeyHex }}
            </p>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
