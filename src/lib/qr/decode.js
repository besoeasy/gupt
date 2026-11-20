/**
 * QR Code decoder for a sampled module matrix.
 *
 * The camera pipeline in `scan.js` turns a frame into the same matrix the
 * encoder produces; everything below is pure bit work, so it runs in Node
 * tests without a DOM. Byte, numeric and alphanumeric segments are read;
 * anything else (kanji, structured append) is rejected rather than guessed.
 */

import {
  ECC_LEVELS,
  alignmentPositions,
  blockCount,
  dataBlocks,
  dataCodewords,
  ecPerBlock,
  symbolSize,
} from "./tables.js";
import { rsDecode } from "./galois.js";
import { reservedMap } from "./encode.js";

const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
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

const FORMAT_TABLE = [];
for (const ecc of ["L", "M", "Q", "H"]) {
  for (let mask = 0; mask < 8; mask++) {
    FORMAT_TABLE.push({ ecc, mask, bits: formatBits(ecc, mask) });
  }
}

const VERSION_TABLE = [];
for (let version = 7; version <= 40; version++) {
  let remainder = version << 12;
  while (bchDigit(remainder) - bchDigit(G18) >= 0) {
    remainder ^= G18 << (bchDigit(remainder) - bchDigit(G18));
  }
  VERSION_TABLE.push({ version, bits: (version << 12) | remainder });
}

function hamming(a, b) {
  let x = a ^ b;
  let count = 0;
  while (x) {
    count += x & 1;
    x >>>= 1;
  }
  return count;
}

function nearest(table, bits, maxDistance) {
  let best = null;
  let bestDistance = maxDistance + 1;
  for (const entry of table) {
    const distance = hamming(bits, entry.bits);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return bestDistance <= maxDistance ? best : null;
}

function at(modules, size, row, col) {
  if (row < 0 || col < 0 || row >= size || col >= size) return 0;
  return modules[row * size + col] ? 1 : 0;
}

function readFormatCopies(modules, size) {
  let first = 0;
  for (let i = 0; i < 15; i++) {
    let row;
    let col;
    if (i < 6) {
      row = i;
      col = 8;
    } else if (i < 8) {
      row = i + 1;
      col = 8;
    } else {
      row = 8;
      col = 15 - i - 1;
    }
    first |= at(modules, size, row, col) << i;
  }

  let second = 0;
  for (let i = 0; i < 15; i++) {
    let row;
    let col;
    if (i < 8) {
      row = 8;
      col = size - 1 - i;
    } else {
      row = size - 15 + i;
      col = 8;
    }
    second |= at(modules, size, row, col) << i;
  }

  return [first, second];
}

function readVersionCopies(modules, size) {
  let first = 0;
  let second = 0;
  for (let i = 0; i < 18; i++) {
    const row = Math.floor(i / 3);
    const col = (i % 3) + size - 11;
    first |= at(modules, size, row, col) << i;
    second |= at(modules, size, col, row) << i;
  }
  return [first, second];
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
      return false;
  }
}

/** Read codewords from the data modules, undoing the mask on the way. */
function readCodewords(modules, size, reserved, mask) {
  const bytes = [];
  let current = 0;
  let bits = 0;

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    for (let vertical = 0; vertical < size; vertical++) {
      const upward = ((right + 1) & 2) === 0;
      const row = upward ? size - 1 - vertical : vertical;
      for (let c = 0; c < 2; c++) {
        const col = right - c;
        if (reserved[row * size + col]) continue;
        let bit = at(modules, size, row, col);
        if (maskBit(mask, row, col)) bit ^= 1;
        current = (current << 1) | bit;
        bits++;
        if (bits === 8) {
          bytes.push(current);
          current = 0;
          bits = 0;
        }
      }
    }
  }
  return bytes;
}

function deinterleave(bytes, version, ecc) {
  const sizes = dataBlocks(version, ecc);
  const ecLength = ecPerBlock(version, ecc);
  const blocks = sizes.map((size) => ({
    data: new Array(size),
    ec: new Array(ecLength),
  }));

  let offset = 0;
  const longest = Math.max(...sizes);
  for (let i = 0; i < longest; i++) {
    for (let b = 0; b < blocks.length; b++) {
      if (i < sizes[b]) blocks[b].data[i] = bytes[offset++];
    }
  }
  for (let i = 0; i < ecLength; i++) {
    for (let b = 0; b < blocks.length; b++) blocks[b].ec[i] = bytes[offset++];
  }
  if (offset > bytes.length) return null;

  const out = [];
  for (const block of blocks) {
    const codewords = [...block.data, ...block.ec];
    if (rsDecode(codewords, ecLength) < 0) return null;
    out.push(...codewords.slice(0, block.data.length));
  }
  return out;
}

