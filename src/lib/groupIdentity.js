// Pure group identity helpers. A group is exactly its sorted member set:
//
//   groupId = sha256("gupt:group:v1:" + sortedMembers.join(":"))
//
// The display name is only a suffix of that hash. There is no stored name,
// roster owner, or mutable membership — changing members creates a new group.

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { normalizePubkey } from "./crypto.js";

export const GROUP_COLLECTION = "gupt/chat/group";
export const GROUP_MODEL = 2;
export const GROUP_MIN_MEMBERS = 2;
export const GROUP_MAX_MEMBERS = 8;
export const GROUP_NAME_MIN_SUFFIX = 4;

const HEX64 = /^[0-9a-f]{64}$/;

/** Forgiving form used for local records and creation input. */
export function normalizeGroupMembers(pubkeys = []) {
  const seen = new Set();
  const members = [];
  for (const raw of Array.isArray(pubkeys) ? pubkeys : []) {
    const pubkey = normalizePubkey(raw);
    if (!pubkey || seen.has(pubkey)) continue;
    seen.add(pubkey);
    members.push(pubkey);
  }
  return members.sort();
}

/**
 * Strict form for signed event labels. Labels must already be unique, lower
 * hex and sorted, because copies[i] is aligned with labels[i].
 */
export function parseGroupMembers(labels) {
  if (
    !Array.isArray(labels) ||
    labels.length < GROUP_MIN_MEMBERS ||
    labels.length > GROUP_MAX_MEMBERS
  ) {
    return null;
  }

  const seen = new Set();
  const members = [];
  for (const label of labels) {
    if (typeof label !== "string" || !HEX64.test(label) || seen.has(label)) return null;
    seen.add(label);
    members.push(label);
  }

  members.sort();
  for (let i = 0; i < labels.length; i++) {
    if (members[i] !== labels[i]) return null;
  }
  return members;
}

export function isValidGroupMembers(pubkeys) {
  const members = normalizeGroupMembers(pubkeys);
  return members.length >= GROUP_MIN_MEMBERS && members.length <= GROUP_MAX_MEMBERS;
}

/** Full group identity. The hash is canonical; only its suffix is displayed. */
export function groupIdForMembers(pubkeys) {
  const members = normalizeGroupMembers(pubkeys);
  return bytesToHex(sha256(new TextEncoder().encode(`gupt:group:v1:${members.join(":")}`)));
}

/** Old name + members identity, kept only for read-only legacy groups. */
export function legacyGroupIdFor(name, pubkeys = []) {
  const normalizedName = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const members = normalizeGroupMembers(pubkeys).join(",");
  return bytesToHex(sha256(new TextEncoder().encode(`${normalizedName}:${members}`)));
}

export function isLegacyGroup(group) {
  return Boolean(group) && Number(group.model) !== GROUP_MODEL;
}

function normalizeGroupId(value) {
  const id = String(value || "").toLowerCase();
  return HEX64.test(id) ? id : "";
}

/**
 * Display-only name. Extend the suffix until it cannot be confused with any
 * other visible group.
 */
export function groupDisplayName(groupId, allGroupIds = [], minSuffix = GROUP_NAME_MIN_SUFFIX) {
  const id = normalizeGroupId(groupId);
  if (!id) return "Group";

  const ids = [
    ...new Set(
      (Array.isArray(allGroupIds) ? allGroupIds : []).map(normalizeGroupId).filter(Boolean),
    ),
  ];

  let length = Math.min(Math.max(2, Number(minSuffix) || GROUP_NAME_MIN_SUFFIX), id.length);
  while (
    length < id.length &&
    ids.some((other) => other !== id && other.slice(-length) === id.slice(-length))
  ) {
    length++;
  }
  return `Group ${id.slice(-length)}`;
}

export function groupDisplayNames(groups, minSuffix = GROUP_NAME_MIN_SUFFIX) {
  const ids = (Array.isArray(groups) ? groups : []).map((group) => group?.groupId).filter(Boolean);
  const names = new Map();
  for (const id of ids) names.set(id, groupDisplayName(id, ids, minSuffix));
  return names;
}
