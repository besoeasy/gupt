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
- **Identity** — a secp256k1 keypair derived from a password + PIN via
  Argon2id (memory-hard KDF). The private key never leaves the browser
  (`src/lib/secureKey.js`).
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
  lib/relay/  Nostr pool, publish, subscribe, selection, outcomes
  stores/     Pinia stores (identity, messenger, calls, settings)
  views/      route-level pages
  components/ shared + feature components (chatv2/, settings/, …)
  composables/ shared composables (e.g. useReplicationWorker)
  config/     static config (servers, retention)
  router/     vue-router routes
  sw.js       PWA service worker entry
test/         node --test unit tests (*.test.mjs)
bin/          static server for dist/
flatpak/      Flatpak manifests
```

Module imports use the `@/` alias → `./src/` (see `jsconfig.json`).

## Commands

```sh
npm run dev         # format src/ with oxfmt, then start Vite dev server
npm test            # node --test test/*.test.mjs
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

## UI and layout guidelines

To keep the application uniform across all pages and viewports:

- **Large screens (>= 1024px / desktop)**:
  - All route-level views (`src/views/`) and primary navigation (`AppNavbar`)
    must be constrained to `max-w-6xl` (`72rem` / `1152px`) and horizontally
    centered with `mx-auto`.
  - Split views (Chat, Bookmarks, Notes, Passwords) frame their 2-column
    master-detail layout inside `mx-auto max-w-6xl w-full h-full border-x border-(--app-border)`.
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


## Dexie cache (IndexedDB)

All local persistence goes through one Dexie database, `src/lib/idb.js`:

- DB name `gupt_app_cache_v3`; the Dexie schema version is derived from the
  app version string's leading integer (`__APP_VERSION__`), so a major release
  recreates the cache.
- Tables: `mediaCache`, `roomMeta`, `groups`, `profiles`, `syncCursors`,
  `messageSearch`, `sendTimings`, `relayStats`, `peerRelayHints`, `rawEvents`.
- Every row carries `expiresAt` (TTL). Reads go through `getFresh`-style
  helpers that return `null` and delete the row once it has expired.
- `rawEvents` stores full Nostr events — it backs the bookmark/password/note
  streams and the replication worker. `putRawEvent` upserts by `event.id` and
  preserves `lastReplicatedAt` on re-put; `getRawEventsByOrigin` reads a
  stream's cached events.
- Streams read cache-first, then refresh from relays: the views load with
  `getBookmarksCached`/`fetchBookmarks`, `getNotesCached`/`fetchNotes`, and
  `getPasswordsCached`/`fetchPasswords` (see the stream libs under `src/lib/`).
- `startCacheMaintenance()` purges expired rows on a 6-hour interval; new
  helpers should follow the same `expiresAt` + `getFresh` pattern.

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

## Working in this repo

1. Read the neighboring files first — new code should mirror the existing
   patterns (helpers, naming, error handling).
2. After changes, run `npm test` and `npm run build` to confirm nothing broke.
3. Run `npx oxfmt <changed files>` so formatting matches.
4. Commit with a Conventional Commit message (see below); scope prefixes are
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

## Testing

Add tests in `test/*.test.mjs` using `node --test`. Pure logic (e.g.
`src/lib/streamRenewal.js` normalization/selection helpers) should have unit
tests; keep tests free of browser-only APIs. Name files after the module
under test (`replication.test.mjs`, `webrtc.test.mjs`).
