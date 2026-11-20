/**
 * QR Code scanner: RGBA frame → module matrix → text.
 *
 * Everything is local and dependency-free. The pipeline is the classic one:
 * grayscale, adaptive threshold, find the three finder patterns, fit a
 * perspective transform from them (plus the bottom-right corner), sample the
 * grid, and hand the matrix to `decodeMatrix`.
 *
 * `scan.js` never touches the DOM. `useQrScanner` feeds it frames; tests feed
 * it synthetic ones, so the geometry is exercised in Node as well.
 */

import { decodeMatrix } from "./decode.js";

const BLOCK = 8;
const MIN_DYNAMIC_RANGE = 24;

/** RGBA → 8-bit luma. */
export function toLuma(rgba, width, height) {
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000;
  }
  return out;
}

/**
 * Adaptive threshold, block by block. A block with enough contrast gets its
 * own midpoint; a flat block borrows the average of nearby thresholds so a
 * shadow or a glare band does not turn into one huge black or white area.
 */
export function binarize(luma, width, height) {
  const blocksX = Math.ceil(width / BLOCK);
  const blocksY = Math.ceil(height / BLOCK);
  const thresholds = new Float32Array(blocksX * blocksY);
  const valid = new Uint8Array(blocksX * blocksY);

  let globalMin = 255;
  let globalMax = 0;

  for (let by = 0; by < blocksY; by++) {
    const y0 = Math.min(by * BLOCK, height - BLOCK);
    for (let bx = 0; bx < blocksX; bx++) {
      const x0 = Math.min(bx * BLOCK, width - BLOCK);
      let min = 255;
      let max = 0;
      for (let y = 0; y < BLOCK; y++) {
        const row = (y0 + y) * width + x0;
        for (let x = 0; x < BLOCK; x++) {
          const value = luma[row + x];
          if (value < min) min = value;
          if (value > max) max = value;
        }
      }
      const index = by * blocksX + bx;
      if (max - min > MIN_DYNAMIC_RANGE) {
        thresholds[index] = (min + max) / 2;
        valid[index] = 1;
      }
      if (min < globalMin) globalMin = min;
      if (max > globalMax) globalMax = max;
    }
  }

  // A flat black block (the middle of a finder pattern) has no contrast of
  // its own; without a neighbour's threshold it would binarize to white.
  const globalThreshold = (globalMin + globalMax) / 2;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const index = by * blocksX + bx;
      if (valid[index]) continue;
      let sum = 0;
      let count = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = by + dy;
        if (yy < 0 || yy >= blocksY) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const xx = bx + dx;
          if (xx < 0 || xx >= blocksX) continue;
          const neighbour = yy * blocksX + xx;
          if (!valid[neighbour]) continue;
          sum += thresholds[neighbour];
          count++;
        }
      }
      thresholds[index] = count ? sum / count : globalThreshold;
    }
  }

  const bits = new Uint8Array(width * height);
  for (let by = 0; by < blocksY; by++) {
    const y0 = Math.min(by * BLOCK, height - BLOCK);
    for (let bx = 0; bx < blocksX; bx++) {
      const threshold = thresholds[by * blocksX + bx];
      const x0 = Math.min(bx * BLOCK, width - BLOCK);
      for (let y = 0; y < BLOCK; y++) {
        const row = (y0 + y) * width + x0;
        for (let x = 0; x < BLOCK; x++) {
          bits[row + x] = luma[row + x] < threshold ? 1 : 0;
        }
      }
    }
  }
  return bits;
}

/**
 * 3×3 majority filter. Camera frames and box-blurred screens produce
 * single-pixel speckle exactly on module boundaries, which splits a finder
 * pattern's 3-module core in two and hides it from the run scan. The filter is
 * used only to locate the patterns; sampling reads the unfiltered frame.
 */
export function denoise(bits, width, height) {
  const out = new Uint8Array(bits.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        const row = yy * width;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += bits[row + xx];
        }
      }
      out[y * width + x] = sum >= 5 ? 1 : 0;
    }
  }
  return out;
}

