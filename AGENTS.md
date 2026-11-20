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
