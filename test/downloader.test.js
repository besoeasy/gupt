import test from "node:test";
import assert from "node:assert/strict";
import {
  DOWNLOAD_PHASE,
  DownloaderError,
  getActiveRelays,
  parseMediaDescriptor,
  decryptContainerChunks,
  probePartsAvailability,
  runDownloader,
} from "../src/lib/downloader.js";
import { sealParts, openBlob } from "../src/lib/rabta/index.js";
import { sha256HexOfBytes } from "../src/lib/engine/core.js";

test("getActiveRelays returns normalized relay list", () => {
  const relays = getActiveRelays(["https://custom.relay.org/"]);
  assert.deepEqual(relays, ["https://custom.relay.org"]);

  const fallback = getActiveRelays();
  assert.ok(fallback.length > 0);
  assert.ok(fallback.every((r) => r.startsWith("http")));
});

test("parseMediaDescriptor parses both canonical media object and message format", () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const keyB64 = Buffer.from(key).toString("base64");

  const msg = {
    id: "msg-123",
    eventId: "e".repeat(64),
    text: "Sample Document",
    media: {
      key: keyB64,
      name: "doc.pdf",
      mime: "application/pdf",
      size: 5000,
      parts: ["a".repeat(64), "b".repeat(64)],
    },
  };

  const desc = parseMediaDescriptor(msg);
  assert.equal(desc.id, "msg-123");
  assert.equal(desc.name, "doc.pdf");
  assert.equal(desc.mime, "application/pdf");
  assert.equal(desc.size, 5000);
  assert.equal(desc.parts.length, 2);
  assert.deepEqual(Array.from(desc.keyBytes), Array.from(key));
});

test("decryptContainerChunks decrypts multi-part RABTA1 containers in correct order", () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const plaintext = new TextEncoder().encode(
    "Multi-chunk encrypted binary test payload with sufficient length to span across three parts cleanly!",
  ); // > 75 bytes

  // Seal into 3 parts
  const containers = sealParts(plaintext, secret, 3);
  assert.equal(containers.length, 3);

  // Decrypt and reassemble
  const decrypted = decryptContainerChunks(containers, secret, plaintext.length);
  assert.deepEqual(Array.from(decrypted), Array.from(plaintext));
});

test("probePartsAvailability identifies available vs 404 missing chunks", async () => {
  // Hermetic: the old version hit https://rabta.gupt.app for two live blobs,
  // so it broke the moment retention reaped them. Answer HEAD locally.
  const presentHash = "6a783030c54bd12e138d56be288dac095d9248486cdcdaa88c49188ad282bb25";
  const missingHash = "c5beb7ae85f520e7f737423cdb06e19714c5c12cb41aea03bff639af0c054ab3";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const hash = String(url).split("/").pop().toLowerCase();
    if (String(opts?.method || "").toUpperCase() === "HEAD" && hash === presentHash) {
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name) => (String(name).toLowerCase() === "content-length" ? "426229" : null),
        },
      };
    }
    return { ok: false, status: 404, headers: { get: () => null } };
  };

  try {
    const probe = await probePartsAvailability([presentHash, missingHash], {
      relays: ["https://rabta.gupt.app"],
    });

    assert.equal(probe.total, 2);
    assert.equal(probe.allAvailable, false);
    assert.equal(probe.availableCount, 1);
    assert.equal(probe.missingCount, 1);

    assert.equal(probe.parts[0].status, "available");
    assert.equal(probe.parts[0].size, 426229);

    assert.equal(probe.parts[1].status, "missing");
    assert.equal(probe.parts[1].size, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runDownloader immediately fails with MISSING_PARTS on incomplete upload without hanging", async () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const keyB64 = Buffer.from(secret).toString("base64");

  const progressEvents = [];
  const presentHash = "6a783030c54bd12e138d56be288dac095d9248486cdcdaa88c49188ad282bb25";

  // Same hermetic HEAD mock: only the first part exists, so the run must
  // fail with missingParts [2] instead of probing the live network.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const hash = String(url).split("/").pop().toLowerCase();
    if (String(opts?.method || "").toUpperCase() === "HEAD" && hash === presentHash) {
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name) => (String(name).toLowerCase() === "content-length" ? "426229" : null),
        },
      };
    }
    return { ok: false, status: 404, headers: { get: () => null } };
  };

  const msg = {
    id: "test-missing-item",
    media: {
      key: keyB64,
      parts: [
        "6a783030c54bd12e138d56be288dac095d9248486cdcdaa88c49188ad282bb25", // exists
        "c5beb7ae85f520e7f737423cdb06e19714c5c12cb41aea03bff639af0c054ab3", // missing 404
      ],
      name: "incomplete.bin",
      size: 852458,
    },
  };

  try {
    await assert.rejects(
      async () => {
        await runDownloader(msg, {
          onProgress: (p) => progressEvents.push(p),
        });
      },
      (err) => {
        assert.ok(err instanceof DownloaderError);
        assert.equal(err.code, "incomplete_upload");
        assert.deepEqual(err.missingParts, [2]);
        return true;
      },
    );

    const missingPhase = progressEvents.find((p) => p.phase === DOWNLOAD_PHASE.MISSING_PARTS);
    assert.ok(missingPhase, "Expected DOWNLOAD_PHASE.MISSING_PARTS progress emission");
    assert.equal(missingPhase.missingCount, 1);
    assert.equal(missingPhase.partsLoaded, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
