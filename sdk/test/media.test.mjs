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

const TEST_CID = "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao6eei66wof36n5e";

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
        cid: options.cid || TEST_CID,
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
  assert.equal(parsed.cid, TEST_CID);
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
      const filePart = init.body.get("file");
      const bytes = Buffer.from(await filePart.arrayBuffer());
      uploads.push({
        url,
        name: filePart.name,
        bytes,
      });
      return Response.json({
        cid: TEST_CID,
        size: bytes.byteLength,
        name: filePart.name,
      });
    },
  });

  assert.equal(payload.type, "media");
  assert.equal(payload.media.name, "report.txt");
  assert.equal(payload.media.size, 9);
  assert.equal(payload.media.cid, TEST_CID);
  assert.equal(uploads.length, 2);
  const uploadUrls = uploads.map((u) => u.url).sort();
  assert.deepEqual(uploadUrls, ["https://one.example/up", "https://two.example/up"]);
  assert.equal(uploads[0].name, "report.txt");
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
  assert.deepEqual(urls, [`ipfs://${TEST_CID}`]);
  assert.equal(result.cid, TEST_CID);
});

test("created payloads carry the cid without servers or sha256", async () => {
  const payload = await createMediaPayload(Buffer.from("upload me"), {
    name: "report.txt",
    originlessServers: ["https://one.example", "https://two.example"],
    async fetchImpl() {
      return Response.json({ cid: TEST_CID });
    },
  });

  assert.equal(payload.media.cid, TEST_CID);
  assert.equal(payload.media.servers, undefined);
  assert.equal(payload.media.sha256, undefined);
  assert.equal(parseMediaPayload(payload).cid, TEST_CID);
});

test("rejects payloads with missing or invalid CID", () => {
  const plain = Buffer.from("download me");
  const { payload } = fixturePayload(plain);
  assert.throws(
    () =>
      parseMediaPayload({
        ...payload,
        media: { ...payload.media, cid: "" },
      }),
    /cid/,
  );
  assert.throws(
    () =>
      parseMediaPayload({
        ...payload,
        media: { ...payload.media, cid: undefined },
      }),
    /cid/,
  );
  assert.throws(
    () =>
      parseMediaPayload({
        ...payload,
        media: { ...payload.media, cid: "short" },
      }),
    /cid/,
  );
});

test("rejects invalid CIDs, malformed keys, and oversized responses", async () => {
  const plain = Buffer.from("small");
  const { payload } = fixturePayload(plain);

  assert.throws(
    () =>
      parseMediaPayload({
        ...payload,
        media: { ...payload.media, cid: "invalid" },
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
