# GUPT — Write Queue Improvement Plan

## Goal

Every non-ephemeral write to Nostr relays goes through one unified queue with
rate-limiting, exponential backoff, and a navbar counter that shows pending
actions and disappears when the queue is empty.

---

## Background / Current State

`sendQueue.js` already handles DM and group message sends with per-conversation
lanes and exponential backoff. Everything else writes directly to the relay with
no retry, no rate-limiting, and no visibility.

### What is currently queued

| Write type | Queued | Notes |
|---|---|---|
| DM text messages | ✅ | Per-conversation lane, exponential backoff |
| Group messages | ✅ | Same |

### What bypasses the queue (and why it matters)

| Write type | Queued | Problem |
|---|---|---|
| Read receipts (double-tick) | ❌ | Ad-hoc loop in RoomView.vue with hardcoded 5s gap, no retry |
| Reactions (`react` / `like`) | ❌ | Fire-and-forget, silently dropped on relay rejection |
| Edits | ❌ | Fire-and-forget, no retry |
| Profile publish | ❌ | Direct call, no retry |
| Group admin ops (add/remove member, rotate keys) | ❌ | Direct `postDirectMessage`, no retry |

### What must never be queued (ephemerals)

| Write type | Why |
|---|---|
| Typing indicators (Kind 21004) | Stale if delayed >4s — receiver clears the indicator after 4s. A retry at 30s shows a false "typing" ghost. |
| WebRTC signaling (Kind 20004) — SDP offers, answers, ICE | Stateful handshake with a ~10s window. Any delay breaks the call. ICE candidates must arrive in a burst. |

**Rule:** if a message being delayed by 5+ seconds makes it *wrong* rather than
just *late*, it must not be queued.

---

## Pieces

### Piece 1 — Global 2s inter-send throttle in `sendQueue.js`

**File:** `src/lib/sendQueue.js`

Add a module-level `lastSentAt` timestamp. Before draining any lane, check that
at least 2000ms have passed since the last successful send. If not, schedule the
drain to fire at `lastSentAt + 2000`. This prevents relay rate-limiting across
all conversations without changing the per-conversation ordering guarantee.

```
Before: each lane drains as fast as the relay responds
After:  global floor of one send every 2s across all lanes
```

Backoff parameters (keep existing values, already well-tuned):
- Base delay: 1s (first retry)
- Max delay: 3min (cap, changed from current 30s)
- Max attempts: 8

### Piece 2 — Route missing write types through the queue

**Files:** `src/views/RoomView.vue`, `src/stores/messenger.js`, `src/lib/groups.js`, `src/stores/identity.js`

Replace each direct publish call with `enqueueSend`. Use a stable `id` derived
from the content (e.g. `hash(type + replyTo + ts)`) so duplicate suppression
works correctly.

| Write type | `conversationId` lane | Priority |
|---|---|---|
| Read receipts | `receipt:{roomId}` | normal |
| Reactions | `{roomId}` (same as DMs) | normal |
| Edits | `{roomId}` | normal |
| Profile publish | `profile:{pubkey}` | normal |
| Group admin ops | `group:{groupId}` | normal |

Remove the ad-hoc `receiptQueue` / `isSendingReceipts` loop in `RoomView.vue`
(lines 638–664) — the send queue replaces it entirely.

### Piece 3 — Navbar pending counter

**New file:** `src/components/WriteQueueBadge.vue`

A reactive badge component that:
- Reads `getSendQueueSnapshot().queueDepth` on a 500ms `setInterval`
- Shows a small pill on the navbar: `"3 pending"` with a spinner icon
- Animates in when `queueDepth > 0`, animates out (fade + shrink) when it
  reaches 0
- Tapping/clicking it opens a popover listing pending items by type
  (e.g. "2 messages · 1 reaction · 1 read receipt")

**Integration:** mount inside `AppNavbar.vue`, hidden when `queueDepth === 0`.

---

## What does NOT change

- Typing indicators — remain fire-and-forget via `api.postDirectMessage`, bypassing the queue
- WebRTC signaling — remains fire-and-forget, bypassing the queue
- `wspool.js` / `api.js` transport layer — untouched by this plan
- Per-conversation ordering — preserved (each `conversationId` still has its own lane)

---

## Verification

1. Send a message while offline → status shows pending → comes online → drains
   automatically → counter clears
2. React to a message on a slow relay → reaction shows pending count → retries
   → counter clears on success
3. Send a message + reaction in rapid succession → relay does not return
   `rate-limited` error (2s throttle prevents it)
4. Start a voice call → call connects normally (WebRTC signals unaffected)
5. Type in a chat → typing indicator appears on peer side immediately (not
   delayed by queue)
6. Queue depth badge appears during send, disappears after all writes confirm

---

## Files changed (summary)

| File | Change |
|---|---|
| `src/lib/sendQueue.js` | Add global 2s inter-send throttle; raise max backoff to 3min |
| `src/views/RoomView.vue` | Remove ad-hoc receiptQueue; route receipts + reactions + edits through queue |
| `src/stores/messenger.js` | Route reactions + edits through queue (they go via sendDirectMessage already but need stable IDs) |
| `src/lib/groups.js` | Route group admin ops through queue |
| `src/stores/identity.js` | Route profile publish through queue |
| `src/components/WriteQueueBadge.vue` | New — pending counter badge |
| `src/components/AppNavbar.vue` | Mount WriteQueueBadge |
