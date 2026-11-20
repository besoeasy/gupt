/**
 * QR Code tables from ISO/IEC 18004. Data only — the encoder and decoder in
 * this folder are ours, so the tables are the spec's constants and nothing
 * else. `test/qr.test.js` checks every version/ECC pair against golden
 * matrices produced by the library we used before, so a typo here fails a
 * test instead of producing an unreadable code.
 */

export const ECC_LEVELS = {
  L: { index: 0, bits: 0b01, recovery: 0.07 },
  M: { index: 1, bits: 0b00, recovery: 0.15 },
  Q: { index: 2, bits: 0b11, recovery: 0.25 },
  H: { index: 3, bits: 0b10, recovery: 0.3 },
};

/** Total codewords (data + error correction) per version. */
export const TOTAL_CODEWORDS = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991,
  1085, 1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185, 2323, 2465, 2611, 2761, 2876,
  3034, 3196, 3362, 3532, 3706,
];

/** Total error-correction codewords, 4 per version in L, M, Q, H order. */
export const EC_CODEWORDS_TOTAL = [
  7, 10, 13, 17, 10, 16, 22, 28, 15, 26, 36, 44, 20, 36, 52, 64, 26, 48, 72, 88, 36, 64, 96, 112,
  40, 72, 108, 130, 48, 88, 132, 156, 60, 110, 160, 192, 72, 130, 192, 224, 80, 150, 224, 264, 96,
  176, 260, 308, 104, 198, 288, 352, 120, 216, 320, 384, 132, 240, 360, 432, 144, 280, 408, 480,
  168, 308, 448, 532, 180, 338, 504, 588, 196, 364, 546, 650, 224, 416, 600, 700, 224, 442, 644,
  750, 252, 476, 690, 816, 270, 504, 750, 900, 300, 560, 810, 960, 312, 588, 870, 1050, 336, 644,
  952, 1110, 360, 700, 1020, 1200, 390, 728, 1050, 1260, 420, 784, 1140, 1350, 450, 812, 1200, 1440,
  480, 868, 1290, 1530, 510, 924, 1350, 1620, 540, 980, 1440, 1710, 570, 1036, 1530, 1800, 570,
  1064, 1590, 1890, 600, 1120, 1680, 1980, 630, 1204, 1770, 2100, 660, 1260, 1860, 2220, 720, 1316,
  1950, 2310, 750, 1372, 2040, 2430,
];

/** Error-correction blocks per version, 4 per version in L, M, Q, H order. */
export const NUM_EC_BLOCKS = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 4, 1, 2, 4, 4, 2, 4, 4, 4, 2, 4, 6, 5, 2, 4, 6, 6, 2,
  5, 8, 8, 4, 5, 8, 8, 4, 5, 8, 11, 4, 8, 10, 11, 4, 9, 12, 16, 4, 9, 16, 16, 6, 10, 12, 18, 6, 10,
  17, 16, 6, 11, 16, 19, 6, 13, 18, 21, 7, 14, 21, 25, 8, 16, 20, 25, 8, 17, 23, 25, 9, 17, 23, 34,
  9, 18, 25, 30, 10, 20, 27, 32, 12, 21, 29, 35, 12, 23, 34, 37, 12, 25, 34, 40, 13, 26, 35, 42, 14,
  28, 38, 45, 15, 29, 40, 48, 16, 31, 43, 51, 17, 33, 45, 54, 18, 35, 48, 57, 19, 37, 51, 60, 19,
  38, 53, 63, 20, 40, 56, 66, 21, 43, 59, 70, 22, 45, 62, 74, 24, 47, 65, 77, 25, 49, 68, 81,
];

export function symbolSize(version) {
  return version * 4 + 17;
}

export function eccIndex(ecc) {
  const level = ECC_LEVELS[String(ecc).toUpperCase()];
  if (!level) throw new Error(`Unknown error-correction level: ${ecc}`);
  return level.index;
}

export function ecTotal(version, ecc) {
  return EC_CODEWORDS_TOTAL[(version - 1) * 4 + eccIndex(ecc)];
}

export function blockCount(version, ecc) {
  return NUM_EC_BLOCKS[(version - 1) * 4 + eccIndex(ecc)];
}

/** Error-correction codewords per block (the spec keeps this equal per block). */
export function ecPerBlock(version, ecc) {
  return ecTotal(version, ecc) / blockCount(version, ecc);
}

/** Data codewords available for a version and level. */
export function dataCodewords(version, ecc) {
  return TOTAL_CODEWORDS[version] - ecTotal(version, ecc);
}

/** Data codewords split into blocks, in the order the spec interleaves them. */
export function dataBlocks(version, ecc) {
  const total = dataCodewords(version, ecc);
  const blocks = blockCount(version, ecc);
  const shortSize = Math.floor(total / blocks);
  const longBlocks = total % blocks;
  return Array.from({ length: blocks }, (_, i) => shortSize + (i >= blocks - longBlocks ? 1 : 0));
}

/** Alignment pattern centre coordinates for a version. */
export function alignmentPositions(version) {
  if (version === 1) return [];
  const size = symbolSize(version);
  const count = Math.floor(version / 7) + 2;
  const step = size === 145 ? 26 : Math.ceil((size - 13) / (2 * count - 2)) * 2;
  const positions = [size - 7];
  for (let i = 1; i < count - 1; i++) positions.push(positions[i - 1] - step);
  positions.push(6);
  return positions.reverse();
}
