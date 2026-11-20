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
  Layers,
} from "@/icons";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
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
      <div
        class="passwords-view__block-2"
      >
        <div>
          <h1 class="passwords-view__title-passwords">
            Passwords
            <span
              v-if="items.length"
              class="passwords-view__text"
            >
              ({{ items.length }})
            </span>
          </h1>
          <p class="passwords-view__text-2">
            End-to-end encrypted passwords, credentials, and TOTP 2FA keys stored privately on your
            relays.
          </p>
        </div>

        <div class="passwords-view__block-3">
          <!-- Sync button -->
          <button
            type="button"
            :disabled="isRefreshing"
            class="passwords-view__button-sync-from"
            title="Sync from relays"
            @click="refreshFromRelay"
          >
            <RefreshCw class="passwords-view__refresh-cw" :class="{ 'passwords-view__refresh-cw--spin': isRefreshing }" />
            <span>Sync</span>
          </button>

          <!-- New Password button -->
          <RouterLink
            to="/passwords/new"
            class="passwords-view__router-link"
          >
            <Plus class="passwords-view__plus" :stroke-width="2.2" />
            <span>New Password</span>
          </RouterLink>
        </div>
      </div>

      <AppAlertBanner v-if="error" :message="error" />

      <!-- Search and Tag Filter Bar -->
      <div class="passwords-view__block-4">
        <div class="passwords-view__block-5">
          <Search
            class="passwords-view__search"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search all passwords by title, username, email, website, or tags…"
            class="passwords-view__field-text"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="passwords-view__button"
            @click="searchQuery = ''"
          >
            <X class="passwords-view__x" />
          </button>
        </div>

        <!-- All items scope indicator -->
        <div
          v-if="searchQuery"
          class="passwords-view__block-6"
        >
          <span class="passwords-view__text-3" />
          <span
            >Searching all {{ items.length }} vault credentials ({{
              filteredItems.length
            }}
            matched)</span
          >
        </div>

        <!-- Tag Filter Chips -->
        <div
          v-if="allTags.length"
          class="passwords-view__block-7"
        >
          <button
            type="button"
            class="passwords-view__button-all"
            :class="
              activeTag === 'all'
                ? 'passwords-view__button-all--selected'
                : 'passwords-view__button-all--muted'
            "
            @click="activeTag = 'all'"
          >
            All
            <span class="passwords-view__text-4"
              >({{ items.length }})</span
            >
          </button>
          <button
            v-for="tagInfo in allTags"
            :key="tagInfo.tag"
            type="button"
            class="passwords-view__button-2"
            :class="
              activeTag === tagInfo.tag
                ? 'passwords-view__button--selected'
                : 'passwords-view__button--muted'
            "
            @click="activeTag = tagInfo.tag"
          >
            #{{ tagInfo.tag }}
            <span class="passwords-view__text-5"
              >({{ tagInfo.count }})</span
            >
          </button>
        </div>
      </div>

      <!-- Shimmer Skeleton Loading State -->
      <div v-if="isLoading" class="passwords-view__status" role="status">
        <span class="passwords-view__text-6">Loading passwords…</span>
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
        class="passwords-view__block-13"
      >
        <div
          class="passwords-view__block-14"
        >
          <Layers class="passwords-view__layers" />
        </div>
        <h2 class="passwords-view__subtitle-no-passwords">No passwords yet</h2>
        <p class="passwords-view__text-7">
          Your private password vault is empty. Add logins, generated passwords, or TOTP
          authenticator secrets.
        </p>
        <RouterLink
          to="/passwords/new"
          class="passwords-view__router-link-2"
        >
          <Plus class="passwords-view__plus-2" :stroke-width="2.2" />
          <span>Add first password</span>
        </RouterLink>
      </div>

      <!-- Search No Results -->
      <div
        v-else-if="filteredItems.length === 0"
        class="passwords-view__block-15"
      >
        <Search class="passwords-view__search-2" />
        <h2 class="passwords-view__subtitle-no-matching">No matching credentials</h2>
        <p class="passwords-view__text-8">
          No passwords match your search query "{{ searchQuery }}".
        </p>
        <button
          type="button"
          class="passwords-view__button-clear-filters"
          @click="
            searchQuery = '';
            activeTag = 'all';
          "
        >
          Clear filters
        </button>
      </div>

      <!-- Passwords List -->
      <div v-else class="passwords-view__block-16">
        <article
          v-for="item in filteredItems"
          :key="item.id"
          class="passwords-view__article"
          @click="navigateToDetail(item)"
        >
          <div class="passwords-view__block-17">
            <!-- Key Icon -->
            <div
              class="passwords-view__block-18"
            >
              <KeyRound class="passwords-view__key-round" :stroke-width="2" />
            </div>

            <!-- Content -->
            <div class="passwords-view__block-19">
              <div class="passwords-view__block-20">
                <h2
                  class="passwords-view__subtitle"
                >
                  {{ item.title || (item.uris?.[0] ? passwordHostname(item.uris[0]) : "Password") }}
                </h2>
                <span
                  v-if="item.uris && item.uris.length && item.uris[0]"
                  class="passwords-view__text-9"
                >
                  {{ passwordHostname(item.uris[0]) }}
                </span>
                <span
                  v-if="item.totp"
                  class="passwords-view__text-2fa-totp"
                >
                  2FA TOTP
                </span>
              </div>

              <div class="passwords-view__block-21">
                <span v-if="item.username" class="passwords-view__text-10">
                  {{ item.username }}
                </span>
                <span v-else-if="item.email" class="passwords-view__text-11">
                  {{ item.email }}
                </span>
                <span v-else class="passwords-view__text-no-username">No username</span>

                <span class="passwords-view__text-12">•</span>
                <span class="passwords-view__text-13">••••••••</span>
              </div>

              <!-- Tags & Meta row -->
              <div class="passwords-view__block-22">
                <span class="passwords-view__text-14">
                  <Calendar class="passwords-view__calendar" />
                  {{ formatDate(item.updatedAt || item.createdAt) }}
                </span>

                <span v-if="item.tags && item.tags.length" class="passwords-view__text-15">•</span>

                <div
                  v-if="item.tags && item.tags.length"
                  class="passwords-view__block-23"
                >
                  <span
                    v-for="tag in item.tags"
                    :key="tag"
                    class="passwords-view__text-16"
                    @click.stop="activeTag = tag"
                  >
                    #{{ tag }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Action Buttons -->
          <div
            class="passwords-view__block-24"
            @click.stop
          >
            <!-- Copy Username / Email -->
            <button
              v-if="item.username || item.email"
              type="button"
              class="passwords-view__button-3"
              :title="copiedMap[item.id + '_user'] ? 'Copied user!' : 'Copy username'"
              @click="copyValue(item.username || item.email, item.id + '_user', $event)"
            >
              <Check v-if="copiedMap[item.id + '_user']" class="passwords-view__check" />
              <User v-else class="passwords-view__user" />
              <span class="passwords-view__text-user">User</span>
            </button>

            <!-- Copy Password -->
            <button
              type="button"
              class="passwords-view__button-4"
              :title="copiedMap[item.id + '_pass'] ? 'Copied password!' : 'Copy password'"
              @click="copyValue(item.password, item.id + '_pass', $event)"
            >
              <Check v-if="copiedMap[item.id + '_pass']" class="passwords-view__check-2" />
              <KeyRound v-else class="passwords-view__key-round-2" />
              <span class="passwords-view__text-pass">Pass</span>
            </button>

            <!-- Edit / View detail -->
            <button
              type="button"
              class="passwords-view__button-view-edit"
              title="View & Edit password"
              @click="navigateToDetail(item)"
            >
              <Pencil class="passwords-view__pencil" />
            </button>

            <!-- Delete -->
            <button
              type="button"
              class="passwords-view__button-delete-password"
              title="Delete password"
              @click="handleDelete(item, $event)"
            >
              <Trash2 class="passwords-view__trash2" />
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
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {

@media (hover:hover) {
.passwords-view__subtitle:is(:where(.passwords-view__article):hover *) {
  color: var(--color-white);
}
}

@media (hover:hover) {
.passwords-view__button-delete-password:hover {
  border-color: #fb2c364d;
}
}

@media (hover:hover) {
@supports (color:color-mix(in lab,red,red)) {
.passwords-view__button-delete-password:hover {
  border-color: color-mix(in oklab,var(--color-red-500) 30%,transparent);
}
}
}

@media (hover:hover) {
.passwords-view__button-sync-from:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.passwords-view__article:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.passwords-view__text-16:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.passwords-view__button-3:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.passwords-view__button-4:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.passwords-view__button-view-edit:hover {
  border-color: var(--ui-zinc-700);
}
}

@media (hover:hover) {
.passwords-view__button-delete-password:hover {
  background-color: var(--app-danger-soft);
}
}

@media (hover:hover) {
.passwords-view__router-link:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.passwords-view__router-link-2:hover {
  background-color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.passwords-view__button-sync-from:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.passwords-view__button-all--muted:hover {
  background-color: var(--app-surface-tint-soft);
}
}

@media (hover:hover) {
.passwords-view__button--muted:hover {
  background-color: var(--app-surface-tint-soft);
}
}

@media (hover:hover) {
.passwords-view__article:hover {
  background-color: var(--app-surface-tint-soft);
}
}

@media (hover:hover) {
.passwords-view__button-sync-from:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.passwords-view__button-clear-filters:hover {
  color: var(--color-white);
}
}

@media (hover:hover) {
.passwords-view__button:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.passwords-view__button-all--muted:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.passwords-view__button--muted:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.passwords-view__text-16:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.passwords-view__button-3:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.passwords-view__button-4:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.passwords-view__button-view-edit:hover {
  color: var(--ui-zinc-200);
}
}

@media (hover:hover) {
.passwords-view__button-clear-filters:hover {
  text-decoration-line: underline;
}
}

@media (min-width:40rem) {
.passwords-view__text-user {
  display: inline;
}
}

@media (min-width:40rem) {
.passwords-view__text-pass {
  display: inline;
}
}

@media (min-width:40rem) {
.passwords-view__block-24 {
  width: auto;
}
}

@media (min-width:40rem) {
.passwords-view__block-2 {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.passwords-view__article {
  flex-direction: row;
}
}

@media (min-width:40rem) {
.passwords-view__block-2 {
  align-items: center;
}
}

@media (min-width:40rem) {
.passwords-view__article {
  align-items: center;
}
}

@media (min-width:40rem) {
.passwords-view__block-17 {
  align-items: center;
}
}

@media (min-width:40rem) {
.passwords-view__block-2 {
  justify-content: space-between;
}
}

@media (min-width:40rem) {
.passwords-view__block-24 {
  align-self: center;
}
}

@media (min-width:40rem) {
.passwords-view__block-24 {
  border-top-style: var(--border-style,solid);
  border-top-width: 0;
}
}

@media (min-width:40rem) {
.passwords-view__article {
  padding: calc(var(--spacing) * 5);
}
}

@media (min-width:40rem) {
.passwords-view__main {
  padding-inline: calc(var(--spacing) * 6);
}
}

@media (min-width:40rem) {
.passwords-view__block-24 {
  padding-top: 0;
}
}

@media (min-width:40rem) {
.passwords-view__subtitle {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
}

@media (min-width:64rem) {
.passwords-view__main {
  padding-inline: calc(var(--spacing) * 8);
}
}

@layer gupt-components {
.passwords-view__search {
  pointer-events: none;
}
.passwords-view__text-6 {
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  position: absolute;
  overflow: hidden;
}
.passwords-view__search {
  position: absolute;
}
.passwords-view__button {
  position: absolute;
}
.passwords-view__block-5 {
  position: relative;
}
.passwords-view__article {
  position: relative;
}
.passwords-view__search {
  top: 50%;
}
.passwords-view__button {
  top: 50%;
}
.passwords-view__button {
  right: calc(var(--spacing) * 3);
}
.passwords-view__search {
  left: calc(var(--spacing) * 3);
}
.passwords-view__main {
  margin-inline: auto;
}
.passwords-view__text-2 {
  margin-top: var(--spacing);
}
.passwords-view__text-7 {
  margin-top: var(--spacing);
}
.passwords-view__text-8 {
  margin-top: var(--spacing);
}
.passwords-view__button-clear-filters {
  margin-top: calc(var(--spacing) * 4);
}
.passwords-view__router-link-2 {
  margin-top: calc(var(--spacing) * 6);
}
.passwords-view__search-2 {
  margin-bottom: calc(var(--spacing) * 3);
}
.passwords-view__block-14 {
  margin-bottom: calc(var(--spacing) * 4);
}
.passwords-view__text {
  margin-left: var(--spacing);
}
.passwords-view__text-4 {
  margin-left: var(--spacing);
}
.passwords-view__text-5 {
  margin-left: var(--spacing);
}
.passwords-view__block-2 {
  display: flex;
}
.passwords-view__block-3 {
  display: flex;
}
.passwords-view__button {
  display: flex;
}
.passwords-view__block-6 {
  display: flex;
}
.passwords-view__block-7 {
  display: flex;
}
.passwords-view__block-8 {
  display: flex;
}
.passwords-view__block-13 {
  display: flex;
}
.passwords-view__block-14 {
  display: flex;
}
.passwords-view__block-15 {
  display: flex;
}
.passwords-view__article {
  display: flex;
}
.passwords-view__block-17 {
  display: flex;
}
.passwords-view__block-18 {
  display: flex;
}
.passwords-view__block-20 {
  display: flex;
}
.passwords-view__block-21 {
  display: flex;
}
.passwords-view__block-22 {
  display: flex;
}
.passwords-view__block-23 {
  display: flex;
}
.passwords-view__block-24 {
  display: flex;
}
.passwords-view__text-user {
  display: none;
}
.passwords-view__text-pass {
  display: none;
}
.passwords-view__button-sync-from {
  display: inline-flex;
}
.passwords-view__router-link {
  display: inline-flex;
}
.passwords-view__router-link-2 {
  display: inline-flex;
}
.passwords-view__text-14 {
  display: inline-flex;
}
.passwords-view__button-3 {
  display: inline-flex;
}
.passwords-view__button-4 {
  display: inline-flex;
}
.passwords-view__button-view-edit {
  display: inline-flex;
}
.passwords-view__button-delete-password {
  display: inline-flex;
}
.passwords-view__text-3 {
  height: calc(var(--spacing) * 1.5);
}
.passwords-view__block-12 {
  height: calc(var(--spacing) * 3);
}
.passwords-view__calendar {
  height: calc(var(--spacing) * 3);
}
.passwords-view__refresh-cw {
  height: calc(var(--spacing) * 3.5);
}
.passwords-view__plus {
  height: calc(var(--spacing) * 3.5);
}
.passwords-view__plus-2 {
  height: calc(var(--spacing) * 3.5);
}
.passwords-view__check {
  height: calc(var(--spacing) * 3.5);
}
.passwords-view__user {
  height: calc(var(--spacing) * 3.5);
}
.passwords-view__check-2 {
  height: calc(var(--spacing) * 3.5);
}
.passwords-view__key-round-2 {
  height: calc(var(--spacing) * 3.5);
}
.passwords-view__pencil {
  height: calc(var(--spacing) * 3.5);
}
.passwords-view__trash2 {
  height: calc(var(--spacing) * 3.5);
}
.passwords-view__search {
  height: calc(var(--spacing) * 4);
}
.passwords-view__x {
  height: calc(var(--spacing) * 4);
}
.passwords-view__block-11 {
  height: calc(var(--spacing) * 4);
}
.passwords-view__key-round {
  height: calc(var(--spacing) * 5);
}
.passwords-view__layers {
  height: calc(var(--spacing) * 6);
}
.passwords-view__search-2 {
  height: calc(var(--spacing) * 7);
}
.passwords-view__button-sync-from {
  height: calc(var(--spacing) * 8);
}
.passwords-view__router-link {
  height: calc(var(--spacing) * 8);
}
.passwords-view__button-3 {
  height: calc(var(--spacing) * 8);
}
.passwords-view__button-4 {
  height: calc(var(--spacing) * 8);
}
.passwords-view__button-view-edit {
  height: calc(var(--spacing) * 8);
}
.passwords-view__button-delete-password {
  height: calc(var(--spacing) * 8);
}
.passwords-view__router-link-2 {
  height: calc(var(--spacing) * 9);
}
.passwords-view__field-text {
  height: calc(var(--spacing) * 10);
}
.passwords-view__block-9 {
  height: calc(var(--spacing) * 10);
}
.passwords-view__block-18 {
  height: calc(var(--spacing) * 10);
}
.passwords-view__block-14 {
  height: calc(var(--spacing) * 12);
}
.passwords-view__button {
  min-height: 32px;
}
.passwords-view__block {
  min-height: 100vh;
}
.passwords-view__text-3 {
  width: calc(var(--spacing) * 1.5);
}
.passwords-view__calendar {
  width: calc(var(--spacing) * 3);
}
.passwords-view__refresh-cw {
  width: calc(var(--spacing) * 3.5);
}
.passwords-view__plus {
  width: calc(var(--spacing) * 3.5);
}
.passwords-view__plus-2 {
  width: calc(var(--spacing) * 3.5);
}
.passwords-view__check {
  width: calc(var(--spacing) * 3.5);
}
.passwords-view__user {
  width: calc(var(--spacing) * 3.5);
}
.passwords-view__check-2 {
  width: calc(var(--spacing) * 3.5);
}
.passwords-view__key-round-2 {
  width: calc(var(--spacing) * 3.5);
}
.passwords-view__pencil {
  width: calc(var(--spacing) * 3.5);
}
.passwords-view__trash2 {
  width: calc(var(--spacing) * 3.5);
}
.passwords-view__search {
  width: calc(var(--spacing) * 4);
}
.passwords-view__x {
  width: calc(var(--spacing) * 4);
}
.passwords-view__key-round {
  width: calc(var(--spacing) * 5);
}
.passwords-view__layers {
  width: calc(var(--spacing) * 6);
}
.passwords-view__search-2 {
  width: calc(var(--spacing) * 7);
}
.passwords-view__button-view-edit {
  width: calc(var(--spacing) * 8);
}
.passwords-view__button-delete-password {
  width: calc(var(--spacing) * 8);
}
.passwords-view__block-9 {
  width: calc(var(--spacing) * 10);
}
.passwords-view__block-18 {
  width: calc(var(--spacing) * 10);
}
.passwords-view__block-14 {
  width: calc(var(--spacing) * 12);
}
.passwords-view__block-11 {
  width: calc(var(--spacing) * 48);
}
.passwords-view__block-12 {
  width: calc(var(--spacing) * 72);
}
.passwords-view__main {
  width: 100%;
}
.passwords-view__field-text {
  width: 100%;
}
.passwords-view__block-24 {
  width: 100%;
}
.passwords-view__main {
  max-width: var(--container-6xl);
}
.passwords-view__block-12 {
  max-width: 100%;
}
.passwords-view__text-7 {
  max-width: var(--container-sm);
}
.passwords-view__block-10 {
  min-width: 0;
}
.passwords-view__block-17 {
  min-width: 0;
}
.passwords-view__block-19 {
  min-width: 0;
}
.passwords-view__button {
  min-width: 32px;
}
.passwords-view__block-10 {
  flex: 1;
}
.passwords-view__block-17 {
  flex: 1;
}
.passwords-view__block-19 {
  flex: 1;
}
.passwords-view__block-9 {
  flex-shrink: 0;
}
.passwords-view__block-18 {
  flex-shrink: 0;
}
.passwords-view__block-24 {
  flex-shrink: 0;
}
.passwords-view__search {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.passwords-view__button {
  --translate-y: -50% ;
  translate: var(--translate-x,0) -50% ;
}
.passwords-view__refresh-cw--spin {
  animation: var(--animate-spin);
}
.passwords-view__button-sync-from {
  cursor: pointer;
}
.passwords-view__router-link {
  cursor: pointer;
}
.passwords-view__button {
  cursor: pointer;
}
.passwords-view__button-all {
  cursor: pointer;
}
.passwords-view__button-2 {
  cursor: pointer;
}
.passwords-view__button-clear-filters {
  cursor: pointer;
}
.passwords-view__article {
  cursor: pointer;
}
.passwords-view__button-3 {
  cursor: pointer;
}
.passwords-view__button-4 {
  cursor: pointer;
}
.passwords-view__button-view-edit {
  cursor: pointer;
}
.passwords-view__button-delete-password {
  cursor: pointer;
}
.passwords-view__block-7 {
  scrollbar-width: none;
}
.passwords-view__block-2 {
  flex-direction: column;
}
.passwords-view__block-13 {
  flex-direction: column;
}
.passwords-view__block-15 {
  flex-direction: column;
}
.passwords-view__article {
  flex-direction: column;
}
.passwords-view__block-3 {
  flex-wrap: wrap;
}
.passwords-view__block-20 {
  flex-wrap: wrap;
}
.passwords-view__block-21 {
  flex-wrap: wrap;
}
.passwords-view__block-22 {
  flex-wrap: wrap;
}
.passwords-view__block-23 {
  flex-wrap: wrap;
}
.passwords-view__block-3 {
  align-items: center;
}
.passwords-view__button-sync-from {
  align-items: center;
}
.passwords-view__router-link {
  align-items: center;
}
.passwords-view__button {
  align-items: center;
}
.passwords-view__block-6 {
  align-items: center;
}
.passwords-view__block-8 {
  align-items: center;
}
.passwords-view__block-13 {
  align-items: center;
}
.passwords-view__block-14 {
  align-items: center;
}
.passwords-view__router-link-2 {
  align-items: center;
}
.passwords-view__block-15 {
  align-items: center;
}
.passwords-view__block-18 {
  align-items: center;
}
.passwords-view__block-20 {
  align-items: center;
}
.passwords-view__block-21 {
  align-items: center;
}
.passwords-view__block-22 {
  align-items: center;
}
.passwords-view__text-14 {
  align-items: center;
}
.passwords-view__block-23 {
  align-items: center;
}
.passwords-view__block-24 {
  align-items: center;
}
.passwords-view__button-3 {
  align-items: center;
}
.passwords-view__button-4 {
  align-items: center;
}
.passwords-view__button-view-edit {
  align-items: center;
}
.passwords-view__button-delete-password {
  align-items: center;
}
.passwords-view__block-17 {
  align-items: flex-start;
}
.passwords-view__article {
  justify-content: space-between;
}
.passwords-view__button {
  justify-content: center;
}
.passwords-view__block-13 {
  justify-content: center;
}
.passwords-view__block-14 {
  justify-content: center;
}
.passwords-view__block-15 {
  justify-content: center;
}
.passwords-view__block-18 {
  justify-content: center;
}
.passwords-view__button-view-edit {
  justify-content: center;
}
.passwords-view__button-delete-password {
  justify-content: center;
}
.passwords-view__block-24 {
  justify-content: flex-end;
}
.passwords-view__text-14 {
  gap: var(--spacing);
}
.passwords-view__button-3 {
  gap: var(--spacing);
}
.passwords-view__button-4 {
  gap: var(--spacing);
}
.passwords-view__button-sync-from {
  gap: calc(var(--spacing) * 1.5);
}
.passwords-view__router-link {
  gap: calc(var(--spacing) * 1.5);
}
.passwords-view__block-6 {
  gap: calc(var(--spacing) * 1.5);
}
.passwords-view__block-7 {
  gap: calc(var(--spacing) * 1.5);
}
.passwords-view__router-link-2 {
  gap: calc(var(--spacing) * 1.5);
}
.passwords-view__block-23 {
  gap: calc(var(--spacing) * 1.5);
}
.passwords-view__block-24 {
  gap: calc(var(--spacing) * 1.5);
}
.passwords-view__block-3 {
  gap: calc(var(--spacing) * 2);
}
.passwords-view__block-20 {
  gap: calc(var(--spacing) * 2);
}
.passwords-view__block-22 {
  gap: calc(var(--spacing) * 2);
}
.passwords-view__block-17 {
  gap: calc(var(--spacing) * 3.5);
}
.passwords-view__block-2 {
  gap: calc(var(--spacing) * 4);
}
.passwords-view__block-8 {
  gap: calc(var(--spacing) * 4);
}
.passwords-view__article {
  gap: calc(var(--spacing) * 4);
}
:where(.passwords-view__block-19>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
:where(.passwords-view__block-10>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 2) * 0);
  margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - 0));
}
:where(.passwords-view__block-4>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.passwords-view__status>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.passwords-view__block-16>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 3) * 0);
  margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - 0));
}
:where(.passwords-view__main>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - 0));
}
.passwords-view__block-21 {
  column-gap: calc(var(--spacing) * 3);
}
.passwords-view__block-21 {
  row-gap: var(--spacing);
}
.passwords-view__block-24 {
  align-self: flex-end;
}
.passwords-view__subtitle {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.passwords-view__text-10 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.passwords-view__text-11 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.passwords-view__block-7 {
  overflow-x: auto;
}
.passwords-view__text-3 {
  border-radius: 3.40282e38px;
}
.passwords-view__button-sync-from {
  border-radius: var(--radius-lg);
}
.passwords-view__router-link {
  border-radius: var(--radius-lg);
}
.passwords-view__router-link-2 {
  border-radius: var(--radius-lg);
}
.passwords-view__button-3 {
  border-radius: var(--radius-lg);
}
.passwords-view__button-4 {
  border-radius: var(--radius-lg);
}
.passwords-view__button-view-edit {
  border-radius: var(--radius-lg);
}
.passwords-view__button-delete-password {
  border-radius: var(--radius-lg);
}
.passwords-view__button-all {
  border-radius: var(--radius-md);
}
.passwords-view__button-2 {
  border-radius: var(--radius-md);
}
.passwords-view__text-9 {
  border-radius: var(--radius-md);
}
.passwords-view__text-2fa-totp {
  border-radius: var(--radius-md);
}
.passwords-view__text-16 {
  border-radius: var(--radius-md);
}
.passwords-view__field-text {
  border-radius: var(--radius-xl);
}
.passwords-view__block-8 {
  border-radius: var(--radius-xl);
}
.passwords-view__block-9 {
  border-radius: var(--radius-xl);
}
.passwords-view__block-13 {
  border-radius: var(--radius-xl);
}
.passwords-view__block-14 {
  border-radius: var(--radius-xl);
}
.passwords-view__block-15 {
  border-radius: var(--radius-xl);
}
.passwords-view__article {
  border-radius: var(--radius-xl);
}
.passwords-view__block-18 {
  border-radius: var(--radius-xl);
}
.passwords-view__button-sync-from {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__field-text {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__button-all {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__button-2 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__block-8 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__block-13 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__block-14 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__block-15 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__article {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__block-18 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__text-2fa-totp {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__text-16 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__button-3 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__button-4 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__button-view-edit {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__button-delete-password {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.passwords-view__block-24 {
  border-top-style: var(--border-style,solid);
  border-top-width: 1px;
}
.passwords-view__block-2 {
  border-bottom-style: var(--border-style,solid);
  border-bottom-width: 1px;
}
.passwords-view__text-2fa-totp {
  border-color: #00bb7f33;
}
.passwords-view__button-sync-from {
  border-color: var(--ui-zinc-800);
}
.passwords-view__field-text {
  border-color: var(--ui-zinc-800);
}
.passwords-view__button-all--selected {
  border-color: var(--ui-zinc-800);
}
.passwords-view__button--selected {
  border-color: var(--ui-zinc-800);
}
.passwords-view__block-14 {
  border-color: var(--ui-zinc-800);
}
.passwords-view__block-18 {
  border-color: var(--ui-zinc-800);
}
.passwords-view__text-16 {
  border-color: var(--ui-zinc-800);
}
.passwords-view__button-3 {
  border-color: var(--ui-zinc-800);
}
.passwords-view__button-4 {
  border-color: var(--ui-zinc-800);
}
.passwords-view__button-view-edit {
  border-color: var(--ui-zinc-800);
}
.passwords-view__button-delete-password {
  border-color: var(--ui-zinc-800);
}
.passwords-view__block-2 {
  border-color: var(--app-border-quiet);
}
.passwords-view__button-all--muted {
  border-color: var(--app-border-quiet);
}
.passwords-view__button--muted {
  border-color: var(--app-border-quiet);
}
.passwords-view__block-8 {
  border-color: var(--app-border-quiet);
}
.passwords-view__block-13 {
  border-color: var(--app-border-quiet);
}
.passwords-view__block-15 {
  border-color: var(--app-border-quiet);
}
.passwords-view__article {
  border-color: var(--app-border-quiet);
}
.passwords-view__block-24 {
  border-color: var(--app-border-quiet);
}
.passwords-view__block {
  background-color: var(--ui-black);
}
.passwords-view__text-3 {
  background-color: var(--color-emerald-400);
}
.passwords-view__text-2fa-totp {
  background-color: #00bb7f1a;
}
.passwords-view__router-link {
  background-color: var(--color-white);
}
.passwords-view__router-link-2 {
  background-color: var(--color-white);
}
.passwords-view__button-all--selected {
  background-color: var(--ui-zinc-800);
}
.passwords-view__button--selected {
  background-color: var(--ui-zinc-800);
}
.passwords-view__text-9 {
  background-color: var(--ui-zinc-800);
}
.passwords-view__block-14 {
  background-color: var(--ui-zinc-900);
}
.passwords-view__block-18 {
  background-color: var(--ui-zinc-900);
}
.passwords-view__button-sync-from {
  background-color: var(--app-surface-tint);
}
.passwords-view__text-16 {
  background-color: var(--app-surface-tint);
}
.passwords-view__block-8 {
  background-color: var(--app-surface-inset);
}
.passwords-view__block-13 {
  background-color: var(--app-surface-inset);
}
.passwords-view__block-15 {
  background-color: var(--app-surface-inset);
}
.passwords-view__article {
  background-color: var(--app-surface-inset);
}
.passwords-view__field-text {
  background-color: var(--app-surface-inset-strong);
}
.passwords-view__block-8 {
  padding: calc(var(--spacing) * 4);
}
.passwords-view__article {
  padding: calc(var(--spacing) * 4);
}
.passwords-view__block-6 {
  padding-inline: var(--spacing);
}
.passwords-view__text-9 {
  padding-inline: calc(var(--spacing) * 2);
}
.passwords-view__text-2fa-totp {
  padding-inline: calc(var(--spacing) * 2);
}
.passwords-view__text-16 {
  padding-inline: calc(var(--spacing) * 2);
}
.passwords-view__button-3 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.passwords-view__button-4 {
  padding-inline: calc(var(--spacing) * 2.5);
}
.passwords-view__button-sync-from {
  padding-inline: calc(var(--spacing) * 3);
}
.passwords-view__router-link {
  padding-inline: calc(var(--spacing) * 3);
}
.passwords-view__button-all {
  padding-inline: calc(var(--spacing) * 3);
}
.passwords-view__button-2 {
  padding-inline: calc(var(--spacing) * 3);
}
.passwords-view__main {
  padding-inline: calc(var(--spacing) * 4);
}
.passwords-view__router-link-2 {
  padding-inline: calc(var(--spacing) * 4);
}
.passwords-view__block-13 {
  padding-inline: calc(var(--spacing) * 6);
}
.passwords-view__block-15 {
  padding-inline: calc(var(--spacing) * 6);
}
.passwords-view__text-9 {
  padding-block: calc(var(--spacing) * .5);
}
.passwords-view__text-2fa-totp {
  padding-block: calc(var(--spacing) * .5);
}
.passwords-view__text-16 {
  padding-block: calc(var(--spacing) * .5);
}
.passwords-view__button-all {
  padding-block: var(--spacing);
}
.passwords-view__button-2 {
  padding-block: var(--spacing);
}
.passwords-view__main {
  padding-block: calc(var(--spacing) * 6);
}
.passwords-view__block-15 {
  padding-block: calc(var(--spacing) * 12);
}
.passwords-view__block-13 {
  padding-block: calc(var(--spacing) * 16);
}
.passwords-view__block-22 {
  padding-top: calc(var(--spacing) * .5);
}
.passwords-view__block-24 {
  padding-top: calc(var(--spacing) * 3);
}
.passwords-view__field-text {
  padding-right: calc(var(--spacing) * 9);
}
.passwords-view__block-7 {
  padding-bottom: var(--spacing);
}
.passwords-view__block-2 {
  padding-bottom: calc(var(--spacing) * 5);
}
.passwords-view__block {
  padding-bottom: calc(var(--spacing) * 16);
}
.passwords-view__field-text {
  padding-left: calc(var(--spacing) * 9);
}
.passwords-view__block-13 {
  text-align: center;
}
.passwords-view__block-15 {
  text-align: center;
}
.passwords-view__text {
  font-family: var(--font-mono);
}
.passwords-view__block-6 {
  font-family: var(--font-mono);
}
.passwords-view__text-4 {
  font-family: var(--font-mono);
}
.passwords-view__text-5 {
  font-family: var(--font-mono);
}
.passwords-view__text-9 {
  font-family: var(--font-mono);
}
.passwords-view__text-13 {
  font-family: var(--font-mono);
}
.passwords-view__text-14 {
  font-family: var(--font-mono);
}
.passwords-view__text-2 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.passwords-view__field-text {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.passwords-view__subtitle-no-passwords {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.passwords-view__text-7 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.passwords-view__subtitle-no-matching {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.passwords-view__text-8 {
  font-size: var(--text-sm);
  line-height: var(--leading,var(--text-sm--line-height));
}
.passwords-view__title-passwords {
  font-size: var(--text-xl);
  line-height: var(--leading,var(--text-xl--line-height));
}
.passwords-view__button-sync-from {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.passwords-view__router-link {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.passwords-view__button-all {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.passwords-view__button-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.passwords-view__router-link-2 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.passwords-view__button-clear-filters {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.passwords-view__subtitle {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.passwords-view__block-21 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.passwords-view__block-22 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.passwords-view__button-3 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.passwords-view__button-4 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.passwords-view__text-4 {
  font-size: 10px;
}
.passwords-view__text-5 {
  font-size: 10px;
}
.passwords-view__text-2fa-totp {
  font-size: 10px;
}
.passwords-view__text-16 {
  font-size: 10px;
}
.passwords-view__text {
  font-size: 11px;
}
.passwords-view__block-6 {
  font-size: 11px;
}
.passwords-view__text-9 {
  font-size: 11px;
}
.passwords-view__text-14 {
  font-size: 11px;
}
.passwords-view__text-2 {
  --leading: calc(var(--spacing) * 6);
  line-height: calc(var(--spacing) * 6);
}
.passwords-view__text-7 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.passwords-view__text {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.passwords-view__button-sync-from {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.passwords-view__button-all {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.passwords-view__button-2 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.passwords-view__button-clear-filters {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.passwords-view__text-2fa-totp {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.passwords-view__text-10 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.passwords-view__text-11 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.passwords-view__text-16 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.passwords-view__button-3 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.passwords-view__button-4 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.passwords-view__title-passwords {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.passwords-view__router-link {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.passwords-view__subtitle-no-passwords {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.passwords-view__router-link-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.passwords-view__subtitle-no-matching {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.passwords-view__subtitle {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.passwords-view__title-passwords {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.passwords-view__subtitle-no-passwords {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.passwords-view__subtitle {
  --tracking: var(--tracking-tight);
  letter-spacing: var(--tracking-tight);
}
.passwords-view__button-all {
  white-space: nowrap;
}
.passwords-view__button-2 {
  white-space: nowrap;
}
.passwords-view__router-link {
  color: var(--ui-black);
}
.passwords-view__router-link-2 {
  color: var(--ui-black);
}
.passwords-view__text-2fa-totp {
  color: var(--color-emerald-400);
}
.passwords-view__check {
  color: var(--color-emerald-400);
}
.passwords-view__check-2 {
  color: var(--color-emerald-400);
}
.passwords-view__button-delete-password {
  color: var(--color-red-400);
}
.passwords-view__title-passwords {
  color: var(--color-white);
}
.passwords-view__button-all--selected {
  color: var(--color-white);
}
.passwords-view__button--selected {
  color: var(--color-white);
}
.passwords-view__block {
  color: var(--ui-zinc-100);
}
.passwords-view__field-text {
  color: var(--ui-zinc-100);
}
.passwords-view__subtitle-no-passwords {
  color: var(--ui-zinc-200);
}
.passwords-view__subtitle-no-matching {
  color: var(--ui-zinc-200);
}
.passwords-view__subtitle {
  color: var(--ui-zinc-200);
}
.passwords-view__button-sync-from {
  color: var(--ui-zinc-300);
}
.passwords-view__block-18 {
  color: var(--ui-zinc-300);
}
.passwords-view__text-9 {
  color: var(--ui-zinc-300);
}
.passwords-view__text-2 {
  color: var(--ui-zinc-400);
}
.passwords-view__block-6 {
  color: var(--ui-zinc-400);
}
.passwords-view__button-all--muted {
  color: var(--ui-zinc-400);
}
.passwords-view__button--muted {
  color: var(--ui-zinc-400);
}
.passwords-view__button-clear-filters {
  color: var(--ui-zinc-400);
}
.passwords-view__text-10 {
  color: var(--ui-zinc-400);
}
.passwords-view__text-11 {
  color: var(--ui-zinc-400);
}
.passwords-view__text-16 {
  color: var(--ui-zinc-400);
}
.passwords-view__button-3 {
  color: var(--ui-zinc-400);
}
.passwords-view__button-4 {
  color: var(--ui-zinc-400);
}
.passwords-view__text {
  color: var(--ui-zinc-500);
}
.passwords-view__text-4 {
  color: var(--ui-zinc-500);
}
.passwords-view__text-5 {
  color: var(--ui-zinc-500);
}
.passwords-view__block-14 {
  color: var(--ui-zinc-500);
}
.passwords-view__text-7 {
  color: var(--ui-zinc-500);
}
.passwords-view__text-8 {
  color: var(--ui-zinc-500);
}
.passwords-view__button-view-edit {
  color: var(--ui-zinc-500);
}
.passwords-view__search {
  color: var(--ui-zinc-600);
}
.passwords-view__button {
  color: var(--ui-zinc-600);
}
.passwords-view__search-2 {
  color: var(--ui-zinc-600);
}
.passwords-view__block-21 {
  color: var(--ui-zinc-600);
}
.passwords-view__block-22 {
  color: var(--ui-zinc-600);
}
.passwords-view__text-12 {
  color: var(--ui-zinc-700);
}
.passwords-view__text-15 {
  color: var(--ui-zinc-700);
}
.passwords-view__text-no-username {
  font-style: italic;
}
.passwords-view__text {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.passwords-view__text-4 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.passwords-view__text-5 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.passwords-view__text-9 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.passwords-view__text-14 {
  --numeric-spacing: tabular-nums;
  font-variant-numeric: var(--ordinal,) var(--slashed-zero,) var(--numeric-figure,) tabular-nums var(--numeric-fraction,);
}
.passwords-view__button-sync-from {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.passwords-view__router-link {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.passwords-view__button-all--selected {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.passwords-view__button--selected {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.passwords-view__router-link-2 {
  --shadow: 0 1px 2px 0 var(--shadow-color,#0000000d);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-shadow,0 0 #0000), 0 1px 2px 0 var(--shadow-color,#0000000d);
}
.passwords-view__button-sync-from {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.passwords-view__router-link {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.passwords-view__button-all {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.passwords-view__button-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.passwords-view__router-link-2 {
  transition-property: all;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.passwords-view__field-text {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.passwords-view__article {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.passwords-view__subtitle {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.passwords-view__button-3 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.passwords-view__button-4 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.passwords-view__button-view-edit {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.passwords-view__button-delete-password {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
.passwords-view__article {
  --duration: .15s;
  transition-duration: .15s;
}
.passwords-view__button-all {
  -webkit-user-select: none;
  user-select: none;
}
.passwords-view__button-2 {
  -webkit-user-select: none;
  user-select: none;
}
.passwords-view__block-7 {
  -ms-overflow-style: none;
}
.passwords-view__field-text::placeholder {
  color: var(--ui-zinc-600);
}
.passwords-view__field-text:focus {
  border-color: var(--ui-zinc-600);
}
.passwords-view__field-text:focus {
  --outline-style: none;
  outline-style: none;
}
.passwords-view__router-link:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.passwords-view__router-link-2:active {
  --scale-x: 95%;
  --scale-y: 95%;
  --scale-z: 95%;
  scale: 95% 95%;
}
.passwords-view__button-sync-from:disabled {
  opacity: .5;
}
.passwords-view__block-7::-webkit-scrollbar {
  display: none;
}
[data-theme="light"] .passwords-view__text-2fa-totp {
  color: var(--app-success);
}
[data-theme="light"] .passwords-view__check {
  color: var(--app-success);
}
[data-theme="light"] .passwords-view__check-2 {
  color: var(--app-success);
}
[data-theme="light"] .passwords-view__button-delete-password {
  color: var(--app-danger);
}
[data-theme="light"] .passwords-view__button-sync-from {
  color: var(--app-text-soft);
}
[data-theme="light"] .passwords-view__block-18 {
  color: var(--app-text-soft);
}
[data-theme="light"] .passwords-view__text-9 {
  color: var(--app-text-soft);
}
[data-theme="light"] .passwords-view__text-2 {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__block-6 {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__button-all--muted {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__button--muted {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__button-clear-filters {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__text-10 {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__text-11 {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__text-16 {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__button-3 {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__button-4 {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__text {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__text-4 {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__text-5 {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__block-14 {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__text-7 {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__text-8 {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__button-view-edit {
  color: var(--app-muted);
}
[data-theme="light"] .passwords-view__search {
  color: var(--app-text-soft);
}
[data-theme="light"] .passwords-view__button {
  color: var(--app-text-soft);
}
[data-theme="light"] .passwords-view__search-2 {
  color: var(--app-text-soft);
}
[data-theme="light"] .passwords-view__block-21 {
  color: var(--app-text-soft);
}
[data-theme="light"] .passwords-view__block-22 {
  color: var(--app-text-soft);
}
[data-theme="light"] .passwords-view__button:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .passwords-view__button-all--muted:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .passwords-view__button--muted:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .passwords-view__text-16:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .passwords-view__button-3:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .passwords-view__button-4:hover {
  color: var(--app-text) !important;
}
[data-theme="light"] .passwords-view__button-view-edit:hover {
  color: var(--app-text) !important;
}
}
}

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.passwords-view__text-2fa-totp {
  border-color: color-mix(in oklab,var(--color-emerald-500) 20%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.passwords-view__text-2fa-totp {
  background-color: color-mix(in oklab,var(--color-emerald-500) 10%,transparent);
}
}

}
</style>
