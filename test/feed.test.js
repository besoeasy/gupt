import test from "node:test";
import assert from "node:assert/strict";
import { mergeRawEventsByOrigin } from "../src/lib/idb.js";
import {
  fetchGlobalFeed,
  fetchTrustedFeed,
  getFeedCached,
  FEED_KIND,
  FEED_TAG,
} from "../src/lib/feed.js";

test("mergeRawEventsByOrigin returns array and handles empty input", async () => {
  const res = await mergeRawEventsByOrigin("feed", []);
  assert.ok(Array.isArray(res));
});

test("fetchGlobalFeed runs without throwing and returns array", async () => {
  const posts = await fetchGlobalFeed({ limit: 10, timeout: 500 });
  assert.ok(Array.isArray(posts));
});

test("fetchGlobalFeed supports until cursor parameter", async () => {
  const until = Math.floor(Date.now() / 1000) - 3600;
  const posts = await fetchGlobalFeed({ limit: 10, until, timeout: 500 });
  assert.ok(Array.isArray(posts));
});

test("fetchTrustedFeed runs without throwing on valid or missing authors", async () => {
  const posts = await fetchTrustedFeed(
    "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c",
    {
      limit: 10,
      timeout: 500,
    },
  );
  assert.ok(Array.isArray(posts));
});

test("fetchTrustedFeed supports until cursor parameter", async () => {
  const until = Math.floor(Date.now() / 1000) - 3600;
  const posts = await fetchTrustedFeed(
    "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c",
    {
      limit: 10,
      until,
      timeout: 500,
    },
  );
  assert.ok(Array.isArray(posts));
});

test("getFeedCached returns structured cache object with items array", async () => {
  const cached = await getFeedCached();
  assert.ok(cached);
  assert.ok(Array.isArray(cached.items));
  assert.equal(typeof cached.commentsByParent, "object");
  assert.equal(typeof cached.reactionsByParent, "object");
  assert.equal(cached.fresh, false);
});
