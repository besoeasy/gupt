import assert from "node:assert/strict";
import test from "node:test";

import {
  createMediaPayload,
  decryptAttachmentBytes,
  downloadMediaPayload,
  encryptAttachmentBytes,
  MediaError,
  parseMediaPayload,
} from "../src/media.js";

const SHA256 = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

function fixturePayload(bytes, options = {}) {
  const key = options.key || Uint8Array.from({ length: 32 }, (_, index) => index);
  const nonce = options.nonce || Uint8Array.from({ length: 12 }, (_, index) => index + 32);
  const { encrypted } = encryptAttachmentBytes(bytes, { key, nonce });
  return {
    encrypted,
    payload: {
      type: "media",
      text: "hello.txt",
      media: {
        key: Buffer.from(key).toString("base64"),
        nonce: Buffer.from(nonce).toString("base64"),
        mime: "text/plain",
        name: "hello.txt",
        size: bytes.byteLength,
        sha256: SHA256,
        servers: ["https://one.example"],
      },
      durationMs: 0,
    },
  };
}

test("parses and decrypts app-compatible media payloads", () => {
  const plain = Buffer.from("hello attachment");
  const { encrypted, payload } = fixturePayload(plain);
  const parsed = parseMediaPayload(payload);

  assert.equal(parsed.name, "hello.txt");
  assert.equal(parsed.mime, "text/plain");
  assert.equal(parsed.size, plain.byteLength);
  assert.deepEqual(Buffer.from(decryptAttachmentBytes(encrypted, parsed.key, parsed.nonce)), plain);
});

test("encrypts files and uploads the same ciphertext redundantly", async () => {
  const uploads = [];
  const progress = [];
  const payload = await createMediaPayload(Buffer.from("upload me"), {
    name: "report.txt",
    mime: "text/plain",
    originlessServers: ["https://one.example", "https://two.example"],
    onProgress: (update) => progress.push(update),
    async fetchImpl(url, init) {
      const eventPart = JSON.parse(await init.body.get("event").text());
      const blobPart = init.body.get("blob");
      const bytes = Buffer.from(await blobPart.arrayBuffer());
      uploads.push({
        url,
        name: blobPart.name,
        bytes,
        event: eventPart,
      });
      return Response.json({
        status: "success",
        id: "mock-event-id",
        stored_at: "2026-09-22T00:00:00Z",
      });
    },
  });

  assert.equal(payload.type, "media");
  assert.equal(payload.media.name, "report.txt");
  assert.equal(payload.media.size, 9);
  assert.equal(payload.media.sha256, uploads[0].event.blob);
  assert.equal(payload.media.sha256.length, 64);
  assert.equal(uploads.length, 2);
  const uploadUrls = uploads.map((u) => u.url).sort();
  assert.deepEqual(uploadUrls, ["https://one.example/events", "https://two.example/events"]);
  assert.equal(uploads[0].name, "gupt.bin");
  assert.deepEqual(uploads[0].bytes, uploads[1].bytes);
  assert.notDeepEqual(uploads[0].bytes, Buffer.from("upload me"));

  const parsed = parseMediaPayload(payload);
  assert.deepEqual(
    Buffer.from(decryptAttachmentBytes(uploads[0].bytes, parsed.key, parsed.nonce)),
    Buffer.from("upload me"),
  );
  assert.ok(progress.some((update) => update.phase === "encrypting"));
  assert.equal(
    progress.filter((update) => update.phase === "uploading" && update.status === "done").length,
    2,
  );
});

test("downloads encrypted hash data with bounds and decrypts it", async () => {
  const plain = Buffer.from("download me");
  const { encrypted, payload } = fixturePayload(plain);
  const urls = [];
  const result = await downloadMediaPayload(payload, {
    async fetchImpl(url) {
      urls.push(url);
      return new Response(encrypted, {
        headers: { "content-length": String(encrypted.byteLength) },
      });
    },
  });

  assert.deepEqual(Buffer.from(result.data), plain);
  assert.equal(result.name, "hello.txt");
  assert.deepEqual(urls, [`https://one.example/blob/${SHA256}`]);
});

test("created payloads carry the servers that received the blob", async () => {
  const payload = await createMediaPayload(Buffer.from("upload me"), {
    name: "report.txt",
    originlessServers: ["https://one.example", "https://two.example"],
    async fetchImpl() {
      return Response.json({ status: "success" });
    },
  });

  assert.deepEqual(payload.media.servers, ["https://one.example", "https://two.example"]);
  assert.deepEqual(parseMediaPayload(payload).servers, [
    "https://one.example",
    "https://two.example",
  ]);
});

test("parses payload servers strictly: https-only, deduped, capped", () => {
  const plain = Buffer.from("small");
  const { payload } = fixturePayload(plain);
  const parsed = parseMediaPayload({
    ...payload,
    media: {
      ...payload.media,
      servers: [
        "https://sender.example/",
        "https://sender.example/events",
        "http://plain.example",
        "not a url",
        "",
        "https://second.example",
        "https://third.example",
        "https://fourth.example",
        "https://fifth.example",
      ],
    },
  });

  assert.deepEqual(parsed.servers, [
    "https://sender.example",
    "https://second.example",
    "https://third.example",
    "https://fourth.example",
  ]);
});

test("downloads only from the payload servers", async () => {
  const plain = Buffer.from("download me");
  const { encrypted, payload } = fixturePayload(plain);
  const withServers = {
    ...payload,
    media: { ...payload.media, servers: ["https://sender.example", "https://sender.example"] },
  };
  const urls = [];
  const result = await downloadMediaPayload(withServers, {
    async fetchImpl(url) {
      urls.push(url);
      return new Response(encrypted, {
        headers: { "content-length": String(encrypted.byteLength) },
      });
    },
  });

  assert.deepEqual(Buffer.from(result.data), plain);
  assert.deepEqual(urls, [`https://sender.example/blob/${SHA256}`]);
});

test("rejects payloads that list no download servers", async () => {
  const { payload } = fixturePayload(Buffer.from("download me"));
  await assert.rejects(
    downloadMediaPayload(
      {
        ...payload,
        media: { ...payload.media, servers: ["http://plain.example", "not a url"] },
      },
      {
        async fetchImpl() {
          throw new Error("must not fetch");
        },
      },
    ),
    /no download servers/,
  );
});
test("rejects unsafe sha256 hashes, malformed keys, and oversized responses", async () => {
  const plain = Buffer.from("small");
  const { payload } = fixturePayload(plain);

  assert.throws(
    () =>
      parseMediaPayload({
        ...payload,
        media: { ...payload.media, sha256: "../../metadata" },
      }),
    MediaError,
  );
  assert.throws(
    () =>
      parseMediaPayload({
        ...payload,
        media: { ...payload.media, sha256: undefined },
      }),
    MediaError,
  );
  assert.throws(
    () =>
      parseMediaPayload({
        ...payload,
        media: { ...payload.media, key: Buffer.alloc(4).toString("base64") },
      }),
    /key length/,
  );

  await assert.rejects(
    downloadMediaPayload(payload, {
      fetchImpl: async () =>
        new Response(Buffer.alloc(plain.byteLength + 17), {
          headers: { "content-length": String(plain.byteLength + 17) },
        }),
    }),
    /too large/,
  );
});
