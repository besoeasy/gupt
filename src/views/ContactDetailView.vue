<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Plus, X, Trash2, Check, LoaderCircle, Copy, Tag, Mail, Phone, MapPin } from "@/icons";
import PageHeader from "@/components/PageHeader.vue";
import AppAlertBanner from "@/components/AppAlertBanner.vue";
import AppConfirmDialog from "@/components/AppConfirmDialog.vue";
import RelayEventLink from "@/components/RelayEventLink.vue";
import { useIdentityStore } from "@/stores/identity";
import { copyToClipboard } from "@/lib/clipboard";
import {
  getContactsCached,
  fetchContacts,
  saveContact,
  deleteContact,
  normalizeContactTags,
  parseContactTagsInput,
} from "@/lib/contacts";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();

const contactId = computed(() => route.params.id || "");
const isNew = computed(() => !contactId.value || route.path === "/contacts/new");

const isLoading = ref(!isNew.value);
const isSaving = ref(false);
const error = ref("");
const showDeleteConfirm = ref(false);
const contactItem = ref(null);
const isEditing = ref(false);

const form = ref({
  name: "",
  pubkey: "",
  emails: [""],
  phones: [""],
  locationLabel: "",
  locationLat: "",
  locationLon: "",
  fields: [],
  notes: "",
  tags: [],
});
const tagDraft = ref("");
const fieldKeyDraft = ref("");
const fieldValueDraft = ref("");
const copiedField = ref(null);
let copyTimer = null;

function fillForm(item) {
  form.value = {
    name: item?.name || "",
    pubkey: item?.pubkey || "",
    emails: item?.emails?.length ? [...item.emails] : [""],
    phones: item?.phones?.length ? [...item.phones] : [""],
    locationLabel: item?.location?.label || "",
    locationLat: item?.location?.lat ?? "",
    locationLon: item?.location?.lon ?? "",
    fields: (item?.fields || []).map((f) => ({ key: f.key || "", value: f.value || "" })),
    notes: item?.notes || "",
    tags: [...(item?.tags || [])],
  };
}

onMounted(async () => {
  if (isNew.value) {
    isEditing.value = true;
    return;
  }
  isLoading.value = true;
  try {
    const cached = await getContactsCached(identity.privkeyHex, identity.pubkeyHex);
    let item = (cached?.items || []).find((c) => c.id === contactId.value);
    if (!item) {
      const live = await fetchContacts(identity.privkeyHex, identity.pubkeyHex);
      item = live.find((c) => c.id === contactId.value);
    }
    if (!item) {
      error.value = "Contact not found or has been deleted.";
      return;
    }
    contactItem.value = item;
    fillForm(item);
  } catch (err) {
    error.value = err?.message || "Failed to load contact.";
  } finally {
    isLoading.value = false;
  }
});

function addTagFromDraft() {
  const parsed = parseContactTagsInput(tagDraft.value);
  if (!parsed.length) return;
  form.value.tags = normalizeContactTags([...form.value.tags, ...parsed]);
  tagDraft.value = "";
}

function addFieldFromDraft() {
  const key = fieldKeyDraft.value.trim().slice(0, 40);
  const value = fieldValueDraft.value.trim().slice(0, 500);
  if (!value) return;
  form.value.fields.push({ key: key || `field-${form.value.fields.length + 1}`, value });
  fieldKeyDraft.value = "";
  fieldValueDraft.value = "";
}

function buildLocation() {
  const label = form.value.locationLabel.trim();
  const latRaw = String(form.value.locationLat).trim();
  const lonRaw = String(form.value.locationLon).trim();
  if (!label && !latRaw && !lonRaw) return null;
  const out = {};
  if (label) out.label = label;
  if (latRaw) out.lat = Number(latRaw);
  if (lonRaw) out.lon = Number(lonRaw);
  return out;
}

async function copyValue(val, name) {
  if (!val) return;
  await copyToClipboard(val);
  copiedField.value = name;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copiedField.value = null), 1500);
}

async function handleSave() {
  if (isSaving.value) return;
  if (tagDraft.value.trim()) addTagFromDraft();
  if (fieldValueDraft.value.trim()) addFieldFromDraft();
  isSaving.value = true;
  error.value = "";
  try {
    await saveContact(
      identity.privkeyHex,
      identity.pubkeyHex,
      {
        name: form.value.name,
        pubkey: form.value.pubkey,
        emails: form.value.emails.filter((e) => e && e.trim()),
        phones: form.value.phones.filter((p) => p && p.trim()),
        location: buildLocation(),
        fields: form.value.fields,
        notes: form.value.notes,
        tags: form.value.tags,
      },
      { id: isNew.value ? null : contactId.value },
    );
    router.push("/contacts");
  } catch (err) {
    error.value = err?.message || "Failed to save contact.";
  } finally {
    isSaving.value = false;
  }
}

