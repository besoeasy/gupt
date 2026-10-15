import { fileURLToPath, URL } from "node:url";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";

const buildTarget = process.env.BUILD_TARGET || "web";
const isFlatpak = buildTarget === "flatpak";
const usesLocalAssets = isFlatpak;

const pwaRegisterStub = {
  name: "pwa-register-stub",
  resolveId(id) {
    if (id === "virtual:pwa-register") return "\0virtual:pwa-register-stub";
  },
  load(id) {
    if (id === "\0virtual:pwa-register-stub") {
      return "export function registerSW(){ return () => Promise.resolve(); }";
    }
  },
};

// Vite's dev client needs `unsafe-eval` for hot-module replacement and
// `unsafe-inline` for its injected styles, so `npm run dev` would be blocked by
// the strict policy in index.html. Swap in a relaxed copy while serving; the
// built output keeps the strict one.
const devCspPlugin = {
  name: "dev-csp",
  apply: "serve",
  transformIndexHtml(html) {
    const relaxed = html.replace(
      /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/,
      "$1default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss: http: https:; img-src 'self' data: blob: http: https:; media-src 'self' blob: data: http: https:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'$2",
    );
    return relaxed;
  },
};

const pwaPlugin = VitePWA({
  registerType: "autoUpdate",
  strategies: "injectManifest",
  srcDir: "src",
  filename: "sw.js",
  includeAssets: ["favicon.ico", "apple-touch-icon.svg", "pwa-192x192.svg", "pwa-512x512.svg"],
  manifest: {
    name: "GUPT",
    short_name: "GUPT",
    description:
      "Self-hosted, end-to-end encrypted messenger. A privacy-first alternative to Telegram, Signal, WhatsApp & Discord — built on Nostr relays with WebRTC calls.",
    theme_color: "#09090b",
    background_color: "#09090b",
    display: "standalone",
    scope: "/",
    start_url: "/",
    icons: [
      { src: "/pwa-192x192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/pwa-512x512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" },
    ],
  },
  injectManifest: {
    globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
  },
  devOptions: { enabled: false },
});

// https://vite.dev/config/
export default defineConfig({
  base: usesLocalAssets ? "./" : "/",
  define: {
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_TARGET__: JSON.stringify(buildTarget),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    tailwindcss(),
    vue(),
    vueDevTools(),
    devCspPlugin,
    ...(usesLocalAssets ? [pwaRegisterStub] : [pwaPlugin]),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    watch: {
      ignored: [
        "**/build/**",
        "**/build-dir/**",
        "**/bundle/**",
        "**/dist/**",
        "**/dev-dist/**",
        "**/flatpak/**",
        "**/.flatpak-builder/**",
      ],
    },
  },
  esbuild: {
    // Drop only noisy debug logs. Keep console.warn / console.error so that
    // SW cache issues and runtime errors remain visible in production DevTools.
    pure: ["console.log", "console.debug"],
    drop: ["debugger"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vue-core": ["vue", "vue-router", "pinia"],
          crypto: ["@noble/ciphers", "@noble/hashes", "@noble/secp256k1"],
          db: ["dexie"],
        },
      },
    },
  },
});
