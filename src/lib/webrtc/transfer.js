/**
 * WebRTC module — peer-to-peer blob transfer.
 *
 * Files are pushed straight to the chat peer over a WebRTC data channel (in
 * parallel with the originless server upload) so the receiver can decrypt
 * media without fetching from a server. Signaling (offer/answer/ICE) rides
 * over Nostr DMs; one session per msgId.
 *
 * Reliability rules:
 * - Remote ICE candidates are queued until the remote description is set —
 *   candidates racing the offer/answer are applied, not dropped.
 * - The sender fails if the data channel never opens (peer offline / NAT)
 *   and waits for the send buffer to drain before closing.
 * - The receiver enforces an idle timeout so a vanished sender cannot leak
 *   peer connections.
 * - Received payloads are verified against the SHA-256 (and size) announced
 *   in the offer before being released to waiters.
 * - Completed blobs are cached briefly (LRU + TTL) so retrying consumers can
 *   re-read them without growing memory unbounded.
 */

import { readConfiguredIceServers } from "@/config/servers";
import { api } from "@/lib/api";
import { useIdentityStore } from "@/stores/identity";
import { normalizeNostrPubkey } from "@/lib/crypto";
import {
  BLOB_CACHE_MAX_ENTRIES,
  BLOB_CACHE_TTL_MS,
  CHANNEL_OPEN_TIMEOUT_MS,
  RECEIVE_IDLE_TIMEOUT_MS,
  SENDER_DRAIN_TIMEOUT_MS,
  TRANSFER_BUFFERED_AMOUNT_LOW,
  TRANSFER_CHUNK_SIZE,
  TRANSFER_ICE_BATCH_MS,
} from "./constants.js";
import { createCandidateQueue, createIceBatcher } from "./peers.js";
import { computeSha256, decodeChunk, encodeChunk, verifyBlobSha256 } from "./chunks.js";

/** Active sender sessions: msgId -> { pc, dc, candidates, cleanup } */
const activeSends = new Map();

/** Active receiver sessions: msgId -> { pc, candidates, cleanup } */
const activeReceives = new Map();

/** Completed blobs awaiting consumption: msgId -> { blob, timestamp } */
const receivedBlobs = new Map();

/** Pending waiter for a transfer: msgId -> { resolve, reject } */
const pendingReceives = new Map();

// ---------------------------------------------------------------------------
// Completed-blob cache (LRU + TTL)
// ---------------------------------------------------------------------------

function pruneReceivedBlobs() {
  const now = Date.now();
  for (const [id, entry] of receivedBlobs) {
    if (now - entry.timestamp > BLOB_CACHE_TTL_MS) receivedBlobs.delete(id);
  }
  // Map iteration is insertion-ordered: oldest entries are evicted first.
  while (receivedBlobs.size > BLOB_CACHE_MAX_ENTRIES) {
    receivedBlobs.delete(receivedBlobs.keys().next().value);
  }
}

function finalizeReceive(msgId, blob) {
  const pending = pendingReceives.get(msgId);
  if (pending) {
    pendingReceives.delete(msgId);
    pending.resolve(blob);
  }
  receivedBlobs.set(msgId, { blob, timestamp: Date.now() });
  pruneReceivedBlobs();
}

function rejectReceive(msgId, error) {
  const pending = pendingReceives.get(msgId);
  if (pending) {
    pendingReceives.delete(msgId);
    pending.reject(error);
  }
}

/**
 * Wait for a blob being pushed by the peer. Resolves immediately from the
 * cache when the transfer already completed; rejects on timeout or abort.
 */
export function waitForWebrtcBlob(msgId, timeoutMs = 10000, signal) {
  pruneReceivedBlobs();
  if (receivedBlobs.has(msgId)) {
    return Promise.resolve(receivedBlobs.get(msgId).blob);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingReceives.delete(msgId);
      reject(new Error("WebRTC transfer timeout"));
    }, timeoutMs);

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          pendingReceives.delete(msgId);
          reject(new Error("Aborted"));
        },
        { once: true },
      );
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

// ---------------------------------------------------------------------------
// Incoming signaling
// ---------------------------------------------------------------------------

function createSignalSender(peer, msgId) {
  const identity = useIdentityStore();
  return (payload) =>
    api.postDirectMessage(identity.privkeyHex, peer, { ...payload, msgId }).catch((error) => {
      console.warn(`[gupt-transfer ${msgId}] failed to send ${payload.type}`, error);
    });
}

