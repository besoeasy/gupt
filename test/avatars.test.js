import test from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import { avatarSvg, avatarUrl, groupAvatarSvg, groupAvatarUrl } from "../src/lib/avatar.js";

/**
 * Avatars are an identity: a user learns their contacts' faces and a changed
 * face is a changed person. The digests below pin the rendering, so a refactor
 * that reshuffles every avatar fails here instead of silently in the app.
 * Regenerating them is a deliberate act, not a side effect of a tidy-up.
 */
const PINNED = {
  anonymous: "862feb2775c050ec06af408931b357a80d0dbb2516acb060e700f55bcb429981",
  a1b2c3d4e5f60718293a4b5c6d7e8f90:
    "52bfe56a9064cfc1cb8215c74b8dffdc686e7afefe6f11a9a8ba89357ea85cab",
  "group:alpha": "6679f86dc5fee29891bc302909bf7b9954c661a796b4b2b0c005b996c2a5e7c8",
  zz: "268a1476e245058b0e3ef00ac3233b9b8d47e02c6c9fc6fa742fbb196a8eaaa6",
};

/**
 * The group mark is the same promise: the tile behind the face is part of the
 * identity, not decoration, so it gets its own digest.
 */
const GROUP_PINNED = {
  alpha: "e73bd969a18d9d3d78761561abaf8c8b7056ec01f4e91fff0c9db8bd7ba797dd",
  team: "985bcdd76503a5333c3d5f394edd5db2b77b231af9cb1acc5ca9f5549f1af1c7",
};

function digest(svg) {
  return bytesToHex(sha256(new TextEncoder().encode(svg)));
}

/** The cell positions in a generated path, in drawing order. */
function cells(svg) {
  const path = svg.match(/<path fill="#[0-9a-f]{6}" d="([^"]*)"/)?.[1] ?? "";
  return [...path.matchAll(/M(\d+) (\d+)h6v6h-6z/g)].map(([, x, y]) => [Number(x), Number(y)]);
}

function luminance(hex) {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
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
  for (const [id, expected] of Object.entries(GROUP_PINNED)) {
    assert.equal(
      digest(groupAvatarSvg(id)),
      expected,
      `group avatar for ${JSON.stringify(id)} changed`,
    );
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
    assert.ok(
      contrast(plate[1], ink[1]) >= 4.5,
      `glyph contrast is too low for ${i}: ${contrast(plate[1], ink[1]).toFixed(2)}`,
    );

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

test("a group carries a second tile behind the face", () => {
  for (let i = 0; i < 100; i += 1) {
    const svg = groupAvatarSvg(`team-${i}`);

    const back = svg.match(/<rect x="6" y="6" width="42" height="42" rx="9" fill="(#[0-9a-f]{6})"/);
    const front = svg.match(/<rect width="42" height="42" rx="9" fill="(#[0-9a-f]{6})"/);
    const ink = svg.match(/<path fill="(#[0-9a-f]{6})"/);
    assert.ok(back, "needs the tile behind");
    assert.ok(front, "needs the front tile");
    assert.ok(ink, "needs a glyph");
    assert.notEqual(back[1], front[1], "the back tile must stand apart from the front");
    assert.ok(
      contrast(front[1], ink[1]) >= 4.5,
      `group glyph contrast is too low for ${i}: ${contrast(front[1], ink[1]).toFixed(2)}`,
    );

    const drawn = cells(svg);
    assert.ok(drawn.length > 0, "a group without cells is a plain square");

    // The face is 42 wide and a cell is 6, so a cell at x mirrors to 36 - x.
    const mirrored = drawn.map(([x, y]) => `${36 - x}:${y}`).sort();
    assert.deepEqual(
      drawn.map(([x, y]) => `${x}:${y}`).sort(),
      mirrored,
      "group cells mirror across the vertical axis",
    );

    const seeds = new Set(drawn.filter(([x]) => x <= 18).map(([x, y]) => `${x}:${y}`));
    assert.ok(seeds.size >= 6, `too few cells for group ${i}`);
    assert.ok(seeds.size <= 11, `too many cells for group ${i}`);
  }
});

test("faces stay small: the URI is well under a kilobyte", () => {
  let longestPerson = 0;
  let longestGroup = 0;
  for (let i = 0; i < 200; i += 1) {
    longestPerson = Math.max(longestPerson, avatarUrl(`seed-${i}`).length);
    longestGroup = Math.max(longestGroup, groupAvatarUrl(`group-seed-${i}`).length);
  }
  assert.ok(longestPerson < 512, `person avatar was ${longestPerson} bytes`);
  assert.ok(longestGroup < 640, `group avatar was ${longestGroup} bytes`);
});
