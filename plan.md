# Replication Plan — Whole-App Live Sync

## Goal

Two things at once:

1. **Keep all of the user's Nostr data alive** across many relays by
   continuously re-publishing a small random sample of stored events every
   15 seconds. Generalizes the vault live-sync pattern to DMs, group
   messages, group meta, share links, and invites so data survives relay
   churn, device loss, and time.
2. **Consolidate storage onto a single `rawEvents` Dexie table.** Today the
   app splits user data across `dmMessages`, `groupMessages`, a vault
   `localStorage` cache, and separate read paths. Decryption is cheap
   (hardware-accelerated AES-GCM; ECDH shared secret cached per-peer), so
   we store full signed events once and decrypt on read. One source of
   truth, one replication path, one purge loop.

## Non-goals

- Replicating anything other than Nostr kinds **1** and **4**. Ephemeral
  events (20004, 21004), delete events (5), and all other kinds are out of
  scope — only kinds 1 and 4 carry durable user data worth keeping alive.
- Re-publishing **ephemeral** events (kinds 20004, 21004) — they are meant to
  be transient; re-publishing defeats the purpose and wastes relay budget.
- Re-publishing events past their `expiration` tag — relays drop them anyway.

## Why one `rawEvents` table replaces `dmMessages`, `groupMessages`, and the vault localStorage cache

Today the app splits user data across three storage systems:

1. **`dmMessages` / `groupMessages` (Dexie)** — decrypted payload rows
   (`{id, roomId, text, sender, ts, media, type}`). Built by
   `parseDirectEvents` at `src/lib/api.js:96`, which decrypts `event.content`
   and **drops** `event.sig`, `event.content` (ciphertext), `event.tags`,
   `event.pubkey`. Not re-publishable — relays verify signatures.
2. **Vault cache (`localStorage`)** — slim encrypted event objects under
   `vault_cache_<pubkey>`. ~5 MB cap, synchronous I/O, silent quota failure.
3. **No storage at all** for kind-1 share/invite events — fetched from
   relays, used once, thrown away.

This means three read paths, three purge paths, and no replication path for
anything except vault (which has its own private `liveSyncTick` that
re-queries relays every 15s).

**Solution: collapse onto `rawEvents`.** Store full signed Nostr events
once, indexed for both chat-view reads (`[roomId+ts]`, `[groupId+ts]`) and
replication sampling (`[kind+createdAt]`). Decrypt on read.

Decryption is cheap enough to do this:

- `decryptDm` (`src/lib/crypto.js:116`) does two things: ECDH shared-secret
  derivation (~1-5ms, **per-peer not per-message** — cache it in a
  `Map<peerPubkey, CryptoKey>`) + AES-GCM decrypt (~0.1-1ms, hardware
  accelerated via `crypto.subtle`, parallelizable).
- 1000 messages in a room = 1 ECDH + 1000 AES-GCM decrypts ≈ 100-500ms on
  desktop, 1-3s on low-end mobile. Mitigated by an in-memory LRU of
  decrypted payloads keyed by event id, so re-renders are free.
- `dmRoomId` (`src/lib/crypto.js:90`) is `sha256(sort([a,b]).join())` — no
  decryption needed to compute room membership. So we can store `peerPubkey`
  + `roomId` directly on the `rawEvents` row at ingestion and keep room
  queries indexed, not scanned.

What stays separate (derived/optimized tables, not raw event storage):

| Table | Keep | Why |
|---|---|---|
| `messageSearch` | yes | Full-text search needs tokenized `*tokens` index. Can't decrypt 10k events per keystroke. Already a derived table. |
| `roomMeta` / `groups` | yes | Conversation-list metadata (last message preview, unread count, `lastSeenTs`). View state, not message storage. |
| `encMedia` / `decMedia` / `stagedUploads` | yes | Binary media, separate concern. |
| `profiles` / `syncCursors` / `sendTimings` / `relayStats` / `peerRelayHints` | yes | Bookkeeping tables, not user data. |
| `dmMessages` / `groupMessages` | **drop** | Replaced by `rawEvents` with `[roomId+ts]` / `[groupId+ts]` indexes + decrypt-on-read. |
| `vault_cache_*` (localStorage) | **drop** | Replaced by `rawEvents` with `origin: "vault"`. |

## Architecture

