# AGENTS.md

Guidance for AI agents and contributors working on this repository.

## Project

gupt is a self-hosted, end-to-end encrypted messenger built with Vue 3 + Vite.
There is no backend — encryption, caching, and publishing all happen in the
browser, and messages are stored on user-chosen Nostr relays as encrypted
events. It ships as a PWA with a service worker, plus Flatpak packaging.

Core concepts:

- **Not a Nostr app** — Nostr relays are used as dumb transport only. We are
  not bound to follow NIP specs; if our own implementation achieves something
  better, prefer it (e.g. self-addressed encrypted stream tags, NIP-40-style
  expirations tuned to our own lifetimes).
- **Identity** — a secp256k1 keypair derived from memory anchors (password,
  PIN, dates, and other remembered values) via SHA-256 + Argon2id, or restored
  from a pasted hex key / Gupt backup / secret. The private key never leaves
  the browser (`src/lib/secureKey.js`).
- **Messaging** — encrypted DMs, group chats, and peer-to-peer WebRTC
  calls (`src/lib/webrtc/`), with NIP-40 expirations and read receipts.
- **Streams** — self-addressed encrypted Kind-1 items (bookmarks,
  passwords, notes) stored under a `gupt_*` tag; ciphertext sits in a tag
  so relay metadata stays public while content stays private.
- **Cache** — an IndexedDB database (`src/lib/idb.js`) with TTL rows, read
  cache-first and refreshed from relays, backed by a background replication
  worker.

## Repository layout

```
src/
  lib/        domain logic (crypto, idb, relay, sendQueue, stream libs, webrtc)
  lib/relay/  Nostr pool, publish, subscribe, selection, outcomes, hints, health
  lib/webrtc/ call session, peer plumbing, SAS, constants
  stores/     Pinia stores (identity, messenger, calls, replication, settings, theme, profiles)
  views/      route-level pages
  components/ shared + feature components (chat/, chatv2/, settings/, home/)
  composables/ shared composables (useReplicationWorker, useConversations, useCall*)
  config/     static config (servers, retention)
  router/     vue-router routes
  sw.js       PWA service worker entry
bin/          static server for dist/
flatpak/      Flatpak manifests
```

Module imports use the `@/` alias → `./src/` (see `jsconfig.json`).

Routing is hash-based (`createWebHashHistory`) and every route-level view is
lazy-loaded. `src/lib/sync.js` is a thin indirection over the messenger store
(`startAppSync` → `messenger.start`, `reconcileFromRelays` → `messenger.reconcile`);
views should not reach into `stores/messenger.js` for sync orchestration.

## Commands

```sh
npm run dev         # format src/ with oxfmt, then start Vite dev server
npm run build       # vite build (+ PWA service worker)
npm run build:flatpak
npm start           # node bin/gupt.js (static server for dist/)
```

Formatting is enforced via `oxfmt` — run `npx oxfmt <file>` (or the whole
`src/`) before committing. There is no separate linter. Note: `npm run dev`
reformats `src/` automatically on startup. `dist/` is gitignored; build
artifacts are never committed.

## Code style

- JavaScript, ES modules (`type: "module"`), no semicolons.
- No comments unless they carry real context (JSDoc for exported helpers is OK).
- Follow the pattern of neighboring files: domain logic in `src/lib`, state in
  `src/stores` (Pinia), UI in `src/views` + `src/components`, relay code under
  `src/lib/relay/`.
- UI is Tailwind CSS v4 utility classes driven by CSS variables like
  `--app-text`, `--app-primary`, `--app-border` (defined in `src/index.css`);
  icons come from `@lucide/vue`.
- `vite.config.js` strips `console.log` / `console.debug` in production but
  keeps `console.warn` / `console.error`. A no-op `log()` stub is the codebase's
  pattern for disabled logging (see `src/lib/sendQueue.js`).

## UI and layout guidelines

To keep the application uniform across all pages and viewports:

