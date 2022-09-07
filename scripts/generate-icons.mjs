import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_SVG = path.join(ROOT, "public/pwa-512x512.svg");
const ICONS_DIR = path.join(ROOT, "flatpak", "icons");

const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });
  const svg = await readFile(SRC_SVG);

  for (const size of LINUX_SIZES) {
    await sharp(svg, { density: 512 })
      .resize(size, size)
      .png()
      .toFile(path.join(ICONS_DIR, `${size}x${size}.png`));
  }

  console.log("[icons] wrote flatpak/icons/*.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
