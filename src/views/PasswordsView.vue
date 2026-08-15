<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import {
  KeyRound,
  Trash2,
  Loader2,
  RefreshCw,
  Search,
  ExternalLink,
  Plus,
  X,
  Copy,
  Check,
  Eye,
  EyeOff,
  Pencil,
  ShieldCheck,
} from "@lucide/vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import { useIdentityStore } from "@/stores/identity";
import { copyToClipboard } from "@/lib/clipboard";
import {
  getPasswordsCached,
  fetchPasswords,
  savePassword,
  deletePassword,
  renewExpiringPasswords,
  passwordHostname,
  normalizePasswordTags,
  parsePasswordTagsInput,
  generateTotpCode,
  totpSecondsRemaining,
} from "@/lib/passwords";

const identity = useIdentityStore();
const isLoading = ref(true);
const isRefreshing = ref(false);
const isSaving = ref(false);
const items = ref([]);
const searchQuery = ref("");
const activeTag = ref("all");
const error = ref("");
const showForm = ref(false);
const editingId = ref(null);
const selectedItem = ref(null);
const pendingDelete = ref(null);
const showPassword = ref(false);
const showTotpSecret = ref(false);
const copiedFields = ref({});
const totpCode = ref("");
const totpRemain = ref(30);
let totpTimer = null;

const isDesktop = ref(typeof window !== "undefined" ? window.innerWidth >= 1024 : true);

function handleResize() {
  isDesktop.value = window.innerWidth >= 1024;
}

const emptyForm = () => ({
  title: "",
  username: "",
  email: "",
  password: "",
  uris: [""],
  totp: "",
  notes: "",
  tags: [],
});

const form = ref(emptyForm());
const tagDraft = ref("");
const uriDraft = ref("");

const allTags = computed(() => {
  const counts = {};
  for (const item of items.value) {
    for (const tag of item.tags || []) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
});

const filteredItems = computed(() => {
  let result = items.value;
  if (activeTag.value !== "all") {
    result = result.filter((item) => (item.tags || []).includes(activeTag.value));
  }
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return result;
  return result.filter((item) => {
    const host = item.uris?.[0] ? passwordHostname(item.uris[0]) : "";
    return (
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.username && item.username.toLowerCase().includes(q)) ||
      (item.email && item.email.toLowerCase().includes(q)) ||
      (item.notes && item.notes.toLowerCase().includes(q)) ||
      host.toLowerCase().includes(q) ||
      (item.uris || []).some((u) => u.toLowerCase().includes(q)) ||
      (item.tags || []).some((t) => t.includes(q))
    );
  });
});

const formTitle = computed(() => (editingId.value ? "Edit password" : "New password"));

onMounted(async () => {
  window.addEventListener("resize", handleResize);
  await loadItems();
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  stopTotpTimer();
});

watch(selectedItem, (item) => {
  showPassword.value = false;
  showTotpSecret.value = false;
  copiedFields.value = {};
  if (item?.totp) startTotpTimer(item.totp);
  else stopTotpTimer();
});

function startTotpTimer(secret) {
  stopTotpTimer();
  const tick = async () => {
    totpCode.value = await generateTotpCode(secret);
    totpRemain.value = totpSecondsRemaining();
  };
  void tick();
  totpTimer = setInterval(tick, 1000);
}

function stopTotpTimer() {
  if (totpTimer) {
    clearInterval(totpTimer);
    totpTimer = null;
  }
  totpCode.value = "";
  totpRemain.value = 30;
}

async function loadItems() {
  const cached = await getPasswordsCached(identity.privkeyHex, identity.pubkeyHex);
  if (cached) {
    items.value = cached.items;
    isLoading.value = false;
    if (!cached.fresh) refreshFromRelay();
    return;
  }
  isLoading.value = true;
  await refreshFromRelay();
}

async function refreshFromRelay() {
  isRefreshing.value = true;
  try {
    let next = await fetchPasswords(identity.privkeyHex, identity.pubkeyHex);
    next = await renewExpiringPasswords(identity.privkeyHex, identity.pubkeyHex, next);
    items.value = next;
    if (selectedItem.value) {
      selectedItem.value = next.find((p) => p.id === selectedItem.value.id) || null;
    }
  } catch (err) {
    console.error("Failed to load passwords:", err);
    error.value = err?.message || "Failed to load passwords.";
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
}

function openCreateForm() {
  editingId.value = null;
  form.value = emptyForm();
  tagDraft.value = "";
  uriDraft.value = "";
  showForm.value = true;
  selectedItem.value = null;
  error.value = "";
}

function openEditForm(item) {
  editingId.value = item.id;
  form.value = {
    title: item.title || "",
    username: item.username || "",
    email: item.email || "",
    password: item.password || "",
    uris: item.uris?.length ? [...item.uris] : [""],
    totp: item.totp || "",
    notes: item.notes || "",
    tags: [...(item.tags || [])],
  };
  tagDraft.value = "";
  uriDraft.value = "";
  showForm.value = true;
  selectedItem.value = item;
  error.value = "";
}

function closeForm() {
  showForm.value = false;
  editingId.value = null;
  form.value = emptyForm();
  tagDraft.value = "";
  uriDraft.value = "";
}

function addTagFromDraft() {
  form.value.tags = normalizePasswordTags([
    ...form.value.tags,
    ...parsePasswordTagsInput(tagDraft.value),
  ]);
  tagDraft.value = "";
}

function removeFormTag(tag) {
  form.value.tags = form.value.tags.filter((t) => t !== tag);
}

function addUriFromDraft() {
  const raw = uriDraft.value.trim();
  if (!raw) return;
  form.value.uris = [...form.value.uris.filter(Boolean), raw];
  uriDraft.value = "";
}

function removeUri(index) {
  form.value.uris = form.value.uris.filter((_, i) => i !== index);
  if (!form.value.uris.length) form.value.uris = [""];
}

async function handleSave() {
  if (isSaving.value) return;
  if (tagDraft.value.trim()) addTagFromDraft();
  if (uriDraft.value.trim()) addUriFromDraft();
  isSaving.value = true;
  error.value = "";
  try {
    const uris = form.value.uris.map((u) => u.trim()).filter(Boolean);
    const saved = await savePassword(
      identity.privkeyHex,
      identity.pubkeyHex,
      {
        title: form.value.title,
        username: form.value.username,
        email: form.value.email,
        password: form.value.password,
        uris,
        totp: form.value.totp,
        notes: form.value.notes,
        tags: form.value.tags,
      },
      { id: editingId.value || undefined, existingItems: items.value },
    );
    items.value = [saved, ...items.value.filter((p) => p.id !== saved.id)].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    );
    closeForm();
    selectedItem.value = saved;
  } catch (err) {
    error.value = err?.message || "Failed to save password.";
  } finally {
    isSaving.value = false;
  }
}

