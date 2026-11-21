import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeContactEmails,
  normalizeContactPhones,
  normalizeContactFields,
  normalizeContactLocation,
  reduceContacts,
  contactSearchText,
  CONTACT_COLLECTION,
  CONTACT_TAG,
} from "../src/lib/contactFields.js";

test("contacts collection constants", () => {
  assert.equal(CONTACT_COLLECTION, "gupt/vault/contacts");
  assert.equal(CONTACT_TAG, "gupt_contact");
});

test("normalizeContactEmails lowercases and rejects junk", () => {
  assert.deepEqual(normalizeContactEmails(["Ada@Example.COM ", "nope", "a@b.co"]), [
    "ada@example.com",
    "a@b.co",
  ]);
});

test("normalizeContactPhones keeps formatting, needs digits", () => {
  assert.deepEqual(normalizeContactPhones(["+1 555 0100", "ab", "  "]), ["+1 555 0100"]);
});

test("normalizeContactFields accepts any key and label/name aliases", () => {
  const out = normalizeContactFields([
    { key: "birthday", value: "1990-01-01" },
    { label: "Signal", value: "@ada" },
    { name: "x", value: "y" },
    { key: "empty", value: "   " },
    "plain string field",
  ]);
  assert.equal(out.length, 4);
  assert.equal(out[0].key, "birthday");
  assert.equal(out[1].key, "Signal");
  assert.equal(out[3].value, "plain string field");
});

test("normalizeContactLocation accepts string and lat/lon", () => {
  assert.deepEqual(normalizeContactLocation("Berlin"), { label: "Berlin" });
  assert.deepEqual(normalizeContactLocation({ label: "Home", lat: 52.5, lon: 13.4 }), {
    label: "Home",
    lat: 52.5,
    lon: 13.4,
  });
  assert.equal(normalizeContactLocation({ lat: 999 }), null);
});

test("reduceContacts tombstone wins, newest wins", () => {
  const items = reduceContacts([
    { id: "a", updatedAt: 1, name: "Old" },
    { id: "a", updatedAt: 2, name: "New" },
    { id: "b", updatedAt: 3, deleted: true },
    { id: "b", updatedAt: 2, name: "Ghost" },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, "New");
});

test("contactSearchText spans email phone location custom fields", () => {
  const hay = contactSearchText({
    name: "Ada",
    emails: ["ada@example.com"],
    phones: ["+1555"],
    location: { label: "Berlin" },
    fields: [{ key: "birthday", value: "1990" }],
    notes: "met at conf",
  });
  for (const needle of ["ada", "ada@example.com", "+1555", "berlin", "birthday", "1990", "conf"]) {
    assert.ok(hay.includes(needle), needle);
  }
});
