import test from "node:test";
import assert from "node:assert/strict";

import { cacheControlFor } from "../bin/httpCache.js";

test("the service worker and manifest revalidate instead of pinning for a year", () => {
  assert.equal(cacheControlFor("/srv/dist/sw.js"), "no-cache");
  assert.equal(cacheControlFor("/srv/dist/manifest.webmanifest"), "no-cache");
});

test("HTML is never stored", () => {
  assert.equal(cacheControlFor("/srv/dist/index.html"), "no-store");
  assert.equal(cacheControlFor("/srv/dist/"), "no-store");
});

test("hashed build output and stable icons stay immutable", () => {
  assert.equal(
    cacheControlFor("/srv/dist/assets/index-CTh2JCFG.js"),
    "public, max-age=31536000, immutable",
  );
  assert.equal(cacheControlFor("/srv/dist/pwa-512x512.svg"), "public, max-age=31536000, immutable");
});

test("the basename decides, so a nested worker is not treated as an asset", () => {
  assert.equal(cacheControlFor("/srv/dist/nested/sw.js"), "no-cache");
});
