/**
 * QR Code encoder — byte mode only, which is all Gupt needs: keys, URLs and
 * `match:lobby:` codes are ASCII, and UTF-8 covers anything else.
 *
 * Written against ISO/IEC 18004. The output is pinned in `test/qr.test.js`
 * against matrices from the `qrcode` package this replaced, so an accidental
 * change to placement, masking or padding fails a test rather than producing
 * a code that only our own decoder can read.
 */

import {
  ECC_LEVELS,
  alignmentPositions,
  blockCount,
  dataBlocks,
  dataCodewords,
  ecPerBlock,
  eccIndex,
  symbolSize,
} from "./tables.js";
import { rsEncode } from "./galois.js";

const MODE_BYTE = 0b0100;
const G15 = 0b10100110111;
const G15_MASK = 0b101010000010010;
const G18 = 0b1111100100101;

function bchDigit(value) {
  let digits = 0;
  for (let v = value; v !== 0; v >>>= 1) digits++;
  return digits;
}

function formatBits(ecc, mask) {
  const data = (ECC_LEVELS[ecc].bits << 3) | mask;
  let remainder = data << 10;
  while (bchDigit(remainder) - bchDigit(G15) >= 0) {
    remainder ^= G15 << (bchDigit(remainder) - bchDigit(G15));
  }
  return ((data << 10) | remainder) ^ G15_MASK;
}

function versionBits(version) {
  let remainder = version << 12;
  while (bchDigit(remainder) - bchDigit(G18) >= 0) {
    remainder ^= G18 << (bchDigit(remainder) - bchDigit(G18));
  }
  return (version << 12) | remainder;
}

function charCountBits(version) {
  return version < 10 ? 8 : 16;
}

/** Largest payload in bytes for a version and level. */
export function capacity(version, ecc) {
  const bits = dataCodewords(version, ecc) * 8;
  return Math.floor((bits - 4 - charCountBits(version)) / 8);
}

/** Smallest version that fits `length` bytes at the given level. */
export function pickVersion(length, ecc = "M", minVersion = 1) {
  for (let version = Math.max(1, minVersion); version <= 40; version++) {
    if (length <= capacity(version, ecc)) return version;
  }
  throw new Error(`QR payload is too large (${length} bytes).`);
}

function utf8(text) {
  return new TextEncoder().encode(String(text));
}

function buildCodewords(bytes, version, ecc) {
  const capacityBytes = dataCodewords(version, ecc);
  const bits = [];
  const push = (value, count) => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  push(MODE_BYTE, 4);
  push(bytes.length, charCountBits(version));
  for (const byte of bytes) push(byte, 8);

  const capacityBits = capacityBytes * 8;
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  for (let i = 0; codewords.length < capacityBytes; i++) {
    codewords.push(i % 2 ? 0x11 : 0xec);
  }

  const sizes = dataBlocks(version, ecc);
  const ecLength = ecPerBlock(version, ecc);
  const blocks = [];
  let offset = 0;
  for (const size of sizes) {
    const data = codewords.slice(offset, offset + size);
    offset += size;
    blocks.push({ data, ec: rsEncode(data, ecLength) });
  }

  const out = [];
  const longest = Math.max(...sizes);
  for (let i = 0; i < longest; i++) {
    for (const block of blocks) if (i < block.data.length) out.push(block.data[i]);
  }
  for (let i = 0; i < ecLength; i++) {
    for (const block of blocks) out.push(block.ec[i]);
  }
  return out;
}

function createMatrix(version) {
  const size = symbolSize(version);
  return {
    version,
    size,
    modules: new Uint8Array(size * size),
    reserved: new Uint8Array(size * size),
  };
}

/** Which modules belong to function patterns (not data) for a version. */
export function reservedMap(version) {
  const matrix = createMatrix(version);
  setupFunctionPatterns(matrix);
  return matrix.reserved;
}

function setModule(matrix, row, col, dark, reserved = false) {
  if (row < 0 || col < 0 || row >= matrix.size || col >= matrix.size) return;
  matrix.modules[row * matrix.size + col] = dark ? 1 : 0;
  if (reserved) matrix.reserved[row * matrix.size + col] = 1;
}

