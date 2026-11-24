<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { RouterLink, useRouter } from "vue-router";
import {
  KeyRound,
  Trash2,
  RefreshCw,
  Search,
  Plus,
  X,
  Pencil,
  Copy,
  Check,
  User,
  Calendar,
} from "@/icons";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import PageHeader from "@/components/PageHeader.vue";
import { useIdentityStore } from "@/stores/identity";
import { copyToClipboard } from "@/lib/clipboard";
import {
  getPasswordsCached,
  fetchPasswords,
  deletePassword,
  passwordHostname,
} from "@/lib/passwords";

const router = useRouter();
const identity = useIdentityStore();

const isLoading = ref(true);
const isRefreshing = ref(false);
const items = ref([]);
const searchQuery = ref("");
const activeTag = ref("all");
const error = ref("");
const pendingDelete = ref(null);

const copiedMap = ref({});
let copyTimer = null;

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

onMounted(async () => {
  await loadItems();
});

onUnmounted(() => {
  if (copyTimer) clearTimeout(copyTimer);
});

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
    const next = await fetchPasswords(identity.privkeyHex, identity.pubkeyHex);
    items.value = next;
  } catch (err) {
    console.error("Failed to load passwords:", err);
    error.value = err?.message || "Failed to load passwords.";
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
}

function navigateToDetail(item) {
  router.push(`/passwords/${item.id}`);
}

async function copyValue(val, key, event) {
  if (event) event.stopPropagation();
  if (!val) return;
  await copyToClipboard(val);
  copiedMap.value[key] = true;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copiedMap.value = {};
  }, 1800);
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function handleDelete(item, event) {
  if (event) event.stopPropagation();
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
  } catch (err) {
    error.value = err?.message || "Failed to delete password.";
  }
}
</script>