- **Large screens (>= 1024px / desktop)**:
  - All route-level views (`src/views/`) and primary navigation (`AppNavbar`)
    must be constrained to `max-w-6xl` (`72rem` / `1152px`) and horizontally
    centered with `mx-auto`.
  - Stream/item list views (Bookmarks, Notes, Passwords) use a single-column card list layout
    inside `mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8`, with dedicated
    subroutes for creating or editing items (`/bookmarks/new`, `/bookmarks/:id`,
    `/notes/new`, `/notes/:id`, `/passwords/new`, `/passwords/:id`).
  - Chat uses a uniform single-column route flow inside `mx-auto max-w-6xl w-full h-full`:
    `/chat` shows the conversation inbox, and `/chat/:conversationId` shows the active conversation (with navigation back to the inbox via the navbar).
  - Standalone/form/dashboard views use `mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8`
    as their outer page container. Form/card columns within the page should center
    appropriately (e.g. `mx-auto max-w-2xl space-y-5`).
- **Mobile screens (< 1024px / < 640px)**:
  - Layouts must be mobile-optimized: full-width (`w-full`), single-column or
    single active panel views (switching between list and conversation/editor)
    instead of cramped side-by-side panes.
  - Safe mobile viewport sizing: use `min-h-dvh` or `h-dvh`, prevent horizontal
    overflow (`overflow-x-hidden`), and avoid double vertical scrollbars.
  - Touch-friendly targets: buttons and interactive controls should have
    comfortable tap areas (minimum `h-10 w-10` / `h-11 w-11` for icon buttons,
    `rounded-xl` or `rounded-2xl`).
  - Mobile padding: standard header padding `px-4 py-3 sm:px-6` and body padding
    `px-4 py-6 sm:px-6 lg:px-8`.
- **Design tokens**:
  - Use semantic CSS variables (`--app-bg`, `--app-surface`, `--app-surface-soft`,
    `--app-surface-hover`, `--app-border`, `--app-text`, `--app-text-soft`,
    `--app-muted`, `--app-primary`, `--nav-bg`) and `@lucide/vue` icons.

## Identity and keys

`src/lib/crypto.js` derives keys three ways; `src/lib/secureKey.js` holds the
live session; `src/stores/identity.js` wires them to storage.

- **Memory anchors** (`derivePrivkeyFromBrainFactors`) — 2–7 of
  `{ passphrase, pin, specialDate, secretPerson, favoriteCountry, firstPet,
  firstCar }`. Each value is normalized, SHA-256 hashed, deduped, **sorted A→Z
  by hash**, joined with `\0`, then run through Argon2id (64 MiB, t=3). The sort
  is load-bearing: it makes the identity independent of which slot a memory was
  typed into, so the same memories in a different order on another device
  reproduce the same key. Changing this changes every anchor-derived identity —
  bump the salt (`gupt-brain-kdf-v4`) if you ever must.
- **Pasted secret** (`derivePrivkeyFromSecret`) — single Argon2id pass, salt
  `gupt-secret-kdf-v1`.
- **Hex key / Gupt backup JSON** — `classifyPastedIdentitySecret` returns
  `{kind:"hex"}` and the key is used verbatim.
- **Session precedence** (`identity.init()`): sessionStorage session →
  localStorage `gupt_privkey` (mode `account`) → brand-new random keypair
  (mode `ephemeral`). Switching identities calls `clearAllCaches()` first.
- **Crypto scheme** is custom, not NIP-44: ECDH x-only → `sha256(sharedX)` →
  AES-256-GCM, serialized `v1:<b64 nonce>:<b64 ciphertext>`. Room ids are
  `sha256(sorted([pubkeyA, pubkeyB]).join(""))` (`dmRoomId`). Event signing is
  standard BIP-340 Schnorr.
- **Names/avatars** are derived, never uploaded: `pubkeyName()` builds
  `adjective-noun-NNN` from pubkey bytes, `roboHashUrl()` renders a jdenticon
  SVG data URL.

## Chat payload protocol

The encrypted plaintext of every kind-4 / ephemeral event is a JSON payload.
Shared fields are `type` and `ts`, plus `text` / `media` / `replyTo` /
`replyExcerpt` / `emoji` / `replaces` / `lastReadTs`. `media` is
`{ key, nonce, mime, name, size, cid }`.

