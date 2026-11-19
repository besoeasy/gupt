# AGENTS.md

## Design

- Use Tailwind CSS, not custom CSS.
- Use SVG icons.
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