<template>
  <div class="passwords-view__block">
    <main class="passwords-view__main">
      <!-- Header Section -->
      <PageHeader eyebrow="Private vault" title="Passwords" :count="items.length">
        <p class="passwords-view__lede">
          End-to-end encrypted passwords, credentials, and TOTP 2FA keys stored privately on your
          relays.
        </p>
        <template #actions>
          <button
            type="button"
            :disabled="isRefreshing"
            class="passwords-action"
            title="Sync from relays"
            @click="refreshFromRelay"
          >
            <RefreshCw class="passwords-action__icon" :class="{ 'passwords-action__icon--spin': isRefreshing }" />
            <span>Sync</span>
          </button>
          <RouterLink to="/passwords/new" class="passwords-action passwords-action--ink">
            <Plus class="passwords-action__icon" :stroke-width="2.2" />
            <span>New password</span>
          </RouterLink>
        </template>
      </PageHeader>

      <AppAlertBanner v-if="error" :message="error" />

      <!-- Search and Tag Filter Bar -->
      <div class="passwords-filters">
        <div class="passwords-search">
          <Search class="passwords-search__icon" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search all passwords by title, username, email, website, or tags…"
            class="passwords-search__field"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="passwords-search__clear"
            aria-label="Clear search"
            @click="searchQuery = ''"
          >
            <X class="passwords-search__clear-icon" />
          </button>
        </div>

        <!-- All items scope indicator -->
        <p v-if="searchQuery" class="passwords-filters__scope">
          Searching all {{ items.length }} vault credentials ({{ filteredItems.length }} matched)
        </p>

        <!-- Tag Filter Chips -->
        <div v-if="allTags.length" class="passwords-filters__tags">
          <button
            type="button"
            class="passwords-chip"
            :class="{ 'is-active': activeTag === 'all' }"
            @click="activeTag = 'all'"
          >
            All
            <span class="passwords-chip__count">{{ items.length }}</span>
          </button>
          <button
            v-for="tagInfo in allTags"
            :key="tagInfo.tag"
            type="button"
            class="passwords-chip"
            :class="{ 'is-active': activeTag === tagInfo.tag }"
            @click="activeTag = tagInfo.tag"
          >
            #{{ tagInfo.tag }}
            <span class="passwords-chip__count">{{ tagInfo.count }}</span>
          </button>
        </div>
      </div>

      <!-- Shimmer Skeleton Loading State -->
      <div v-if="isLoading" class="passwords-view__status" role="status">
        <span class="passwords-loading__label">Loading passwords…</span>
        <div
          v-for="n in 4"
          :key="n"
          class="passwords-view__block-8"
          aria-hidden="true"
        >
          <div class="skeleton-shimmer passwords-view__block-9" />
          <div class="passwords-view__block-10">
            <div class="skeleton-shimmer passwords-view__block-11" />
            <div class="skeleton-shimmer passwords-view__block-12" />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="items.length === 0"
        class="passwords-empty"
      >
        <p class="passwords-empty__eyebrow">Empty vault</p>
        <h2 class="passwords-empty__title">No passwords yet</h2>
        <p class="passwords-empty__lede">
          Your private password vault is empty. Add logins, generated passwords, or TOTP
          authenticator secrets.
        </p>
        <RouterLink to="/passwords/new" class="passwords-action passwords-action--ink passwords-empty__action">
          <Plus class="passwords-action__icon" :stroke-width="2.2" />
          <span>Add first password</span>
        </RouterLink>
      </div>

      <!-- Search No Results -->
      <div
        v-else-if="filteredItems.length === 0"
        class="passwords-empty passwords-empty--quiet"
      >
        <Search class="passwords-empty__mark" aria-hidden="true" />
        <h2 class="passwords-empty__title">No matching credentials</h2>
        <p class="passwords-empty__lede">
          No passwords match your search query "{{ searchQuery }}".
        </p>
        <button
          type="button"
          class="passwords-action"
          @click="
            searchQuery = '';
            activeTag = 'all';
          "
        >
          Clear filters
        </button>
      </div>

      <!-- Passwords List -->
      <div v-else class="passwords-list">
        <article
          v-for="item in filteredItems"
          :key="item.id"
          class="passwords-row"
          @click="navigateToDetail(item)"
        >
          <!-- Key Icon -->
          <span class="passwords-row__mark" aria-hidden="true">
            <KeyRound class="passwords-row__mark-icon" :stroke-width="1.8" />
          </span>

          <!-- Content -->
          <div class="passwords-row__body">
            <div class="passwords-row__heading">
              <h2 class="passwords-row__title">
                {{ item.title || (item.uris?.[0] ? passwordHostname(item.uris[0]) : "Password") }}
              </h2>
              <span
                v-if="item.uris && item.uris.length && item.uris[0]"
                class="passwords-row__host"
              >
                {{ passwordHostname(item.uris[0]) }}
              </span>
              <span
                v-if="item.totp"
                class="passwords-row__badge"
              >
                2FA TOTP
              </span>
            </div>

            <div class="passwords-row__credentials">
              <span v-if="item.username" class="passwords-row__user">
                {{ item.username }}
              </span>
              <span v-else-if="item.email" class="passwords-row__user">
                {{ item.email }}
              </span>
              <span v-else class="passwords-row__user passwords-row__user--empty">No username</span>

              <span class="passwords-row__dot" aria-hidden="true">•</span>
              <span class="passwords-row__secret" aria-label="Hidden password">••••••••</span>
            </div>

            <!-- Tags & Meta row -->
            <div class="passwords-row__meta">
              <span class="passwords-row__date">
                <Calendar class="passwords-row__meta-icon" aria-hidden="true" />
                {{ formatDate(item.updatedAt || item.createdAt) }}
              </span>

              <div
                v-if="item.tags && item.tags.length"
                class="passwords-row__tags"
              >
                <button
                  v-for="tag in item.tags"
                  :key="tag"
                  type="button"
                  class="passwords-row__tag"
                  @click.stop="activeTag = tag"
                >
                  #{{ tag }}
                </button>
              </div>
            </div>
          </div>

          <!-- Quick Action Buttons -->
          <div class="passwords-row__actions" @click.stop>
            <button
              v-if="item.username || item.email"
              type="button"
              class="passwords-row__action"
              :title="copiedMap[item.id + '_user'] ? 'Copied user!' : 'Copy username'"
              :aria-label="copiedMap[item.id + '_user'] ? 'Copied username' : 'Copy username'"
              @click="copyValue(item.username || item.email, item.id + '_user', $event)"
            >
              <Check v-if="copiedMap[item.id + '_user']" class="passwords-row__action-icon" />
              <User v-else class="passwords-row__action-icon" />
              <span class="passwords-row__action-label">User</span>
            </button>

            <button
              type="button"
              class="passwords-row__action"
              :title="copiedMap[item.id + '_pass'] ? 'Copied password!' : 'Copy password'"
              :aria-label="copiedMap[item.id + '_pass'] ? 'Copied password' : 'Copy password'"
              @click="copyValue(item.password, item.id + '_pass', $event)"
            >
              <Check v-if="copiedMap[item.id + '_pass']" class="passwords-row__action-icon" />
              <KeyRound v-else class="passwords-row__action-icon" />
              <span class="passwords-row__action-label">Pass</span>
            </button>

            <button
              type="button"
              class="passwords-row__action"
              title="View & Edit password"
              aria-label="View and edit password"
              @click="navigateToDetail(item)"
            >
              <Pencil class="passwords-row__action-icon" />
            </button>

            <button
              type="button"
              class="passwords-row__action passwords-row__action--danger"
              title="Delete password"
              aria-label="Delete password"
              @click="handleDelete(item, $event)"
            >
              <Trash2 class="passwords-row__action-icon" />
            </button>
          </div>
        </article>
      </div>
    </main>

    <!-- Delete Confirmation Modal -->
    <AppConfirmDialog
      :open="Boolean(pendingDelete)"
      title="Delete Password Entry?"
      :message="`Delete password entry '${pendingDelete?.title || (pendingDelete?.uris?.[0] ? passwordHostname(pendingDelete.uris[0]) : 'Password')}'? An encrypted tombstone will be published to your relays.`"
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </div>
</template>

<style scoped>

/* Ledger pass: credentials are ruled rows under one vault sheet. */

