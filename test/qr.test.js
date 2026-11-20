import test from "node:test";
import assert from "node:assert/strict";

import { encodeQr, qrPath, qrExtent } from "../src/lib/qr/encode.js";
import { decodeMatrix } from "../src/lib/qr/decode.js";
import { decodeImageData } from "../src/lib/qr/scan.js";
import { rsDecode, rsEncode } from "../src/lib/qr/galois.js";
import { lobbyQrPayload, parseQrPayload, permanentInviteUrl } from "../src/lib/qr/payload.js";
import { QR_GOLDEN } from "./fixtures/qr-golden.js";

/**
 * The golden matrices came from the `qrcode` package once, before it was
 * replaced by the in-repo encoder. They are the compatibility pin: a symbol
 * that stops matching them is a symbol installed clients cannot read, so the
 * failure is a release blocker, not a test to update.
 */
test("encoder matches the reference implementation bit for bit", () => {
  for (const fixture of QR_GOLDEN) {
    const qr = encodeQr(fixture.text, {
      ecc: fixture.ecc,
      version: fixture.version,
      mask: fixture.mask,
    });
    assert.equal(qr.size, fixture.rows.length, `${fixture.name}: size`);
    const rows = [];
    for (let y = 0; y < qr.size; y++) {
      rows.push(Array.from(qr.modules.subarray(y * qr.size, (y + 1) * qr.size)).join(""));
    }
    assert.deepEqual(rows, fixture.rows, `${fixture.name}: modules`);
  }
});

test("automatic version and mask selection matches the reference", () => {
  // These fixtures were generated without a mask, so they pin the penalty
  // scoring too — a different mask still scans, but it is a different symbol.
  for (const name of ["short-m", "unicode-h", "long-q"]) {
    const fixture = QR_GOLDEN.find((item) => item.name === name);
    const qr = encodeQr(fixture.text, { ecc: fixture.ecc });
    assert.equal(qr.version, fixture.version, `${name}: version`);
    assert.equal(qr.mask, fixture.mask, `${name}: mask`);
    const rows = [];
    for (let y = 0; y < qr.size; y++) {
      rows.push(Array.from(qr.modules.subarray(y * qr.size, (y + 1) * qr.size)).join(""));
    }
    assert.deepEqual(rows, fixture.rows, `${name}: modules`);
  }
});

test("the SVG path draws every dark module once", () => {
  const qr = encodeQr("hello", { ecc: "M", mask: 0 });
  const extent = qrExtent(qr);
  assert.equal(extent, qr.size + 8);
  const path = qrPath(qr);
  let painted = 0;
  for (const [, run] of path.matchAll(/h(\d+)v1/g)) painted += Number(run);
  const dark = qr.modules.reduce((sum, value) => sum + value, 0);
  assert.equal(painted, dark);
  assert.equal((path.match(/M/g) || []).length, [...path.matchAll(/h\d+v1h-\d+z/g)].length);
});

test("encoder rejects payloads that do not fit", () => {
  assert.throws(() => encodeQr("x".repeat(3000), { ecc: "L" }), /too large/);
  assert.throws(() => encodeQr("hello", { ecc: "Z" }), /Unknown error-correction/);
});

test("every version, mask and level round-trips", () => {
  const texts = ["A", "hello world", "https://gupt.app/#/chat/new?key=" + "ab".repeat(32)];
  for (const ecc of ["L", "M", "Q", "H"]) {
    for (const text of texts) {
      for (let mask = 0; mask < 8; mask++) {
        const qr = encodeQr(text, { ecc, mask });
        const decoded = decodeMatrix(qr.modules, qr.size);
        assert.ok(decoded, `${ecc} mask ${mask}`);
        assert.equal(decoded.text, text);
        assert.equal(decoded.version, qr.version);
        assert.equal(decoded.ecc, ecc);
        assert.equal(decoded.mask, mask);
      }
    }
  }
});

test("unicode survives byte-mode encoding", () => {
  const text = "Ünïcode ✓ — こんにちは";
  const qr = encodeQr(text, { ecc: "Q" });
  assert.equal(decodeMatrix(qr.modules, qr.size).text, text);
});