function openItem(item) {
  selectedItem.value = item;
  showForm.value = false;
}

function closeDetail() {
  selectedItem.value = null;
}

function getNjumpUrl(item) {
  if (!item?.eventId) return "";
  return `https://njump.me/e/${item.eventId}`;
}

function primaryHost(item) {
  return item?.uris?.[0] ? passwordHostname(item.uris[0]) : "";
}

function subtitle(item) {
  const parts = [];
  if (item.username) parts.push(item.username);
  else if (item.email) parts.push(item.email);
  const host = primaryHost(item);
  if (host) parts.push(host);
  if ((item.tags || []).length) parts.push(item.tags.slice(0, 3).join(" · "));
  return parts.join(" · ");
}

async function copyField(text, field) {
  if (!text) return;
  await copyToClipboard(text);
  copiedFields.value = { ...copiedFields.value, [field]: true };
  setTimeout(() => {
    copiedFields.value = { ...copiedFields.value, [field]: false };
  }, 2000);
}

function openUri(uri) {
  if (!uri) return;
  window.open(uri, "_blank", "noopener,noreferrer");
}

function openPrimaryUri(item) {
  openUri(item?.uris?.[0]);
}

async function handleDelete(item) {
  pendingDelete.value = item;
}

async function confirmDelete() {
  const item = pendingDelete.value;
  if (!item) return;
  pendingDelete.value = null;
  try {
    error.value = "";
    await deletePassword(identity.privkeyHex, identity.pubkeyHex, item);
    items.value = items.value.filter((p) => p.id !== item.id);
    if (selectedItem.value?.id === item.id) selectedItem.value = null;
    if (editingId.value === item.id) closeForm();
  } catch (err) {
    error.value = err?.message || "Failed to delete password.";
  }
}

const inputClass =
  "block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-2.5 text-sm text-(--app-text) placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]";
</script>

