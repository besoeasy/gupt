import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { fetchBlobBytes } from "../src/lib/blobFetch.js";
import { checkRelayHealth } from "../src/lib/rabta/index.js";
import { probeRelayConnections } from "../src/lib/relay/health.js";
import {
  MEDIA_RETRY_MAX_ATTEMPTS,
  MEDIA_RETRY_INITIAL_DELAY_MS,
  mediaRetryDelayMs,
  decryptMediaAttachment,
} from "../src/lib/mediaDecrypt.js";
import { PROFILE_TTL_MS } from "../src/lib/idb.js";
import { api } from "../src/lib/api.js";

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

test("mediaRetryDelayMs starts at 2000ms with exponential backoff factor 2 and caps at 60000ms", () => {
  assert.equal(MEDIA_RETRY_MAX_ATTEMPTS, 16);
  assert.equal(MEDIA_RETRY_INITIAL_DELAY_MS, 2_000);

  // Attempt 1: 2000 * 2^0 = 2000 ms (2 seconds)
  assert.equal(mediaRetryDelayMs(1), 2_000);
  // Attempt 2: 2000 * 2^1 = 4000 ms (4 seconds)
  assert.equal(mediaRetryDelayMs(2), 4_000);
  // Attempt 3: 2000 * 2^2 = 8000 ms (8 seconds)
  assert.equal(mediaRetryDelayMs(3), 8_000);
  // Attempt 4: 2000 * 2^3 = 16000 ms (16 seconds)
  assert.equal(mediaRetryDelayMs(4), 16_000);
  // Attempt 5: 2000 * 2^4 = 32000 ms (32 seconds)
  assert.equal(mediaRetryDelayMs(5), 32_000);
  // Attempt 6: 2000 * 2^5 = 64000 ms -> capped at 60000 ms (60 seconds)
  assert.equal(mediaRetryDelayMs(6), 60_000);
  // Attempt 16: capped at 60000 ms
  assert.equal(mediaRetryDelayMs(16), 60_000);
});

test("decryptMediaAttachment retries 16 times with exponential backoff before failing with 'All download sources failed.'", async () => {
  const retryEvents = [];
  const progressSnapshots = [];

  const fakeKeyB64 = Buffer.alloc(32, 1).toString("base64");
  const fakeNonceB64 = Buffer.alloc(12, 2).toString("base64");
  const nonExistentBlobHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  let caughtError = null;
  try {
    await decryptMediaAttachment({
      cacheKey: "test-cache-key-16-retries",
      keyB64: fakeKeyB64,
      nonceB64: fakeNonceB64,
      mime: "application/octet-stream",
      mediaOrMessage: {
        id: "msg-test-123",
        eventId: "f".repeat(64),
        type: "media",
        media: {
          hash: nonExistentBlobHash,
        },
      },
      retry: {
        maxAttempts: 16,
        initialDelayMs: 1, // Fast delay for test suite
        backoffFactor: 2,
        maxDelayMs: 10,
      },
      onRetry: (retryInfo) => {
        retryEvents.push(retryInfo);
      },
      onProgress: (prog) => {
        progressSnapshots.push({ ...prog });
      },
    });
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError, "Should throw after all 16 attempts are exhausted");
  assert.equal(caughtError.message, "All download sources failed.");
  assert.equal(retryEvents.length, 15, "Should have retried 15 times (between attempt 1 and 16)");

  // Check the attempt progression in retry events
  for (let i = 0; i < retryEvents.length; i++) {
    assert.equal(retryEvents[i].attempt, i + 1);
    assert.equal(retryEvents[i].retries, 16);
  }

  // Final progress snapshot should be FAILED with "All download sources failed." and retry cleared
  const lastProgress = progressSnapshots[progressSnapshots.length - 1];
  assert.equal(lastProgress.phase, "failed");
  assert.equal(lastProgress.error, "All download sources failed.");
  assert.equal(lastProgress.retry, null);
  assert.equal(lastProgress.eventId, "f".repeat(64));
});

test("PROFILE_TTL_MS is set to exactly 12 hours", () => {
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  assert.equal(PROFILE_TTL_MS, TWELVE_HOURS_MS);
});

test("api.fetchPeerProfile queries relay for gupt/profiles and parses metadata", async () => {
  const peerPubkey = "a".repeat(64);
  const expectedProfile = {
    name: "Alice Peer",
    about: "Rabta user",
    website: "https://example.com",
    status: "Online",
  };

  let queriedParams = null;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    queriedParams = url.searchParams;

    if (url.pathname === "/api/v1/events") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          events: [
            {
              id: "b".repeat(64),
              pubkey: peerPubkey,
              owner: `ed25519:${peerPubkey}`,
              collection: "gupt/profiles",
              kind: 0,
              data: expectedProfile,
              content: JSON.stringify(expectedProfile),
              created_at: 1731713600,
            },
          ],
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
    const profile = await api.fetchPeerProfile(peerPubkey, [relayUrl]);
    assert.deepEqual(profile, expectedProfile);
    assert.equal(queriedParams.get("collection"), "gupt/profiles");
    assert.equal(queriedParams.get("owner"), `ed25519:${peerPubkey}`);
    assert.equal(queriedParams.get("limit"), "1");
  } finally {
    server.close();
  }
});
