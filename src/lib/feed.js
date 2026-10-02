import { finalizeEvent } from "./crypto.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { normalizeNostrPubkey } from "./crypto.js";
import { publishToRelays, query } from "./relay";
import { getRawEventsByOrigin, mergeRawEventsByOrigin, putRawEvent, deleteRawEvent } from "./idb";
import { getRetentionCutoffSec } from "@/config/retention";
import { STREAM_EXPIRY_SECONDS, STREAM_DELETE_EXPIRY_SECONDS } from "@/config/retention";
import { encryptAndUploadFiles, SHARE_MAX_FILE_BYTES, SHARE_MAX_TOTAL_BYTES } from "./share";
import { enqueuePublish } from "./sendQueue";
import { api } from "./api";

export const FEED_KIND = 1;
export const FEED_TAG = "gupt_feed";
export const FEED_COMMENT_TAG = "gupt_feed_comment";
export const FEED_REACTION_TAG = "gupt_feed_reaction";
export const FEED_CLIENT = "gupt";
export const FEED_MAX_TEXT_CHARS = 2000;
export const FEED_MAX_FILES = 4;
export const FEED_COMMENT_MAX_CHARS = 500;
export const FEED_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];

const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"];
const ALLOWED_MIME_EXACT = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/webm",
]);

export function isAllowedFeedMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (ALLOWED_MIME_EXACT.has(m)) return true;
  return ALLOWED_MIME_PREFIXES.some((p) => m.startsWith(p));
}

export function isAllowedFeedReaction(emoji) {
  return FEED_REACTIONS.includes(String(emoji || ""));
}

export function validateFeedFiles(files) {
  const list = Array.from(files || []);
  if (list.length > FEED_MAX_FILES) {
    return { ok: false, error: `Attach up to ${FEED_MAX_FILES} files per post.` };
  }
  let total = 0;
  for (const file of list) {
    if (!(file instanceof File)) return { ok: false, error: "Invalid file selection." };
    if (file.size > SHARE_MAX_FILE_BYTES) {
      return { ok: false, error: `${file.name} exceeds the per-file limit.` };
    }
    if (file.type && !isAllowedFeedMime(file.type)) {
      return { ok: false, error: `${file.name}: unsupported format. Use images, video, or audio.` };
    }
    total += file.size;
  }
  if (total > SHARE_MAX_TOTAL_BYTES) {
    return { ok: false, error: "Total attachments exceed the size limit." };
  }
  return { ok: true };
}

export function sanitizeFeedText(text) {
  return String(text || "")
    .trim()
    .slice(0, FEED_MAX_TEXT_CHARS);
}

export function sanitizeFeedCommentText(text) {
  return String(text || "")
    .trim()
    .slice(0, FEED_COMMENT_MAX_CHARS);
}

function newFeedId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function interactionTags(subtypeTag, parentPost) {
  const tags = [["t", FEED_TAG]];
  if (subtypeTag) tags.push(["t", subtypeTag]);
  const parentId = String(parentPost?.id || parentPost?.parentId || "");
  const parentEventId = String(parentPost?.eventId || parentPost?.parentEventId || "");
  if (parentEventId) tags.push(["e", parentEventId]);
  if (parentId) tags.push(["gupt_parent", parentId]);
  return tags;
}

function commentTags(parentPost) {
  return interactionTags(FEED_COMMENT_TAG, parentPost);
}

function reactionTags(parentPost) {
  return interactionTags(FEED_REACTION_TAG, parentPost);
}

function eventSubtype(event) {
  const tags = Array.isArray(event?.tags) ? event.tags : [];
  let isComment = false;
  let isReaction = false;
  let eTag = "";
  let parentTag = "";
  for (const t of tags) {
    if (!Array.isArray(t)) continue;
    if (t[0] === "t" && t[1] === FEED_COMMENT_TAG) isComment = true;
    if (t[0] === "t" && t[1] === FEED_REACTION_TAG) isReaction = true;
    if (t[0] === "e" && !eTag && t[1]) eTag = String(t[1]);
    if (t[0] === "gupt_parent" && !parentTag && t[1]) parentTag = String(t[1]);
  }
  return { isComment, isReaction, eTag, parentTag };
}

