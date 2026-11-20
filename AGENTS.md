# AGENTS.md

## Design

- always write custom CSS.
- No Tailwind utilities. When you touch a component that still uses them, replace them with semantic classes and keep the rules in that component's scoped `<style>` block. Add to `src/index.css` only when a rule is genuinely global (theme tokens, shared transitions, resets).
- Classes migrated off Tailwind sit in `@layer gupt-components` (see the layer order line at the top of `src/index.css`), so global rules in that file keep overriding them the way they overrode Tailwind's utilities. Rules you write by hand stay unlayered; keep both conventions per block.
- Write every style for both light and dark mode. Use the `--app-*` and `--ui-*` tokens (or `color-mix` with them) instead of hardcoded colors, and check the screen with the theme switched both ways.
- Light-mode fixes live in the component that owns the class, not in `src/index.css`: `[data-theme="light"] .block__element { … }` right after the rule it corrects, overriding only the declarations the dark palette gets wrong (usually `color`, `background-color`, `border-color`). Overrides that several components share (relay tier badges, Rabta status, the navbar header) belong in `index.css`; everything else stays scoped.
- Animate everything: fade-in on load, hover and touch feedback on all interactive elements.
- Mobile-first and modern. No horizontal scroll, touch targets of at least 44px, no hover-only interactions.

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
