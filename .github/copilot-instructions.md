# GUPT — Copilot Instructions

## Dexie / IndexedDB schema

The app calls `deleteCacheDatabase()` on every PWA update (see `src/lib/appReset.js`).
This means **no migration path ever exists** — users always start from a fresh database.

**Rules:**
- The Dexie schema must always have exactly **one version (`version(1)`)**.
- Never add `version(2)`, `version(3)`, etc. or any `.upgrade()` migration callbacks.
- When the schema needs to change, just update the `version(1)` stores definition directly.