function finderRatioOk(counts) {
  const total = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
  if (total < 7) return false;
  const unit = total / 7;
  const variance = unit / 2;
  return (
    Math.abs(counts[0] - unit) < variance &&
    Math.abs(counts[1] - unit) < variance &&
    Math.abs(counts[2] - 3 * unit) < 3 * variance &&
    Math.abs(counts[3] - unit) < variance &&
    Math.abs(counts[4] - unit) < variance
  );
}

function rowRuns(bits, width, y) {
  const runs = [];
  let start = 0;
  let color = bits[y * width];
  for (let x = 1; x < width; x++) {
    const next = bits[y * width + x];
    if (next !== color) {
      runs.push({ start, length: x - start, dark: color === 1 });
      start = x;
      color = next;
    }
  }
  runs.push({ start, length: width - start, dark: color === 1 });
  return runs;
}

/**
 * Check a finder pattern through (x, y) along one axis and return the centre
 * of its 3-module core plus the estimated module size.
 */
export function crossCheck(bits, width, height, x, y, vertical) {
  const limit = vertical ? height : width;
  const center = vertical ? y : x;
  const at = (position) => (vertical ? bits[position * width + x] : bits[y * width + position]);

  if (!at(center)) return null;

  let coreStart = center;
  let coreEnd = center;
  while (coreStart > 0 && at(coreStart - 1)) coreStart--;
  while (coreEnd < limit - 1 && at(coreEnd + 1)) coreEnd++;

  let outerStart = coreStart;
  let whiteBefore = 0;
  while (outerStart > 0 && !at(outerStart - 1)) {
    outerStart--;
    whiteBefore++;
  }
  let darkBefore = 0;
  while (outerStart > 0 && at(outerStart - 1)) {
    outerStart--;
    darkBefore++;
  }

  let outerEnd = coreEnd;
  let whiteAfter = 0;
  while (outerEnd < limit - 1 && !at(outerEnd + 1)) {
    outerEnd++;
    whiteAfter++;
  }
  let darkAfter = 0;
  while (outerEnd < limit - 1 && at(outerEnd + 1)) {
    outerEnd++;
    darkAfter++;
  }

  const counts = [darkBefore, whiteBefore, coreEnd - coreStart + 1, whiteAfter, darkAfter];
  if (!finderRatioOk(counts)) return null;

  const total = counts.reduce((sum, value) => sum + value, 0);
  return {
    center: (coreStart + coreEnd + 1) / 2,
    unit: total / 7,
  };
}

