# AGENTS.md

## Design

- always write custom CSS.
- No Tailwind utilities. When you touch a component that still uses them, replace them with semantic classes and keep the rules in that component's scoped `<style>` block. Add to `src/index.css` only when a rule is genuinely global (theme tokens, shared transitions, resets).
- Classes migrated off Tailwind sit in `@layer gupt-components` (see the layer order line at the top of `src/index.css`), so global rules in that file keep overriding them the way they overrode Tailwind's utilities. Rules you write by hand stay unlayered; keep both conventions per block.
- Write every style for both light and dark mode. Use the `--app-*` and `--ui-*` tokens (or `color-mix` with them) instead of hardcoded colors, and check the screen with the theme switched both ways.
- A translucent tint repeated in more than one component becomes an `--app-*` token in `src/index.css`: the opaque surface as its fallback, redefined as `color-mix` in the shared `@supports (color: color-mix(in lab, red, red))` block after the fallbacks, never a palette `color-mix` written per component. Existing ones: `--app-border-quiet`/`--app-border-faint` (zinc-800 at 80/60%), `--app-surface-tint`/`--app-surface-tint-soft` (zinc-900 at 60/40%), `--app-surface-inset`/`--app-surface-inset-strong` (zinc-950 at 40/60%), `--app-surface-raised-tint`/`--app-surface-raised-tint-soft` (zinc-800 at 80/60%). They need no `[data-theme="light"]` override because they read the remapped `--ui-zinc-*`.
- Light-mode fixes live in the component that owns the class, not in `src/index.css`: `[data-theme="light"] .block__element { … }` right after the rule it corrects, overriding only the declarations the dark palette gets wrong (usually `color`, `background-color`, `border-color`). Overrides that several components share (relay tier badges, Rabta status, the navbar header) belong in `index.css`; everything else stays scoped.
- Animate everything: fade-in on load, hover and touch feedback on all interactive elements.
- Mobile-first and modern. No horizontal scroll, touch targets of at least 44px, no hover-only interactions.

## Logos

- Create every logo ourselves from now on: hand-written SVG, no external logo packages, stock art, or CDN/hotlinked images.
- Reuse the existing G-mark geometry (see `public/favicon.svg` and the inline mark in `WelcomeView.vue`) for new sizes/variants instead of redrawing it.
- Store shareable files in `public/` (`favicon.svg`, `pwa-*.svg`, `apple-touch-icon.svg`, `social-banner.svg`); inline small UI marks with `currentColor` so they follow the theme.
- Keep SVGs self-contained with no external fonts or images: standalone files get `role="img"` plus `<title>`/aria-label, decorative inline copies get `aria-hidden="true"`.

## Avatars

- Generated faces come from `src/lib/avatar.js`: a mirrored 5×5 grid hashed from the seed, rendered as a `data:image/svg+xml` URI. No dependency, no request — the seed is a public key, so fetching a face from anywhere would hand a third party the contact graph.
- The algorithm is frozen. A changed grid, bit order or palette repaints every face in every address book, so treat it like a protocol version, not styling: `test/avatars.test.js` pins the output with digests, and regenerating those is a deliberate release decision.
- Keep the URI small (a few hundred bytes, half of what a bitmap or a generated blob costs). Gradients, filters, embedded fonts and per-cell rounded geometry all blow it up; the plain plate-plus-cells form is the point.

## Navigation

- No back buttons or back elements on Vue routes that show the navbar.
- Add a back button only on routes where the navbar is hidden.

## Components

- Split into a new component (PascalCase, one per file, in `components/`) when a file passes ~500 lines, markup or logic repeats, or a block has its own state.
- Use props instead of copy-pasted variants.
- Move complex logic into composables or helpers.
- Extracted components keep all Design rules.
- Don't split simple one-off markup.

## IndexedDB

- The cache database is disposable: relays are the source of truth.
- The cache database name is derived from `STORE_SPECS` (`schemaFingerprintOf`), so there is no epoch to bump: change the layout and the next load opens a fresh database, then sweeps the old one. The fingerprint is order-insensitive, so reordering declarations does not discard anyone's cache.
- Never hardcode `gupt_cache_*` names or read `STORE_SPECS` from app code; the layout belongs to `src/lib/idb.js` and `test/schema-name.test.js` guards the derivation.
- Never write a migration, `DB_VERSION`, or upgrade reconciliation code. Old `gupt_cache_*` databases are swept on boot.
- Unsent self-authored events live in the `gupt_outbox_v1` localStorage queue, never in IndexedDB only.

## Versioning & compatibility

