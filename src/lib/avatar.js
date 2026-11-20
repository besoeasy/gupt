import { sha256 } from "@noble/hashes/sha2.js";

/**
 * Deterministic identicons.
 *
 * The geometry and palette are frozen: a seed has to keep the same face for as
 * long as the app exists, because people recognise each other by it. Changing
 * the grid, the bit order or the colour derivation repaints every avatar in
 * every address book, so test/avatars.test.js pins the output with digests.
 *
 * The image is a self-contained SVG data URI: no dependency, no network (the
 * seed is a public key, so fetching it anywhere would leak the contact graph),
 * and about half the bytes of the blob generator this replaced.
 */

const GRID = 5; // cells per side, mirrored across the middle column
const CELL = 6; // cell size, in viewBox units
const STEP = 8; // cell plus its gutter
const PAD = 5;
const COLUMNS = (GRID + 1) / 2; // unique columns; the middle one is the axis
const CELLS = COLUMNS * GRID;
// Half a grid of random bits averages seven cells; the clamps keep every face
// off the two degenerate ends, an empty grid and a solid block.
const MIN_CELLS = 6;
const MAX_CELLS = 11;
const ANONYMOUS_SEED = "anonymous";
const CACHE_LIMIT = 400;

const VIEW_BOX = PAD * 2 + STEP * (GRID - 1) + CELL;

const cache = new Map();

/**
 * A fixed ring of hues instead of the whole wheel. Neighbours on the wheel look
 * alike at a glance, and telling two faces apart at 28px is the whole job of
 * this image, so the palette is spread rather than continuous.
 */
const HUES = [352, 12, 26, 42, 208, 190, 166, 144, 262, 288, 318, 232];

function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    const value = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/**
 * The 15 mirrored cells the hash fills. Cells are walked in a fixed order so
 * the path string, and therefore the digest test, is stable.
 */
function filledCells(bytes) {
  const bits = (bytes[1] << 8) | bytes[2];
  const filled = new Set();
  for (let index = 0; index < CELLS; index += 1) {
    if (bits & (1 << index)) filled.add(index);
  }
  for (let index = 0; index < CELLS && filled.size < MIN_CELLS; index += 1) {
    filled.add(index);
  }
  for (let index = CELLS - 1; index >= 0 && filled.size > MAX_CELLS; index -= 1) {
    filled.delete(index);
  }
  return filled;
}

function cellPath(col, row) {
  return `M${PAD + col * STEP} ${PAD + row * STEP}h${CELL}v${CELL}h-${CELL}z`;
}

function buildSvg(seed) {
  const bytes = sha256(new TextEncoder().encode(seed));
  const filled = filledCells(bytes);

  const hue = HUES[bytes[0] % HUES.length];
  // Two tones of one hue: a deep plate that reads on both themes, and a bright
  // glyph on it. The lightness steps by a byte so neighbours do not all land on
  // the same brightness.
  const plate = hslToHex(hue, 46, 24 + (bytes[3] % 2) * 3);
  const ink = hslToHex(hue, 70, 76 + (bytes[4] % 3) * 4);

  let path = "";
  for (let col = 0; col < COLUMNS; col += 1) {
    const mirror = GRID - 1 - col;
    for (let row = 0; row < GRID; row += 1) {
      if (!filled.has(col * GRID + row)) continue;
      path += cellPath(col, row);
      if (mirror !== col) path += cellPath(mirror, row);
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_BOX} ${VIEW_BOX}">` +
    `<rect width="${VIEW_BOX}" height="${VIEW_BOX}" fill="${plate}"/>` +
    `<path fill="${ink}" d="${path}"/></svg>`
  );
}

/**
 * Percent-encode the SVG as a `data:` URI. Only the characters that would break
 * inside a URL or an HTML attribute are escaped; base64 would inflate the
 * payload by a third for no gain.
 */
function toDataUri(svg) {
  const safe = svg
    .replace(/"/g, "'")
    .replace(/[%#<>{}|\\^[\]`]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `data:image/svg+xml,${safe}`;
}

/** The SVG markup for a seed, handy for tests and previews. */
export function avatarSvg(seed) {
  return buildSvg(seed ? String(seed) : ANONYMOUS_SEED);
}

export function avatarUrl(seed) {
  const key = seed ? String(seed) : ANONYMOUS_SEED;
  const hit = cache.get(key);
  if (hit) return hit;

  const uri = toDataUri(buildSvg(key));
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, uri);
  return uri;
}

export function groupAvatarUrl(groupSeed) {
  return avatarUrl(groupSeed ? `group:${groupSeed}` : `${ANONYMOUS_SEED}:group`);
}