<template>
  <main class="h-full w-full min-h-0 bg-(--app-bg) text-(--app-text) overflow-hidden flex flex-col">
    <!-- Desktop Split View (>= 1024px) -->
    <div
      v-if="isDesktop"
      class="mx-auto flex h-full w-full max-w-6xl min-h-0 flex-1 overflow-hidden border-x border-(--app-border)"
    >
      <!-- Left Master Pane: Password List -->
      <aside
        class="flex h-full w-80 xl:w-96 shrink-0 flex-col border-r border-(--app-border) bg-(--app-surface)"
      >
        <!-- List Header -->
        <div class="shrink-0 border-b border-(--app-border) p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold tracking-tight text-(--app-text)">Passwords</span>
              <span
                class="rounded-full bg-(--app-surface-soft) px-2 py-0.5 text-xs font-semibold tabular-nums text-(--app-muted)"
              >
                {{ items.length }}
              </span>
            </div>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                :disabled="isRefreshing"
                class="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-60"
                title="Sync from relays"
                @click="refreshFromRelay"
              >
                <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': isRefreshing }" />
              </button>
              <button
                type="button"
                class="inline-flex h-8 items-center gap-1.5 rounded-xl bg-(--app-primary) px-3 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-95"
                @click="openCreateForm"
              >
                <Plus class="h-3.5 w-3.5" />
                New
              </button>
            </div>
          </div>

          <!-- Search Input -->
          <div class="relative">
            <div
              class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-(--app-muted-2)"
            >
              <Search class="h-3.5 w-3.5" />
            </div>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search logins, sites, tags…"
              class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) py-1.5 pr-3 pl-8.5 text-xs text-(--app-text) placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:bg-(--app-surface) focus:outline-none"
            />
          </div>

          <!-- Tag Pills -->
          <div v-if="allTags.length" class="flex gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
            <button
              type="button"
              class="rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors"
              :class="
                activeTag === 'all'
                  ? 'bg-(--app-primary) text-white'
                  : 'bg-(--app-surface-soft) text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
              "
              @click="activeTag = 'all'"
            >
              All
            </button>
            <button
              v-for="tagInfo in allTags"
              :key="tagInfo.tag"
              type="button"
              class="rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors"
              :class="
                activeTag === tagInfo.tag
                  ? 'bg-(--app-primary) text-white'
                  : 'bg-(--app-surface-soft) text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)'
              "
              @click="activeTag = tagInfo.tag"
            >
              {{ tagInfo.tag }}
              <span class="ml-1 opacity-60">{{ tagInfo.count }}</span>
            </button>
          </div>
        </div>

        <!-- Password Cards List -->
        <div class="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          <!-- Shimmer Skeleton Loading State -->
          <div v-if="isLoading" class="space-y-1.5 p-1">
            <div
              v-for="n in 5"
              :key="n"
              class="flex items-center gap-3 rounded-xl border border-(--app-border)/40 p-3 bg-(--app-surface-soft)/30"
            >
              <div class="h-8 w-8 shrink-0 rounded-lg skeleton-shimmer" />
              <div class="min-w-0 flex-1 space-y-2">
                <div class="h-3.5 w-28 rounded-md skeleton-shimmer" />
                <div class="h-2.5 w-44 rounded-md skeleton-shimmer" />
              </div>
            </div>
          </div>

          <div
            v-else-if="items.length === 0"
            class="flex flex-col items-center justify-center py-16 px-4 text-center"
          >
            <KeyRound class="mb-2 h-8 w-8 text-(--app-muted)" :stroke-width="1.5" />
            <p class="text-xs font-semibold text-(--app-text)">No passwords yet</p>
            <p class="mt-1 text-[11px] text-(--app-muted)">Store encrypted credentials safely.</p>
          </div>

          <div
            v-else-if="filteredItems.length === 0"
            class="py-12 text-center text-xs text-(--app-muted)"
          >
            No matching passwords found.
          </div>

          <template v-else>
            <div
              v-for="item in filteredItems"
              :key="item.id"
              class="group relative flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-all duration-150 active:scale-[0.99]"
              :class="
                (selectedItem?.id === item.id && !showForm) || editingId === item.id
                  ? 'border-(--app-primary)/40 bg-(--app-primary-soft) shadow-sm'
                  : 'border-transparent hover:border-(--app-border) hover:bg-(--app-surface-soft)'
              "
              @click="openItem(item)"
            >
              <div
                class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors"
                :class="
                  (selectedItem?.id === item.id && !showForm) || editingId === item.id
                    ? 'bg-(--app-primary) text-white'
                    : 'bg-(--app-surface-soft) text-(--app-muted) group-hover:text-(--app-text)'
                "
              >
                <KeyRound class="h-3.5 w-3.5" />
              </div>
              <div class="min-w-0 flex-1">
                <p
                  class="truncate text-xs font-bold"
                  :class="
                    (selectedItem?.id === item.id && !showForm) || editingId === item.id
                      ? 'text-(--app-text)'
                      : 'text-(--app-text-soft)'
                  "
                >
                  {{ item.title || primaryHost(item) || "Untitled Login" }}
                </p>
                <p class="mt-0.5 truncate text-[11px] text-(--app-muted)">
                  {{ subtitle(item) || "No username or domain" }}
                </p>
                <div v-if="(item.tags || []).length" class="mt-1.5 flex flex-wrap gap-1">
                  <span
                    v-for="tag in item.tags.slice(0, 2)"
                    :key="tag"
                    class="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-(--app-muted)"
                  >
                    #{{ tag }}
                  </span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </aside>

      <!-- Right Detail / Form Pane -->
      <section class="flex flex-1 min-w-0 flex-col bg-(--app-bg) overflow-y-auto">
        <!-- Form State -->
        <div v-if="showForm" class="flex flex-col p-6 lg:p-8 max-w-3xl space-y-6">
          <div class="flex items-center justify-between gap-3 border-b border-(--app-border) pb-4">
            <div>
              <h2 class="text-lg font-bold text-(--app-text)">{{ formTitle }}</h2>
              <p class="text-xs text-(--app-muted)">
                Encrypted locally with your key before publishing.
              </p>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 py-1.5 text-xs font-semibold text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                @click="closeForm"
              >
                Cancel
              </button>
              <button
                type="button"
                :disabled="isSaving"
                class="inline-flex items-center gap-1.5 rounded-xl bg-(--app-primary) px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) disabled:opacity-50"
                @click="handleSave"
              >
                <Loader2 v-if="isSaving" class="h-3.5 w-3.5 animate-spin" />
                <Check v-else class="h-3.5 w-3.5" />
                Save password
              </button>
            </div>
          </div>

          <form class="space-y-4" @submit.prevent="handleSave">
            <div>
              <label class="mb-1 block text-xs font-semibold text-(--app-text-soft)">Title</label>
              <input
                v-model="form.title"
                type="text"
                placeholder="e.g. GitHub, Proton, Bank"
                :class="inputClass"
              />
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs font-semibold text-(--app-text-soft)"
                  >Username</label
                >
                <input
                  v-model="form.username"
                  type="text"
                  placeholder="Username (optional)"
                  autocomplete="username"
                  :class="inputClass"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-semibold text-(--app-text-soft)">Email</label>
                <input
                  v-model="form.email"
                  type="email"
                  placeholder="Email (optional)"
                  autocomplete="email"
                  :class="inputClass"
                />
              </div>
            </div>

            <div>
              <label class="mb-1 block text-xs font-semibold text-(--app-text-soft)"
                >Password</label
              >
              <input
                v-model="form.password"
                type="text"
                required
                placeholder="Enter or generate password"
                autocomplete="new-password"
                :class="inputClass"
              />
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-semibold text-(--app-text-soft)">Website URLs</label>
              <div v-for="(uri, index) in form.uris" :key="index" class="flex gap-2">
                <input
                  v-model="form.uris[index]"
                  type="url"
                  placeholder="https://example.com"
                  :class="inputClass"
                />
                <button
                  v-if="form.uris.length > 1 || uri"
                  type="button"
                  class="rounded-xl border border-(--app-border) p-2 text-(--app-muted) hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                  title="Remove URL"
                  @click="removeUri(index)"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>
              <div class="flex gap-2">
                <input
                  v-model="uriDraft"
                  type="url"
                  placeholder="Add another URL…"
                  :class="inputClass"
                  @keydown.enter.prevent="addUriFromDraft"
                />
                <button
                  type="button"
                  class="inline-flex shrink-0 items-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 text-xs font-semibold text-(--app-muted) hover:text-(--app-text)"
                  @click="addUriFromDraft"
                >
                  Add URL
                </button>
              </div>
            </div>

            <div>
              <label class="mb-1 block text-xs font-semibold text-(--app-text-soft)">
                TOTP Authenticator Secret (optional)
              </label>
              <input
                v-model="form.totp"
                type="text"
                placeholder="Base32 secret (e.g. JBSWY3DPEHPK3PXP)"
                autocomplete="off"
                spellcheck="false"
                :class="inputClass"
              />
            </div>

            <div>
              <label class="mb-1 block text-xs font-semibold text-(--app-text-soft)">Notes</label>
              <textarea
                v-model="form.notes"
                rows="3"
                placeholder="Recovery codes, security questions, notes…"
                :class="inputClass"
              />
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-semibold text-(--app-text-soft)">Tags</label>
              <div class="flex gap-2">
                <input
                  v-model="tagDraft"
                  type="text"
                  placeholder="Add tag (e.g. work, finance)…"
                  :class="inputClass"
                  @keydown.enter.prevent="addTagFromDraft"
                />
                <button
                  type="button"
                  class="inline-flex shrink-0 items-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3.5 text-xs font-semibold text-(--app-muted) hover:text-(--app-text)"
                  @click="addTagFromDraft"
                >
                  Add tag
                </button>
              </div>
              <div v-if="form.tags.length" class="flex flex-wrap gap-1.5 pt-1">
                <span
                  v-for="tag in form.tags"
                  :key="tag"
                  class="inline-flex items-center gap-1 rounded-lg bg-(--app-primary)/15 px-2.5 py-1 text-xs font-medium text-(--app-primary)"
                >
                  {{ tag }}
                  <button
                    type="button"
                    class="hover:opacity-75"
                    title="Remove tag"
                    @click="removeFormTag(tag)"
                  >
                    <X class="h-3 w-3" />
                  </button>
                </span>
              </div>
            </div>
          </form>
        </div>

        <!-- Selected Password Details View -->
        <div v-else-if="selectedItem" class="flex flex-col p-6 lg:p-8 max-w-3xl space-y-6">
          <!-- Detail Header -->
          <div class="flex items-center justify-between gap-3 border-b border-(--app-border) pb-5">
            <div class="flex items-center gap-3.5 min-w-0">
              <div
                class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-(--app-primary-soft) text-(--app-primary) ring-1 ring-inset ring-(--app-primary)/20"
              >
                <KeyRound class="h-6 w-6" />
              </div>
              <div class="min-w-0">
                <h1 class="truncate text-xl font-bold text-(--app-text)">
                  {{ selectedItem.title || primaryHost(selectedItem) || "Password" }}
                </h1>
                <p class="truncate text-xs text-(--app-muted)">
                  {{ primaryHost(selectedItem) || "No website URL" }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <a
                v-if="getNjumpUrl(selectedItem)"
                :href="getNjumpUrl(selectedItem)"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                title="View event on njump.me"
              >
                <ExternalLink class="h-3.5 w-3.5" />
                Relay event
              </a>
              <button
                type="button"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-muted) transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                title="Delete password"
                @click="handleDelete(selectedItem)"
              >
                <Trash2 class="h-3.5 w-3.5" />
                Delete
              </button>
              <button
                type="button"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-(--app-primary) px-4 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-95"
                title="Edit password"
                @click="openEditForm(selectedItem)"
              >
                <Pencil class="h-3.5 w-3.5" />
                Edit
              </button>
            </div>
          </div>

          <!-- Credentials Cards -->
          <div class="space-y-3">
            <!-- Username -->
            <div
              v-if="selectedItem.username"
              class="flex items-center justify-between gap-3 rounded-2xl border border-(--app-border) bg-(--app-surface) px-4 py-3 shadow-xs"
            >
              <div class="min-w-0">
                <p class="text-[11px] font-medium text-(--app-muted)">Username</p>
                <p class="truncate text-sm font-semibold text-(--app-text)">
                  {{ selectedItem.username }}
                </p>
              </div>
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                title="Copy username"
                @click="copyField(selectedItem.username, 'username')"
              >
                <Check v-if="copiedFields.username" class="h-4 w-4 text-(--app-success)" />
                <Copy v-else class="h-4 w-4" />
              </button>
            </div>

            <!-- Email -->
            <div
              v-if="selectedItem.email"
              class="flex items-center justify-between gap-3 rounded-2xl border border-(--app-border) bg-(--app-surface) px-4 py-3 shadow-xs"
            >
              <div class="min-w-0">
                <p class="text-[11px] font-medium text-(--app-muted)">Email address</p>
                <p class="truncate text-sm font-semibold text-(--app-text)">
                  {{ selectedItem.email }}
                </p>
              </div>
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                title="Copy email"
                @click="copyField(selectedItem.email, 'email')"
              >
                <Check v-if="copiedFields.email" class="h-4 w-4 text-(--app-success)" />
                <Copy v-else class="h-4 w-4" />
              </button>
            </div>

            <!-- Password -->
            <div
              class="flex items-center justify-between gap-3 rounded-2xl border border-(--app-border) bg-(--app-surface) px-4 py-3 shadow-xs"
            >
              <div class="min-w-0">
                <p class="text-[11px] font-medium text-(--app-muted)">Password</p>
                <p class="truncate font-mono text-sm font-semibold text-(--app-text)">
                  {{ showPassword ? selectedItem.password : "••••••••••••••••" }}
                </p>
              </div>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                  :title="showPassword ? 'Hide password' : 'Show password'"
                  @click="showPassword = !showPassword"
                >
                  <EyeOff v-if="showPassword" class="h-4 w-4" />
                  <Eye v-else class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-(--app-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                  title="Copy password"
                  @click="copyField(selectedItem.password, 'password')"
                >
                  <Check v-if="copiedFields.password" class="h-4 w-4 text-(--app-success)" />
                  <Copy v-else class="h-4 w-4" />
                </button>
              </div>
            </div>

            <!-- TOTP Authenticator Card -->
            <div
              v-if="selectedItem.totp"
              class="space-y-3 rounded-2xl border border-(--app-border) bg-(--app-surface) p-4 shadow-xs"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="flex items-center gap-1.5">
                    <ShieldCheck class="h-3.5 w-3.5 text-(--app-primary)" />
                    <p class="text-[11px] font-bold text-(--app-primary) uppercase tracking-wider">
                      2FA Authenticator Code
                    </p>
                  </div>
                  <p
                    class="font-mono text-2xl sm:text-3xl font-bold tracking-[0.25em] tabular-nums text-(--app-text) mt-1"
                  >
                    {{ totpCode || "------" }}
                  </p>
                </div>
                <div class="flex items-center gap-3">
                  <!-- SVG Countdown Ring -->
                  <div class="relative flex items-center justify-center">
                    <svg class="h-8 w-8 -rotate-90" viewBox="0 0 36 36">
                      <path
                        class="text-(--app-surface-soft)"
                        stroke-width="3"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        :class="totpRemain <= 5 ? 'text-amber-400' : 'text-(--app-primary)'"
                        stroke-dasharray="100, 100"
                        :stroke-dashoffset="100 - (totpRemain / 30) * 100"
                        stroke-width="3.5"
                        stroke-linecap="round"
                        stroke="currentColor"
                        fill="none"
                        class="transition-all duration-1000 ease-linear"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <span class="absolute text-[10px] font-bold tabular-nums text-(--app-muted)">
                      {{ totpRemain }}
                    </span>
                  </div>

                  <button
                    type="button"
                    class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-(--app-primary)/10 px-3 text-xs font-bold text-(--app-primary) hover:bg-(--app-primary)/20"
                    title="Copy 2FA code"
                    @click="copyField(totpCode, 'totpCode')"
                  >
                    <Check v-if="copiedFields.totpCode" class="h-3.5 w-3.5 text-(--app-success)" />
                    <Copy v-else class="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>
              </div>

              <!-- Secret Toggle Row -->
              <div
                class="flex items-center justify-between gap-2 border-t border-(--app-border) pt-2.5 text-xs"
              >
                <p class="truncate font-mono text-[11px] text-(--app-muted)">
                  {{ showTotpSecret ? selectedItem.totp : "Secret hidden" }}
                </p>
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    class="rounded-lg p-1 text-(--app-muted) hover:text-(--app-text)"
                    :title="showTotpSecret ? 'Hide secret' : 'Show secret'"
                    @click="showTotpSecret = !showTotpSecret"
                  >
                    <EyeOff v-if="showTotpSecret" class="h-3.5 w-3.5" />
                    <Eye v-else class="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    class="rounded-lg p-1 text-(--app-muted) hover:text-(--app-text)"
                    title="Copy secret"
                    @click="copyField(selectedItem.totp, 'totpSecret')"
                  >
                    <Check
                      v-if="copiedFields.totpSecret"
                      class="h-3.5 w-3.5 text-(--app-success)"
                    />
                    <Copy v-else class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <!-- URLs -->
            <div v-if="(selectedItem.uris || []).length" class="space-y-1.5">
              <p class="text-[11px] font-medium text-(--app-muted)">Websites</p>
              <button
                v-for="uri in selectedItem.uris"
                :key="uri"
                type="button"
                class="flex w-full items-center justify-between gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface) px-4 py-2.5 text-left transition-colors hover:border-(--app-primary)/30"
                @click="openUri(uri)"
              >
                <span class="truncate text-xs font-semibold">{{ uri }}</span>
                <ExternalLink class="h-3.5 w-3.5 shrink-0 text-(--app-muted)" />
              </button>
            </div>

            <!-- Notes -->
            <div
              v-if="selectedItem.notes"
              class="rounded-2xl border border-(--app-border) bg-(--app-surface) px-4 py-3"
            >
              <p class="text-[11px] font-medium text-(--app-muted)">Notes</p>
              <p class="mt-1 whitespace-pre-wrap text-xs text-(--app-text-soft) leading-5">
                {{ selectedItem.notes }}
              </p>
            </div>

            <!-- Tags -->
            <div v-if="(selectedItem.tags || []).length" class="flex flex-wrap gap-1.5 pt-1">
              <span
                v-for="tag in selectedItem.tags"
                :key="tag"
                class="rounded-md bg-(--app-primary)/15 px-2 py-0.5 text-[11px] font-semibold text-(--app-primary)"
              >
                #{{ tag }}
              </span>
            </div>

            <!-- Open Site CTA -->
            <div v-if="selectedItem.uris?.[0]" class="pt-2">
              <button
                type="button"
                class="flex w-full items-center justify-center gap-2 rounded-2xl bg-(--app-primary) px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-[0.99]"
                @click="openPrimaryUri(selectedItem)"
              >
                <ExternalLink class="h-4 w-4" />
                Open website ({{ primaryHost(selectedItem) }})
              </button>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="flex h-full w-full flex-col items-center justify-center p-8 text-center">
          <div
            class="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-(--app-border) bg-(--app-surface) text-(--app-primary) shadow-sm"
          >
            <KeyRound class="h-8 w-8" :stroke-width="1.6" />
          </div>
          <h2 class="text-base font-bold text-(--app-text)">No password selected</h2>
          <p class="mt-1 max-w-xs text-xs text-(--app-muted)">
            Select a login from the list to view its credentials and 2FA codes, or create a new
            password.
          </p>
          <button
            type="button"
            class="mt-5 inline-flex items-center gap-2 rounded-xl bg-(--app-primary) px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-95"
            @click="openCreateForm"
          >
            <Plus class="h-4 w-4" />
            Add new password
          </button>
        </div>
      </section>
    </div>

    <!-- Mobile Single Column Layout (< 1024px) -->
    <div v-else class="min-h-dvh overflow-y-auto overflow-x-hidden p-4 sm:p-6 pb-16">
      <div class="mx-auto max-w-2xl space-y-6">
        <AppAlertBanner v-if="error" :message="error" />

        <!-- Shimmer Skeleton Loading State -->
        <div v-if="isLoading" class="space-y-3">
          <div
            v-for="n in 4"
            :key="n"
            class="flex items-center gap-3.5 rounded-2xl border border-(--app-border)/40 p-4 bg-(--app-surface-soft)/30"
          >
            <div class="h-9 w-9 shrink-0 rounded-xl skeleton-shimmer" />
            <div class="min-w-0 flex-1 space-y-2">
              <div class="h-4 w-36 rounded-md skeleton-shimmer" />
              <div class="h-3 w-52 rounded-md skeleton-shimmer" />
            </div>
          </div>
        </div>

        <template v-else>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-(--app-muted)">
              <span class="font-semibold tabular-nums text-(--app-text)">{{ items.length }}</span>
              {{ items.length === 1 ? "password" : "passwords" }}
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                :disabled="isRefreshing"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text) disabled:opacity-60"
                @click="refreshFromRelay"
              >
                <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': isRefreshing }" />
                Sync
              </button>
              <button
                type="button"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-(--app-primary) px-3.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-(--app-primary-strong) active:scale-[0.97]"
                @click="openCreateForm"
              >
                <Plus class="h-3.5 w-3.5" />
                New
              </button>
            </div>
          </div>

          <!-- Mobile Form -->
          <form
            v-if="showForm"
            class="space-y-3 rounded-2xl border border-(--app-border) bg-(--app-surface) p-4"
            @submit.prevent="handleSave"
          >
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-semibold">{{ formTitle }}</p>
              <button
                type="button"
                class="rounded-lg p-1 text-(--app-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
                title="Close"
                @click="closeForm"
              >
                <X class="h-4 w-4" />
              </button>
            </div>

            <input v-model="form.title" type="text" placeholder="Title" :class="inputClass" />
            <input
              v-model="form.username"
              type="text"
              placeholder="Username (optional)"
              autocomplete="username"
              :class="inputClass"
            />
            <input
              v-model="form.email"
              type="email"
              placeholder="Email (optional)"
              autocomplete="email"
              :class="inputClass"
            />
            <input
              v-model="form.password"
              type="text"
              required
              placeholder="Password"
              autocomplete="new-password"
              :class="inputClass"
            />

            <div class="space-y-2">
              <p class="text-xs font-medium text-(--app-muted)">URLs</p>
              <div v-for="(uri, index) in form.uris" :key="index" class="flex gap-2">
                <input
                  v-model="form.uris[index]"
                  type="url"
                  placeholder="https://…"
                  :class="inputClass"
                />
                <button
                  v-if="form.uris.length > 1 || uri"
                  type="button"
                  class="rounded-xl p-2 text-(--app-muted) hover:text-red-400"
                  title="Remove URL"
                  @click="removeUri(index)"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>
              <div class="flex gap-2">
                <input
                  v-model="uriDraft"
                  type="url"
                  placeholder="Add another URL…"
                  :class="inputClass"
                  @keydown.enter.prevent="addUriFromDraft"
                />
                <button
                  type="button"
                  class="inline-flex shrink-0 items-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-muted) transition-colors hover:text-(--app-text)"
                  @click="addUriFromDraft"
                >
                  Add URL
                </button>
              </div>
            </div>

            <input
              v-model="form.totp"
              type="text"
              placeholder="TOTP secret (optional, Base32)"
              autocomplete="off"
              spellcheck="false"
              :class="inputClass"
            />
            <textarea
              v-model="form.notes"
              rows="3"
              placeholder="Notes (optional)"
              :class="inputClass"
            />

            <div class="space-y-2">
              <div class="flex gap-2">
                <input
                  v-model="tagDraft"
                  type="text"
                  placeholder="Add tag…"
                  :class="inputClass"
                  @keydown.enter.prevent="addTagFromDraft"
                />
                <button
                  type="button"
                  class="inline-flex shrink-0 items-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) px-3 text-xs font-semibold text-(--app-muted) transition-colors hover:text-(--app-text)"
                  @click="addTagFromDraft"
                >
                  Add tag
                </button>
              </div>
              <div v-if="form.tags.length" class="flex flex-wrap gap-1.5">
                <button
                  v-for="tag in form.tags"
                  :key="tag"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full bg-(--app-primary)/10 px-2.5 py-1 text-[11px] font-medium text-(--app-primary)"
                  @click="removeFormTag(tag)"
                >
                  {{ tag }}
                  <X class="h-3 w-3" />
                </button>
              </div>
            </div>

            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="px-3 py-2 text-xs font-medium text-(--app-muted) transition-colors hover:text-(--app-text)"
                @click="closeForm"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="isSaving"
                class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-(--app-primary) px-3.5 text-xs font-semibold text-white transition-colors hover:bg-(--app-primary-strong) disabled:opacity-50"
              >
                <Loader2 v-if="isSaving" class="h-3.5 w-3.5 animate-spin" />
                <Plus v-else class="h-3.5 w-3.5" />
                Save
              </button>
            </div>
          </form>

          <!-- Empty state on mobile -->
          <div v-if="items.length === 0 && !showForm" class="py-12 text-center">
            <div
              class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--app-primary-soft) text-(--app-primary)"
            >
              <KeyRound class="h-7 w-7" />
            </div>
            <h2 class="mb-2 text-lg font-semibold">No passwords yet</h2>
            <p class="mx-auto mb-6 max-w-sm text-sm leading-6 text-(--app-muted)">
              Store logins encrypted on your relays — with optional TOTP secrets and tags.
            </p>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-xl bg-(--app-primary) px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-(--app-primary-strong)"
              @click="openCreateForm"
            >
              <Plus class="h-4 w-4" />
              Add password
            </button>
          </div>

          <!-- Mobile Passwords List -->
          <template v-else-if="items.length > 0">
            <div class="space-y-3">
              <div class="relative">
                <div
                  class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-(--app-muted-2)"
                >
                  <Search class="h-4 w-4" />
                </div>
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search…"
                  class="block w-full rounded-xl border border-(--app-border) bg-(--app-surface-soft) py-2.5 pr-4 pl-10 text-sm text-(--app-text) transition-all duration-200 placeholder:text-(--app-muted-2) focus:border-[color-mix(in_srgb,var(--app-primary)_62%,var(--app-border))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-primary)_60%,transparent)]"
                />
              </div>

              <div v-if="allTags.length" class="flex gap-2 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  class="rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors"
                  :class="
                    activeTag === 'all'
                      ? 'bg-(--app-primary)/15 text-(--app-primary)'
                      : 'text-(--app-muted) hover:text-(--app-text)'
                  "
                  @click="activeTag = 'all'"
                >
                  All
                </button>
                <button
                  v-for="tagInfo in allTags"
                  :key="tagInfo.tag"
                  type="button"
                  class="rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors"
                  :class="
                    activeTag === tagInfo.tag
                      ? 'bg-(--app-primary)/15 text-(--app-primary)'
                      : 'text-(--app-muted) hover:text-(--app-text)'
                  "
                  @click="activeTag = tagInfo.tag"
                >
                  {{ tagInfo.tag }}
                  <span class="opacity-50">{{ tagInfo.count }}</span>
                </button>
              </div>
            </div>

            <div
              v-if="filteredItems.length === 0"
              class="py-16 text-center text-sm text-(--app-muted)"
            >
              No passwords match your search or filter.
            </div>

            <ul v-else class="divide-y divide-(--app-border) border-y border-(--app-border)">
              <li
                v-for="item in filteredItems"
                :key="item.id"
                class="cursor-pointer transition-colors hover:bg-(--app-surface-soft)/40"
                @click="openItem(item)"
              >
                <div class="flex items-center gap-3 px-1 py-3">
                  <KeyRound class="h-4 w-4 shrink-0 text-(--app-primary)" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium tracking-tight">
                      {{ item.title || primaryHost(item) || "Password" }}
                    </p>
                    <p class="truncate text-xs text-(--app-muted)">
                      {{ subtitle(item) }}
                    </p>
                  </div>
                  <a
                    v-if="getNjumpUrl(item)"
                    :href="getNjumpUrl(item)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="rounded-lg p-1.5 text-(--app-muted) transition-colors hover:bg-(--app-primary-soft)/40 hover:text-(--app-primary)"
                    title="View event on njump.me"
                    @click.stop
                  >
                    <ExternalLink class="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    class="rounded-lg p-1.5 text-(--app-muted) transition-colors hover:bg-red-500/10 hover:text-red-400"
                    title="Delete"
                    @click.stop="handleDelete(item)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            </ul>
          </template>
        </template>
      </div>
    </div>

    <!-- Mobile Detail Sheet (Only on < 1024px) -->
    <Teleport v-if="!isDesktop" to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="selectedItem"
          class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
        >
          <div class="absolute inset-0 bg-black/70" @click="closeDetail" />

          <div
            class="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-(--app-border) bg-(--app-surface) shadow-[0_24px_64px_rgba(0,0,0,0.4)] sm:rounded-3xl"
          >
            <div
              class="flex shrink-0 items-center justify-between gap-3 border-b border-(--app-border) px-5 py-4"
            >
              <div class="flex min-w-0 items-center gap-3">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--app-primary-soft) text-(--app-primary) ring-1 ring-inset ring-(--app-primary)/20"
                >
                  <KeyRound class="h-5 w-5" />
                </div>
                <div class="min-w-0">
                  <h2 class="truncate text-base font-bold">
                    {{ selectedItem.title || primaryHost(selectedItem) || "Password" }}
                  </h2>
                  <p class="truncate text-xs text-(--app-muted)">
                    {{ primaryHost(selectedItem) || "No site URL" }}
                  </p>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) transition-colors hover:text-(--app-text)"
                  title="Edit"
                  @click="openEditForm(selectedItem)"
                >
                  <Pencil class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) transition-colors hover:text-red-400"
                  title="Delete"
                  @click="handleDelete(selectedItem)"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--app-border) bg-(--app-surface-soft) text-(--app-muted) transition-colors hover:text-(--app-text)"
                  @click="closeDetail"
                >
                  <X class="h-5 w-5" />
                </button>
              </div>
            </div>

            <div class="flex-1 space-y-3 overflow-y-auto px-5 py-5">
              <div
                v-if="selectedItem.username"
                class="flex items-center justify-between gap-3 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3"
              >
                <div class="min-w-0">
                  <p class="text-[11px] font-medium text-(--app-muted)">Username</p>
                  <p class="truncate text-sm">{{ selectedItem.username }}</p>
                </div>
                <button
                  type="button"
                  class="rounded-lg p-2 text-(--app-muted) hover:text-(--app-text)"
                  @click="copyField(selectedItem.username, 'username')"
                >
                  <Check v-if="copiedFields.username" class="h-4 w-4 text-(--app-success)" />
                  <Copy v-else class="h-4 w-4" />
                </button>
              </div>

              <div
                v-if="selectedItem.email"
                class="flex items-center justify-between gap-3 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3"
              >
                <div class="min-w-0">
                  <p class="text-[11px] font-medium text-(--app-muted)">Email</p>
                  <p class="truncate text-sm">{{ selectedItem.email }}</p>
                </div>
                <button
                  type="button"
                  class="rounded-lg p-2 text-(--app-muted) hover:text-(--app-text)"
                  @click="copyField(selectedItem.email, 'email')"
                >
                  <Check v-if="copiedFields.email" class="h-4 w-4 text-(--app-success)" />
                  <Copy v-else class="h-4 w-4" />
                </button>
              </div>

              <div
                class="flex items-center justify-between gap-3 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3"
              >
                <div class="min-w-0">
                  <p class="text-[11px] font-medium text-(--app-muted)">Password</p>
                  <p class="truncate font-mono text-sm">
                    {{ showPassword ? selectedItem.password : "••••••••••••" }}
                  </p>
                </div>
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    class="rounded-lg p-2 text-(--app-muted) hover:text-(--app-text)"
                    @click="showPassword = !showPassword"
                  >
                    <EyeOff v-if="showPassword" class="h-4 w-4" />
                    <Eye v-else class="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    class="rounded-lg p-2 text-(--app-muted) hover:text-(--app-text)"
                    @click="copyField(selectedItem.password, 'password')"
                  >
                    <Check v-if="copiedFields.password" class="h-4 w-4 text-(--app-success)" />
                    <Copy v-else class="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div
                v-if="selectedItem.totp"
                class="space-y-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3"
              >
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-[11px] font-medium text-(--app-muted)">Authenticator code</p>
                    <p class="font-mono text-2xl font-semibold tracking-[0.2em] tabular-nums">
                      {{ totpCode || "------" }}
                    </p>
                  </div>
                  <div class="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      class="rounded-lg p-2 text-(--app-muted) hover:text-(--app-text)"
                      @click="copyField(totpCode, 'totpCode')"
                    >
                      <Check v-if="copiedFields.totpCode" class="h-4 w-4 text-(--app-success)" />
                      <Copy v-else class="h-4 w-4" />
                    </button>
                    <p class="text-[11px] tabular-nums text-(--app-muted)">{{ totpRemain }}s</p>
                  </div>
                </div>
                <div
                  class="flex items-center justify-between gap-2 border-t border-(--app-border) pt-2"
                >
                  <p class="truncate font-mono text-xs text-(--app-muted)">
                    {{ showTotpSecret ? selectedItem.totp : "Secret hidden" }}
                  </p>
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="rounded-lg p-1.5 text-(--app-muted) hover:text-(--app-text)"
                      @click="showTotpSecret = !showTotpSecret"
                    >
                      <EyeOff v-if="showTotpSecret" class="h-3.5 w-3.5" />
                      <Eye v-else class="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      class="rounded-lg p-1.5 text-(--app-muted) hover:text-(--app-text)"
                      @click="copyField(selectedItem.totp, 'totpSecret')"
                    >
                      <Check
                        v-if="copiedFields.totpSecret"
                        class="h-3.5 w-3.5 text-(--app-success)"
                      />
                      <Copy v-else class="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="(selectedItem.uris || []).length" class="space-y-2">
                <p class="text-[11px] font-medium text-(--app-muted)">URLs</p>
                <button
                  v-for="uri in selectedItem.uris"
                  :key="uri"
                  type="button"
                  class="flex w-full items-center justify-between gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3 text-left transition-colors hover:border-(--app-primary)/30"
                  @click="openUri(uri)"
                >
                  <span class="truncate text-sm">{{ uri }}</span>
                  <ExternalLink class="h-3.5 w-3.5 shrink-0 text-(--app-muted)" />
                </button>
              </div>

              <div
                v-if="selectedItem.notes"
                class="rounded-2xl border border-(--app-border) bg-(--app-surface-soft) px-4 py-3"
              >
                <p class="text-[11px] font-medium text-(--app-muted)">Notes</p>
                <p class="mt-1 whitespace-pre-wrap text-sm text-(--app-text-soft)">
                  {{ selectedItem.notes }}
                </p>
              </div>

              <p v-if="(selectedItem.tags || []).length" class="text-xs text-(--app-muted)">
                {{ selectedItem.tags.join(" · ") }}
              </p>

              <div class="border-t border-(--app-border) pt-2">
                <a
                  v-if="getNjumpUrl(selectedItem)"
                  :href="getNjumpUrl(selectedItem)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="group flex items-center justify-center gap-2 rounded-2xl border border-(--app-border) bg-(--app-surface-soft) p-3 transition-colors hover:border-(--app-primary)/30 hover:bg-(--app-primary-soft)/30"
                >
                  <ExternalLink
                    class="h-4 w-4 text-(--app-muted) transition-colors group-hover:text-(--app-primary)"
                  />
                  <span
                    class="text-sm font-medium text-(--app-muted) transition-colors group-hover:text-(--app-text)"
                  >
                    View event on njump.me
                  </span>
                </a>
              </div>

              <button
                v-if="selectedItem.uris?.[0]"
                type="button"
                class="flex w-full items-center justify-center gap-2 rounded-2xl bg-(--app-primary) px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-(--app-primary-strong)"
                @click="openPrimaryUri(selectedItem)"
              >
                Open site
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <AppConfirmDialog
      :open="!!pendingDelete"
      title="Delete password?"
      message="This publishes a delete tombstone. The login will disappear from your list."
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </main>
</template>
