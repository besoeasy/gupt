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

## Migrations
- Every breaking change (stored data, schema, API, config) needs a migration so the app keeps working.
- Assume users log in once every 200 days. Keep every migration from the last 200 days.
- Delete migrations older than 200 days.
- Migrations run in order and must be safe to run more than once.

## After Edit
- Check the change at ~375px width and on desktop.
- Bump version by `0.0.1` in `package.json` and `package-lock.json`, then git commit.
- suggest next 3 improvements/fixes we can do ( with numbers 1,2,3 ).
