# GUPT — Agent Guidelines

## Nostr event kinds

Only the following Nostr event kinds may be used anywhere in this codebase.
Do not introduce, publish, query, or handle any other kind.

| Kind | Purpose | Owner |
|------|---------|-------|
| 0 | Profile metadata (name, about, picture, website, status) | `src/lib/api.js` |
| 1 | Notes, passwords, bookmarks, feed posts, ephemeral share links | `src/lib/{notes,passwords,bookmarks,feed,share}.js` |
| 4 | Encrypted DMs (NIP-04); groups are tagged kind-4 DMs | `src/lib/api.js`, `src/lib/groups.js` |
| 20004 | Ephemeral DM / call signaling | `src/lib/api.js` (`EPHEMERAL_DM_KIND`) |
| 21004 | Typing indicators | `src/lib/api.js` (`EPHEMERAL_TYPING_KIND`) |

Rules:

- All direct messaging flows through kind 4 (NIP-04). Never add a new DM kind.
- Groups must remain tagged kind-4 events; do not create a dedicated group kind.
- Kinds 1 and 0 are reused for app-specific payloads; distinguish them via tags/content, not new kinds.
- Ephemeral signaling uses 20004 (calls) and 21004 (typing). No other ephemeral kinds.
- When adding a feature that needs on-relay storage, reuse one of the kinds above and add a distinguishing tag.
- Query filters must only request these kinds. Do not broaden `kinds:` arrays to include others.
- Constants for kinds live in `src/lib/api.js` (DM kinds) and per-module constants (e.g. `NOTE_KIND`, `PASSWORD_KIND`) that resolve to one of the allowed values. Keep them aligned with this table.