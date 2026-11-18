<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Bell, Check, Phone, Video, ShieldCheck, Users, Info, Timer } from "@lucide/vue";
import { roboHashUrl } from "@/lib/crypto";

const props = defineProps({
  isGroup: { type: Boolean, default: false },
  title: { type: String, default: "" },
  peerPubkey: { type: String, default: "" },
  peerAvatar: { type: String, default: "" },
  groupAvatar: { type: String, default: "" },
  lastSeenLabel: { type: String, default: "" },
  lastSeenLoading: { type: Boolean, default: false },
  sentCount: { type: Number, default: 0 },
  isTrusted: { type: Boolean, default: false },
  memberCount: { type: Number, default: 0 },
  drawerOpen: { type: Boolean, default: false },
  canStartCall: { type: Boolean, default: false },
  timerLabel: { type: String, default: "" },
  canPing: { type: Boolean, default: false },
  pingLabel: { type: String, default: "" },
  pingSent: { type: Boolean, default: false },
  pingCooldown: { type: Boolean, default: false },
  pingSending: { type: Boolean, default: false },
});

const emit = defineEmits(["back", "start-audio-call", "start-video-call", "ping", "toggle-drawer"]);

const router = useRouter();

// 44px touch targets, one idle look for every action in the bar.
const ACTION_BASE =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_55%,transparent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100";
const ACTION_IDLE =
  "border-(--app-border) bg-(--app-surface-soft) text-(--app-text-soft) hover:border-(--app-border-strong) hover:bg-(--app-surface-hover) hover:text-(--app-text)";

const displayTitle = computed(() => props.title || (props.isGroup ? "Group" : "Conversation"));
const avatarSrc = computed(() => {
  if (props.isGroup) return props.groupAvatar || roboHashUrl(props.peerPubkey || "group");
  return props.peerAvatar || roboHashUrl(props.peerPubkey || "");
});
const statusText = computed(() => {
  if (props.isGroup) {
    return `${props.memberCount} member${props.memberCount === 1 ? "" : "s"}`;
  }
  if (props.lastSeenLoading) return "checking…";
  return props.lastSeenLabel || "Encrypted message";
});
// The dot is a mood, not a presence service: green only for clearly recent
// activity, muted otherwise.
const peerIsFresh = computed(() => {
  const label = String(props.lastSeenLabel || "");
  if (!label || label === "No recent activity") return false;
  if (label === "just now") return true;
  const minutes = /^(\d+) min ago$/.exec(label);
  return Boolean(minutes && Number(minutes[1]) <= 10);
});
const trustSent = computed(() => Math.min(Math.max(props.sentCount, 0), 7));
const trustRemaining = computed(() => Math.max(7 - trustSent.value, 0));

function openIdentity() {
  if (!props.isGroup && props.peerPubkey) {
    router.push(`/profile/${props.peerPubkey}`);
    return;
  }
  emit("toggle-drawer");
}
</script>

