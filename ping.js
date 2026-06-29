#!/usr/bin/env node
/**
 * Health-check DEFAULT_RELAYS, DEFAULT_ORIGINLESS_SERVERS, and DEFAULT_BLOSSOM_SERVERS.
 *
 * Usage: node ping.js
 */

import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";

import {
  DEFAULT_RELAYS,
  DEFAULT_ORIGINLESS_SERVERS,
  DEFAULT_BLOSSOM_SERVERS,
  buildOriginlessUploadUrl,
} from "./src/config/servers.js";

const RELAY_CONNECT_TIMEOUT_MS = 6_000;
const RELAY_PUBLISH_TIMEOUT_MS = 6_000;
const RELAY_QUERY_TIMEOUT_MS = 5_000;
const UPLOAD_TIMEOUT_MS = 30_000;
const BLOSSOM_AUTH_KIND = 24242;

secp.hashes.sha256 = nobleSha256;
secp.hashes.hmacSha256 = (key, ...msgs) => hmac(nobleSha256, key, secp.etc.concatBytes(...msgs));

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(value) {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function shortError(error) {
  const message = error instanceof Error ? error.message : String(error || "failed");
  return message.length > 72 ? `${message.slice(0, 69)}…` : message;
}

function createEphemeralIdentity() {
  const secretKey = secp.utils.randomSecretKey();
  const privkeyHex = bytesToHex(secretKey);
  const pubkeyHex = getPublicKey(secretKey);
  return { secretKey, privkeyHex, pubkeyHex };
}

function createTestBlob(label) {
  const now = new Date().toISOString();
  const header = `gupt-ping\nlabel=${label}\nts=${now}\n\n`;
  const body = "gupt-ping-payload\n".repeat(128);
  const content = `${header}${body}`;
  return new File([content], `gupt-ping-${Date.now()}.bin`, {
    type: "application/octet-stream",
  });
}

function pickUploadUrl(payload) {
  if (!payload || typeof payload !== "object") return null;
  const direct =
    payload.url ||
    payload.URL ||
    payload.location ||
    payload.Location ||
    payload.href ||
    payload.Href;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (payload.value && typeof payload.value === "object") return pickUploadUrl(payload.value);
  return null;
}

function buildBlossomAuthorization(privkeyHex, serverUrl, sha256Hex) {
  const hostname = new URL(serverUrl).hostname.toLowerCase();
  const createdAt = Math.floor(Date.now() / 1000);
  const event = finalizeEvent(
    {
      kind: BLOSSOM_AUTH_KIND,
      created_at: createdAt,
      tags: [
        ["t", "upload"],
        ["expiration", String(createdAt + 60)],
        ["server", hostname],
        ["x", sha256Hex],
      ],
      content: "Upload Blob",
    },
    hexToBytes(privkeyHex),
  );
  return `Nostr ${base64UrlEncode(JSON.stringify(event))}`;
}

async function sha256Hex(blob) {
  const buffer = await blob.arrayBuffer();
  return bytesToHex(nobleSha256(new Uint8Array(buffer)));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = UPLOAD_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function pingRelay(relay, identity) {
  const started = Date.now();
  const row = {
    type: "relay",
    server: relay,
    connect: "fail",
    publish: "—",
    fetch: "—",
    ms: 0,
    error: "",
  };

  const pool = new SimplePool({ enablePing: false, enableReconnect: false });

  try {
    await pool.ensureRelay(relay, { connectionTimeout: RELAY_CONNECT_TIMEOUT_MS });
    row.connect = "ok";

    const marker = `gupt-ping-${Date.now()}`;
    const event = finalizeEvent(
      {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["t", "gupt-ping"]],
        content: marker,
      },
      identity.secretKey,
    );

    const publishPromises = pool.publish([relay], event, { maxWait: RELAY_PUBLISH_TIMEOUT_MS });
    await Promise.all(publishPromises);
    row.publish = "ok";

    let fetched = await pool.querySync([relay], { ids: [event.id] }, { maxWait: RELAY_QUERY_TIMEOUT_MS });
    if (!fetched.length) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      fetched = await pool.querySync([relay], { ids: [event.id] }, { maxWait: RELAY_QUERY_TIMEOUT_MS });
    }

    const match = fetched.find((entry) => entry.id === event.id && entry.content === marker);
    if (!match) {
      row.fetch = "fail";
      row.error = "Published event not returned by relay";
      row.ms = Date.now() - started;
      return row;
    }

    row.fetch = "ok";
    row.ms = Date.now() - started;
    return row;
  } catch (error) {
    row.error = shortError(error);
    row.ms = Date.now() - started;
    return row;
  } finally {
    pool.close([relay]);
  }
}

async function uploadOriginless(server) {
  const uploadUrl = buildOriginlessUploadUrl(server);
  if (!uploadUrl) throw new Error("Invalid originless server URL");

  const file = createTestBlob(server);
  const form = new FormData();
  form.append("file", file);

  const response = await fetchWithTimeout(uploadUrl, { method: "POST", body: form });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 80)}` : ""}`);
  }

  const payload = await response.json();
  return pickUploadUrl(payload) || "";
}

