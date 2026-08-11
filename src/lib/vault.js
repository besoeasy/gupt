import { finalizeEvent } from "./crypto.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { encryptDm, decryptDm, normalizeNostrPubkey } from "./crypto.js";
import { publishToRelays, query } from "./relay";
import { putRawEvent, getRawEventsByOrigin, deleteRawEvent } from "./idb";

const VAULT_KIND = 1;
const LEGACY_VAULT_KIND = 4;

/** Longest allowed vault lifetime (10 years). Always applied when saving. */
export const MAX_VAULT_EXPIRY_SECONDS = 10 * 365 * 24 * 60 * 60;

export function resolveVaultExpirySeconds(expirySeconds) {
  const n = Number(expirySeconds);
  if (!Number.isFinite(n) || n <= 0) return MAX_VAULT_EXPIRY_SECONDS;
  return Math.min(Math.floor(n), MAX_VAULT_EXPIRY_SECONDS);
}

async function decryptEvents(privkeyHex, pubkeyHex, events) {
  const items = [];
  for (const event of events) {
    // Kind 1 stores the ciphertext in a gupt_vault tag; legacy Kind 4 items
    // carried it in event.content. Fall back so older saves keep working.
    const encrypted = event.tags?.find((t) => t[0] === "gupt_vault")?.[1] || event.content;
    if (!encrypted) continue;
    try {
      const plaintext = await decryptDm(privkeyHex, pubkeyHex, encrypted);
      const item = JSON.parse(plaintext);
      item.eventId = event.id;
      const expiryTag = event.tags?.find((t) => t[0] === "expiration");
      if (expiryTag) {
        item.expiresAt = Number(expiryTag[1]) * 1000;
        if (item.expiresAt < Date.now()) continue;
      }
      items.push(item);
    } catch (err) {
      console.warn("Failed to decrypt a vault item", err);
    }
  }
  return items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getVaultCachedItems(privkeyHex, pubkeyHex) {
  const rows = await getRawEventsByOrigin("vault").catch(() => []);
  if (!rows.length) return null;
  const events = rows.map((r) => r.event);
  const items = await decryptEvents(privkeyHex, pubkeyHex, events);
  return { items, fresh: false };
}

export async function fetchVaultItems(privkeyHex, pubkeyHex) {
  const pubkey = normalizeNostrPubkey(pubkeyHex);
  if (!pubkey) throw new Error("Invalid pubkey");

  // Query Vault items (new Kind 1, legacy Kind 4) and Kind 5 (deletion events)
  const events = await query(
    [
      {
        kinds: [VAULT_KIND, LEGACY_VAULT_KIND],
        authors: [pubkey],
        "#p": [pubkey],
        "#t": ["gupt_vault"],
      },
      { kinds: [5], authors: [pubkey] },
    ],
    5000,
  );

  const vaultEvents = [];
  const deletedIds = new Set();

  for (const event of events) {
    if (event.kind === 5) {
      for (const tag of event.tags) {
        if (tag[0] === "e") {
          deletedIds.add(tag[1]);
        }
      }
    } else if (event.kind === VAULT_KIND || event.kind === LEGACY_VAULT_KIND) {
      vaultEvents.push(event);
    }
  }

  // Delete deleted vault items from local IndexedDB
  if (deletedIds.size > 0) {
    await Promise.all([...deletedIds].map((id) => deleteRawEvent(id).catch(() => {})));
  }

  const activeEvents = [];
  for (const event of vaultEvents) {
    if (deletedIds.has(event.id)) continue;
    activeEvents.push(event);
    void putRawEvent(event, "vault").catch(() => {});
  }

  return await decryptEvents(privkeyHex, pubkeyHex, activeEvents);
}

export async function saveVaultItem(privkeyHex, pubkeyHex, itemData, expirySeconds) {
  const dTag =
    itemData.id ||
    (typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const payloadToStore = {
    id: dTag,
    title: itemData.title || "",
    content: itemData.content || "",
    tags: Array.isArray(itemData.tags) ? itemData.tags : [],
    updatedAt: Date.now(),
  };

  const encryptedPayload = await encryptDm(privkeyHex, pubkeyHex, JSON.stringify(payloadToStore));
  const resolvedExpiry = resolveVaultExpirySeconds(expirySeconds);

  const tags = [
    ["p", pubkeyHex],
    ["t", "gupt_vault"],
    ["gupt_vault", encryptedPayload],
  ];

  for (const tag of payloadToStore.tags) {
    if (tag) tags.push(["t", tag]);
  }

  const expiryTimestamp = Math.floor(Date.now() / 1000) + resolvedExpiry;
  tags.push(["expiration", String(expiryTimestamp)]);

  const event = finalizeEvent(
    {
      kind: VAULT_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: "Vault Item : https://github.com/besoeasy/gupt",
    },
    hexToBytes(privkeyHex),
  );

  const publishResponse = await publishToRelays([], event);
  const anyOk = Object.values(publishResponse).some((r) => r.ok);
  if (!anyOk) throw new Error("Failed to publish vault item to relays.");

  return payloadToStore;
}

export async function deleteVaultItem(privkeyHex, pubkeyHex, eventId) {
  const event = finalizeEvent(
    {
      kind: 5,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["e", eventId]],
      content: "Deleted vault item",
    },
    hexToBytes(privkeyHex),
  );

  // Publish deletion to relays
  await publishToRelays([], event);

  // Instantly delete it locally so it disappears from the UI immediately
  await deleteRawEvent(eventId).catch(() => {});
}