export function findFinderPatterns(bits, width, height) {
  const candidates = [];

  for (let y = 0; y < height; y++) {
    const runs = rowRuns(bits, width, y);
    for (let i = 0; i + 4 < runs.length; i++) {
      if (!runs[i].dark) continue;
      const window = runs.slice(i, i + 5);
      if (!window[4].dark || window[1].dark || window[3].dark) continue;
      const counts = window.map((run) => run.length);
      if (!finderRatioOk(counts)) continue;

      const centerX = window[2].start + window[2].length / 2;
      const vertical = crossCheck(bits, width, height, Math.round(centerX), y, true);
      if (!vertical) continue;
      const horizontal = crossCheck(
        bits,
        width,
        height,
        Math.round(centerX),
        Math.round(vertical.center),
        false,
      );
      if (!horizontal) continue;

      const unit = (vertical.unit + horizontal.unit) / 2;
      const center = { x: horizontal.center, y: vertical.center };
      const existing = candidates.find(
        (candidate) =>
          Math.abs(candidate.x - center.x) <= unit * 1.5 &&
          Math.abs(candidate.y - center.y) <= unit * 1.5,
      );
      if (existing) {
        existing.x = (existing.x * existing.count + center.x) / (existing.count + 1);
        existing.y = (existing.y * existing.count + center.y) / (existing.count + 1);
        existing.unit = (existing.unit * existing.count + unit) / (existing.count + 1);
        existing.count++;
      } else {
        candidates.push({ ...center, unit, count: 1 });
      }
      i += 4;
    }
  }

  return candidates.filter((candidate) => candidate.count >= 2).sort((a, b) => b.count - a.count);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function orderTriple(a, b, c) {
  const ab = distance(a, b);
  const bc = distance(b, c);
  const ca = distance(c, a);
  let corner;
  let first;
  let second;
  if (ab >= bc && ab >= ca) {
    corner = c;
    first = a;
    second = b;
  } else if (bc >= ab && bc >= ca) {
    corner = a;
    first = b;
    second = c;
  } else {
    corner = b;
    first = a;
    second = c;
  }

  const d1 = distance(corner, first);
  const d2 = distance(corner, second);
  if (Math.min(d1, d2) / Math.max(d1, d2) < 0.5) return null;

  const v1 = { x: first.x - corner.x, y: first.y - corner.y };
  const v2 = { x: second.x - corner.x, y: second.y - corner.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (d1 * d2);
  if (Math.abs(cos) > 0.5) return null;

  const cross = v1.x * v2.y - v1.y * v2.x;
  const topRight = cross > 0 ? first : second;
  const bottomLeft = cross > 0 ? second : first;

  return { topLeft: corner, topRight, bottomLeft, d1, d2 };
}

/**
 * Distance from a finder's centre to the outer edge of its black ring along a
 * straight line. Measured along the line between two finders rather than
 * horizontally, so the result does not grow with the symbol's rotation.
 */
function ringRadius(bits, width, height, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.ceil(Math.hypot(dx, dy));
  if (!steps) return NaN;

  let state = 0;
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(from.x + (dx * i) / steps);
    const y = Math.round(from.y + (dy * i) / steps);
    if (x < 0 || y < 0 || x >= width || y >= height) return NaN;
    const dark = bits[y * width + x] === 1;
    if (state === 0) {
      if (!dark) state = 1;
    } else if (state === 1) {
      if (dark) state = 2;
    } else if (!dark) {
      return Math.hypot(x - from.x, y - from.y);
    }
  }
  return NaN;
}

/** Finder size in pixels, measured through the centre in both directions. */
function finderSize(bits, width, height, a, b) {
  const forward = ringRadius(bits, width, height, a, b);
  const backward = ringRadius(bits, width, height, a, {
    x: 2 * a.x - b.x,
    y: 2 * a.y - b.y,
  });
  if (!Number.isFinite(forward) || !Number.isFinite(backward)) return NaN;
  // Both walks start on the centre pixel; the finder spans 7 modules.
  return (forward + backward - 1) / 7;
}

/** Average module size at both ends of a line between two finder centres. */
function moduleSizeBetween(bits, width, height, a, b) {
  const first = finderSize(bits, width, height, a, b);
  const second = finderSize(bits, width, height, b, a);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return NaN;
  return (first + second) / 2;
}

export function selectPatterns(bits, width, height, patterns) {
  const pool = patterns.slice(0, 8);
  let best = null;
  let bestScore = -Infinity;

  for (let i = 0; i < pool.length - 2; i++) {
    for (let j = i + 1; j < pool.length - 1; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const ordered = orderTriple(pool[i], pool[j], pool[k]);
        if (!ordered) continue;

        const units = [pool[i].unit, pool[j].unit, pool[k].unit];
        if (Math.max(...units) / Math.min(...units) > 1.6) continue;

        const topLeftSize = finderSize(bits, width, height, ordered.topLeft, ordered.topRight);
        const topRightSize = finderSize(bits, width, height, ordered.topRight, ordered.topLeft);
        const bottomLeftSize = finderSize(bits, width, height, ordered.bottomLeft, ordered.topLeft);
        if (![topLeftSize, topRightSize, bottomLeftSize].every((size) => size > 1)) continue;

        const unit =
          (moduleSizeBetween(bits, width, height, ordered.topLeft, ordered.topRight) +
            moduleSizeBetween(bits, width, height, ordered.topLeft, ordered.bottomLeft)) /
          2;
        if (!Number.isFinite(unit)) continue;

        let dimension = Math.round((ordered.d1 + ordered.d2) / (2 * unit)) + 7;
        switch (dimension & 3) {
          case 0:
            dimension++;
            break;
          case 2:
            dimension--;
            break;
          case 3:
            continue;
        }
        if (dimension < 21 || dimension > 177) continue;

        const score =
          pool[i].count + pool[j].count + pool[k].count - Math.abs(dimension % 4 === 1 ? 0 : 1);
        if (score > bestScore) {
          bestScore = score;
          best = {
            ...ordered,
            dimension,
            unit,
            sizes: [topLeftSize, topRightSize, bottomLeftSize],
          };
        }
      }
    }
  }

  return best;
}