async function confirmDelete() {
  if (!contactItem.value) return;
  try {
    await deleteContact(identity.privkeyHex, identity.pubkeyHex, contactItem.value);
    router.push("/contacts");
  } catch (err) {
    error.value = err?.message || "Failed to delete contact.";
  }
}
</script>

<template>
  <main class="contact-detail">
    <div class="contact-detail__wrap">
      <PageHeader :eyebrow="isNew ? 'New Contact' : 'Encrypted Contact'" :title="isNew ? 'Add Contact' : form.name || 'Contact'">
        <p class="contact-detail__lede">Email, phone and location are starters — add any custom field below. Everything stays encrypted.</p>
      </PageHeader>

      <AppAlertBanner v-if="error" :message="error" />

      <div v-if="isLoading" class="contact-detail__card" role="status"><p>Loading contact…</p></div>

      <template v-else>
        <article v-if="!isEditing && contactItem" class="contact-detail__card">
          <div class="contact-detail__top">
            <button type="button" class="contact-detail__btn" @click="isEditing = true">Edit Contact</button>
            <button type="button" class="contact-detail__btn contact-detail__btn--danger" @click="showDeleteConfirm = true"><Trash2 /> Delete</button>
          </div>
          <h2 class="contact-detail__name">{{ contactItem.name }}</h2>
          <div v-for="e in contactItem.emails || []" :key="e" class="contact-detail__row">
            <span><Mail /> {{ e }}</span>
            <button type="button" class="contact-detail__mini" @click="copyValue(e, e)">{{ copiedField === e ? "Copied" : "Copy" }}</button>
          </div>
          <div v-for="p in contactItem.phones || []" :key="p" class="contact-detail__row">
            <span><Phone /> {{ p }}</span>
            <button type="button" class="contact-detail__mini" @click="copyValue(p, p)">{{ copiedField === p ? "Copied" : "Copy" }}</button>
          </div>
          <div v-if="contactItem.location" class="contact-detail__row">
            <span><MapPin /> {{ contactItem.location.label || `${contactItem.location.lat ?? ""}, ${contactItem.location.lon ?? ""}` }}</span>
          </div>
          <div v-for="f in contactItem.fields || []" :key="f.key + f.value" class="contact-detail__row">
            <span><strong>{{ f.key }}:</strong> {{ f.value }}</span>
            <button type="button" class="contact-detail__mini" @click="copyValue(f.value, f.key + f.value)">{{ copiedField === f.key + f.value ? "Copied" : "Copy" }}</button>
          </div>
          <p v-if="contactItem.notes" class="contact-detail__notes">{{ contactItem.notes }}</p>
          <div v-if="contactItem.tags?.length" class="contact-detail__tags"><span v-for="t in contactItem.tags" :key="t">#{{ t }}</span></div>
          <div v-if="contactItem.eventId" class="contact-detail__meta">
            <button type="button" class="contact-detail__mini" @click="copyValue(contactItem.eventId, 'eventId')"><Copy /> {{ copiedField === "eventId" ? "Copied" : "Copy ID" }}</button>
            <RelayEventLink :event-id="contactItem.eventId" />
          </div>
        </article>

        <form v-else class="contact-detail__card" @submit.prevent="handleSave">
          <label class="contact-detail__label">Name
            <input v-model="form.name" type="text" placeholder="Ada Lovelace" class="contact-detail__input" />
          </label>
          <label class="contact-detail__label">GUPT public key (optional)
            <input v-model="form.pubkey" type="text" placeholder="64-char hex to link chats" class="contact-detail__input contact-detail__mono" />
          </label>

          <fieldset class="contact-detail__group">
            <legend><Mail /> Emails</legend>
            <div v-for="(e, i) in form.emails" :key="i" class="contact-detail__inline">
              <input v-model="form.emails[i]" type="email" placeholder="ada@example.com" class="contact-detail__input" />
              <button v-if="form.emails.length > 1" type="button" class="contact-detail__mini" @click="form.emails.splice(i, 1)" aria-label="Remove email"><X /></button>
            </div>
            <button type="button" class="contact-detail__mini" @click="form.emails.push('')">+ Add email</button>
          </fieldset>

          <fieldset class="contact-detail__group">
            <legend><Phone /> Phones</legend>
            <div v-for="(p, i) in form.phones" :key="i" class="contact-detail__inline">
              <input v-model="form.phones[i]" type="tel" placeholder="+1 555 0100" class="contact-detail__input" />
              <button v-if="form.phones.length > 1" type="button" class="contact-detail__mini" @click="form.phones.splice(i, 1)" aria-label="Remove phone"><X /></button>
            </div>
            <button type="button" class="contact-detail__mini" @click="form.phones.push('')">+ Add phone</button>
          </fieldset>

          <fieldset class="contact-detail__group">
            <legend><MapPin /> Location</legend>
            <input v-model="form.locationLabel" type="text" placeholder="Berlin, home office…" class="contact-detail__input" />
            <div class="contact-detail__grid">
              <input v-model="form.locationLat" type="number" step="any" min="-90" max="90" placeholder="Lat" class="contact-detail__input contact-detail__mono" />
              <input v-model="form.locationLon" type="number" step="any" min="-180" max="180" placeholder="Lon" class="contact-detail__input contact-detail__mono" />
            </div>
          </fieldset>

          <fieldset class="contact-detail__group">
            <legend><Plus /> Custom fields (endless)</legend>
            <div v-for="(f, i) in form.fields" :key="i" class="contact-detail__inline">
              <input v-model="form.fields[i].key" type="text" placeholder="Key (e.g. birthday)" class="contact-detail__input" />
              <input v-model="form.fields[i].value" type="text" placeholder="Value" class="contact-detail__input" />
              <button type="button" class="contact-detail__mini" @click="form.fields.splice(i, 1)" aria-label="Remove field"><X /></button>
            </div>
            <div class="contact-detail__inline">
              <input v-model="fieldKeyDraft" type="text" placeholder="New key (e.g. signal)" class="contact-detail__input" />
              <input v-model="fieldValueDraft" type="text" placeholder="New value" class="contact-detail__input" @keydown.enter.prevent="addFieldFromDraft" />
              <button type="button" class="contact-detail__mini" :disabled="!fieldValueDraft.trim()" @click="addFieldFromDraft">Add</button>
            </div>
          </fieldset>

          <label class="contact-detail__label">Notes
            <textarea v-model="form.notes" rows="3" placeholder="How you met, shared groups…" class="contact-detail__input" />
          </label>

          <label class="contact-detail__label"><Tag /> Tags (comma separated)
            <input v-model="tagDraft" type="text" placeholder="family, berlin…" class="contact-detail__input" @keydown.enter.prevent="addTagFromDraft" @keydown.comma.prevent="addTagFromDraft" />
          </label>
          <div v-if="form.tags.length" class="contact-detail__tags">
            <span v-for="t in form.tags" :key="t">#{{ t }} <button type="button" @click="form.tags = form.tags.filter((x) => x !== t)" aria-label="Remove tag"><X /></button></span>
          </div>

          <div class="contact-detail__top">
            <button v-if="!isNew" type="button" class="contact-detail__btn contact-detail__btn--danger" @click="showDeleteConfirm = true"><Trash2 /> Delete</button>
            <button type="button" class="contact-detail__btn" @click="isNew ? router.push('/contacts') : (isEditing = false)">Cancel</button>
            <button type="submit" :disabled="isSaving" class="contact-detail__btn contact-detail__btn--primary">
              <LoaderCircle v-if="isSaving" class="spin" /><Check v-else /> {{ isNew ? "Save Contact" : "Save Changes" }}
            </button>
          </div>
        </form>
      </template>
    </div>

    <AppConfirmDialog :open="showDeleteConfirm" title="Delete Contact?" message="This publishes an encrypted tombstone. This cannot be undone." confirm-label="Delete" @confirm="confirmDelete" @cancel="showDeleteConfirm = false" />
  </main>
