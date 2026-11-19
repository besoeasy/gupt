import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const LUCIDE_IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']@lucide\/vue["']/gs;

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
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(LUCIDE_IMPORT_RE)) {
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
const lucide = await import("@lucide/vue");
const canonical = lucide.icons;
const canonicalByComponent = new Map(
  Object.entries(canonical).map(([name, icon]) => [icon, name]),
);

test("the scan finds @lucide/vue imports in src", () => {
  assert.ok(used.size > 0, "expected at least one @lucide/vue import in src");
});

test("every imported lucide icon is exported by @lucide/vue", () => {
  const missing = [...used.keys()].filter((name) => typeof lucide[name] !== "function");
  assert.deepEqual(missing, [], `unknown @lucide/vue imports: ${missing.join(", ")}`);
});

test("no imported lucide icon uses a deprecated alias", () => {
  const deprecated = [...used.keys()]
    .filter((name) => !Object.hasOwn(canonical, name))
    .map((name) => ({
      name,
      replacement: canonicalByComponent.get(lucide[name]) ?? "unknown",
      files: [...used.get(name)].join(", "),
    }));
  const detail = deprecated.map(
    ({ name, replacement, files }) => `${name} → ${replacement} (${files})`,
  );
  assert.deepEqual(detail, [], `deprecated @lucide/vue aliases:\n${detail.join("\n")}`);
});
