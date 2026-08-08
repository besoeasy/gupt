<script setup>
import { ref } from "vue";
import { Shield, Clock, Loader2, Tags, FileText, Plus, X } from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import { useIdentityStore } from "@/stores/identity";
import { saveVaultItem } from "@/lib/vault";

const emit = defineEmits(["saved", "cancel"]);

const identity = useIdentityStore();
const isSaving = ref(false);
const error = ref("");

const DEFAULT_TAGS = ["note", "password", "bookmark", "card", "crypto", "api_key", "wifi"];

const EXPIRY_OPTIONS = [
  { label: "No expiry", value: 0 },
  { label: "5 minutes", value: 300 },
  { label: "1 day", value: 86400 },
  { label: "1 week", value: 604800 },
  { label: "1 month", value: 2592000 },
  { label: "3 months", value: 7776000 },
  { label: "1 year", value: 31536000 },
];

const TEMPLATES = [
  {
    label: "Password",
    content: `**Username:** \n**Password:** \n**URL:** \n**Notes:**`,
  },
  {
    label: "Bookmark",
    content: `**URL:** \n**Description:** \n**Notes:**`,
  },
  {
    label: "Credit Card",
    content: `**Cardholder:** \n**Number:** \n**Expiry:** \n**CVV:** \n**Billing ZIP:** \n**Notes:**`,
  },
  {
    label: "Crypto Wallet",
    content: `**Coin:** \n**Network:** \n**Address:** \n**Private key / Seed:** \n**Notes:**`,
  },
  {
    label: "API Key",
    content: `**Name:** \n**Key:** \n**Secret:** \n**Base URL:** \n**Notes:**`,
  },
  {
    label: "Wi-Fi",
    content: `**SSID:** \n**Password:** \n**Security (WPA2/WPA3):** \n**Notes:**`,
  },
  {
    label: "Note",
    content: "",
  },
];

const form = ref({
  title: "",
  content: "",
  tags: ["note"],
  expiry: 0,
});

const newTag = ref("");
const showTagInput = ref(false);

function toggleTag(tag) {
  const t = tag.trim().toLowerCase();
  if (!t) return;
  if (form.value.tags.includes(t)) {
    form.value.tags = form.value.tags.filter((x) => x !== t);
  } else {
    form.value.tags.push(t);
  }
}

function addCustomTag(tag) {
  const t = tag.trim().toLowerCase();
  if (t && !form.value.tags.includes(t)) {
    form.value.tags.push(t);
  }
}

function removeTag(tag) {
  form.value.tags = form.value.tags.filter((t) => t !== tag);
}

function handleAddCustomTag() {
  addCustomTag(newTag.value);
  newTag.value = "";
  showTagInput.value = false;
}

function insertTemplate(template) {
  form.value.content = template.content;
  if (template.label === "Password") {
    toggleTag("password");
  } else if (template.label === "Bookmark") {
    toggleTag("bookmark");
  } else if (template.label === "Credit Card") {
    toggleTag("card");
  } else if (template.label === "Crypto Wallet") {
    toggleTag("crypto");
  } else if (template.label === "API Key") {
    toggleTag("api_key");
  } else if (template.label === "Wi-Fi") {
    toggleTag("wifi");
  }
}

