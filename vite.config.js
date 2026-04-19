import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";

const isElectron = process.env.BUILD_TARGET === "electron";

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
  includeAssets: ["favicon.ico", "apple-touch-icon.svg", "pwa-192x192.svg", "pwa-512x512.svg"],
  manifest: {
    name: "GUPT",
    short_name: "GUPT",
    description:
      "Anonymous end-to-end encrypted chat over Nostr relays with direct messages, calls, encrypted media, and local-first group state.",
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
  workbox: {
    globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
    navigateFallbackDenylist: [/^\/nostr\//],
  },
  devOptions: { enabled: false },
});

// https://vite.dev/config/
export default defineConfig({
  base: isElectron ? "./" : "/",
  define: {
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_TARGET__: JSON.stringify(isElectron ? "electron" : "web"),
  },
  plugins: [
    tailwindcss(),
    vue(),
    vueDevTools(),
    ...(isElectron ? [pwaRegisterStub] : [pwaPlugin]),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