/** Solve an 8×8 linear system with partial pivoting. */
function solve(matrix, rhs) {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    if (pivot !== col) [a[col], a[pivot]] = [a[pivot], a[col]];

    const divisor = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      if (!factor) continue;
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}

/** Homography from four (u, v) → (x, y) correspondences. */
function homography(points) {
  const matrix = [];
  const rhs = [];
  for (const { u, v, x, y } of points) {
    matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    rhs.push(x);
    matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    rhs.push(y);
  }
  const h = solve(matrix, rhs);
  return h && { h };
}

export function project(transform, u, v) {
  const h = transform.h;
  const denominator = h[6] * u + h[7] * v + 1;
  return {
    x: (h[0] * u + h[1] * v + h[2]) / denominator,
    y: (h[3] * u + h[4] * v + h[5]) / denominator,
  };
}

function sampleMatrix(bits, width, height, transform, dimension) {
  const modules = new Uint8Array(dimension * dimension);
  const offsets = [0, -0.22, 0.22];

  for (let row = 0; row < dimension; row++) {
    for (let col = 0; col < dimension; col++) {
      let dark = 0;
      let total = 0;
      for (const dy of offsets) {
        for (const dx of offsets) {
          const point = project(transform, col + 0.5 + dx, row + 0.5 + dy);
          const x = Math.round(point.x);
          const y = Math.round(point.y);
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          total++;
          dark += bits[y * width + x];
        }
      }
      if (!total) return null;
      modules[row * dimension + col] = dark * 2 >= total ? 1 : 0;
    }
  }
  return modules;
}

function alignmentRatioOk(counts) {
  // Only the light–dark–light core is reliable: the outer dark ring sits in
  // the data area and may merge with a neighbouring dark module.
  const unit = (counts[1] + counts[2] + counts[3]) / 3;
  if (unit < 1) return false;
  const tolerance = unit * 0.7;
  return (
    Math.abs(counts[1] - unit) < tolerance &&
    Math.abs(counts[2] - unit) < tolerance &&
    Math.abs(counts[3] - unit) < tolerance &&
    counts[0] >= unit * 0.4 &&
    counts[4] >= unit * 0.4
  );
}

/** Cross-check a 1:1:1:1:1 alignment pattern through (x, y). */
export function alignmentCrossCheck(bits, width, height, x, y, vertical) {
  const limit = vertical ? height : width;
  const center = vertical ? y : x;
  const at = (position) => (vertical ? bits[position * width + x] : bits[y * width + position]);

  if (!at(center)) return null;

  let coreStart = center;
  let coreEnd = center;
  while (coreStart > 0 && at(coreStart - 1)) coreStart--;
  while (coreEnd < limit - 1 && at(coreEnd + 1)) coreEnd++;

  let outerStart = coreStart;
  let whiteBefore = 0;
  while (outerStart > 0 && !at(outerStart - 1)) {
    outerStart--;
    whiteBefore++;
  }
  let darkBefore = 0;
  while (outerStart > 0 && at(outerStart - 1)) {
    outerStart--;
    darkBefore++;
  }

  let outerEnd = coreEnd;
  let whiteAfter = 0;
  while (outerEnd < limit - 1 && !at(outerEnd + 1)) {
    outerEnd++;
    whiteAfter++;
  }
  let darkAfter = 0;
  while (outerEnd < limit - 1 && at(outerEnd + 1)) {
    outerEnd++;
    darkAfter++;
  }

  const counts = [darkBefore, whiteBefore, coreEnd - coreStart + 1, whiteAfter, darkAfter];
  if (!alignmentRatioOk(counts)) return null;

  return { center: (coreStart + coreEnd + 1) / 2, unit: (counts[1] + counts[2] + counts[3]) / 3 };
}

