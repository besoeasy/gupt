/**
 * GF(256) arithmetic and Reed–Solomon for QR Code.
 *
 * QR uses the primitive polynomial 0x11D and generator roots α^0 … α^(ec-1),
 * so the decoder's Forney step has no exponent offset. We recover error
 * positions with Berlekamp–Massey, then solve the syndrome equations directly
 * for the magnitudes — fewer sign conventions to get wrong than Forney, and
 * the matrices are tiny.
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

export function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

export function gfDiv(a, b) {
  if (b === 0) throw new Error("Division by zero in GF(256)");
  if (a === 0) return 0;
  return EXP[(LOG[a] - LOG[b] + 255) % 255];
}

export function gfPow(a, power) {
  if (a === 0) return 0;
  return EXP[(((LOG[a] * power) % 255) + 255) % 255];
}

export function gfInv(a) {
  if (a === 0) throw new Error("Inverse of zero in GF(256)");
  return EXP[255 - LOG[a]];
}

/** Multiply two polynomials, lowest-degree coefficient first. */
export function polyMul(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    if (!a[i]) continue;
    for (let j = 0; j < b.length; j++) out[i + j] ^= gfMul(a[i], b[j]);
  }
  return out;
}

export function polyEval(poly, x) {
  let y = 0;
  for (let i = poly.length - 1; i >= 0; i--) y = gfMul(y, x) ^ poly[i];
  return y;
}

function generatorPoly(degree) {
  let g = [1];
  for (let i = 0; i < degree; i++) g = polyMul(g, [1, EXP[i]]);
  return g;
}

/** Error-correction codewords for one block, lowest-degree coefficient first. */
export function rsEncode(data, ecLength) {
  const gen = generatorPoly(ecLength);
  const remainder = new Array(ecLength).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    if (factor) {
      for (let i = 0; i < ecLength; i++) remainder[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return remainder;
}

function syndromes(received, ecLength) {
  const out = new Array(ecLength).fill(0);
  let clean = true;
  for (let i = 0; i < ecLength; i++) {
    // received[0] is the highest-degree coefficient.
    let value = 0;
    for (let j = 0; j < received.length; j++) {
      value = gfMul(value, EXP[i]) ^ received[j];
    }
    out[i] = value;
    if (value) clean = false;
  }
  return clean ? null : out;
}

/** Berlekamp–Massey; returns the error-locator polynomial, lowest degree first. */
function errorLocator(synd) {
  let c = [1];
  let b = [1];
  let l = 0;
  let m = 1;
  let shift = 1;

  for (let n = 0; n < synd.length; n++) {
    let d = synd[n];
    for (let i = 1; i <= l; i++) d ^= gfMul(c[i] ?? 0, synd[n - i]);

    if (d === 0) {
      m++;
      continue;
    }

    const previous = c.slice();
    const scale = gfDiv(d, shift);
    while (c.length < b.length + m) c.push(0);
    for (let i = 0; i < b.length; i++) c[i + m] ^= gfMul(scale, b[i]);

    if (2 * l <= n) {
      l = n + 1 - l;
      b = previous;
      shift = d;
      m = 1;
    } else {
      m++;
    }
  }

  return c.slice(0, l + 1);
}

/** Solve A·x = b over GF(256) with Gauss–Jordan elimination. */
function solveLinear(a, b) {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    while (pivot < n && m[pivot][col] === 0) pivot++;
    if (pivot === n) return null;
    if (pivot !== col) [m[col], m[pivot]] = [m[pivot], m[col]];

    const inv = gfInv(m[col][col]);
    for (let j = col; j <= n; j++) m[col][j] = gfMul(m[col][j], inv);

    for (let row = 0; row < n; row++) {
      if (row === col || m[row][col] === 0) continue;
      const factor = m[row][col];
      for (let j = col; j <= n; j++) m[row][j] ^= gfMul(factor, m[col][j]);
    }
  }

  return m.map((row) => row[n]);
}

/**
 * Correct one Reed–Solomon block in place.
 * Returns the number of corrected codewords, or -1 when the block is beyond
 * repair. `received` is highest-degree first, as it sits on the QR symbol.
 */
export function rsDecode(received, ecLength) {
  const synd = syndromes(received, ecLength);
  if (!synd) return 0;

  const locator = errorLocator(synd);
  const errors = locator.length - 1;
  if (errors === 0 || errors * 2 > ecLength) return -1;

  // Chien search: position p (degree) is in error when Λ(α^-p) = 0.
  const positions = [];
  for (let p = 0; p < received.length; p++) {
    if (polyEval(locator, gfPow(EXP[1], -p)) === 0) positions.push(p);
  }
  if (positions.length !== errors) return -1;

  // Solve the first `errors` syndrome equations for the magnitudes.
  const matrix = [];
  const rhs = [];
  for (let i = 0; i < errors; i++) {
    matrix.push(positions.map((p) => gfPow(EXP[1], i * p)));
    rhs.push(synd[i]);
  }
  const magnitudes = solveLinear(matrix, rhs);
  if (!magnitudes) return -1;

  for (let i = 0; i < positions.length; i++) {
    const index = received.length - 1 - positions[i];
    received[index] ^= magnitudes[i];
  }

  return syndromes(received, ecLength) ? -1 : positions.length;
}

export function rsGenerator(degree) {
  return generatorPoly(degree);
}