async function publishFeedEvent(privkeyHex, pubkeyHex, payload, expirySeconds, extraTags = null) {
  const content = JSON.stringify(payload);
  if (new TextEncoder().encode(content).length > 60 * 1024) {
    throw new Error("Post is too large. Reduce text or attachments.");
  }
  const expiryTimestamp = Math.floor(Date.now() / 1000) + expirySeconds;
  const tags =
    Array.isArray(extraTags) && extraTags.length
      ? [...extraTags, ["client", FEED_CLIENT], ["expiration", String(expiryTimestamp)]]
      : [
          ["t", FEED_TAG],
          ["client", FEED_CLIENT],
          ["expiration", String(expiryTimestamp)],
        ];
  const event = finalizeEvent(
    {
      kind: FEED_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    },
    hexToBytes(privkeyHex),
  );
  await putRawEvent(event, "feed").catch(() => {});
  return enqueuePublish({
    id: event.id,
    kind: "feed",
    result: { ...payload, eventId: event.id, pubkey: pubkeyHex, expiresAt: expiryTimestamp * 1000 },
    fn: async () => {
      const res = await publishToRelays([], event);
      if (!Object.values(res).some((r) => r.ok)) throw new Error("Failed to publish post.");
    },
  });
}

export async function publishFeedPost(privkeyHex, pubkeyHex, { text, files, onProgress } = {}) {
  const clean = sanitizeFeedText(text);
  const list = Array.from(files || []);
  if (!clean && !list.length) throw new Error("Write something or attach media first.");
  const validation = validateFeedFiles(list);
  if (!validation.ok) throw new Error(validation.error);

  const uploadedMedia = list.length ? await encryptAndUploadFiles(list, { onProgress }) : [];
  const now = Date.now();
  const payload = {
    v: 1,
    feedType: "post",
    id: newFeedId(),
    text: clean,
    media: uploadedMedia,
    createdAt: now,
    updatedAt: now,
  };
  return publishFeedEvent(privkeyHex, pubkeyHex, payload, STREAM_EXPIRY_SECONDS);
}

/** Create or edit a post. Edits keep existing media entries and append newly uploaded files. */
export async function saveFeedPost(
  privkeyHex,
  pubkeyHex,
  { text, files, keepMedia } = {},
  { id, existingItems } = {},
) {
  const clean = sanitizeFeedText(text);
  const newFiles = Array.from(files || []);
  const kept = Array.isArray(keepMedia)
    ? keepMedia
        .filter((m) => m && (m.cid || m.url) && m.key && m.nonce)
        .slice(0, FEED_MAX_FILES)
        .map((m) => ({
          name: String(m.name || "file"),
          mime: String(m.mime || "application/octet-stream"),
          size: Number(m.size || 0),
          cid: String(m.cid || ""),
          key: String(m.key || ""),
          nonce: String(m.nonce || ""),
        }))
    : [];
  if (kept.length + newFiles.length > FEED_MAX_FILES) {
    throw new Error(`Attach up to ${FEED_MAX_FILES} files per post.`);
  }
  const validation = validateFeedFiles(newFiles);
  if (!validation.ok) throw new Error(validation.error);

  const items = existingItems || (await fetchGlobalFeed({ limit: 200 }).catch(() => []));
  const existing = id ? items.find((p) => p.id === id) : null;
  if (id && !existing) throw new Error("Post not found.");
  if (existing && existing.pubkey !== normalizeNostrPubkey(pubkeyHex)) {
    throw new Error("You can only edit your own posts.");
  }

  const uploaded = newFiles.length ? await encryptAndUploadFiles(newFiles) : [];
  const media = [...kept, ...uploaded].slice(0, FEED_MAX_FILES);
  if (!clean && !media.length) throw new Error("Write something or attach media first.");

  const now = Date.now();
  const payload = {
    v: 1,
    feedType: "post",
    id: existing?.id || newFeedId(),
    text: clean,
    media,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    prevEventId: existing?.eventId || null,
  };
  return publishFeedEvent(privkeyHex, pubkeyHex, payload, STREAM_EXPIRY_SECONDS);
}