export function findAlignment(bits, width, height, expected, unit) {
  const radius = Math.max(6, Math.round(unit * 7));
  const x0 = Math.max(0, Math.floor(expected.x - radius));
  const x1 = Math.min(width - 1, Math.ceil(expected.x + radius));
  const y0 = Math.max(0, Math.floor(expected.y - radius));
  const y1 = Math.min(height - 1, Math.ceil(expected.y + radius));

  let best = null;
  let bestDistance = Infinity;

  for (let y = y0; y <= y1; y++) {
    let start = x0;
    let color = bits[y * width + x0];
    const runs = [];
    for (let x = x0 + 1; x <= x1; x++) {
      const next = bits[y * width + x];
      if (next !== color) {
        runs.push({ start, length: x - start, dark: color === 1 });
        start = x;
        color = next;
      }
    }
    runs.push({ start, length: x1 + 1 - start, dark: color === 1 });

    for (let i = 0; i + 4 < runs.length; i++) {
      if (!runs[i].dark) continue;
      const window = runs.slice(i, i + 5);
      if (!window[4].dark || window[1].dark || window[3].dark) continue;
      const counts = window.map((run) => run.length);
      if (!alignmentRatioOk(counts)) continue;

      const centerX = window[2].start + window[2].length / 2;
      const vertical = alignmentCrossCheck(bits, width, height, Math.round(centerX), y, true);
      if (!vertical) continue;
      const horizontal = alignmentCrossCheck(
        bits,
        width,
        height,
        Math.round(centerX),
        Math.round(vertical.center),
        false,
      );
      if (!horizontal) continue;

      const foundUnit = (vertical.unit + horizontal.unit) / 2;
      if (foundUnit < unit * 0.5 || foundUnit > unit * 1.6) continue;

      const point = { x: horizontal.center, y: vertical.center };
      const distanceToExpected = Math.hypot(point.x - expected.x, point.y - expected.y);
      if (distanceToExpected < bestDistance) {
        bestDistance = distanceToExpected;
        best = point;
      }
    }
  }

  return bestDistance <= radius ? best : null;
}

/** Homography from the three finders plus a fourth point in module space. */
export function buildTransform(topLeft, topRight, bottomLeft, fourth, dimension) {
  return homography([
    { u: 3.5, v: 3.5, ...topLeft },
    { u: dimension - 3.5, v: 3.5, ...topRight },
    { u: 3.5, v: dimension - 3.5, ...bottomLeft },
    { ...fourth },
  ]);
}

/**
 * Homography from the three finder centres and their measured module sizes.
 * A projective transform scales pixels-per-module as w^-3/2, so the ratio of
 * two finder sizes fixes the perspective terms h6/h7 and the centres fix the
 * rest. The affine fourth corner is visibly wrong on a tilted symbol, and
 * version 1 has no alignment pattern to correct it.
 */
function transformFromScales(location, dimension) {
  const { topLeft, topRight, bottomLeft, sizes } = location;
  if (!sizes) return null;
  const [sizeTopLeft, sizeTopRight, sizeBottomLeft] = sizes;
  if (!(sizeTopLeft > 1 && sizeTopRight > 1 && sizeBottomLeft > 1)) return null;

  const spread =
    Math.max(sizeTopLeft, sizeTopRight, sizeBottomLeft) /
    Math.min(sizeTopLeft, sizeTopRight, sizeBottomLeft);
  if (spread < 1.04) return null;

  const u1 = 3.5;
  const v1 = 3.5;
  const u2 = dimension - 3.5;
  const v2 = 3.5;
  const u3 = 3.5;
  const v3 = dimension - 3.5;

  const ratioTop = Math.pow(sizeTopLeft / sizeTopRight, 2 / 3);
  const ratioLeft = Math.pow(sizeTopLeft / sizeBottomLeft, 2 / 3);
  if (!Number.isFinite(ratioTop) || !Number.isFinite(ratioLeft)) return null;

  // (u2 - r*u1) h6 + (v2 - r*v1) h7 = r - 1, and the same for the left edge.
  const a11 = u2 - ratioTop * u1;
  const a12 = v2 - ratioTop * v1;
  const a21 = u3 - ratioLeft * u1;
  const a22 = v3 - ratioLeft * v1;
  const det = a11 * a22 - a12 * a21;
  if (Math.abs(det) < 1e-6) return null;

  const b1 = ratioTop - 1;
  const b2 = ratioLeft - 1;
  const h6 = (b1 * a22 - b2 * a12) / det;
  const h7 = (a11 * b2 - a21 * b1) / det;
  if (!Number.isFinite(h6) || !Number.isFinite(h7)) return null;

  const w1 = 1 + h6 * u1 + h7 * v1;
  const w2 = 1 + h6 * u2 + h7 * v2;
  const w3 = 1 + h6 * u3 + h7 * v3;
  const w4 = 1 + h6 * (dimension - 3.5) + h7 * (dimension - 3.5);
  if (Math.min(w1, w2, w3, w4) < 0.2) return null;

  const basis = [
    [u1, v1, 1],
    [u2, v2, 1],
    [u3, v3, 1],
  ];
  const x = solve(basis, [topLeft.x * w1, topRight.x * w2, bottomLeft.x * w3]);
  const y = solve(basis, [topLeft.y * w1, topRight.y * w2, bottomLeft.y * w3]);
  if (!x || !y) return null;

  return { h: [x[0], x[1], x[2], y[0], y[1], y[2], h6, h7] };
}

