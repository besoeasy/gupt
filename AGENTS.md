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
- Any `STORE_SPECS` change in `src/lib/idb.js` ⇒ bump `SCHEMA_EPOCH`, which opens a brand-new database name.
- Never write a migration, `DB_VERSION`, or upgrade reconciliation code. Old `gupt_cache_*` databases are swept on boot.
- Unsent self-authored events live in the `gupt_outbox_v1` localStorage queue, never in IndexedDB only.

## Versioning & compatibility

- `package.json` `version` is a calendar version, `YYYY.MMDD.N`: the UTC release date plus that day's release counter, starting at 1 — `2026.1120.1`, `2026.1120.4`, `2026.105.2` (Jan 5). The month is unpadded because a leading zero is invalid semver; the day is padded. Bump it in the release commit, keep `package-lock.json` in step, and increment `N` for every further release that day.
- **Support window: 400 days.** Every build must keep working for a client built at any point in the last 400 days, and every client must keep working against a relay up to 400 days old. Relays retain events for `RETENTION_DAYS = 366` (`src/config/retention.js`) and the per-chat timer caps at 366 days, so 400 leaves ~34 days to ship a deprecation before the oldest supported client begins losing data.
- Breaking, and needing the whole window: the event envelope (ciphertext `v1` / `v`, `RABTA_VERSION`, sealed payload fields, blob part format), event `type` and tags, the secret+PIN key and address derivation, the `gupt_vault_v1` record shape (`v`), `gupt_outbox_v1` entries, localStorage keys, and the relay `api_version`.
- Not breaking: the `gupt_cache_*` IndexedDB. It is disposable and refetched from relays, so `SCHEMA_EPOCH` may bump in any release.
- Deprecate in three steps: read both formats while writing the new one, note it in the release notes, then drop the old read path once 400 days have passed since the last build that wrote it. Mark every shim `// COMPAT: remove after YYYY-MM-DD — <why>`.
- Additive changes need no shim, but readers must skip what they do not know — a new event `type`, an unknown payload field, a newer ciphertext `v` — instead of throwing.
- The window covers the sign-in path, not the remembered device: `VAULT_TTL_MAX_MS` stays at 3 days, so returning after months means the secret phrase and PIN. Keep that path working with any secret generated inside the window.
- Protocol versions (`RABTA_VERSION`, the vault record `v`, the ciphertext envelope) stay independent integers. Never let them follow the calendar or the app version: the 400-day promise is about those numbers, not the release label.
