import { sha256 } from "@noble/hashes/sha2.js";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const BECH32M_CONST = 0x2bc830a3;
const MAX_ADDRESS_LENGTH = 90;

function stripBitcoinUri(value) {
  let address = String(value || "").trim();
  if (/^bitcoin:/i.test(address)) address = address.slice("bitcoin:".length);
  if (address.startsWith("//")) address = address.slice(2);
  const query = address.indexOf("?");
  if (query >= 0) address = address.slice(0, query);
  try {
    address = decodeURIComponent(address);
  } catch {
    return "";
  }
  return address.replace(/^\/+/, "").trim();
}

function decodeBase58(value) {
  const bytes = [0];
  for (const char of value) {
    const digit = BASE58.indexOf(char);
    if (digit < 0) return null;
    let carry = digit;
    for (let i = 0; i < bytes.length; i++) {
      const next = bytes[i] * 58 + carry;
      bytes[i] = next & 255;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  let zeros = 0;
  for (const char of value) {
    if (char !== "1") break;
    zeros += 1;
  }
  const decoded = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) decoded[decoded.length - 1 - i] = bytes[i];
  return decoded;
}

function isBase58CheckAddress(value) {
  if (value.length < 26 || value.length > 35) return false;
  if (value[0] !== "1" && value[0] !== "3") return false;
  const decoded = decodeBase58(value);
  if (!decoded || decoded.length !== 25) return false;
  const version = decoded[0];
  if (version !== 0x00 && version !== 0x05) return false;
  const payload = decoded.subarray(0, 21);
  const checksum = decoded.subarray(21);
  const digest = sha256(sha256(payload));
  return (
    checksum[0] === digest[0] &&
    checksum[1] === digest[1] &&
    checksum[2] === digest[2] &&
    checksum[3] === digest[3]
  );
}

function polymod(values) {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= BECH32_GEN[i];
    }
  }
  return chk >>> 0;
}

function hrpExpand(hrp) {
  const out = [];
  for (const char of hrp) out.push(char.charCodeAt(0) >>> 5);
  out.push(0);
  for (const char of hrp) out.push(char.charCodeAt(0) & 31);
  return out;
}

function convertBits(data, fromBits, toBits, pad) {
  let acc = 0;
  let bits = 0;
  const maxv = (1 << toBits) - 1;
  const out = [];
  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) return null;
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (toBits - bits)) & maxv);
  } else if (bits >= fromBits || (acc << (toBits - bits)) & maxv) {
    return null;
  }
  return out;
}

function isBech32Address(value) {
  if (value.length < 14 || value.length > MAX_ADDRESS_LENGTH) return false;
  const separator = value.lastIndexOf("1");
  if (separator < 1 || separator + 7 > value.length) return false;
  const hrp = value.slice(0, separator);
  const dataPart = value.slice(separator + 1);
  if (hrp !== "bc") return false;
  const data = [];
  for (const char of dataPart) {
    const index = BECH32.indexOf(char);
    if (index < 0) return false;
    data.push(index);
  }
  const version = data[0];
  if (version === undefined || version > 16) return false;
  const checksumConst = version === 0 ? 1 : BECH32M_CONST;
  if (polymod([...hrpExpand(hrp), ...data]) !== checksumConst) return false;
  const program = convertBits(data.slice(1, -6), 5, 8, false);
  if (!program) return false;
  if (version === 0) return program.length === 20 || program.length === 32;
  return program.length >= 2 && program.length <= 40;
}

export function normalizeBitcoinAddress(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const address = stripBitcoinUri(raw);
  if (!address || address.length > MAX_ADDRESS_LENGTH) {
    throw new TypeError("publicBot.bitcoin must be a Bitcoin address");
  }
  if (/[\s@/]/.test(address)) {
    throw new TypeError("publicBot.bitcoin must be a Bitcoin address");
  }
  if (isBase58CheckAddress(address)) return address;
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) {
    throw new TypeError("publicBot.bitcoin must be a Bitcoin address");
  }
  const bech32 = address.toLowerCase();
  if (isBech32Address(bech32)) return bech32;
  throw new TypeError("publicBot.bitcoin must be a Bitcoin address");
}

export function parseBitcoinAddress(value) {
  try {
    return normalizeBitcoinAddress(value);
  } catch {
    return "";
  }
}