/** Delete own post via never-renewed tombstone (same logical id, long expiry). */
export async function deleteFeedPost(privkeyHex, pubkeyHex, post) {
  const id = post?.id;
  if (!id) throw new Error("Invalid post.");
  if (post.pubkey && post.pubkey !== normalizeNostrPubkey(pubkeyHex)) {
    throw new Error("You can only delete your own posts.");
  }
  const now = Date.now();
  const payload = {
    v: 1,
    feedType: "post",
    id,
    deleted: true,
    createdAt: post.createdAt || now,
    updatedAt: now,
    prevEventId: post.eventId || null,
  };
  const result = await publishFeedEvent(
    privkeyHex,
    pubkeyHex,
    payload,
    STREAM_DELETE_EXPIRY_SECONDS,
  );
  if (post.eventId) await deleteRawEvent(post.eventId).catch(() => {});
  return result;
}

export async function publishFeedComment(privkeyHex, pubkeyHex, parentPost, text) {
  const parentId = String(parentPost?.id || "");
  if (!parentId) throw new Error("Invalid post.");
  const clean = sanitizeFeedCommentText(text);
  if (!clean) throw new Error("Write a comment first.");
  const now = Date.now();
  const payload = {
    v: 1,
    feedType: "comment",
    id: newFeedId(),
    parentId,
    parentEventId: String(parentPost?.eventId || ""),
    text: clean,
    createdAt: now,
    updatedAt: now,
  };
  return publishFeedEvent(
    privkeyHex,
    pubkeyHex,
    payload,
    STREAM_EXPIRY_SECONDS,
    commentTags(parentPost),
  );
}

export async function saveFeedComment(privkeyHex, pubkeyHex, comment, text) {
  const id = comment?.id;
  if (!id) throw new Error("Invalid comment.");
  if (comment.pubkey && comment.pubkey !== normalizeNostrPubkey(pubkeyHex)) {
    throw new Error("You can only edit your own comments.");
  }
  const clean = sanitizeFeedCommentText(text);
  if (!clean) throw new Error("Write a comment first.");
  const now = Date.now();
  const payload = {
    v: 1,
    feedType: "comment",
    id,
    parentId: String(comment.parentId || ""),
    parentEventId: String(comment.parentEventId || ""),
    text: clean,
    createdAt: Number(comment.createdAt) || now,
    updatedAt: now,
    prevEventId: comment.eventId || null,
  };
  if (!payload.parentId) throw new Error("Invalid comment.");
  const parentRef = { id: payload.parentId, eventId: payload.parentEventId };
  return publishFeedEvent(
    privkeyHex,
    pubkeyHex,
    payload,
    STREAM_EXPIRY_SECONDS,
    commentTags(parentRef),
  );
}

export async function deleteFeedComment(privkeyHex, pubkeyHex, comment) {
  const id = comment?.id;
  if (!id) throw new Error("Invalid comment.");
  if (comment.pubkey && comment.pubkey !== normalizeNostrPubkey(pubkeyHex)) {
    throw new Error("You can only delete your own comments.");
  }
  const now = Date.now();
  const payload = {
    v: 1,
    feedType: "comment",
    id,
    parentId: String(comment.parentId || ""),
    parentEventId: String(comment.parentEventId || ""),
    deleted: true,
    createdAt: comment.createdAt || now,
    updatedAt: now,
    prevEventId: comment.eventId || null,
  };
  const parentRef = { id: payload.parentId, eventId: payload.parentEventId };
  const result = await publishFeedEvent(
    privkeyHex,
    pubkeyHex,
    payload,
    STREAM_DELETE_EXPIRY_SECONDS,
    commentTags(parentRef),
  );
  if (comment.eventId) await deleteRawEvent(comment.eventId).catch(() => {});
  return result;
}

