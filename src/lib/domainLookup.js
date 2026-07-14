import { normalizeNostrPubkey } from "@/lib/crypto";

export function isDomainInput(input) {
  // We no longer support domain resolution. Everything must be a raw hex key.
  return false;
}

export async function resolveRecipientInput(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("Enter a valid 64-character hex public key.");
  }

  const hex = normalizeNostrPubkey(trimmed);
  if (hex) {
    return { pubkey: hex, source: "pubkey" };
  }

  throw new Error("Invalid format. Please enter a 64-character hex public key.");
}
