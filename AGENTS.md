# AGENTS.md

Guidance for AI agents and contributors working on this repository.

## Design
1. Prefer Tailwind CSS over custom CSS.
2. Use SVG icons wherever you can.
3. Use lots of animations; everything should have hover/touch animations.
4. Everything should load and fade in with smooth animations, so the app looks good and modern.

## Components
1. **Extract when complex**: If an element grows too complex, split it into its own component. Signs it's time:
   - The file exceeds ~500 lines.
   - The same markup or logic appears more than once.
   - A block has its own state, effects, or handlers.
   - Nesting goes deeper than ~3 levels.
2. **One component per file**, named in PascalCase after what it does (e.g. `UserCard.jsx`), in the `components/` folder.
3. **Keep components small and focused**: each does one thing. Compose larger UI from smaller components instead of building one giant one.
4. **Props over duplication**: make components reusable through props rather than copy-pasting variants.
5. **Carry the design rules with them**: every extracted component keeps its Tailwind styling, SVG icons, hover/touch animations, and fade-in on load.
6. **Move logic out of markup**: put complex logic in custom hooks or helper files, so components stay mostly presentational.
7. **Don't over-split**: simple, one-off markup can stay inline. Extract for clarity or reuse, not for its own sake.

## After Edit
1. **Version & Commit**: Increase version by `0.0.1` (`package.json` & `package-lock.json`) and git commit after each edit.