export async function publishFeedReaction(privkeyHex, pubkeyHex, parentPost, emoji) {
  const parentId = String(parentPost?.id || "");
  if (!parentId) throw new Error("Invalid post.");
  if (!isAllowedFeedReaction(emoji)) throw new Error("Unsupported reaction.");
  const now = Date.now();
  const payload = {
    v: 1,
    feedType: "reaction",
    id: newFeedId(),
    parentId,
    parentEventId: String(parentPost?.eventId || ""),
    emoji: String(emoji),
    createdAt: now,
    updatedAt: now,
  };
  return publishFeedEvent(
    privkeyHex,
    pubkeyHex,
    payload,
    STREAM_EXPIRY_SECONDS,
    reactionTags(parentPost),
  );
}

export async function deleteFeedReaction(privkeyHex, pubkeyHex, reaction) {
  const id = reaction?.id;
  if (!id) throw new Error("Invalid reaction.");
  if (reaction.pubkey && reaction.pubkey !== normalizeNostrPubkey(pubkeyHex)) {
    throw new Error("You can only remove your own reactions.");
  }
  const now = Date.now();
  const payload = {
    v: 1,
    feedType: "reaction",
    id,
    parentId: String(reaction.parentId || ""),
    parentEventId: String(reaction.parentEventId || ""),
    emoji: String(reaction.emoji || ""),
    deleted: true,
    createdAt: reaction.createdAt || now,
    updatedAt: now,
    prevEventId: reaction.eventId || null,
  };
  const parentRef = { id: payload.parentId, eventId: payload.parentEventId };
  const result = await publishFeedEvent(
    privkeyHex,
    pubkeyHex,
    payload,
    STREAM_DELETE_EXPIRY_SECONDS,
    reactionTags(parentRef),
  );
  if (reaction.eventId) await deleteRawEvent(reaction.eventId).catch(() => {});
  return result;
}