| `type` | Persisted | Semantics |
| --- | --- | --- |
| `text` | yes | plain message, `MAX_DM_TEXT_CHARS = 8000` |
| `media` | yes | attachment; `key`/`nonce` are per-file |
| `voice` | yes | voice note, adds `durationMs` |
| `react` | yes | reaction anchored via `replyTo`; legacy `like` normalizes to ❤️ |
| `edit` | yes | anchors via **`replaces`** (not `replyTo`), last-write-wins by `ts` |
| `read` | yes | DM: one row per message (`{replyTo: msgId}`); group: `{lastReadTs}` watermark |
| `call-request` / `call-event` | **no** | call log rows, but share the `call-` prefix so they publish as ephemeral kind 20004 |
| `call-*` signals | no | see Calls below |
| `typing` | no | kind 21004 |

Type registries live next to their consumers: `CHAT_TYPES`,
`PREVIEWABLE_TYPES`, `TRUST_ADVANCING_TYPES` in `stores/messenger.js`;
`CHAT_ROW_TYPES` / `RECEIPT_CHAT_TYPES` in `lib/chatListUtils.js`;
`CALL_SIGNAL_TYPES` in `lib/webrtc/constants.js`. Add new types to the right
set — an unlisted type is filtered out and will silently never render.

Mentions are **plain text only** — no payload field, no notification. The
composer autocompletes `@handle`; `ChatMessageBubble` regex-matches the handle
to tint the bubble. There is no un-react path, and edits are DM-only in the UI.

## Groups (stateless)

`src/lib/groups.js`. There is no shared group key, admin, or roster.

- A group is a `t=gupt:group-msg` tag on an ordinary kind-4 DM.
- `groupId = sha256(normalizedName + ":" + sortedUniqueMembers.join(","))`.
  Membership is immutable because changing it changes the hash — that is the
  whole membership-control model.
- Every message fans out to all members **plus a self→self copy**, so your own
  record survives a device wipe. `fanOut()` prepares all events up front and
  returns the self→self event id, which is what the optimistic row uses so the
  pending row, the relay echo, and the confirmation share one id.
- `applyGroupFromMessage` re-derives the hash on ingest and rejects a group
  whose id does not match the shipped name+members, so you cannot be silently
  added to a roster. Keep that check.
- De-duplication is layered in three places: the live subscription skips
  self fan-out copies to *other* members (`stores/messenger.js`), the event-level
  `isSelfFanOutCopy()` guard in `syncAll`/`syncGroup`/local decryption, and the
  shared-id optimistic merge. Removing one layer reintroduces duplicate bubbles.
- Only create / learn / leave exist. There is no invite event and no admin role.

## Calls

`src/lib/webrtc/` + `src/stores/calls.js`. Signaling rides the normal DM
channel — any `type` starting with `call-` becomes an ephemeral **kind 20004**
with no NIP-40 expiration, and signals are sent with `api.postDirectMessage`
directly, deliberately **bypassing the send queue** (a ring timeout must not sit
in a retry lane).

- Handshake is request → accept → offer: the caller publishes a `call-request`
  chat row and waits 60s; the callee's Accept sends `call-accept`, which is what
  actually triggers `startOutgoingCall()`. The callee parks the offer and only
  acquires media on accept.
- ICE is coalesced into 1.5s batches (`call-ice` / `call-ice-batch`) to avoid
  relay floods. Ring timeout 45s, 2 ICE-restart attempts, 8s grace on
  `disconnected`.
- **Trusted-contact gate**: inbound call signals are dropped in the DM live
  subscription unless you have sent ≥7 `TRUST_ADVANCING_TYPES` messages to that
  peer. Reactions, edits, and receipts do **not** count. This is the
  authoritative check — the UI merely hides the buttons.
- **SAS** (`lib/webrtc/sas.js`) is derived from the two SDP fingerprints
  (sorted, so it is symmetric) hashed with the `callId`. It is display-only:
  there is no persisted safety-number store and no automatic comparison.
