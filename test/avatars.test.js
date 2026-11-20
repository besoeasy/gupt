import test from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import { avatarSvg, avatarUrl, groupAvatarUrl } from "../src/lib/avatar.js";

/**
 * Avatars are an identity: a user learns their contacts' faces and a changed
 * face is a changed person. The digests below pin the rendering, so a refactor
 * that reshuffles every avatar fails here instead of silently in the app.
 * Regenerating them is a deliberate act, not a side effect of a tidy-up.
 */
const PINNED = {
  anonymous: "1bb2eba0346e30a695698666a5eaddb56a376a9eec3e0b2be88b782964a3fc89",
  a1b2c3d4e5f60718293a4b5c6d7e8f90:
    "c88b6da013afffb273e02b1ff327d71519420cebe1937d00a9ac076e4db4b1c6",
  "group:alpha": "31804006ff7923c8e0de05aaa0cbc681c2f2225752dcf4bf266e03f5d4111cb2",
  zz: "f294bde002c9d10413b5119e68f9c816e4188f279f14e8564bbc3646dedcaa4d",
};

function digest(svg) {
  return bytesToHex(sha256(new TextEncoder().encode(svg)));
}

/** The cell positions in a generated path, in drawing order. */
function cells(svg) {
  const path = svg.match(/<path fill="#[0-9a-f]{6}" d="([^"]*)"/)?.[1] ?? "";
  return [...path.matchAll(/M(\d+) (\d+)h6v6h-6z/g)].map(([, x, y]) => [Number(x), Number(y)]);
}

test("the same seed always draws the same avatar", () => {
  assert.equal(avatarSvg("abc"), avatarSvg("abc"));
  assert.notEqual(avatarSvg("abc"), avatarSvg("abd"));
  assert.notEqual(avatarSvg("abc"), avatarSvg("abc "));
});

test("rendering is pinned against silent drift", () => {
  for (const [seed, expected] of Object.entries(PINNED)) {
    assert.equal(digest(avatarSvg(seed)), expected, `avatar for ${JSON.stringify(seed)} changed`);
  }
});

test("a missing seed falls back to the anonymous face", () => {
  assert.equal(avatarUrl(""), avatarUrl("anonymous"));
  assert.equal(avatarUrl(undefined), avatarUrl(null));
});

test("a group and a person with the same id never share a face", () => {
  assert.notEqual(groupAvatarUrl("abc"), avatarUrl("abc"));
  assert.equal(groupAvatarUrl("team"), groupAvatarUrl("team"));
});

test("the data URI is a self-contained, attribute-safe SVG", () => {
  const uri = avatarUrl("a1b2c3d4");
  assert.ok(uri.startsWith("data:image/svg+xml,"), "must be an inline SVG data URI");

  const markup = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
  assert.match(
    markup,
    /^<svg xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["'] viewBox=["']0 0 48 48["']>/,
  );
  assert.equal(markup.match(/<svg/g)?.length, 1, "one root element, nothing external");

  // Characters that would terminate the URL or the HTML attribute are escaped,
  // so the URI can be dropped into src="" as is.
  const payload = uri.slice("data:image/svg+xml,".length);
  for (const char of ['"', "#", "<", ">", "{"]) {
    assert.ok(!payload.includes(char), `${char} must be escaped`);
  }
  assert.ok(!/%(?![0-9A-F]{2})/.test(payload), "every % must start a valid escape");
});

test("every avatar carries a plate, an ink and mirrored cells", () => {
  for (let i = 0; i < 200; i += 1) {
    const svg = avatarSvg(`seed-${i}`);

    const plate = svg.match(/<rect width="48" height="48" fill="(#[0-9a-f]{6})"/);
    const ink = svg.match(/<path fill="(#[0-9a-f]{6})"/);
    assert.ok(plate, "needs a background");
    assert.ok(ink, "needs a glyph");
    assert.notEqual(plate[1], ink[1], "glyph must not vanish into the plate");

    const drawn = cells(svg);
    assert.ok(drawn.length > 0, "an avatar without cells is a plain square");

    // The plate is 48 wide and a cell is 6, so a cell at x mirrors to 42 - x.
    const mirrored = drawn.map(([x, y]) => `${42 - x}:${y}`).sort();
    assert.deepEqual(
      drawn.map(([x, y]) => `${x}:${y}`).sort(),
      mirrored,
      "cells mirror across the vertical axis",
    );

    // Only the left half and the centre column are drawn from the hash, so the
    // clamp on how many of those are filled is what keeps faces off the empty
    // and solid ends of the range.
    const seeds = new Set(drawn.filter(([x]) => x <= 21).map(([x, y]) => `${x}:${y}`));
    assert.ok(seeds.size >= 6, `too few cells for ${i}`);
    assert.ok(seeds.size <= 11, `too many cells for ${i}`);
  }
});

test("faces stay small: the URI is well under a kilobyte", () => {
  let longest = 0;
  for (let i = 0; i < 200; i += 1) {
    longest = Math.max(longest, avatarUrl(`seed-${i}`).length);
  }
  assert.ok(longest < 512, `longest avatar was ${longest} bytes`);
});