test("a mirrored symbol decodes through the transpose retry", () => {
  const qr = encodeQr("mirror test", { ecc: "M" });
  const mirrored = new Uint8Array(qr.size * qr.size);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) mirrored[x * qr.size + y] = qr.modules[y * qr.size + x];
  }
  assert.equal(decodeMatrix(mirrored, qr.size).text, "mirror test");
});

test("Reed-Solomon repairs the full error budget", () => {
  const data = [64, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236];
  const ecLength = 10;
  const encoded = [...data, ...rsEncode(data, ecLength)];
  const damaged = encoded.slice();
  for (let i = 0; i < Math.floor(ecLength / 2); i++) damaged[i * 2] ^= 0x5a;
  assert.equal(rsDecode(damaged, ecLength), 5);
  assert.deepEqual(damaged.slice(0, data.length), data);
});

test("a corrupted symbol still decodes inside the error budget", () => {
  const qr = encodeQr("repair me", { ecc: "H", mask: 4 });
  const damaged = qr.modules.slice();
  // Flip a handful of data modules away from the finder patterns.
  for (const [x, y] of [
    [15, 15],
    [16, 15],
    [17, 16],
    [14, 17],
    [16, 18],
  ]) {
    damaged[y * qr.size + x] ^= 1;
  }
  assert.equal(decodeMatrix(damaged, qr.size).text, "repair me");
});

// --- Synthetic camera frames ------------------------------------------------

function solve8(points) {
  const m = [];
  const b = [];
  for (const { u, v, x, y } of points) {
    m.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    m.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  const a = m.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j <= 8; j++) a[col][j] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= 8; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[8]);
}

function invert3([a, b, c, d, e, f, g, i, j]) {
  const A = e * j - f * i;
  const B = c * i - b * j;
  const C = b * f - c * e;
  const D = f * g - d * j;
  const E = a * j - c * g;
  const F = c * d - a * f;
  const G = d * i - e * g;
  const H = b * g - a * i;
  const I = a * e - b * d;
  const det = a * A + b * D + c * G;
  return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, I / det];
}

function quadFor({ cx, cy, size, angle = 0, skew = 0 }) {
  const radians = (angle * Math.PI) / 180;
  const point = (dx, dy) => {
    const sx = dx * (1 + (skew * dy) / size);
    return {
      x: cx + sx * Math.cos(radians) - dy * Math.sin(radians),
      y: cy + sx * Math.sin(radians) + dy * Math.cos(radians),
    };
  };
  return [point(-size, -size), point(size, -size), point(size, size), point(-size, size)];
}

function render(
  qr,
  { width = 480, height = 360, quad, blur = 0, noise = 0, seed = 7, invert = false },
) {
  const dim = qr.size;
  const quiet = 4;
  const extent = dim + quiet * 2;
  const h = solve8([
    { u: 0, v: 0, ...quad[0] },
    { u: 1, v: 0, ...quad[1] },
    { u: 1, v: 1, ...quad[2] },
    { u: 0, v: 1, ...quad[3] },
  ]);
  const inverse = invert3([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]);
  let state = seed;
  const random = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const luma = new Float32Array(width * height).fill(invert ? 0 : 255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = inverse[6] * x + inverse[7] * y + inverse[8];
      if (!w) continue;
      const u = (inverse[0] * x + inverse[1] * y + inverse[2]) / w;
      const v = (inverse[3] * x + inverse[4] * y + inverse[5]) / w;
      const mx = u * extent - quiet;
      const my = v * extent - quiet;
      if (mx < 0 || my < 0 || mx >= dim || my >= dim) continue;
      const dark = qr.modules[Math.floor(my) * dim + Math.floor(mx)];
      luma[y * width + x] = (dark ? 0 : 255) ^ (invert ? 255 : 0);
    }
  }
  if (blur > 0) {
    const copy = new Float32Array(luma.length);
    const radius = Math.floor(blur);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= height || xx >= width) continue;
            sum += luma[yy * width + xx];
            count++;
          }
        }
        copy[y * width + x] = sum / count;
      }
    }
    luma.set(copy);
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    const value = Math.max(0, Math.min(255, luma[i] + (noise ? (random() - 0.5) * noise : 0)));
    rgba[p] = rgba[p + 1] = rgba[p + 2] = value;
    rgba[p + 3] = 255;
  }
  return { rgba, width, height };
}