- ICE servers are **STUN-only, no TURN** (`config/servers.js`), so NAT
  traversal is best-effort.

## Relay event kinds (allowed set only)

Only these Nostr event kinds may be published or subscribed to. Do not add
any other kind:

| Kind    | Purpose                                                                             |
| ------- | ----------------------------------------------------------------------------------- |
| `0`     | Public profiles (metadata)                                                          |
| `1`     | Secure share, invites, and the encrypted stream items (passwords, notes, bookmarks) |
| `4`     | End-to-end encrypted DMs (groups are a tag on kind-4 DMs)                           |
| `20004` | Ephemeral encrypted WebRTC signaling                                                |
| `21004` | Ephemeral encrypted typing indicators                                               |

Constants live in `src/lib/api.js` (`DM_KIND`, `EPHEMERAL_DM_KIND`,
`EPHEMERAL_TYPING_KIND`); kinds `0` and `1` appear inline. Anything else needs
a `gupt_*` tag namespace and must not rely on a new kind.

The kind is derived from the payload `type` in `api.prepareDirectMessage`:
`typing` → 21004, any `call-*` → 20004, everything else → 4. The store also
filters out any row whose `kind` is in 20000–29999, so ephemeral traffic can
never be persisted.

## Relay pool and health

`src/lib/relay/` is a hand-rolled WebSocket Nostr client (no nostr-tools).
`pool.js` owns sockets/subscriptions; the other modules are layered on top.

- `readRelays()` is an **exploit/explore bandit**: `EXPLOIT_SLOTS = 50`
  best-scoring known relays, plus `EXPLORE_SLOTS = 16` randomly shuffled
  untested ones. Add a relay and it gets explored before it is trusted.
- `getRelayRanking()` in `idb.js` scores relays from EWMA latency + ok-rate per
  operation (`connect` / `query` / `publish`); `recordOutcomes()` in
  `relay/outcomes.js` is the single write path. Replication publishes pass
  `silent: true` and are intentionally excluded from scoring.
- `evictWorstRelays()` batch-evicts hint relays at 100 known relays, and drops
  any scoring ≤ 0.15 with ≥3 samples. Configured and user-added custom relays
  are protected from auto-deletion.
- `startNetworkDiscoveryLoop()` runs every 60s: 25% chance, and only when
  `getAvgActiveRelayScore() < 0.6`, to scrape `p`-tag hints off recent public
  GUPT DMs.
- Peer relay hints ride in the `p` tag's third element (`pickRelayHint()`),
  are mirrored into `peerRelayHints`, and are used to bias both publish and
  query relay sets. Hints older than 30 days are ignored.
- `publish()` succeeds on **at least one** relay OK, but `pool.publish()`
  internally waits for `minOk = 2` when more than one is available.

## Dexie cache (IndexedDB)

All local persistence goes through one Dexie database, `src/lib/idb.js`:

- DB name `gupt_app_cache_v3`; the Dexie schema version is `DB_VERSION`, derived
  from `__APP_VERSION__`'s leading integer. **The name is what recreates the
  cache** — bumping the version only runs an in-place additive upgrade.
- Tables: `mediaCache`, `roomMeta`, `groups`, `profiles`, `syncCursors`,
  `messageSearch`, `sendTimings`, `relayStats`, `peerRelayHints`, `rawEvents`.
- Freshness is normally read from the row's own `expiresAt`; the
  activity-derived window in `getEntryExpiryTimestamp` is only a fallback for
  legacy rows that lack the field, so the read path stays in agreement with
  `purgeExpiredCache` (which filters on the stored index). The window itself is
  `getEntryActivityTimestamp(table, row) + 400 days`, except `profiles` (24h ±
  jitter), staged uploads (24h), and `sendTimings` / `relayStats` (90d).
  `mediaCache` is the exception that uses `max(stored, activity + 400d)` —
  `touchEncCached` moves `lastAccessedAt` but never `expiresAt`, so the rolling
  value is what keeps hot media alive. `syncCursors` and `peerRelayHints` have
  no `expiresAt` at all — hints are swept on a 30-day `updatedAt` rule instead.
