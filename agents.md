# Agent Rules & Instructions

- **Design Rule**: NEVER use Glassmorphism. Do not use `backdrop-blur-*` or similar translucent frosted-glass styling anywhere in the codebase. Stick to solid colors, native layering, and box shadows for depth.
- **Styling Architecture**: ALWAYS use TailwindCSS for styling. Do not write custom CSS or scoped `<style>` blocks in Vue files. 
- **Animations**: Prefer Tailwind animations and transition classes over custom CSS `@keyframes` whenever possible.