```
┌─────────────┐   ingest   ┌─────────────┐   sample    ┌──────────────┐
│ relay sub   │ ─────────> │ rawEvents   │ ──────────> │ replication  │
│ (api.js,    │            │ (Dexie v3,  │             │ worker       │
│  groups.js, │            │  sole store │             │ (15s tick)   │
│  vault.js,  │            │  for kind-  │             │              │
│  invites,   │            │  1/4 user   │             │              │
│  share)     │            │  data)      │             │              │
└─────────────┘            └──────┬──────┘             └──────┬───────┘
                                  │ read                      │ publish
                                  │ (decrypt-on-read)         v
                                  v                    ┌──────────────┐
                          ┌──────────────┐            │ 5 random     │
                          │ chat views,  │            │ relays       │
                          │ vault view   │            └──────────────┘
                          └──────────────┘
```

Three pieces:

1. **`rawEvents` Dexie table** — full signed event objects, indexed for
   efficient random sampling + age filtering.
2. **Ingestion hooks** — write the raw event into `rawEvents` at every point
   we currently parse + drop it.
3. **Replication worker** — global, idle, visibility-aware 15s loop that
   samples 5 random events × 5 random relays and re-publishes.

## Scope: what gets replicated

Only Nostr kinds **1** (text notes) and **4** (encrypted DMs) — the kinds
that carry durable user data. Everything else is out of scope.

| Event type | Kind | Replicate? | Reason |
|---|---|---|---|
| Vault items | 4 (`#t:gupt_vault`) | yes | Own data. Migrated onto `rawEvents` in Phase 4 — no separate vault live-sync. |
| Self-authored DMs | 4 (`pubkey===self`) | yes | Own data. |
| Peer-only DMs | 4 (from others, not to a group) | yes | A conversation is a unit — half a thread isn't useful resilience. Re-publish both sides so a fresh device sees the complete history. |
| Group messages | 4 (`#p:[groupId]`, member-authored) | yes | You're a member, you have a stake in the group's survival. |
| Group roster/meta | 4 (from group key itself) | yes | Group's own metadata. |
| Public notes / share links | 1 | yes | Durable public data the user published or fetched (invites, secure-share links). |
| Ephemeral WebRTC signaling | 20004 | **no** | Meant to be transient. |
| Typing indicators | 21004 | **no** | Meant to be transient. |
| Delete events | 5 | **no** | Out of scope — only kinds 1 and 4 are replicated. |
| Events with past `expiration` tag | any | **no** | Relays drop them anyway. |

## Age window

- **Default:** 100 days, matching `RETENTION_DAYS` in `src/config/retention.js`.
- **Vault:** unbounded (vault has no expiry by design).
- **Implementation:** filter at sample time, not at storage time — keep the
  raw event around longer than the age window so we don't lose the signature
  prematurely. Sample only events with `created_at` within the window.

## Schema migration

Two-step migration in `src/lib/idb.js`:

### `version(3)` — add `rawEvents`

```js
this.version(3).stores({
  rawEvents:
    "&id, pubkey, kind, origin, peerPubkey, roomId, groupId, type, createdAt, expiresAt, [kind+createdAt], [kind+origin+createdAt], [roomId+ts], [groupId+ts]",
});
```

The other 13 tables carry forward unchanged. `rawEvents` is added alongside
`dmMessages` / `groupMessages` so the migration is non-destructive — both
old and new code paths work during rollout.

### `version(4)` — drop `dmMessages` and `groupMessages`

```js
this.version(4).stores({
  dmMessages: null, // drop
  groupMessages: null, // drop
});
```

Once all read paths have moved to `rawEvents` (Phase 5), the old payload
tables are dropped. Existing rows are abandoned — IndexedDB frees the space
automatically when a store is removed. No data loss because `rawEvents`
already holds the full signed events by this point.

### Index reference

- `&id` — primary key is the Nostr event id (dedupe for free).
- `[kind+createdAt]` — replication worker: "5 random kind-1/4 events newer
  than cutoff."
- `[kind+origin+createdAt]` — origin-scoped reads: vault view
  (`origin="vault"`), origin-aware sampling.
- `[roomId+ts]` — replaces `dmMessages`'s `[roomId+ts]`. Chat view reads:
  `db.rawEvents.where("[roomId+ts]").between([roomId, min], [roomId, max])`.
- `[groupId+ts]` — replaces `groupMessages`'s `[groupId+ts]`. Group chat
  view reads, same pattern.
