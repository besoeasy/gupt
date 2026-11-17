import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import { fetchEventSize, fetchBlobMetadata } from "../src/lib/rabta/index.js";
import { searchMessages, filterMessageSearchResults } from "../src/lib/idb.js";

test("fetchEventSize queries GET /api/v1/events/{id}/size and parses envelope & total footprint", async () => {
  const eventId = "e".repeat(64);
  let requestedPath = "";

  const server = http.createServer((req, res) => {
    requestedPath = req.url;
    if (req.url === `/api/v1/events/${eventId}/size`) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: eventId,
          envelope_size: 420,
          total_size: 1048996,
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
    const sizeData = await fetchEventSize(eventId, [relayUrl]);
    assert.ok(sizeData);
    assert.equal(sizeData.id, eventId);
    assert.equal(sizeData.envelopeSize, 420);
    assert.equal(sizeData.totalSize, 1048996);
    assert.equal(requestedPath, `/api/v1/events/${eventId}/size`);
  } finally {
    server.close();
  }
});

test("fetchBlobMetadata inspects blob presence and size via HEAD /api/v1/blobs/{hash}", async () => {
  const blobHash = "f".repeat(64);
  let requestedMethod = "";
  let requestedPath = "";

  const server = http.createServer((req, res) => {
    requestedMethod = req.method;
    requestedPath = req.url;
    if (req.url === `/api/v1/blobs/${blobHash}`) {
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": "2097152",
        ETag: `"${blobHash}"`,
      });
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const relayUrl = `http://127.0.0.1:${port}`;

  try {
    const meta = await fetchBlobMetadata(blobHash, [relayUrl]);
    assert.equal(meta.exists, true);
    assert.equal(meta.size, 2097152);
    assert.equal(meta.hash, blobHash);
    assert.equal(requestedMethod, "HEAD");
    assert.equal(requestedPath, `/api/v1/blobs/${blobHash}`);
  } finally {
    server.close();
  }
});

test("filterMessageSearchResults filters by sinceTs and limits hits per contact", async () => {
  const now = Date.now();
  const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

  const mockHits = [
    {
      id: "msg-recent-1",
      roomId: "room-1",
      groupId: "",
      tokens: ["secret", "deployment", "meeting"],
      ts: now - 1000,
      expiresAt: now + 86400000,
      mine: true,
    },
    {
      id: "msg-recent-2",
      roomId: "room-1",
      groupId: "",
      tokens: ["deployment", "status"],
      ts: now - 2000,
      expiresAt: now + 86400000,
      mine: false,
    },
    {
      id: "msg-older-1",
      roomId: "room-1",
      groupId: "",
      tokens: ["secret", "deployment", "plan"],
      ts: now - TEN_DAYS_MS - 50000,
      expiresAt: now + 86400000,
      mine: false,
    },
    {
      id: "msg-contact2-1",
      roomId: "room-2",
      groupId: "",
      tokens: ["deployment", "notes"],
      ts: now - 500,
      expiresAt: now + 86400000,
      mine: false,
    },
  ];

  // Search within last 10 days
  const recentResults = filterMessageSearchResults(mockHits, ["deployment"], {
    sinceTs: now - TEN_DAYS_MS,
    currentTime: now,
  });
  const hasRecent = recentResults.some((r) => r.id === "msg-recent-1");
  const hasOlder = recentResults.some((r) => r.id === "msg-older-1");
  assert.equal(hasRecent, true, "Should include message within 10 days");
  assert.equal(hasOlder, false, "Should exclude message older than 10 days");

  // Search all history (sinceTs = null)
  const allResults = filterMessageSearchResults(mockHits, ["deployment"], {
    sinceTs: null,
    currentTime: now,
  });
  const hasAllOlder = allResults.some((r) => r.id === "msg-older-1");
  assert.equal(hasAllOlder, true, "Full history search should include older message");

  // Limit per contact
  const limitedResults = filterMessageSearchResults(mockHits, ["deployment"], {
    sinceTs: null,
    limitPerContact: 1,
    currentTime: now,
  });
  const room1Hits = limitedResults.filter((r) => r.roomId === "room-1");
  const room2Hits = limitedResults.filter((r) => r.roomId === "room-2");
  assert.equal(room1Hits.length, 1, "Only 1 message from room-1 should be included");
  assert.equal(room2Hits.length, 1, "Only 1 message from room-2 should be included");

  // Ensure searchMessages function executes safely
  const directSearch = await searchMessages("deployment");
  assert.ok(Array.isArray(directSearch));
});

test("ChatConversationInfoDrawer and useEnrichedConversation exist and export properly", async () => {
  const drawerContent = await fs.readFile(
    new URL("../src/components/chatv2/ChatConversationInfoDrawer.vue", import.meta.url),
    "utf8",
  );
  assert.ok(drawerContent.includes("Live Relay Telemetry"));
  assert.ok(drawerContent.includes("Relay Events"));
  assert.ok(drawerContent.includes("Sync State"));

  const composableContent = await fs.readFile(
    new URL("../src/composables/useEnrichedConversation.js", import.meta.url),
    "utf8",
  );
  assert.ok(composableContent.includes("countEvents"));
  assert.ok(composableContent.includes("fetchLastSeenTimestamp"));
  assert.ok(composableContent.includes("syncParityLabel"));
});