const FRAME = { width: 480, height: 360, cx: 240, cy: 180 };

test("a clean camera frame decodes", () => {
  const qr = encodeQr("scan me at the door", { ecc: "M" });
  const frame = render(qr, { ...FRAME, quad: quadFor({ ...FRAME, size: 110 }) });
  assert.equal(decodeImageData(frame.rgba, frame.width, frame.height).text, "scan me at the door");
});

test("a rotated frame decodes", () => {
  const qr = encodeQr("rotated invite", { ecc: "Q" });
  const frame = render(qr, { ...FRAME, quad: quadFor({ ...FRAME, size: 95, angle: 17 }) });
  assert.equal(decodeImageData(frame.rgba, frame.width, frame.height).text, "rotated invite");
});

test("a perspective frame with blur and noise decodes", () => {
  const qr = encodeQr("https://gupt.app/#/chat/new?key=" + "cd".repeat(32), { ecc: "M" });
  const frame = render(qr, {
    ...FRAME,
    quad: quadFor({ ...FRAME, size: 105, angle: 12, skew: 0.14 }),
    blur: 2,
    noise: 34,
  });
  assert.equal(
    decodeImageData(frame.rgba, frame.width, frame.height).text,
    "https://gupt.app/#/chat/new?key=" + "cd".repeat(32),
  );
});

test("an inverted (light-on-dark) symbol decodes", () => {
  const qr = encodeQr("dark mode qr", { ecc: "M" });
  const frame = render(qr, { ...FRAME, quad: quadFor({ ...FRAME, size: 105 }), invert: true });
  assert.equal(decodeImageData(frame.rgba, frame.width, frame.height).text, "dark mode qr");
});

test("noise is rejected instead of misread", () => {
  let state = 12345;
  const rgba = new Uint8ClampedArray(320 * 240 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = state % 256;
    rgba[i + 3] = 255;
  }
  assert.equal(decodeImageData(rgba, 320, 240), null);
});

test("a clipped or tiny frame is rejected", () => {
  assert.equal(decodeImageData(new Uint8ClampedArray(10 * 10 * 4), 10, 10), null);
});

// --- Payloads ---------------------------------------------------------------

const KEY = "ab".repeat(32);
const ORIGIN = "https://gupt.app";

test("a permanent invite is the same deep link the app already opens", () => {
  const url = permanentInviteUrl(ORIGIN, KEY);
  assert.equal(url, `https://gupt.app/#/chat/new?key=${KEY}`);
  assert.deepEqual(parseQrPayload(url, ORIGIN), { kind: "key", key: KEY, url });
  assert.throws(() => permanentInviteUrl(ORIGIN, "nope"));
});

test("bare keys and lobby codes are accepted", () => {
  assert.deepEqual(parseQrPayload(KEY), { kind: "key", key: KEY });
  const code = `match:lobby:${"a1".repeat(32)}:${"b2".repeat(32)}`;
  assert.deepEqual(parseQrPayload(code), { kind: "lobby", code });
  assert.equal(lobbyQrPayload(code), code);
  assert.equal(lobbyQrPayload("nope"), "");
});

test("foreign links, junk and oversized payloads are rejected", () => {
  assert.equal(parseQrPayload("https://evil.example/#/chat/new?key=" + KEY, ORIGIN), null);
  assert.equal(parseQrPayload("https://gupt.app/elsewhere", ORIGIN), null);
  assert.equal(parseQrPayload("hello"), null);
  assert.equal(parseQrPayload("x".repeat(4096)), null);
  assert.equal(parseQrPayload(""), null);
});

test("a domain deep link stays on the same origin", () => {
  const url = `${ORIGIN}/#/chat/new?domain=alice.example`;
  assert.deepEqual(parseQrPayload(url, ORIGIN), {
    kind: "domain",
    domain: "alice.example",
    url,
  });
});