</template>

<style scoped>
/* Ledger pass: the contact sheet is a ruled address record. */

.contact-detail {
  min-height: 100dvh;
  padding-bottom: var(--app-space-8);
  background: var(--app-bg);
  color: var(--app-text);
  animation: ledger-fade 260ms var(--app-ease-standard) both;
}

.contact-detail__wrap {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  width: 100%;
  max-width: 700px;
  margin-inline: auto;
  padding: var(--app-space-6) var(--app-space-4);
}

.contact-detail__lede {
  margin: 0;
  font-size: var(--app-text-meta);
  line-height: 1.6;
  color: var(--app-muted);
}

.contact-detail__card {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  padding: var(--app-space-5);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  animation: ledger-rise 420ms var(--app-ease-emphasized) both;
}

.contact-detail__top {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.contact-detail__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding-inline: 11px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard),
    transform var(--app-dur-fast) var(--app-ease-standard);
}

.contact-detail__btn svg {
  width: 12px;
  height: 12px;
}

.contact-detail__btn:active {
  transform: translateY(1px);
}

.contact-detail__btn--primary {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.contact-detail__btn--danger {
  border-color: color-mix(in oklab, var(--app-danger) 28%, var(--app-border));
  color: var(--app-danger);
}

.contact-detail__name {
  margin: 0;
  font-size: var(--app-text-heading);
  font-weight: 600;
  letter-spacing: var(--app-tracking-heading);
  color: var(--app-text);
}

.contact-detail__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
  padding: 10px 0;
  border-top: 1px solid var(--app-border);
  font-size: 12.5px;
  color: var(--app-text-soft);
}