- `peerPubkey`, `roomId`, `groupId`, `type`, `origin` — single-value
  indexes for filtering without compound scans.
- `expiresAt` — purge joining the existing `purgeExpiredCache` loop.

### Denormalized fields

The chat read path needs `roomId`, `groupId`, `peerPubkey`, and `type`
without decrypting. These are computed at ingestion time (we have the
plaintext + tags right there) and stored on the `rawEvents` row:

| Field | Source | Example |
|---|---|---|
| `origin` | call-site constant | `"dm"`, `"vault"`, `"group"`, `"group-roster"`, `"share"`, `"invite"` |
| `peerPubkey` | the counterparty pubkey (from `parseDirectEvents`'s `resolveCounterparty`) | `"abc…123"` |
| `roomId` | `dmRoomId(self, peer)` — a sha256, no decrypt needed | `"def…456"` |
| `groupId` | the `#p` tag target for group messages, else `null` | `"ghi…789"` |
| `type` | `payload.type` from the decrypted plaintext | `"text"`, `"media"`, `"call-event"` |

The full signed event (including ciphertext `content` + `sig`) is stored
under the `event` field. Decrypt-on-read uses `decryptDm(privkey, peerPubkey, event.content)`.

The `origin` field is a short string set at ingestion time so we can tell
apart kind-4 subtypes (vault vs DM vs group) and kind-1 subtypes (share vs
invite) without re-parsing `event.tags` at read time. Values:

| `origin` | Set by | Meaning |
|---|---|---|
| `"vault"` | `vault.js` | Vault items (`#t:gupt_vault`) |
| `"dm"` | `api.js` | Direct messages |
| `"group"` | `groups.js` | Group messages |
| `"group-roster"` | `groups.js` | Group roster/meta (group-key-authored) |
| `"share"` | `share.js` | Secure-share public notes (kind 1) |
| `"invite"` | `invites.js` | Invite public notes (kind 1) |

**Storage estimate:** a kind-4 DM event is ~1–4 KB ciphertext + ~200 bytes
overhead. 10k events ≈ 20 MB. Acceptable inside the existing 10 GB cap; the
purge loop will trim it.

## Ingestion hooks

Add `putRawEvent(event, origin)` to `src/lib/idb.js`:

```js
export async function putRawEvent(event, origin = "dm") {
  if (!event?.id) return;
  const createdAt = toNumber(event.created_at, 0) * 1000;
  const expiryTag = event.tags?.find((t) => t[0] === "expiration");
  const expiresAt = expiryTag
    ? Number(expiryTag[1]) * 1000
    : createdAt + RAW_EVENT_RETENTION_MS;
  await db.rawEvents.put({
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    origin,
    createdAt,
    expiresAt,
    event, // full signed object
  });
}
```

Call sites (every place we currently parse + drop the raw event). Each
passes the `origin` string so the worker and vault can filter by it:

- `src/lib/api.js:96` — `parseDirectEvents`: `putRawEvent(event, "dm")`.
  Store both self-authored and peer-authored events (a conversation is a
  unit — we need both sides for a complete replicated history).
- `src/lib/api.js:415` — `subscribeAllDirectMessages.next`:
  `putRawEvent(event, "dm")` in the subscription callback, both sides.
- `src/lib/groups.js:148` — group message fetch loop:
  `putRawEvent(event, "group")` for every member-authored event.
- `src/lib/groups.js` roster sync — `putRawEvent(event, "group-roster")`
  for roster events (group-key-authored).
- `src/lib/invites.js:117` — invite fetch query (`kinds: [1, 4]`):
  `putRawEvent(event, "invite")` for fetched kind-1/kind-4 events so public
  invite notes stay alive.
- `src/lib/share.js:218` — `publishShareEvent`: after publishing the kind-1
  share event, `putRawEvent(event, "share")` so the worker can replicate it
  to more relays (the temp keypair means the user owns it).
- `src/lib/vault.js:89` — `fetchVaultItems`: `putRawEvent(event, "vault")`
  for every fetched vault event. This replaces `writeVaultCache` (see
  Phase 4 for the full localStorage → Dexie migration).

Add `purgeExpiredEntriesForTable("rawEvents")` to `purgeExpiredCache` in
`src/lib/idb.js:502`.

## Replication worker

New files:

- `src/lib/replication.js` — `replicationTick(identity)` pure function.
- `src/composables/useReplicationWorker.js` — lifecycle wrapper.

### `replicationTick(identity)`

```js
const SAMPLE_SIZE = 5;
const RELAY_SAMPLE = 5;
const PUBLISH_MAX_WAIT = 6000;
const AGE_WINDOW_MS = 100 * 24 * 60 * 60 * 1000; // matches RETENTION_DAYS
const REPLICATABLE_KINDS = [1, 4];

export async function replicationTick(identity) {
  const cutoff = Date.now() - AGE_WINDOW_MS;
  // 5 random kind-1/kind-4 events newer than cutoff
  const candidates = await sampleRawEvents({
    kinds: REPLICATABLE_KINDS,
    minCreatedAt: cutoff,
    limit: 50,
  });
  if (!candidates.length) return { published: 0, errors: 0, sampled: 0 };

  const sample = shuffle(candidates).slice(0, Math.min(SAMPLE_SIZE, candidates.length));
  const relays = shuffle(getKnownRelays()).slice(0, RELAY_SAMPLE);
  if (!relays.length) return { published: 0, errors: 0, sampled: sample.length };

  let published = 0, errors = 0;
  for (const row of sample) {
    try {
      const res = await publishToRelays(relays, row.event, PUBLISH_MAX_WAIT);
      const ok = Object.values(res).filter((r) => r.ok).length;
      published += ok;
      errors += relays.length - ok;
    } catch {
      errors += relays.length;
    }
  }
  return { published, errors, sampled: sample.length };
}
```

`sampleRawEvents` lives in `idb.js`. Dexie's `anyOf()` handles the kind
array against the compound `[kind+createdAt]` index:

```js
export async function sampleRawEvents({ kinds, minCreatedAt, limit = 50 }) {
  const kindList = Array.isArray(kinds) ? kinds : [kinds];
  const rows = await db.rawEvents
    .where("[kind+createdAt]")
    .between([Math.min(...kindList), minCreatedAt], [Math.max(...kindList), Dexie.maxKey])
    .and((row) => kindList.includes(row.kind))
    .toArray();
  // Dexie doesn't have SQL-style RANDOM(); load up to `limit` and shuffle in JS.
  return shuffle(rows).slice(0, limit);
}

export async function getRawEventsByOrigin(origin, { minCreatedAt = 0 } = {}) {
  return db.rawEvents
    .where("[kind+origin+createdAt]")
    .between([Dexie.minKey, origin, minCreatedAt], [Dexie.maxKey, origin, Dexie.maxKey])
    .and((row) => row.origin === origin)
    .toArray();
}
```

### `useReplicationWorker.js`

Mirror `useVaultLiveSync.js` structure:

- Module-singleton state (`active`, `lastTickAt`, `published`, `errors`).
- `startWorker(identity)` — run one tick immediately, then `setInterval(15s)`.
- Skip ticks while `document.hidden`.
- Resume with an immediate tick on `visibilitychange`.
- `onUnmounted(stopWorker)` — but the worker should outlive any single view;
  see "Lifecycle" below.

### Lifecycle: where to start the worker

The worker is **global**, not tied to the vault page. Start it from
`src/App.vue` after `startAppSync(identity)` succeeds, alongside the existing
`startAppSync` call at `src/App.vue:76`. Stop it on identity change / logout
(in `appReset.js`).

UI: subtle "Replicating" pulse in `App.vue` (similar to the vault indicator),
or no UI at all for phase 1. Decision in open questions.

## File-by-file change list

| File | Change |
|---|---|
| `src/lib/idb.js` | Add `version(3)` with `rawEvents` store (incl. `origin` + `[kind+origin+createdAt]` index). Add `putRawEvent(event, origin)`, `sampleRawEvents`, `getRawEventsByOrigin` exports. Add `rawEvents` to `purgeExpiredCache` and `clearAllCaches`. |
| `src/lib/api.js` | In `parseDirectEvents` and `subscribeAllDirectMessages.next`, call `putRawEvent(event, "dm")` for all DM events (both self- and peer-authored). |
| `src/lib/groups.js` | In the group message fetch loop, call `putRawEvent(event, "group")`. In roster sync, call `putRawEvent(event, "group-roster")`. |
| `src/lib/invites.js` | In the invite fetch query (`kinds: [1, 4]`), call `putRawEvent(event, "invite")` for fetched events. |
| `src/lib/share.js` | After `publishShareEvent` publishes the kind-1 share event, call `putRawEvent(event, "share")`. |
| `src/lib/vault.js` | Phase 4: replace `readVaultCache`/`writeVaultCache`/`invalidateVaultCache` with Dexie queries via `getRawEventsByOrigin("vault")`. `fetchVaultItems` calls `putRawEvent(event, "vault")`. Delete `liveSyncTick`, `LIVE_SYNC_*` constants, `shuffle`, all localStorage cache helpers. |
| `src/composables/useVaultLiveSync.js` | Phase 4: **deleted** — the replication worker handles vault re-publishing. |
| `src/views/VaultView.vue` | Phase 4: remove `useVaultLiveSync` import, `startLiveSync` call, and the live-sync pulse UI. |
| `src/lib/replication.js` | New. `replicationTick(identity)` + helpers. |
| `src/composables/useReplicationWorker.js` | New. Lifecycle wrapper, 15s interval, visibility-aware. |
| `src/App.vue` | Start the worker after `startAppSync`; stop on identity change. |
| `src/lib/appReset.js` | Call `stopReplicationWorker()` in the reset path. |
| `test/replication.test.mjs` | New. Unit tests for the pure sampling/filtering logic. |

## Rollout phases

### Phase 1 — All DMs + public notes (kinds 1 and 4)

- Add `rawEvents` table + ingestion in `api.js` for **all** DM events
  (self-authored and peer-authored).
- Add ingestion in `invites.js` and `share.js` for kind-1 public notes /
  share links.
- Add `replicationTick` + `useReplicationWorker` (samples kinds 1 and 4).
- Start from `App.vue`.
- No UI, or a single "Replicating" pulse.
- **Rationale:** a conversation is a unit. Re-publishing only your own
  messages leaves the other half of the thread missing on a fresh device,
  so the history looks incomplete. Replicate both sides. Kind-1 public
  notes (share links, invites) are also durable user data worth keeping
  alive across relays.

### Phase 2 — Group messages

- Add ingestion hooks in `groups.js` for member-authored group messages.
- No worker change needed — it already samples all kind-4 events.
- **Risk:** low. You're a group member; re-publishing group messages you
  can already decrypt is defensible.

### Phase 3 — Group roster/meta

- Ingest group-key-authored roster events.
- **Risk:** low. Group metadata is the group's own data.

### Phase 4 — Migrate vault from localStorage onto `rawEvents`

The vault is the **last piece of user data still in `localStorage`**.
Everything else already lives in Dexie. This phase moves vault storage onto
`rawEvents` and deletes the vault-specific live-sync, leaving one unified
storage + replication path for the whole app.

#### Why migrate

The current vault cache (`src/lib/vault.js:8-50`) has three problems:

1. **localStorage is ~5 MB per origin.** A vault with a few hundred items
   can hit this — `writeVaultCache` silently fails (`catch {}` on line 42)
   and the user gets no indication their cache stopped working. Dexie has
   no such limit (the app already caps at 10 GB via `purgeOversizeCache`).
2. **localStorage is synchronous.** `JSON.parse` / `JSON.stringify` on a
   large cache blocks the main thread on every vault page open. Dexie is
   async.
3. **Two replication paths.** Vault has its own `liveSyncTick` +
   `useVaultLiveSync.js` + a pulse UI in `VaultView.vue`. The replication
   worker already re-publishes kind-4 events — keeping a separate vault
   live-sync is duplicate code and duplicate relay traffic.

#### What changes in `src/lib/vault.js`

| Current | After migration |
|---|---|
| `readVaultCache` / `writeVaultCache` / `invalidateVaultCache` / `getCacheKey` | **Deleted.** Replaced by Dexie queries on `rawEvents` filtered to `origin: "vault"`. |
| `CACHE_TTL_MS` (5 min) | **Deleted.** Freshness is handled by `fetchVaultItems` querying relays on mount, same as before — just the cache read switches from localStorage to Dexie. |
| `getVaultCachedItems(privkeyHex, pubkeyHex)` | Reads from `rawEvents`: `db.rawEvents.where("origin").equals("vault").toArray()`, then runs the existing `decryptEvents` on the full event objects. Returns `{ items, fresh }` with `fresh` based on the newest `createdAt` vs a staleness threshold. |
| `fetchVaultItems(privkeyHex, pubkeyHex)` | Queries relays (unchanged), then calls `putRawEvent(event, "vault")` for each result instead of `writeVaultCache`. |
| `saveVaultItem` / `deleteVaultItem` | No longer call `invalidateVaultCache` — Dexie is the source of truth, and new events arrive via ingestion. `saveVaultItem` publishes to relays (unchanged); the subscription echo writes to `rawEvents` automatically. |
| `liveSyncTick` | **Deleted.** The replication worker handles re-publishing vault events to random relays. |
| `shuffle` helper | **Deleted** (no longer needed in `vault.js`; the worker has its own). |

#### What gets deleted entirely

- `src/lib/vault.js`: `liveSyncTick`, `LIVE_SYNC_*` constants, `shuffle`,
  `readVaultCache`, `writeVaultCache`, `invalidateVaultCache`, `getCacheKey`,
  `CACHE_TTL_MS`.
- `src/composables/useVaultLiveSync.js` — **whole file deleted.**
- `src/views/VaultView.vue`: the `useVaultLiveSync` import, the
  `startLiveSync` call in `onMounted`, and the live-sync pulse UI. The
  replication worker started in `App.vue` handles vault replication
  globally.

#### New vault read helper in `src/lib/idb.js`

```js
export async function getRawEventsByOrigin(origin, { minCreatedAt = 0 } = {}) {
  return db.rawEvents
    .where("[kind+origin+createdAt]")
    .between([Dexie.minKey, origin, minCreatedAt], [Dexie.maxKey, origin, Dexie.maxKey])
    .and((row) => row.origin === origin)
    .toArray();
}
```

`getVaultCachedItems` calls this with `origin: "vault"` and feeds the
results (full signed events) into the existing `decryptEvents` function.

#### Migration / backfill

On first load after the upgrade, `getVaultCachedItems` will return `null`
(no `rawEvents` rows yet). `VaultView.vue` already handles this — it falls
through to `fetchVaultItems` which queries relays and populates `rawEvents`
via `putRawEvent`. The old localStorage cache is simply abandoned (one stale
key per pubkey; harmless, gets cleaned up by a future `localStorage`
prune or browser storage eviction).

No explicit data migration step is needed.

- **Risk:** low. Vault reads become Dexie queries (slightly different
  timing, same data). Vault replication is handled by the worker (same
  5×5 random re-publish, just not vault-specific). The only behavior
  change is no per-tick relay re-query for vault — the worker samples from
  `rawEvents` instead, which is cheaper.

## Testing

- **Unit tests** (`test/replication.test.mjs`): the pure parts —
  `sampleRawEvents` filtering by age + kind, `getRawEventsByOrigin` filtering
  by origin, shuffle determinism, the scope-gate predicate (which events are
  eligible).
- **Manual smoke test:**
  1. Send a DM, watch `rawEvents` populate in DevTools → Application →
     IndexedDB → `gupt_app_cache_v3` → `rawEvents` with `origin: "dm"`.
  2. Wait 15s, watch network panel for `EVENT` frames going to 5 random
     relays.
  3. Switch tabs — confirm ticks pause while hidden, resume on focus.
  4. Log out — confirm `clearAllCaches` empties `rawEvents` and the worker
     stops.
  5. **Phase 4:** open vault page — confirm items load from `rawEvents`
     (no `vault_cache_*` key in localStorage). Create a vault item — confirm
     it appears in `rawEvents` with `origin: "vault"`. Confirm the old
     `useVaultLiveSync` pulse is gone and the replication worker is
     re-publishing vault events.
- **Lint/typecheck:** `npm run build && npm test` (this sandbox has no node
  on PATH; run locally).

## Open questions / decisions

1. **UI visibility:** silent, or a small global "Replicating" indicator?
   Lean silent for phase 1; add an indicator if users ask.
2. **Backoff on errors:** if a tick has >80% publish failures, should we
   back off the interval (e.g. 60s) until things recover? Lean yes — adds
   one line of state in the composable.
3. **Bandwidth budget:** 5 events × 5 relays × ~3 KB ≈ 75 KB per tick ≈
   ~300 KB/min. Fine for desktop; on mobile consider dropping to 3×3 when
   `navigator.connection.saveData` is true.
4. **rawEvents retention:** keep events longer than the 100-day sample
   window so we don't lose signatures early? Lean yes — store with a longer
   `expiresAt` (e.g. 200 days) but only sample from the last 100.