.passwords-view__block {
  min-height: 100vh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.passwords-view__main {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  width: 100%;
  max-width: 72rem;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.passwords-view__lede {
  max-width: 56ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.passwords-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 32px;
  padding-inline: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  text-decoration: none;
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.passwords-action:active {
  transform: translateY(1px);
}

.passwords-action:disabled {
  opacity: 0.5;
  cursor: default;
}

.passwords-action--ink {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.passwords-action__icon {
  width: 13px;
  height: 13px;
}

.passwords-action__icon--spin {
  animation: spin 1s linear infinite;
}

.passwords-filters {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.passwords-search {
  position: relative;
  display: block;
}

.passwords-search__icon {
  position: absolute;
  top: 50%;
  left: 14px;
  width: 14px;
  height: 14px;
  transform: translateY(-50%);
  color: var(--app-muted-2);
  pointer-events: none;
}

.passwords-search__field {
  width: 100%;
  height: 40px;
  padding: 0 42px 0 38px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: transparent;
  font-size: var(--app-text-body);
  color: var(--app-text);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.passwords-search__field::placeholder {
  color: var(--app-muted-2);
}

.passwords-search__field:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.passwords-search__clear {
  position: absolute;
  top: 50%;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  transform: translateY(-50%);
  border: 0;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
}

.passwords-search__clear-icon {
  width: 13px;
  height: 13px;
}

.passwords-filters__scope {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.passwords-filters__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.passwords-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.passwords-chip__count {
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.passwords-chip.is-active {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.passwords-chip.is-active .passwords-chip__count {
  color: color-mix(in oklab, var(--app-bg) 65%, transparent);
}

.passwords-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-fade 320ms var(--app-ease-standard) both;
}

.passwords-row {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  padding: 14px;
  cursor: pointer;
  transition: background-color var(--app-dur-fast) var(--app-ease-standard);
}

.passwords-row + .passwords-row {
  border-top: 1px solid var(--app-border);
}

.passwords-row__mark {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--app-radius-sm);
  background: var(--app-success-soft);
  color: var(--app-success);
}

.passwords-row__mark-icon {
  width: 14px;
  height: 14px;
}

.passwords-row__body {
  flex: 1;
  min-width: 0;
}

.passwords-row__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}

.passwords-row__title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: -0.005em;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.passwords-row__host {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.passwords-row__badge {
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--app-success-soft);
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-success);
}

.passwords-row__credentials {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--app-muted);
}

.passwords-row__user {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.passwords-row__user--empty {
  color: var(--app-muted-2);
}

.passwords-row__dot {
  color: var(--app-border-strong);
}

.passwords-row__secret {
  letter-spacing: 0.14em;
  color: var(--app-muted-2);
}

.passwords-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  margin-top: 8px;
}

.passwords-row__date {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
  font-variant-numeric: tabular-nums;
}

.passwords-row__meta-icon {
  width: 11px;
  height: 11px;
}

.passwords-row__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.passwords-row__tag {
  padding: 1px 5px;
  border: 0;
  border-radius: 3px;
  background: var(--app-surface-soft);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
  cursor: pointer;
}

.passwords-row__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

.passwords-row__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding-inline: 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.02em;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.passwords-row__action-icon {
  width: 12px;
  height: 12px;
}

.passwords-row__action--danger {
  color: color-mix(in oklab, var(--app-danger) 70%, var(--app-muted));
}

.passwords-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-3);
  padding: var(--app-space-8) var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  text-align: center;
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}

.passwords-empty__eyebrow {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.passwords-empty__mark {
  width: 18px;
  height: 18px;
  color: var(--app-muted-2);
}

.passwords-empty__title {
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

.passwords-empty__lede {
  max-width: 40ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.passwords-empty__action {
  margin-top: var(--app-space-3);
}

.passwords-loading__label {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

@media (hover: hover) {
  .passwords-action:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .passwords-action--ink:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .passwords-row:hover {
    background: var(--app-surface-soft);
  }

  .passwords-row__action:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }

  .passwords-row__action--danger:hover {
    background: color-mix(in oklab, var(--app-danger) 12%, transparent);
    color: var(--app-danger);
  }

  .passwords-row__tag:hover {
    color: var(--app-text);
  }

  .passwords-chip:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .passwords-search__clear:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }
}

@media (max-width: 30rem) {
  .passwords-row__mark {
    display: none;
  }
}

@media (pointer: coarse) {
  .passwords-action,
  .passwords-search__clear,
  .passwords-chip {
    min-height: var(--app-touch-h);
  }

  .passwords-row__action {
    min-width: var(--app-touch-h);
    height: var(--app-touch-h);
  }

  .passwords-row {
    flex-wrap: wrap;
  }

  .passwords-row__actions {
    width: 100%;
    margin-left: 0;
    padding-top: 8px;
    border-top: 1px solid var(--app-border);
    justify-content: flex-end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .passwords-view__block,
  .passwords-list,
  .passwords-empty {
    animation: none;
  }

  .passwords-action,
  .passwords-chip,
  .passwords-row,
  .passwords-row__action {
    transition: none;
  }
}
</style>