function tryDimension(bits, width, height, location, dimension) {
  const { topLeft, topRight, bottomLeft } = location;
  const corner = {
    x: topRight.x + bottomLeft.x - topLeft.x,
    y: topRight.y + bottomLeft.y - topLeft.y,
  };

  const affine = buildTransform(
    topLeft,
    topRight,
    bottomLeft,
    {
      u: dimension - 3.5,
      v: dimension - 3.5,
      ...corner,
    },
    dimension,
  );
  const projective = transformFromScales(location, dimension);
  const base = projective || affine;
  if (!base) return null;

  const transforms = [];
  if (dimension >= 25) {
    const expectations = [project(base, dimension - 6.5, dimension - 6.5)];
    if (affine && base !== affine) {
      expectations.push(project(affine, dimension - 6.5, dimension - 6.5));
    }
    for (const expected of expectations) {
      const alignment = findAlignment(bits, width, height, expected, location.unit);
      if (!alignment) continue;
      const refined = buildTransform(
        topLeft,
        topRight,
        bottomLeft,
        {
          u: dimension - 6.5,
          v: dimension - 6.5,
          ...alignment,
        },
        dimension,
      );
      if (refined) transforms.push(refined);
    }
  }
  if (projective) transforms.push(projective);
  if (affine) transforms.push(affine);

  for (const transform of transforms) {
    const modules = sampleMatrix(bits, width, height, transform, dimension);
    if (!modules) continue;
    const decoded = decodeMatrix(modules, dimension);
    if (decoded) return decoded;
  }
  return null;
}

export function tryDecode(bits, width, height, location) {
  for (const adjust of [0, 4, -4]) {
    const dimension = location.dimension + adjust;
    if (dimension < 21 || dimension > 177) continue;
    const decoded = tryDimension(bits, width, height, location, dimension);
    if (decoded) return decoded;
  }
  return null;
}

/**
 * Find and decode a QR Code in a binarized frame.
 * @returns {{text: string, version: number, ecc: string, mask: number} | null}
 */
export function scanBinarized(bits, width, height) {
  const clean = denoise(bits, width, height);
  const patterns = findFinderPatterns(clean, width, height);
  if (patterns.length < 3) return null;
  const location = selectPatterns(clean, width, height, patterns);
  if (!location) return null;
  return tryDecode(bits, width, height, location);
}

/**
 * Decode a QR Code from an RGBA frame (as produced by canvas `getImageData`).
 * Tries normal and inverted polarity, since some screens show light-on-dark.
 */
export function decodeImageData(rgba, width, height) {
  if (!rgba || width < 21 || height < 21) return null;
  const luma = toLuma(rgba, width, height);
  const bits = binarize(luma, width, height);
  const direct = scanBinarized(bits, width, height);
  if (direct) return direct;

  for (let i = 0; i < bits.length; i++) bits[i] ^= 1;
  return scanBinarized(bits, width, height);
}