export async function handleWebrtcSignal(row) {
  const peer = row.sender;
  const msgId = row.msgId;
  if (!msgId) return;

  if (row.type === "webrtc-offer") {
    await handleTransferOffer(row, peer, msgId);
    return;
  }

  if (row.type === "webrtc-answer") {
    const session = activeSends.get(msgId);
    if (!session || session.pc.signalingState === "closed" || !row.sdp) return;
    try {
      await session.pc.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: row.sdp }),
      );
      await session.candidates.flush();
    } catch (error) {
      console.warn(`[gupt-transfer ${msgId}] failed to apply answer`, error);
    }
    return;
  }

  if (row.type === "webrtc-ice") {
    const session = activeSends.get(msgId) || activeReceives.get(msgId);
    if (!session) return;
    const candidates = row.candidates || (row.candidate ? [row.candidate] : []);
    await session.candidates.add(candidates).catch(() => {});
  }
}

async function handleTransferOffer(row, peer, msgId) {
  if (!row.sdp) return;
  if (activeReceives.has(msgId)) return; // duplicate offer — already handling

  const pc = new RTCPeerConnection({ iceServers: readConfiguredIceServers() });
  const candidates = createCandidateQueue(pc);
  const sendSignal = createSignalSender(peer, msgId);
  const iceBatcher = createIceBatcher(
    (batch) => sendSignal({ type: "webrtc-ice", candidates: batch }),
    TRANSFER_ICE_BATCH_MS,
  );

  const chunks = [];
  let expectedSha256 = String(row.sha256 || "")
    .trim()
    .toLowerCase();
  const expectedSize = Number(row.size) || 0;
  let idleTimer = null;
  let closed = false;

  function closeSession() {
    if (closed) return;
    closed = true;
    if (idleTimer) clearTimeout(idleTimer);
    iceBatcher.clear();
    candidates.clear();
    try {
      pc.close();
    } catch {
      // Already closed.
    }
    activeReceives.delete(msgId);
  }

  function failReceive(error) {
    if (closed) return;
    console.warn(`[gupt-transfer ${msgId}] receive failed: ${error.message}`);
    closeSession();
    rejectReceive(msgId, error);
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      failReceive(new Error("WebRTC transfer stalled"));
    }, RECEIVE_IDLE_TIMEOUT_MS);
  }

  const session = { pc, candidates, cleanup: closeSession };
  activeReceives.set(msgId, session);

  pc.onicecandidate = (event) => {
    if (event.candidate) iceBatcher.push(event.candidate.toJSON());
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      failReceive(new Error(`Connection ${pc.connectionState}`));
    }
  };

  pc.ondatachannel = (event) => {
    const dc = event.channel;
    dc.binaryType = "arraybuffer";
    resetIdleTimer();

    dc.onmessage = (e) => {
      resetIdleTimer();

      let parsed;
      try {
        parsed = decodeChunk(new Uint8Array(e.data));
      } catch (error) {
        failReceive(error);
        return;
      }

      const { seq, total, sha256, data } = parsed;
      if (seq >= total) return; // ignore out-of-range chunks
      chunks[seq] = data;
      if (sha256) expectedSha256 = sha256.toLowerCase();

      const receivedCount = chunks.reduce((count, chunk) => count + (chunk ? 1 : 0), 0);
      if (receivedCount !== total) return;

      const blob = new Blob(chunks, { type: "application/octet-stream" });
      void (async () => {
        if (expectedSize && blob.size !== expectedSize) {
          failReceive(new Error("Transfer size mismatch"));
          return;
        }
        if (!(await verifyBlobSha256(blob, expectedSha256))) {
          failReceive(new Error("Transfer integrity check failed"));
          return;
        }
        finalizeReceive(msgId, blob);
        closeSession();
      })();
    };
  };

  try {
    await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: row.sdp }));
    await candidates.flush();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await iceBatcher.flush();
    await sendSignal({ type: "webrtc-answer", sdp: answer.sdp });
  } catch (error) {
    console.error(`[gupt-transfer ${msgId}] failed to handle webrtc-offer`, error);
    failReceive(new Error("Failed to answer transfer offer"));
  }
}

// ---------------------------------------------------------------------------
// Outgoing transfer
// ---------------------------------------------------------------------------

/**
 * Push a blob to a peer. The returned promise resolves once all chunks have
 * left the local send buffer, and rejects if the channel never opens, the
 * transfer is aborted, or the connection drops mid-send.
 */
