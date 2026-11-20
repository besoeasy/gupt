import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const ICONS_DIR = path.join(SRC, "icons");
const ICONS_IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']@\/icons["']/gs;
const LUCIDE_IMPORT_RE = /from\s*["']@lucide\/vue["']/;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(vue|js|ts)$/.test(entry.name) ? [full] : [];
  });
}

function collectIconImports() {
  const used = new Map();
  for (const file of walk(SRC)) {
    if (path.relative(ROOT, file).startsWith("src/icons")) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(ICONS_IMPORT_RE)) {
      for (const raw of match[1].split(",")) {
        const name = raw
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0]
          .trim();
        if (!name) continue;
        if (!used.has(name)) used.set(name, new Set());
        used.get(name).add(path.relative(ROOT, file));
      }
    }
  }
  return used;
}

const used = collectIconImports();

test("the scan finds @/icons imports in src", () => {
  assert.ok(used.size > 0, "expected at least one @/icons import in src");
});

test("every imported icon has a vendored component in src/icons", () => {
  const missing = [...used.keys()].filter(
    (name) => !existsSync(path.join(ICONS_DIR, `${name}.vue`)),
  );
  assert.deepEqual(missing, [], `missing vendored icons: ${missing.join(", ")}`);
});

test("no @lucide/vue imports remain in src", () => {
  const leftovers = [];
  for (const file of walk(SRC)) {
    const source = readFileSync(file, "utf8");
    if (LUCIDE_IMPORT_RE.test(source)) leftovers.push(path.relative(ROOT, file));
  }
  assert.deepEqual(leftovers, [], `@lucide/vue still imported by: ${leftovers.join(", ")}`);
});
