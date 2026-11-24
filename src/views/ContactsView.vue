<script setup>
import { ref, computed, onMounted } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { Users, Trash2, RefreshCw, Search, Plus, X, Pencil, Calendar } from "@/icons";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import PageHeader from "@/components/PageHeader.vue";
import { useIdentityStore } from "@/stores/identity";
import {
  getContactsCached,
  fetchContacts,
  deleteContact,
  contactSearchText,
  contactDisplaySubtitle,
} from "@/lib/contacts";

const router = useRouter();
const identity = useIdentityStore();

const isLoading = ref(true);
const isRefreshing = ref(false);
const items = ref([]);
const searchQuery = ref("");
const activeTag = ref("all");
const error = ref("");
const pendingDelete = ref(null);

const allTags = computed(() => {
  const counts = {};
  for (const item of items.value) {
    for (const tag of item.tags || []) counts[tag] = (counts[tag] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
});

const filteredItems = computed(() => {
  let result = items.value;
  if (activeTag.value !== "all") result = result.filter((i) => (i.tags || []).includes(activeTag.value));
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return result;
  return result.filter((i) => contactSearchText(i).includes(q));
});

onMounted(loadItems);

async function loadItems() {
  const cached = await getContactsCached(identity.privkeyHex, identity.pubkeyHex);
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
    items.value = await fetchContacts(identity.privkeyHex, identity.pubkeyHex);
  } catch (err) {
    error.value = err?.message || "Failed to load contacts.";
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

async function confirmDelete() {
  const item = pendingDelete.value;
  if (!item) return;
  pendingDelete.value = null;
  try {
    await deleteContact(identity.privkeyHex, identity.pubkeyHex, item);
    items.value = items.value.filter((c) => c.id !== item.id);
  } catch (err) {
    error.value = err?.message || "Failed to delete contact.";
  }
}
</script>

<template>
  <div class="contacts">
    <main class="contacts__main">
      <PageHeader eyebrow="Private vault" title="Contacts" :count="items.length">
        <p class="contacts__sub">
          End-to-end encrypted address book. Email, phone, location plus any custom field you need.
        </p>
        <template #actions>
          <button type="button" :disabled="isRefreshing" class="contacts__btn" @click="refreshFromRelay">
            <RefreshCw :class="{ spin: isRefreshing }" /> <span>Sync</span>
          </button>
          <RouterLink to="/contacts/new" class="contacts__btn contacts__btn--primary">
            <Plus /> <span>New contact</span>
          </RouterLink>
        </template>
      </PageHeader>

      <AppAlertBanner v-if="error" :message="error" />

      <div class="contacts__search">
        <Search class="contacts__search-icon" />
        <input v-model="searchQuery" type="text" placeholder="Search name, email, phone, location, field…" class="contacts__input" />
        <button v-if="searchQuery" type="button" class="contacts__clear" @click="searchQuery = ''" aria-label="Clear search">
          <X />
        </button>
      </div>

      <div v-if="allTags.length" class="contacts__tags">
        <button type="button" :class="['contacts__chip', { on: activeTag === 'all' }]" @click="activeTag = 'all'">All ({{ items.length }})</button>
        <button v-for="t in allTags" :key="t.tag" type="button" :class="['contacts__chip', { on: activeTag === t.tag }]" @click="activeTag = t.tag">#{{ t.tag }} ({{ t.count }})</button>
      </div>

      <div v-if="isLoading" class="contacts__empty" role="status"><p>Loading contacts…</p></div>
      <div v-else-if="!items.length" class="contacts__empty">
        <Users class="contacts__empty-icon" />
        <p class="contacts__empty-eyebrow">Empty ledger</p>
        <h2>No contacts yet</h2>
        <p>Save people with email, phone, location — then add any custom field you want.</p>
        <RouterLink to="/contacts/new" class="contacts__btn contacts__btn--primary"><Plus /> <span>Add first contact</span></RouterLink>
      </div>
      <div v-else-if="!filteredItems.length" class="contacts__empty">
        <Search class="contacts__empty-icon" />
        <p class="contacts__empty-eyebrow">No match</p>
        <h2>No matching contacts</h2>
        <button type="button" class="contacts__btn" @click="searchQuery = ''; activeTag = 'all'">Clear filters</button>
      </div>

      <div v-else class="contacts__list">
        <article v-for="item in filteredItems" :key="item.id" class="contacts__card" @click="router.push(`/contacts/${item.id}`)">
          <div class="contacts__avatar" aria-hidden="true">{{ (item.name || "?").slice(0, 1).toUpperCase() }}</div>
          <div class="contacts__body">
            <h2 class="contacts__name">{{ item.name }}</h2>
            <p v-if="contactDisplaySubtitle(item)" class="contacts__meta">{{ contactDisplaySubtitle(item) }}</p>
            <p class="contacts__meta contacts__meta--dim">
              <Calendar /> {{ formatDate(item.updatedAt || item.createdAt) }}
              <span v-if="(item.fields || []).length"> · {{ item.fields.length }} field{{ item.fields.length === 1 ? "" : "s" }}</span>
              <span v-if="item.tags?.length"> · #{{ item.tags.slice(0, 3).join(" #") }}</span>
            </p>
          </div>
          <div class="contacts__row-actions" @click.stop>
            <button type="button" class="contacts__icon-btn" title="View & edit" @click="router.push(`/contacts/${item.id}`)"><Pencil /></button>
            <button type="button" class="contacts__icon-btn contacts__icon-btn--danger" title="Delete contact" @click="pendingDelete = item"><Trash2 /></button>
          </div>
        </article>
      </div>
    </main>

    <AppConfirmDialog
      :open="Boolean(pendingDelete)"
      title="Delete Contact?"
      :message="`Delete '${pendingDelete?.name || 'contact'}'? An encrypted tombstone will be published to your relays.`"
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </div>
</template>

<style scoped>
/* Ledger pass: contacts are a ruled address sheet. */

.contacts {
  min-height: 100vh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
}

.contacts__main {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  width: 100%;
  max-width: 72rem;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.contacts__sub {
  max-width: 56ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.contacts__btn {
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

.contacts__btn svg {
  width: 13px;
  height: 13px;
}

.contacts__btn:active {
  transform: translateY(1px);
}

.contacts__btn--primary {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.contacts__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.contacts__search {
  position: relative;
}

.contacts__search-icon {
  position: absolute;
  top: 50%;
  left: 14px;
  width: 14px;
  height: 14px;
  transform: translateY(-50%);
  color: var(--app-muted-2);
  pointer-events: none;
}

.contacts__input {
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

.contacts__input::placeholder {
  color: var(--app-muted-2);
}

.contacts__input:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.contacts__clear {
  position: absolute;
  top: 50%;
  right: 6px;
  display: flex;
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

.contacts__clear svg {
  width: 13px;
  height: 13px;
}

.contacts__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.contacts__chip {
  min-height: 26px;
  padding: 5px 8px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  color: var(--app-muted);
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.contacts__chip.on {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.contacts__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--app-space-3);
  padding: var(--app-space-8) var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  text-align: center;
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}

.contacts__empty-icon {
  width: 18px;
  height: 18px;
  color: var(--app-muted-2);
}

.contacts__empty-eyebrow {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--app-text-label);
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.contacts__empty h2 {
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

.contacts__empty p {
  max-width: 40ch;
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.contacts__empty .contacts__btn {
  margin-top: var(--app-space-2);
}

.contacts__list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
  animation: ledger-fade 320ms var(--app-ease-standard) both;
}

.contacts__card {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  padding: 14px;
  cursor: pointer;
  transition: background-color var(--app-dur-fast) var(--app-ease-standard);
}

.contacts__card + .contacts__card {
  border-top: 1px solid var(--app-border);
}

.contacts__avatar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--app-radius-sm);
  background: color-mix(in srgb, var(--app-primary) 10%, var(--app-surface));
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--app-primary);
}

.contacts__body {
  flex: 1;
  min-width: 0;
}

.contacts__name {
  overflow: hidden;
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.005em;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text);
}

.contacts__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-muted);
}

.contacts__meta svg {
  width: 11px;
  height: 11px;
}

.contacts__meta--dim {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--app-muted-2);
}

.contacts__row-actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
}

.contacts__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.contacts__icon-btn svg {
  width: 13px;
  height: 13px;
}

.contacts__icon-btn--danger {
  color: color-mix(in oklab, var(--app-danger) 70%, var(--app-muted));
}

.spin {
  animation: spin 1s linear infinite;
}

@media (min-width: 40rem) {
  .contacts__main {
    padding-inline: var(--app-space-6);
  }
}

@media (max-width: 26rem) {
  .contacts__avatar {
    display: none;
  }
}

@media (hover: hover) {
  .contacts__btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .contacts__btn--primary:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .contacts__card:hover {
    background: var(--app-surface-soft);
  }

  .contacts__chip:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .contacts__icon-btn:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }

  .contacts__icon-btn--danger:hover {
    background: var(--app-danger-soft);
    color: var(--app-danger);
  }

  .contacts__clear:hover {
    background: var(--app-surface-soft);
    color: var(--app-text);
  }
}

@media (pointer: coarse) {
  .contacts__btn,
  .contacts__chip,
  .contacts__clear {
    min-height: var(--app-touch-h);
  }

  .contacts__icon-btn {
    width: var(--app-touch-h);
    height: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .contacts__empty,
  .contacts__list {
    animation: none;
  }

  .contacts__btn,
  .contacts__chip,
  .contacts__card,
  .contacts__icon-btn,
  .contacts__input {
    transition: none;
  }
}
</style>