- `rawEvents` stores full Nostr events — it backs chat history, the
  bookmark/password/note streams, and the replication worker. `putRawEvent`
  upserts by `event.id` and preserves `lastReplicatedAt` on re-put;
  `getRawEventsByOrigin` reads a stream's cached events. `expiresAt` comes from
  the event's NIP-40 `expiration` tag, and is `Number.MAX_SAFE_INTEGER` for
  stream events that carry none — the 400-day window is a *relay* concern, not a
  local-eviction concern.
- Streams read cache-first, then refresh from relays: the views load with
  `getBookmarksCached`/`fetchBookmarks`, `getNotesCached`/`fetchNotes`, and
  `getPasswordsCached`/`fetchPasswords` (see the stream libs under `src/lib/`).
- `startCacheMaintenance()` purges expired rows on a 6-hour interval;
  `purgeOversizeCache()` evicts least-recently-active `mediaCache`/`rawEvents`
  rows above `RETENTION_MAX_BYTES` (10 GB). New helpers should follow the same
  `expiresAt` + `getFresh` pattern (`getFresh` is private; mirror it per table).

## Send queue

All relay writes go through the in-memory send queue (`src/lib/sendQueue.js`)
so a transient relay failure retries instead of dropping the write:

- `enqueueSend({ id, fn, onFailed, onSuccess, meta })` appends a task to a
  lane (keyed by `meta.conversationId`, so writes to one conversation are
  serialized), dedupes by `id`, bumps `pendingCount`, and drains. Returns
  `true` when accepted.
- Retry policy: exponential backoff from 1s up to 3min, `MAX_ATTEMPTS = 8`,
  with a 1200ms global throttle between sends. On permanent failure the task
  is dropped and `onFailed` fires.
- `pendingCount` drives the navbar badge (`/queue` links when > 1 pending).
- A `window.online` listener flushes queued lanes when connectivity returns.
- Stream items (bookmarks, passwords, notes) publish via
  `enqueuePublish({ id, kind, result, fn })` — it accepts the task, returns
  `result` optimistically, and the write retries in the background. Chat
  messages/receipts use `enqueueSend` directly.
- Tasks live in memory only — they are not persisted across page reloads.
- Call signaling intentionally does **not** use the queue.

## Stream renewal

`src/lib/streamRenewal.js` holds the shared policy for all three Kind-1 streams;
per-stream `renew*` functions supply the republish.

- Selection is by **item age, not proximity to expiry**: oldest live,
  non-deleted items not written in the last `RETENTION_DAYS / 2` (200 days),
  capped at `STREAM_RENEWAL_LIMIT = 3` per tick.
- Renewal republishes with the same logical `id`, a fresh 400-day NIP-40
  `expiration`, and `prevEventId` pointing at the event it supersedes.
- `stores/replication.js` runs it after every tick, reading **only from the
  Dexie cache** — it never fetches from relays. Items whose expiry has already
  lapsed are dropped during decryption and are therefore unrecoverable; an app
  unopened for >400 days loses the item on every relay.
- Tombstones are never renewed; they carry a 10-year expiry.

## Replication worker

`src/stores/replication.js` + `src/lib/replication.js`, started from `App.vue`
once identity is ready and gated on `settings.replicationEnabled`.

- 15s base tick with ±25% jitter, backing off to 120s when >80% of publish
  outcomes fail, halving back on any success, ×3 under `navigator.connection.saveData`.
- Ticks are skipped while `document.hidden` or `pendingCount > 0`; extra ticks
  fire on `visibilitychange` → visible and on `window.online`.
- Each tick samples never-replicated `rawEvents` (walked by `lastReplicatedAt`,
  kinds 1 and 4, still unexpired), takes 5 (3 on data-saver), and republishes
  to a fresh health-ranked relay set, silently. Any single relay OK marks the
  event replicated.

## Media upload and retrieval