<template>
  <div
    class="relative flex h-14 shrink-0 items-center gap-2 border-b border-(--app-border) bg-[color-mix(in_srgb,var(--app-bg)_82%,transparent)] px-2.5 backdrop-blur-xl sm:h-16 sm:gap-3 sm:px-4 md:px-5"
  >
    <!-- Identity: avatar, name, one calm status line -->
    <button
      type="button"
      @click="openIdentity"
      class="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 py-1 text-left transition-colors duration-200 hover:bg-(--app-surface-soft) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_55%,transparent)] active:scale-[0.99] sm:gap-3"
      :title="isGroup ? 'Group details' : 'View profile'"
    >
      <span class="relative shrink-0">
        <img
          :src="avatarSrc"
          :alt="displayTitle"
          width="40"
          height="40"
          class="h-10 w-10 shrink-0 rounded-xl border border-(--app-border) object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          loading="lazy"
          referrerpolicy="no-referrer"
        />
        <span
          v-if="!isGroup"
          class="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-(--app-bg) transition-colors duration-300"
          :class="peerIsFresh ? 'bg-(--app-success)' : 'bg-(--app-muted-2)'"
        />
        <span
          v-else
          class="absolute -right-1 -bottom-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-(--app-bg) bg-(--app-surface-raised) px-1 font-mono text-[9px] font-semibold text-(--app-text-soft)"
        >
          {{ memberCount }}
        </span>
      </span>

      <span class="flex min-w-0 flex-1 flex-col">
        <span class="flex min-w-0 items-center gap-1.5">
          <span
            class="truncate text-[15px] leading-5 font-semibold tracking-tight text-(--app-text) transition-colors duration-200 group-hover:text-(--app-primary)"
          >
            {{ displayTitle }}
          </span>
          <ShieldCheck
            v-if="!isGroup && isTrusted"
            class="h-3.5 w-3.5 shrink-0 text-(--app-success)"
            :stroke-width="2"
            title="Trusted contact"
            aria-label="Trusted contact"
          />
        </span>

        <span class="mt-0.5 flex min-w-0 items-center gap-1.5">
          <span
            v-if="isGroup"
            class="h-1.5 w-1.5 shrink-0 rounded-full bg-(--app-muted-2)"
            aria-hidden="true"
          />
          <span
            v-else
            class="h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-300"
            :class="
              lastSeenLoading
                ? 'animate-pulse bg-(--app-muted)'
                : peerIsFresh
                  ? 'bg-(--app-success)'
                  : 'bg-(--app-muted-2)'
            "
            aria-hidden="true"
          />
          <span class="truncate font-mono text-[11px] leading-4 text-(--app-muted)">
            {{ statusText }}
          </span>

          <span
            v-if="timerLabel && !isGroup"
            class="inline-flex shrink-0 items-center gap-1 rounded-full border border-(--app-border) bg-(--app-surface-soft) px-1.5 py-px font-mono text-[10px] text-(--app-muted)"
            :title="`Messages disappear after ${timerLabel}`"
          >
            <Timer class="h-2.5 w-2.5" :stroke-width="2" aria-hidden="true" />
            {{ timerLabel }}
          </span>

          <span
            v-if="!isGroup && !isTrusted"
            class="shrink-0 font-mono text-[10px] text-(--app-muted-2)"
            :title="`Send ${trustRemaining} more message${trustRemaining === 1 ? '' : 's'} to unlock calls`"
          >
            {{ trustSent }}/7
          </span>
        </span>
      </span>
    </button>

    <!-- Actions: ping, calls (trusted only), details -->
    <div class="flex shrink-0 items-center gap-1 sm:gap-1.5">
      <!-- Wake the contact through ntfy when their app is closed. -->
      <button
        v-if="canPing"
        type="button"
        @click="emit('ping')"
        :disabled="pingCooldown || pingSending"
        class="gap-1.5 lg:w-auto lg:px-3"
        :class="[
          ACTION_BASE,
          pingSent
            ? 'border-[color-mix(in_srgb,var(--app-success)_40%,transparent)] bg-[var(--app-success-soft)] text-(--app-success)'
            : ACTION_IDLE,
        ]"
        :title="pingLabel || 'Ping · wake them via ntfy'"
        :aria-label="pingLabel || 'Ping · wake them via ntfy'"
        :aria-busy="pingSending"
      >
        <Check v-if="pingSent" class="h-[18px] w-[18px]" :stroke-width="2.2" aria-hidden="true" />
        <Bell
          v-else
          class="h-[18px] w-[18px]"
          :class="pingSending ? 'animate-pulse' : ''"
          :stroke-width="1.9"
          aria-hidden="true"
        />
        <span class="hidden text-[11px] font-semibold lg:inline">
          {{ pingSent ? "Pinged" : "Ping" }}
        </span>
      </button>

      <template v-if="!isGroup && isTrusted">
        <button
          type="button"
          @click="emit('start-audio-call')"
          :disabled="!canStartCall"
          :class="[ACTION_BASE, ACTION_IDLE]"
          title="Start audio call"
          aria-label="Start audio call"
        >
          <Phone class="h-[18px] w-[18px]" :stroke-width="1.9" aria-hidden="true" />
        </button>

        <button
          type="button"
          @click="emit('start-video-call')"
          :disabled="!canStartCall"
          :class="[ACTION_BASE, ACTION_IDLE]"
          title="Start video call"
          aria-label="Start video call"
        >
          <Video class="h-[18px] w-[18px]" :stroke-width="1.9" aria-hidden="true" />
        </button>
      </template>

      <button
        type="button"
        @click="emit('toggle-drawer')"
        :class="[
          ACTION_BASE,
          drawerOpen
            ? 'border-[color-mix(in_srgb,var(--app-primary)_45%,var(--app-border))] bg-(--app-primary-soft) text-(--app-primary)'
            : ACTION_IDLE,
        ]"
        :title="isGroup ? 'Group details' : 'Contact & relay details'"
        :aria-label="isGroup ? 'Group details' : 'Contact & relay details'"
        :aria-pressed="drawerOpen"
      >
        <Users v-if="isGroup" class="h-[18px] w-[18px]" :stroke-width="1.9" aria-hidden="true" />
        <Info v-else class="h-[18px] w-[18px]" :stroke-width="1.9" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
