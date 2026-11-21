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
.contact-detail { min-height: 100dvh; background: var(--ui-black); color: var(--ui-zinc-100); animation: cd-in 0.25s ease; }
@keyframes cd-in { from { opacity: 0; } to { opacity: 1; } }
.contact-detail__wrap { width: 100%; max-width: 42rem; margin-inline: auto; padding: 1.5rem 1rem 4rem; display: flex; flex-direction: column; gap: 1rem; }
.contact-detail__lede { font-size: var(--text-sm); color: var(--ui-zinc-400); }
.contact-detail__card { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.25rem; border-radius: var(--radius-xl); border: 1px solid var(--app-border-quiet); background: var(--app-surface-inset); }
.contact-detail__top { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
.contact-detail__btn { display: inline-flex; align-items: center; gap: 0.375rem; min-height: 44px; padding-inline: 0.75rem; border-radius: var(--radius-lg); border: 1px solid var(--ui-zinc-800); background: var(--app-surface-tint); color: var(--ui-zinc-200); font-size: var(--text-xs); cursor: pointer; }
.contact-detail__btn--primary { background: var(--color-white); color: var(--ui-black); font-weight: 600; }
.contact-detail__btn--danger { color: var(--color-red-400); }
.contact-detail__name { font-size: var(--text-xl); font-weight: 600; }
.contact-detail__row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem 0; border-top: 1px solid var(--app-border-quiet); font-size: var(--text-sm); }
.contact-detail__notes { white-space: pre-wrap; font-size: var(--text-sm); color: var(--ui-zinc-300); }
.contact-detail__tags { display: flex; flex-wrap: wrap; gap: 0.375rem; font-size: 11px; color: var(--ui-zinc-400); }
.contact-detail__meta { display: flex; align-items: center; gap: 0.5rem; font-size: 11px; }
.contact-detail__label { display: flex; flex-direction: column; gap: 0.375rem; font-size: var(--text-xs); font-weight: 500; }
.contact-detail__group { border: 1px solid var(--app-border-quiet); border-radius: var(--radius-lg); padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
.contact-detail__group legend { font-size: var(--text-xs); font-weight: 600; padding-inline: 0.25rem; display: flex; align-items: center; gap: 0.25rem; }
.contact-detail__input { width: 100%; min-height: 44px; border-radius: var(--radius-lg); border: 1px solid var(--ui-zinc-800); background: var(--app-surface-inset-strong); color: var(--ui-zinc-100); padding: 0.5rem 0.75rem; font-size: var(--text-sm); }
.contact-detail__mono { font-family: var(--font-mono); font-size: 12px; }
.contact-detail__inline { display: flex; gap: 0.5rem; }
.contact-detail__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.contact-detail__mini { display: inline-flex; align-items: center; gap: 0.25rem; min-height: 44px; min-width: 44px; justify-content: center; padding-inline: 0.5rem; border-radius: var(--radius-md); border: 1px solid var(--ui-zinc-800); background: transparent; color: var(--ui-zinc-400); font-size: 12px; cursor: pointer; }
.spin { animation: var(--animate-spin); }
[data-theme="light"] .contact-detail { background: var(--app-bg); color: var(--app-text); }
[data-theme="light"] .contact-detail__lede { color: var(--app-muted); }
[data-theme="light"] .contact-detail__card { background: var(--app-surface); }
[data-theme="light"] .contact-detail__input { background: var(--app-surface); color: var(--app-text); }
</style>