class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.position = 0;
  }

  available() {
    return this.bytes.length * 8 - this.position;
  }

  read(count) {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byte = this.bytes[this.position >> 3];
      if (byte === undefined) throw new Error("Unexpected end of QR data");
      value = (value << 1) | ((byte >> (7 - (this.position & 7))) & 1);
      this.position++;
    }
    return value;
  }
}

function charCountBits(mode, version) {
  const group = version < 10 ? 0 : version < 27 ? 1 : 2;
  switch (mode) {
    case 0b0001:
      return [10, 12, 14][group];
    case 0b0010:
      return [9, 11, 13][group];
    case 0b0100:
      return [8, 16, 16][group];
    case 0b1000:
      return [8, 10, 12][group];
    default:
      return 0;
  }
}

function readSegments(bytes, version) {
  const reader = new BitReader(bytes);
  const chunks = [];
  const decoder = new TextDecoder();

  while (reader.available() >= 4) {
    const mode = reader.read(4);
    if (mode === 0b0000) break;

    if (mode === 0b0111) {
      // ECI designator: 1, 2 or 3 bytes depending on the prefix.
      const first = reader.read(8);
      if ((first & 0b10000000) === 0) continue;
      if ((first & 0b11000000) === 0b10000000) continue;
      reader.read(8);
      continue;
    }
    if (mode === 0b0011) {
      reader.read(16);
      continue;
    }
    if (mode === 0b0101 || mode === 0b1001) continue;

    const count = reader.read(charCountBits(mode, version));

    if (mode === 0b0001) {
      let text = "";
      let left = count;
      while (left >= 3) {
        text += String(reader.read(10)).padStart(3, "0");
        left -= 3;
      }
      if (left === 2) text += String(reader.read(7)).padStart(2, "0");
      else if (left === 1) text += String(reader.read(4));
      chunks.push(text);
      continue;
    }

    if (mode === 0b0010) {
      let text = "";
      let left = count;
      while (left >= 2) {
        const pair = reader.read(11);
        text += ALNUM[Math.floor(pair / 45)] + ALNUM[pair % 45];
        left -= 2;
      }
      if (left === 1) text += ALNUM[reader.read(6)];
      chunks.push(text);
      continue;
    }

    if (mode === 0b0100) {
      const raw = new Uint8Array(count);
      for (let i = 0; i < count; i++) raw[i] = reader.read(8);
      chunks.push(decoder.decode(raw));
      continue;
    }

    // Kanji and anything newer: not produced by this app, don't guess.
    return null;
  }

  return chunks.join("");
}

function decodeOriented(modules, size) {
  const version = (size - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > 40) return null;

  const [format1, format2] = readFormatCopies(modules, size);
  const format = nearest(FORMAT_TABLE, format1, 3) || nearest(FORMAT_TABLE, format2, 3);
  if (!format) return null;

  if (version >= 7) {
    const [v1, v2] = readVersionCopies(modules, size);
    const decoded = nearest(VERSION_TABLE, v1, 3) || nearest(VERSION_TABLE, v2, 3);
    if (decoded && decoded.version !== version) return null;
  }

  const reserved = reservedMap(version);
  const raw = readCodewords(modules, size, reserved, format.mask);
  if (
    raw.length <
    dataCodewords(version, format.ecc) +
      blockCount(version, format.ecc) * ecPerBlock(version, format.ecc)
  ) {
    return null;
  }

  const bytes = deinterleave(raw, version, format.ecc);
  if (!bytes) return null;

  const text = readSegments(bytes, version);
  if (text === null) return null;

  return { text, version, ecc: format.ecc, mask: format.mask };
}

function transpose(modules, size) {
  const out = new Uint8Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      out[col * size + row] = modules[row * size + col];
    }
  }
  return out;
}

/**
 * Decode a sampled module matrix (1 = dark).
 *
 * @param {Uint8Array} modules
 * @param {number} size
 * @returns {{text: string, version: number, ecc: string, mask: number} | null}
 */
export function decodeMatrix(modules, size) {
  if (!modules || size < 21 || size > 177) return null;
  const direct = decodeOriented(modules, size);
  if (direct) return direct;
  // A front camera or a flipped image mirrors the symbol; the transpose of a
  // mirrored QR is the original.
  return decodeOriented(transpose(modules, size), size);
}

export { symbolSize, alignmentPositions };