function setupFinder(matrix, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const border = r === -1 || r === 7 || c === -1 || c === 7;
      if (border) continue;
      const dark =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      setModule(matrix, row + r, col + c, dark, true);
    }
  }
  // Separator row/column is light and reserved.
  for (let i = -1; i <= 7; i++) {
    setModule(matrix, row - 1, col + i, false, true);
    setModule(matrix, row + 7, col + i, false, true);
    setModule(matrix, row + i, col - 1, false, true);
    setModule(matrix, row + i, col + 7, false, true);
  }
}

function setupFunctionPatterns(matrix) {
  const { size, version } = matrix;
  setupFinder(matrix, 0, 0);
  setupFinder(matrix, 0, size - 7);
  setupFinder(matrix, size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    setModule(matrix, 6, i, dark, true);
    setModule(matrix, i, 6, dark, true);
  }

  const positions = alignmentPositions(version);
  for (const row of positions) {
    for (const col of positions) {
      const nearFinder =
        (row === 6 && col === 6) ||
        (row === 6 && col === size - 7) ||
        (row === size - 7 && col === 6);
      if (nearFinder) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
          setModule(matrix, row + r, col + c, dark, true);
        }
      }
    }
  }

  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >> i) & 1) === 1;
      const row = Math.floor(i / 3);
      const col = (i % 3) + size - 11;
      setModule(matrix, row, col, dark, true);
      setModule(matrix, col, row, dark, true);
    }
  }

  // Reserve the format-info strips; the real bits are written per mask. The
  // timing module at (6,8)/(8,6) is not part of either strip.
  for (let i = 0; i < 9; i++) {
    if (i === 6) continue;
    setModule(matrix, 8, i, false, true);
    setModule(matrix, i, 8, false, true);
  }
  for (let i = 0; i < 8; i++) {
    setModule(matrix, 8, size - 1 - i, false, true);
    setModule(matrix, size - 1 - i, 8, false, true);
  }
  setModule(matrix, size - 8, 8, true, true);
}

function setupFormat(matrix, ecc, mask) {
  const { size } = matrix;
  const bits = formatBits(ecc, mask);
  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1;
    if (i < 6) setModule(matrix, i, 8, dark, true);
    else if (i < 8) setModule(matrix, i + 1, 8, dark, true);
    else setModule(matrix, size - 15 + i, 8, dark, true);

    if (i < 8) setModule(matrix, 8, size - i - 1, dark, true);
    else if (i < 9) setModule(matrix, 8, 15 - i, dark, true);
    else setModule(matrix, 8, 15 - i - 1, dark, true);
  }
  setModule(matrix, size - 8, 8, true, true);
}

function setupData(matrix, codewords) {
  const { size } = matrix;
  let direction = -1;
  let row = size - 1;
  let bitIndex = 7;
  let byteIndex = 0;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (;;) {
      for (let c = 0; c < 2; c++) {
        const index = row * size + (col - c);
        if (matrix.reserved[index]) continue;
        let dark = false;
        if (byteIndex < codewords.length) {
          dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
        }
        matrix.modules[index] = dark ? 1 : 0;
        bitIndex--;
        if (bitIndex === -1) {
          byteIndex++;
          bitIndex = 7;
        }
      }
      row += direction;
      if (row < 0 || row >= size) {
        row -= direction;
        direction = -direction;
        break;
      }
    }
  }
}

function maskBit(mask, row, col) {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7:
      return (((row * col) % 3) + ((row + col) % 2)) % 2 === 0;
    default:
      throw new Error(`Unknown mask pattern: ${mask}`);
  }
}

function applyMask(matrix, mask) {
  const { size, modules, reserved } = matrix;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const index = row * size + col;
      if (!reserved[index] && maskBit(mask, row, col)) modules[index] ^= 1;
    }
  }
}

function penaltyN1(matrix) {
  const { size, modules } = matrix;
  let points = 0;
  const score = (run) => (run >= 5 ? 3 + (run - 5) : 0);

  for (let row = 0; row < size; row++) {
    let runRow = 1;
    let runCol = 1;
    for (let col = 1; col < size; col++) {
      if (modules[row * size + col] === modules[row * size + col - 1]) runRow++;
      else {
        points += score(runRow);
        runRow = 1;
      }
      if (modules[col * size + row] === modules[(col - 1) * size + row]) runCol++;
      else {
        points += score(runCol);
        runCol = 1;
      }
    }
    points += score(runRow) + score(runCol);
  }
  return points;
}

