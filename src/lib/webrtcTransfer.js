import { DEFAULT_ICE_SERVERS } from "@/config/servers";
import { api } from "@/lib/api";
import { useIdentityStore } from "@/stores/identity";
import { normalizeNostrPubkey } from "@/lib/crypto";

const activeSends = new Map(); // msgId -> { pc, dc }
const activeReceives = new Map(); // msgId -> { pc }
const receivedBlobs = new Map(); // msgId -> { blob, timestamp }
const pendingReceives = new Map(); // msgId -> { resolve, reject }

function setupIceBatching(pc, identity, peer, msgId) {
  let batch = [];
  let timer = null;
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      batch.push(event.candidate.toJSON());
      if (!timer) {
        timer = setTimeout(async () => {
          const candidates = [...batch];
          batch = [];
          timer = null;
          if (candidates.length > 0) {
            await api.postDirectMessage(identity.privkeyHex, peer, {
              type: "webrtc-ice",
              msgId,
              candidates,
            }).catch(console.warn);
          }
        }, 1000);
      }
    }
  };
}

export async function computeSha256(blob) {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function encodeChunk(seq, total, sha256, chunkBuf) {
  const enc = new TextEncoder();
  const sha256Bytes = enc.encode(sha256.padEnd(64, " "));
  const header = new ArrayBuffer(72);
  const view = new DataView(header);
  view.setUint32(0, seq, true); // little-endian
  view.setUint32(4, total, true);
  const headerBytes = new Uint8Array(header);
  headerBytes.set(sha256Bytes.subarray(0, 64), 8);

  const result = new Uint8Array(72 + chunkBuf.byteLength);
  result.set(headerBytes, 0);
  result.set(new Uint8Array(chunkBuf), 72);
  return result;
}

function decodeChunk(buffer) {
  if (buffer.byteLength < 72) throw new Error("Chunk too small");
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const seq = view.getUint32(0, true);
  const total = view.getUint32(4, true);
  const sha256Bytes = new Uint8Array(buffer.buffer, buffer.byteOffset + 8, 64);
  const sha256 = new TextDecoder().decode(sha256Bytes).trim();
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset + 72, buffer.byteLength - 72);
  return { seq, total, sha256, data };
}

function finalizeReceive(msgId, blob) {
  if (pendingReceives.has(msgId)) {
    pendingReceives.get(msgId).resolve(blob);
    pendingReceives.delete(msgId);
  }
  receivedBlobs.set(msgId, { blob, timestamp: Date.now() });
}

export function waitForWebrtcBlob(msgId, timeoutMs = 10000, signal) {
  if (receivedBlobs.has(msgId)) {
    return Promise.resolve(receivedBlobs.get(msgId).blob);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingReceives.delete(msgId);
      reject(new Error("WebRTC transfer timeout"));
    }, timeoutMs);

    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        pendingReceives.delete(msgId);
        reject(new Error("Aborted"));
      });
    }

    pendingReceives.set(msgId, {
      resolve: (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
  });
}

export async function handleWebrtcSignal(row) {
  const identity = useIdentityStore();
  const peer = row.sender;
  const msgId = row.msgId;

  if (row.type === "webrtc-offer") {
    const pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
    const chunks = [];
    let expectedTotal = 0;
    let expectedSha256 = row.sha256;

    activeReceives.set(msgId, { pc });

    setupIceBatching(pc, identity, peer, msgId);

    pc.ondatachannel = (event) => {
      const dc = event.channel;
      dc.binaryType = "arraybuffer";
      dc.onmessage = (e) => {
        const { seq, total, sha256, data } = decodeChunk(new Uint8Array(e.data));
        chunks[seq] = data;
        expectedTotal = total;
        expectedSha256 = sha256;

        const receivedCount = chunks.filter((c) => c !== undefined).length;
        if (receivedCount === total) {
          const blob = new Blob(chunks, { type: "application/octet-stream" });
          finalizeReceive(msgId, blob);
          dc.close();
          pc.close();
          activeReceives.delete(msgId);
        }
      };
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: row.sdp }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await api.postDirectMessage(identity.privkeyHex, peer, {
        type: "webrtc-answer",
        msgId,
        sdp: answer.sdp,
      });
    } catch (e) {
      console.error("Failed to handle webrtc-offer", e);
      pc.close();
      activeReceives.delete(msgId);
    }
  } else if (row.type === "webrtc-answer") {
    const session = activeSends.get(msgId);
    if (session?.pc) {
      await session.pc
        .setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: row.sdp }))
        .catch(console.warn);
    }
  } else if (row.type === "webrtc-ice") {
    const session = activeSends.get(msgId) || activeReceives.get(msgId);
    if (session && session.pc) {
      if (row.candidates) {
        for (const c of row.candidates) {
          await session.pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.warn);
        }
      } else if (row.candidate) {
        await session.pc.addIceCandidate(new RTCIceCandidate(row.candidate)).catch(console.warn);
      }
    }
  }
}

export async function sendBlob(peerPubkey, blob, { msgId, sha256, signal }) {
  const peer = normalizeNostrPubkey(peerPubkey);
  if (!peer) throw new Error("Invalid peer pubkey");

  const identity = useIdentityStore();
  if (!identity.privkeyHex) throw new Error("Not logged in");

  const pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
  const dc = pc.createDataChannel("file-transfer", { ordered: true });
  dc.binaryType = "arraybuffer";

  activeSends.set(msgId, { pc, dc });

  function cleanup() {
    dc.close();
    pc.close();
    activeSends.delete(msgId);
  }

  setupIceBatching(pc, identity, peer, msgId);

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
      cleanup();
    }
  };

  let offer;
  try {
    offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  } catch (err) {
    cleanup();
    throw err;
  }

  await api.postDirectMessage(identity.privkeyHex, peer, {
    type: "webrtc-offer",
    msgId,
    sdp: offer.sdp,
    sha256,
    size: blob.size,
  });

  dc.onopen = () => {
    const chunkSize = 16000;
    const total = Math.ceil(blob.size / chunkSize);
    let seq = 0;
    let offset = 0;
    dc.bufferedAmountLowThreshold = 65536;

    function readNext() {
      if (signal?.aborted) {
        cleanup();
        return;
      }
      if (offset >= blob.size) {
        // give it some time to flush
        setTimeout(cleanup, 2000);
        return;
      }

      if (dc.bufferedAmount > dc.bufferedAmountLowThreshold) {
        dc.addEventListener(
          "bufferedamountlow",
          function onLow() {
            readNext();
          },
          { once: true },
        );
        return;
      }

      const end = Math.min(offset + chunkSize, blob.size);
      const slice = blob.slice(offset, end);
      offset = end;

      slice
        .arrayBuffer()
        .then((buf) => {
          if (dc.readyState !== "open") return;
          try {
            dc.send(encodeChunk(seq, total, sha256, buf));
            seq++;
            readNext();
          } catch (e) {
            console.error("dc.send failed", e);
            cleanup();
          }
        })
        .catch((e) => {
          console.error("chunk read failed", e);
          cleanup();
        });
    }

    readNext();
  };
}
