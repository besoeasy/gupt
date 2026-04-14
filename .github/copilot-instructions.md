# UI Design

## Dos

- Use a clean and modern design with a consistent color scheme and typography.
- Ensure that the interface is intuitive and easy to navigate, with clear labels and icons.
- Use responsive design principles to ensure that the interface works well on different screen sizes and devices.
- Add hover effects and animations to provide feedback to users and make the interface more engaging.
- Always prefer tailwind animations & tailwindcss utility classes over custom CSS, as this can help to maintain consistency and reduce the amount of custom code needed.

## Donts

- Avoid using gradients and shadows, as they can make the interface look cluttered and outdated.
- Avoid using too many different fonts and colors, as this can make the interface look chaotic and unprofessional.
- Dont put things in boxes or use borders, as this can make the interface look cluttered and outdated.
- if use minimal rounded corners, avoid using large border-radius values, as this can make the interface look childish and unprofessional. Instead, use small border-radius values.

# Data Retention

## Hard Rule: 20-month cutoff

- **Everything older than 20 months is dropped unconditionally** — not fetched from relays, not cached in IndexedDB, not displayed in the UI.
- This applies to all content types: DMs, group messages, group snapshots, media, profiles, room metadata.
- The canonical constant is `RETENTION_MONTHS = 20` / `RETENTION_DAYS = 610` in `src/config/retention.js`.
- All Nostr relay query filters must include a `since` field floored to `getRetentionCutoffSec()` (exported from `src/config/retention.js`). Never construct a relay filter without a `since` bound.
- Local IndexedDB entries use `expiresAt = createdAt + readConfiguredRetentionMs()` and are purged by the background maintenance job in `src/lib/idb.js`.
- Do not add user-configurable retention settings. The 20-month limit is a product-level decision and must not be bypassed.