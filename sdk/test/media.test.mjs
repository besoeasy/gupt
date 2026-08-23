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

const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3pteauxm5ymf7r2zq";

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
        cid: CID,
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
      const file = init.body.get("file");
      uploads.push({
        url,
        name: file.name,
        bytes: Buffer.from(await file.arrayBuffer()),
      });
      return Response.json({ cid: CID });
    },
  });

  assert.equal(payload.type, "media");
  assert.equal(payload.media.name, "report.txt");
  assert.equal(payload.media.size, 9);
  assert.equal(payload.media.cid, CID);
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].name, "report.txt.enc");
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

test("downloads encrypted CID data with bounds and decrypts it", async () => {
  const plain = Buffer.from("download me");
  const { encrypted, payload } = fixturePayload(plain);
  const urls = [];
  const result = await downloadMediaPayload(payload, {
    originlessServers: ["https://originless.example"],
    gateways: [],
    async fetchImpl(url) {
      urls.push(url);
      return new Response(encrypted, {
        headers: { "content-length": String(encrypted.byteLength) },
      });
    },
  });

  assert.deepEqual(Buffer.from(result.data), plain);
  assert.equal(result.name, "hello.txt");
  assert.deepEqual(urls, [`https://originless.example/ipfs/${CID}`]);
});

test("rejects unsafe CIDs, malformed keys, and oversized responses", async () => {
  const plain = Buffer.from("small");
  const { payload } = fixturePayload(plain);

  assert.throws(
    () =>
      parseMediaPayload({
        ...payload,
        media: { ...payload.media, cid: "../../metadata" },
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
      originlessServers: ["https://originless.example"],
      gateways: [],
      fetchImpl: async () =>
        new Response(Buffer.alloc(plain.byteLength + 17), {
          headers: { "content-length": String(plain.byteLength + 17) },
        }),
    }),
    /too large/,
  );
});
