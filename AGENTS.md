# AGENTS.md

Guidance for AI agents and contributors working on this repository.

## Overview

**gupt** is a self-hosted, end-to-end encrypted messenger built with Vue 3 + Vite.
There is no backend — encryption, caching, and publishing all happen directly in
the browser. Decentralized relays (Nostr / Rabta) are used as dumb transport, and
local data is cached in IndexedDB via Dexie.

## Repository Layout

```
src/
  lib/          Domain logic (crypto, idb, engine, relay transport, webrtc)
  stores/       Pinia stores (identity, messenger, calls, settings, replication)
  views/        Route-level views
  components/   Shared and feature components (chatv2, settings, home, etc.)
  config/       Static configuration (servers, retention)
  router/       Vue router definitions
test/           Unit & integration test suites
bin/            Static server for dist/
flatpak/        Flatpak packaging manifests
```

Module imports use the `@/` alias pointing to `./src/`.

## Key Commands

- `npm run dev` — Start Vite dev server.
- `npm test` — Run test suite with Node's native test runner (`node --test test/*.test.js`).
- `npm run build` — Compile client app and PWA service worker to `dist/`.
- `npx oxfmt <file>` — Format JavaScript/Vue files with oxfmt (formatting standard for the repo).

## Code Style & Conventions

- **Language**: JavaScript, ES modules (`"type": "module"`), no semicolons.
- **Styling**: Tailwind CSS v4 utility classes and `@lucide/vue` icons.
- **Theme**: Dark palette (`bg-black`, `text-zinc-100`, `border-zinc-800/80`, `bg-zinc-950/40`, `bg-zinc-900/60`).
- **Comments**: Keep comments minimal; only comment non-obvious context or edge cases.
- **Imports**: Domain logic in `src/lib`, state in `src/stores` (Pinia), UI in `src/views` + `src/components`.

## Workflow Rules

- **Version & Commit**: Increase version by `0.0.1` (`package.json` & `package-lock.json`) and git commit after each edit.
- **Verification**: Run `npm test` and `npm run build` to verify tests pass and the production build compiles cleanly.
