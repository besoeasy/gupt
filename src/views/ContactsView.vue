<script setup>
import { ref, computed, onMounted } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { Users, Trash2, RefreshCw, Search, Plus, X, Pencil, Calendar, Layers } from "@/icons";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
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
      <div class="contacts__head">
        <div>
          <h1 class="contacts__title">Contacts <span v-if="items.length">({{ items.length }})</span></h1>
          <p class="contacts__sub">End-to-end encrypted address book. Email, phone, location plus any custom field you need.</p>
        </div>
        <div class="contacts__actions">
          <button type="button" :disabled="isRefreshing" class="contacts__btn" @click="refreshFromRelay">
            <RefreshCw :class="{ spin: isRefreshing }" /> <span>Sync</span>
          </button>
          <RouterLink to="/contacts/new" class="contacts__btn contacts__btn--primary">
            <Plus /> <span>New Contact</span>
          </RouterLink>
        </div>
      </div>

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
        <h2>No contacts yet</h2>
        <p>Save people with email, phone, location — then add any custom field you want.</p>
        <RouterLink to="/contacts/new" class="contacts__btn contacts__btn--primary"><Plus /> <span>Add first contact</span></RouterLink>
      </div>
      <div v-else-if="!filteredItems.length" class="contacts__empty">
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
.contacts { min-height: 100vh; background: var(--ui-black); color: var(--ui-zinc-100); padding-bottom: 4rem; animation: contacts-in 0.25s ease; }
@keyframes contacts-in { from { opacity: 0; } to { opacity: 1; } }
.contacts__main { width: 100%; max-width: var(--container-6xl); margin-inline: auto; padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 1rem; }
.contacts__head { display: flex; flex-direction: column; gap: 1rem; padding-bottom: 1.25rem; border-bottom: 1px solid var(--app-border-quiet); }
.contacts__title { font-size: var(--text-xl); font-weight: 600; letter-spacing: var(--tracking-tight); color: var(--color-white); }
.contacts__sub { font-size: var(--text-sm); color: var(--ui-zinc-400); margin-top: 0.25rem; }
.contacts__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.contacts__btn { display: inline-flex; align-items: center; gap: 0.375rem; min-height: 44px; padding-inline: 0.75rem; border-radius: var(--radius-lg); border: 1px solid var(--ui-zinc-800); background: var(--app-surface-tint); color: var(--ui-zinc-300); font-size: var(--text-xs); font-weight: 500; cursor: pointer; text-decoration: none; }
.contacts__btn--primary { background: var(--color-white); color: var(--ui-black); font-weight: 600; }
.contacts__btn:disabled { opacity: 0.5; }
.contacts__search { position: relative; }
.contacts__search-icon { position: absolute; left: 0.75rem; top: 50%; translate: 0 -50%; width: 1rem; height: 1rem; color: var(--ui-zinc-600); pointer-events: none; }
.contacts__input { width: 100%; height: 2.5rem; min-height: 44px; border-radius: var(--radius-xl); border: 1px solid var(--ui-zinc-800); background: var(--app-surface-inset-strong); color: var(--ui-zinc-100); padding-left: 2.25rem; padding-right: 2.25rem; font-size: var(--text-sm); }
.contacts__clear { position: absolute; right: 0.75rem; top: 50%; translate: 0 -50%; min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; color: var(--ui-zinc-600); background: transparent; border: 0; cursor: pointer; }
.contacts__tags { display: flex; gap: 0.375rem; overflow-x: auto; padding-bottom: 0.25rem; }
.contacts__chip { white-space: nowrap; min-height: 44px; padding: 0.25rem 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--app-border-quiet); background: transparent; color: var(--ui-zinc-400); font-size: var(--text-xs); cursor: pointer; }
.contacts__chip.on { background: var(--ui-zinc-800); color: var(--color-white); border-color: var(--ui-zinc-800); }
.contacts__empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 0.5rem; padding: 4rem 1.5rem; border: 1px solid var(--app-border-quiet); border-radius: var(--radius-xl); background: var(--app-surface-inset); }
.contacts__empty-icon { width: 1.75rem; height: 1.75rem; color: var(--ui-zinc-500); }
.contacts__list { display: flex; flex-direction: column; gap: 0.75rem; }
.contacts__card { display: flex; gap: 0.875rem; padding: 1rem; border-radius: var(--radius-xl); border: 1px solid var(--app-border-quiet); background: var(--app-surface-inset); cursor: pointer; align-items: flex-start; }
.contacts__card:hover { background: var(--app-surface-tint-soft); border-color: var(--ui-zinc-700); }
.contacts__avatar { width: 2.5rem; height: 2.5rem; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-xl); background: var(--ui-zinc-900); border: 1px solid var(--ui-zinc-800); color: var(--ui-zinc-300); font-weight: 600; }
.contacts__body { flex: 1; min-width: 0; }
.contacts__name { font-size: var(--text-xs); font-weight: 600; color: var(--ui-zinc-200); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.contacts__meta { font-size: 11px; color: var(--ui-zinc-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 0.25rem; }
.contacts__meta--dim { color: var(--ui-zinc-600); }
.contacts__row-actions { display: flex; gap: 0.375rem; flex-shrink: 0; }
.contacts__icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: var(--radius-lg); border: 1px solid var(--ui-zinc-800); background: transparent; color: var(--ui-zinc-500); cursor: pointer; }
.contacts__icon-btn--danger { color: var(--color-red-400); }
.contacts__icon-btn--danger:hover { background: var(--app-danger-soft); }
.spin { animation: var(--animate-spin); }
@media (min-width: 40rem) {
  .contacts__main { padding-inline: 1.5rem; }
  .contacts__head { flex-direction: row; align-items: center; justify-content: space-between; }
}
[data-theme="light"] .contacts { background: var(--app-bg); color: var(--app-text); }
[data-theme="light"] .contacts__title { color: var(--app-text); }
[data-theme="light"] .contacts__sub { color: var(--app-muted); }
[data-theme="light"] .contacts__card { background: var(--app-surface); }
[data-theme="light"] .contacts__input { background: var(--app-surface); color: var(--app-text); }
[data-theme="light"] .contacts__chip { color: var(--app-muted); }
</style>
