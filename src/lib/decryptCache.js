import { getDmSharedSecret, aesDecrypt } from "./crypto.js";

const PAYLOAD_CACHE_CAP = 2000;

const secretCache = new Map();

const payloadCache = new Map();

function secretCacheKey(privkeyHex, peerPubkey) {
  return `${privkeyHex}:${peerPubkey}`;
}

function getSharedSecret(privkeyHex, peerPubkey) {
  const key = secretCacheKey(privkeyHex, peerPubkey);
  let secret = secretCache.get(key);
  if (!secret) {
    secret = getDmSharedSecret(privkeyHex, peerPubkey);
    secretCache.set(key, secret);
  }
  return secret;
}

export async function decryptRow(privkeyHex, selfPubkey, row) {
  const cached = payloadCache.get(row.id);
  if (cached) {
    return {
      ...cached,
      id: row.id,
      sender: row.event.pubkey,
      mine: row.event.pubkey === selfPubkey,
      created_at: row.createdAt,
      peerPubkey: row.peerPubkey || null,
    };
  }

  const peerPubkey = row.peerPubkey || row.event.pubkey;
  const secret = getSharedSecret(privkeyHex, peerPubkey);
  const plaintext = await aesDecrypt(secret, row.event.content);
  const payload = JSON.parse(plaintext);

  const pTag = row.event.tags?.find((t) => t[0] === "p");
  const relayHint = pTag?.[2] || null;

  const result = {
    ...payload,
    id: row.id,
    sender: row.event.pubkey,
    mine: row.event.pubkey === selfPubkey,
    type: row.type || payload.type,
    text: payload.text ?? "",
    ts: payload.ts ?? row.createdAt,
    media: payload.media ?? null,
    created_at: row.createdAt,
    peerPubkey: row.peerPubkey || null,
    relayHint,
  };

  if (payloadCache.size >= PAYLOAD_CACHE_CAP) {
    const firstKey = payloadCache.keys().next().value;
    payloadCache.delete(firstKey);
  }
  payloadCache.set(row.id, payload);

  return result;
}

export async function decryptRows(privkeyHex, selfPubkey, rows) {
  const settled = await Promise.allSettled(
    rows.map((row) => decryptRow(privkeyHex, selfPubkey, row)),
  );

  const succeeded = settled.filter((res) => res.status === "fulfilled");
  const failed = settled.filter((res) => res.status === "rejected");

  if (failed.length > 0) {
  } else {
  }

  return succeeded.map((res) => res.value);
}

export function clearDecryptCache() {
  secretCache.clear();
  payloadCache.clear();
}