.contact-detail__row > span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.contact-detail__row svg {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  color: var(--app-muted-2);
}

.contact-detail__row strong {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--app-muted);
}

.contact-detail__notes {
  margin: 0;
  padding-top: var(--app-space-4);
  border-top: 1px solid var(--app-border);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  color: var(--app-text-soft);
}

.contact-detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.contact-detail__tags > span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  background: var(--app-surface-soft);
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--app-muted);
}

.contact-detail__tags button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-muted-2);
  cursor: pointer;
}

.contact-detail__tags button svg {
  width: 9px;
  height: 9px;
}

.contact-detail__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--app-space-2);
  padding-top: var(--app-space-4);
  border-top: 1px solid var(--app-border);
}

.contact-detail__label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted);
}

.contact-detail__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: transparent;
}

.contact-detail__group legend {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding-inline: 4px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
}

.contact-detail__group legend svg {
  width: 11px;
  height: 11px;
}

.contact-detail__input {
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-family: var(--font-sans);
  font-size: var(--app-text-body);
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  color: var(--app-text);
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    box-shadow var(--app-dur-fast) var(--app-ease-standard);
}

.contact-detail__input::placeholder {
  color: var(--app-muted-2);
}

.contact-detail__input:focus {
  outline: none;
  border-color: var(--app-border-strong);
  box-shadow: var(--app-focus-ring);
}

.contact-detail__mono {
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.contact-detail__inline {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.contact-detail__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.contact-detail__mini {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 26px;
  padding-inline: 7px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--app-tracking-label);
  text-transform: uppercase;
  color: var(--app-muted-2);
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast) var(--app-ease-standard),
    color var(--app-dur-fast) var(--app-ease-standard);
}

.contact-detail__mini svg {
  width: 10px;
  height: 10px;
}

.contact-detail__mini:disabled {
  opacity: 0.4;
  cursor: default;
}

.spin {
  animation: var(--animate-spin);
}

@media (min-width: 40rem) {
  .contact-detail__wrap {
    padding-inline: var(--app-space-6);
  }

  .contact-detail__card {
    padding: var(--app-space-6);
  }
}

@media (max-width: 26rem) {
  .contact-detail__inline {
    flex-wrap: wrap;
  }
}

@media (hover: hover) {
  .contact-detail__btn:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .contact-detail__btn--primary:hover {
    border-color: var(--app-text);
    background: color-mix(in oklab, var(--app-text) 86%, transparent);
    color: var(--app-bg);
  }

  .contact-detail__btn--danger:hover {
    border-color: var(--app-danger);
    background: var(--app-danger-soft);
    color: var(--app-danger);
  }

  .contact-detail__mini:hover {
    border-color: var(--app-border-strong);
    color: var(--app-text);
  }

  .contact-detail__tags button:hover {
    color: var(--app-danger);
  }
}

@media (pointer: coarse) {
  .contact-detail__btn,
  .contact-detail__mini,
  .contact-detail__tags button {
    min-height: var(--app-touch-h);
  }

  .contact-detail__mini,
  .contact-detail__tags button {
    min-width: var(--app-touch-h);
  }
}

@media (prefers-reduced-motion: reduce) {
  .contact-detail,
  .contact-detail__card {
    animation: none;
  }

  .contact-detail__btn,
  .contact-detail__mini,
  .contact-detail__input {
    transition: none;
  }
}
</style>