export async function sendBlob(peerPubkey, blob, { msgId, sha256, signal }) {
  const peer = normalizeNostrPubkey(peerPubkey);
  if (!peer) throw new Error("Invalid peer pubkey");
  if (!msgId) throw new Error("msgId is required");
  if (!blob || !blob.size) throw new Error("Cannot transfer an empty blob");

  const identity = useIdentityStore();
  if (!identity.privkeyHex) throw new Error("Not logged in");

  const pc = new RTCPeerConnection({ iceServers: readConfiguredIceServers() });
  const dc = pc.createDataChannel("file-transfer", { ordered: true });
  dc.binaryType = "arraybuffer";
  dc.bufferedAmountLowThreshold = TRANSFER_BUFFERED_AMOUNT_LOW;

  const candidates = createCandidateQueue(pc);
  const sendSignal = createSignalSender(peer, msgId);
  const iceBatcher = createIceBatcher(
    (batch) => sendSignal({ type: "webrtc-ice", candidates: batch }),
    TRANSFER_ICE_BATCH_MS,
  );

  let settle;
  const completion = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });

  let closed = false;
  let openTimer = null;
  let drainTimer = null;

  function cleanup() {
    if (closed) return;
    closed = true;
    if (openTimer) clearTimeout(openTimer);
    if (drainTimer) clearInterval(drainTimer);
    iceBatcher.clear();
    candidates.clear();
    try {
      dc.close();
    } catch {
      // Already closed.
    }
    try {
      pc.close();
    } catch {
      // Already closed.
    }
    activeSends.delete(msgId);
  }

  function fail(error) {
    if (closed) return;
    cleanup();
    settle.reject(error);
  }

  const session = { pc, dc, candidates, cleanup };
  activeSends.set(msgId, session);

  pc.onicecandidate = (event) => {
    if (event.candidate) iceBatcher.push(event.candidate.toJSON());
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") {
      fail(new Error("Connection failed during transfer"));
    }
  };

  if (signal) {
    signal.addEventListener("abort", () => fail(new Error("Aborted")), { once: true });
  }

  openTimer = setTimeout(() => {
    fail(new Error("Peer did not open the transfer channel in time"));
  }, CHANNEL_OPEN_TIMEOUT_MS);

  dc.onopen = () => {
    if (openTimer) clearTimeout(openTimer);
    openTimer = null;
    startSending();
  };

  dc.onerror = () => {
    fail(new Error("Transfer data channel error"));
  };

  function startSending() {
    const total = Math.ceil(blob.size / TRANSFER_CHUNK_SIZE);
    let seq = 0;
    let offset = 0;

    function waitForDrain() {
      const startedAt = Date.now();
      drainTimer = setInterval(() => {
        if (closed) {
          clearInterval(drainTimer);
          return;
        }
        if (dc.readyState !== "open") {
          clearInterval(drainTimer);
          fail(new Error("Channel closed before the send buffer drained"));
          return;
        }
        if (dc.bufferedAmount === 0) {
          clearInterval(drainTimer);
          cleanup();
          settle.resolve({ msgId, bytesSent: blob.size, chunks: total });
          return;
        }
        if (Date.now() - startedAt > SENDER_DRAIN_TIMEOUT_MS) {
          clearInterval(drainTimer);
          fail(new Error("Timed out waiting for the send buffer to drain"));
        }
      }, 250);
    }

    function readNext() {
      if (closed) return;
      if (offset >= blob.size) {
        waitForDrain();
        return;
      }

      if (dc.bufferedAmount > TRANSFER_BUFFERED_AMOUNT_LOW) {
        dc.addEventListener("bufferedamountlow", readNext, { once: true });
        return;
      }

      const end = Math.min(offset + TRANSFER_CHUNK_SIZE, blob.size);
      const slice = blob.slice(offset, end);
      offset = end;

      slice
        .arrayBuffer()
        .then(async (buf) => {
          if (closed || dc.readyState !== "open") return;
          try {
            dc.send(await encodeChunk(seq, total, sha256, buf));
            seq++;
            readNext();
          } catch (error) {
            fail(error);
          }
        })
        .catch((error) => fail(error));
    }

    readNext();
  }

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal({
      type: "webrtc-offer",
      sdp: offer.sdp,
      sha256,
      size: blob.size,
    });
  } catch (error) {
    cleanup();
    throw error;
  }

  return completion;
}