async function uploadBlossom(server, privkeyHex) {
  const uploadUrl = buildOriginlessUploadUrl(server);
  if (!uploadUrl) throw new Error("Invalid blossom server URL");

  const file = createTestBlob(server);
  const digest = await sha256Hex(file);
  const headers = new Headers({
    Authorization: buildBlossomAuthorization(privkeyHex, server, digest),
    "X-SHA-256": digest,
    "Content-Type": file.type,
  });

  const response = await fetchWithTimeout(uploadUrl, { method: "PUT", body: file, headers });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 80)}` : ""}`);
  }

  const payload = await response.json();
  return pickUploadUrl(payload) || "";
}

async function verifyUploadedBlob(url) {
  if (!url) return "skip";
  const response = await fetchWithTimeout(url, { method: "GET" }, 30_000);
  if (!response.ok) throw new Error(`GET ${response.status}`);
  const buf = await response.arrayBuffer();
  if (!buf.byteLength) throw new Error("Empty response body");
  return "ok";
}

async function pingUploadServer(type, server, identity) {
  const started = Date.now();
  const row = {
    type,
    server,
    upload: "fail",
    fetch: "—",
    ms: 0,
    error: "",
  };

  try {
    const returnedUrl =
      type === "blossom"
        ? await uploadBlossom(server, identity.privkeyHex)
        : await uploadOriginless(server);
    row.upload = "ok";

    try {
      row.fetch = await verifyUploadedBlob(returnedUrl);
    } catch (error) {
      row.fetch = returnedUrl ? "fail" : "skip";
      if (returnedUrl) row.error = `Upload ok, fetch failed: ${shortError(error)}`;
    }

    row.ms = Date.now() - started;
    return row;
  } catch (error) {
    const message = shortError(error);
    row.error = message === "fetch failed" ? "Upload request failed (network/DNS/TLS)" : message;
    row.ms = Date.now() - started;
    return row;
  }
}

function printSection(title) {
  console.log(`\n${title}`);
  console.log("─".repeat(Math.max(title.length, 40)));
}

function summarize(rows) {
  const ok = rows.filter((row) => {
    if (row.type === "relay") return row.connect === "ok" && row.publish === "ok" && row.fetch === "ok";
    return row.upload === "ok";
  }).length;
  return { ok, total: rows.length, bad: rows.length - ok };
}

async function main() {
  const identity = createEphemeralIdentity();

  console.log("GUPT server ping");
  console.log(`Ephemeral test pubkey: ${identity.pubkeyHex.slice(0, 16)}…`);

  printSection(`Relays (${DEFAULT_RELAYS.length})`);
  const relayRows = await Promise.all(DEFAULT_RELAYS.map((relay) => pingRelay(relay, identity)));
  console.table(
    relayRows.map((row) => ({
      server: row.server.replace(/^wss?:\/\//i, ""),
      connect: row.connect,
      publish: row.publish,
      fetch: row.fetch,
      ms: row.ms,
      error: row.error,
    })),
  );

  printSection(`Originless (${DEFAULT_ORIGINLESS_SERVERS.length})`);
  const originlessRows = await Promise.all(
    DEFAULT_ORIGINLESS_SERVERS.map((server) => pingUploadServer("originless", server, identity)),
  );
  console.table(
    originlessRows.map((row) => ({
      server: row.server.replace(/^https?:\/\//i, ""),
      upload: row.upload,
      fetch: row.fetch,
      ms: row.ms,
      error: row.error,
    })),
  );

  printSection(`Blossom (${DEFAULT_BLOSSOM_SERVERS.length})`);
  const blossomRows = await Promise.all(
    DEFAULT_BLOSSOM_SERVERS.map((server) => pingUploadServer("blossom", server, identity)),
  );
  console.table(
    blossomRows.map((row) => ({
      server: row.server.replace(/^https?:\/\//i, ""),
      upload: row.upload,
      fetch: row.fetch,
      ms: row.ms,
      error: row.error,
    })),
  );

  const allRows = [...relayRows, ...originlessRows, ...blossomRows];
  const { ok, total, bad } = summarize(allRows);

  printSection("Summary");
  console.table([
    { category: "relays", ...summarize(relayRows) },
    { category: "originless", ...summarize(originlessRows) },
    { category: "blossom", ...summarize(blossomRows) },
    { category: "total", ok, total, bad },
  ]);

  if (bad > 0) {
    printSection("Remove or replace these servers");
    console.table(
      allRows
        .filter((row) => {
          if (row.type === "relay") {
            return row.connect !== "ok" || row.publish !== "ok" || row.fetch !== "ok";
          }
          return row.upload !== "ok";
        })
        .map((row) => ({
          type: row.type,
          server: row.server,
          issue: row.error || "check failed columns",
        })),
    );
    process.exitCode = 1;
  }

  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});