#!/usr/bin/env node
/**
 * gupt — local server entry point
 *
 * Serves the pre-built web app from the bundled dist/ directory.
 * Usage:
 *   npx gupt          → serves on a random free port
 *   npx gupt 5000     → serves on port 5000
 *   PORT=5000 npx gupt
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec, execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");

// ── Ensure a build exists ──────────────────────────────────────────────────────
// dist/ is gitignored and not shipped in the repo, so `npx github:...` clones
// lack it. Build on the fly when the pre-built bundle is missing.
if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.log("⚙️  No build found — running `npm run build`…\n");
  execSync("npm run build", { stdio: "inherit", cwd: path.join(__dirname, "..") });
  console.log();
}

// ── Port resolution ────────────────────────────────────────────────────────────
const requestedPort = Number(process.argv[2] || process.env.PORT || 0); // 0 = OS picks free port

// ── MIME types ─────────────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

// ── Security headers ───────────────────────────────────────────────────────────
// Mirrors the Caddyfile (Docker) policy, not the <meta> one: this server sends
// the CSP as a real header, so it can carry frame-ancestors, which browsers
// silently ignore when CSP arrives via <meta>. This binds to 127.0.0.1 by
// default, but the command takes no host argument and people do expose it on a
// LAN, so an encrypted messenger should never be served bare.
//
// frame-src / worker-src / manifest-src are explicit even though all three
// already resolve to 'self' via default-src — stated so the intent survives the
// next default-src edit. No third-party frame source, deliberately: that is what
// keeps a location message from handing the reader's IP to a tile server.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "connect-src 'self' ws: wss: http: https:; img-src 'self' data: blob: http: https:; " +
  "media-src 'self' blob: data: http: https:; font-src 'self' data:; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'; " +
  "frame-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'";

const BASE_HEADERS = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  // Matches the Docker path. Browsers honour this over frame-ancestors, so it
  // also protects a client that ignores the CSP header entirely.
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

// ── Request handler ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Strip query strings / hashes
  const urlPath = req.url.split("?")[0].split("#")[0];

  let filePath = path.join(distDir, urlPath === "/" ? "index.html" : urlPath);

  // SPA fallback: unknown paths → index.html
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    // Cache static assets aggressively; never cache HTML
    const isHtml = ext === ".html" || !ext;
    res.writeHead(200, {
      ...BASE_HEADERS,
      "Content-Type": contentType,
      "Cache-Control": isHtml
        ? "no-store"
        : "public, max-age=31536000, immutable",
    });
    res.end(data);
  });
});

// ── Start ──────────────────────────────────────────────────────────────────────
server.listen(requestedPort, "127.0.0.1", () => {
  const { port } = server.address();
  const url = `http://localhost:${port}`;

  console.log(`
🔒 GUPT — end-to-end encrypted messenger

   Local:   ${url}
   Press Ctrl+C to stop.
`);

  // Open browser (best-effort, non-fatal if it fails)
  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

  exec(`${opener} "${url}"`, (err) => {
    if (err) console.log(`   Open ${url} in your browser to get started.\n`);
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌  Port ${requestedPort} is already in use.`);
    console.error(`   Try: npx gupt <other-port>\n`);
  } else {
    console.error("\n❌ ", err.message);
  }
  process.exit(1);
});
