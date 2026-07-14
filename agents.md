# Agent Rules & Instructions

- **Design Rule**: NEVER use Glassmorphism. Do not use `backdrop-blur-*` or similar translucent frosted-glass styling anywhere in the codebase. Stick to solid colors, native layering, and box shadows for depth.
- **Styling Architecture**: ALWAYS use TailwindCSS for styling. Do not write custom CSS or scoped `<style>` blocks in Vue files. 
- **Animations**: Prefer Tailwind animations and transition classes over custom CSS `@keyframes` whenever possible.
- **Responsive Design**: Ensure the design is always optimized for small screens (mobile-first). Alter layouts and components as needed so they look and function perfectly on mobile devices before scaling up to desktop breakpoints.
- **Gradients**: NEVER use gradients (`bg-gradient-*`, `linear-gradient`, `radial-gradient`, etc.). Stick exclusively to solid flat colors for all backgrounds, text, and borders.
- **Design Philosophy**: Prioritize clarity, visual hierarchy, and usability. Use generous whitespace and consistent spacing across all components.
- **Micro-Interactions**: Ensure smooth hover, focus, and loading states on all interactive elements.
- **Dumb Storage Rule**: We strictly treat Nostr as dumb storage. We will ONLY use Kind 0 (Profiles), Kind 1 (Global Feed), and Kind 4 (Encrypted DMs) for all app features. Do not introduce any other event kinds unless they offer a functional benefit that is mathematically or technically impossible to achieve with 0, 1, and 4.
