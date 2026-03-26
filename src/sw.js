import { defaultCache } from "@serwist/vite/worker";
import { Serwist } from "serwist";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  precacheOptions: {
    navigateFallback: "/index.html",
    navigateFallbackDenylist: [/^\/nostr\//],
  },
});

serwist.addEventListeners();
