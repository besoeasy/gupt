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
          "crypto": ["@noble/ciphers", "@noble/hashes", "@noble/secp256k1"],
          "db": ["dexie"],
          "helia": ["@helia/verified-fetch"],
        },
      },
    },
  },
});
