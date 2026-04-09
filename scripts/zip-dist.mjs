import archiver from "archiver";
import { createWriteStream, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(root, "dist");
const zipOut = resolve(distDir, "dist.zip");

if (!existsSync(distDir)) {
  console.error("dist/ folder not found — run `npm run build` first.");
  process.exit(1);
}

await new Promise((res, rej) => {
  const output = createWriteStream(zipOut);
  const archive = archiver("zip", { zlib: { level: 6 } });
  output.on("close", res);
  archive.on("error", rej);
  archive.pipe(output);
  archive.glob("**/*", { cwd: distDir, ignore: ["dist.zip"] });
  archive.finalize();
});

console.log(`dist.zip created → ${zipOut}`);