export function parseFeedEvent(event) {
  if (!event || event.kind !== FEED_KIND) return null;
  const expiryTag = event.tags?.find((t) => t[0] === "expiration");
  const expiresAt = expiryTag ? Number(expiryTag[1]) * 1000 : 0;
  if (expiresAt && expiresAt < Date.now()) return null;
  let payload = null;
  try {
    payload = JSON.parse(event.content);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const logicalId = String(payload.id || event.id);
  const sub = eventSubtype(event);
  const declaredType = String(payload.feedType || "");
  const parentId = String(payload.parentId || sub.parentTag || "");
  const looksComment =
    declaredType === "comment" || sub.isComment || (Boolean(parentId) && !payload.emoji);
  const looksReaction =
    declaredType === "reaction" || sub.isReaction || Boolean(payload.emoji && parentId);
  const feedType = looksReaction ? "reaction" : looksComment && parentId ? "comment" : "post";
  const parentEventId = String(payload.parentEventId || sub.eTag || "");
  if (payload.deleted === true) {
    return {
      id: logicalId,
      eventId: event.id,
      pubkey: event.pubkey,
      feedType,
      parentId,
      parentEventId,
      emoji: feedType === "reaction" ? String(payload.emoji || "") : "",
      deleted: true,
      text: "",
      media: [],
      createdAt: Number(payload.createdAt) || event.created_at * 1000,
      updatedAt: Number(payload.updatedAt) || event.created_at * 1000,
      expiresAt,
    };
  }
  if (feedType === "reaction") {
    const emoji = String(payload.emoji || "");
    if (!parentId || !isAllowedFeedReaction(emoji)) return null;
    return {
      id: logicalId,
      eventId: event.id,
      pubkey: event.pubkey,
      feedType: "reaction",
      parentId,
      parentEventId,
      emoji,
      createdAt: Number(payload.createdAt) || event.created_at * 1000,
      updatedAt: Number(payload.updatedAt) || event.created_at * 1000,
      expiresAt,
    };
  }
  if (feedType === "comment") {
    const text = String(payload.text || "").slice(0, FEED_COMMENT_MAX_CHARS);
    if (!parentId || !text.trim()) return null;
    return {
      id: logicalId,
      eventId: event.id,
      pubkey: event.pubkey,
      feedType: "comment",
      parentId,
      parentEventId,
      text,
      createdAt: Number(payload.createdAt) || event.created_at * 1000,
      updatedAt: Number(payload.updatedAt) || event.created_at * 1000,
      expiresAt,
    };
  }
  const text = String(payload.text || "").slice(0, FEED_MAX_TEXT_CHARS);
  const media = Array.isArray(payload.media)
    ? payload.media
        .filter((m) => m && (m.cid || m.url) && m.key && m.nonce)
        .slice(0, FEED_MAX_FILES)
        .map((m) => ({
          name: String(m.name || "file"),
          mime: String(m.mime || "application/octet-stream"),
          size: Number(m.size || 0),
          cid: String(m.cid || ""),
          key: String(m.key || ""),
          nonce: String(m.nonce || ""),
        }))
    : [];
  if (!text && !media.length) return null;
  return {
    id: logicalId,
    eventId: event.id,
    pubkey: event.pubkey,
    feedType: "post",
    text,
    media,
    createdAt: Number(payload.createdAt) || event.created_at * 1000,
    updatedAt: Number(payload.updatedAt) || event.created_at * 1000,
    expiresAt,
  };
}

/** Collapse posts: tombstone wins; else newest live version by updatedAt. */
export function reduceFeedPosts(items) {
  const deletedIds = new Set();
  const liveById = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    if (item.feedType && item.feedType !== "post") continue;
    if (item.parentId) continue;
    if (item.deleted === true) {
      deletedIds.add(item.id);
      liveById.delete(item.id);
      continue;
    }
    if (deletedIds.has(item.id)) continue;
    const prev = liveById.get(item.id);
    if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) liveById.set(item.id, item);
  }
  return [...liveById.values()];
}

export function reduceFeedComments(items) {
  const deletedIds = new Set();
  const liveById = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    if (item.feedType !== "comment") continue;
    if (!item.parentId) continue;
    if (item.deleted === true) {
      deletedIds.add(item.id);
      liveById.delete(item.id);
      continue;
    }
    if (deletedIds.has(item.id)) continue;
    const prev = liveById.get(item.id);
    if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) liveById.set(item.id, item);
  }
  return [...liveById.values()];
}

/**
 * Collapse reactions: tombstone wins by id, then one live reaction per
 * pubkey+parent (newest by updatedAt). A re-react supersedes the old emoji.
 */
export function reduceFeedReactions(items) {
  const deletedIds = new Set();
  for (const item of items) {
    if (item?.feedType === "reaction" && item.deleted === true && item.id) deletedIds.add(item.id);
  }
  const latestByAuthor = new Map();
  for (const item of items) {
    if (!item?.id || item.feedType !== "reaction" || !item.parentId || !item.pubkey) continue;
    if (item.deleted === true || deletedIds.has(item.id)) continue;
    if (!isAllowedFeedReaction(item.emoji)) continue;
    const key = `${item.parentId}:${item.pubkey}`;
    const prev = latestByAuthor.get(key);
    if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) latestByAuthor.set(key, item);
  }
  return [...latestByAuthor.values()];
}

export function summarizeFeedReactions(reactions, myPubkeyHex = "") {
  const self = normalizeNostrPubkey(myPubkeyHex);
  const counts = {};
  let total = 0;
  let myReaction = "";
  let mine = null;
  for (const r of reactions || []) {
    if (!r || r.feedType !== "reaction" || !isAllowedFeedReaction(r.emoji)) continue;
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    total += 1;
    if (self && r.pubkey === self) {
      myReaction = r.emoji;
      mine = r;
    }
  }
  return { counts, total, myReaction, mine };
}

