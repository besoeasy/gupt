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
 *
 * A group keeps the same face but gets a second tile behind it, so a group and
 * a person never read alike in a list.
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

// The group face is inset to leave room for the tile behind it.
const GROUP_VIEW = 42;
const GROUP_PAD = 4;
const GROUP_STEP = 7;
const GROUP_CELL = 6;
const GROUP_OFFSET = 6;
const GROUP_RADIUS = 9;

const cache = new Map();

/**
 * A fixed ring of jewel hues instead of the whole wheel. Neighbours on the
 * wheel look alike at a glance, and telling two faces apart at 28px is the
 * whole job of this image, so the palette is spread rather than continuous.
 * The yellow-orange arc is deliberately absent: at plate lightness it turns
 * brown and olive, which reads as dirt rather than as a colour.
 *
 * Greens and cyan carry more luminance at the same HSL lightness, so their
 * plates sit darker; that keeps every glyph above 4.5:1 on its plate instead
 * of only the blues and purples.
 */
const HUES = [
  [352, 31],
  [20, 31],
  [332, 31],
  [305, 31],
  [275, 31],
  [245, 31],
  [220, 31],
  [195, 29],
  [168, 26],
  [142, 26],
];

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

function cellPath(col, row, pad, step, cell) {
  return `M${pad + col * step} ${pad + row * step}h${cell}v${cell}h-${cell}z`;
}

function cellsPath(filled, pad, step, cell) {
  let path = "";
  for (let col = 0; col < COLUMNS; col += 1) {
    const mirror = GRID - 1 - col;
    for (let row = 0; row < GRID; row += 1) {
      if (!filled.has(col * GRID + row)) continue;
      path += cellPath(col, row, pad, step, cell);
      if (mirror !== col) path += cellPath(mirror, row, pad, step, cell);
    }
  }
  return path;
}

function buildSvg(seed, group) {
  const bytes = sha256(new TextEncoder().encode(seed));
  const filled = filledCells(bytes);

  const [hue, plateBase] = HUES[bytes[0] % HUES.length];
  // Two tones of one hue: a deep plate that reads on both themes, and a bright
  // glyph on it. The lightness steps by a byte so neighbours do not all land on
  // the same brightness.
  const plate = hslToHex(hue, 56, plateBase + (bytes[3] % 2) * 2);
  const ink = hslToHex(hue, 62, 84 + (bytes[4] % 3) * 3);

  if (group) {
    // A second tile peeks out bottom-right; the accent is a hue-shifted mid
    // tone, so the stack reads on both themes without a border.
    const accent = hslToHex((hue + 38) % 360, 64, 65);
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_BOX} ${VIEW_BOX}">` +
      `<rect x="${GROUP_OFFSET}" y="${GROUP_OFFSET}" width="${GROUP_VIEW}" height="${GROUP_VIEW}" rx="${GROUP_RADIUS}" fill="${accent}"/>` +
      `<rect width="${GROUP_VIEW}" height="${GROUP_VIEW}" rx="${GROUP_RADIUS}" fill="${plate}"/>` +
      `<path fill="${ink}" d="${cellsPath(filled, GROUP_PAD, GROUP_STEP, GROUP_CELL)}"/></svg>`
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_BOX} ${VIEW_BOX}">` +
    `<rect width="${VIEW_BOX}" height="${VIEW_BOX}" fill="${plate}"/>` +
    `<path fill="${ink}" d="${cellsPath(filled, PAD, STEP, CELL)}"/></svg>`
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

function cachedUrl(cacheKey, seed, group) {
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const uri = toDataUri(buildSvg(seed, group));
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, uri);
  return uri;
}

/** The SVG markup for a person seed, handy for tests and previews. */
export function avatarSvg(seed) {
  return buildSvg(seed ? String(seed) : ANONYMOUS_SEED, false);
}

/** The SVG markup for a group id, with the stacked-tile mark. */
export function groupAvatarSvg(groupSeed) {
  const id = groupSeed ? String(groupSeed) : ANONYMOUS_SEED;
  return buildSvg(`group:${id}`, true);
}

export function avatarUrl(seed) {
  const key = seed ? String(seed) : ANONYMOUS_SEED;
  return cachedUrl(`p:${key}`, key, false);
}

export function groupAvatarUrl(groupSeed) {
  const id = groupSeed ? String(groupSeed) : ANONYMOUS_SEED;
  return cachedUrl(`g:${id}`, `group:${id}`, true);
}