async function handleSave() {
  if (!form.value.title) {
    error.value = "Title is required.";
    return;
  }

  isSaving.value = true;
  error.value = "";
  try {
    await saveVaultItem(
      identity.privkeyHex,
      identity.pubkeyHex,
      {
        title: form.value.title,
        content: form.value.content,
        tags: form.value.tags,
      },
      form.value.expiry,
    );
    emit("saved");
  } catch (err) {
    error.value = err?.message || "Failed to save vault item.";
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <section class="space-y-8">
    <div class="space-y-1.5 border-b border-(--app-border) pb-6">
      <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--app-success)">
        New entry
      </p>
      <h2 class="text-xl font-bold tracking-tight sm:text-2xl">Add to Vault</h2>
      <p class="text-sm leading-6 text-(--app-muted)">
        Encrypted locally, then published to your relays
      </p>
    </div>

    <AppAlertBanner v-if="error" :message="error" />

    <form class="space-y-8" @submit.prevent="handleSave">
      <div>
        <label class="mb-1.5 block text-sm font-medium text-(--app-text)">Title</label>
        <input
          v-model="form.title"
          type="text"
          class="block w-full rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-4.5 py-3.5 text-[0.95rem] leading-normal text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--app-primary)_50%,transparent),0_0_0_4px_color-mix(in_srgb,var(--app-primary)_12%,transparent)]"
          placeholder="e.g. Proton Mail, API keys, travel notes"
        />
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between">
          <label class="text-sm font-medium text-(--app-text)">Tags</label>
          <button
            type="button"
            @click="showTagInput = !showTagInput"
            class="inline-flex items-center gap-1 text-xs text-(--app-muted) hover:text-(--app-text)"
          >
            <Plus class="h-3 w-3" />
            Custom tag
          </button>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="tag in DEFAULT_TAGS"
            :key="tag"
            type="button"
            @click="toggleTag(tag)"
            class="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-all"
            :class="
              form.tags.includes(tag)
                ? 'border-emerald-500/35 bg-emerald-500/15 text-(--app-success)'
                : 'border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) hover:text-(--app-text)'
            "
          >
            <Tags class="h-3 w-3" />
            {{ tag }}
          </button>
          <button
            v-for="tag in form.tags.filter((t) => !DEFAULT_TAGS.includes(t))"
            :key="tag"
            type="button"
            @click="removeTag(tag)"
            class="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-(--app-success) transition-all hover:bg-emerald-500/25"
          >
            {{ tag }}
            <X class="h-3 w-3" />
          </button>
          <div v-if="showTagInput" class="flex items-center gap-1">
            <input
              v-model="newTag"
              type="text"
              @keyup.enter="handleAddCustomTag"
              class="w-24 rounded-full border border-(--app-border) bg-(--app-surface) px-3 py-1.5 text-xs text-(--app-text) placeholder:text-(--app-muted) focus:border-(--app-primary) focus:outline-none"
              placeholder="tag name"
            />
            <button
              type="button"
              @click="handleAddCustomTag"
              class="text-xs text-(--app-success) hover:opacity-80"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between">
          <label class="text-sm font-medium text-(--app-text)">Content</label>
          <div class="flex items-center gap-2">
            <button
              v-for="template in TEMPLATES"
              :key="template.label"
              type="button"
              @click="insertTemplate(template)"
              class="rounded-full border border-(--app-border) bg-(--app-surface-soft) px-3 py-1 text-xs text-(--app-muted) hover:border-(--app-border-strong) hover:text-(--app-text)"
            >
              {{ template.label }} template
            </button>
          </div>
        </div>
        <textarea
          v-model="form.content"
          rows="10"
          class="block min-h-50 w-full resize-y rounded-[14px] border border-(--app-border) bg-(--app-surface-soft) px-4.5 py-3.5 font-mono text-[0.9rem] leading-[1.6] text-(--app-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-[color-mix(in_srgb,var(--app-surface-soft)_80%,var(--app-primary-soft))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)] focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--app-primary)_50%,transparent),0_0_0_4px_color-mix(in_srgb,var(--app-primary)_12%,transparent)]"
          placeholder="Write your note here... (Markdown supported)"
        />
        <p class="mt-1.5 text-xs text-(--app-muted)">
          Supports **bold**, *italic*, `code`, lists, and more
        </p>
      </div>

      <div>
        <label class="mb-2 flex items-center gap-1.5 text-sm font-medium text-(--app-text)">
          <Clock class="h-4 w-4" />
          Auto-expiry
        </label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="opt in EXPIRY_OPTIONS"
            :key="opt.value"
            type="button"
            @click="form.expiry = opt.value"
            class="rounded-full border px-3 py-1.5 text-xs font-medium transition-all"
            :class="
              form.expiry === opt.value
                ? 'border-emerald-500/35 bg-emerald-500/15 text-(--app-success)'
                : 'border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) hover:text-(--app-text)'
            "
          >
            {{ opt.label }}
          </button>
        </div>
        <p class="mt-2 text-xs text-(--app-muted)">
          Relays that support expiration will delete the event after this period.
        </p>
      </div>

      <div class="flex justify-end gap-3 border-t border-(--app-border) pt-6">
        <button
          type="button"
          class="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-(--app-muted) transition-colors hover:text-(--app-text)"
          @click="emit('cancel')"
        >
          <X class="h-4 w-4" />
          Cancel
        </button>
        <button
          type="submit"
          :disabled="isSaving"
          class="inline-flex items-center justify-center gap-2 rounded-lg bg-(--app-primary) px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-(--app-primary-strong) disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Loader2 v-if="isSaving" class="h-4 w-4 animate-spin" />
          <Shield v-else class="h-4 w-4" />
          Save
        </button>
      </div>
    </form>
  </section>
</template>
