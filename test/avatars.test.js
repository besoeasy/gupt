import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { roboHashGroupUrl, roboHashUrl } from "../src/lib/crypto.js";

/**
 * Generated avatars are a pure function of their seed, which is exactly what
 * makes them safe to derive from a pubkey. It also makes them easy to break
 * without noticing: blobatar's silhouette thresholds partition a single range,
 * so a release that adds a shape reshuffles every existing one and every user's
 * face changes at once.
 *
 * These digests pin the rendering of blobatar 2.7.0 (exact, see package.json).
 * A failure here is not a bug to fix by updating the hashes — it means the
 * dependency moved and everyone's avatar is about to change. Decide that
 * deliberately, then re-pin.
 */
const PINNED = {
  "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d":
    "641701226bf161d9b12810d63b94afec6bc90e84c7d00c1332726ae6ad05dac8",
  "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2":
    "997f8d4e7a41cf3917d00023903aeaf15a9cf063d160f35edfcc245bdfb2b635",
  npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9:
    "c652567a5fbe0fb4269b08a98d09d73e2a2100b3d33b35c9830c5b2dbf6c8573",
  "": "7c2a7a443832f84539779196f0eb9181a59777ca7a1a9a5873fb43f2905bdcb5",
};

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

test("generated avatars keep their pinned rendering", () => {
  for (const [seed, digest] of Object.entries(PINNED)) {
    assert.equal(
      sha256(roboHashUrl(seed)),
      digest,
      `avatar for ${seed || "(empty)"} changed — blobatar was bumped?`,
    );
  }
});

test("the same seed always renders the same avatar", () => {
  const seed = "ab".repeat(32);
  assert.equal(roboHashUrl(seed), roboHashUrl(seed));
});

test("different seeds render different avatars", () => {
  assert.notEqual(roboHashUrl("a".repeat(64)), roboHashUrl("b".repeat(64)));
});

test("a missing seed falls back instead of rendering blank", () => {
  assert.equal(roboHashUrl(""), roboHashUrl("anonymous"));
  assert.equal(roboHashUrl(undefined), roboHashUrl("anonymous"));
  assert.equal(roboHashGroupUrl(null), roboHashUrl("anonymous"));
});

test("avatars are inline data URIs and never touch the network", () => {
  for (const url of [roboHashUrl("x"), roboHashGroupUrl("y")]) {
    assert.match(url, /^data:image\/svg\+xml,/);
    assert.doesNotMatch(url, /blobatar\.dev/);
    assert.doesNotMatch(url, /^https?:/);
  }
});
