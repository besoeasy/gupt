# Replication Plan — Whole-App Live Sync

## Goal

Keep all of the user's Nostr data alive across many relays by continuously
re-publishing a small random sample of stored events every 15 seconds. This
generalizes the vault live-sync pattern to the rest of the app (DMs, group
messages, group meta) so data survives relay churn, device loss, and time.

## Non-goals

- Replicating anything other than Nostr kinds **1** and **4**. Ephemeral
  events (20004, 21004), delete events (5), and all other kinds are out of
  scope — only kinds 1 and 4 carry durable user data worth keeping alive.
- Re-publishing **ephemeral** events (kinds 20004, 21004) — they are meant to
  be transient; re-publishing defeats the purpose and wastes relay budget.
- Re-publishing events past their `expiration` tag — relays drop them anyway.
- Replacing the existing vault live-sync. Vault already works via re-fetch from
  relays; leave it alone unless we migrate it onto the new `rawEvents` table
  in a later phase.

## Why a new `rawEvents` table (not pure re-fetch)

Dexie currently stores **decrypted payload rows**, not Nostr events. Look at
`parseDirectEvents` in `src/lib/api.js:96`:

- It decrypts `event.content`, builds `{id, sender, text, ts, media, type}`,
  and **drops** `event.sig`, `event.content` (ciphertext), `event.tags`,
  `event.pubkey`.
- `dmMessages` / `groupMessages` hold payload rows. You cannot reconstruct a
  re-publishable Nostr event from them — relays verify signatures, and the
  signature is gone.

Vault live-sync side-steps this by re-`query()`ing relays each tick (vault
uses `localStorage`, not Dexie). That works for vault because it's a single
self-authored filter. For DMs the equivalent would mean per-peer queries
(`authors:[peer], #p:[self]` for every peer) every tick — too heavy.

**Solution:** add a `rawEvents` table to Dexie that stores full signed events
at ingestion time. The replication worker samples directly from it — one
IndexedDB read, no relay round-trip per tick.

## Architecture

```
┌─────────────┐   ingest   ┌─────────────┐   sample    ┌──────────────┐
│ relay sub   │ ─────────> │ rawEvents   │ ──────────> │ replication  │
│ (api.js,    │            │ (Dexie v3)  │             │ worker       │
│  groups.js) │            │             │             │ (15s tick)   │
└─────────────┘            └─────────────┘             └──────┬───────┘
                                                              │ publish
                                                              v
                                                       ┌──────────────┐
                                                       │ 5 random     │
                                                       │ relays       │
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
| Vault items | 4 (`#t:gupt_vault`) | yes | Own data. (Already covered by vault live-sync; optional to migrate.) |
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

In `src/lib/idb.js`, bump to `version(3)`:

```js
this.version(3).stores({
  rawEvents: "&id, pubkey, kind, createdAt, expiresAt, [kind+createdAt]",
});
```

- `&id` — primary key is the Nostr event id (dedupe for free).
- `[kind+createdAt]` — compound index for "give me 5 random kind-4 events
  newer than cutoff" without scanning the whole table.
- `expiresAt` — for purge joining the existing `purgeExpiredCache` loop.

**Storage estimate:** a kind-4 DM event is ~1–4 KB ciphertext + ~200 bytes
overhead. 10k events ≈ 20 MB. Acceptable inside the existing 10 GB cap; the
purge loop will trim it.

## Ingestion hooks

Add `putRawEvent(event)` to `src/lib/idb.js`:

```js
export async function putRawEvent(event) {
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
    createdAt,
    expiresAt,
    event, // full signed object
  });
}
```

Call sites (every place we currently parse + drop the raw event):

- `src/lib/api.js:96` — `parseDirectEvents`: write the event before decrypt.
  Store both self-authored and peer-authored events (a conversation is a
  unit — we need both sides for a complete replicated history).
- `src/lib/api.js:415` — `subscribeAllDirectMessages.next`: write the event
  in the subscription callback, both sides.
- `src/lib/groups.js:148` — group message fetch loop: write every
  member-authored event (skip `event.pubkey === groupId` roster updates if
  we want to handle them separately; otherwise include).
- `src/lib/groups.js` roster sync — write roster events (group-key-authored).
- `src/lib/invites.js:117` — invite fetch query (`kinds: [1, 4]`): write
  the fetched kind-1 and kind-4 events so public invite notes stay alive.
- `src/lib/share.js:218` — `publishShareEvent`: after publishing the kind-1
  share event, also write it into `rawEvents` so the worker can replicate it
  to more relays (the temp keypair means the user owns it).
- `src/lib/vault.js:89` — `fetchVaultItems`: optional, if we want vault on
  the same table. Skip for phase 1; vault already works.

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
| `src/lib/idb.js` | Add `version(3)` with `rawEvents` store. Add `putRawEvent`, `sampleRawEvents`, `listRawEvents` exports. Add `rawEvents` to `purgeExpiredCache` and `clearAllCaches`. |
| `src/lib/api.js` | In `parseDirectEvents` and `subscribeAllDirectMessages.next`, call `putRawEvent(event)` for all DM events (both self- and peer-authored). |
| `src/lib/groups.js` | In the group message fetch loop and roster sync, call `putRawEvent(event)` for member + group-key-authored events. |
| `src/lib/invites.js` | In the invite fetch query (`kinds: [1, 4]`), call `putRawEvent(event)` for fetched kind-1/kind-4 events. |
| `src/lib/share.js` | After `publishShareEvent` publishes the kind-1 share event, call `putRawEvent(event)` so the worker replicates it. |
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

### Phase 4 — Migrate vault onto `rawEvents` (optional cleanup)

- Vault live-sync currently re-queries relays each tick. Optionally switch it
  to sample from `rawEvents` for consistency and to remove the duplicate
  query.
- **Risk:** low, but no urgency. Only do this if the duplication bothers you.

## Testing

- **Unit tests** (`test/replication.test.mjs`): the pure parts —
  `sampleRawEvents` filtering by age + kind, shuffle determinism, the
  scope-gate predicate (which events are eligible).
- **Manual smoke test:**
  1. Send a DM, watch `rawEvents` populate in DevTools → Application →
     IndexedDB → `gupt_app_cache_v3` → `rawEvents`.
  2. Wait 15s, watch network panel for `EVENT` frames going to 5 random
     relays.
  3. Switch tabs — confirm ticks pause while hidden, resume on focus.
  4. Log out — confirm `clearAllCaches` empties `rawEvents` and the worker
     stops.
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