function penaltyN2(matrix) {
  const { size, modules } = matrix;
  let blocks = 0;
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const sum =
        modules[row * size + col] +
        modules[row * size + col + 1] +
        modules[(row + 1) * size + col] +
        modules[(row + 1) * size + col + 1];
      if (sum === 0 || sum === 4) blocks++;
    }
  }
  return blocks * 3;
}

function penaltyN3(matrix) {
  const { size, modules } = matrix;
  let points = 0;
  for (let row = 0; row < size; row++) {
    let bitsRow = 0;
    let bitsCol = 0;
    for (let col = 0; col < size; col++) {
      bitsRow = ((bitsRow << 1) & 0x7ff) | modules[row * size + col];
      if (col >= 10 && (bitsRow === 0x5d0 || bitsRow === 0x05d)) points++;
      bitsCol = ((bitsCol << 1) & 0x7ff) | modules[col * size + row];
      if (col >= 10 && (bitsCol === 0x5d0 || bitsCol === 0x05d)) points++;
    }
  }
  return points * 40;
}

function penaltyN4(matrix) {
  let dark = 0;
  for (let i = 0; i < matrix.modules.length; i++) dark += matrix.modules[i];
  const percent = (dark * 100) / matrix.modules.length;
  const k = Math.abs(Math.ceil(percent / 5) - 10);
  return k * 10;
}

function penalty(matrix) {
  return penaltyN1(matrix) + penaltyN2(matrix) + penaltyN3(matrix) + penaltyN4(matrix);
}

/**
 * Encode `text` as a QR Code.
 *
 * @param {string} text
 * @param {{ecc?: "L"|"M"|"Q"|"H", version?: number, mask?: number}} [options]
 * @returns {{text: string, version: number, ecc: string, mask: number, size: number, modules: Uint8Array}}
 */
export function encodeQr(text, options = {}) {
  const ecc = String(options.ecc || "M").toUpperCase();
  if (!ECC_LEVELS[ecc]) throw new Error(`Unknown error-correction level: ${ecc}`);
  const bytes = utf8(text);
  const version = options.version || pickVersion(bytes.length, ecc);
  if (bytes.length > capacity(version, ecc)) {
    throw new Error(`QR payload is too large for version ${version} at level ${ecc}.`);
  }

  const codewords = buildCodewords(bytes, version, ecc);
  const matrix = createMatrix(version);
  setupFunctionPatterns(matrix);
  setupData(matrix, codewords);

  let mask = Number.isInteger(options.mask) ? options.mask : -1;
  if (mask < 0) {
    let best = Infinity;
    for (let candidate = 0; candidate < 8; candidate++) {
      setupFormat(matrix, ecc, candidate);
      applyMask(matrix, candidate);
      const score = penalty(matrix);
      applyMask(matrix, candidate);
      if (score < best) {
        best = score;
        mask = candidate;
      }
    }
  }
  if (mask < 0 || mask > 7) throw new Error(`Unknown mask pattern: ${options.mask}`);

  setupFormat(matrix, ecc, mask);
  applyMask(matrix, mask);

  return { text: String(text), version, ecc, mask, size: matrix.size, modules: matrix.modules };
}

/**
 * SVG path for the dark modules, one horizontal run per segment. Coordinates
 * are in module units; the caller supplies the viewBox and quiet zone.
 */
export function qrPath(qr) {
  const { size, modules } = qr;
  const parts = [];
  for (let row = 0; row < size; row++) {
    let col = 0;
    while (col < size) {
      if (!modules[row * size + col]) {
        col++;
        continue;
      }
      let run = 1;
      while (col + run < size && modules[row * size + col + run]) run++;
      parts.push(`M${col} ${row}h${run}v1h-${run}z`);
      col += run;
    }
  }
  return parts.join("");
}

/** Total modules including the quiet zone, for a square viewBox. */
export function qrExtent(qr, margin = 4) {
  return qr.size + margin * 2;
}