function sortFeedDesc(posts) {
  return posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function sortFeedAsc(items) {
  return items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function splitParsed(items) {
  const posts = [];
  const comments = [];
  const reactions = [];
  for (const item of items) {
    if (item.feedType === "comment") comments.push(item);
    else if (item.feedType === "reaction") reactions.push(item);
    else posts.push(item);
  }
  return { posts, comments, reactions };
}

function groupByParent(posts, comments, reactions) {
  const ids = new Set(posts.map((p) => p.id));
  const byEventId = new Map(posts.map((p) => [p.eventId, p.id]));
  const commentsByParent = {};
  const reactionsByParent = {};
  for (const p of posts) {
    commentsByParent[p.id] = [];
    reactionsByParent[p.id] = [];
  }
  function parentKey(item) {
    if (item.parentId && ids.has(item.parentId)) return item.parentId;
    if (item.parentEventId && byEventId.has(item.parentEventId)) {
      return byEventId.get(item.parentEventId);
    }
    return "";
  }
  for (const c of comments) {
    const key = parentKey(c);
    if (!key) continue;
    commentsByParent[key].push(c);
  }
  for (const r of reactions) {
    const key = parentKey(r);
    if (!key) continue;
    reactionsByParent[key].push(r);
  }
  for (const key of Object.keys(commentsByParent)) sortFeedAsc(commentsByParent[key]);
  return { commentsByParent, reactionsByParent };
}

export async function getFeedCached() {
  const rows = await getRawEventsByOrigin("feed").catch(() => []);
  const parsed = rows.map((r) => parseFeedEvent(r.event)).filter(Boolean);
  const { posts, comments, reactions } = splitParsed(parsed);
  const { commentsByParent, reactionsByParent } = groupByParent(
    posts,
    reduceFeedComments(comments),
    reduceFeedReactions(reactions),
  );
  return {
    items: sortFeedDesc(reduceFeedPosts(posts)),
    commentsByParent,
    reactionsByParent,
    fresh: false,
  };
}

export async function fetchGlobalFeed({ limit = 50, timeout = 5000 } = {}) {
  const events = await query(
    [{ kinds: [FEED_KIND], "#t": [FEED_TAG], since: getRetentionCutoffSec(), limit }],
    timeout,
  );
  const rows = await mergeRawEventsByOrigin(
    "feed",
    events.filter((e) => e.kind === FEED_KIND),
  );
  const source = rows.length ? rows.map((r) => r.event) : events;
  return sortFeedDesc(reduceFeedPosts(source.map(parseFeedEvent).filter(Boolean)));
}

export async function getTrustedFeedAuthors(myPubkeyHex) {
  const self = normalizeNostrPubkey(myPubkeyHex);
  if (!self) return [];
  try {
    const { sentToPeers } = await api.listDirectPeers(self);
    return [...new Set(Array.from(sentToPeers || []))];
  } catch {
    return [];
  }
}

export async function fetchTrustedFeed(myPubkeyHex, { limit = 50, timeout = 5000 } = {}) {
  const authors = await getTrustedFeedAuthors(myPubkeyHex);
  if (!authors.length) return [];
  const events = await query(
    [{ kinds: [FEED_KIND], authors, "#t": [FEED_TAG], since: getRetentionCutoffSec(), limit }],
    timeout,
  );
  const parsed = events.map(parseFeedEvent).filter(Boolean);
  const { posts } = splitParsed(parsed);
  for (const e of events) void putRawEvent(e, "feed").catch(() => {});
  return sortFeedDesc(reduceFeedPosts(posts));
}

/** Fetch comments + reactions for one post: relay sweep plus cached rows. */
export async function fetchFeedThread(parentPost, { limit = 100, timeout = 5000 } = {}) {
  const parentId = String(parentPost?.id || "");
  const parentEventId = String(parentPost?.eventId || "");
  if (!parentId && !parentEventId) return { comments: [], reactions: [] };
  const filters = [];
  if (parentEventId) {
    filters.push({ kinds: [FEED_KIND], "#t": [FEED_TAG], "#e": [parentEventId], limit });
  }
  filters.push({
    kinds: [FEED_KIND],
    "#t": [FEED_COMMENT_TAG, FEED_REACTION_TAG],
    since: getRetentionCutoffSec(),
    limit: 200,
  });
  const events = await query(filters, timeout).catch(() => []);
  if (events.length) {
    await mergeRawEventsByOrigin(
      "feed",
      events.filter((e) => e.kind === FEED_KIND),
    ).catch(() => {});
  }
  const cached = await getRawEventsByOrigin("feed").catch(() => []);
  const seen = new Map();
  for (const e of events) seen.set(e.id, e);
  for (const row of cached) {
    if (row?.event?.id && !seen.has(row.event.id)) seen.set(row.event.id, row.event);
  }
  const parsed = [...seen.values()].map(parseFeedEvent).filter(Boolean);
  const liveComments = reduceFeedComments(parsed.filter((p) => p.feedType === "comment"));
  const liveReactions = reduceFeedReactions(parsed.filter((p) => p.feedType === "reaction"));
  const comments = sortFeedAsc(
    liveComments.filter(
      (c) => c.parentId === parentId || (parentEventId && c.parentEventId === parentEventId),
    ),
  );
  const reactions = liveReactions.filter(
    (r) => r.parentId === parentId || (parentEventId && r.parentEventId === parentEventId),
  );
  return { comments, reactions };
}

/**
 * Batch interaction summaries for a list of posts in one relay round-trip
 * plus cached rows. Keyed by post logical id.
 */
export async function fetchFeedInteractionSummaries(
  posts,
  { limit = 200, timeout = 5000, myPubkeyHex = "" } = {},
) {
  const list = Array.isArray(posts) ? posts.filter(Boolean) : [];
  if (!list.length) return {};
  const cached = await getRawEventsByOrigin("feed").catch(() => []);
  const filters = [];
  const eventIds = [...new Set(list.map((p) => p.eventId).filter(Boolean))].slice(0, 50);
  if (eventIds.length) {
    filters.push({ kinds: [FEED_KIND], "#t": [FEED_TAG], "#e": eventIds, limit });
  }
  filters.push({
    kinds: [FEED_KIND],
    "#t": [FEED_COMMENT_TAG, FEED_REACTION_TAG],
    since: getRetentionCutoffSec(),
    limit,
  });
  const events = filters.length ? await query(filters, timeout).catch(() => []) : [];
  if (events.length) {
    await mergeRawEventsByOrigin(
      "feed",
      events.filter((e) => e.kind === FEED_KIND),
    ).catch(() => {});
  }
  const seen = new Map();
  for (const e of events) seen.set(e.id, e);
  for (const row of cached) {
    if (row?.event?.id && !seen.has(row.event.id)) seen.set(row.event.id, row.event);
  }
  const parsed = [...seen.values()].map(parseFeedEvent).filter(Boolean);
  const { comments, reactions } = splitParsed(parsed);
  const { commentsByParent, reactionsByParent } = groupByParent(
    list,
    reduceFeedComments(comments),
    reduceFeedReactions(reactions),
  );
  const out = {};
  for (const p of list) {
    const postReactions = reactionsByParent[p.id] || [];
    out[p.id] = {
      commentCount: (commentsByParent[p.id] || []).length,
      reactions: postReactions,
      summary: summarizeFeedReactions(postReactions, myPubkeyHex),
    };
  }
  return out;
}

/** Find one post by logical id or event id: cache first, then relay sweep. */
export async function fetchFeedPostById(id) {
  const target = String(id || "");
  if (!target) return null;
  const cached = await getFeedCached().catch(() => null);
  const hit = (cached?.items || []).find((p) => p.id === target || p.eventId === target);
  if (hit) return hit;
  const live = await fetchGlobalFeed({ limit: 200 }).catch(() => []);
  return live.find((p) => p.id === target || p.eventId === target) || null;
}
