# GUPT — Copilot Instructions

## General coding rules

- **Always use the latest stable version** of any package or API already in the project. Check `package.json` for the installed version and read the actual source in `node_modules` (or fetch the official docs/changelog) before writing any API calls — do not assume method signatures from memory.
- **Research before coding.** When working with a library (e.g. `nostr-tools`, `dexie`, `vue-router`), inspect the real installed source or fetch the official documentation to confirm the exact API surface. Guessing or using outdated examples causes runtime errors.
- Prefer the real installed package over web-search results, since the installed version is authoritative.

## Dexie / IndexedDB schema

The app calls `deleteCacheDatabase()` on every PWA update (see `src/lib/appReset.js`).
This means **no migration path ever exists** — users always start from a fresh database.

**Rules:**
- The Dexie schema must always have exactly **one version (`version(1)`)**.
- Never add `version(2)`, `version(3)`, etc. or any `.upgrade()` migration callbacks.
- When the schema needs to change, just update the `version(1)` stores definition directly.
