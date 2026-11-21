export const CONTACT_COLLECTION = "gupt/vault/contacts";
export const CONTACT_TAG = "gupt_contact";

export const CONTACT_MAX_CUSTOM_FIELDS = 50;
export const CONTACT_MAX_FIELD_KEY_CHARS = 40;
export const CONTACT_MAX_FIELD_VALUE_CHARS = 500;
export const CONTACT_MAX_EMAILS = 20;
export const CONTACT_MAX_PHONES = 10;

/** Starter emails: lowercased, basic shape check, deduped. */
export function normalizeContactEmails(emails) {
  if (!Array.isArray(emails)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of emails) {
    const v = String(raw || "")
      .trim()
      .toLowerCase()
      .slice(0, 254);
    if (!v || seen.has(v)) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= CONTACT_MAX_EMAILS) break;
  }
  return out;
}

/** Starter phones: keep human formatting, require at least 3 digits. */
export function normalizeContactPhones(phones) {
  if (!Array.isArray(phones)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of phones) {
    const v = String(raw || "")
      .trim()
      .slice(0, 32);
    if (!v) continue;
    const digits = v.replace(/\D/g, "");
    if (digits.length < 3) continue;
    if (!/^[0-9+()\-.\s/;extEXT]+$/.test(v)) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= CONTACT_MAX_PHONES) break;
  }
  return out;
}

/**
 * Endless custom fields. Accepts { key, value } plus { label, value } and
 * { name, value } aliases, so callers never have to learn one exact shape.
 * Empty values are dropped; keys fall back to "field-N".
 */
export function normalizeContactFields(fields) {
  if (!Array.isArray(fields)) return [];
  const out = [];
  const seen = new Set();
  let fallback = 0;
  for (const raw of fields) {
    if (raw == null) continue;
    let key = "";
    let value = "";
    if (typeof raw === "string") {
      key = `field-${(fallback += 1)}`;
      value = raw;
    } else if (typeof raw === "object") {
      key = raw.key ?? raw.label ?? raw.name ?? "";
      value = raw.value ?? "";
    } else {
      continue;
    }
    key = String(key || "")
      .trim()
      .slice(0, CONTACT_MAX_FIELD_KEY_CHARS);
    value = String(value ?? "")
      .trim()
      .slice(0, CONTACT_MAX_FIELD_VALUE_CHARS);
    if (!value) continue;
    if (!key) key = `field-${(fallback += 1)}`;
    const dedupe = `${key.toLowerCase()} ${value.toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ key, value });
    if (out.length >= CONTACT_MAX_CUSTOM_FIELDS) break;
  }
  return out;
}

/** Location is just another field group: label + optional lat/lon. */
export function normalizeContactLocation(location) {
  if (location == null) return null;
  if (typeof location === "string") {
    const label = location.trim().slice(0, 200);
    return label ? { label } : null;
  }
  if (typeof location !== "object") return null;
  const label = String(location.label ?? location.value ?? location.address ?? "")
    .trim()
    .slice(0, 200);
  const lat = Number(location.lat ?? location.latitude);
  const lon = Number(location.lon ?? location.lng ?? location.longitude);
  const hasLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const hasLon = Number.isFinite(lon) && lon >= -180 && lon <= 180;
  if (!label && !hasLat && !hasLon) return null;
  const out = {};
  if (label) out.label = label;
  if (hasLat) out.lat = lat;
  if (hasLon) out.lon = lon;
  return out;
}

/** Collapse stream: tombstone wins; else newest live by updatedAt. */
export function reduceContacts(items) {
  const deletedIds = new Set();
  const liveById = new Map();

  for (const item of items) {
    if (item.deleted === true) {
      deletedIds.add(item.id);
      liveById.delete(item.id);
      continue;
    }
    if (deletedIds.has(item.id)) continue;
    const prev = liveById.get(item.id);
    if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) {
      liveById.set(item.id, item);
    }
  }

  return [...liveById.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** Lowercase haystack across name, emails, phones, location, custom fields. */
export function contactSearchText(item) {
  const parts = [
    item?.name,
    ...(item?.emails || []),
    ...(item?.phones || []),
    item?.location?.label,
    item?.location?.lat,
    item?.location?.lon,
    ...(item?.fields || []).flatMap((f) => [f?.key, f?.value]),
    item?.notes,
    ...(item?.tags || []),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function contactDisplaySubtitle(item) {
  if (!item) return "";
  return (
    item.emails?.[0] || item.phones?.[0] || item.location?.label || item.fields?.[0]?.value || ""
  );
}