Attachments use AES-256-GCM with a per-file key; only ciphertext goes to
Originless servers, while `key`/`nonce`/`cid` travel inside the E2EE envelope.
Encryption happens in the callers (`useConversationCompose`, `share.js`), not in
`upload.js`; ciphertext is staged in IndexedDB first and cleared in `finally`.

Upload (`src/lib/upload.js`):

- `uploadFile` runs a **shuffled** then health-ranked hedged foreground
  (1 active, hedged to `ORIGINLESS_FG_MAX_ACTIVE = 2` after
  `ORIGINLESS_FG_HEDGE_DELAY_MS = 1500ms`) plus a background replication queue
  at concurrency 1 for the remaining servers. First `cid` resolves the primary
  and dismisses the upload bar.
- Server health lives in `src/lib/originlessHealth.js`: fail-then-latency
  ranking, `ORIGINLESS_BAN_MS` 5min on failure, transient-vs-permanent
  classifier, `2s/8s/20s` backoff. The third entry is unreachable — the
  background loop exits at `ORIGINLESS_BG_MAX_ATTEMPTS = 3`.
- The first `cid` resolves the primary immediately and the upload bar
  dismisses at `cid`. Background progress events carry `background: true` and
  must be ignored by foreground progress UI (`useConversationCompose`,
  `share.js` already guard on this).
- Background per-server policy: up to 3 attempts, per-attempt
  `min(12min, calcTimeoutMs)`, 10s stall, transient errors only; a `cid`
  mismatch against the primary counts as failure.
- Do not fan out to all servers at once and do not let background replication
  hold the foreground bar — that regresses to the stuck-upload bug.
- The background queue's promise is never awaited by callers, so replication
  failures are invisible by design.

Retrieval (`src/lib/mediaDecrypt.js`, `src/lib/verifiedFetch.js`):

- The message carries **only `cid`**. `resolveMediaSources()` returns a single
  `ipfs://<cid>` source, fetched through `@helia/verified-fetch` (bitswap, 8
  attempts, 500ms·2ⁿ capped at 30s). There is **no explicit SHA-256 check in
  `src/`** — integrity comes from Helia's CID verification during block
  assembly, plus the AES-GCM auth tag at decrypt time.
- The message envelope carries **only `cid`**. Both `uploadFile` callers
  (`useConversationCompose`, `share.js`) read `uploaded.cid` and discard
  everything else, so the per-server `url` values and `redundancyCount` that
  `uploadFile` computes never reach a message. Upload redundancy is not download
  redundancy — do not assume the envelope carries a server list.
- `buildOriginlessDownloadUrl(cid)` (`config/servers.js`) returns a public-gateway
  link, `https://inbrowser.link/ipfs/<cid>`, because Originless stores content
  but does not serve it. It is what fills `uploadFile`'s `url` field, which is
  currently only consumed by the background replication bookkeeping and the
  settings-panel upload probe — it is not attached to outgoing messages.
- Two Dexie caches back the path: ciphertext keyed `ipfs://<cid>`, plaintext
  keyed `dec:<messageEventId>`. Both 400 days. Note that **plaintext media is
  persisted locally** — the ciphertext-only-at-rest rule holds on the wire and
  on Originless, not in IndexedDB.

## Security invariants (do not break)

- All cryptography uses `@noble/*` (`@noble/ciphers`, `@noble/hashes`,
  `@noble/secp256k1`). Never hand-roll crypto.
- Private keys are handled via `src/lib/secureKey.js` / the identity store and
  must never be logged or persisted in plaintext outside that flow.
- User-supplied text rendered as HTML must go through DOMPurify
  (see NotesView for the markdown pattern). Plain interpolation `{{ }}` is safe.
- URLs opened via `window.open` must use `"noopener,noreferrer"` and only
  `http(s)` after `normalizeBookmarkUrl` validation.
- Secrets (passwords, TOTP secrets) must stay inside the ciphertext payload —
  relay event tags/`content` are public metadata.
- `createVerifiedFetch` is created with `allowInsecure: true, allowLocal: true`
  because the CID is attacker-supplied (it arrives inside a DM). Do not relax
  that decision without re-reading `verifiedFetch.js`.

## Known footguns