- `package.json` `version` is a calendar version, `YYYY.MMDD.N`: the UTC release date plus that day's release counter, starting at 1 — `2026.1120.1`, `2026.1120.4`, `2026.105.2` (Jan 5). The month is unpadded because a leading zero is invalid semver; the day is padded. Bump it in the release commit, keep `package-lock.json` in step, and increment `N` for every further release that day.
- **Support window: 400 days.** Every build must keep working for a client built at any point in the last 400 days, and every client must keep working against a relay up to 400 days old. The numbers live in `src/config/compat.js`: `RETENTION_DAYS` (366), `COMPAT_MIN_SLACK_DAYS` (30), the derived `MIN_SUPPORTED_DAYS` (396) and `COMPAT_WINDOW_DAYS` (400). Change them there and nowhere else — `test/compat.test.js` fails if the window drops below retention plus slack, or if the README stops stating the live numbers.
- Breaking, and needing the whole window: the event envelope (ciphertext `v1` / `v`, `RABTA_VERSION`, sealed payload fields, blob part format), event `type` and tags, the secret+PIN key and address derivation, the `gupt_vault_v1` record shape (`v`), `gupt_outbox_v1` entries, localStorage keys, and the relay `api_version`.
- Not breaking: the `gupt_cache_*` IndexedDB. It is disposable and refetched from relays, so `SCHEMA_EPOCH` may bump in any release.
- Deprecate in three steps: read both formats while writing the new one, note it in the release notes, then drop the old read path once `COMPAT_WINDOW_DAYS` has passed since the last build that wrote it.
- Every shim is a migration with an expiry date — no permanent shims, no "keep for safety", no undated TODO. Tag the old path in the same commit that introduces it:
  `// COMPAT: remove after YYYY-MM-DD — <old format + why it exists>`
  Date = last build that wrote the old format + `COMPAT_WINDOW_DAYS` (400 days). Find them all with `grep -rn "COMPAT: remove after" src`.
- When the date passes, delete the old branch and its tag in the next release. Do not extend; if the old format is still in the wild, that is a new 400-day window with a new date and a release-note entry.
- Counts as a migration: dual readers, legacy field fallbacks (e.g. `ttlHours`), old ciphertext envelopes, old vault/outbox shapes, renamed localStorage keys. The `gupt_cache_*` IndexedDB is exempt — it never migrates, it bumps `SCHEMA_EPOCH`.
- Additive changes need no shim, but readers must skip what they do not know — a new event `type`, an unknown payload field, a newer ciphertext `v` — instead of throwing.
- The window covers the sign-in path, not the remembered device: `VAULT_TTL_MAX_MS` stays at 3 days, so returning after months means the secret phrase and PIN. Keep that path working with any secret generated inside the window.
- Protocol versions (`RABTA_VERSION`, the vault record `v`, the ciphertext envelope) stay independent integers. Never let them follow the calendar or the app version: the 400-day promise is about those numbers, not the release label.
- Every stored item carries its writer: `src/lib/writerVersion.js` stamps `w` (the CalVer release) onto vault records in `save()` and onto all event `data` in `finalizeEvent` — the single choke point, covering DMs, groups, feed, passwords, notes, bookmarks, invites, profiles and receipts. New stored shapes go through the same two paths; never invent a second stamp.
- `w` is metadata, never a readability gate. Readers must not accept or reject on it; the protocol integers decide readability. Use `isWrittenBefore()` only to pick migration paths — each migration still needs its own `// COMPAT: remove after …` tag and 400-day expiry.
- The stamp is coarse by design: release only, never a commit hash or timestamp. It sits plaintext on relays next to already-plaintext nonces and labels, so it adds no meaningful fingerprint beyond what relays already see.
- **Read-repair: an older item is moved to the current version the moment a reader detects it.** Detection is `isWrittenBefore(item, WRITER_VERSION)` (a missing `w` counts as old); the repair is a rewrite through the same write path that owns the item, in the same read, before the value is returned. `keyVault.open()` (ttl normalization + stamp backfill), `readOutboxBox()` and `loadPersisted()` in `stores/settings.js` are the pattern to copy.
- Never park an old shape in storage for a batch job, a background sweep or "a future release". If a reader can see it, that reader upgrades it.
- Repair scope: everything this device owns — vault records, the outbox, localStorage settings and queues, cache rows. Signed relay events are immutable: a self-authored event is re-published in the current shape at its next write (edit, pin, re-save), and everyone else's stays read-only until retention expires it.
- Read-repair does not replace the `// COMPAT: remove after …` tag. The tag covers items this build cannot repair — another device, an older relay, an immutable event still inside the window — while repair drains the ones it can. Keep both.
- Backfilling a missing field (`record.x = record.x ?? …`) next to the existing write is not a migration and needs no tag. Changing what a field means is a migration: dual-read, tag, 400 days.
- **GUPT has not shipped its first release yet.** There is no legacy data in the wild, so never write a shim for a pre-deploy shape — no `ttlHours` fallback, no "old key name" branch, no reader for a format that only ever existed on a developer's machine. The first deployment starts both clock duties: the 400-day window and read-repair.
- Key-versioned localStorage names (`…:v1`) are not a substitute for a payload header: renaming the key to add a field throws the user's data away. Keep the key stable and version the payload with `v` + `w` (`src/lib/storedMap.js` for map-shaped stores).
- The app does not display the version. Settings shows only the build date (`__APP_BUILD_TIME__`). `__APP_VERSION__` exists build-time only, feeding the writer stamp in `src/lib/writerVersion.js` — never render it.
