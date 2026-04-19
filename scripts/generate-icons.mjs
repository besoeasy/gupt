import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_SVG = path.join(ROOT, "public/pwa-512x512.svg");
const OUT_DIR = path.join(ROOT, "build");
const ICONS_DIR = path.join(OUT_DIR, "icons");

const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });
  const svg = await readFile(SRC_SVG);

  await sharp(svg, { density: 512 }).resize(512, 512).png().toFile(path.join(OUT_DIR, "icon.png"));
  await sharp(svg, { density: 512 }).resize(256, 256).png().toFile(path.join(OUT_DIR, "icon.ico.png"));

  for (const size of LINUX_SIZES) {
    await sharp(svg, { density: 512 })
      .resize(size, size)
      .png()
      .toFile(path.join(ICONS_DIR, `${size}x${size}.png`));
  }

  console.log("[icons] wrote build/icon.png + build/icons/*.png");
  console.log("[icons] note: .icns (macOS) and .ico (Windows) need platform tools:");
  console.log("        mac:  iconutil -c icns build/icon.iconset   (run on macOS)");
  console.log("        win:  use png-to-ico or ImageMagick on build/icon.ico.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
