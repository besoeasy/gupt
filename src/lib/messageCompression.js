const GZIP_PREFIX = "gz:";

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function canCompressText() {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

export async function compressTextForCache(text) {
  const value = String(text ?? "");
  if (!value || value.length < 512 || !canCompressText()) return value;

  try {
    const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("gzip"));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    return `${GZIP_PREFIX}${bytesToBase64(compressed)}`;
  } catch {
    return value;
  }
}

export async function decompressTextFromCache(text) {
  const value = String(text ?? "");
  if (!value.startsWith(GZIP_PREFIX)) return value;

  if (!canCompressText()) return "";

  try {
    const compressed = base64ToBytes(value.slice(GZIP_PREFIX.length));
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  } catch {
    return "";
  }
}
