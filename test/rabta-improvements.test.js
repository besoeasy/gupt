import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { fetchBlobBytes } from "../src/lib/blobFetch.js";
import { checkRelayHealth } from "../src/lib/rabta/index.js";
import { probeRelayConnections } from "../src/lib/relay/health.js";

test("fetchBlobBytes resumes download using HTTP Range after mid-stream interruption", async () => {
  const fullPayload = Buffer.from("0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF"); // 48 bytes
  const cutOffAt = 20;
  let requestCount = 0;
  const receivedHeaders = [];

  const server = http.createServer((req, res) => {
    requestCount++;
    receivedHeaders.push(req.headers);

    const range = req.headers["range"];
    if (!range) {
      // First attempt: send only part of the payload, then destroy socket to simulate connection drop
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": fullPayload.length,
        "Accept-Ranges": "bytes",
      });
      res.write(fullPayload.subarray(0, cutOffAt));
      // Abruptly terminate connection
      setTimeout(() => req.socket.destroy(), 10);
      return;
    }

    // Subsequent attempt: expect Range: bytes=20-
    assert.equal(range, `bytes=${cutOffAt}-`);
    const remaining = fullPayload.subarray(cutOffAt);
    res.writeHead(206, {
      "Content-Type": "application/octet-stream",
      "Content-Range": `bytes ${cutOffAt}-${fullPayload.length - 1}/${fullPayload.length}`,
      "Content-Length": remaining.length,
      "Accept-Ranges": "bytes",
    });
    res.end(remaining);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/blob`;

  try {
    const downloaded = await fetchBlobBytes(url, {
      retries: 3,
      minDelayMs: 10,
      maxDelayMs: 20,
    });

    assert.equal(requestCount, 2, "Took exactly 2 attempts (initial + resumed)");
    assert.deepEqual(downloaded, new Uint8Array(fullPayload));
  } finally {
    server.close();
  }
});

test("fetchBlobBytes restarts from byte 0 if server returns 200 instead of 206 on retry", async () => {
  const fullPayload = Buffer.from("TEST_FULL_PAYLOAD_FOR_NON_RANGE_SERVER");
  let requestCount = 0;

  const server = http.createServer((req, res) => {
    requestCount++;
    if (requestCount === 1) {
      res.writeHead(200, { "Content-Length": fullPayload.length });
      res.write(fullPayload.subarray(0, 10));
      setTimeout(() => req.socket.destroy(), 10);
      return;
    }

    // Second attempt: server ignores Range and sends full body with 200
    res.writeHead(200, { "Content-Length": fullPayload.length });
    res.end(fullPayload);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/blob`;

  try {
    const downloaded = await fetchBlobBytes(url, {
      retries: 3,
      minDelayMs: 10,
      maxDelayMs: 20,
    });

    assert.equal(requestCount, 2);
    assert.deepEqual(downloaded, new Uint8Array(fullPayload));
  } finally {
    server.close();
  }
});

test("checkRelayHealth uses fast /api/v1/health by default and /api/v1/node when detailed: true", async () => {
  const requestedPaths = [];

  const server = http.createServer((req, res) => {
    requestedPaths.push(req.url);

    if (req.url === "/api/v1/health") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "X-Rabta-Node-Id": "node-health-12345",
      });
      res.end(
        JSON.stringify({
          status: "ok",
          node_id: "node-health-12345",
          live_events: 42,
          live_blobs: 15,
        }),
      );
      return;
    }

    if (req.url === "/api/v1/node") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "X-Rabta-Node-Id": "node-detailed-12345",
      });
      res.end(
        JSON.stringify({
          algorithm: "ed25519",
          api_version: "v1",
          node_id: "node-detailed-12345",
          peers: { battery: { mode: "readwrite" } },
          sync: ["https://peer1.example.com"],
          storage: { used_bytes: 1000, budget_bytes: 5000 },
        }),
      );
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const relayUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Routine keepalive: queries /api/v1/health
    const healthRes = await checkRelayHealth(relayUrl);
    assert.equal(healthRes.ok, true);
    assert.equal(healthRes.nodeId, "node-health-12345");
    assert.equal(healthRes.liveEvents, 42);
    assert.equal(healthRes.liveBlobs, 15);
    assert.ok(requestedPaths.includes("/api/v1/health"));

    // 2. Detailed telemetry: queries /api/v1/node
    const nodeRes = await checkRelayHealth(relayUrl, { detailed: true });
    assert.equal(nodeRes.ok, true);
    assert.equal(nodeRes.nodeId, "node-detailed-12345");
    assert.equal(nodeRes.mode, "readwrite");
    assert.equal(nodeRes.syncPeers, 1);
    assert.equal(nodeRes.storageUsedBytes, 1000);
    assert.equal(nodeRes.storageBudgetBytes, 5000);
    assert.ok(requestedPaths.includes("/api/v1/node"));

    // 3. probeRelayConnections defaults to fast /health
    const outcomes = await probeRelayConnections([relayUrl]);
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].ok, true);
    assert.equal(outcomes[0].liveEvents, 42);
    assert.equal(outcomes[0].liveBlobs, 15);
  } finally {
    server.close();
  }
});