Behaviors that are true today and will silently break a plausible change:

- **Two expiry policies must agree.** `purgeExpiredCache` filters on the stored
  `expiresAt` index, while `getFresh` / `getFreshMedia` / `summarizeTable` go
  through `getEntryExpiryTimestamp`. `getEntryExpiryTimestamp` therefore treats a
  row's own `expiresAt` as authoritative and only falls back to the
  activity-derived window for legacy rows that lack one — see the Dexie section.
  Two consequences to preserve: `mediaCache` is the one table that uses
  `max(stored, activity + 400d)`, because `touchEncCached` moves
  `lastAccessedAt` but never `expiresAt`, so the rolling value is the one that
  keeps hot media alive; and `relayStats` uses its writer's 90-day constant, not
  the 400-day default. If you add a table, wire it to the policy its writer uses.
- **Dexie version bumps do not recreate the cache.** Only changing
  `APP_CACHE_DB_NAME` does. There is no `.upgrade()` and only a single
  `version()` block, so dropped stores/indexes are never removed.
- **Background upload replication poisons latency stats.**
  `recordOriginlessSuccess(server, 0)` writes `latencyMs: 0`, the minimum, so a
  server that wins one background race permanently ranks first.
- **`isOriginlessBanned` is exported but never imported.** Banned servers are
  still attempted by the foreground race.
- **Kind 21004 has no senders.** The full receive path exists in `api.js` and
  `stores/messenger.js`; no component publishes `{type:"typing"}`. Wire it up
  or delete it — do not assume it is live.
- **`call-request` / `call-event` are ephemeral.** They share the `call-` prefix
  in `api.prepareDirectMessage`, so they publish as kind 20004 and are skipped by
  `putRawEvent`. They render in-session and are indexed for search, but do not
  survive a reload from cache.
- **Stream cache helpers hard-code `fresh: false`**, so every list view
  unconditionally refetches from relays on mount.
- **Saves trigger a full relay query first.** The detail views do not pass
  `existingItems`, so every save calls `fetch*` before writing. Offline that
  path throws "Note not found." for notes/passwords and silently creates a
  duplicate bookmark (dedupe is by `id`, not by URL).
- **A service-worker takeover wipes local state.** The `controllerchange`
  handler in `main.js` runs `resetPersistedStateForPwaUpdate()` (deletes the
  IndexedDB database and clears localStorage except `gupt_privkey`), so stream
  data is refetched from relays on every SW update.
- `recordSendTiming` collapses kind to `dm`/`group` only, so stream publishes
  land in `sendTimings` as `kind: "dm"` with a `stream:*` conversation id. The
  Stats view reads accordingly.
- Dead code you can delete freely: `isFresh`, `hydrateMessageText`,
  `indexGroupMessage`, `getAllPeerRelayHints`, the `stagedUploads` branch of
  `getEntryExpiryTimestamp`, the `gupt_vault` tag bucket, `leaveGroup` /
  `deleteGroup`, and `fetchAndDecryptFromSources` / `sortSourcesByPreference`
  (with its unread `rememberSourcePreference` localStorage writes).

## Working in this repo

1. Read the neighboring files first — new code should mirror the existing
   patterns (helpers, naming, error handling).
2. After each edit, bump the npm version with a patch release:
   `npm version patch` (the build stamps `__APP_VERSION__`/`__APP_BUILD_TIME__`).
3. After changes, run `npm run build` to confirm nothing broke.
4. Run `npx oxfmt <changed files>` so formatting matches.
5. Commit with a Conventional Commit message (see below); scope prefixes are
   used but short (e.g. `fix:`, `feat:`, `refactor:`, `style:`, `chore:`,
   `docs:`).

## Commits

Conventional Commits, lowercase subject, short scope:

```
feat: add encrypted Markdown notes stream
fix: route stream publishes through send queue
refactor: share hybrid stream renewal across streams
style: keep bookmark row actions always visible
chore: bump version to 3.0.0
```

## Testing

There is no test suite in this repo (`test/` was removed as bloat).
Verify changes with `npm run build` and manual exercise in `npm run dev`.
