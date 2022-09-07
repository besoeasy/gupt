/**
 * In-chat ping reminder for DM chats.
 *
 * Show when the peer hasn't sent a previewable message in 10 minutes —
 * regardless of who sent the last message.
 */

import { reactive } from "vue";

const PEER_QUIET_MS = 10 * 60 * 1000;

const PREVIEWABLE_TYPES = new Set(["text", "voice", "media"]);

/** roomIds the user dismissed for the current quiet spell */
const dismissedRooms = reactive(new Set());

function tsOf(row) {
  return Number(row?.ts || row?.created_at || 0);
}

function lastInboundFromMessages(messages) {
  let latest = 0;
  for (const row of messages || []) {
    if (!row?.mine && PREVIEWABLE_TYPES.has(row?.type)) {
      latest = Math.max(latest, tsOf(row));
    }
  }
  return latest;
}

function resolveLastInboundTs(meta, messages) {
  const stored = Number(meta?.lastInboundTs || 0);
  if (stored > 0) return stored;
  const fromMessages = lastInboundFromMessages(messages);
  if (fromMessages > 0) return fromMessages;
  if (meta?.lastMessageMine === false && meta?.lastMessageTs) {
    return Number(meta.lastMessageTs);
  }
  return 0;
}

function peerQuietMs(meta, now = Date.now(), messages = null) {
  const lastInbound = resolveLastInboundTs(meta, messages);
  if (lastInbound > 0) return now - lastInbound;
  if (Number(meta?.lastMessageTs || 0) > 0) return PEER_QUIET_MS;
  return 0;
}

export function shouldShowReplyReminder(meta, now = Date.now(), messages = null) {
  if (!meta) return false;
  return peerQuietMs(meta, now, messages) >= PEER_QUIET_MS;
}

export function isReplyReminderDismissed(roomId) {
  return dismissedRooms.has(String(roomId || ""));
}

export function dismissReplyReminder(roomId) {
  const id = String(roomId || "");
  if (id) dismissedRooms.add(id);
}

export function clearReplyReminderDismiss(roomId) {
  const id = String(roomId || "");
  if (id) dismissedRooms.delete(id);
}

export function clearAllReplyReminders() {
  dismissedRooms.clear();
}
