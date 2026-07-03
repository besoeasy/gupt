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
import { exec } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");

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
