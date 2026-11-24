# AGENTS.md

1. **Custom CSS.** Hand-write scoped styles; no Tailwind, utilities or `@layer`; tokens for both themes.
2. **Custom SVG.** Hand-draw every mark; no stock art, logo packages, CDN or hotlinks.
3. **Lots of animation.** Fade screens in, animate hover and touch, respect `prefers-reduced-motion`.
4. **IndexedDB is disposable.** Relays hold the truth; no migrations, `DB_VERSION` or upgrade code.
5. **Honour the 400-day support window.** Read `src/config/compat.js`; date every shim, delete at expiry.
6. **Delete expired migrations first.** Run `grep -rn "COMPAT: remove after" src` before every release.
