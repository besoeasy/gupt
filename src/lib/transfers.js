import { Peer } from "peerjs";
import { readConfiguredIceServers } from "@/config/servers";

export function randomTransferId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createP2PTransferSession(handlers = {}) {
  const { onSignal, onStateChange, onIncoming, onProgress, onComplete, onError } = handlers;

  let peer = null;
  let connection = null;
  let currentTransferId = "";
  let currentState = "idle";
  let direction = null;
  let fileMeta = null;
  let fileData = null; // Used when sending
  let receivedChunks = [];
  let receivedSize = 0;
  let pendingOffer = null;

  function log(level, message, extra) {
    const logger = console[level] || console.log;
    const tId = currentTransferId || pendingOffer?.transferId || "pending";
    const prefix = `[gupt-transfer ${tId}] ${message}`;
    if (typeof extra === "undefined") logger(prefix);
    else logger(prefix, extra);
  }

  function emitState(state, extra = {}) {
    currentState = state;
    log("info", `state -> ${state}`, { direction, fileMeta, ...extra });
    onStateChange?.({
      state,
      transferId: currentTransferId || pendingOffer?.transferId || "",
      direction,
      fileMeta,
      ...extra,
    });
  }

  function resetSession(reason = "") {
    if (reason) log("warn", `reset session: ${reason}`);

    if (connection) {
      connection.close();
      connection = null;
    }

    if (peer) {
      peer.destroy();
      peer = null;
    }

    const finishedId = currentTransferId || pendingOffer?.transferId || "";
    currentTransferId = "";
    direction = null;
    fileMeta = null;
    fileData = null;
    receivedChunks = [];
    receivedSize = 0;
    pendingOffer = null;
    emitState("idle", { reason, transferId: finishedId });
  }

  function createPeer(id) {
    if (peer) return peer;
    const config = {
      config: {
        iceServers: readConfiguredIceServers().flatMap((s) =>
          Array.isArray(s?.urls) ? { urls: s.urls } : { urls: [s?.urls] },
        ),
      },
    };
    log("info", "creating PeerJS instance", { id });
    peer = id ? new Peer(id, config) : new Peer(config);
    return peer;
  }

  function handleConnection(conn) {
    connection = conn;

    conn.on("open", () => {
      log("info", "connection opened");
      emitState("transferring");
      if (direction === "outgoing" && fileData) {
        log("info", `sending file: ${fileMeta.name} (${fileMeta.size} bytes)`);
        conn.send({ type: "meta", meta: fileMeta });

        // Send file data
        const chunkSize = 16384; // 16KB chunks
        let offset = 0;

        function sendNextChunk() {
          if (offset < fileData.byteLength) {
            const chunk = fileData.slice(offset, offset + chunkSize);
            conn.send({ type: "chunk", data: chunk });
            offset += chunk.byteLength;

            const progress = offset / fileData.byteLength;
            onProgress?.({ progress, loaded: offset, total: fileData.byteLength });

            // Allow event loop to process to avoid blocking
            setTimeout(sendNextChunk, 0);
          } else {
            log("info", "finished sending file");
            conn.send({ type: "complete" });
            onComplete?.({ meta: fileMeta });
            setTimeout(() => resetSession("Transfer complete"), 1000);
          }
        }
        sendNextChunk();
      }
    });

    conn.on("data", (data) => {
      if (data.type === "meta") {
        log("info", "received file meta from peer");
        // We already have meta from signal, but can sync it
      } else if (data.type === "chunk") {
        receivedChunks.push(data.data);
        receivedSize += data.data.byteLength;
        const progress = fileMeta?.size ? receivedSize / fileMeta.size : 0;
        onProgress?.({ progress, loaded: receivedSize, total: fileMeta?.size || 0 });
      } else if (data.type === "complete") {
        log("info", "file transfer complete");
        const blob = new Blob(receivedChunks, {
          type: fileMeta?.type || "application/octet-stream",
        });
        onComplete?.({ meta: fileMeta, blob });
        resetSession("Transfer complete");
      }
    });

    conn.on("error", (err) => {
      log("error", "connection error", err);
      onError?.(err);
      resetSession("Connection error");
    });

    conn.on("close", () => {
      log("info", "connection closed");
      if (currentState === "transferring" && receivedSize < (fileMeta?.size || 0)) {
        onError?.(new Error("Connection closed before transfer completed"));
      }
      resetSession("Connection closed");
    });
  }

  async function startOutgoingTransfer(file) {
    if (currentState !== "idle") throw new Error("A transfer is already in progress.");

    direction = "outgoing";
    currentTransferId = randomTransferId();
    fileMeta = {
      name: file.name,
      size: file.size,
      type: file.type,
    };
    fileData = await file.arrayBuffer();

    emitState("connecting");
    log("info", "starting outgoing transfer", { meta: fileMeta });

    try {
      const p = createPeer();
      p.on("open", (id) => {
        log("info", "peer created with id", { id });
        onSignal?.({
          type: "transfer-offer",
          transferId: currentTransferId,
          meta: fileMeta,
          peerId: id,
        });
      });

      p.on("connection", (conn) => {
        log("info", "incoming connection from receiver");
        handleConnection(conn);
      });

      p.on("error", (err) => {
        log("error", "peer error", err);
        onError?.(err);
        resetSession("Peer error");
      });
    } catch (error) {
      log("error", "failed to start transfer", error);
      resetSession(error instanceof Error ? error.message : "Unable to start transfer.");
      throw error;
    }
  }

  function queueIncomingOffer(signal) {
    if (!signal?.transferId || !signal?.peerId || !signal?.meta) return false;

    if (currentState !== "idle") {
      void Promise.resolve(
        onSignal?.({ type: "transfer-reject", transferId: signal.transferId, reason: "busy" }),
      ).catch(() => {});
      return false;
    }

    pendingOffer = {
      transferId: signal.transferId,
      peerId: signal.peerId,
      meta: signal.meta,
    };
    log("info", "queued incoming transfer offer", { meta: signal.meta });

    fileMeta = signal.meta;
    direction = "incoming";
    emitState("incoming");
    onIncoming?.({ ...pendingOffer });
    return true;
  }

  async function acceptIncomingTransfer() {
    if (!pendingOffer) throw new Error("There is no incoming transfer to accept.");

    currentTransferId = pendingOffer.transferId;
    fileMeta = pendingOffer.meta;
    const senderPeerId = pendingOffer.peerId;
    direction = "incoming";

    log("info", "accepting incoming transfer", { meta: fileMeta });
    emitState("connecting");

    try {
      const p = createPeer();
      p.on("open", () => {
        log("info", "connecting to sender peer", { senderPeerId });
        const conn = p.connect(senderPeerId, { reliable: true });
        handleConnection(conn);

        onSignal?.({
          type: "transfer-accept",
          transferId: currentTransferId,
        });
        pendingOffer = null;
      });

      p.on("error", (err) => {
        log("error", "peer error", err);
        onError?.(err);
        resetSession("Peer error");
      });
    } catch (error) {
      log("error", "failed to accept transfer", error);
      void Promise.resolve(
        onSignal?.({
          type: "transfer-reject",
          transferId: currentTransferId,
          reason: "unavailable",
        }),
      ).catch(() => {});
      resetSession(error instanceof Error ? error.message : "Unable to accept transfer.");
      throw error;
    }
  }

  function declineIncomingTransfer(reason = "declined") {
    if (!pendingOffer) return;
    const rejectedId = pendingOffer.transferId;
    log("warn", "declining transfer", { reason });
    void Promise.resolve(
      onSignal?.({ type: "transfer-reject", transferId: rejectedId, reason }),
    ).catch(() => {});
    resetSession(reason === "busy" ? "Busy." : "Declined.");
  }

  async function handleSignal(signal) {
    if (!signal || typeof signal !== "object" || !signal.type) return false;

    if (signal.type === "transfer-offer") {
      return queueIncomingOffer(signal);
    }

    const signalTId = signal.transferId;
    const pendingTId = pendingOffer?.transferId || "";
    if (!signalTId || (signalTId !== currentTransferId && signalTId !== pendingTId)) return false;

    if (signal.type === "transfer-accept") {
      log("info", "peer accepted transfer");
      return true;
    }

    if (signal.type === "transfer-reject") {
      log("warn", "peer rejected transfer", { reason: signal.reason || "declined" });
      resetSession(signal.reason === "busy" ? "Peer is busy." : "Transfer declined.");
      return true;
    }

    if (signal.type === "transfer-cancel") {
      log("info", "peer cancelled transfer", { reason: signal.reason || "cancelled" });
      resetSession("Transfer cancelled.");
      return true;
    }

    return false;
  }

  function cancel(reason = "cancelled") {
    const activeId = currentTransferId || pendingOffer?.transferId;
    if (activeId) {
      log("info", "cancelling local transfer", { reason });
      void Promise.resolve(
        onSignal?.({ type: "transfer-cancel", transferId: activeId, reason }),
      ).catch(() => {});
    }
    resetSession(reason);
  }

  function getSnapshot() {
    return {
      state: currentState,
      transferId: currentTransferId || pendingOffer?.transferId || "",
      direction,
      meta: fileMeta,
      hasIncomingOffer: Boolean(pendingOffer),
    };
  }

  return {
    startOutgoingTransfer,
    acceptIncomingTransfer,
    declineIncomingTransfer,
    handleSignal,
    cancel,
    getSnapshot,
  };
}
